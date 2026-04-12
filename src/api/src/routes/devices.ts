/**
 * Device management routes — Beta-5 (T-B5-04, T-B5-05)
 *
 * Farm-scoped endpoints (JWT auth via farm membership):
 *   POST   /api/v1/farms/:farmId/devices           — register device
 *   GET    /api/v1/farms/:farmId/devices           — list devices
 *   PATCH  /api/v1/farms/:farmId/devices/:deviceId — update config
 *   DELETE /api/v1/farms/:farmId/devices/:deviceId — deregister
 *   POST   /api/v1/farms/:farmId/devices/:deviceId/test-shot — request test
 *
 * Device-scoped endpoints (JWT + X-Device-Key):
 *   GET    /api/v1/devices/:deviceId/config    — config poll (Pi)
 *   POST   /api/v1/devices/:deviceId/heartbeat — health update (Pi)
 */

import { Hono } from 'hono';
import { randomBytes } from 'crypto';
import { hash } from 'bcryptjs';
import { dynamoRepo } from '../services/dynamodb';
import { getAuthContext } from '../middleware/auth';
import { verifyDeviceKey } from '../middleware/device-auth';
import { assertFarmAccess, parseBody } from './_helpers';
import { ValidationError, ConflictError, NotFoundError } from '../errors';
import { appEvents } from '../services/events';
import {
  RegisterDeviceRequestSchema,
  UpdateDeviceRequestSchema,
  DeviceHeartbeatRequestSchema,
} from '@litcrop/shared';

const DEVICE_KEY_PREFIX = 'dk_';
const BCRYPT_SALT_ROUNDS = 10;
const MAX_DEVICES_PER_FARM = 10;

// Default config for new devices
const DEVICE_DEFAULTS = {
  capture_interval: 1800,
  resolution: '1920x1080',
  jpeg_quality: 85,
  active_window_start: '05:00',
  active_window_end: '20:00',
};

// ── Farm-scoped routes ──────────────────────────────────────────

export const farmDevicesRouter = new Hono();

// POST /farms/:farmId/devices — register
farmDevicesRouter.post('/:farmId/devices', async (c) => {
  const { userId, userEmail, isAdmin } = getAuthContext(c);
  const farmId = c.req.param('farmId');
  await assertFarmAccess(farmId, userId, ['admin', 'owner'], isAdmin);

  const body = await c.req.json();
  const parsed = parseBody(RegisterDeviceRequestSchema, body);

  // Check device limit
  const count = await dynamoRepo.countDevicesForFarm(farmId);
  if (count >= MAX_DEVICES_PER_FARM) {
    throw new ValidationError(`Farm already has ${MAX_DEVICES_PER_FARM} devices (limit reached)`);
  }

  // Verify bed exists in this farm
  const bed = await dynamoRepo.getBedById(parsed.bed_id);
  if (!bed || bed.farm_id !== farmId) {
    throw new ValidationError('Bed not found in this farm');
  }

  // Check bed doesn't already have a device
  const existing = await dynamoRepo.getDevicesForFarm(farmId);
  if (existing.some(d => d.bed_id === parsed.bed_id)) {
    throw new ConflictError('This bed already has a device assigned');
  }

  // Generate device ID and API key
  const deviceId = `dev-${randomBytes(4).toString('hex')}`;
  const rawKey = `${DEVICE_KEY_PREFIX}${randomBytes(24).toString('hex')}`;
  const keyHash = await hash(rawKey, BCRYPT_SALT_ROUNDS);

  await dynamoRepo.createDevice(farmId, deviceId, {
    bed_id: parsed.bed_id,
    node_name: parsed.node_name,
    device_api_key_hash: keyHash,
    ...DEVICE_DEFAULTS,
  });

  // Use API_BASE_URL env var if set (production), otherwise derive from request
  const apiBaseUrl = process.env['API_BASE_URL'] ?? c.req.url.replace(/\/api\/v1\/farms\/.*$/, '/api/v1');

  appEvents.emit('device.registered', {
    type: 'device.registered',
    timestamp: new Date().toISOString(),
    actor_id: userId,
    actor_email: userEmail,
    payload: { farm_id: farmId, device_id: deviceId, node_name: parsed.node_name, bed_id: parsed.bed_id },
  });

  return c.json({
    device_id: deviceId,
    node_name: parsed.node_name,
    bed_id: parsed.bed_id,
    device_api_key: rawKey,
    config_poll_url: `${apiBaseUrl}/devices/${deviceId}/config`,
    created_at: new Date().toISOString(),
  }, 201);
});

// GET /farms/:farmId/devices — list
farmDevicesRouter.get('/:farmId/devices', async (c) => {
  const { userId, isAdmin } = getAuthContext(c);
  const farmId = c.req.param('farmId');
  await assertFarmAccess(farmId, userId, undefined, isAdmin);

  const devices = await dynamoRepo.getDevicesForFarm(farmId);

  // Enrich with bed names
  const beds = await dynamoRepo.getBedsForFarm(farmId);
  const bedMap = new Map(beds.map(b => [b.id, b.name]));

  const enriched = devices.map(d => ({
    ...d,
    bed_name: bedMap.get(d.bed_id) ?? d.bed_id,
  }));

  return c.json({ devices: enriched });
});

// PATCH /farms/:farmId/devices/:deviceId — update config
farmDevicesRouter.patch('/:farmId/devices/:deviceId', async (c) => {
  const { userId, userEmail, isAdmin } = getAuthContext(c);
  const farmId = c.req.param('farmId');
  const deviceId = c.req.param('deviceId');
  await assertFarmAccess(farmId, userId, ['admin', 'owner'], isAdmin);

  const body = await c.req.json();
  const parsed = parseBody(UpdateDeviceRequestSchema, body);

  // Flatten active_window for DynamoDB storage
  const updates: Record<string, unknown> = { ...parsed };
  if (parsed.active_window) {
    updates['active_window_start'] = parsed.active_window.start;
    updates['active_window_end'] = parsed.active_window.end;
    delete updates['active_window'];
  }

  // If changing bed, verify it exists and isn't taken
  if (parsed.bed_id) {
    const bed = await dynamoRepo.getBedById(parsed.bed_id);
    if (!bed || bed.farm_id !== farmId) {
      throw new ValidationError('Bed not found in this farm');
    }
    const existing = await dynamoRepo.getDevicesForFarm(farmId);
    if (existing.some(d => d.bed_id === parsed.bed_id && d.device_id !== deviceId)) {
      throw new ConflictError('This bed already has a device assigned');
    }
  }

  const device = await dynamoRepo.updateDeviceConfig(farmId, deviceId, updates as Record<string, string | number>);

  appEvents.emit('device.config_updated', {
    type: 'device.config_updated',
    timestamp: new Date().toISOString(),
    actor_id: userId,
    actor_email: userEmail,
    payload: { farm_id: farmId, device_id: deviceId, changes: Object.keys(parsed) },
  });

  return c.json(device);
});

// DELETE /farms/:farmId/devices/:deviceId — deregister
farmDevicesRouter.delete('/:farmId/devices/:deviceId', async (c) => {
  const { userId, userEmail, isAdmin } = getAuthContext(c);
  const farmId = c.req.param('farmId');
  const deviceId = c.req.param('deviceId');
  await assertFarmAccess(farmId, userId, ['admin', 'owner'], isAdmin);

  // Get device name for the event before deleting
  const device = await dynamoRepo.getDeviceById(deviceId);
  if (!device || device.farm_id !== farmId) {
    throw new NotFoundError('Device not found');
  }

  await dynamoRepo.deleteDevice(farmId, deviceId);

  appEvents.emit('device.deregistered', {
    type: 'device.deregistered',
    timestamp: new Date().toISOString(),
    actor_id: userId,
    actor_email: userEmail,
    payload: { farm_id: farmId, device_id: deviceId, node_name: device.node_name },
  });

  return c.json({ deleted: true, device_id: deviceId });
});

// POST /farms/:farmId/devices/:deviceId/test-shot — request test capture
farmDevicesRouter.post('/:farmId/devices/:deviceId/test-shot', async (c) => {
  const { userId, userEmail, isAdmin } = getAuthContext(c);
  const farmId = c.req.param('farmId');
  const deviceId = c.req.param('deviceId');
  await assertFarmAccess(farmId, userId, ['admin', 'owner'], isAdmin);

  await dynamoRepo.setTestShotFlag(farmId, deviceId, true);

  appEvents.emit('device.test_shot', {
    type: 'device.test_shot',
    timestamp: new Date().toISOString(),
    actor_id: userId,
    actor_email: userEmail,
    payload: { farm_id: farmId, device_id: deviceId },
  });

  return c.json({ test_shot_requested: true, device_id: deviceId });
});

// ── Device-scoped routes (Pi-facing) ────────────────────────────

export const deviceRouter = new Hono();

// GET /devices/:deviceId/config — config poll
deviceRouter.get('/:deviceId/config', async (c) => {
  const deviceId = c.req.param('deviceId');
  const headerKey = c.req.header('X-Device-Key') ?? '';

  if (!headerKey) {
    return c.json({ error: { code: 'UNAUTHORIZED', message: 'X-Device-Key header required' } }, 401);
  }

  const { valid, device } = await verifyDeviceKey(deviceId, headerKey);
  if (!valid || !device) {
    return c.json({ error: { code: 'UNAUTHORIZED', message: 'Invalid device key' } }, 401);
  }

  // Clear test_shot flag after it's been read
  const testShotRequested = device.test_shot_requested;
  if (testShotRequested) {
    await dynamoRepo.setTestShotFlag(device.farm_id, deviceId, false);
  }

  return c.json({
    capture_interval: device.capture_interval,
    resolution: device.resolution,
    jpeg_quality: device.jpeg_quality,
    active_window: device.active_window,
    trigger_type: device.trigger_type,
    bed_id: device.bed_id,
    upload_url: `/api/v1/beds/${device.bed_id}/images`,
    test_shot_requested: testShotRequested,
  });
});

// POST /devices/:deviceId/heartbeat — health update
deviceRouter.post('/:deviceId/heartbeat', async (c) => {
  const deviceId = c.req.param('deviceId');
  const headerKey = c.req.header('X-Device-Key') ?? '';

  if (!headerKey) {
    return c.json({ error: { code: 'UNAUTHORIZED', message: 'X-Device-Key header required' } }, 401);
  }

  const { valid, device } = await verifyDeviceKey(deviceId, headerKey);
  if (!valid || !device) {
    return c.json({ error: { code: 'UNAUTHORIZED', message: 'Invalid device key' } }, 401);
  }

  const body = await c.req.json();
  const parsed = parseBody(DeviceHeartbeatRequestSchema, body);

  await dynamoRepo.updateDeviceHeartbeat(device.farm_id, deviceId, parsed);

  return c.json({ acknowledged: true });
});

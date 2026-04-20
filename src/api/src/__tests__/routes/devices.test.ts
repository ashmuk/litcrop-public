import { TEST_USER_ID, authHeaders, makeAuthHeaders } from '../helpers/auth';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Set ADMIN_EMAILS before auth module loads (ADMIN_EMAILS_SET is cached at module level)
vi.hoisted(() => {
  process.env['ADMIN_EMAILS'] = 'admin@litcrop.test';
});

import app from '../../app';
import { dynamoRepo } from '../../services/dynamodb';
import * as deviceAuth from '../../middleware/device-auth';

vi.mock('../../services/dynamodb', () => ({
  dynamoRepo: {
    getFarm: vi.fn(),
    getFarmMembership: vi.fn(),
    getBedsForFarm: vi.fn(),
    getBedById: vi.fn(),
    getDevicesForFarm: vi.fn(),
    getDeviceById: vi.fn(),
    createDevice: vi.fn(),
    updateDeviceConfig: vi.fn(),
    updateDeviceHeartbeat: vi.fn(),
    recordConfigPoll: vi.fn(),
    deleteDevice: vi.fn(),
    setTestShotFlag: vi.fn(),
    countDevicesForFarm: vi.fn(),
  },
}));

vi.mock('bcryptjs', () => ({
  hash: vi.fn().mockResolvedValue('$2a$10$hashed'),
  compare: vi.fn().mockImplementation((plain: string) =>
    Promise.resolve(plain === 'dk_validkey'),
  ),
}));

vi.mock('../../middleware/device-auth', () => ({
  verifyDeviceKey: vi.fn(),
}));

const mockRepo = vi.mocked(dynamoRepo);
const mockVerifyDeviceKey = vi.mocked(deviceAuth.verifyDeviceKey);

// ── Fixtures ──────────────────────────────────────────────────────

const FARM_ID = 'farm-test-001';
const DEVICE_ID = 'dev-test1234';
const BED_ID = 'bed-a1';

const farmFixture = {
  id: FARM_ID,
  user_id: TEST_USER_ID,
  name: 'Test Farm',
  location_text: 'Test Location',
  latitude: 36.03,
  longitude: 138.26,
  locale: 'en' as const,
  theme: 'system' as const,
  grid_rows: 2,
  grid_cols: 3,
  created_at: '2026-04-01T00:00:00Z',
  default_currency: 'JPY' as const,
};

const membershipFixture = {
  user_id: TEST_USER_ID,
  farm_id: FARM_ID,
  role: 'owner' as const,
  joined_at: '2026-04-01T00:00:00Z',
};

const bedFixture = {
  id: BED_ID,
  farm_id: FARM_ID,
  row: 1,
  col: 1,
  name: 'A1',
  crop_type: 'tomato',
  latest_status: 'healthy' as const,
};

// Device fixture WITHOUT hash (matches Device type — used for list/update responses)
const deviceFixture = {
  device_id: DEVICE_ID,
  farm_id: FARM_ID,
  bed_id: BED_ID,
  node_name: 'Test Cam',
  status: 'online' as const,
  capture_interval: 1800,
  resolution: '1920x1080',
  jpeg_quality: 85,
  active_window: { start: '05:00', end: '20:00' },
  trigger_type: 'scheduled' as const,
  last_seen_at: '2026-04-02T10:00:00Z',
  battery_level: 85,
  wifi_signal_dbm: -42,
  storage_status: 'ok' as const,
  capabilities: null,
  test_shot_requested: false,
  created_at: '2026-04-01T00:00:00Z',
  updated_at: '2026-04-02T10:00:00Z',
};

// Device fixture WITH hash (matches getDeviceById return — used for auth/delete)
const deviceWithHash = {
  ...deviceFixture,
  device_api_key_hash: '$2a$10$hashed',
};

// ── Default mock setup ────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockRepo.getFarm.mockResolvedValue(farmFixture);
  mockRepo.getFarmMembership.mockResolvedValue(membershipFixture);
  mockRepo.getBedsForFarm.mockResolvedValue([bedFixture]);
  mockRepo.getBedById.mockResolvedValue(bedFixture);
  mockRepo.getDevicesForFarm.mockResolvedValue([deviceFixture]);
  mockRepo.getDeviceById.mockResolvedValue(deviceWithHash);
  mockRepo.countDevicesForFarm.mockResolvedValue(0);
  mockRepo.createDevice.mockResolvedValue(undefined);
  mockRepo.updateDeviceConfig.mockResolvedValue(deviceFixture);
  mockRepo.updateDeviceHeartbeat.mockResolvedValue(undefined);
  mockRepo.recordConfigPoll.mockResolvedValue(undefined);
  mockRepo.deleteDevice.mockResolvedValue(undefined);
  mockRepo.setTestShotFlag.mockResolvedValue(undefined);
  mockVerifyDeviceKey.mockResolvedValue({ valid: true, device: deviceWithHash });
});

// ── POST /api/v1/farms/:farmId/devices ───────────────────────────

describe('POST /api/v1/farms/:farmId/devices', () => {
  it('valid registration → 201 with device_id, device_api_key, config_poll_url', async () => {
    mockRepo.getDevicesForFarm.mockResolvedValue([]);

    const res = await app.request(`/api/v1/farms/${FARM_ID}/devices`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ node_name: 'North Cam', bed_id: BED_ID }),
    });

    expect(res.status).toBe(201);
    const body = await res.json() as Record<string, unknown>;
    expect(body['device_id']).toBeDefined();
    expect(typeof body['device_api_key']).toBe('string');
    expect(body['config_poll_url']).toBeDefined();
  });

  it('api_key starts with dk_', async () => {
    mockRepo.getDevicesForFarm.mockResolvedValue([]);

    const res = await app.request(`/api/v1/farms/${FARM_ID}/devices`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ node_name: 'South Cam', bed_id: BED_ID }),
    });

    expect(res.status).toBe(201);
    const body = await res.json() as Record<string, unknown>;
    expect((body['device_api_key'] as string).startsWith('dk_')).toBe(true);
  });

  it('missing node_name → 400', async () => {
    const res = await app.request(`/api/v1/farms/${FARM_ID}/devices`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ bed_id: BED_ID }),
    });

    expect(res.status).toBe(400);
  });

  it('node_name longer than 64 chars → 400', async () => {
    const res = await app.request(`/api/v1/farms/${FARM_ID}/devices`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ node_name: 'A'.repeat(65), bed_id: BED_ID }),
    });

    expect(res.status).toBe(400);
  });

  it('bed_id not in farm → 400', async () => {
    mockRepo.getBedById.mockResolvedValue({ ...bedFixture, farm_id: 'other-farm' });

    const res = await app.request(`/api/v1/farms/${FARM_ID}/devices`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ node_name: 'Cam', bed_id: 'bed-other' }),
    });

    expect(res.status).toBe(400);
  });

  it('duplicate bed assignment → 409', async () => {
    // getDevicesForFarm returns a device already on BED_ID
    mockRepo.getDevicesForFarm.mockResolvedValue([deviceFixture]);

    const res = await app.request(`/api/v1/farms/${FARM_ID}/devices`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ node_name: 'Another Cam', bed_id: BED_ID }),
    });

    expect(res.status).toBe(409);
  });

  it('farm at 10 device limit → 400', async () => {
    mockRepo.countDevicesForFarm.mockResolvedValue(10);

    const res = await app.request(`/api/v1/farms/${FARM_ID}/devices`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ node_name: 'Extra Cam', bed_id: BED_ID }),
    });

    expect(res.status).toBe(400);
  });

  it('observer role → 404', async () => {
    mockRepo.getFarmMembership.mockResolvedValue({ ...membershipFixture, role: 'staff' as const });

    const res = await app.request(`/api/v1/farms/${FARM_ID}/devices`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ node_name: 'Cam', bed_id: BED_ID }),
    });

    expect(res.status).toBe(404);
  });

  it('unauthenticated → 401', async () => {
    const res = await app.request(`/api/v1/farms/${FARM_ID}/devices`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ node_name: 'Cam', bed_id: BED_ID }),
    });

    expect(res.status).toBe(401);
  });

  // #462 Phase 1 tail — route wires auth-context userId into registered_by
  // Symmetric to the uploaded_by test in beds.test.ts: the dynamodb.test.ts
  // layer confirms persistence given a value, but does not verify the route
  // passes the JWT sub through. A regression silently writing undefined would
  // break Phase 3's device-activity attribution.
  it('passes auth-context userId as registered_by to createDevice (#462)', async () => {
    mockRepo.getDevicesForFarm.mockResolvedValue([]);

    const res = await app.request(`/api/v1/farms/${FARM_ID}/devices`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...makeAuthHeaders('test-user-sub') },
      body: JSON.stringify({ node_name: 'North Cam', bed_id: BED_ID }),
    });

    expect(res.status).toBe(201);

    expect(mockRepo.createDevice).toHaveBeenCalledOnce();
    const callArgs = mockRepo.createDevice.mock.calls[0];
    // createDevice signature: (farmId, deviceId, data) — registered_by is in data
    expect(callArgs[2]).toMatchObject({ registered_by: 'test-user-sub' });
  });
});

// ── GET /api/v1/farms/:farmId/devices ────────────────────────────

describe('GET /api/v1/farms/:farmId/devices', () => {
  it('returns devices with bed_name enriched → 200', async () => {
    mockRepo.getDevicesForFarm.mockResolvedValue([deviceFixture]);
    mockRepo.getBedsForFarm.mockResolvedValue([bedFixture]);

    const res = await app.request(`/api/v1/farms/${FARM_ID}/devices`, {
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const body = await res.json() as { devices: Array<Record<string, unknown>> };
    expect(body.devices).toHaveLength(1);
    expect(body.devices[0]['bed_name']).toBe('A1');
    expect(body.devices[0]['device_id']).toBe(DEVICE_ID);
    // Security: credential hash must never leak to clients
    expect(body.devices[0]['device_api_key_hash']).toBeUndefined();
  });

  it('empty farm → 200 with empty array', async () => {
    mockRepo.getDevicesForFarm.mockResolvedValue([]);
    mockRepo.getBedsForFarm.mockResolvedValue([]);

    const res = await app.request(`/api/v1/farms/${FARM_ID}/devices`, {
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const body = await res.json() as { devices: unknown[] };
    expect(body.devices).toHaveLength(0);
  });

  it('non-member → 404', async () => {
    mockRepo.getFarmMembership.mockResolvedValue(null);

    const res = await app.request(`/api/v1/farms/${FARM_ID}/devices`, {
      headers: authHeaders(),
    });

    expect(res.status).toBe(404);
  });

  it('observer can list → 200', async () => {
    mockRepo.getFarmMembership.mockResolvedValue({ ...membershipFixture, role: 'staff' as const });
    mockRepo.getDevicesForFarm.mockResolvedValue([deviceFixture]);
    mockRepo.getBedsForFarm.mockResolvedValue([bedFixture]);

    const res = await app.request(`/api/v1/farms/${FARM_ID}/devices`, {
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const body = await res.json() as { devices: unknown[] };
    expect(body.devices).toHaveLength(1);
  });
});

// ── GET /api/v1/devices/:deviceId/config ─────────────────────────

describe('GET /api/v1/devices/:deviceId/config', () => {
  it('valid JWT + valid device key → 200 with config', async () => {
    mockVerifyDeviceKey.mockResolvedValue({ valid: true, device: deviceWithHash });

    const res = await app.request(`/api/v1/devices/${DEVICE_ID}/config`, {
      headers: { ...authHeaders(), 'X-Device-Key': 'dk_validkey' },
    });

    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body['capture_interval']).toBe(1800);
    expect(body['bed_id']).toBe(BED_ID);
    expect(body['upload_url']).toBeDefined();
  });

  // T-395-04: explicit assertion that the three Phase-0 round-trip fields
  // are emitted by GET /config. Without this, a regression that drops any
  // of resolution / active_window / capture_interval ships silently — the
  // Pi falls back to compiled defaults and the operator never sees the bug.
  it('returns resolution, active_window, capture_interval (#395)', async () => {
    mockVerifyDeviceKey.mockResolvedValue({ valid: true, device: deviceWithHash });

    const res = await app.request(`/api/v1/devices/${DEVICE_ID}/config`, {
      headers: { ...authHeaders(), 'X-Device-Key': 'dk_validkey' },
    });

    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body['resolution']).toBe('1920x1080');
    expect(body['capture_interval']).toBe(1800);
    expect(body['active_window']).toEqual({ start: '05:00', end: '20:00' });
  });

  it('missing X-Device-Key → 401', async () => {
    const res = await app.request(`/api/v1/devices/${DEVICE_ID}/config`, {
      headers: authHeaders(),
    });

    expect(res.status).toBe(401);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('wrong device key → 401', async () => {
    mockVerifyDeviceKey.mockResolvedValue({ valid: false });

    const res = await app.request(`/api/v1/devices/${DEVICE_ID}/config`, {
      headers: { ...authHeaders(), 'X-Device-Key': 'dk_wrongkey' },
    });

    expect(res.status).toBe(401);
  });

  it('non-existent device → 401', async () => {
    mockVerifyDeviceKey.mockResolvedValue({ valid: false });

    const res = await app.request(`/api/v1/devices/dev-nonexistent/config`, {
      headers: { ...authHeaders(), 'X-Device-Key': 'dk_somekey' },
    });

    expect(res.status).toBe(401);
  });

  it('test_shot_requested returned then cleared', async () => {
    const deviceWithFlag = { ...deviceWithHash, test_shot_requested: true };
    mockVerifyDeviceKey.mockResolvedValue({ valid: true, device: deviceWithFlag });

    const res = await app.request(`/api/v1/devices/${DEVICE_ID}/config`, {
      headers: { ...authHeaders(), 'X-Device-Key': 'dk_validkey' },
    });

    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body['test_shot_requested']).toBe(true);
    expect(mockRepo.setTestShotFlag).toHaveBeenCalledWith(FARM_ID, DEVICE_ID, false);
  });

  it('response includes upload_url', async () => {
    mockVerifyDeviceKey.mockResolvedValue({ valid: true, device: deviceWithHash });

    const res = await app.request(`/api/v1/devices/${DEVICE_ID}/config`, {
      headers: { ...authHeaders(), 'X-Device-Key': 'dk_validkey' },
    });

    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body['upload_url']).toBe(`/api/v1/beds/${BED_ID}/images`);
  });

  // #406-b: every successful config fetch records a timestamp the UI uses
  // to show freshness. Failure to call recordConfigPoll means the UI's
  // "Applied / Pending / Offline" badge is stuck at Offline.
  it('records config-poll timestamp on successful fetch (#406)', async () => {
    mockVerifyDeviceKey.mockResolvedValue({ valid: true, device: deviceWithHash });

    const res = await app.request(`/api/v1/devices/${DEVICE_ID}/config`, {
      headers: { ...authHeaders(), 'X-Device-Key': 'dk_validkey' },
    });

    expect(res.status).toBe(200);
    expect(mockRepo.recordConfigPoll).toHaveBeenCalledWith(FARM_ID, DEVICE_ID);
  });

  it('does NOT record config-poll timestamp on auth failure (#406)', async () => {
    mockVerifyDeviceKey.mockResolvedValue({ valid: false });

    const res = await app.request(`/api/v1/devices/${DEVICE_ID}/config`, {
      headers: { ...authHeaders(), 'X-Device-Key': 'dk_wrongkey' },
    });

    expect(res.status).toBe(401);
    expect(mockRepo.recordConfigPoll).not.toHaveBeenCalled();
  });

  // #406 remediation: recordConfigPoll swallows its own failures so a
  // telemetry-layer outage (DynamoDB regional issue) cannot break the
  // config-poll response itself. The Pi must keep running; telemetry
  // loss is the correct conservative failure mode.
  it('still returns 200 when recordConfigPoll rejects (#406 remediation)', async () => {
    mockVerifyDeviceKey.mockResolvedValue({ valid: true, device: deviceWithHash });
    mockRepo.recordConfigPoll.mockRejectedValueOnce(new Error('dynamo down'));

    const res = await app.request(`/api/v1/devices/${DEVICE_ID}/config`, {
      headers: { ...authHeaders(), 'X-Device-Key': 'dk_validkey' },
    });

    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body['resolution']).toBe('1920x1080');
  });
});

// ── POST /api/v1/devices/:deviceId/heartbeat ─────────────────────

describe('POST /api/v1/devices/:deviceId/heartbeat', () => {
  it('valid heartbeat → 200 acknowledged', async () => {
    mockVerifyDeviceKey.mockResolvedValue({ valid: true, device: deviceWithHash });

    const res = await app.request(`/api/v1/devices/${DEVICE_ID}/heartbeat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders(), 'X-Device-Key': 'dk_validkey' },
      body: JSON.stringify({ battery_level: 80 }),
    });

    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body['acknowledged']).toBe(true);
  });

  it('with capabilities → 200', async () => {
    mockVerifyDeviceKey.mockResolvedValue({ valid: true, device: deviceWithHash });

    const res = await app.request(`/api/v1/devices/${DEVICE_ID}/heartbeat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders(), 'X-Device-Key': 'dk_validkey' },
      body: JSON.stringify({
        battery_level: 75,
        capabilities: { resolutions: ['1920x1080'], has_battery_sensor: true, has_pir_sensor: false },
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body['acknowledged']).toBe(true);
  });

  // #406-b: Pi echoes its runtime config in the heartbeat so the UI can
  // show drift. The repo persists it as-is — the UI compares saved vs
  // effective to render the status badge.
  it('persists effective_config from heartbeat (#406)', async () => {
    mockVerifyDeviceKey.mockResolvedValue({ valid: true, device: deviceWithHash });

    const effective = {
      resolution: '1280x720',
      jpeg_quality: 85,
      capture_interval: 1800,
      active_window: { start: '05:00', end: '20:00' },
    };
    const res = await app.request(`/api/v1/devices/${DEVICE_ID}/heartbeat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders(), 'X-Device-Key': 'dk_validkey' },
      body: JSON.stringify({ battery_level: 80, effective_config: effective }),
    });

    expect(res.status).toBe(200);
    expect(mockRepo.updateDeviceHeartbeat).toHaveBeenCalledWith(
      FARM_ID,
      DEVICE_ID,
      expect.objectContaining({ effective_config: effective }),
    );
  });

  it('accepts heartbeat without effective_config (pre-#406 Pi backward compat)', async () => {
    mockVerifyDeviceKey.mockResolvedValue({ valid: true, device: deviceWithHash });

    const res = await app.request(`/api/v1/devices/${DEVICE_ID}/heartbeat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders(), 'X-Device-Key': 'dk_validkey' },
      body: JSON.stringify({ battery_level: 80 }),
    });

    expect(res.status).toBe(200);
    const calls = mockRepo.updateDeviceHeartbeat.mock.calls[0]?.[2] ?? {};
    expect(calls).not.toHaveProperty('effective_config');
  });

  it('partial heartbeat (no fields) → 200', async () => {
    mockVerifyDeviceKey.mockResolvedValue({ valid: true, device: deviceWithHash });

    const res = await app.request(`/api/v1/devices/${DEVICE_ID}/heartbeat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders(), 'X-Device-Key': 'dk_validkey' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(200);
  });

  it('invalid battery > 100 → 400', async () => {
    mockVerifyDeviceKey.mockResolvedValue({ valid: true, device: deviceWithHash });

    const res = await app.request(`/api/v1/devices/${DEVICE_ID}/heartbeat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders(), 'X-Device-Key': 'dk_validkey' },
      body: JSON.stringify({ battery_level: 150 }),
    });

    expect(res.status).toBe(400);
  });

  it('missing device key → 401', async () => {
    const res = await app.request(`/api/v1/devices/${DEVICE_ID}/heartbeat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ battery_level: 80 }),
    });

    expect(res.status).toBe(401);
  });
});

// ── PATCH /api/v1/farms/:farmId/devices/:deviceId ────────────────

describe('PATCH /api/v1/farms/:farmId/devices/:deviceId', () => {
  it('update capture_interval → 200', async () => {
    const updated = { ...deviceFixture, capture_interval: 3600 };
    mockRepo.updateDeviceConfig.mockResolvedValue(updated);

    const res = await app.request(`/api/v1/farms/${FARM_ID}/devices/${DEVICE_ID}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ capture_interval: 3600 }),
    });

    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body['capture_interval']).toBe(3600);
  });

  it('update active_window → 200', async () => {
    mockRepo.updateDeviceConfig.mockResolvedValue(deviceFixture);

    const res = await app.request(`/api/v1/farms/${FARM_ID}/devices/${DEVICE_ID}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ active_window: { start: '06:00', end: '18:00' } }),
    });

    expect(res.status).toBe(200);
    expect(mockRepo.updateDeviceConfig).toHaveBeenCalledWith(
      FARM_ID,
      DEVICE_ID,
      expect.objectContaining({ active_window_start: '06:00', active_window_end: '18:00' }),
    );
  });

  // T-395-04: PATCH resolution must reach the repo as a single string, not
  // split into width/height. The legacy mvp schema stored width/height
  // separately — a regression that re-splits it would break the Pi parser.
  it('update resolution → 200, stored as single string (#395)', async () => {
    mockRepo.updateDeviceConfig.mockResolvedValue({ ...deviceFixture, resolution: '1280x720' });

    const res = await app.request(`/api/v1/farms/${FARM_ID}/devices/${DEVICE_ID}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ resolution: '1280x720' }),
    });

    expect(res.status).toBe(200);
    expect(mockRepo.updateDeviceConfig).toHaveBeenCalledWith(
      FARM_ID,
      DEVICE_ID,
      expect.objectContaining({ resolution: '1280x720' }),
    );
  });

  // T-395-04: full PATCH→GET round-trip for the three Phase-0 fields.
  // Drives the device fixture through the same shape the Pi will see.
  it('PATCH then GET returns the same resolution/window/interval (#395)', async () => {
    const patched = {
      ...deviceFixture,
      resolution: '1280x720',
      capture_interval: 600,
      active_window: { start: '07:00', end: '19:00' },
    };
    mockRepo.updateDeviceConfig.mockResolvedValue(patched);
    mockVerifyDeviceKey.mockResolvedValue({ valid: true, device: { ...patched, device_api_key_hash: '$2a$10$hashed' } });

    const patchRes = await app.request(`/api/v1/farms/${FARM_ID}/devices/${DEVICE_ID}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({
        resolution: '1280x720',
        capture_interval: 600,
        active_window: { start: '07:00', end: '19:00' },
      }),
    });
    expect(patchRes.status).toBe(200);

    const getRes = await app.request(`/api/v1/devices/${DEVICE_ID}/config`, {
      headers: { ...authHeaders(), 'X-Device-Key': 'dk_validkey' },
    });
    expect(getRes.status).toBe(200);
    const body = await getRes.json() as Record<string, unknown>;
    expect(body['resolution']).toBe('1280x720');
    expect(body['capture_interval']).toBe(600);
    expect(body['active_window']).toEqual({ start: '07:00', end: '19:00' });
  });

  it('change bed_id to available bed → 200', async () => {
    const newBedId = 'bed-b2';
    const newBed = { ...bedFixture, id: newBedId };
    mockRepo.getBedById.mockResolvedValue(newBed);
    // No other device is on newBedId
    mockRepo.getDevicesForFarm.mockResolvedValue([deviceFixture]);
    mockRepo.updateDeviceConfig.mockResolvedValue({ ...deviceFixture, bed_id: newBedId });

    const res = await app.request(`/api/v1/farms/${FARM_ID}/devices/${DEVICE_ID}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ bed_id: newBedId }),
    });

    expect(res.status).toBe(200);
  });

  it('change bed_id to occupied bed → 409', async () => {
    const otherDeviceId = 'dev-other001';
    const newBedId = 'bed-b2';
    const newBed = { ...bedFixture, id: newBedId };
    mockRepo.getBedById.mockResolvedValue(newBed);
    // Another device is already on newBedId
    mockRepo.getDevicesForFarm.mockResolvedValue([
      deviceFixture,
      { ...deviceFixture, device_id: otherDeviceId, bed_id: newBedId },
    ]);

    const res = await app.request(`/api/v1/farms/${FARM_ID}/devices/${DEVICE_ID}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ bed_id: newBedId }),
    });

    expect(res.status).toBe(409);
  });

  it('capture_interval < 300 → 400', async () => {
    const res = await app.request(`/api/v1/farms/${FARM_ID}/devices/${DEVICE_ID}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ capture_interval: 60 }),
    });

    expect(res.status).toBe(400);
  });

  it('observer role → 404', async () => {
    mockRepo.getFarmMembership.mockResolvedValue({ ...membershipFixture, role: 'staff' as const });

    const res = await app.request(`/api/v1/farms/${FARM_ID}/devices/${DEVICE_ID}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ capture_interval: 3600 }),
    });

    expect(res.status).toBe(404);
  });
});

// ── DELETE /api/v1/farms/:farmId/devices/:deviceId ───────────────

describe('DELETE /api/v1/farms/:farmId/devices/:deviceId', () => {
  it('delete existing device → 200', async () => {
    mockRepo.getDeviceById.mockResolvedValue(deviceWithHash);

    const res = await app.request(`/api/v1/farms/${FARM_ID}/devices/${DEVICE_ID}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body['deleted']).toBe(true);
    expect(body['device_id']).toBe(DEVICE_ID);
  });

  it('non-existent device → 404', async () => {
    mockRepo.getDeviceById.mockResolvedValue(null);

    const res = await app.request(`/api/v1/farms/${FARM_ID}/devices/${DEVICE_ID}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });

    expect(res.status).toBe(404);
  });

  it('observer role → 404', async () => {
    mockRepo.getFarmMembership.mockResolvedValue({ ...membershipFixture, role: 'staff' as const });

    const res = await app.request(`/api/v1/farms/${FARM_ID}/devices/${DEVICE_ID}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });

    expect(res.status).toBe(404);
  });
});

// ── POST /api/v1/farms/:farmId/devices/:deviceId/test-shot ────────

describe('POST /api/v1/farms/:farmId/devices/:deviceId/test-shot', () => {
  it('request test-shot → 200', async () => {
    const res = await app.request(`/api/v1/farms/${FARM_ID}/devices/${DEVICE_ID}/test-shot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body['test_shot_requested']).toBe(true);
    expect(body['device_id']).toBe(DEVICE_ID);
    expect(mockRepo.setTestShotFlag).toHaveBeenCalledWith(FARM_ID, DEVICE_ID, true);
  });

  it('observer role → 404', async () => {
    mockRepo.getFarmMembership.mockResolvedValue({ ...membershipFixture, role: 'staff' as const });

    const res = await app.request(`/api/v1/farms/${FARM_ID}/devices/${DEVICE_ID}/test-shot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(404);
  });
});

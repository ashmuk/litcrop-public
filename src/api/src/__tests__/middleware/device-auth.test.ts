import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock bcryptjs
vi.mock('bcryptjs', () => ({
  compare: vi.fn(),
}));

// Mock dynamoRepo
vi.mock('../../services/dynamodb', () => ({
  dynamoRepo: {
    getDeviceById: vi.fn(),
  },
}));

import { compare } from 'bcryptjs';
import { dynamoRepo } from '../../services/dynamodb';
import { verifyDeviceKey } from '../../middleware/device-auth';

const mockCompare = vi.mocked(compare);
const mockGetDeviceById = vi.mocked(dynamoRepo.getDeviceById);

const deviceFixture = {
  device_id: 'device-001',
  farm_id: 'farm-aaa',
  bed_id: 'bed-a1',
  node_name: 'North Camera',
  status: 'online' as const,
  capture_interval: 1800,
  resolution: '1920x1080',
  jpeg_quality: 85,
  active_window: { start: '05:00', end: '20:00' },
  trigger_type: 'scheduled' as const,
  last_seen_at: null,
  battery_level: null,
  wifi_signal_dbm: null,
  storage_status: null,
  capabilities: null,
  test_shot_requested: false,
  device_api_key_hash: '$2a$10$hashhashhashhashhashhuwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('verifyDeviceKey', () => {
  it('returns { valid: true, device } for a correct key', async () => {
    mockGetDeviceById.mockResolvedValue(deviceFixture);
    mockCompare.mockResolvedValue(true as never);

    const result = await verifyDeviceKey('device-001', 'correct-key');

    expect(result.valid).toBe(true);
    expect(result.device).toMatchObject({ device_id: 'device-001', farm_id: 'farm-aaa' });
    expect(mockCompare).toHaveBeenCalledWith('correct-key', deviceFixture.device_api_key_hash);
  });

  it('returns { valid: false } for a wrong key on an existing device', async () => {
    mockGetDeviceById.mockResolvedValue(deviceFixture);
    mockCompare.mockResolvedValue(false as never);

    const result = await verifyDeviceKey('device-001', 'wrong-key');

    expect(result.valid).toBe(false);
    expect(result.device).toBeUndefined();
  });

  it('returns { valid: false } when device does not exist', async () => {
    mockGetDeviceById.mockResolvedValue(null);
    mockCompare.mockResolvedValue(false as never);

    const result = await verifyDeviceKey('device-missing', 'any-key');

    expect(result.valid).toBe(false);
    expect(result.device).toBeUndefined();
  });

  it('calls bcrypt.compare even when device is not found (timing safety)', async () => {
    mockGetDeviceById.mockResolvedValue(null);
    mockCompare.mockResolvedValue(false as never);

    await verifyDeviceKey('device-missing', 'any-key');

    // Must always call compare — never short-circuit on missing device
    expect(mockCompare).toHaveBeenCalledTimes(1);
    // Should use the dummy hash, not the supplied key, as the hash argument
    const [, hashArg] = mockCompare.mock.calls[0];
    expect(hashArg).toMatch(/^\$2a\$10\$/);
  });

  it('returns { valid: false } for an empty key string', async () => {
    mockGetDeviceById.mockResolvedValue(deviceFixture);
    mockCompare.mockResolvedValue(false as never);

    const result = await verifyDeviceKey('device-001', '');

    expect(result.valid).toBe(false);
    expect(mockCompare).toHaveBeenCalledWith('', deviceFixture.device_api_key_hash);
  });
});

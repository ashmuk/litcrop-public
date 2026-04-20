/**
 * Unit + repository tests for #462 Phase 3: me-activity repository.
 * Tests: U1, U2, U3, U4, U5
 *
 * Strategy: mock sibling repository modules and the DDB client so
 * getActivityForUser() can be exercised without real network calls.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';

// ── DDB mock must be set up before the module under test is imported ─
const ddbMock = mockClient(DynamoDBDocumentClient);

// ── Mock sibling repositories ─────────────────────────────────────
vi.mock('../../services/repositories/farms', () => ({
  getFarm: vi.fn(),
}));
vi.mock('../../services/repositories/beds', () => ({
  getBedsForFarm: vi.fn(),
}));
vi.mock('../../services/repositories/members', () => ({
  getFarmsForUser: vi.fn(),
}));
vi.mock('../../services/repositories/users', () => ({
  getUserProfile: vi.fn(),
}));

import {
  getActivityForUser,
  encodeActivityCursor,
  decodeActivityCursor,
} from '../../services/repositories/me-activity';
import { getFarm } from '../../services/repositories/farms';
import { getBedsForFarm } from '../../services/repositories/beds';
import { getFarmsForUser } from '../../services/repositories/members';
import { getUserProfile } from '../../services/repositories/users';

const mockGetFarm = vi.mocked(getFarm);
const mockGetBedsForFarm = vi.mocked(getBedsForFarm);
const mockGetFarmsForUser = vi.mocked(getFarmsForUser);
const mockGetUserProfile = vi.mocked(getUserProfile);

// ── Fixtures ──────────────────────────────────────────────────────

const USER_A = 'user-aaa-cognito-sub';
const USER_B = 'user-bbb-cognito-sub';
const FARM_ID = 'farm-00000000-0001';
const BED_ID_1 = 'bed-00000000-0001';
const BED_ID_2 = 'bed-00000000-0002';
const DEVICE_ID = 'dev-00000000-0001';
const DIARY_ID = 'diary-000000-0001';
const IMAGE_ID_1 = 'img-00000000-0001';
const IMAGE_ID_2 = 'img-00000000-0002';

const farmFixture = {
  id: FARM_ID,
  user_id: USER_A,
  name: 'Test Farm',
  location_text: 'Nagano',
  latitude: 36.65,
  longitude: 138.18,
  locale: 'en' as const,
  theme: 'system' as const,
  grid_rows: 2,
  grid_cols: 2,
  created_at: '2026-01-01T00:00:00Z',
  default_currency: 'JPY' as const,
};

const membershipFixture = {
  user_id: USER_A,
  farm_id: FARM_ID,
  role: 'owner' as const,
  joined_at: '2026-01-01T00:00:00Z',
};

const bedFixture1 = {
  id: BED_ID_1,
  farm_id: FARM_ID,
  row: 1,
  col: 1,
  name: 'A1',
  latest_status: 'healthy' as const,
};
const bedFixture2 = {
  id: BED_ID_2,
  farm_id: FARM_ID,
  row: 1,
  col: 2,
  name: 'A2',
  latest_status: 'no_data' as const,
};

const profileFixture = {
  user_id: USER_A,
  display_name: 'Alice Tester',
  preferred_role: 'owner' as const,
  created_at: '2026-01-01T00:00:00Z',
};

// DDB item templates

function makeDiaryItem(overrides: Record<string, unknown> = {}) {
  return {
    PK: `FARM#${FARM_ID}`,
    SK: `DIARY#2026-03-01#${DIARY_ID}`,
    id: DIARY_ID,
    farm_id: FARM_ID,
    created_by: USER_A,
    created_at: '2026-03-01T08:00:00Z',
    category: 'watering',
    entry_type: 'actual',
    description: 'Watered beds',
    bed_id: BED_ID_1,
    ...overrides,
  };
}

function makeDeviceItem(overrides: Record<string, unknown> = {}) {
  return {
    PK: `FARM#${FARM_ID}`,
    SK: `DEVICE#${DEVICE_ID}`,
    device_id: DEVICE_ID,
    farm_id: FARM_ID,
    bed_id: BED_ID_1,
    node_name: 'Pi-Cam-1',
    registered_by: USER_A,
    created_at: '2026-02-15T12:00:00Z',
    ...overrides,
  };
}

function makeImageItem(overrides: Record<string, unknown> = {}) {
  return {
    PK: `BED#${BED_ID_1}`,
    SK: `IMG#2026-03-10T06:00:00Z#${IMAGE_ID_1}`,
    id: IMAGE_ID_1,
    bed_id: BED_ID_1,
    uploaded_at: '2026-03-10T06:00:00Z',
    trigger: 'scheduled',
    uploaded_by: USER_A,
    thumbnail_key: null,
    ...overrides,
  };
}

// ── Setup ─────────────────────────────────────────────────────────

beforeEach(() => {
  ddbMock.reset();
  vi.clearAllMocks();

  // Sensible defaults — individual tests override as needed.
  mockGetFarmsForUser.mockResolvedValue([membershipFixture]);
  mockGetFarm.mockResolvedValue(farmFixture);
  mockGetBedsForFarm.mockResolvedValue([bedFixture1]);
  mockGetUserProfile.mockResolvedValue(profileFixture);

  // Default: no items from DDB unless a test seeds them.
  ddbMock.on(QueryCommand).resolves({ Items: [] });
});

// ── U1: aggregate totals sum correctly ────────────────────────────

describe('U1 — getActivityForUser: source counts aggregate correctly', () => {
  it('returns total_count = diary + device + image counts', async () => {
    // 1 diary, 1 device, 1 image — expect total_count: 3
    ddbMock
      .on(QueryCommand)
      // First call: diary query for farmId
      .resolvesOnce({ Items: [makeDiaryItem()] })
      // Second call: device query for farmId
      .resolvesOnce({ Items: [makeDeviceItem()] })
      // Third call(s): image query for each bed (bedFixture1)
      .resolvesOnce({ Items: [makeImageItem()] });

    const result = await getActivityForUser(USER_A, 20);
    expect(result.totalCount).toBe(3);
    expect(result.items).toHaveLength(3);
  });

  it('counts zero when no activity exists', async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [] });
    const result = await getActivityForUser(USER_A, 20);
    expect(result.totalCount).toBe(0);
    expect(result.items).toHaveLength(0);
  });
});

// ── U2: chronological merge (DESC by timestamp) ───────────────────

describe('U2 — chronological merge: items ordered by timestamp DESC', () => {
  it('interleaves diary, device, image items newest-first', async () => {
    const newestTs = '2026-04-01T10:00:00Z';
    const middleTs = '2026-03-10T06:00:00Z';
    const oldestTs = '2026-02-15T12:00:00Z';

    ddbMock
      .on(QueryCommand)
      .resolvesOnce({ Items: [makeDiaryItem({ created_at: middleTs })] })
      .resolvesOnce({ Items: [makeDeviceItem({ created_at: oldestTs })] })
      .resolvesOnce({ Items: [makeImageItem({ uploaded_at: newestTs, id: IMAGE_ID_1 })] });

    const result = await getActivityForUser(USER_A, 20);
    expect(result.items[0].timestamp).toBe(newestTs);
    expect(result.items[1].timestamp).toBe(middleTs);
    expect(result.items[2].timestamp).toBe(oldestTs);
    expect(result.items[0].type).toBe('image');
    expect(result.items[1].type).toBe('diary');
    expect(result.items[2].type).toBe('device');
  });
});

// ── U3: stable sort on timestamp tie ─────────────────────────────

describe('U3 — chronological merge: stable tiebreaker on id DESC', () => {
  it('items with the same timestamp are ordered id DESC', async () => {
    const sameTs = '2026-03-15T09:00:00Z';
    // Two diary items with the same timestamp; the one with the
    // lexicographically larger id should come first.
    const DIARY_ID_A = 'diary-000000-zzzz';
    const DIARY_ID_B = 'diary-000000-aaaa';

    ddbMock
      .on(QueryCommand)
      .resolvesOnce({
        Items: [
          makeDiaryItem({ id: DIARY_ID_B, created_at: sameTs }),
          makeDiaryItem({ id: DIARY_ID_A, created_at: sameTs }),
        ],
      })
      // No devices, no images.
      .resolvesOnce({ Items: [] })
      .resolvesOnce({ Items: [] });

    const result = await getActivityForUser(USER_A, 20);
    expect(result.items).toHaveLength(2);
    // id DESC: 'diary:diary-000000-zzzz' > 'diary:diary-000000-aaaa'
    expect(result.items[0].id).toBe(`diary:${DIARY_ID_A}`);
    expect(result.items[1].id).toBe(`diary:${DIARY_ID_B}`);
  });
});

// ── U4: cursor encoding is opaque + round-trips ───────────────────

describe('U4 — cursor round-trip', () => {
  it('encodes to a non-JSON-looking string (opaque)', () => {
    const cursor = encodeActivityCursor({
      user_id: USER_A,
      ts: '2026-03-15T09:00:00Z',
      type: 'diary',
      id: `diary:${DIARY_ID}`,
    });
    // Must not start with '{' — must be base64url-opaque
    expect(cursor).not.toMatch(/^\{/);
    expect(typeof cursor).toBe('string');
    expect(cursor.length).toBeGreaterThan(0);
  });

  it('decodes back to the original values', () => {
    const original = {
      user_id: USER_A,
      ts: '2026-03-15T09:00:00Z',
      type: 'diary' as const,
      id: `diary:${DIARY_ID}`,
    };
    const encoded = encodeActivityCursor(original);
    const decoded = decodeActivityCursor(encoded, USER_A);
    expect(decoded.user_id).toBe(original.user_id);
    expect(decoded.ts).toBe(original.ts);
    expect(decoded.type).toBe(original.type);
    expect(decoded.id).toBe(original.id);
  });

  it('getActivityForUser emits next_cursor when there are more items', async () => {
    // Seed 3 items, ask for limit=2 → expect nextCursor to be non-null.
    ddbMock
      .on(QueryCommand)
      .resolvesOnce({
        Items: [
          makeDiaryItem({ id: 'diary-001', created_at: '2026-04-01T10:00:00Z' }),
          makeDiaryItem({ id: 'diary-002', created_at: '2026-04-01T09:00:00Z' }),
          makeDiaryItem({ id: 'diary-003', created_at: '2026-04-01T08:00:00Z' }),
        ],
      })
      .resolvesOnce({ Items: [] })
      .resolvesOnce({ Items: [] });

    const result = await getActivityForUser(USER_A, 2);
    expect(result.items).toHaveLength(2);
    expect(result.nextCursor).not.toBeNull();
    expect(typeof result.nextCursor).toBe('string');
  });

  it('returns null next_cursor when all items fit on the page', async () => {
    ddbMock
      .on(QueryCommand)
      .resolvesOnce({ Items: [makeDiaryItem()] })
      .resolvesOnce({ Items: [] })
      .resolvesOnce({ Items: [] });

    const result = await getActivityForUser(USER_A, 20);
    expect(result.nextCursor).toBeNull();
  });
});

// ── U5: cursor rejects tampered / malformed values ────────────────

describe('U5 — cursor validation: tampered or malformed cursors throw ValidationException', () => {
  it('throws ValidationException on a random string', () => {
    expect(() => decodeActivityCursor('not-a-valid-cursor', USER_A)).toThrow();
    try {
      decodeActivityCursor('not-a-valid-cursor', USER_A);
    } catch (err) {
      expect((err as Error).name).toBe('ValidationException');
    }
  });

  it('throws ValidationException on a decoded (plain JSON) cursor', () => {
    const raw = JSON.stringify({
      user_id: USER_A,
      ts: '2026-03-15T09:00:00Z',
      type: 'diary',
      id: 'diary:abc',
    });
    // Try passing the raw JSON directly (not base64url-encoded).
    expect(() => decodeActivityCursor(raw, USER_A)).toThrow();
    try {
      decodeActivityCursor(raw, USER_A);
    } catch (err) {
      expect((err as Error).name).toBe('ValidationException');
    }
  });

  it('throws ValidationException on a cursor with an unknown type field', () => {
    const encoded = Buffer.from(
      JSON.stringify({
        user_id: USER_A,
        ts: '2026-03-15T09:00:00Z',
        type: 'unknown_type',
        id: 'xxx',
      }),
    ).toString('base64url');
    expect(() => decodeActivityCursor(encoded, USER_A)).toThrow();
    try {
      decodeActivityCursor(encoded, USER_A);
    } catch (err) {
      expect((err as Error).name).toBe('ValidationException');
    }
  });

  it('throws ValidationException on cross-user cursor (I8 unit-level)', () => {
    const encoded = encodeActivityCursor({
      user_id: USER_A,
      ts: '2026-03-15T09:00:00Z',
      type: 'diary',
      id: 'diary:abc',
    });
    // USER_B tries to use USER_A's cursor
    expect(() => decodeActivityCursor(encoded, USER_B)).toThrow();
    try {
      decodeActivityCursor(encoded, USER_B);
    } catch (err) {
      expect((err as Error).name).toBe('ValidationException');
      expect((err as Error).message).toMatch(/mismatch/i);
    }
  });
});

// ── I4 (repository layer): Pi-auth reality ───────────────────────
// Images from beds whose device.registered_by = user appear in activity
// even when image.uploaded_by ≠ user.

describe('I4 (repository-level) — Pi-auth: scheduled images from user-registered beds', () => {
  it('includes a scheduled image where uploaded_by is a service account, not the user', async () => {
    const PI_SERVICE_ACCOUNT = 'pi-service-shared-jwt-sub';
    // Device registered by USER_A → bed BED_ID_1 is in piBedIds
    ddbMock
      .on(QueryCommand)
      .resolvesOnce({ Items: [] }) // no diary
      .resolvesOnce({ Items: [makeDeviceItem({ registered_by: USER_A, bed_id: BED_ID_1 })] })
      .resolvesOnce({
        Items: [
          makeImageItem({
            id: IMAGE_ID_1,
            uploaded_by: PI_SERVICE_ACCOUNT, // NOT the user
            trigger: 'scheduled',
            uploaded_at: '2026-03-10T06:00:00Z',
          }),
        ],
      });

    const result = await getActivityForUser(USER_A, 20);
    const imageItems = result.items.filter((it) => it.type === 'image');
    expect(imageItems).toHaveLength(1);
    expect(imageItems[0].id).toBe(`image:${IMAGE_ID_1}`);
  });

  it('excludes a scheduled image from a bed whose device was registered by a different user', async () => {
    const OTHER_USER = 'user-other-cognito-sub';
    ddbMock
      .on(QueryCommand)
      .resolvesOnce({ Items: [] }) // no diary
      // USER_A has no devices registered in this farm
      .resolvesOnce({ Items: [makeDeviceItem({ registered_by: OTHER_USER, bed_id: BED_ID_1 })] })
      .resolvesOnce({
        Items: [
          makeImageItem({
            id: IMAGE_ID_1,
            uploaded_by: OTHER_USER,
            trigger: 'scheduled',
          }),
        ],
      });

    const result = await getActivityForUser(USER_A, 20);
    const imageItems = result.items.filter((it) => it.type === 'image');
    expect(imageItems).toHaveLength(0);
  });
});

// ── I5 (repository layer): legacy-null non-leakage ───────────────

describe('I5 (repository-level) — legacy-null: items with null attribution are excluded', () => {
  it('excludes a device with registered_by = null from the activity', async () => {
    ddbMock
      .on(QueryCommand)
      .resolvesOnce({ Items: [] }) // diary
      .resolvesOnce({
        Items: [makeDeviceItem({ registered_by: null })],
      })
      .resolvesOnce({ Items: [] }); // images

    const result = await getActivityForUser(USER_A, 20);
    expect(result.items.filter((it) => it.type === 'device')).toHaveLength(0);
  });

  it('excludes a manual image with uploaded_by = null from the activity', async () => {
    // No devices registered → piBedIds empty → scheduled images from BED_ID_1
    // also cannot match via Pi path. An image with uploaded_by=null AND
    // trigger=scheduled would only qualify via Pi path if the bed is in piBedIds.
    ddbMock
      .on(QueryCommand)
      .resolvesOnce({ Items: [] }) // diary
      .resolvesOnce({ Items: [] }) // no devices → piBedIds empty
      .resolvesOnce({
        Items: [
          makeImageItem({
            id: IMAGE_ID_1,
            uploaded_by: null,
            trigger: 'motion', // motion can only match manual (uploaded_by = me)
          }),
        ],
      });

    const result = await getActivityForUser(USER_A, 20);
    expect(result.items.filter((it) => it.type === 'image')).toHaveLength(0);
  });
});

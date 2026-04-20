/**
 * Route integration tests for #462 Phase 3: GET /api/v1/me/activity
 * Tests: I1, I2, I3, I4, I5, I6, I7, I8, I9, I10
 *
 * Pattern: mock dynamoRepo (Hono app-level injection), issue requests
 * via app.request(), assert HTTP status + JSON shape.
 */

import { TEST_USER_ID, authHeaders, makeAuthHeaders } from '../helpers/auth';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ActivityFeedResponseSchema } from '@litcrop/shared';
import { encodeActivityCursor } from '../../services/repositories/me-activity';

vi.hoisted(() => {
  process.env['ADMIN_EMAILS'] = 'admin@litcrop.test';
});

import app from '../../app';
import { dynamoRepo } from '../../services/dynamodb';

// Extend the existing me.ts mock list with getActivityForUser.
vi.mock('../../services/dynamodb', () => ({
  dynamoRepo: {
    // ── me.ts existing methods ──
    getUserProfile: vi.fn(),
    upsertUserProfile: vi.fn(),
    getUserSettings: vi.fn(),
    upsertUserSettings: vi.fn(),
    getMyJoinRequests: vi.fn(),
    deleteAccount: vi.fn(),
    getNotificationPrefs: vi.fn(),
    upsertNotificationPrefs: vi.fn(),
    getUserNotifications: vi.fn(),
    getUnreadCount: vi.fn(),
    markAsRead: vi.fn(),
    markAllAsRead: vi.fn(),
    // ── #462 Phase 3 ──
    getActivityForUser: vi.fn(),
  },
  DEFAULT_SETTINGS: { locale: 'en', temp_unit: 'C', theme: 'earthy' },
}));

// Sharp is needed by me.ts profile-picture route — not exercised here but
// vitest will try to import the module, so provide a minimal stub.
vi.mock('../../services/s3', () => ({
  uploadAvatar: vi.fn(),
  deleteAvatar: vi.fn(),
  getSignedAvatarUrls: vi.fn().mockResolvedValue({ url: null, thumbUrl: null }),
}));

const mockRepo = vi.mocked(dynamoRepo);

// ── Fixtures ──────────────────────────────────────────────────────

const USER_A = TEST_USER_ID;
const USER_B = 'user-bbb-cognito-sub-002';
const ADMIN_EMAIL = 'admin@litcrop.test';
const ADMIN_USER_ID = 'admin-cognito-sub-001';

const FARM_ID = 'farm-00000000-1001';
const BED_ID = 'bed-00000000-1001';
const DEVICE_ID = 'dev-00000000-1001';
const DIARY_ID = 'diary-00000000-1001';
const IMAGE_ID = 'img-00000000-1001';

function makeDiaryItem() {
  return {
    id: `diary:${DIARY_ID}`,
    type: 'diary' as const,
    timestamp: '2026-03-01T08:00:00Z',
    farm_id: FARM_ID,
    farm_name: 'Test Farm',
    actor_id: USER_A,
    actor_name: 'Alice',
    deep_link: `/diary?farm=${FARM_ID}&entry=${DIARY_ID}`,
    diary_category: 'watering' as const,
    diary_entry_type: 'actual' as const,
    description: 'Watered the beds',
    bed_id: BED_ID,
    bed_name: 'A1',
  };
}

function makeDeviceItem() {
  return {
    id: `device:${DEVICE_ID}`,
    type: 'device' as const,
    timestamp: '2026-02-15T12:00:00Z',
    farm_id: FARM_ID,
    farm_name: 'Test Farm',
    actor_id: USER_A,
    actor_name: 'Alice',
    deep_link: `/devices?farm=${FARM_ID}&device=${DEVICE_ID}`,
    device_id: DEVICE_ID,
    node_name: 'Pi-Cam-1',
    bed_id: BED_ID,
    bed_name: 'A1',
  };
}

function makeImageItem() {
  return {
    id: `image:${IMAGE_ID}`,
    type: 'image' as const,
    timestamp: '2026-03-10T06:00:00Z',
    farm_id: FARM_ID,
    farm_name: 'Test Farm',
    actor_id: USER_A,
    actor_name: 'Alice',
    deep_link: `/beds/${BED_ID}?image=${IMAGE_ID}`,
    image_id: IMAGE_ID,
    bed_id: BED_ID,
    bed_name: 'A1',
    trigger: 'scheduled' as const,
    thumbnail_key: null,
  };
}

function emptyFeedResult() {
  return { items: [], nextCursor: null, totalCount: 0 };
}

// ── Setup ─────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

// ── I1: user with no activity → empty items + null cursor ─────────

describe('I1 — GET /api/v1/me/activity: empty state', () => {
  it('returns 200 with empty items array and null cursor when user has no activity', async () => {
    mockRepo.getActivityForUser.mockResolvedValue(emptyFeedResult());

    const res = await app.request('/api/v1/me/activity', { headers: authHeaders() });
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.items).toEqual([]);
    expect(body.next_cursor).toBeNull();
    expect(body.total_count).toBe(0);
  });

  it('returns 401 when no auth token is provided', async () => {
    const res = await app.request('/api/v1/me/activity');
    expect(res.status).toBe(401);
  });
});

// ── I2: user with diary entries only ─────────────────────────────

describe('I2 — GET /api/v1/me/activity: diary-only source', () => {
  it('returns only diary items when user has no devices or images', async () => {
    const diaryItem = makeDiaryItem();
    mockRepo.getActivityForUser.mockResolvedValue({
      items: [diaryItem],
      nextCursor: null,
      totalCount: 1,
    });

    const res = await app.request('/api/v1/me/activity', { headers: authHeaders() });
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    const items = body.items as Array<Record<string, unknown>>;
    expect(items).toHaveLength(1);
    expect(items[0].type).toBe('diary');
    expect(items[0].id).toBe(`diary:${DIARY_ID}`);
    expect(items[0].diary_category).toBe('watering');
  });
});

// ── I3: user with mixed diary + device + image ────────────────────

describe('I3 — GET /api/v1/me/activity: three-way merge', () => {
  it('returns all three item types ordered newest-first', async () => {
    const diaryItem = makeDiaryItem();   // ts: 2026-03-01
    const imageItem = makeImageItem();   // ts: 2026-03-10 (newest)
    const deviceItem = makeDeviceItem(); // ts: 2026-02-15 (oldest)

    mockRepo.getActivityForUser.mockResolvedValue({
      items: [imageItem, diaryItem, deviceItem], // repo already sorted
      nextCursor: null,
      totalCount: 3,
    });

    const res = await app.request('/api/v1/me/activity', { headers: authHeaders() });
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    const items = body.items as Array<Record<string, unknown>>;
    expect(items).toHaveLength(3);
    expect(items[0].type).toBe('image');
    expect(items[1].type).toBe('diary');
    expect(items[2].type).toBe('device');
    expect(body.total_count).toBe(3);
  });
});

// ── I4: Pi-auth reality — scheduled images from user-registered beds

describe('I4 — Pi-auth: user sees scheduled images from beds whose device they registered', () => {
  it('includes image items whose uploaded_by differs from the user (Pi shared-JWT case)', async () => {
    // The route itself doesn't decide attribution — the repository does.
    // This test verifies the route correctly exposes the image items that
    // the repository returns (i.e., no filtering happens at the route layer).
    const piImageItem = {
      ...makeImageItem(),
      // actor_id is still the registering user (USER_A) — the repo sets this
      actor_id: USER_A,
      trigger: 'scheduled' as const,
    };
    mockRepo.getActivityForUser.mockResolvedValue({
      items: [piImageItem],
      nextCursor: null,
      totalCount: 1,
    });

    const res = await app.request('/api/v1/me/activity', { headers: authHeaders() });
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    const items = body.items as Array<Record<string, unknown>>;
    expect(items).toHaveLength(1);
    expect(items[0].type).toBe('image');
    expect(items[0].trigger).toBe('scheduled');
    // The route must not strip or override actor_id
    expect(items[0].actor_id).toBe(USER_A);
  });
});

// ── I5: legacy-null non-leakage ──────────────────────────────────

describe('I5 — Legacy-null: null-attributed items are never returned', () => {
  it('returns empty items when repository excludes all legacy-null records', async () => {
    // Repository already filters null records out; route must not re-introduce them.
    mockRepo.getActivityForUser.mockResolvedValue(emptyFeedResult());

    const res = await app.request('/api/v1/me/activity', { headers: authHeaders() });
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.items).toEqual([]);
    expect(body.total_count).toBe(0);
  });
});

// ── I6: admin cannot see other users' activity ───────────────────

describe('I6 — Admin scope: activity endpoint is self-serve only', () => {
  it("returns the admin's own activity (not other users') when called with admin JWT", async () => {
    // The route always uses userId from the JWT, regardless of admin flag.
    const adminHeaders = makeAuthHeaders(ADMIN_USER_ID, ADMIN_EMAIL);
    mockRepo.getActivityForUser.mockResolvedValue(emptyFeedResult());

    const res = await app.request('/api/v1/me/activity', { headers: adminHeaders });
    expect(res.status).toBe(200);
    // Critically: getActivityForUser must be called with ADMIN_USER_ID, not any other user.
    expect(mockRepo.getActivityForUser).toHaveBeenCalledWith(
      ADMIN_USER_ID,
      expect.any(Number),
      undefined,
    );
  });

  it('passes the authenticated userId to the repository — never a query-param userId', async () => {
    mockRepo.getActivityForUser.mockResolvedValue(emptyFeedResult());

    // Attempt to inject a different userId via query string (should be ignored)
    const res = await app.request(
      `/api/v1/me/activity?userId=${USER_B}`,
      { headers: authHeaders() },
    );
    expect(res.status).toBe(200);
    // Must still be called with USER_A (from JWT), not USER_B
    expect(mockRepo.getActivityForUser).toHaveBeenCalledWith(
      USER_A,
      expect.any(Number),
      undefined,
    );
  });
});

// ── I7: paging — first page, second page, null cursor on last ─────

describe('I7 — Paging: cursor-based pagination contract', () => {
  it('first page returns next_cursor when more items exist', async () => {
    const cursor = encodeActivityCursor({
      user_id: USER_A,
      ts: makeDiaryItem().timestamp,
      type: 'diary',
      id: makeDiaryItem().id,
    });
    mockRepo.getActivityForUser.mockResolvedValue({
      items: [makeDiaryItem()],
      nextCursor: cursor,
      totalCount: 5,
    });

    const res = await app.request('/api/v1/me/activity?limit=1', { headers: authHeaders() });
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.next_cursor).not.toBeNull();
    expect(typeof body.next_cursor).toBe('string');
    expect(body.total_count).toBe(5);
  });

  it('subsequent page uses cursor query param and returns different items', async () => {
    const cursor = encodeActivityCursor({
      user_id: USER_A,
      ts: '2026-03-01T08:00:00Z',
      type: 'diary',
      id: `diary:${DIARY_ID}`,
    });
    const page2DeviceItem = makeDeviceItem();
    mockRepo.getActivityForUser.mockResolvedValue({
      items: [page2DeviceItem],
      nextCursor: null,
      totalCount: 2,
    });

    const res = await app.request(
      `/api/v1/me/activity?limit=1&cursor=${encodeURIComponent(cursor)}`,
      { headers: authHeaders() },
    );
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    const items = body.items as Array<Record<string, unknown>>;
    expect(items[0].type).toBe('device');
    expect(body.next_cursor).toBeNull();
    // cursor was forwarded to the repository
    expect(mockRepo.getActivityForUser).toHaveBeenCalledWith(USER_A, 1, cursor);
  });

  it('final page returns null next_cursor', async () => {
    mockRepo.getActivityForUser.mockResolvedValue({
      items: [makeDeviceItem()],
      nextCursor: null,
      totalCount: 1,
    });

    const res = await app.request('/api/v1/me/activity', { headers: authHeaders() });
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.next_cursor).toBeNull();
  });
});

// ── I8: cursor cross-user rejection ──────────────────────────────

describe('I8 — Cursor cross-user rejection: cursor from user A rejected by user B', () => {
  it('returns 400 when the cursor was minted for a different user', async () => {
    // Create a cursor for USER_A, then present it as USER_B.
    const cursorForA = encodeActivityCursor({
      user_id: USER_A,
      ts: '2026-03-01T08:00:00Z',
      type: 'diary',
      id: 'diary:abc',
    });

    // Simulate the repository throwing ValidationException on cross-user cursor.
    mockRepo.getActivityForUser.mockRejectedValue(
      Object.assign(new Error('Invalid cursor: user mismatch'), { name: 'ValidationException' }),
    );

    const userBHeaders = makeAuthHeaders(USER_B);
    const res = await app.request(
      `/api/v1/me/activity?cursor=${encodeURIComponent(cursorForA)}`,
      { headers: userBHeaders },
    );
    expect(res.status).toBe(400);
    const body = await res.json() as Record<string, unknown>;
    // The route maps ValidationException → ValidationError → 400
    expect(body).toHaveProperty('error');
  });
});

// ── I9: limit parameter is bounded (max 100) ─────────────────────

describe('I9 — Limit cap: ?limit= parameter is bounded', () => {
  it('returns 400 when limit exceeds 100', async () => {
    const res = await app.request('/api/v1/me/activity?limit=99999', { headers: authHeaders() });
    expect(res.status).toBe(400);
  });

  it('returns 400 when limit is 0', async () => {
    const res = await app.request('/api/v1/me/activity?limit=0', { headers: authHeaders() });
    expect(res.status).toBe(400);
  });

  it('returns 400 when limit is negative', async () => {
    const res = await app.request('/api/v1/me/activity?limit=-5', { headers: authHeaders() });
    expect(res.status).toBe(400);
  });

  it('accepts limit=100 (upper boundary)', async () => {
    mockRepo.getActivityForUser.mockResolvedValue(emptyFeedResult());
    const res = await app.request('/api/v1/me/activity?limit=100', { headers: authHeaders() });
    expect(res.status).toBe(200);
    expect(mockRepo.getActivityForUser).toHaveBeenCalledWith(USER_A, 100, undefined);
  });

  it('accepts limit=1 (lower boundary)', async () => {
    mockRepo.getActivityForUser.mockResolvedValue(emptyFeedResult());
    const res = await app.request('/api/v1/me/activity?limit=1', { headers: authHeaders() });
    expect(res.status).toBe(200);
    expect(mockRepo.getActivityForUser).toHaveBeenCalledWith(USER_A, 1, undefined);
  });

  it('defaults to limit=20 when not provided', async () => {
    mockRepo.getActivityForUser.mockResolvedValue(emptyFeedResult());
    const res = await app.request('/api/v1/me/activity', { headers: authHeaders() });
    expect(res.status).toBe(200);
    expect(mockRepo.getActivityForUser).toHaveBeenCalledWith(USER_A, 20, undefined);
  });
});

// ── I10: response shape validates against Zod schema ─────────────

describe('I10 — Response shape contract: Zod validation on live response', () => {
  it('all-types response passes ActivityFeedResponseSchema', async () => {
    mockRepo.getActivityForUser.mockResolvedValue({
      items: [makeImageItem(), makeDiaryItem(), makeDeviceItem()],
      nextCursor: null,
      totalCount: 3,
    });

    const res = await app.request('/api/v1/me/activity', { headers: authHeaders() });
    expect(res.status).toBe(200);
    const body = await res.json();
    // Map next_cursor from response envelope for Zod (route emits next_cursor field)
    const result = ActivityFeedResponseSchema.safeParse(body);
    expect(result.success).toBe(true);
  });

  it('empty response passes ActivityFeedResponseSchema', async () => {
    mockRepo.getActivityForUser.mockResolvedValue(emptyFeedResult());

    const res = await app.request('/api/v1/me/activity', { headers: authHeaders() });
    expect(res.status).toBe(200);
    const body = await res.json();
    const result = ActivityFeedResponseSchema.safeParse(body);
    expect(result.success).toBe(true);
  });
});

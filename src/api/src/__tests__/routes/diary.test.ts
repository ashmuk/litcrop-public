import { TEST_USER_ID, authHeaders, makeAuthHeaders } from '../helpers/auth';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundError } from '../../errors';

// Set ADMIN_EMAILS before auth module loads (ADMIN_EMAILS_SET is cached at module level)
vi.hoisted(() => {
  process.env['ADMIN_EMAILS'] = 'admin@litcrop.test';
});

import app from '../../app';
import { dynamoRepo } from '../../services/dynamodb';

vi.mock('../../services/dynamodb', () => ({
  dynamoRepo: {
    getFarm: vi.fn(),
    getFarmMembership: vi.fn(),
    getBedById: vi.fn(),
    getImageById: vi.fn(),
    createDiaryEntry: vi.fn(),
    getDiaryEntries: vi.fn(),
    getDiaryEntryById: vi.fn(),
    updateDiaryEntry: vi.fn(),
    deleteDiaryEntry: vi.fn(),
    updateBed: vi.fn(),
    getUserProfile: vi.fn(),
  },
}));

const mockRepo = vi.mocked(dynamoRepo);

// ── Fixtures ──────────────────────────────────────────────────────

const FARM_ID = 'farm-test-001';
const ENTRY_ID = 'entry-uuid-001';
const BED_ID = 'a1a1a1a1-0000-0000-0000-000000000001';

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
};

const membershipFixture = {
  user_id: TEST_USER_ID,
  farm_id: FARM_ID,
  role: 'owner' as const,
  joined_at: '2026-04-01T00:00:00Z',
};

const staffMembershipFixture = {
  ...membershipFixture,
  role: 'staff' as const,
};

const bedFixture = {
  id: BED_ID,
  farm_id: FARM_ID,
  row: 1,
  col: 1,
  name: 'A1',
  crop_type: 'tomato',
  latest_status: 'healthy' as const,
  created_at: '2026-04-01T00:00:00Z',
};

const entryFixture = {
  id: ENTRY_ID,
  farm_id: FARM_ID,
  date: '2026-04-03',
  category: 'planting' as const,
  description: 'Planted tomato seedlings',
  time_spent_minutes: 45,
  bed_id: BED_ID,
  photo_ids: [],
  costs: [{ item: 'Seedlings', amount: 500, currency: 'JPY' as const }],
  created_by: TEST_USER_ID,
  created_at: '2026-04-03T09:00:00Z',
  updated_at: '2026-04-03T09:00:00Z',
};

// ── Default mock setup ────────────────────────────────────────────

beforeEach(() => {
  vi.resetAllMocks();
  mockRepo.getFarm.mockResolvedValue(farmFixture);
  mockRepo.getFarmMembership.mockResolvedValue(membershipFixture);
  mockRepo.getBedById.mockResolvedValue(bedFixture);
  mockRepo.createDiaryEntry.mockResolvedValue(entryFixture);
  mockRepo.getDiaryEntries.mockResolvedValue({ items: [entryFixture], nextCursor: null });
  mockRepo.getDiaryEntryById.mockResolvedValue(entryFixture);
  mockRepo.updateDiaryEntry.mockResolvedValue(entryFixture);
  mockRepo.deleteDiaryEntry.mockResolvedValue(undefined);
  mockRepo.getUserProfile.mockResolvedValue({ user_id: TEST_USER_ID, display_name: 'Test Farmer', preferred_role: 'staff', created_at: '2026-04-01T00:00:00Z' });
});

// ── POST /api/v1/farms/:farmId/diary ─────────────────────────────

describe('POST /api/v1/farms/:farmId/diary', () => {
  it('creates entry with valid data → 201 with bed_name and cost_total', async () => {
    const res = await app.request(`/api/v1/farms/${FARM_ID}/diary`, {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: '2026-04-03',
        category: 'planting',
        description: 'Planted tomato seedlings',
        bed_id: BED_ID,
        time_spent_minutes: 45,
        costs: [{ item: 'Seedlings', amount: 500, currency: 'JPY' }],
      }),
    });

    expect(res.status).toBe(201);
    const body = await res.json() as Record<string, unknown>;
    expect(body['id']).toBeDefined();
    expect(body['bed_name']).toBe('A1');
    expect(body['cost_total']).toBe(500);
    expect(body['category']).toBe('planting');
    expect(body['created_by_name']).toBe('Test Farmer');
  });

  it('validates required fields — omitting category → 400', async () => {
    const res = await app.request(`/api/v1/farms/${FARM_ID}/diary`, {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: '2026-04-03',
        description: 'Missing category',
      }),
    });

    expect(res.status).toBe(400);
  });

  it('accepts future date for crop planning → 201', async () => {
    const res = await app.request(`/api/v1/farms/${FARM_ID}/diary`, {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: '2099-01-01',
        category: 'planting',
        description: 'Future planting plan',
      }),
    });

    expect(res.status).toBe(201);
  });

  it('rejects date with year out of range (9999) → 400', async () => {
    const res = await app.request(`/api/v1/farms/${FARM_ID}/diary`, {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: '9999-01-01',
        category: 'planting',
        description: 'Unreasonable year',
      }),
    });

    expect(res.status).toBe(400);
  });

  it('rejects impossible calendar date (month 13) → 400', async () => {
    const res = await app.request(`/api/v1/farms/${FARM_ID}/diary`, {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: '2026-13-01',
        category: 'planting',
        description: 'Impossible date',
      }),
    });

    expect(res.status).toBe(400);
  });

  it('validates bed belongs to same farm → 404 when bed has different farm_id', async () => {
    mockRepo.getBedById.mockResolvedValue({ ...bedFixture, farm_id: 'other-farm' });

    const res = await app.request(`/api/v1/farms/${FARM_ID}/diary`, {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: '2026-04-03',
        category: 'planting',
        description: 'Test',
        bed_id: BED_ID,
      }),
    });

    expect(res.status).toBe(400);
  });

  it('rejects non-member → 404', async () => {
    mockRepo.getFarmMembership.mockResolvedValue(null);

    const res = await app.request(`/api/v1/farms/${FARM_ID}/diary`, {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: '2026-04-03',
        category: 'planting',
        description: 'Test',
      }),
    });

    expect(res.status).toBe(404);
  });

  // MF-4 #1: DDB error on create → 503
  it('returns 503 when DynamoDB create fails', async () => {
    mockRepo.createDiaryEntry.mockRejectedValue(new Error('DDB down'));

    const res = await app.request(`/api/v1/farms/${FARM_ID}/diary`, {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: '2026-04-03',
        category: 'planting',
        description: 'DDB failure test',
      }),
    });

    expect(res.status).toBe(503);
  });

  // MF-4 #2: photo from different farm → 400
  it('rejects photo from different farm', async () => {
    const IMAGE_ID = 'image-uuid-001';
    mockRepo.getImageById.mockResolvedValue({
      id: IMAGE_ID,
      bed_id: BED_ID,
      node_id: 'cam-01',
      captured_at: '2026-04-01T00:00:00.000Z',
      uploaded_at: '2026-04-01T00:00:00.000Z',
      storage_key: `images/${FARM_ID}/${BED_ID}/${IMAGE_ID}.jpg`,
      trigger: 'scheduled',
      content_type: 'image/jpeg',
      size_bytes: 12345,
    });
    // Override getBedById for the image's bed resolution to return a bed from a different farm
    mockRepo.getBedById.mockResolvedValue({ ...bedFixture, farm_id: 'other-farm' });

    const res = await app.request(`/api/v1/farms/${FARM_ID}/diary`, {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: '2026-04-03',
        category: 'planting',
        description: 'Photo cross-farm test',
        photo_ids: [IMAGE_ID],
      }),
    });

    expect(res.status).toBe(400);
  });
});

// ── GET /api/v1/farms/:farmId/diary ──────────────────────────────

describe('GET /api/v1/farms/:farmId/diary', () => {
  it('lists entries with default date range → 200 with data array and meta', async () => {
    const res = await app.request(`/api/v1/farms/${FARM_ID}/diary`, {
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const body = await res.json() as { data: unknown[]; meta: Record<string, unknown> };
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.meta).toBeDefined();
    expect(body.meta['count']).toBe(1);
    expect(body.meta['next_cursor']).toBeNull();
  });

  it('accepts custom date range → passes from/to to getDiaryEntries', async () => {
    const res = await app.request(
      `/api/v1/farms/${FARM_ID}/diary?from=2026-04-01&to=2026-04-15`,
      { headers: authHeaders() },
    );

    expect(res.status).toBe(200);
    expect(mockRepo.getDiaryEntries).toHaveBeenCalledWith(
      FARM_ID,
      '2026-04-01',
      '2026-04-15',
      expect.any(Number),
      undefined,
    );
  });

  it('rejects date range > 366 days → 400', async () => {
    const res = await app.request(
      `/api/v1/farms/${FARM_ID}/diary?from=2025-01-01&to=2026-12-31`,
      { headers: authHeaders() },
    );

    expect(res.status).toBe(400);
  });

  // MF-4 #3: invalid cursor → 400
  it('returns 400 for invalid cursor', async () => {
    const err = new Error('Invalid cursor token');
    err.name = 'ValidationException';
    mockRepo.getDiaryEntries.mockRejectedValue(err);

    const res = await app.request(
      `/api/v1/farms/${FARM_ID}/diary?cursor=badcursor`,
      { headers: authHeaders() },
    );

    expect(res.status).toBe(400);
  });
});

// ── GET /api/v1/farms/:farmId/diary/:entryId ─────────────────────

describe('GET /api/v1/farms/:farmId/diary/:entryId', () => {
  it('returns single entry → 200 with bed_name and cost_total', async () => {
    const res = await app.request(`/api/v1/farms/${FARM_ID}/diary/${ENTRY_ID}`, {
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body['id']).toBe(ENTRY_ID);
    expect(body['bed_name']).toBe('A1');
    expect(body['cost_total']).toBe(500);
    expect(body['created_by_name']).toBe('Test Farmer');
  });

  it('returns created_by_name as null when user has no profile', async () => {
    mockRepo.getUserProfile.mockResolvedValue(null);

    const res = await app.request(`/api/v1/farms/${FARM_ID}/diary/${ENTRY_ID}`, {
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body['created_by_name']).toBeNull();
  });

  it('IDOR guard: rejects entry from different farm → 404', async () => {
    mockRepo.getDiaryEntryById.mockResolvedValue({ ...entryFixture, farm_id: 'other-farm' });

    const res = await app.request(`/api/v1/farms/${FARM_ID}/diary/${ENTRY_ID}`, {
      headers: authHeaders(),
    });

    expect(res.status).toBe(404);
  });

  it('returns 404 for non-existent entry', async () => {
    mockRepo.getDiaryEntryById.mockResolvedValue(null);

    const res = await app.request(`/api/v1/farms/${FARM_ID}/diary/${ENTRY_ID}`, {
      headers: authHeaders(),
    });

    expect(res.status).toBe(404);
  });

  // SF-3: deleted bed → null bed_name
  it('returns null bed_name when bed is deleted', async () => {
    mockRepo.getDiaryEntryById.mockResolvedValue({ ...entryFixture, bed_id: BED_ID });
    mockRepo.getBedById.mockRejectedValue(new NotFoundError('Bed not found'));

    const res = await app.request(`/api/v1/farms/${FARM_ID}/diary/${ENTRY_ID}`, {
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body['bed_name']).toBeNull();
  });

  // SG-2: multiple cost items → correct cost_total
  it('calculates cost_total with multiple cost items', async () => {
    mockRepo.getDiaryEntryById.mockResolvedValue({
      ...entryFixture,
      bed_id: null,
      costs: [
        { item: 'A', amount: 100, currency: 'JPY' as const },
        { item: 'B', amount: 250, currency: 'JPY' as const },
      ],
    });

    const res = await app.request(`/api/v1/farms/${FARM_ID}/diary/${ENTRY_ID}`, {
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body['cost_total']).toBe(350);
  });

  // SG-2: empty costs array → cost_total 0
  it('returns cost_total 0 with empty costs', async () => {
    mockRepo.getDiaryEntryById.mockResolvedValue({
      ...entryFixture,
      bed_id: null,
      costs: [],
    });

    const res = await app.request(`/api/v1/farms/${FARM_ID}/diary/${ENTRY_ID}`, {
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body['cost_total']).toBe(0);
  });
});

// ── PATCH /api/v1/farms/:farmId/diary/:entryId ───────────────────

describe('PATCH /api/v1/farms/:farmId/diary/:entryId', () => {
  it('updates entry as owner → 200', async () => {
    const updated = { ...entryFixture, description: 'Updated description' };
    mockRepo.updateDiaryEntry.mockResolvedValue(updated);

    const res = await app.request(`/api/v1/farms/${FARM_ID}/diary/${ENTRY_ID}`, {
      method: 'PATCH',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: 'Updated description' }),
    });

    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body['description']).toBe('Updated description');
  });

  it('rejects staff updating another user\'s entry → 404', async () => {
    const otherUserId = 'other-user-sub-999';
    mockRepo.getFarmMembership.mockResolvedValue(staffMembershipFixture);
    // Entry was created by someone else
    mockRepo.getDiaryEntryById.mockResolvedValue({ ...entryFixture, created_by: otherUserId });

    const res = await app.request(`/api/v1/farms/${FARM_ID}/diary/${ENTRY_ID}`, {
      method: 'PATCH',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: 'Attempted update' }),
    });

    expect(res.status).toBe(404);
  });

  it('platform admin can update another user entry (governance access)', async () => {
    const adminSub = 'admin-sub';
    const adminEmail = 'admin@litcrop.test';
    mockRepo.getDiaryEntryById.mockResolvedValue({ ...entryFixture, created_by: 'other-user' });
    mockRepo.updateDiaryEntry.mockResolvedValue({ ...entryFixture, created_by: 'other-user', description: 'Admin update' });

    const res = await app.request(`/api/v1/farms/${FARM_ID}/diary/${ENTRY_ID}`, {
      method: 'PATCH',
      headers: { ...makeAuthHeaders(adminSub, adminEmail), 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: 'Admin update' }),
    });

    expect(res.status).toBe(200);
  });

  it('IDOR guard on PATCH: entry.farm_id !== farmId → 404', async () => {
    mockRepo.getDiaryEntryById.mockResolvedValue({ ...entryFixture, farm_id: 'other-farm' });

    const res = await app.request(`/api/v1/farms/${FARM_ID}/diary/${ENTRY_ID}`, {
      method: 'PATCH',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: 'IDOR attempt' }),
    });

    expect(res.status).toBe(404);
  });

  // SF-4: staff can update own entry
  it('allows staff to update own entry', async () => {
    mockRepo.getFarmMembership.mockResolvedValue(staffMembershipFixture);
    // entry.created_by === TEST_USER_ID (same user as auth)
    mockRepo.getDiaryEntryById.mockResolvedValue({ ...entryFixture, created_by: TEST_USER_ID });
    const updated = { ...entryFixture, description: 'Staff self-update', created_by: TEST_USER_ID };
    mockRepo.updateDiaryEntry.mockResolvedValue(updated);

    const res = await app.request(`/api/v1/farms/${FARM_ID}/diary/${ENTRY_ID}`, {
      method: 'PATCH',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: 'Staff self-update' }),
    });

    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body['description']).toBe('Staff self-update');
  });
});

// ── DELETE /api/v1/farms/:farmId/diary/:entryId ──────────────────

describe('DELETE /api/v1/farms/:farmId/diary/:entryId', () => {
  it('deletes own entry → 204', async () => {
    const res = await app.request(`/api/v1/farms/${FARM_ID}/diary/${ENTRY_ID}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });

    expect(res.status).toBe(204);
    expect(mockRepo.deleteDiaryEntry).toHaveBeenCalledWith(FARM_ID, ENTRY_ID, entryFixture.date);
  });

  it('rejects staff deleting another user\'s entry → 404', async () => {
    const otherUserId = 'other-user-sub-999';
    mockRepo.getFarmMembership.mockResolvedValue(staffMembershipFixture);
    mockRepo.getDiaryEntryById.mockResolvedValue({ ...entryFixture, created_by: otherUserId });

    const res = await app.request(`/api/v1/farms/${FARM_ID}/diary/${ENTRY_ID}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });

    expect(res.status).toBe(404);
  });

  it('allows owner to delete any entry → 204', async () => {
    // Entry was created by a different user but owner can delete
    mockRepo.getDiaryEntryById.mockResolvedValue({ ...entryFixture, created_by: 'other-user' });

    const res = await app.request(`/api/v1/farms/${FARM_ID}/diary/${ENTRY_ID}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });

    expect(res.status).toBe(204);
  });

  it('IDOR guard on DELETE: entry.farm_id !== farmId → 404', async () => {
    mockRepo.getDiaryEntryById.mockResolvedValue({ ...entryFixture, farm_id: 'other-farm' });

    const res = await app.request(`/api/v1/farms/${FARM_ID}/diary/${ENTRY_ID}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });

    expect(res.status).toBe(404);
  });

  // SF-4: staff can delete own entry
  it('allows staff to delete own entry', async () => {
    mockRepo.getFarmMembership.mockResolvedValue(staffMembershipFixture);
    // entry.created_by === TEST_USER_ID (same user as auth)
    mockRepo.getDiaryEntryById.mockResolvedValue({ ...entryFixture, created_by: TEST_USER_ID });

    const res = await app.request(`/api/v1/farms/${FARM_ID}/diary/${ENTRY_ID}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });

    expect(res.status).toBe(204);
  });

  it('platform admin can delete another user entry (governance access)', async () => {
    mockRepo.getDiaryEntryById.mockResolvedValue({ ...entryFixture, created_by: 'other-user' });
    mockRepo.deleteDiaryEntry.mockResolvedValue(undefined);

    const res = await app.request(`/api/v1/farms/${FARM_ID}/diary/${ENTRY_ID}`, {
      method: 'DELETE',
      headers: makeAuthHeaders('admin-sub', 'admin@litcrop.test'),
    });

    expect(res.status).toBe(204);
  });
});

// ── #273 Diary → Bed Bridge Tests ──────────────────────────────────

describe('diary→bed bridge (#273)', () => {
  beforeEach(() => {
    mockRepo.updateBed.mockResolvedValue(undefined);
    mockRepo.getUserProfile.mockResolvedValue(null);
  });

  it('POST planting entry with bed_id → sets bed planted_at', async () => {
    mockRepo.createDiaryEntry.mockResolvedValue({ ...entryFixture, category: 'planting', date: '2026-04-10' });

    const res = await app.request(`/api/v1/farms/${FARM_ID}/diary`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({
        date: '2026-04-10',
        category: 'planting',
        description: 'Planted tomatoes',
        bed_id: BED_ID,
      }),
    });
    expect(res.status).toBe(201);
    expect(mockRepo.updateBed).toHaveBeenCalledWith(
      FARM_ID, BED_ID, bedFixture.row, bedFixture.col,
      { planted_at: '2026-04-10' },
    );
  });

  it('POST harvesting entry with bed_id → sets bed expected_harvest', async () => {
    mockRepo.createDiaryEntry.mockResolvedValue({ ...entryFixture, category: 'harvesting', date: '2026-07-15' });

    const res = await app.request(`/api/v1/farms/${FARM_ID}/diary`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({
        date: '2026-07-15',
        category: 'harvesting',
        description: 'First harvest',
        bed_id: BED_ID,
      }),
    });
    expect(res.status).toBe(201);
    expect(mockRepo.updateBed).toHaveBeenCalledWith(
      FARM_ID, BED_ID, bedFixture.row, bedFixture.col,
      { expected_harvest: '2026-07-15' },
    );
  });

  it('POST watering entry with bed_id → no bed update', async () => {
    mockRepo.createDiaryEntry.mockResolvedValue({ ...entryFixture, category: 'watering' });

    const res = await app.request(`/api/v1/farms/${FARM_ID}/diary`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({
        date: '2026-04-05',
        category: 'watering',
        description: 'Watered beds',
        bed_id: BED_ID,
      }),
    });
    expect(res.status).toBe(201);
    expect(mockRepo.updateBed).not.toHaveBeenCalled();
  });

  it('POST planting entry without bed_id → no bed update', async () => {
    mockRepo.createDiaryEntry.mockResolvedValue({ ...entryFixture, bed_id: null });

    const res = await app.request(`/api/v1/farms/${FARM_ID}/diary`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({
        date: '2026-04-05',
        category: 'planting',
        description: 'General planting note',
      }),
    });
    expect(res.status).toBe(201);
    expect(mockRepo.updateBed).not.toHaveBeenCalled();
  });

  it('PATCH planting entry date → syncs bed planted_at', async () => {
    mockRepo.getDiaryEntryById.mockResolvedValue(entryFixture);
    mockRepo.updateDiaryEntry.mockResolvedValue({ ...entryFixture, date: '2026-04-12' });

    const res = await app.request(`/api/v1/farms/${FARM_ID}/diary/${ENTRY_ID}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ date: '2026-04-12' }),
    });
    expect(res.status).toBe(200);
    expect(mockRepo.updateBed).toHaveBeenCalledWith(
      FARM_ID, BED_ID, bedFixture.row, bedFixture.col,
      { planted_at: '2026-04-12' },
    );
  });

  it('DELETE planting entry with bed_id → clears bed planted_at', async () => {
    mockRepo.getDiaryEntryById.mockResolvedValue(entryFixture);
    mockRepo.deleteDiaryEntry.mockResolvedValue(undefined);

    const res = await app.request(`/api/v1/farms/${FARM_ID}/diary/${ENTRY_ID}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    expect(res.status).toBe(204);
    expect(mockRepo.updateBed).toHaveBeenCalledWith(
      FARM_ID, BED_ID, bedFixture.row, bedFixture.col,
      { planted_at: null },
    );
  });

  it('bed update failure does not fail diary creation (non-blocking)', async () => {
    mockRepo.createDiaryEntry.mockResolvedValue(entryFixture);
    mockRepo.updateBed.mockRejectedValue(new Error('DynamoDB timeout'));

    const res = await app.request(`/api/v1/farms/${FARM_ID}/diary`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({
        date: '2026-04-10',
        category: 'planting',
        description: 'Planted tomatoes',
        bed_id: BED_ID,
      }),
    });
    // Diary entry still created successfully despite bed update failure
    expect(res.status).toBe(201);
  });
});

import { TEST_USER_ID, authHeaders } from '../helpers/auth';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import app from '../../app';
import { dynamoRepo } from '../../services/dynamodb';
import { getSignedImageUrl } from '../../services/s3';
import { NotFoundError } from '../../errors';

vi.mock('../../services/dynamodb', () => ({
  dynamoRepo: {
    getFarm: vi.fn(),
    getFarmsForUser: vi.fn(),
    getFarmMembership: vi.fn(),
    addFarmMember: vi.fn(),
    createFarm: vi.fn(),
    updateFarm: vi.fn(),
    getBedsForFarm: vi.fn(),
    getLatestImageForBed: vi.fn(),
  },
}));

vi.mock('../../services/s3', () => ({
  getSignedImageUrl: vi.fn(),
  uploadImage: vi.fn(),
}));

const FARM_ID = 'f0000000-0000-0000-0000-000000000001';
const BED_ID = 'bd000000-0000-0000-0000-000000000001';

const farmFixture = {
  id: FARM_ID,
  user_id: TEST_USER_ID,
  name: 'Test Farm',
  description: undefined,
  latitude: 36.0,
  longitude: 138.3,
  locale: 'en' as const,
  theme: 'system' as const,
  grid_rows: 1,
  grid_cols: 1,
  created_at: '2026-03-17T00:00:00.000Z',
};

const membershipFixture = {
  user_id: TEST_USER_ID,
  farm_id: FARM_ID,
  role: 'manager' as const,
  joined_at: '2026-03-17T00:00:00.000Z',
  farm_name: 'Test Farm',
};

const bedFixture = {
  id: BED_ID,
  farm_id: FARM_ID,
  row: 1,
  col: 1,
  name: 'A1',
  crop_type: 'tomato',
  crop_variety: 'Cherry',
  latest_status: 'no_data' as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSignedImageUrl).mockResolvedValue('https://example.com/signed');
  // Default: user is a member of the test farm
  vi.mocked(dynamoRepo.getFarmMembership).mockResolvedValue(membershipFixture);
});

// ── GET /api/v1/farms ─────────────────────────────────────────────

describe('GET /api/v1/farms', () => {
  it('returns 200 with array containing the farm when found', async () => {
    vi.mocked(dynamoRepo.getFarmsForUser).mockResolvedValue([
      { user_id: TEST_USER_ID, farm_id: FARM_ID, role: 'manager', joined_at: '2026-03-17T00:00:00.000Z' },
    ]);
    vi.mocked(dynamoRepo.getFarm).mockResolvedValue(farmFixture);

    const res = await app.request('/api/v1/farms', { headers: authHeaders() });
    expect(res.status).toBe(200);
    const body = await res.json() as { data: unknown[] };
    expect(body.data).toHaveLength(1);
    expect((body.data[0] as Record<string, unknown>)['id']).toBe(FARM_ID);
  });

  it('returns 200 with empty array when user has no farms', async () => {
    vi.mocked(dynamoRepo.getFarmsForUser).mockResolvedValue([]);

    const res = await app.request('/api/v1/farms', { headers: authHeaders() });
    expect(res.status).toBe(200);
    const body = await res.json() as { data: unknown[] };
    expect(body.data).toHaveLength(0);
  });

  it('returns 401 when not authenticated', async () => {
    const res = await app.request('/api/v1/farms');
    expect(res.status).toBe(401);
  });
});

// ── GET /api/v1/farms/:farmId ─────────────────────────────────────

describe('GET /api/v1/farms/:farmId', () => {
  it('returns 200 with farm and empty beds', async () => {
    vi.mocked(dynamoRepo.getFarm).mockResolvedValue(farmFixture);
    vi.mocked(dynamoRepo.getBedsForFarm).mockResolvedValue([]);

    const res = await app.request(`/api/v1/farms/${FARM_ID}`, { headers: authHeaders() });
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body['id']).toBe(FARM_ID);
    expect(body['name']).toBe('Test Farm');
    expect(body['beds']).toEqual([]);
  });

  it('returns 404 when farm not found', async () => {
    vi.mocked(dynamoRepo.getFarm).mockRejectedValue(new NotFoundError('Farm not found'));
    const res = await app.request(`/api/v1/farms/${FARM_ID}`, { headers: authHeaders() });
    expect(res.status).toBe(404);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('returns flat beds array', async () => {
    vi.mocked(dynamoRepo.getFarm).mockResolvedValue(farmFixture);
    vi.mocked(dynamoRepo.getBedsForFarm).mockResolvedValue([bedFixture]);

    const res = await app.request(`/api/v1/farms/${FARM_ID}`, { headers: authHeaders() });
    expect(res.status).toBe(200);
    const body = await res.json() as { beds: Array<Record<string, unknown>> };
    expect(body.beds).toHaveLength(1);
    expect(body.beds[0]['id']).toBe(BED_ID);
    expect(body.beds[0]['name']).toBe('A1');
    expect(body.beds[0]['crop_type']).toBe('tomato');
  });

  it('returns bed with null fields when no crop assigned', async () => {
    vi.mocked(dynamoRepo.getFarm).mockResolvedValue(farmFixture);
    vi.mocked(dynamoRepo.getBedsForFarm).mockResolvedValue([
      { ...bedFixture, crop_type: undefined, crop_variety: undefined },
    ]);

    const res = await app.request(`/api/v1/farms/${FARM_ID}`, { headers: authHeaders() });
    const body = await res.json() as { beds: Array<Record<string, unknown>> };
    expect(body.beds[0]['crop_type']).toBeNull();
    expect(body.beds[0]['crop_variety']).toBeNull();
  });
});

// ── POST /api/v1/farms ────────────────────────────────────────────

describe('POST /api/v1/farms', () => {
  it('creates farm with valid body → 201', async () => {
    vi.mocked(dynamoRepo.createFarm).mockResolvedValue({
      ...farmFixture,
      name: 'New Farm',
    });

    const res = await app.request('/api/v1/farms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ name: 'New Farm', latitude: 36.0, longitude: 138.0 }),
    });
    expect(res.status).toBe(201);
    const body = await res.json() as { name: string };
    expect(body.name).toBe('New Farm');
  });

  it('returns 400 when name is missing', async () => {
    const res = await app.request('/api/v1/farms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ latitude: 36.0, longitude: 138.0 }),
    });
    expect(res.status).toBe(400);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when latitude out of range', async () => {
    const res = await app.request('/api/v1/farms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ name: 'Farm', latitude: 95, longitude: 138.0 }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 when longitude out of range', async () => {
    const res = await app.request('/api/v1/farms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ name: 'Farm', latitude: 36.0, longitude: 200 }),
    });
    expect(res.status).toBe(400);
  });
});

// ── PATCH /api/v1/farms/:farmId ───────────────────────────────────

describe('PATCH /api/v1/farms/:farmId', () => {
  it('updates farm with valid body → 200', async () => {
    vi.mocked(dynamoRepo.updateFarm).mockResolvedValue(undefined);
    // First call: ownership check; second call: re-fetch after update
    vi.mocked(dynamoRepo.getFarm).mockResolvedValue({ ...farmFixture, name: 'Renamed' });

    const res = await app.request(`/api/v1/farms/${FARM_ID}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ name: 'Renamed' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { name: string };
    expect(body.name).toBe('Renamed');
  });

  it('returns 400 when locale is invalid', async () => {
    vi.mocked(dynamoRepo.getFarm).mockResolvedValue(farmFixture);
    const res = await app.request(`/api/v1/farms/${FARM_ID}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ locale: 'zz' }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 404 when farm not found (updateFarm fails)', async () => {
    // Ownership check passes (farm exists with matching user_id)
    vi.mocked(dynamoRepo.getFarm).mockResolvedValueOnce(farmFixture);
    const err = new Error('ConditionalCheckFailedException');
    err.name = 'ConditionalCheckFailedException';
    vi.mocked(dynamoRepo.updateFarm).mockRejectedValue(err);

    const res = await app.request(`/api/v1/farms/${FARM_ID}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ name: 'New Name' }),
    });
    expect(res.status).toBe(404);
  });
});

// ── GET /api/v1/farms/:farmId/plots — now returns 410 Gone ──────

describe('GET /api/v1/farms/:farmId/plots', () => {
  it('returns 410 Gone', async () => {
    const res = await app.request(`/api/v1/farms/${FARM_ID}/plots`, { headers: authHeaders() });
    expect(res.status).toBe(410);
  });
});

// ── POST /api/v1/farms/:farmId/plots — now returns 410 Gone ─────

describe('POST /api/v1/farms/:farmId/plots', () => {
  it('returns 410 Gone', async () => {
    const res = await app.request(`/api/v1/farms/${FARM_ID}/plots`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ crop_type: 'tomato', crop_variety: 'Cherry' }),
    });
    expect(res.status).toBe(410);
  });
});

// ── POST /api/v1/farms/:farmId/members ───────────────────────────

describe('POST /api/v1/farms/:farmId/members', () => {
  const NEW_USER_ID = 'new-user-00000000000000000002';

  const addedMemberFixture = {
    user_id: NEW_USER_ID,
    farm_id: FARM_ID,
    role: 'observer' as const,
    joined_at: '2026-03-22T00:00:00.000Z',
  };

  it('adds a member with valid body → 201', async () => {
    vi.mocked(dynamoRepo.getFarm).mockResolvedValue(farmFixture);
    vi.mocked(dynamoRepo.addFarmMember).mockResolvedValue(addedMemberFixture);

    const res = await app.request(`/api/v1/farms/${FARM_ID}/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ user_id: NEW_USER_ID, role: 'observer' }),
    });
    expect(res.status).toBe(201);
    const body = await res.json() as { user_id: string; role: string };
    expect(body.user_id).toBe(NEW_USER_ID);
    expect(body.role).toBe('observer');
  });

  it('returns 409 when user is already a member', async () => {
    vi.mocked(dynamoRepo.getFarm).mockResolvedValue(farmFixture);
    const err = new Error('TransactionCanceledException');
    err.name = 'TransactionCanceledException';
    vi.mocked(dynamoRepo.addFarmMember).mockRejectedValue(err);

    const res = await app.request(`/api/v1/farms/${FARM_ID}/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ user_id: NEW_USER_ID, role: 'observer' }),
    });
    expect(res.status).toBe(409);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('CONFLICT');
  });

  it('returns 400 when role is invalid', async () => {
    vi.mocked(dynamoRepo.getFarm).mockResolvedValue(farmFixture);

    const res = await app.request(`/api/v1/farms/${FARM_ID}/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ user_id: NEW_USER_ID, role: 'superuser' }),
    });
    expect(res.status).toBe(400);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 404 when caller is not a member of the farm', async () => {
    vi.mocked(dynamoRepo.getFarm).mockResolvedValue(farmFixture);
    // getFarmMembership returns null → caller is not a member
    vi.mocked(dynamoRepo.getFarmMembership).mockResolvedValue(null);

    const res = await app.request(`/api/v1/farms/${FARM_ID}/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ user_id: NEW_USER_ID, role: 'observer' }),
    });
    expect(res.status).toBe(404);
  });

  it('returns 404 when caller has observer role (read-only, cannot add members)', async () => {
    vi.mocked(dynamoRepo.getFarm).mockResolvedValue(farmFixture);
    vi.mocked(dynamoRepo.getFarmMembership).mockResolvedValue({
      user_id: TEST_USER_ID,
      farm_id: FARM_ID,
      role: 'observer' as const,
      joined_at: '2026-03-17T00:00:00.000Z',
    });

    const res = await app.request(`/api/v1/farms/${FARM_ID}/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ user_id: NEW_USER_ID, role: 'observer' }),
    });
    expect(res.status).toBe(404);
  });
});

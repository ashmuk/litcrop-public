import { TEST_USER_ID, authHeaders, makeAuthHeaders } from '../helpers/auth';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Set ADMIN_EMAILS before auth module loads (ADMIN_EMAILS_SET is cached at module level)
const ADMIN_EMAIL = 'admin@litcrop.test';
const ADMIN_USER_ID = 'admin-cognito-sub-999';
vi.hoisted(() => {
  process.env['ADMIN_EMAILS'] = 'admin@litcrop.test';
});

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
    removeFarmMember: vi.fn(),
    getFarmMembers: vi.fn(),
    countUserMemberships: vi.fn(),
    createFarm: vi.fn(),
    updateFarm: vi.fn(),
    deleteFarm: vi.fn(),
    getBedsForFarm: vi.fn(),
    getLatestImageForBed: vi.fn(),
    getUserProfile: vi.fn(),
    getAllFarms: vi.fn(),
    getUserSettings: vi.fn(),
    upsertUserSettings: vi.fn(),
    createJoinRequest: vi.fn(),
    getJoinRequest: vi.fn(),
    getJoinRequestsForFarm: vi.fn(),
    approveJoinRequest: vi.fn(),
    rejectJoinRequest: vi.fn(),
    createBedsForPositions: vi.fn(),
    updateMemberRole: vi.fn(),
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
  role: 'owner' as const,
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
  // Default: user has no farms (under free plan limit)
  vi.mocked(dynamoRepo.getFarmsForUser).mockResolvedValue([]);
  // Default: target user has 0 memberships (under free plan limit)
  vi.mocked(dynamoRepo.countUserMemberships).mockResolvedValue(0);
  // Default: user has no profile stored
  vi.mocked(dynamoRepo.getUserProfile).mockResolvedValue(null);
});

// ── GET /api/v1/farms ─────────────────────────────────────────────

describe('GET /api/v1/farms', () => {
  it('returns 200 with array containing the farm when found', async () => {
    vi.mocked(dynamoRepo.getFarmsForUser).mockResolvedValue([
      { user_id: TEST_USER_ID, farm_id: FARM_ID, role: 'owner', joined_at: '2026-03-17T00:00:00.000Z' },
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

  it('returns 400 when user is at farm creation limit', async () => {
    vi.mocked(dynamoRepo.getFarmsForUser).mockResolvedValue([
      { user_id: TEST_USER_ID, farm_id: 'farm-1', role: 'admin', joined_at: '2026-03-17T00:00:00.000Z' },
      { user_id: TEST_USER_ID, farm_id: 'farm-2', role: 'admin', joined_at: '2026-03-18T00:00:00.000Z' },
    ]);

    const res = await app.request('/api/v1/farms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ name: 'Third Farm', latitude: 36.0, longitude: 138.0 }),
    });
    expect(res.status).toBe(400);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('VALIDATION_ERROR');
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
    role: 'staff' as const,
    joined_at: '2026-03-22T00:00:00.000Z',
  };

  it('adds a member with valid body → 201', async () => {
    vi.mocked(dynamoRepo.getFarm).mockResolvedValue(farmFixture);
    vi.mocked(dynamoRepo.addFarmMember).mockResolvedValue(addedMemberFixture);

    const res = await app.request(`/api/v1/farms/${FARM_ID}/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ user_id: NEW_USER_ID, role: 'staff' }),
    });
    expect(res.status).toBe(201);
    const body = await res.json() as { user_id: string; role: string };
    expect(body.user_id).toBe(NEW_USER_ID);
    expect(body.role).toBe('staff');
  });

  it('returns 409 when user is already a member', async () => {
    vi.mocked(dynamoRepo.getFarm).mockResolvedValue(farmFixture);
    const err = new Error('TransactionCanceledException');
    err.name = 'TransactionCanceledException';
    vi.mocked(dynamoRepo.addFarmMember).mockRejectedValue(err);

    const res = await app.request(`/api/v1/farms/${FARM_ID}/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ user_id: NEW_USER_ID, role: 'staff' }),
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

  it('returns 400 when target user is at membership limit', async () => {
    vi.mocked(dynamoRepo.getFarm).mockResolvedValue(farmFixture);
    vi.mocked(dynamoRepo.countUserMemberships).mockResolvedValue(3);

    const res = await app.request(`/api/v1/farms/${FARM_ID}/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ user_id: NEW_USER_ID, role: 'staff' }),
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
      body: JSON.stringify({ user_id: NEW_USER_ID, role: 'staff' }),
    });
    expect(res.status).toBe(404);
  });

  it('returns 404 when caller has observer role (read-only, cannot add members)', async () => {
    vi.mocked(dynamoRepo.getFarm).mockResolvedValue(farmFixture);
    vi.mocked(dynamoRepo.getFarmMembership).mockResolvedValue({
      user_id: TEST_USER_ID,
      farm_id: FARM_ID,
      role: 'staff' as const,
      joined_at: '2026-03-17T00:00:00.000Z',
    });

    const res = await app.request(`/api/v1/farms/${FARM_ID}/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ user_id: NEW_USER_ID, role: 'staff' }),
    });
    expect(res.status).toBe(404);
  });
});

// ── DELETE /api/v1/farms/:farmId/members/me ──────────────────────

describe('DELETE /api/v1/farms/:farmId/members/me', () => {
  const DEMO_FARM_ID = 'demo-farm';

  it('removes membership and returns 204', async () => {
    vi.mocked(dynamoRepo.getFarmMembership).mockResolvedValue(membershipFixture);
    // Manager leaving: must have another manager so the sole-owner check passes
    vi.mocked(dynamoRepo.getFarmMembers).mockResolvedValue([
      { user_id: TEST_USER_ID, role: 'owner' as const, joined_at: '2026-03-17T00:00:00.000Z' },
      { user_id: 'other-user', role: 'owner' as const, joined_at: '2026-03-17T00:00:00.000Z' },
    ]);
    vi.mocked(dynamoRepo.removeFarmMember).mockResolvedValue(undefined);

    const res = await app.request(`/api/v1/farms/${FARM_ID}/members/me`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    expect(res.status).toBe(204);
  });

  it('returns 404 when caller is not a member', async () => {
    vi.mocked(dynamoRepo.getFarmMembership).mockResolvedValue(null);

    const res = await app.request(`/api/v1/farms/${FARM_ID}/members/me`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    expect(res.status).toBe(404);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('returns 400 when trying to leave the demo farm', async () => {
    const res = await app.request(`/api/v1/farms/${DEMO_FARM_ID}/members/me`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    expect(res.status).toBe(400);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when manager is the only owner', async () => {
    vi.mocked(dynamoRepo.getFarmMembership).mockResolvedValue({
      ...membershipFixture,
      role: 'owner' as const,
    });
    vi.mocked(dynamoRepo.getFarmMembers).mockResolvedValue([
      { user_id: TEST_USER_ID, role: 'owner' as const, joined_at: '2026-03-17T00:00:00.000Z' },
    ]);

    const res = await app.request(`/api/v1/farms/${FARM_ID}/members/me`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    expect(res.status).toBe(400);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('allows admin to leave when another admin exists', async () => {
    vi.mocked(dynamoRepo.getFarmMembership).mockResolvedValue({
      ...membershipFixture,
      role: 'admin' as const,
    });
    vi.mocked(dynamoRepo.getFarmMembers).mockResolvedValue([
      { user_id: TEST_USER_ID, role: 'admin' as const, joined_at: '2026-03-17T00:00:00.000Z' },
      { user_id: 'other-admin-id', role: 'admin' as const, joined_at: '2026-03-17T00:00:00.000Z' },
    ]);
    vi.mocked(dynamoRepo.removeFarmMember).mockResolvedValue(undefined);

    const res = await app.request(`/api/v1/farms/${FARM_ID}/members/me`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    expect(res.status).toBe(204);
  });

  it('returns 401 when not authenticated', async () => {
    const res = await app.request(`/api/v1/farms/${FARM_ID}/members/me`, {
      method: 'DELETE',
    });
    expect(res.status).toBe(401);
  });
});

// ── PATCH /api/v1/farms/:farmId/members/:targetUserId ────────────

describe('PATCH /api/v1/farms/:farmId/members/:targetUserId', () => {
  const TARGET_USER_ID = 'target-user-00000000000000000002';

  const staffMembershipFixture = {
    user_id: TARGET_USER_ID,
    farm_id: FARM_ID,
    role: 'staff' as const,
    joined_at: '2026-03-17T00:00:00.000Z',
  };

  it('owner promotes staff to owner → 200 with role: owner', async () => {
    vi.mocked(dynamoRepo.getFarm).mockResolvedValue(farmFixture);
    vi.mocked(dynamoRepo.getFarmMembership).mockResolvedValueOnce(membershipFixture); // caller check (assertFarmAccess)
    vi.mocked(dynamoRepo.getFarmMembership).mockResolvedValueOnce(staffMembershipFixture); // target check
    vi.mocked(dynamoRepo.updateMemberRole).mockResolvedValue(undefined);

    const res = await app.request(`/api/v1/farms/${FARM_ID}/members/${TARGET_USER_ID}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ role: 'owner' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { user_id: string; farm_id: string; role: string };
    expect(body.role).toBe('owner');
    expect(body.user_id).toBe(TARGET_USER_ID);
    expect(body.farm_id).toBe(FARM_ID);
  });

  it('returns 404 when caller is staff (assertFarmAccess denies)', async () => {
    vi.mocked(dynamoRepo.getFarm).mockResolvedValue(farmFixture);
    vi.mocked(dynamoRepo.getFarmMembership).mockResolvedValue({
      user_id: TEST_USER_ID,
      farm_id: FARM_ID,
      role: 'staff' as const,
      joined_at: '2026-03-17T00:00:00.000Z',
    });

    const res = await app.request(`/api/v1/farms/${FARM_ID}/members/${TARGET_USER_ID}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ role: 'owner' }),
    });
    expect(res.status).toBe(404);
  });

  it('returns 400 when target is already owner', async () => {
    vi.mocked(dynamoRepo.getFarm).mockResolvedValue(farmFixture);
    vi.mocked(dynamoRepo.getFarmMembership).mockResolvedValueOnce(membershipFixture); // caller
    vi.mocked(dynamoRepo.getFarmMembership).mockResolvedValueOnce({
      user_id: TARGET_USER_ID,
      farm_id: FARM_ID,
      role: 'owner' as const,
      joined_at: '2026-03-17T00:00:00.000Z',
    }); // target already owner

    const res = await app.request(`/api/v1/farms/${FARM_ID}/members/${TARGET_USER_ID}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ role: 'owner' }),
    });
    expect(res.status).toBe(400);
    const body = await res.json() as { error: { code: string; message: string } };
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.message).toMatch(/Only staff members can be promoted/);
  });

  it('returns 404 when target is not a member', async () => {
    vi.mocked(dynamoRepo.getFarm).mockResolvedValue(farmFixture);
    vi.mocked(dynamoRepo.getFarmMembership).mockResolvedValueOnce(membershipFixture); // caller
    vi.mocked(dynamoRepo.getFarmMembership).mockResolvedValueOnce(null); // target not found

    const res = await app.request(`/api/v1/farms/${FARM_ID}/members/${TARGET_USER_ID}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ role: 'owner' }),
    });
    expect(res.status).toBe(404);
    const body = await res.json() as { error: { code: string; message: string } };
    expect(body.error.code).toBe('NOT_FOUND');
    expect(body.error.message).toMatch(/Member not found/);
  });

  it('returns 400 when role value is not owner', async () => {
    vi.mocked(dynamoRepo.getFarm).mockResolvedValue(farmFixture);
    vi.mocked(dynamoRepo.getFarmMembership).mockResolvedValue(membershipFixture); // caller passes access check

    const res = await app.request(`/api/v1/farms/${FARM_ID}/members/${TARGET_USER_ID}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ role: 'staff' }),
    });
    expect(res.status).toBe(400);
    const body = await res.json() as { error: { code: string; message: string } };
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.message).toMatch(/Only promotion to 'owner' is supported/);
  });
});

// ── GET /api/v1/farms/:farmId/members ─────────────────────────────

describe('GET /api/v1/farms/:farmId/members', () => {
  it('returns 200 with members array for any member', async () => {
    const membersList = [
      { user_id: TEST_USER_ID, role: 'owner' as const, joined_at: '2026-03-17T00:00:00.000Z' },
    ];
    vi.mocked(dynamoRepo.getFarmMembers).mockResolvedValue(membersList);

    const res = await app.request(`/api/v1/farms/${FARM_ID}/members`, { headers: authHeaders() });
    expect(res.status).toBe(200);
    const body = await res.json() as { data: unknown[] };
    expect(body.data).toHaveLength(1);
    expect((body.data[0] as Record<string, unknown>)['role']).toBe('owner');
    expect((body.data[0] as Record<string, unknown>)['display_name']).toBe('');
  });

  it('enriches members with display_name from user profile', async () => {
    vi.mocked(dynamoRepo.getFarmMembers).mockResolvedValue([
      { user_id: TEST_USER_ID, role: 'owner' as const, joined_at: '2026-03-17T00:00:00.000Z' },
    ]);
    vi.mocked(dynamoRepo.getUserProfile).mockResolvedValue({
      user_id: TEST_USER_ID,
      display_name: 'Tanaka',
      preferred_role: 'owner',
      created_at: '2026-03-17T00:00:00.000Z',
    });

    const res = await app.request(`/api/v1/farms/${FARM_ID}/members`, { headers: authHeaders() });
    expect(res.status).toBe(200);
    const body = await res.json() as { data: Array<{ display_name: string }> };
    expect(body.data[0].display_name).toBe('Tanaka');
  });

  it('returns empty display_name when profile lookup fails', async () => {
    vi.mocked(dynamoRepo.getFarmMembers).mockResolvedValue([
      { user_id: TEST_USER_ID, role: 'owner' as const, joined_at: '2026-03-17T00:00:00.000Z' },
    ]);
    vi.mocked(dynamoRepo.getUserProfile).mockRejectedValue(new Error('DynamoDB down'));

    const res = await app.request(`/api/v1/farms/${FARM_ID}/members`, { headers: authHeaders() });
    expect(res.status).toBe(200);
    const body = await res.json() as { data: Array<{ display_name: string }> };
    expect(body.data[0].display_name).toBe('');
  });

  it('returns 200 for observer role (any member can view)', async () => {
    vi.mocked(dynamoRepo.getFarmMembership).mockResolvedValue({
      user_id: TEST_USER_ID,
      farm_id: FARM_ID,
      role: 'staff' as const,
      joined_at: '2026-03-17T00:00:00.000Z',
    });
    vi.mocked(dynamoRepo.getFarmMembers).mockResolvedValue([]);

    const res = await app.request(`/api/v1/farms/${FARM_ID}/members`, { headers: authHeaders() });
    expect(res.status).toBe(200);
  });

  it('returns 401 when not authenticated', async () => {
    const res = await app.request(`/api/v1/farms/${FARM_ID}/members`);
    expect(res.status).toBe(401);
  });

  it('returns 404 when caller is not a member', async () => {
    vi.mocked(dynamoRepo.getFarmMembership).mockResolvedValue(null);

    const res = await app.request(`/api/v1/farms/${FARM_ID}/members`, { headers: authHeaders() });
    expect(res.status).toBe(404);
  });

  it('returns 503 when storage fails', async () => {
    vi.mocked(dynamoRepo.getFarm).mockResolvedValue(farmFixture);
    vi.mocked(dynamoRepo.getFarmMembers).mockRejectedValue(new Error('DynamoDB down'));

    const res = await app.request(`/api/v1/farms/${FARM_ID}/members`, { headers: authHeaders() });
    expect(res.status).toBe(503);
  });
});

// ── Admin Bypass Tests (C1) ──────────────────────────────────────

const adminHeaders = () => makeAuthHeaders(ADMIN_USER_ID, ADMIN_EMAIL);
const OTHER_FARM_ID = 'f0000000-0000-0000-0000-000000000099';
const otherFarm = { ...farmFixture, id: OTHER_FARM_ID, user_id: 'other-user', name: 'Other Farm' };

describe('GET /api/v1/farms — admin path', () => {
  it('returns all farms with role admin for admin user', async () => {
    vi.mocked(dynamoRepo.getAllFarms).mockResolvedValue([farmFixture, otherFarm]);

    const res = await app.request('/api/v1/farms', { headers: adminHeaders() });
    expect(res.status).toBe(200);
    const body = await res.json() as { data: Array<{ id: string; role: string }> };
    expect(body.data).toHaveLength(2);
    expect(body.data[0].role).toBe('admin');
    expect(body.data[1].role).toBe('admin');
    expect(dynamoRepo.getFarmsForUser).not.toHaveBeenCalled();
  });

  it('returns empty array when no farms exist for admin', async () => {
    vi.mocked(dynamoRepo.getAllFarms).mockResolvedValue([]);

    const res = await app.request('/api/v1/farms', { headers: adminHeaders() });
    expect(res.status).toBe(200);
    const body = await res.json() as { data: unknown[] };
    expect(body.data).toHaveLength(0);
  });

  it('non-admin user calls getFarmsForUser, not getAllFarms', async () => {
    vi.mocked(dynamoRepo.getFarmsForUser).mockResolvedValue([]);

    const res = await app.request('/api/v1/farms', { headers: authHeaders() });
    expect(res.status).toBe(200);
    expect(dynamoRepo.getAllFarms).not.toHaveBeenCalled();
    expect(dynamoRepo.getFarmsForUser).toHaveBeenCalled();
  });
});

describe('GET /api/v1/farms/:farmId — admin bypass', () => {
  it('admin can read a farm without membership', async () => {
    vi.mocked(dynamoRepo.getFarm).mockResolvedValue(otherFarm);
    vi.mocked(dynamoRepo.getBedsForFarm).mockResolvedValue([]);

    const res = await app.request(`/api/v1/farms/${OTHER_FARM_ID}`, { headers: adminHeaders() });
    expect(res.status).toBe(200);
    expect(dynamoRepo.getFarmMembership).not.toHaveBeenCalled();
  });

  it('admin gets 404 when farm does not exist', async () => {
    vi.mocked(dynamoRepo.getFarm).mockRejectedValue(new NotFoundError('Farm not found'));

    const res = await app.request(`/api/v1/farms/${OTHER_FARM_ID}`, { headers: adminHeaders() });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/v1/farms/:farmId — admin bypass', () => {
  it('admin can delete a farm they do not own', async () => {
    vi.mocked(dynamoRepo.getFarm).mockResolvedValue(otherFarm);
    vi.mocked(dynamoRepo.getFarmMembership).mockResolvedValue(null);
    vi.mocked(dynamoRepo.deleteFarm).mockResolvedValue(undefined);

    const res = await app.request(`/api/v1/farms/${OTHER_FARM_ID}`, {
      method: 'DELETE',
      headers: adminHeaders(),
    });
    expect(res.status).toBe(204);
    expect(dynamoRepo.deleteFarm).toHaveBeenCalledWith(OTHER_FARM_ID);
  });

  it('non-admin user cannot delete a farm they do not own', async () => {
    vi.mocked(dynamoRepo.getFarm).mockResolvedValue(otherFarm);
    vi.mocked(dynamoRepo.getFarmMembership).mockResolvedValue(null);

    const res = await app.request(`/api/v1/farms/${OTHER_FARM_ID}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    expect(res.status).toBe(404);
    expect(dynamoRepo.deleteFarm).not.toHaveBeenCalled();
  });
});

describe('assertFarmAccess — requiredRoles with admin', () => {
  it('admin passes when requiredRoles includes admin', async () => {
    // PATCH /farms/:farmId uses requiredRoles ['admin', 'owner']
    // but does NOT pass isAdmin, so admin without membership gets 404
    vi.mocked(dynamoRepo.getFarm).mockResolvedValue(otherFarm);
    vi.mocked(dynamoRepo.getFarmMembership).mockResolvedValue(null);

    const res = await app.request(`/api/v1/farms/${OTHER_FARM_ID}`, {
      method: 'PATCH',
      headers: { ...adminHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Renamed' }),
    });
    // Admin without membership should NOT be able to write — gets 404
    expect(res.status).toBe(404);
  });
});

// ── Event emission tests ─────────────────────────────────────────

import { appEvents } from '../../services/events';
import type { AppEventMap } from '../../services/events';

describe('farm.created event emission', () => {
  it('emits farm.created after successful farm creation', async () => {
    const listener = vi.fn();
    appEvents.on('farm.created', listener);

    vi.mocked(dynamoRepo.getFarmsForUser).mockResolvedValue([]);
    vi.mocked(dynamoRepo.createFarm).mockResolvedValue(farmFixture);
    vi.mocked(dynamoRepo.getBedsForFarm).mockResolvedValue([]);

    await app.request('/api/v1/farms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ name: 'Test Farm', latitude: 36.0, longitude: 138.0 }),
    });

    await new Promise((r) => setTimeout(r, 20));

    expect(listener).toHaveBeenCalledOnce();
    const event = listener.mock.calls[0][0] as AppEventMap['farm.created'];
    expect(event.type).toBe('farm.created');
    expect(event.payload.farm_name).toBe('Test Farm');

    appEvents.off('farm.created', listener);
  });
});

describe('farm.deleted event emission', () => {
  it('emits farm.deleted after successful farm deletion', async () => {
    const listener = vi.fn();
    appEvents.on('farm.deleted', listener);

    vi.mocked(dynamoRepo.getFarm).mockResolvedValue(farmFixture);
    vi.mocked(dynamoRepo.getFarmMembership).mockResolvedValue(membershipFixture);
    vi.mocked(dynamoRepo.deleteFarm).mockResolvedValue(undefined);

    await app.request(`/api/v1/farms/${FARM_ID}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });

    await new Promise((r) => setTimeout(r, 20));

    expect(listener).toHaveBeenCalledOnce();
    const event = listener.mock.calls[0][0] as AppEventMap['farm.deleted'];
    expect(event.type).toBe('farm.deleted');
    expect(event.payload.farm_id).toBe(FARM_ID);

    appEvents.off('farm.deleted', listener);
  });
});

describe('join_request events emission', () => {
  const targetUserId = 'target-user-001';

  beforeEach(() => {
    vi.mocked(dynamoRepo.getFarm).mockResolvedValue(farmFixture);
    vi.mocked(dynamoRepo.getFarmMembership).mockResolvedValue(membershipFixture);
  });

  it('emits join_request.submitted after join request creation', async () => {
    const listener = vi.fn();
    appEvents.on('join_request.submitted', listener);

    vi.mocked(dynamoRepo.getFarmMembership).mockResolvedValueOnce(null); // not already a member
    vi.mocked(dynamoRepo.getFarm).mockResolvedValue(farmFixture);
    vi.mocked(dynamoRepo.countUserMemberships).mockResolvedValue(0);
    vi.mocked(dynamoRepo.getJoinRequest).mockResolvedValue(null);
    vi.mocked(dynamoRepo.getUserProfile).mockResolvedValue({ user_id: TEST_USER_ID, display_name: 'Alice', preferred_role: 'staff', created_at: '2026-01-01T00:00:00.000Z' });
    vi.mocked(dynamoRepo.createJoinRequest).mockResolvedValue(undefined);

    await app.request(`/api/v1/farms/${FARM_ID}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({}),
    });

    await new Promise((r) => setTimeout(r, 20));

    expect(listener).toHaveBeenCalledOnce();
    const event = listener.mock.calls[0][0] as AppEventMap['join_request.submitted'];
    expect(event.type).toBe('join_request.submitted');
    expect(event.payload.farm_id).toBe(FARM_ID);

    appEvents.off('join_request.submitted', listener);
  });

  it('emits join_request.approved after approval', async () => {
    const listener = vi.fn();
    appEvents.on('join_request.approved', listener);

    vi.mocked(dynamoRepo.countUserMemberships).mockResolvedValue(0);
    vi.mocked(dynamoRepo.approveJoinRequest).mockResolvedValue(undefined);
    vi.mocked(dynamoRepo.getUserProfile).mockResolvedValue({ user_id: targetUserId, display_name: 'Bob', preferred_role: 'staff', created_at: '2026-01-01T00:00:00.000Z' });

    await app.request(`/api/v1/farms/${FARM_ID}/join-requests/${targetUserId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ action: 'approve' }),
    });

    await new Promise((r) => setTimeout(r, 20));

    expect(listener).toHaveBeenCalledOnce();
    const event = listener.mock.calls[0][0] as AppEventMap['join_request.approved'];
    expect(event.type).toBe('join_request.approved');
    expect(event.payload.farm_id).toBe(FARM_ID);
    expect(event.payload.target_user_id).toBe(targetUserId);

    appEvents.off('join_request.approved', listener);
  });

  it('emits join_request.rejected after rejection', async () => {
    const listener = vi.fn();
    appEvents.on('join_request.rejected', listener);

    vi.mocked(dynamoRepo.rejectJoinRequest).mockResolvedValue(undefined);
    vi.mocked(dynamoRepo.getUserProfile).mockResolvedValue({ user_id: targetUserId, display_name: 'Carol', preferred_role: 'staff', created_at: '2026-01-01T00:00:00.000Z' });

    await app.request(`/api/v1/farms/${FARM_ID}/join-requests/${targetUserId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ action: 'reject' }),
    });

    await new Promise((r) => setTimeout(r, 20));

    expect(listener).toHaveBeenCalledOnce();
    const event = listener.mock.calls[0][0] as AppEventMap['join_request.rejected'];
    expect(event.type).toBe('join_request.rejected');
    expect(event.payload.target_user_id).toBe(targetUserId);

    appEvents.off('join_request.rejected', listener);
  });
});

import { authHeaders, makeAuthHeaders } from '../helpers/auth';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Set ADMIN_EMAILS before auth module loads (isAdmin derived from ADMIN_EMAILS)
const ADMIN_EMAIL = 'admin@litcrop.test';
const ADMIN_USER_ID = 'admin-cognito-sub-001';
vi.hoisted(() => {
  process.env['ADMIN_EMAILS'] = 'admin@litcrop.test';
});

import app from '../../app';

vi.mock('../../services/budget', () => ({
  checkBudget: vi.fn(),
  recordUsage: vi.fn(),
  getUsage: vi.fn(),
  MESSAGES_PER_HOUR_LIMIT: 20,
  CHAT_MODEL: 'claude-haiku-4-5-20251001',
  todayUtc: vi.fn().mockReturnValue('2026-03-20'),
  nextMidnightUtc: vi.fn().mockReturnValue('2026-03-21T00:00:00.000Z'),
  todayStartUtc: vi.fn().mockReturnValue('2026-03-20T00:00:00.000Z'),
}));

vi.mock('../../services/dynamodb', () => ({
  dynamoRepo: {
    getFarm: vi.fn(),
    getStats: vi.fn(),
    getAllUserProfiles: vi.fn(),
    getAllFarms: vi.fn(),
    getFarmMembers: vi.fn(),
    getUserSettings: vi.fn(),
    upsertUserSettings: vi.fn(),
    getUserProfile: vi.fn(),
    deleteAccount: vi.fn(),
    getFarmMembership: vi.fn(),
  },
}));

vi.mock('../../services/activity', () => ({
  queryActivities: vi.fn(),
  initActivitySubscriptions: vi.fn(),
}));

import { getUsage } from '../../services/budget';
import { dynamoRepo } from '../../services/dynamodb';
import { queryActivities } from '../../services/activity';

const adminHeaders = () => makeAuthHeaders(ADMIN_USER_ID, ADMIN_EMAIL);

const usageFixture = {
  user_id: ADMIN_USER_ID,
  period: 'daily' as const,
  period_start: '2026-03-20T00:00:00.000Z',
  reset_at: '2026-03-21T00:00:00.000Z',
  user_budget: {
    input_tokens_used: 500,
    input_tokens_limit: 50000,
    output_tokens_used: 100,
    output_tokens_limit: 10000,
    messages_sent: 2,
    messages_limit: 20,
  },
  global_budget: {
    input_tokens_used: 12000,
    input_tokens_limit: 500000,
    output_tokens_used: 3000,
    output_tokens_limit: 100000,
    utilization_pct: 2,
  },
  model: 'claude-haiku-4-5-20251001',
};

const statsFixture = { farms: 5, users: 8, beds: 17 };

const profileFixture = {
  user_id: 'user-1',
  display_name: 'Test User',
  preferred_role: 'owner' as const,
  created_at: '2026-03-01T00:00:00Z',
};

const farmFixture = {
  id: 'farm-1',
  user_id: 'user-1',
  name: 'Test Farm',
  location_text: 'Test Location',
  latitude: 36.0,
  longitude: 138.0,
  locale: 'en' as const,
  theme: 'system' as const,
  grid_rows: 2,
  grid_cols: 3,
  created_at: '2026-03-01T00:00:00Z',
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ── GET /api/v1/admin/stats ────────────────────────────────────────

describe('GET /api/v1/admin/stats', () => {
  it('returns 200 with entity counts and global budget for admin user', async () => {
    vi.mocked(dynamoRepo.getStats).mockResolvedValue(statsFixture);
    vi.mocked(getUsage).mockResolvedValue(usageFixture);

    const res = await app.request('/api/v1/admin/stats', { headers: adminHeaders() });
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body['entity_counts']).toEqual(statsFixture);
  });

  it('returns 403 for non-admin authenticated user', async () => {
    const res = await app.request('/api/v1/admin/stats', { headers: authHeaders() });
    expect(res.status).toBe(403);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('FORBIDDEN');
  });

  it('returns 401 for unauthenticated request', async () => {
    const res = await app.request('/api/v1/admin/stats');
    expect(res.status).toBe(401);
  });

  it('returns 503 when getStats throws', async () => {
    vi.mocked(dynamoRepo.getStats).mockRejectedValue(new Error('DynamoDB timeout'));
    vi.mocked(getUsage).mockResolvedValue(usageFixture);

    const res = await app.request('/api/v1/admin/stats', { headers: adminHeaders() });
    expect(res.status).toBe(503);
  });
});

// ── GET /api/v1/admin/users ────────────────────────────────────────

describe('GET /api/v1/admin/users', () => {
  it('returns 200 with user list for admin', async () => {
    vi.mocked(dynamoRepo.getAllUserProfiles).mockResolvedValue([profileFixture]);

    const res = await app.request('/api/v1/admin/users', { headers: adminHeaders() });
    expect(res.status).toBe(200);
    const body = await res.json() as { users: unknown[]; total: number };
    expect(body.users).toHaveLength(1);
    expect(body.total).toBe(1);
  });

  it('returns 403 for non-admin', async () => {
    const res = await app.request('/api/v1/admin/users', { headers: authHeaders() });
    expect(res.status).toBe(403);
  });

  it('returns empty array when no users exist', async () => {
    vi.mocked(dynamoRepo.getAllUserProfiles).mockResolvedValue([]);

    const res = await app.request('/api/v1/admin/users', { headers: adminHeaders() });
    expect(res.status).toBe(200);
    const body = await res.json() as { users: unknown[]; total: number };
    expect(body.users).toHaveLength(0);
    expect(body.total).toBe(0);
  });
});

// ── GET /api/v1/admin/farms ────────────────────────────────────────

describe('GET /api/v1/admin/farms', () => {
  it('returns 200 with farms and member counts for admin', async () => {
    vi.mocked(dynamoRepo.getAllFarms).mockResolvedValue([farmFixture]);
    vi.mocked(dynamoRepo.getFarmMembers).mockResolvedValue([
      { user_id: 'user-1', role: 'admin' as const, joined_at: '2026-03-01T00:00:00Z' },
    ]);

    const res = await app.request('/api/v1/admin/farms', { headers: adminHeaders() });
    expect(res.status).toBe(200);
    const body = await res.json() as { farms: Array<{ member_count: number }>; total: number };
    expect(body.farms).toHaveLength(1);
    expect(body.farms[0].member_count).toBe(1);
    expect(body.total).toBe(1);
  });

  it('returns 403 for non-admin', async () => {
    const res = await app.request('/api/v1/admin/farms', { headers: authHeaders() });
    expect(res.status).toBe(403);
  });

  it('returns empty array when no farms exist', async () => {
    vi.mocked(dynamoRepo.getAllFarms).mockResolvedValue([]);

    const res = await app.request('/api/v1/admin/farms', { headers: adminHeaders() });
    expect(res.status).toBe(200);
    const body = await res.json() as { farms: unknown[]; total: number };
    expect(body.farms).toHaveLength(0);
  });
});

// ── GET /api/v1/admin/activity ────────────────────────────────────

const activityFixture = {
  activities: [
    {
      id: 'evt_abc123def4',
      event_type: 'farm.created',
      actor_id: 'user-001',
      actor_email: 'alice@litcrop.test',
      target_type: 'farm',
      target_id: 'farm-001',
      target_name: 'Sunset Farm',
      farm_id: 'farm-001',
      created_at: '2026-04-01T12:00:00.000Z',
    },
  ],
  next_cursor: undefined,
};

describe('GET /api/v1/admin/activity', () => {
  it('returns 200 with activity list for admin', async () => {
    vi.mocked(queryActivities).mockResolvedValue(activityFixture);

    const res = await app.request('/api/v1/admin/activity', { headers: adminHeaders() });
    expect(res.status).toBe(200);
    const body = await res.json() as { activities: unknown[] };
    expect(body.activities).toHaveLength(1);
  });

  it('passes query params to queryActivities', async () => {
    vi.mocked(queryActivities).mockResolvedValue({ activities: [], next_cursor: undefined });

    const url = '/api/v1/admin/activity?from=2026-04-01T00:00:00.000Z&to=2026-04-30T00:00:00.000Z&event_type=farm.created,farm.deleted&user_id=user-001&farm_id=farm-001&q=sunset&limit=25';
    const res = await app.request(url, { headers: adminHeaders() });
    expect(res.status).toBe(200);

    expect(vi.mocked(queryActivities)).toHaveBeenCalledWith(
      expect.objectContaining({
        from: '2026-04-01T00:00:00.000Z',
        to: '2026-04-30T00:00:00.000Z',
        event_type: ['farm.created', 'farm.deleted'],
        actor_id: 'user-001',
        farm_id: 'farm-001',
        q: 'sunset',
        limit: 25,
      }),
    );
  });

  it('returns next_cursor in response when present', async () => {
    vi.mocked(queryActivities).mockResolvedValue({
      activities: activityFixture.activities,
      next_cursor: 'eyJQSyI6IkFDVElWSVRZIn0',
    });

    const res = await app.request('/api/v1/admin/activity', { headers: adminHeaders() });
    const body = await res.json() as { next_cursor?: string };
    expect(body.next_cursor).toBe('eyJQSyI6IkFDVElWSVRZIn0');
  });

  it('returns 400 for invalid limit param', async () => {
    const res = await app.request('/api/v1/admin/activity?limit=abc', { headers: adminHeaders() });
    expect(res.status).toBe(400);
  });

  it('returns 400 for limit > 100', async () => {
    const res = await app.request('/api/v1/admin/activity?limit=200', { headers: adminHeaders() });
    expect(res.status).toBe(400);
  });

  it('returns 403 for non-admin user', async () => {
    const res = await app.request('/api/v1/admin/activity', { headers: authHeaders() });
    expect(res.status).toBe(403);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('FORBIDDEN');
  });

  it('returns 401 for unauthenticated request', async () => {
    const res = await app.request('/api/v1/admin/activity');
    expect(res.status).toBe(401);
  });

  it('returns 503 when queryActivities throws', async () => {
    vi.mocked(queryActivities).mockRejectedValue(new Error('DynamoDB timeout'));

    const res = await app.request('/api/v1/admin/activity', { headers: adminHeaders() });
    expect(res.status).toBe(503);
  });
});

// ── DELETE /api/v1/admin/users/:userId (#282) ──────────────────────

describe('DELETE /api/v1/admin/users/:userId', () => {
  const TARGET_USER_ID = 'target-user-uuid';

  it('admin can delete a user → 200 with summary', async () => {
    vi.mocked(dynamoRepo.getUserProfile).mockResolvedValue({
      user_id: TARGET_USER_ID,
      display_name: 'Target User',
      preferred_role: 'staff',
      created_at: '2026-01-01T00:00:00Z',
    });
    vi.mocked(dynamoRepo.deleteAccount).mockResolvedValue({
      farms_deleted: [],
      farms_left: ['farm-1'],
      farms_transferred: [],
      join_requests_deleted: 0,
      profile_deleted: true,
      settings_deleted: true,
    });

    const res = await app.request(`/api/v1/admin/users/${TARGET_USER_ID}`, {
      method: 'DELETE',
      headers: adminHeaders(),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body['deleted']).toBe(true);
    expect(body['summary']).toBeDefined();
  });

  it('non-admin gets 403', async () => {
    const res = await app.request(`/api/v1/admin/users/${TARGET_USER_ID}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    expect(res.status).toBe(403);
  });

  it('admin cannot delete self → 400', async () => {
    const res = await app.request(`/api/v1/admin/users/${ADMIN_USER_ID}`, {
      method: 'DELETE',
      headers: adminHeaders(),
    });
    expect(res.status).toBe(400);
  });

  it('unauthenticated request → 401', async () => {
    const res = await app.request('/api/v1/admin/users/some-id', { method: 'DELETE' });
    expect(res.status).toBe(401);
  });

  it('delete non-existent user → 404', async () => {
    vi.mocked(dynamoRepo.getUserProfile).mockResolvedValue(null);

    const res = await app.request('/api/v1/admin/users/nonexistent-id', {
      method: 'DELETE',
      headers: adminHeaders(),
    });
    expect(res.status).toBe(404);
  });

  it('deleteAccount failure → 503', async () => {
    vi.mocked(dynamoRepo.getUserProfile).mockResolvedValue({
      user_id: TARGET_USER_ID,
      display_name: 'Target',
      preferred_role: 'staff',
      created_at: '2026-01-01T00:00:00Z',
    });
    vi.mocked(dynamoRepo.deleteAccount).mockRejectedValue(new Error('DynamoDB timeout'));

    const res = await app.request(`/api/v1/admin/users/${TARGET_USER_ID}`, {
      method: 'DELETE',
      headers: adminHeaders(),
    });
    expect(res.status).toBe(503);
  });
});

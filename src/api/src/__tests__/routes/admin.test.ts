import { TEST_USER_ID, authHeaders, makeAuthHeaders } from '../helpers/auth';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import app from '../../app';

const ADMIN_USER_ID = 'admin-cognito-sub-001';
const NON_ADMIN_USER_ID = TEST_USER_ID;

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
    getPlotsForFarm: vi.fn(),
    getStats: vi.fn(),
  },
}));

import { getUsage } from '../../services/budget';
import { dynamoRepo } from '../../services/dynamodb';

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

beforeEach(() => {
  vi.clearAllMocks();
  // Set ADMIN_USER_IDS env var for tests
  process.env['ADMIN_USER_IDS'] = ADMIN_USER_ID;
});

// ── GET /api/v1/admin/stats ────────────────────────────────────────

describe('GET /api/v1/admin/stats', () => {
  it('returns 200 with entity counts and global budget for admin user', async () => {
    vi.mocked(dynamoRepo.getStats).mockResolvedValue(statsFixture);
    vi.mocked(getUsage).mockResolvedValue(usageFixture);

    const res = await app.request('/api/v1/admin/stats', {
      headers: makeAuthHeaders(ADMIN_USER_ID),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as {
      entity_counts: typeof statsFixture;
      global_budget: typeof usageFixture.global_budget;
      period_start: string;
      reset_at: string;
    };
    expect(body.entity_counts).toEqual(statsFixture);
    expect(body.global_budget.input_tokens_used).toBe(12000);
    expect(body.global_budget.utilization_pct).toBe(2);
    expect(body.period_start).toBe('2026-03-20T00:00:00.000Z');
    expect(body.reset_at).toBe('2026-03-21T00:00:00.000Z');
  });

  it('returns 403 for non-admin authenticated user', async () => {
    const res = await app.request('/api/v1/admin/stats', {
      headers: authHeaders(), // uses TEST_USER_ID (non-admin)
    });
    expect(res.status).toBe(403);
    const body = await res.json() as { error: { code: string; message: string } };
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('returns 401 for unauthenticated request', async () => {
    const res = await app.request('/api/v1/admin/stats');
    expect(res.status).toBe(401);
  });

  it('returns 403 when ADMIN_USER_IDS is empty', async () => {
    process.env['ADMIN_USER_IDS'] = '';

    const res = await app.request('/api/v1/admin/stats', {
      headers: makeAuthHeaders(ADMIN_USER_ID),
    });
    expect(res.status).toBe(403);
  });

  it('calls getStats and getUsage with admin userId', async () => {
    vi.mocked(dynamoRepo.getStats).mockResolvedValue(statsFixture);
    vi.mocked(getUsage).mockResolvedValue(usageFixture);

    await app.request('/api/v1/admin/stats', {
      headers: makeAuthHeaders(ADMIN_USER_ID),
    });
    expect(dynamoRepo.getStats).toHaveBeenCalledOnce();
    expect(getUsage).toHaveBeenCalledWith(ADMIN_USER_ID);
  });

  it('returns 503 when getStats throws', async () => {
    vi.mocked(dynamoRepo.getStats).mockRejectedValue(new Error('DynamoDB timeout'));
    vi.mocked(getUsage).mockResolvedValue(usageFixture);

    const res = await app.request('/api/v1/admin/stats', {
      headers: makeAuthHeaders(ADMIN_USER_ID),
    });
    expect(res.status).toBe(503);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('SERVICE_UNAVAILABLE');
  });

  it('accepts multiple admin user IDs in ADMIN_USER_IDS', async () => {
    process.env['ADMIN_USER_IDS'] = `other-admin,${ADMIN_USER_ID}, yet-another`;
    vi.mocked(dynamoRepo.getStats).mockResolvedValue(statsFixture);
    vi.mocked(getUsage).mockResolvedValue(usageFixture);

    const res = await app.request('/api/v1/admin/stats', {
      headers: makeAuthHeaders(ADMIN_USER_ID),
    });
    expect(res.status).toBe(200);
  });
});

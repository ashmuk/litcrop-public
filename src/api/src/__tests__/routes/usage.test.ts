import { TEST_USER_ID, authHeaders } from '../helpers/auth';
import { describe, it, expect, vi, beforeEach } from 'vitest';
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

// Also mock dynamodb so app.ts imports don't blow up
vi.mock('../../services/dynamodb', () => ({
  dynamoRepo: {
    getFarm: vi.fn(),
  },
}));

import { getUsage } from '../../services/budget';

const usageFixture = {
  user_id: TEST_USER_ID,
  period: 'daily' as const,
  period_start: '2026-03-20T00:00:00.000Z',
  reset_at: '2026-03-21T00:00:00.000Z',
  user_budget: {
    input_tokens_used: 1200,
    input_tokens_limit: 50000,
    output_tokens_used: 300,
    output_tokens_limit: 10000,
    messages_sent: 4,
    messages_limit: 20,
  },
  global_budget: {
    input_tokens_used: 12000,
    input_tokens_limit: 500000,
    output_tokens_used: 3000,
    output_tokens_limit: 100000,
    utilization_pct: 2,
  },
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ── GET /api/v1/usage ──────────────────────────────────────────────

describe('GET /api/v1/usage', () => {
  it('returns 200 with usage data for authenticated user', async () => {
    vi.mocked(getUsage).mockResolvedValue(usageFixture);

    const res = await app.request('/api/v1/usage', { headers: authHeaders() });
    expect(res.status).toBe(200);
    const body = await res.json() as typeof usageFixture;
    expect(body.user_id).toBe(TEST_USER_ID);
    expect(body.period).toBe('daily');
    expect(body.user_budget.input_tokens_used).toBe(1200);
    expect(body.global_budget.utilization_pct).toBe(2);
    expect((body as Record<string, unknown>)['model']).toBeUndefined();
  });

  it('calls getUsage with the correct user_id from JWT', async () => {
    vi.mocked(getUsage).mockResolvedValue(usageFixture);

    await app.request('/api/v1/usage', { headers: authHeaders() });
    expect(getUsage).toHaveBeenCalledWith(TEST_USER_ID);
  });

  it('returns 401 when not authenticated', async () => {
    const res = await app.request('/api/v1/usage');
    expect(res.status).toBe(401);
  });

  it('response includes reset_at and period_start as ISO 8601', async () => {
    vi.mocked(getUsage).mockResolvedValue(usageFixture);

    const res = await app.request('/api/v1/usage', { headers: authHeaders() });
    const body = await res.json() as typeof usageFixture;
    expect(() => new Date(body.reset_at)).not.toThrow();
    expect(() => new Date(body.period_start)).not.toThrow();
  });

  it('returns 503 when getUsage throws', async () => {
    vi.mocked(getUsage).mockRejectedValue(new Error('DynamoDB timeout'));

    const res = await app.request('/api/v1/usage', { headers: authHeaders() });
    expect(res.status).toBe(503);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('SERVICE_UNAVAILABLE');
  });

  it('user with no usage today returns all counters at 0', async () => {
    vi.mocked(getUsage).mockResolvedValue({
      ...usageFixture,
      user_budget: {
        input_tokens_used: 0,
        input_tokens_limit: 50000,
        output_tokens_used: 0,
        output_tokens_limit: 10000,
        messages_sent: 0,
        messages_limit: 20,
      },
      global_budget: {
        input_tokens_used: 0,
        input_tokens_limit: 500000,
        output_tokens_used: 0,
        output_tokens_limit: 100000,
        utilization_pct: 0,
      },
    });

    const res = await app.request('/api/v1/usage', { headers: authHeaders() });
    const body = await res.json() as typeof usageFixture;
    expect(body.user_budget.input_tokens_used).toBe(0);
    expect(body.user_budget.messages_sent).toBe(0);
    expect(body.global_budget.utilization_pct).toBe(0);
  });
});

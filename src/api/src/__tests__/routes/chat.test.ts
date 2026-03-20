import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import app from '../../app';
import { dynamoRepo } from '../../services/dynamodb';

vi.mock('../../services/dynamodb', () => ({
  dynamoRepo: {
    getFarm: vi.fn(),
    getPlotsForFarm: vi.fn(),
  },
}));

vi.mock('../../services/budget', () => ({
  checkBudget: vi.fn().mockResolvedValue({ allowed: true, user_record: { input_tokens_used: 0, output_tokens_used: 0, messages_sent: 0 }, global_record: { input_tokens_used: 0, output_tokens_used: 0, messages_sent: 0 } }),
  recordUsage: vi.fn().mockResolvedValue(undefined),
  getUsage: vi.fn(),
  MESSAGES_PER_HOUR_LIMIT: 20,
  CHAT_MODEL: 'claude-haiku-4-5-20251001',
  todayUtc: vi.fn().mockReturnValue('2026-03-20'),
  nextMidnightUtc: vi.fn().mockReturnValue('2026-03-21T00:00:00.000Z'),
  todayStartUtc: vi.fn().mockReturnValue('2026-03-20T00:00:00.000Z'),
  checkRateLimit: vi.fn(),  // no-op by default
}));

// Ensure LLM_API_KEY is not set for stub mode tests
delete process.env['LLM_API_KEY'];

beforeEach(() => {
  vi.clearAllMocks();
});

const FARM_ID = 'f0000000-0000-0000-0000-000000000001';
const TEST_USER_ID = 'test-cognito-sub-001';

function authHeaders(): Record<string, string> {
  const payload = btoa(JSON.stringify({ sub: TEST_USER_ID, email: 'test@example.com' }))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  return { Authorization: `Bearer aaa.${payload}.sig` };
}

// ── Validation ────────────────────────────────────────────────────

describe('POST /api/v1/chat validation', () => {
  it('rejects empty message → 400', async () => {
    const res = await app.request('/api/v1/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ message: '' }),
    });
    expect(res.status).toBe(400);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects missing message → 400', async () => {
    const res = await app.request('/api/v1/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it('rejects message > 2000 chars → 400', async () => {
    const res = await app.request('/api/v1/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ message: 'x'.repeat(2001) }),
    });
    expect(res.status).toBe(400);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('accepts message at exactly 2000 chars → 200 (stub mode)', async () => {
    const res = await app.request('/api/v1/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ message: 'x'.repeat(2000) }),
    });
    expect(res.status).toBe(200);
  });

  it('rejects whitespace-only message → 400', async () => {
    const res = await app.request('/api/v1/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ message: '   ' }),
    });
    expect(res.status).toBe(400);
  });
});

// ── Stub mode (no LLM_API_KEY) ────────────────────────────────────

describe('POST /api/v1/chat stub mode', () => {
  it('returns 200 with stub reply when no API key', async () => {
    const res = await app.request('/api/v1/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ message: 'What should I plant?' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as {
      reply: string;
      suggestions: string[];
      conversation_id: string;
    };
    expect(typeof body.reply).toBe('string');
    expect(body.reply.length).toBeGreaterThan(0);
    expect(Array.isArray(body.suggestions)).toBe(true);
    expect(typeof body.conversation_id).toBe('string');
    expect(body.conversation_id).toMatch(/^conv-/);
  });

  it('stub reply mentions no API key configured', async () => {
    const res = await app.request('/api/v1/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ message: 'Help me plan crops' }),
    });
    const body = await res.json() as { reply: string };
    expect(body.reply).toContain('LLM_API_KEY');
  });
});

// ── parseSuggestions behavior (tested via the route) ─────────────

describe('POST /api/v1/chat with farm_id context', () => {
  it('returns 200 without error when farm not found (non-fatal)', async () => {
    vi.mocked(dynamoRepo.getFarm).mockRejectedValue(new Error('Not found'));

    const res = await app.request('/api/v1/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ message: 'Help me', farm_id: FARM_ID }),
    });
    expect(res.status).toBe(200);
  });

  it('stub suggestions are an array of strings', async () => {
    const res = await app.request('/api/v1/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ message: 'Hello' }),
    });
    const body = await res.json() as { suggestions: string[] };
    expect(body.suggestions.every((s) => typeof s === 'string')).toBe(true);
    expect(body.suggestions.length).toBeGreaterThan(0);
  });
});

// ── Budget integration ─────────────────────────────────────────────
// These tests set LLM_API_KEY so the budget/rate-limit code path is reached.
// LLM fetch is stubbed to avoid real API calls.

import { checkBudget, recordUsage } from '../../services/budget';

describe('POST /api/v1/chat budget controls', () => {
  beforeEach(() => {
    process.env['LLM_API_KEY'] = 'test-key';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        content: [{ type: 'text', text: 'Plant tomatoes!\nSUGGESTIONS: ["How deep?", "When?"]' }],
        usage: { input_tokens: 250, output_tokens: 80 },
      }),
    }));
  });

  afterEach(() => {
    delete process.env['LLM_API_KEY'];
    vi.unstubAllGlobals();
    vi.mocked(checkBudget).mockResolvedValue({
      allowed: true,
      user_record: { input_tokens_used: 0, output_tokens_used: 0, messages_sent: 0 },
      global_record: { input_tokens_used: 0, output_tokens_used: 0, messages_sent: 0 },
    });
  });

  it('budget exceeded (user scope) → 429 BUDGET_EXCEEDED with details', async () => {
    vi.mocked(checkBudget).mockResolvedValue({
      allowed: false,
      scope: 'user',
      reset_at: '2026-03-21T00:00:00.000Z',
      user_record: { input_tokens_used: 49700, output_tokens_used: 9950, messages_sent: 20 },
      global_record: { input_tokens_used: 0, output_tokens_used: 0, messages_sent: 0 },
    });

    const res = await app.request('/api/v1/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ message: 'What should I plant?' }),
    });
    expect(res.status).toBe(429);
    const body = await res.json() as { error: { code: string; details: Record<string, unknown> } };
    expect(body.error.code).toBe('BUDGET_EXCEEDED');
    expect(body.error.details.scope).toBe('user');
    expect(body.error.details.reset_at).toBe('2026-03-21T00:00:00.000Z');
    expect(typeof body.error.details.input_tokens_used).toBe('number');
    expect(typeof body.error.details.output_tokens_used).toBe('number');
  });

  it('budget exceeded (global scope) → 429 BUDGET_EXCEEDED with scope: global', async () => {
    vi.mocked(checkBudget).mockResolvedValue({
      allowed: false,
      scope: 'global',
      reset_at: '2026-03-21T00:00:00.000Z',
      user_record: { input_tokens_used: 100, output_tokens_used: 50, messages_sent: 1 },
      global_record: { input_tokens_used: 499700, output_tokens_used: 0, messages_sent: 200 },
    });

    const res = await app.request('/api/v1/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ message: 'What should I plant?' }),
    });
    expect(res.status).toBe(429);
    const body = await res.json() as { error: { code: string; details: Record<string, unknown> } };
    expect(body.error.code).toBe('BUDGET_EXCEEDED');
    expect(body.error.details.scope).toBe('global');
  });

  it('no LLM call made when budget exceeded', async () => {
    vi.mocked(checkBudget).mockResolvedValue({
      allowed: false,
      scope: 'user',
      reset_at: '2026-03-21T00:00:00.000Z',
      user_record: { input_tokens_used: 50000, output_tokens_used: 10000, messages_sent: 25 },
      global_record: { input_tokens_used: 0, output_tokens_used: 0, messages_sent: 0 },
    });

    await app.request('/api/v1/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ message: 'What should I plant?' }),
    });
    // fetch (LLM) should NOT have been called
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it('successful chat calls recordUsage with actual token counts', async () => {
    vi.mocked(checkBudget).mockResolvedValue({ allowed: true });

    await app.request('/api/v1/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ message: 'What should I plant?' }),
    });

    // Allow the async recordUsage fire-and-forget to settle
    await new Promise((r) => setTimeout(r, 10));
    expect(recordUsage).toHaveBeenCalledWith(TEST_USER_ID, {
      input_tokens: 250,
      output_tokens: 80,
    });
  });
});

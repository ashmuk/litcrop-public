import { TEST_USER_ID, authHeaders } from '../helpers/auth';
import { MockAPIError, createSdkMock } from '../helpers/anthropic';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import app from '../../app';
import { dynamoRepo } from '../../services/dynamodb';
import { rateLimitStore } from '../../routes/chat';

// ── SDK mock setup (must use vi.hoisted so the factory can reference mockCreate) ──

const { mockCreate } = vi.hoisted(() => ({ mockCreate: vi.fn() }));

vi.mock('@anthropic-ai/sdk', () => createSdkMock(mockCreate));

vi.mock('../../services/dynamodb', () => ({
  dynamoRepo: {
    getFarm: vi.fn(),
    getFarmMembership: vi.fn(),
    getBedsForFarm: vi.fn(),
    getConversationHistory: vi.fn().mockResolvedValue([]),
    saveConversationHistory: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../services/budget', () => ({
  checkBudget: vi.fn().mockResolvedValue({
    allowed: true,
    user_record: { input_tokens_used: 0, output_tokens_used: 0, messages_sent: 0 },
    global_record: { input_tokens_used: 0, output_tokens_used: 0, messages_sent: 0 },
  }),
  recordUsage: vi.fn().mockResolvedValue(undefined),
  getUsage: vi.fn(),
  MESSAGES_PER_HOUR_LIMIT: 20,
  CHAT_MODEL: 'claude-haiku-4-5-20251001',
  todayUtc: vi.fn().mockReturnValue('2026-03-20'),
  nextMidnightUtc: vi.fn().mockReturnValue('2026-03-21T00:00:00.000Z'),
  todayStartUtc: vi.fn().mockReturnValue('2026-03-20T00:00:00.000Z'),
}));

// Ensure LLM_API_KEY is not set for stub mode tests
delete process.env['LLM_API_KEY'];

beforeEach(() => {
  vi.clearAllMocks();
  rateLimitStore.clear();
  // Default: user is a member of any farm they access
  vi.mocked(dynamoRepo.getFarmMembership).mockResolvedValue({
    user_id: TEST_USER_ID,
    farm_id: FARM_ID,
    role: 'owner' as const,
    joined_at: '2026-03-17T00:00:00.000Z',
  });
});

const FARM_ID = 'f0000000-0000-0000-0000-000000000001';

// Reusable SDK success response
const MOCK_SDK_SUCCESS = {
  content: [{ type: 'text', text: 'Plant tomatoes!\nSUGGESTIONS: ["How deep?", "When?"]' }],
  stop_reason: 'end_turn',
  usage: { input_tokens: 250, output_tokens: 80 },
};

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

  it('stub reply does not contain developer text', async () => {
    const res = await app.request('/api/v1/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ message: 'Help me plan crops' }),
    });
    const body = await res.json() as { reply: string };
    expect(body.reply).not.toContain('LLM_API_KEY');
    expect(body.reply.length).toBeGreaterThan(0);
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

import { checkBudget, recordUsage } from '../../services/budget';

describe('POST /api/v1/chat budget controls', () => {
  beforeEach(() => {
    process.env['LLM_API_KEY'] = 'test-key';
    mockCreate.mockResolvedValue(MOCK_SDK_SUCCESS);
  });

  afterEach(() => {
    delete process.env['LLM_API_KEY'];
    mockCreate.mockReset();
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
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('successful chat calls recordUsage with actual token counts', async () => {
    vi.mocked(checkBudget).mockResolvedValue({ allowed: true });

    await app.request('/api/v1/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ message: 'What should I plant?' }),
    });

    // Allow the async recordUsage fire-and-forget to settle
    await vi.waitFor(() => {
      expect(recordUsage).toHaveBeenCalledWith(TEST_USER_ID, {
        input_tokens: 250,
        output_tokens: 80,
      });
    });
  });
});

// ── Rate limiting ──────────────────────────────────────────────────

describe('POST /api/v1/chat rate limiting', () => {
  beforeEach(() => {
    process.env['LLM_API_KEY'] = 'test-key';
    mockCreate.mockResolvedValue(MOCK_SDK_SUCCESS);
  });

  afterEach(() => {
    delete process.env['LLM_API_KEY'];
    mockCreate.mockReset();
  });

  it('rate limit exceeded → 429 RATE_LIMITED', async () => {
    // Pre-fill rateLimitStore with 20 recent timestamps (within 1 hour)
    rateLimitStore.set(TEST_USER_ID, Array.from({ length: 20 }, () => Date.now() - 100));

    const res = await app.request('/api/v1/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ message: 'What should I plant?' }),
    });
    expect(res.status).toBe(429);
    const body = await res.json() as { error: { code: string; details: Record<string, unknown> } };
    expect(body.error.code).toBe('RATE_LIMITED');
    expect(typeof body.error.details.retry_after_seconds).toBe('number');
  });
});

// ── Tool use ──────────────────────────────────────────────────────

describe('POST /api/v1/chat tool use', () => {
  const MOCK_FARM = {
    id: FARM_ID,
    user_id: TEST_USER_ID,
    name: 'Test Farm',
    location_text: 'Nagano, Japan',
    latitude: 36.65,
    longitude: 138.18,
    elevation_m: 450,
    climate_zone: 'humid-subtropical',
    locale: 'ja',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };

  beforeEach(() => {
    process.env['LLM_API_KEY'] = 'test-key';
    vi.mocked(dynamoRepo.getFarm).mockResolvedValue(MOCK_FARM as never);
    vi.mocked(dynamoRepo.getBedsForFarm).mockResolvedValue([]);
  });

  afterEach(() => {
    delete process.env['LLM_API_KEY'];
    mockCreate.mockReset();
  });

  it('get_farm_data tool use → resolves and returns 200', async () => {
    // First SDK call: tool_use; Second SDK call: final text
    mockCreate
      .mockResolvedValueOnce({
        content: [{
          type: 'tool_use',
          id: 'tu_farm_001',
          name: 'get_farm_data',
          input: { farm_id: FARM_ID },
        }],
        stop_reason: 'tool_use',
        usage: { input_tokens: 100, output_tokens: 20 },
      })
      .mockResolvedValueOnce({
        content: [{ type: 'text', text: 'Your farm grows tomatoes!\nSUGGESTIONS: ["Watering?", "Pests?"]' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 150, output_tokens: 60 },
      });

    const res = await app.request('/api/v1/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ message: 'Tell me about my farm', farm_id: FARM_ID }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { reply: string; suggestions: string[] };
    expect(body.reply).toContain('tomatoes');
    // SDK should have been called twice (tool use loop)
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it('get_weather tool use → calls open-meteo fetch and returns 200', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ current: { temperature_2m: 18 } }),
    }));

    mockCreate
      .mockResolvedValueOnce({
        content: [{
          type: 'tool_use',
          id: 'tu_weather_001',
          name: 'get_weather',
          input: { farm_id: FARM_ID },
        }],
        stop_reason: 'tool_use',
        usage: { input_tokens: 100, output_tokens: 20 },
      })
      .mockResolvedValueOnce({
        content: [{ type: 'text', text: 'Today is 18°C, good for planting.\nSUGGESTIONS: ["Rain?", "Frost?"]' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 180, output_tokens: 70 },
      });

    const res = await app.request('/api/v1/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ message: "What's the weather?", farm_id: FARM_ID }),
    });
    expect(res.status).toBe(200);
    expect(mockCreate).toHaveBeenCalledTimes(2);
    vi.unstubAllGlobals();
  });
});

// ── Multi-turn conversation ───────────────────────────────────────

describe('POST /api/v1/chat multi-turn', () => {
  beforeEach(() => {
    process.env['LLM_API_KEY'] = 'test-key';
    mockCreate.mockResolvedValue(MOCK_SDK_SUCCESS);
  });

  afterEach(() => {
    delete process.env['LLM_API_KEY'];
    mockCreate.mockReset();
  });

  it('loads conversation history and passes it to SDK', async () => {
    const CONV_ID = 'conv-existing-123';
    const storedHistory = [
      { role: 'user' as const, content: 'First question' },
      { role: 'assistant' as const, content: 'First answer' },
    ];
    vi.mocked(dynamoRepo.getConversationHistory).mockResolvedValue(storedHistory);

    const res = await app.request('/api/v1/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ message: 'Follow-up question', conversation_id: CONV_ID }),
    });
    expect(res.status).toBe(200);

    // Verify conversation_id echoed back
    const body = await res.json() as { conversation_id: string };
    expect(body.conversation_id).toBe(CONV_ID);

    // Verify SDK received the prior history in the messages array
    const callArgs = mockCreate.mock.calls[0][0] as { messages: unknown[] };
    expect(callArgs.messages.length).toBeGreaterThanOrEqual(3); // 2 history + 1 new user turn
  });

  it('turn limit exceeded (20 user turns) → 429 RATE_LIMITED', async () => {
    const CONV_ID = 'conv-full-123';
    // Build a history of 20 user turns (each followed by an assistant reply)
    const fullHistory = Array.from({ length: 20 }, (_, i) => ([
      { role: 'user' as const, content: `Question ${i + 1}` },
      { role: 'assistant' as const, content: `Answer ${i + 1}` },
    ])).flat();
    vi.mocked(dynamoRepo.getConversationHistory).mockResolvedValue(fullHistory);

    const res = await app.request('/api/v1/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ message: 'One more question', conversation_id: CONV_ID }),
    });
    expect(res.status).toBe(429);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('RATE_LIMITED');
  });
});

// ── SDK error handling ────────────────────────────────────────────

describe('POST /api/v1/chat SDK error handling', () => {
  beforeEach(() => {
    process.env['LLM_API_KEY'] = 'test-key';
  });

  afterEach(() => {
    delete process.env['LLM_API_KEY'];
    mockCreate.mockReset();
  });

  it('SDK non-429 error → 502 UPSTREAM_ERROR', async () => {
    mockCreate.mockRejectedValue(new MockAPIError(500, 'Internal Server Error'));

    const res = await app.request('/api/v1/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ message: 'What should I plant?' }),
    });
    expect(res.status).toBe(502);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('UPSTREAM_ERROR');
  });
});

// ── #277 Chat with no coordinates ──────────────────────────────────

describe('POST /api/v1/chat — no coordinates (#277)', () => {
  const FARM_ID = 'cf000000-0000-0000-0000-000000000001';

  beforeEach(() => { process.env['LLM_API_KEY'] = 'test-key'; });
  afterEach(() => { delete process.env['LLM_API_KEY']; });

  it('returns 200 with generic advice when farm has no coordinates', async () => {
    vi.mocked(dynamoRepo.getFarm).mockResolvedValue({
      id: FARM_ID,
      user_id: TEST_USER_ID,
      name: 'No-Geo Farm',
      location_text: 'Chichibu, Saitama',
      latitude: undefined,
      longitude: undefined,
      locale: 'en',
      theme: 'system',
      grid_rows: 1,
      grid_cols: 1,
      created_at: '2026-01-01T00:00:00.000Z',
    });
    vi.mocked(dynamoRepo.getFarmMembership).mockResolvedValue({
      user_id: TEST_USER_ID,
      farm_id: FARM_ID,
      role: 'owner',
      joined_at: '2026-01-01T00:00:00.000Z',
    });
    vi.mocked(dynamoRepo.getBedsForFarm).mockResolvedValue([]);

    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'General advice here.\nSUGGESTIONS: ["What crops grow well?"]' }],
      usage: { input_tokens: 100, output_tokens: 50 },
    });

    const res = await app.request('/api/v1/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ message: 'What should I plant?', farm_id: FARM_ID }),
    });
    expect(res.status).toBe(200);

    // Verify the SDK was called (system prompt contains location fallback)
    expect(mockCreate).toHaveBeenCalledOnce();
    const callArgs = mockCreate.mock.calls[0][0] as Record<string, unknown>;
    const system = String(callArgs['system'] ?? '');
    expect(system).toContain('Chichibu, Saitama');
    expect(system).toContain('coordinates not set');
  });
});

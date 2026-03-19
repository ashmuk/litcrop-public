import { describe, it, expect, vi, beforeEach } from 'vitest';
import app from '../../app';
import { dynamoRepo } from '../../services/dynamodb';

vi.mock('../../services/dynamodb', () => ({
  dynamoRepo: {
    getFarm: vi.fn(),
    getPlotsForFarm: vi.fn(),
  },
}));

// Ensure LLM_API_KEY is not set for stub mode tests
delete process.env['LLM_API_KEY'];

beforeEach(() => {
  vi.clearAllMocks();
});

const FARM_ID = 'f0000000-0000-0000-0000-000000000001';

// ── Validation ────────────────────────────────────────────────────

describe('POST /api/v1/chat validation', () => {
  it('rejects empty message → 400', async () => {
    const res = await app.request('/api/v1/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: '' }),
    });
    expect(res.status).toBe(400);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects missing message → 400', async () => {
    const res = await app.request('/api/v1/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it('rejects message > 2000 chars → 400', async () => {
    const res = await app.request('/api/v1/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'x'.repeat(2001) }),
    });
    expect(res.status).toBe(400);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('accepts message at exactly 2000 chars → 200 (stub mode)', async () => {
    const res = await app.request('/api/v1/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'x'.repeat(2000) }),
    });
    expect(res.status).toBe(200);
  });

  it('rejects whitespace-only message → 400', async () => {
    const res = await app.request('/api/v1/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
      headers: { 'Content-Type': 'application/json' },
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
      headers: { 'Content-Type': 'application/json' },
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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Help me', farm_id: FARM_ID }),
    });
    expect(res.status).toBe(200);
  });

  it('stub suggestions are an array of strings', async () => {
    const res = await app.request('/api/v1/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Hello' }),
    });
    const body = await res.json() as { suggestions: string[] };
    expect(body.suggestions.every((s) => typeof s === 'string')).toBe(true);
    expect(body.suggestions.length).toBeGreaterThan(0);
  });
});

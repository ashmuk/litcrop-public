import { describe, it, expect } from 'vitest';
import app from '../../app';

describe('GET /api/v1/crop-library', () => {
  it('returns all crops with 200', async () => {
    const res = await app.request('/api/v1/crop-library');
    expect(res.status).toBe(200);
    const body = await res.json() as { data: unknown[] };
    expect(body.data).toBeInstanceOf(Array);
    expect(body.data.length).toBe(100);
  });

  it('sets Cache-Control header', async () => {
    const res = await app.request('/api/v1/crop-library');
    expect(res.headers.get('Cache-Control')).toContain('max-age=86400');
  });
});

describe('GET /api/v1/crop-library/:cropId', () => {
  it('returns crop metadata for known crop', async () => {
    const res = await app.request('/api/v1/crop-library/tomato');
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body['id']).toBe('tomato');
    expect(body['en']).toBe('Tomato');
    expect(body['emoji']).toBe('🍅');
    expect(body['days_to_harvest_min']).toBeGreaterThan(0);
    expect(body['season']).toBeInstanceOf(Array);
    expect(body['companions']).toBeInstanceOf(Array);
  });

  it('returns 404 for unknown crop', async () => {
    const res = await app.request('/api/v1/crop-library/unicorn_fruit');
    expect(res.status).toBe(404);
  });

  it('returns crop without metadata fields for "other"', async () => {
    const res = await app.request('/api/v1/crop-library/other');
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body['id']).toBe('other');
    expect(body['days_to_harvest_min']).toBeUndefined();
  });

  it('does not require authentication', async () => {
    // No auth headers — should still work
    const res = await app.request('/api/v1/crop-library/rice');
    expect(res.status).toBe(200);
  });
});

import { authHeaders } from '../helpers/auth';
import { describe, it, expect, vi } from 'vitest';
import app from '../../app';

vi.mock('../../services/dynamodb', () => ({
  dynamoRepo: {},
}));

vi.mock('../../services/s3', () => ({
  getSignedImageUrl: vi.fn(),
  getSignedThumbnailUrl: vi.fn(),
  uploadImage: vi.fn(),
}));

const PLOT_ID = 'a0000000-0000-0000-0000-000000000001';

// ── All plot routes return 410 Gone (Phase D migration) ──────────

describe('GET /api/v1/plots/:plotId', () => {
  it('returns 410 Gone', async () => {
    const res = await app.request(`/api/v1/plots/${PLOT_ID}`, { headers: authHeaders() });
    expect(res.status).toBe(410);
    const body = await res.json() as { error: { message: string } };
    expect(body.error.message).toContain('/api/v1/beds/');
  });
});

describe('GET /api/v1/plots/:plotId/images', () => {
  it('returns 410 Gone', async () => {
    const res = await app.request(`/api/v1/plots/${PLOT_ID}/images`, { headers: authHeaders() });
    expect(res.status).toBe(410);
  });
});

describe('POST /api/v1/plots/:plotId/images', () => {
  it('returns 410 Gone', async () => {
    const formData = new FormData();
    formData.append('image', new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: 'image/jpeg' }), 'test.jpg');
    const res = await app.request(`/api/v1/plots/${PLOT_ID}/images`, {
      method: 'POST',
      headers: authHeaders(),
      body: formData,
    });
    expect(res.status).toBe(410);
  });
});

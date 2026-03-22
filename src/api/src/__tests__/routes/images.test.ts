import { TEST_USER_ID, authHeaders } from '../helpers/auth';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import app from '../../app';
import { dynamoRepo } from '../../services/dynamodb';
import { getSignedImageUrl, getSignedThumbnailUrl } from '../../services/s3';
import { NotFoundError } from '../../errors';
import type { Image, Tag } from '@litcrop/shared';

vi.mock('../../services/dynamodb', () => ({
  dynamoRepo: {
    getImageById: vi.fn(),
    getTagsForImage: vi.fn(),
    createTag: vi.fn(),
    // Ownership chain: image → plot → farm → membership
    getPlotById: vi.fn(),
    getFarm: vi.fn(),
    getFarmMembership: vi.fn(),
  },
}));

vi.mock('../../services/s3', () => ({
  getSignedImageUrl: vi.fn(),
  getSignedThumbnailUrl: vi.fn(),
  uploadImage: vi.fn(),
}));

const FARM_ID = 'f0000000-0000-0000-0000-000000000001';
const PLOT_ID = 'a0000000-0000-0000-0000-000000000001';
const IMAGE_ID = 'e0000000-0000-0000-0000-000000000001';
const TAG_ID = 't0000000-0000-0000-0000-000000000001';
const BED_ID = 'b0000000-0000-0000-0000-000000000001';

// Ownership chain fixtures
const plotForOwnership = {
  id: PLOT_ID,
  bed_id: BED_ID,
  farm_id: FARM_ID,
  label: 'P1',
  crop_type: 'tomato',
  crop_variety: 'Cherry',
  planted_at: '2026-03-01',
  expected_harvest: '2026-07-01',
  latest_status: 'no_data' as const,
};
const farmForOwnership = {
  id: FARM_ID,
  user_id: TEST_USER_ID,
  name: 'Test Farm',
  latitude: 36.0,
  longitude: 138.0,
  locale: 'en' as const,
  theme: 'system' as const,
  created_at: '2026-03-17T00:00:00.000Z',
};

const imageFixture: Image = {
  id: IMAGE_ID,
  plot_id: PLOT_ID,
  bed_id: BED_ID,  // SF-4: denormalized at write time
  node_id: 'cam-001',
  captured_at: '2026-03-17T10:00:00.000Z',
  uploaded_at: '2026-03-17T10:00:05.000Z',
  storage_key: `images/${FARM_ID}/${PLOT_ID}/2026/03/17/${IMAGE_ID}.jpg`,
  trigger: 'scheduled',
  content_type: 'image/jpeg',
  size_bytes: 102400,
};

const tagFixture: Tag = {
  id: TAG_ID,
  image_id: IMAGE_ID,
  tag: 'healthy',
  created_at: '2026-03-17T11:00:00.000Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSignedImageUrl).mockResolvedValue('https://example.com/signed');
  vi.mocked(getSignedThumbnailUrl).mockResolvedValue('https://example.com/thumb-signed');
  // Ownership chain defaults (image → plot → farm → membership)
  vi.mocked(dynamoRepo.getPlotById).mockResolvedValue(plotForOwnership);
  vi.mocked(dynamoRepo.getFarm).mockResolvedValue(farmForOwnership);
  vi.mocked(dynamoRepo.getFarmMembership).mockResolvedValue({
    user_id: TEST_USER_ID,
    farm_id: FARM_ID,
    role: 'manager' as const,
    joined_at: '2026-03-17T00:00:00.000Z',
  });
});

// ── GET /api/v1/images/:imageId ───────────────────────────────────

describe('GET /api/v1/images/:imageId', () => {
  it('returns 200 with image detail and signed URL', async () => {
    vi.mocked(dynamoRepo.getImageById).mockResolvedValue(imageFixture);
    vi.mocked(dynamoRepo.getTagsForImage).mockResolvedValue([]);

    const res = await app.request(`/api/v1/images/${IMAGE_ID}`, { headers: authHeaders() });
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body['id']).toBe(IMAGE_ID);
    expect(body['url']).toBe('https://example.com/signed');
    expect(body['trigger']).toBe('scheduled');
    expect(body['tags']).toEqual([]);
    expect(body['storage_key']).toBeUndefined();
  });

  it('returns 404 when image not found', async () => {
    vi.mocked(dynamoRepo.getImageById).mockRejectedValue(new NotFoundError('Image not found'));
    const res = await app.request(`/api/v1/images/${IMAGE_ID}`, { headers: authHeaders() });
    expect(res.status).toBe(404);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('returns thumbnail_url: null when no thumbnail_key', async () => {
    vi.mocked(dynamoRepo.getImageById).mockResolvedValue(imageFixture);
    vi.mocked(dynamoRepo.getTagsForImage).mockResolvedValue([]);

    const res = await app.request(`/api/v1/images/${IMAGE_ID}`, { headers: authHeaders() });
    const body = await res.json() as Record<string, unknown>;
    expect(body['thumbnail_url']).toBeNull();
  });

  it('returns thumbnail_url when thumbnail_key present', async () => {
    const thumbnailKey = `thumbnails/${FARM_ID}/${PLOT_ID}/2026/03/17/${IMAGE_ID}.jpg`;
    vi.mocked(dynamoRepo.getImageById).mockResolvedValue({ ...imageFixture, thumbnail_key: thumbnailKey });
    vi.mocked(dynamoRepo.getTagsForImage).mockResolvedValue([]);

    const res = await app.request(`/api/v1/images/${IMAGE_ID}`, { headers: authHeaders() });
    const body = await res.json() as Record<string, unknown>;
    expect(body['thumbnail_url']).toBe('https://example.com/thumb-signed');
  });

  it('includes tags in response', async () => {
    vi.mocked(dynamoRepo.getImageById).mockResolvedValue(imageFixture);
    vi.mocked(dynamoRepo.getTagsForImage).mockResolvedValue([tagFixture]);

    const res = await app.request(`/api/v1/images/${IMAGE_ID}`, { headers: authHeaders() });
    const body = await res.json() as { tags: Array<{ tag: string }> };
    expect(body.tags).toHaveLength(1);
    expect(body.tags[0].tag).toBe('healthy');
  });
});

// ── POST /api/v1/images/:imageId/tags ────────────────────────────

describe('POST /api/v1/images/:imageId/tags', () => {
  it('creates valid tag → 201 with plot_status_updated: true', async () => {
    vi.mocked(dynamoRepo.getImageById).mockResolvedValue(imageFixture);
    vi.mocked(dynamoRepo.createTag).mockResolvedValue(tagFixture);

    const res = await app.request(`/api/v1/images/${IMAGE_ID}/tags`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ tag: 'healthy', note: 'Looking good' }),
    });
    expect(res.status).toBe(201);
    const body = await res.json() as { plot_status_updated: boolean; tag: string };
    expect(body.plot_status_updated).toBe(true);
    expect(body.tag).toBe('healthy');
  });

  it('rejects missing tag → 400', async () => {
    const res = await app.request(`/api/v1/images/${IMAGE_ID}/tags`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects invalid tag value → 400', async () => {
    const res = await app.request(`/api/v1/images/${IMAGE_ID}/tags`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ tag: 'no_data' }),
    });
    expect(res.status).toBe(400);
  });

  it('rejects note > 500 chars → 400', async () => {
    vi.mocked(dynamoRepo.getImageById).mockResolvedValue(imageFixture);
    const res = await app.request(`/api/v1/images/${IMAGE_ID}/tags`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ tag: 'healthy', note: 'x'.repeat(501) }),
    });
    expect(res.status).toBe(400);
  });

  it('accepts all valid tag values', async () => {
    const validTags = ['healthy', 'slow_growth', 'issue', 'animal_intrusion'];
    for (const tag of validTags) {
      vi.mocked(dynamoRepo.getImageById).mockResolvedValue(imageFixture);
      vi.mocked(dynamoRepo.createTag).mockResolvedValue({ ...tagFixture, tag: tag as typeof tagFixture.tag });

      const res = await app.request(`/api/v1/images/${IMAGE_ID}/tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ tag }),
      });
      expect(res.status).toBe(201);
    }
  });

  it('observer cannot POST tag → 404', async () => {
    vi.mocked(dynamoRepo.getImageById).mockResolvedValue(imageFixture);
    vi.mocked(dynamoRepo.getFarmMembership).mockResolvedValue({
      user_id: TEST_USER_ID,
      farm_id: FARM_ID,
      role: 'observer' as const,
      joined_at: '2026-03-17T00:00:00.000Z',
    });

    const res = await app.request(`/api/v1/images/${IMAGE_ID}/tags`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ tag: 'healthy' }),
    });
    expect(res.status).toBe(404);
  });
});

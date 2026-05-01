import { TEST_USER_ID, authHeaders } from '../helpers/auth';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import app from '../../app';
import { dynamoRepo } from '../../services/dynamodb';
import {
  getSignedImageUrl,
  getSignedThumbnailUrl,
  deleteImage as s3DeleteImage,
  deleteThumbnail as s3DeleteThumbnail,
} from '../../services/s3';
import { appEvents } from '../../services/events';
import { NotFoundError } from '../../errors';
import type { Image, Tag, Bed } from '@litcrop/shared';

vi.mock('../../services/dynamodb', () => ({
  dynamoRepo: {
    getImageById: vi.fn(),
    getTagsForImage: vi.fn(),
    createTag: vi.fn(),
    deleteImage: vi.fn(),
    // Ownership chain: image → bed → farm → membership
    getBedById: vi.fn(),
    getFarm: vi.fn(),
    getFarmMembership: vi.fn(),
  },
}));

vi.mock('../../services/s3', () => ({
  getSignedImageUrl: vi.fn(),
  getSignedThumbnailUrl: vi.fn(),
  uploadImage: vi.fn(),
  deleteImage: vi.fn(),
  deleteThumbnail: vi.fn(),
}));

const FARM_ID = 'f0000000-0000-0000-0000-000000000001';
const BED_ID = 'b0000000-0000-0000-0000-000000000001';
const IMAGE_ID = 'e0000000-0000-0000-0000-000000000001';
const TAG_ID = 't0000000-0000-0000-0000-000000000001';

// Ownership chain fixtures
const bedForOwnership: Bed = {
  id: BED_ID,
  farm_id: FARM_ID,
  row: 1,
  col: 1,
  name: 'A1',
  crop_type: 'tomato',
  crop_variety: 'Cherry',
  latest_status: 'no_data',
};
const farmForOwnership = {
  id: FARM_ID,
  user_id: TEST_USER_ID,
  name: 'Test Farm',
  location_text: 'Test Location',
  latitude: 36.0,
  longitude: 138.0,
  locale: 'en' as const,
  theme: 'system' as const,
  grid_rows: 1,
  grid_cols: 1,
  created_at: '2026-03-17T00:00:00.000Z',
  default_currency: 'JPY' as const,
};

const imageFixture: Image = {
  id: IMAGE_ID,
  bed_id: BED_ID,
  node_id: 'cam-001',
  captured_at: '2026-03-17T10:00:00.000Z',
  uploaded_at: '2026-03-17T10:00:05.000Z',
  storage_key: `images/${FARM_ID}/${BED_ID}/2026/03/17/${IMAGE_ID}.jpg`,
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
  // Ownership chain defaults (image → bed → farm → membership)
  vi.mocked(dynamoRepo.getBedById).mockResolvedValue(bedForOwnership);
  vi.mocked(dynamoRepo.getFarm).mockResolvedValue(farmForOwnership);
  vi.mocked(dynamoRepo.getFarmMembership).mockResolvedValue({
    user_id: TEST_USER_ID,
    farm_id: FARM_ID,
    role: 'owner' as const,
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
    expect(body['bed_id']).toBe(BED_ID);
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
    const thumbnailKey = `thumbnails/${FARM_ID}/${BED_ID}/2026/03/17/${IMAGE_ID}.jpg`;
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

  // #462 Phase 1 tail — response contract for uploaded_by
  // Phase 3/4 will consume uploaded_by from this endpoint. These two cases
  // guard the response shape: a value is returned as-is, and a legacy record
  // (uploaded_by absent from DDB) returns explicit null, not undefined.
  it('includes uploaded_by in response when set (#462)', async () => {
    vi.mocked(dynamoRepo.getImageById).mockResolvedValue({
      ...imageFixture,
      uploaded_by: 'some-cognito-sub',
    });
    vi.mocked(dynamoRepo.getTagsForImage).mockResolvedValue([]);

    const res = await app.request(`/api/v1/images/${IMAGE_ID}`, { headers: authHeaders() });
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body['uploaded_by']).toBe('some-cognito-sub');
  });

  it('returns uploaded_by: null for legacy records without the field (#462)', async () => {
    // imageFixture has no uploaded_by (simulates pre-v0.99.7.3 DDB record)
    vi.mocked(dynamoRepo.getImageById).mockResolvedValue(imageFixture);
    vi.mocked(dynamoRepo.getTagsForImage).mockResolvedValue([]);

    const res = await app.request(`/api/v1/images/${IMAGE_ID}`, { headers: authHeaders() });
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    // Must be explicit null — not undefined, not absent — so Phase 3 can
    // distinguish "not set" from "missing" when building the activity feed.
    expect(Object.prototype.hasOwnProperty.call(body, 'uploaded_by')).toBe(true);
    expect(body['uploaded_by']).toBeNull();
  });
});

// ── POST /api/v1/images/:imageId/tags ────────────────────────────

describe('POST /api/v1/images/:imageId/tags', () => {
  it('creates valid tag → 201 with bed_status_updated: true', async () => {
    vi.mocked(dynamoRepo.getImageById).mockResolvedValue(imageFixture);
    vi.mocked(dynamoRepo.createTag).mockResolvedValue(tagFixture);

    const res = await app.request(`/api/v1/images/${IMAGE_ID}/tags`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ tag: 'healthy', note: 'Looking good' }),
    });
    expect(res.status).toBe(201);
    const body = await res.json() as { bed_status_updated: boolean; tag: string };
    expect(body.bed_status_updated).toBe(true);
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

  it('staff can POST tag → 201', async () => {
    vi.mocked(dynamoRepo.getImageById).mockResolvedValue(imageFixture);
    vi.mocked(dynamoRepo.getFarmMembership).mockResolvedValue({
      user_id: TEST_USER_ID,
      farm_id: FARM_ID,
      role: 'staff' as const,
      joined_at: '2026-03-17T00:00:00.000Z',
    });
    vi.mocked(dynamoRepo.createTag).mockResolvedValue(tagFixture);

    const res = await app.request(`/api/v1/images/${IMAGE_ID}/tags`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ tag: 'healthy' }),
    });
    expect(res.status).toBe(201);
  });
});

// ── DELETE /api/v1/images/:imageId (#478) ────────────────────────

describe('DELETE /api/v1/images/:imageId', () => {
  beforeEach(() => {
    vi.mocked(dynamoRepo.deleteImage).mockResolvedValue();
    vi.mocked(s3DeleteImage).mockResolvedValue();
    vi.mocked(s3DeleteThumbnail).mockResolvedValue();
  });

  it('owner happy path → 204 + DDB and S3 cleanup', async () => {
    vi.mocked(dynamoRepo.getImageById).mockResolvedValue(imageFixture);

    const res = await app.request(`/api/v1/images/${IMAGE_ID}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });

    expect(res.status).toBe(204);
    expect(dynamoRepo.deleteImage).toHaveBeenCalledWith(imageFixture);
    expect(s3DeleteImage).toHaveBeenCalledWith(imageFixture.storage_key);
    // No thumbnail_key on the fixture → deleteThumbnail not called
    expect(s3DeleteThumbnail).not.toHaveBeenCalled();
  });

  it('also deletes thumbnail when image has thumbnail_key', async () => {
    const thumbnailKey = `thumbnails/${FARM_ID}/${BED_ID}/2026/03/17/${IMAGE_ID}.jpg`;
    const withThumb = { ...imageFixture, thumbnail_key: thumbnailKey };
    vi.mocked(dynamoRepo.getImageById).mockResolvedValue(withThumb);

    const res = await app.request(`/api/v1/images/${IMAGE_ID}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });

    expect(res.status).toBe(204);
    expect(s3DeleteThumbnail).toHaveBeenCalledWith(thumbnailKey);
  });

  it('admin role → 204', async () => {
    vi.mocked(dynamoRepo.getImageById).mockResolvedValue(imageFixture);
    vi.mocked(dynamoRepo.getFarmMembership).mockResolvedValue({
      user_id: TEST_USER_ID,
      farm_id: FARM_ID,
      role: 'admin' as const,
      joined_at: '2026-03-17T00:00:00.000Z',
    });

    const res = await app.request(`/api/v1/images/${IMAGE_ID}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });

    expect(res.status).toBe(204);
    expect(dynamoRepo.deleteImage).toHaveBeenCalled();
  });

  it('staff role → 404 (codebase opacity convention) + no DDB/S3 mutation', async () => {
    vi.mocked(dynamoRepo.getImageById).mockResolvedValue(imageFixture);
    vi.mocked(dynamoRepo.getFarmMembership).mockResolvedValue({
      user_id: TEST_USER_ID,
      farm_id: FARM_ID,
      role: 'staff' as const,
      joined_at: '2026-03-17T00:00:00.000Z',
    });

    const res = await app.request(`/api/v1/images/${IMAGE_ID}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });

    expect(res.status).toBe(404);
    expect(dynamoRepo.deleteImage).not.toHaveBeenCalled();
    expect(s3DeleteImage).not.toHaveBeenCalled();
  });

  it('non-member → 404 + no mutation', async () => {
    vi.mocked(dynamoRepo.getImageById).mockResolvedValue(imageFixture);
    vi.mocked(dynamoRepo.getFarmMembership).mockResolvedValue(null);

    const res = await app.request(`/api/v1/images/${IMAGE_ID}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });

    expect(res.status).toBe(404);
    expect(dynamoRepo.deleteImage).not.toHaveBeenCalled();
  });

  it('image not found → 404', async () => {
    vi.mocked(dynamoRepo.getImageById).mockRejectedValue(new NotFoundError('Image not found'));

    const res = await app.request(`/api/v1/images/${IMAGE_ID}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });

    expect(res.status).toBe(404);
    expect(dynamoRepo.deleteImage).not.toHaveBeenCalled();
  });

  it('emits image.deleted event with payload', async () => {
    vi.mocked(dynamoRepo.getImageById).mockResolvedValue(imageFixture);
    const listener = vi.fn();
    appEvents.on('image.deleted', listener);

    const res = await app.request(`/api/v1/images/${IMAGE_ID}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });

    expect(res.status).toBe(204);
    // Wait one microtask flush for fire-and-forget emit
    await new Promise((r) => setImmediate(r));
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({
      type: 'image.deleted',
      actor_id: TEST_USER_ID,
      payload: expect.objectContaining({
        image_id: IMAGE_ID,
        bed_id: BED_ID,
        farm_id: FARM_ID,
        captured_at: imageFixture.captured_at,
      }),
    }));
    appEvents.off('image.deleted', listener);
  });

  it('S3 cleanup failure does NOT fail the delete (best-effort)', async () => {
    vi.mocked(dynamoRepo.getImageById).mockResolvedValue(imageFixture);
    vi.mocked(s3DeleteImage).mockRejectedValue(new Error('S3 unavailable'));

    const res = await app.request(`/api/v1/images/${IMAGE_ID}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });

    // DDB delete already succeeded; client sees 204 even if S3 cleanup fails.
    expect(res.status).toBe(204);
    expect(dynamoRepo.deleteImage).toHaveBeenCalled();
  });
});

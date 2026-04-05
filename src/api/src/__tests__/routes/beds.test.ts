import { TEST_USER_ID, authHeaders, makeAuthHeaders } from '../helpers/auth';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import app from '../../app';
import { dynamoRepo } from '../../services/dynamodb';
import { getSignedImageUrl, getSignedThumbnailUrl } from '../../services/s3';
import { NotFoundError } from '../../errors';
import type { Bed, Image, Tag } from '@litcrop/shared';

vi.mock('../../services/dynamodb', () => ({
  dynamoRepo: {
    getBedById: vi.fn(),
    updateBed: vi.fn(),
    getImagesForBed: vi.fn(),
    getLatestImageForBed: vi.fn(),
    getTagsForImage: vi.fn(),
    getLatestTagForImage: vi.fn(),
    createImage: vi.fn(),
    getFarm: vi.fn(),
    getFarmMembership: vi.fn(),
  },
}));

vi.mock('../../services/s3', () => ({
  getSignedImageUrl: vi.fn(),
  getSignedThumbnailUrl: vi.fn(),
  uploadImage: vi.fn(),
  deleteImage: vi.fn(),
  buildStorageKey: vi.fn().mockReturnValue('images/f0/bd0/2026/01/01/test-img.jpg'),
}));

const FARM_ID = 'f0000000-0000-0000-0000-000000000001';
const BED_ID = 'bd000000-0000-0000-0000-000000000001';
const IMAGE_ID = 'im000000-0000-0000-0000-000000000001';

const bedFixture: Bed = {
  id: BED_ID,
  farm_id: FARM_ID,
  row: 1,
  col: 1,
  name: 'A1',
  crop_type: 'tomato',
  crop_variety: 'Cherry',
  planted_at: '2026-03-01',
  expected_harvest: '2026-06-01',
  notes: 'Test notes',
  latest_status: 'healthy',
};

const imageFixture: Image = {
  id: IMAGE_ID,
  bed_id: BED_ID,
  node_id: 'node-01',
  captured_at: '2026-03-20T10:00:00.000Z',
  uploaded_at: '2026-03-20T10:01:00.000Z',
  storage_key: 'farms/f0/beds/bd0/img.jpg',
  thumbnail_key: 'farms/f0/beds/bd0/img_thumb.jpg',
  trigger: 'scheduled',
  content_type: 'image/jpeg',
  size_bytes: 102400,
};

const tagFixture: Tag = {
  id: 'tg000000-0000-0000-0000-000000000001',
  image_id: IMAGE_ID,
  tag: 'healthy',
  note: null as unknown as undefined,
  created_at: '2026-03-20T11:00:00.000Z',
};

const membershipFixture = {
  user_id: TEST_USER_ID,
  farm_id: FARM_ID,
  role: 'owner' as const,
  joined_at: '2026-03-17T00:00:00.000Z',
};

const farmFixture = {
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
};

beforeEach(() => {
  vi.clearAllMocks();
  // Default: user is a member of the test farm with manager role
  vi.mocked(dynamoRepo.getFarmMembership).mockResolvedValue(membershipFixture);
  vi.mocked(dynamoRepo.getFarm).mockResolvedValue(farmFixture);
  vi.mocked(getSignedImageUrl).mockResolvedValue('https://example.com/signed-full.jpg');
  vi.mocked(getSignedThumbnailUrl).mockResolvedValue('https://example.com/signed-thumb.jpg');
});

// ── GET /api/v1/beds/:bedId ─────────────────────────────────────────

describe('GET /api/v1/beds/:bedId', () => {
  it('returns 200 with bed detail and latest_image (happy path)', async () => {
    vi.mocked(dynamoRepo.getBedById).mockResolvedValue(bedFixture);
    vi.mocked(dynamoRepo.getLatestImageForBed).mockResolvedValue(imageFixture);
    vi.mocked(dynamoRepo.getTagsForImage).mockResolvedValue([tagFixture]);

    const res = await app.request(`/api/v1/beds/${BED_ID}`, { headers: authHeaders() });
    expect(res.status).toBe(200);

    const body = await res.json() as Record<string, unknown>;
    expect(body['id']).toBe(BED_ID);
    expect(body['farm_id']).toBe(FARM_ID);
    expect(body['name']).toBe('A1');
    expect(body['crop_type']).toBe('tomato');

    // M1: latest_image must include url and tags
    const img = body['latest_image'] as Record<string, unknown>;
    expect(img).not.toBeNull();
    expect(img['id']).toBe(IMAGE_ID);
    expect(img['url']).toBe('https://example.com/signed-full.jpg');
    expect(img['thumbnail_url']).toBe('https://example.com/signed-thumb.jpg');
    expect(img['captured_at']).toBe('2026-03-20T10:00:00.000Z');
    expect(img['trigger']).toBe('scheduled');
    expect(Array.isArray(img['tags'])).toBe(true);
    expect((img['tags'] as Array<Record<string, unknown>>)).toHaveLength(1);
    expect((img['tags'] as Array<Record<string, unknown>>)[0]['tag']).toBe('healthy');
  });

  it('returns 200 with latest_image null when no images', async () => {
    vi.mocked(dynamoRepo.getBedById).mockResolvedValue(bedFixture);
    vi.mocked(dynamoRepo.getLatestImageForBed).mockResolvedValue(null);

    const res = await app.request(`/api/v1/beds/${BED_ID}`, { headers: authHeaders() });
    expect(res.status).toBe(200);

    const body = await res.json() as Record<string, unknown>;
    expect(body['latest_image']).toBeNull();
  });

  it('returns 404 when bed not found', async () => {
    vi.mocked(dynamoRepo.getBedById).mockRejectedValue(new NotFoundError('Bed not found'));

    const res = await app.request(`/api/v1/beds/${BED_ID}`, { headers: authHeaders() });
    expect(res.status).toBe(404);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('returns 401 when not authenticated', async () => {
    const res = await app.request(`/api/v1/beds/${BED_ID}`);
    expect(res.status).toBe(401);
  });
});

// ── PATCH /api/v1/beds/:bedId ───────────────────────────────────────

describe('PATCH /api/v1/beds/:bedId', () => {
  it('admin/manager can update crop fields → 200', async () => {
    vi.mocked(dynamoRepo.getBedById).mockResolvedValue(bedFixture);
    vi.mocked(dynamoRepo.updateBed).mockResolvedValue(undefined);
    // Re-fetch returns updated bed
    vi.mocked(dynamoRepo.getBedById)
      .mockResolvedValueOnce(bedFixture) // first: lookup
      .mockResolvedValueOnce({ ...bedFixture, crop_type: 'lettuce' }); // second: re-fetch

    const res = await app.request(`/api/v1/beds/${BED_ID}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ crop_type: 'lettuce' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body['crop_type']).toBe('lettuce');
  });

  it('observer gets 404 (cannot write)', async () => {
    vi.mocked(dynamoRepo.getBedById).mockResolvedValue(bedFixture);
    vi.mocked(dynamoRepo.getFarmMembership).mockResolvedValue({
      user_id: TEST_USER_ID,
      farm_id: FARM_ID,
      role: 'staff' as const,
      joined_at: '2026-03-17T00:00:00.000Z',
    });

    const res = await app.request(`/api/v1/beds/${BED_ID}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ crop_type: 'lettuce' }),
    });
    expect(res.status).toBe(404);
  });

  it('null value clears a field (M2 fix)', async () => {
    vi.mocked(dynamoRepo.getBedById)
      .mockResolvedValueOnce(bedFixture)
      .mockResolvedValueOnce({ ...bedFixture, crop_type: undefined });
    vi.mocked(dynamoRepo.updateBed).mockResolvedValue(undefined);

    const res = await app.request(`/api/v1/beds/${BED_ID}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ crop_type: null }),
    });
    expect(res.status).toBe(200);

    // Verify updateBed was called with null (not undefined)
    expect(dynamoRepo.updateBed).toHaveBeenCalledWith(
      FARM_ID,
      BED_ID,
      1,
      1,
      { crop_type: null },
    );

    const body = await res.json() as Record<string, unknown>;
    expect(body['crop_type']).toBeNull();
  });

  it('returns 404 when bed not found', async () => {
    vi.mocked(dynamoRepo.getBedById).mockRejectedValue(new NotFoundError('Bed not found'));

    const res = await app.request(`/api/v1/beds/${BED_ID}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ crop_type: 'lettuce' }),
    });
    expect(res.status).toBe(404);
  });

  it('returns 400 for invalid body', async () => {
    vi.mocked(dynamoRepo.getBedById).mockResolvedValue(bedFixture);

    const res = await app.request(`/api/v1/beds/${BED_ID}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ crop_type: '' }), // min length 1
    });
    expect(res.status).toBe(400);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });
});

// ── GET /api/v1/beds/:bedId/images ──────────────────────────────────

describe('GET /api/v1/beds/:bedId/images', () => {
  it('returns paginated list of images', async () => {
    vi.mocked(dynamoRepo.getBedById).mockResolvedValue(bedFixture);
    vi.mocked(dynamoRepo.getImagesForBed).mockResolvedValue({
      items: [imageFixture],
      nextCursor: null,
    });
    vi.mocked(dynamoRepo.getLatestTagForImage).mockResolvedValue(tagFixture);

    const res = await app.request(`/api/v1/beds/${BED_ID}/images`, { headers: authHeaders() });
    expect(res.status).toBe(200);

    const body = await res.json() as { data: unknown[]; meta: Record<string, unknown> };
    expect(body.data).toHaveLength(1);
    expect(body.meta['count']).toBe(1);
    expect(body.meta['next_cursor']).toBeNull();
  });

  it('returns empty list when no images', async () => {
    vi.mocked(dynamoRepo.getBedById).mockResolvedValue(bedFixture);
    vi.mocked(dynamoRepo.getImagesForBed).mockResolvedValue({
      items: [],
      nextCursor: null,
    });

    const res = await app.request(`/api/v1/beds/${BED_ID}/images`, { headers: authHeaders() });
    expect(res.status).toBe(200);

    const body = await res.json() as { data: unknown[]; meta: Record<string, unknown> };
    expect(body.data).toHaveLength(0);
    expect(body.meta['count']).toBe(0);
  });

  it('returns 404 when bed not found', async () => {
    vi.mocked(dynamoRepo.getBedById).mockRejectedValue(new NotFoundError('Bed not found'));

    const res = await app.request(`/api/v1/beds/${BED_ID}/images`, { headers: authHeaders() });
    expect(res.status).toBe(404);
  });

  it('returns 400 for invalid limit', async () => {
    vi.mocked(dynamoRepo.getBedById).mockResolvedValue(bedFixture);

    const res = await app.request(`/api/v1/beds/${BED_ID}/images?limit=999`, { headers: authHeaders() });
    expect(res.status).toBe(400);
  });
});

// ── POST /api/v1/beds/:bedId/images ─────────────────────────────────

describe('POST /api/v1/beds/:bedId/images', () => {
  // Build a minimal valid JPEG (just magic bytes + padding)
  function makeJpegBlob(): Blob {
    const bytes = new Uint8Array(256);
    bytes[0] = 0xff;
    bytes[1] = 0xd8;
    bytes[2] = 0xff;
    return new Blob([bytes], { type: 'image/jpeg' });
  }

  it('creates image with valid multipart form data → 201', async () => {
    vi.mocked(dynamoRepo.getBedById).mockResolvedValue(bedFixture);
    const { uploadImage } = await import('../../services/s3');
    vi.mocked(uploadImage).mockResolvedValue('farms/f0/beds/bd0/new-img.jpg');
    vi.mocked(dynamoRepo.createImage).mockResolvedValue({
      id: 'new-img-id',
      bed_id: BED_ID,
      node_id: 'node-01',
      captured_at: '2026-03-20T10:00:00.000Z',
      uploaded_at: '2026-03-20T10:01:00.000Z',
      storage_key: 'farms/f0/beds/bd0/new-img.jpg',
      trigger: 'scheduled',
      content_type: 'image/jpeg',
      size_bytes: 256,
    });

    const formData = new FormData();
    formData.append('image', makeJpegBlob(), 'test.jpg');
    formData.append('captured_at', '2026-03-20T10:00:00.000Z');
    formData.append('node_id', 'node-01');
    formData.append('trigger', 'scheduled');

    const res = await app.request(`/api/v1/beds/${BED_ID}/images`, {
      method: 'POST',
      headers: authHeaders(),
      body: formData,
    });
    expect(res.status).toBe(201);
    const body = await res.json() as Record<string, unknown>;
    expect(body['id']).toBe('new-img-id');
    expect(body['url']).toBeDefined();
  });

  it('returns 400 when image field is missing', async () => {
    vi.mocked(dynamoRepo.getBedById).mockResolvedValue(bedFixture);

    const formData = new FormData();
    formData.append('captured_at', '2026-03-20T10:00:00.000Z');
    formData.append('node_id', 'node-01');
    formData.append('trigger', 'scheduled');

    const res = await app.request(`/api/v1/beds/${BED_ID}/images`, {
      method: 'POST',
      headers: authHeaders(),
      body: formData,
    });
    expect(res.status).toBe(400);
  });

  it('returns 404 when bed not found', async () => {
    vi.mocked(dynamoRepo.getBedById).mockRejectedValue(new NotFoundError('Bed not found'));

    const formData = new FormData();
    formData.append('image', makeJpegBlob(), 'test.jpg');
    formData.append('captured_at', '2026-03-20T10:00:00.000Z');
    formData.append('node_id', 'node-01');
    formData.append('trigger', 'scheduled');

    const res = await app.request(`/api/v1/beds/${BED_ID}/images`, {
      method: 'POST',
      headers: authHeaders(),
      body: formData,
    });
    expect(res.status).toBe(404);
  });
});

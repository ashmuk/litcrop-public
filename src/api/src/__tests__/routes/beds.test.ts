import { TEST_USER_ID, authHeaders, makeAuthHeaders } from '../helpers/auth';
import { FARM_ID, BED_ID, IMAGE_ID, farmFixture, bedFixture, imageFixture, tagFixture, membershipFixture } from '../fixtures';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Set ADMIN_EMAILS before auth module loads (#478 super-admin bulk-delete test).
// vi.hoisted runs before any import — required because ADMIN_EMAILS_SET is cached
// at module level the first time `config.ts` is imported.
const ADMIN_EMAIL = 'admin@litcrop.test';
vi.hoisted(() => {
  process.env['ADMIN_EMAILS'] = 'admin@litcrop.test';
});

import app from '../../app';
import { dynamoRepo } from '../../services/dynamodb';
import { getSignedImageUrl, getSignedThumbnailUrl } from '../../services/s3';
import { NotFoundError } from '../../errors';

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
    // #279 Wave B — FarmBed compat shim
    getActiveCropForBed: vi.fn(),
    listBedCropsByBed: vi.fn(),
    // #478 — bulk image delete
    listImagesByBedAndDay: vi.fn(),
    deleteImage: vi.fn(),
  },
}));

vi.mock('../../services/s3', () => ({
  getSignedImageUrl: vi.fn(),
  getSignedThumbnailUrl: vi.fn(),
  uploadImage: vi.fn(),
  deleteImage: vi.fn(),
  deleteThumbnail: vi.fn(),
  buildStorageKey: vi.fn().mockReturnValue('images/f0/bd0/2026/01/01/test-img.jpg'),
}));

// Fixtures imported from ../fixtures

beforeEach(() => {
  vi.clearAllMocks();
  // Default: user is a member of the test farm with manager role
  vi.mocked(dynamoRepo.getFarmMembership).mockResolvedValue(membershipFixture);
  vi.mocked(dynamoRepo.getFarm).mockResolvedValue(farmFixture);
  vi.mocked(getSignedImageUrl).mockResolvedValue('https://example.com/signed-full.jpg');
  vi.mocked(getSignedThumbnailUrl).mockResolvedValue('https://example.com/signed-thumb.jpg');
  // #279 Wave B — default to no active crop (legacy inline-field path)
  vi.mocked(dynamoRepo.getActiveCropForBed).mockResolvedValue(null);
  vi.mocked(dynamoRepo.listBedCropsByBed).mockResolvedValue([]);
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

  it('returns completed_at in GET response (#297)', async () => {
    vi.mocked(dynamoRepo.getBedById).mockResolvedValue({ ...bedFixture, completed_at: '2026-04-06' });
    vi.mocked(dynamoRepo.getLatestImageForBed).mockResolvedValue(null);

    const res = await app.request(`/api/v1/beds/${BED_ID}`, { headers: authHeaders() });
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body['completed_at']).toBe('2026-04-06');
  });

  it('returns completed_at null when not set (#297)', async () => {
    vi.mocked(dynamoRepo.getBedById).mockResolvedValue(bedFixture);
    vi.mocked(dynamoRepo.getLatestImageForBed).mockResolvedValue(null);

    const res = await app.request(`/api/v1/beds/${BED_ID}`, { headers: authHeaders() });
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body['completed_at']).toBeNull();
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
    // When crop_type changes, lifecycle dates are auto-cleared (#321)
    expect(dynamoRepo.updateBed).toHaveBeenCalledWith(
      FARM_ID,
      BED_ID,
      1,
      1,
      { crop_type: null, planted_at: null, expected_harvest: null, completed_at: null },
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

  it('sets completed_at to mark crop cycle done (#297)', async () => {
    vi.mocked(dynamoRepo.getBedById)
      .mockResolvedValueOnce(bedFixture)
      .mockResolvedValueOnce({ ...bedFixture, completed_at: '2026-04-06' });
    vi.mocked(dynamoRepo.updateBed).mockResolvedValue(undefined);

    const res = await app.request(`/api/v1/beds/${BED_ID}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ completed_at: '2026-04-06' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body['completed_at']).toBe('2026-04-06');
    expect(dynamoRepo.updateBed).toHaveBeenCalledWith(
      FARM_ID, BED_ID, 1, 1, { completed_at: '2026-04-06' },
    );
  });

  it('clears completed_at with null to reactivate bed (#297)', async () => {
    vi.mocked(dynamoRepo.getBedById)
      .mockResolvedValueOnce({ ...bedFixture, completed_at: '2026-04-06' })
      .mockResolvedValueOnce({ ...bedFixture, completed_at: undefined });
    vi.mocked(dynamoRepo.updateBed).mockResolvedValue(undefined);

    const res = await app.request(`/api/v1/beds/${BED_ID}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ completed_at: null }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body['completed_at']).toBeNull();
    expect(dynamoRepo.updateBed).toHaveBeenCalledWith(
      FARM_ID, BED_ID, 1, 1, { completed_at: null },
    );
  });

  it('rejects invalid completed_at format → 400', async () => {
    vi.mocked(dynamoRepo.getBedById).mockResolvedValue(bedFixture);

    const res = await app.request(`/api/v1/beds/${BED_ID}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ completed_at: 'not-a-date' }),
    });
    expect(res.status).toBe(400);
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

  it('staff can upload images → 201', async () => {
    vi.mocked(dynamoRepo.getBedById).mockResolvedValue(bedFixture);
    vi.mocked(dynamoRepo.getFarmMembership).mockResolvedValue({
      ...membershipFixture,
      role: 'staff' as const,
    });
    const { uploadImage } = await import('../../services/s3');
    vi.mocked(uploadImage).mockResolvedValue('farms/f0/beds/bd0/staff-img.jpg');
    vi.mocked(dynamoRepo.createImage).mockResolvedValue({
      id: 'staff-img-id',
      bed_id: BED_ID,
      node_id: 'node-01',
      captured_at: '2026-03-20T10:00:00.000Z',
      uploaded_at: '2026-03-20T10:01:00.000Z',
      storage_key: 'farms/f0/beds/bd0/staff-img.jpg',
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

  // #462 Phase 1 tail — route wires auth-context userId into uploaded_by
  // The dynamodb.test.ts layer confirms persistence given a value; this test
  // verifies the route actually passes the JWT sub — not undefined — to the
  // repo call. A silent regression (e.g. `uploaded_by: undefined`) would still
  // pass the lower-level test but silently break Phase 3's activity feed.
  it('passes auth-context userId as uploaded_by to createImage (#462)', async () => {
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
      headers: makeAuthHeaders('test-user-sub'),
      body: formData,
    });
    expect(res.status).toBe(201);

    // The fourth argument to createImage is the data object; uploaded_by must
    // equal the JWT sub from the Authorization header — never undefined.
    expect(dynamoRepo.createImage).toHaveBeenCalledOnce();
    const callArgs = vi.mocked(dynamoRepo.createImage).mock.calls[0];
    expect(callArgs[2]).toMatchObject({ uploaded_by: 'test-user-sub' });
  });
});

// ── DELETE /api/v1/beds/:bedId/images?day=YYYY-MM-DD (#478) ─────

describe('DELETE /api/v1/beds/:bedId/images?day=YYYY-MM-DD', () => {
  const DAY = '2026-03-17';
  const IMG_2_ID = 'im000000-0000-0000-0000-000000000002';
  const IMG_3_ID = 'im000000-0000-0000-0000-000000000003';

  function makeImage(id: string, capturedAt: string): import('@litcrop/shared').Image {
    return {
      ...imageFixture,
      id,
      captured_at: capturedAt,
      storage_key: `images/${FARM_ID}/${BED_ID}/2026/03/17/${id}.jpg`,
    };
  }

  beforeEach(() => {
    vi.mocked(dynamoRepo.getBedById).mockResolvedValue(bedFixture);
    vi.mocked(dynamoRepo.deleteImage).mockResolvedValue();
    // s3 mocks already exist on the module-level mock
  });

  it('owner happy path → 200 with deleted_count and image_ids', async () => {
    const images = [
      makeImage(IMAGE_ID, '2026-03-17T08:00:00.000Z'),
      makeImage(IMG_2_ID, '2026-03-17T12:00:00.000Z'),
      makeImage(IMG_3_ID, '2026-03-17T18:00:00.000Z'),
    ];
    vi.mocked(dynamoRepo.listImagesByBedAndDay).mockResolvedValue(images);

    const res = await app.request(`/api/v1/beds/${BED_ID}/images?day=${DAY}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const body = await res.json() as { deleted_count: number; image_ids: string[] };
    expect(body.deleted_count).toBe(3);
    expect(body.image_ids).toEqual(expect.arrayContaining([IMAGE_ID, IMG_2_ID, IMG_3_ID]));
    expect(dynamoRepo.deleteImage).toHaveBeenCalledTimes(3);
    expect(dynamoRepo.listImagesByBedAndDay).toHaveBeenCalledWith(BED_ID, DAY);
  });

  it('empty day → 200 with deleted_count: 0 (no DDB delete calls)', async () => {
    vi.mocked(dynamoRepo.listImagesByBedAndDay).mockResolvedValue([]);

    const res = await app.request(`/api/v1/beds/${BED_ID}/images?day=${DAY}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const body = await res.json() as { deleted_count: number; image_ids: string[] };
    expect(body.deleted_count).toBe(0);
    expect(body.image_ids).toEqual([]);
    expect(dynamoRepo.deleteImage).not.toHaveBeenCalled();
  });

  it('missing day → 400', async () => {
    const res = await app.request(`/api/v1/beds/${BED_ID}/images`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    expect(res.status).toBe(400);
    expect(dynamoRepo.listImagesByBedAndDay).not.toHaveBeenCalled();
  });

  it('malformed day (e.g. 2026/03/17) → 400', async () => {
    const res = await app.request(`/api/v1/beds/${BED_ID}/images?day=2026%2F03%2F17`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    expect(res.status).toBe(400);
    expect(dynamoRepo.listImagesByBedAndDay).not.toHaveBeenCalled();
  });

  it('non-existent calendar date (e.g. 2026-99-99) → 400', async () => {
    const res = await app.request(`/api/v1/beds/${BED_ID}/images?day=2026-99-99`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    expect(res.status).toBe(400);
    expect(dynamoRepo.listImagesByBedAndDay).not.toHaveBeenCalled();
  });

  it('rolled-over date (e.g. 2026-02-30) → 400 (round-trip mismatch)', async () => {
    const res = await app.request(`/api/v1/beds/${BED_ID}/images?day=2026-02-30`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    expect(res.status).toBe(400);
    expect(dynamoRepo.listImagesByBedAndDay).not.toHaveBeenCalled();
  });

  it('partial DDB failure → 200 with both deleted_ids and failed_ids', async () => {
    const images = [
      makeImage(IMAGE_ID, '2026-03-17T08:00:00.000Z'),
      makeImage(IMG_2_ID, '2026-03-17T12:00:00.000Z'),
      makeImage(IMG_3_ID, '2026-03-17T18:00:00.000Z'),
    ];
    vi.mocked(dynamoRepo.listImagesByBedAndDay).mockResolvedValue(images);
    // Reject the second image's DDB delete; first and third succeed.
    vi.mocked(dynamoRepo.deleteImage).mockImplementation(async (img) => {
      if (img.id === IMG_2_ID) throw new Error('Throughput exceeded');
    });

    const res = await app.request(`/api/v1/beds/${BED_ID}/images?day=${DAY}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const body = await res.json() as {
      deleted_count: number; image_ids: string[]; failed_count: number; failed_ids: string[];
    };
    expect(body.deleted_count).toBe(2);
    expect(body.failed_count).toBe(1);
    expect(body.image_ids).toEqual(expect.arrayContaining([IMAGE_ID, IMG_3_ID]));
    expect(body.failed_ids).toEqual([IMG_2_ID]);
  });

  it('total DDB failure → 503 (every image failed)', async () => {
    const images = [
      makeImage(IMAGE_ID, '2026-03-17T08:00:00.000Z'),
      makeImage(IMG_2_ID, '2026-03-17T12:00:00.000Z'),
    ];
    vi.mocked(dynamoRepo.listImagesByBedAndDay).mockResolvedValue(images);
    vi.mocked(dynamoRepo.deleteImage).mockRejectedValue(new Error('Throughput exceeded'));

    const res = await app.request(`/api/v1/beds/${BED_ID}/images?day=${DAY}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });

    expect(res.status).toBe(503);
  });

  it('staff role → 404 + no list/delete calls', async () => {
    vi.mocked(dynamoRepo.getFarmMembership).mockResolvedValue({
      ...membershipFixture,
      role: 'staff' as const,
    });

    const res = await app.request(`/api/v1/beds/${BED_ID}/images?day=${DAY}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });

    expect(res.status).toBe(404);
    expect(dynamoRepo.listImagesByBedAndDay).not.toHaveBeenCalled();
    expect(dynamoRepo.deleteImage).not.toHaveBeenCalled();
  });

  it('non-member → 404 + no list/delete calls', async () => {
    vi.mocked(dynamoRepo.getFarmMembership).mockResolvedValue(null);

    const res = await app.request(`/api/v1/beds/${BED_ID}/images?day=${DAY}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });

    expect(res.status).toBe(404);
    expect(dynamoRepo.listImagesByBedAndDay).not.toHaveBeenCalled();
  });

  it('bed not found → 404', async () => {
    vi.mocked(dynamoRepo.getBedById).mockRejectedValue(new NotFoundError('Bed not found'));

    const res = await app.request(`/api/v1/beds/${BED_ID}/images?day=${DAY}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    expect(res.status).toBe(404);
  });

  it('super-admin (non-member) → 200 via admin bypass on assertFarmAccess', async () => {
    // Super-admin: not a farm member, but JWT email matches ADMIN_EMAILS env →
    // isAdmin=true bypasses membership check and synthesizes role 'admin'
    // (matches required ['admin','owner']).
    vi.mocked(dynamoRepo.getFarmMembership).mockResolvedValue(null);
    const images = [makeImage(IMAGE_ID, '2026-03-17T08:00:00.000Z')];
    vi.mocked(dynamoRepo.listImagesByBedAndDay).mockResolvedValue(images);

    const res = await app.request(`/api/v1/beds/${BED_ID}/images?day=${DAY}`, {
      method: 'DELETE',
      headers: makeAuthHeaders('super-admin-sub', ADMIN_EMAIL),
    });

    expect(res.status).toBe(200);
    const body = await res.json() as { deleted_count: number };
    expect(body.deleted_count).toBe(1);
    expect(dynamoRepo.deleteImage).toHaveBeenCalledTimes(1);
  });
});

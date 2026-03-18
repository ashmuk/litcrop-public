import { describe, it, expect, vi, beforeEach } from 'vitest';
import app from '../../app';
import { dynamoRepo } from '../../services/dynamodb';
import { getSignedImageUrl, uploadImage } from '../../services/s3';
import { NotFoundError } from '../../errors';
import type { Image } from '@litcrop/shared';

vi.mock('../../services/dynamodb', () => ({
  dynamoRepo: {
    getPlotById: vi.fn(),
    getFieldsForFarm: vi.fn(),
    getBedsForField: vi.fn(),
    getImagesForPlot: vi.fn(),
    getTagsForImage: vi.fn(),
    createImage: vi.fn(),
    getLatestImageForPlot: vi.fn(),
  },
}));

vi.mock('../../services/s3', () => ({
  getSignedImageUrl: vi.fn(),
  uploadImage: vi.fn(),
}));

const FARM_ID = 'f0000000-0000-0000-0000-000000000001';
const PLOT_ID = 'a0000000-0000-0000-0000-000000000001';
const IMAGE_ID = 'e0000000-0000-0000-0000-000000000001';
const BED_ID = 'bd000000-0000-0000-0000-000000000001';

const plotFixture = {
  id: PLOT_ID,
  bed_id: BED_ID,
  farm_id: FARM_ID,
  label: 'Plot 1',
  crop_type: 'tomato',
  crop_variety: 'Cherry',
  planted_at: '2026-03-01',
  expected_harvest: '2026-07-01',
  latest_status: 'no_data' as const,
};

const imageFixture: Image = {
  id: IMAGE_ID,
  plot_id: PLOT_ID,
  node_id: 'cam-001',
  captured_at: '2026-03-17T10:00:00.000Z',
  uploaded_at: '2026-03-17T10:00:05.000Z',
  storage_key: `images/${FARM_ID}/${PLOT_ID}/2026/03/17/${IMAGE_ID}.jpg`,
  trigger: 'scheduled',
  content_type: 'image/jpeg',
  size_bytes: 102400,
};

// Valid JPEG magic bytes
const jpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...Array(100).fill(0)]);
// PNG magic bytes
const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
// 2MB + 1 byte with JPEG header
const oversizedBytes = new Uint8Array(2 * 1024 * 1024 + 1);
oversizedBytes[0] = 0xff;
oversizedBytes[1] = 0xd8;
oversizedBytes[2] = 0xff;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSignedImageUrl).mockResolvedValue('https://example.com/signed');
});

// ── GET /api/v1/plots/:plotId ─────────────────────────────────────

describe('GET /api/v1/plots/:plotId', () => {
  it('returns 200 with plot details', async () => {
    vi.mocked(dynamoRepo.getPlotById).mockResolvedValue(plotFixture);
    vi.mocked(dynamoRepo.getFieldsForFarm).mockResolvedValue([]);
    vi.mocked(dynamoRepo.getLatestImageForPlot).mockResolvedValue(null);

    const res = await app.request(`/api/v1/plots/${PLOT_ID}`);
    expect(res.status).toBe(200);
    const body = await res.json() as { id: string; latest_image: null };
    expect(body.id).toBe(PLOT_ID);
    expect(body.latest_image).toBeNull();
  });

  it('returns 404 when plot not found', async () => {
    vi.mocked(dynamoRepo.getPlotById).mockRejectedValue(new NotFoundError('Plot not found'));
    const res = await app.request(`/api/v1/plots/${PLOT_ID}`);
    expect(res.status).toBe(404);
  });
});

// ── GET /api/v1/plots/:plotId/images ─────────────────────────────

describe('GET /api/v1/plots/:plotId/images', () => {
  it('returns 200 with paginated image list', async () => {
    vi.mocked(dynamoRepo.getPlotById).mockResolvedValue(plotFixture);
    vi.mocked(dynamoRepo.getImagesForPlot).mockResolvedValue({
      items: [imageFixture],
      nextCursor: null,
    });
    vi.mocked(dynamoRepo.getTagsForImage).mockResolvedValue([]);

    const res = await app.request(`/api/v1/plots/${PLOT_ID}/images`);
    expect(res.status).toBe(200);
    const body = await res.json() as { data: Array<Record<string, unknown>>; meta: { count: number } };
    expect(body.data).toHaveLength(1);
    expect(body.meta.count).toBe(1);
    // MF-4a: field must be thumbnail_url, not url
    expect(body.data[0]['thumbnail_url']).toBe('https://example.com/signed');
    expect(body.data[0]['url']).toBeUndefined();
    // MF-4b: field must be latest_tag (null when no tags)
    expect(body.data[0]['latest_tag']).toBeNull();
    expect(body.data[0]['tags']).toBeUndefined();
  });

  it('returns latest_tag as most-recent tag value when tags exist', async () => {
    vi.mocked(dynamoRepo.getPlotById).mockResolvedValue(plotFixture);
    vi.mocked(dynamoRepo.getImagesForPlot).mockResolvedValue({
      items: [imageFixture],
      nextCursor: null,
    });
    vi.mocked(dynamoRepo.getTagsForImage).mockResolvedValue([
      { id: 't1', image_id: IMAGE_ID, tag: 'issue', created_at: '2026-03-17T09:00:00.000Z' },
      { id: 't2', image_id: IMAGE_ID, tag: 'healthy', created_at: '2026-03-17T10:00:00.000Z' },
    ]);

    const res = await app.request(`/api/v1/plots/${PLOT_ID}/images`);
    const body = await res.json() as { data: Array<Record<string, unknown>> };
    // Most recent tag (last in ascending order) should be returned
    expect(body.data[0]['latest_tag']).toBe('healthy');
  });

  it('returns 400 when limit < 1', async () => {
    const res = await app.request(`/api/v1/plots/${PLOT_ID}/images?limit=0`);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when limit > 100', async () => {
    const res = await app.request(`/api/v1/plots/${PLOT_ID}/images?limit=101`);
    expect(res.status).toBe(400);
  });

  it('returns 400 with BAD_CURSOR on malformed cursor', async () => {
    vi.mocked(dynamoRepo.getPlotById).mockResolvedValue(plotFixture);
    const err = new Error('ValidationException');
    err.name = 'ValidationException';
    vi.mocked(dynamoRepo.getImagesForPlot).mockRejectedValue(err);

    const res = await app.request(`/api/v1/plots/${PLOT_ID}/images?cursor=not-valid-base64!!`);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('BAD_CURSOR');
  });
});

// ── POST /api/v1/plots/:plotId/images ────────────────────────────

describe('POST /api/v1/plots/:plotId/images', () => {
  function makeImageRequest(
    imageBytes: Uint8Array,
    extra: Record<string, string> = {},
  ): Request {
    const formData = new FormData();
    formData.append('image', new Blob([imageBytes as BlobPart], { type: 'image/jpeg' }), 'capture.jpg');
    formData.append('captured_at', '2026-03-17T10:00:00.000Z');
    formData.append('node_id', 'cam-001');
    formData.append('trigger', 'scheduled');
    for (const [k, v] of Object.entries(extra)) {
      formData.set(k, v);
    }
    return new Request(`http://localhost/api/v1/plots/${PLOT_ID}/images`, {
      method: 'POST',
      body: formData,
    });
  }

  it('valid JPEG upload → 201', async () => {
    vi.mocked(dynamoRepo.getPlotById).mockResolvedValue(plotFixture);
    vi.mocked(uploadImage).mockResolvedValue(
      `images/${FARM_ID}/${PLOT_ID}/2026/03/17/${IMAGE_ID}.jpg`,
    );
    vi.mocked(dynamoRepo.createImage).mockResolvedValue(imageFixture);

    const res = await app.request(makeImageRequest(jpegBytes));
    expect(res.status).toBe(201);
    const body = await res.json() as { trigger: string };
    expect(body.trigger).toBe('scheduled');
  });

  it('rejects PNG bytes → 415', async () => {
    vi.mocked(dynamoRepo.getPlotById).mockResolvedValue(plotFixture);
    const res = await app.request(makeImageRequest(pngBytes));
    expect(res.status).toBe(415);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
  });

  it('rejects empty buffer → 415', async () => {
    vi.mocked(dynamoRepo.getPlotById).mockResolvedValue(plotFixture);
    const res = await app.request(makeImageRequest(new Uint8Array(0)));
    expect(res.status).toBe(415);
  });

  it('rejects oversized file → 413', async () => {
    vi.mocked(dynamoRepo.getPlotById).mockResolvedValue(plotFixture);
    const res = await app.request(makeImageRequest(oversizedBytes));
    expect(res.status).toBe(413);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('rejects missing captured_at → 400', async () => {
    vi.mocked(dynamoRepo.getPlotById).mockResolvedValue(plotFixture);
    const formData = new FormData();
    formData.append('image', new Blob([jpegBytes], { type: 'image/jpeg' }), 'capture.jpg');
    formData.append('node_id', 'cam-001');
    formData.append('trigger', 'scheduled');
    const req = new Request(`http://localhost/api/v1/plots/${PLOT_ID}/images`, {
      method: 'POST',
      body: formData,
    });
    const res = await app.request(req);
    expect(res.status).toBe(400);
  });

  it('rejects invalid trigger value → 400', async () => {
    vi.mocked(dynamoRepo.getPlotById).mockResolvedValue(plotFixture);
    const res = await app.request(makeImageRequest(jpegBytes, { trigger: 'manual' }));
    expect(res.status).toBe(400);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects future captured_at (> now + 5 min) → 400', async () => {
    vi.mocked(dynamoRepo.getPlotById).mockResolvedValue(plotFixture);
    const futureDate = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const res = await app.request(makeImageRequest(jpegBytes, { captured_at: futureDate }));
    expect(res.status).toBe(400);
  });

  it('returns 404 when plot not found', async () => {
    vi.mocked(dynamoRepo.getPlotById).mockRejectedValue(new NotFoundError('Plot not found'));
    const res = await app.request(makeImageRequest(jpegBytes));
    expect(res.status).toBe(404);
  });
});

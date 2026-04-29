/**
 * Ownership enforcement integration tests (T-AUTH-02, T-AUTH-04)
 *
 * Verifies that API routes return 404 (not 403) when a caller attempts
 * to access a resource that belongs to a different user. Uses mock JWT
 * tokens and mocked DynamoDB to exercise the full Hono request path.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import app from '../../app';
import { dynamoRepo } from '../../services/dynamodb';
import { getSignedImageUrl } from '../../services/s3';
import type { Farm, Bed, Image } from '@litcrop/shared';

vi.mock('../../services/dynamodb', () => ({
  dynamoRepo: {
    getFarm: vi.fn(),
    getFarmsForUser: vi.fn(),
    getFarmMembership: vi.fn(),
    addFarmMember: vi.fn(),
    createFarm: vi.fn(),
    updateFarm: vi.fn(),
    getBedsForFarm: vi.fn(),
    getLatestImageForBed: vi.fn(),
    getBedById: vi.fn(),
    getImagesForBed: vi.fn(),
    getTagsForImage: vi.fn(),
    getLatestTagForImage: vi.fn(),
    createImage: vi.fn(),
    getImageById: vi.fn(),
    createTag: vi.fn(),
  },
}));

vi.mock('../../services/s3', () => ({
  getSignedImageUrl: vi.fn().mockResolvedValue('https://example.com/signed'),
  uploadImage: vi.fn(),
  deleteImage: vi.fn(),
}));

// ── Fixtures ──────────────────────────────────────────────────────

const OWNER_USER_ID = 'owner-cognito-sub';
const OTHER_USER_ID = 'intruder-cognito-sub';
const FARM_ID = 'f0000000-0000-0000-0000-000000000001';
const BED_ID = 'b0000000-0000-0000-0000-000000000001';
const IMAGE_ID = 'i0000000-0000-0000-0000-000000000001';

const farmFixture: Farm = {
  id: FARM_ID,
  user_id: OWNER_USER_ID,
  name: 'Owner Farm',
  location_text: 'Test Location',
  latitude: 36.0,
  longitude: 138.0,
  locale: 'en',
  theme: 'system',
  grid_rows: 1,
  grid_cols: 1,
  created_at: '2026-03-17T00:00:00.000Z',
  default_currency: 'JPY' as const,
};

const bedFixture: Bed = {
  id: BED_ID,
  farm_id: FARM_ID,
  row: 1,
  col: 1,
  name: 'A1',
  crop_type: 'tomato',
  crop_variety: 'Cherry',
  latest_status: 'no_data',
};

const imageFixture: Image = {
  id: IMAGE_ID,
  bed_id: BED_ID,
  node_id: 'cam-01',
  captured_at: '2026-03-17T00:00:00.000Z',
  uploaded_at: '2026-03-17T00:00:00.000Z',
  storage_key: `images/${FARM_ID}/${BED_ID}/${IMAGE_ID}.jpg`,
  trigger: 'scheduled',
  content_type: 'image/jpeg',
  size_bytes: 100000,
};

import { makeAuthToken } from '../helpers/auth';

/** Build a mock Authorization header value for the given userId. */
function authHeader(userId: string): string {
  return `Bearer ${makeAuthToken(userId, `${userId}@example.com`)}`;
}

const ownerMembershipFixture = {
  user_id: OWNER_USER_ID,
  farm_id: FARM_ID,
  role: 'owner' as const,
  joined_at: '2026-03-17T00:00:00.000Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSignedImageUrl).mockResolvedValue('https://example.com/signed');
  vi.mocked(dynamoRepo.getFarmsForUser).mockResolvedValue([]);
  // Default: mock getFarmMembership to return membership for owner, null for others
  vi.mocked(dynamoRepo.getFarmMembership).mockImplementation(
    async (userId: string, _farmId: string) => {
      if (userId === OWNER_USER_ID) return ownerMembershipFixture;
      return null;
    },
  );
});

// ── Farm ownership ─────────────────────────────────────────────────

describe('Farm ownership enforcement', () => {
  it('GET /api/v1/farms/:farmId — owner gets 200', async () => {
    vi.mocked(dynamoRepo.getFarm).mockResolvedValue(farmFixture);
    vi.mocked(dynamoRepo.getBedsForFarm).mockResolvedValue([]);

    const res = await app.request(`/api/v1/farms/${FARM_ID}`, {
      headers: { Authorization: authHeader(OWNER_USER_ID) },
    });
    expect(res.status).toBe(200);
  });

  it('GET /api/v1/farms/:farmId — other user gets 404', async () => {
    vi.mocked(dynamoRepo.getFarm).mockResolvedValue(farmFixture);

    const res = await app.request(`/api/v1/farms/${FARM_ID}`, {
      headers: { Authorization: authHeader(OTHER_USER_ID) },
    });
    expect(res.status).toBe(404);
  });

  it('GET /api/v1/farms/:farmId/plots — returns 410 Gone (deprecated)', async () => {
    const res = await app.request(`/api/v1/farms/${FARM_ID}/plots`, {
      headers: { Authorization: authHeader(OTHER_USER_ID) },
    });
    expect(res.status).toBe(410);
  });

  it('PATCH /api/v1/farms/:farmId — other user gets 404', async () => {
    vi.mocked(dynamoRepo.getFarm).mockResolvedValue(farmFixture);

    const res = await app.request(`/api/v1/farms/${FARM_ID}`, {
      method: 'PATCH',
      headers: {
        Authorization: authHeader(OTHER_USER_ID),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: 'Hijacked' }),
    });
    expect(res.status).toBe(404);
  });

  it('GET /api/v1/farms/:farmId/weather — other user gets 404', async () => {
    vi.mocked(dynamoRepo.getFarm).mockResolvedValue(farmFixture);

    const res = await app.request(`/api/v1/farms/${FARM_ID}/weather`, {
      headers: { Authorization: authHeader(OTHER_USER_ID) },
    });
    expect(res.status).toBe(404);
  });

  it('POST /api/v1/farms/:farmId/plots — returns 410 Gone (deprecated)', async () => {
    const res = await app.request(`/api/v1/farms/${FARM_ID}/plots`, {
      method: 'POST',
      headers: {
        Authorization: authHeader(OTHER_USER_ID),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ crop_type: 'tomato', crop_variety: 'Cherry' }),
    });
    expect(res.status).toBe(410);
  });
});

// ── No-auth returns 401 ────────────────────────────────────────────

describe('Missing auth returns 401', () => {
  it('GET /api/v1/farms/:farmId without token → 401', async () => {
    const res = await app.request(`/api/v1/farms/${FARM_ID}`);
    expect(res.status).toBe(401);
  });

  it('POST /api/v1/farms without token → 401', async () => {
    const res = await app.request('/api/v1/farms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Farm', location_text: 'Test Location', latitude: 36.0, longitude: 138.0 }),
    });
    expect(res.status).toBe(401);
  });

  it('GET /api/v1/plots/:plotId without token → 401', async () => {
    const res = await app.request(`/api/v1/plots/some-plot-id`);
    expect(res.status).toBe(401);
  });

  it('GET /api/v1/images/:imageId without token → 401', async () => {
    const res = await app.request(`/api/v1/images/${IMAGE_ID}`);
    expect(res.status).toBe(401);
  });

  it('POST /api/v1/chat without token → 401', async () => {
    const res = await app.request('/api/v1/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'hello' }),
    });
    expect(res.status).toBe(401);
  });
});

// ── Image ownership ────────────────────────────────────────────────

describe('Image ownership enforcement', () => {
  it('GET /api/v1/images/:imageId — owner gets 200', async () => {
    vi.mocked(dynamoRepo.getImageById).mockResolvedValue(imageFixture);
    vi.mocked(dynamoRepo.getBedById).mockResolvedValue(bedFixture);
    vi.mocked(dynamoRepo.getFarm).mockResolvedValue(farmFixture);
    vi.mocked(dynamoRepo.getTagsForImage).mockResolvedValue([]);

    const res = await app.request(`/api/v1/images/${IMAGE_ID}`, {
      headers: { Authorization: authHeader(OWNER_USER_ID) },
    });
    expect(res.status).toBe(200);
  });

  it('GET /api/v1/images/:imageId — other user gets 404', async () => {
    vi.mocked(dynamoRepo.getImageById).mockResolvedValue(imageFixture);
    vi.mocked(dynamoRepo.getBedById).mockResolvedValue(bedFixture);
    vi.mocked(dynamoRepo.getFarm).mockResolvedValue(farmFixture);

    const res = await app.request(`/api/v1/images/${IMAGE_ID}`, {
      headers: { Authorization: authHeader(OTHER_USER_ID) },
    });
    expect(res.status).toBe(404);
  });
});

// ── Create farm — single farm constraint ──────────────────────────

describe('POST /api/v1/farms — user already has farm', () => {
  it('returns 409 when transaction is canceled (user already has a farm)', async () => {
    const txError = Object.assign(new Error('Transaction cancelled'), {
      name: 'TransactionCanceledException',
    });
    vi.mocked(dynamoRepo.createFarm).mockRejectedValue(txError);

    const res = await app.request('/api/v1/farms', {
      method: 'POST',
      headers: {
        Authorization: authHeader(OWNER_USER_ID),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: 'Second Farm', location_text: 'Test Location', latitude: 36.0, longitude: 138.0 }),
    });
    expect(res.status).toBe(409);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('CONFLICT');
  });
});

// ── Health routes are public (no auth) ────────────────────────────

describe('Public routes remain accessible without auth', () => {
  it('GET /health → 200 without auth', async () => {
    const res = await app.request('/health');
    expect(res.status).toBe(200);
  });

  it('GET /api/v1/health → 200 without auth', async () => {
    const res = await app.request('/api/v1/health');
    expect(res.status).toBe(200);
  });

  it('GET /api/v1 → 200 without auth', async () => {
    const res = await app.request('/api/v1');
    expect(res.status).toBe(200);
  });
});

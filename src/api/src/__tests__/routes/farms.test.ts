import { TEST_USER_ID, authHeaders } from '../helpers/auth';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import app from '../../app';
import { dynamoRepo } from '../../services/dynamodb';
import { getSignedImageUrl } from '../../services/s3';
import { NotFoundError } from '../../errors';

vi.mock('../../services/dynamodb', () => ({
  dynamoRepo: {
    getFarm: vi.fn(),
    getFarmForUser: vi.fn(),
    createFarm: vi.fn(),
    updateFarm: vi.fn(),
    getFieldsForFarm: vi.fn(),
    getBedsForField: vi.fn(),
    createField: vi.fn(),
    createBed: vi.fn(),
    createPlot: vi.fn(),
    getPlotsForBed: vi.fn(),
    getPlotsForFarm: vi.fn(),
    getLatestImageForPlot: vi.fn(),
  },
}));

vi.mock('../../services/s3', () => ({
  getSignedImageUrl: vi.fn(),
  uploadImage: vi.fn(),
}));

const FARM_ID = 'f0000000-0000-0000-0000-000000000001';
const PLOT_ID = 'a0000000-0000-0000-0000-000000000001';

const farmFixture = {
  id: FARM_ID,
  user_id: TEST_USER_ID,
  name: 'Test Farm',
  description: undefined,
  latitude: 36.0,
  longitude: 138.3,
  locale: 'en' as const,
  theme: 'system' as const,
  created_at: '2026-03-17T00:00:00.000Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSignedImageUrl).mockResolvedValue('https://example.com/signed');
});

// ── GET /api/v1/farms ─────────────────────────────────────────────

describe('GET /api/v1/farms', () => {
  it('returns 200 with array containing the farm when found', async () => {
    vi.mocked(dynamoRepo.getFarmForUser).mockResolvedValue(farmFixture);

    const res = await app.request('/api/v1/farms', { headers: authHeaders() });
    expect(res.status).toBe(200);
    const body = await res.json() as { data: unknown[] };
    expect(body.data).toHaveLength(1);
    expect((body.data[0] as Record<string, unknown>)['id']).toBe(FARM_ID);
  });

  it('returns 200 with empty array when user has no farm', async () => {
    vi.mocked(dynamoRepo.getFarmForUser).mockResolvedValue(null);

    const res = await app.request('/api/v1/farms', { headers: authHeaders() });
    expect(res.status).toBe(200);
    const body = await res.json() as { data: unknown[] };
    expect(body.data).toHaveLength(0);
  });

  it('returns 401 when not authenticated', async () => {
    const res = await app.request('/api/v1/farms');
    expect(res.status).toBe(401);
  });
});

// ── GET /api/v1/farms/:farmId ─────────────────────────────────────

describe('GET /api/v1/farms/:farmId', () => {
  it('returns 200 with farm and empty fields', async () => {
    vi.mocked(dynamoRepo.getFarm).mockResolvedValue(farmFixture);
    vi.mocked(dynamoRepo.getFieldsForFarm).mockResolvedValue([]);

    const res = await app.request(`/api/v1/farms/${FARM_ID}`, { headers: authHeaders() });
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body['id']).toBe(FARM_ID);
    expect(body['name']).toBe('Test Farm');
    expect(body['fields']).toEqual([]);
  });

  it('returns 404 when farm not found', async () => {
    vi.mocked(dynamoRepo.getFarm).mockRejectedValue(new NotFoundError('Farm not found'));
    const res = await app.request(`/api/v1/farms/${FARM_ID}`, { headers: authHeaders() });
    expect(res.status).toBe(404);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('returns nested fields→beds→plots', async () => {
    vi.mocked(dynamoRepo.getFarm).mockResolvedValue(farmFixture);
    vi.mocked(dynamoRepo.getFieldsForFarm).mockResolvedValue([
      { id: 'field-1', farm_id: FARM_ID, name: 'Field A', position: 1 },
    ]);
    vi.mocked(dynamoRepo.getBedsForField).mockResolvedValue([
      { id: 'bed-1', field_id: 'field-1', name: 'Bed 1', position: 1 },
    ]);
    vi.mocked(dynamoRepo.getPlotsForBed).mockResolvedValue([
      {
        id: PLOT_ID,
        bed_id: 'bed-1',
        farm_id: FARM_ID,
        label: 'P1',
        crop_type: 'tomato',
        crop_variety: 'Cherry',
        planted_at: '2026-03-01',
        expected_harvest: '2026-07-01',
        latest_status: 'no_data',
      },
    ]);

    const res = await app.request(`/api/v1/farms/${FARM_ID}`, { headers: authHeaders() });
    expect(res.status).toBe(200);
    const body = await res.json() as {
      fields: Array<{ beds: Array<{ plots: unknown[] }> }>;
    };
    expect(body.fields[0].beds[0].plots).toHaveLength(1);
  });

  it('returns bed with no plots as empty array', async () => {
    vi.mocked(dynamoRepo.getFarm).mockResolvedValue(farmFixture);
    vi.mocked(dynamoRepo.getFieldsForFarm).mockResolvedValue([
      { id: 'field-1', farm_id: FARM_ID, name: 'Field A', position: 1 },
    ]);
    vi.mocked(dynamoRepo.getBedsForField).mockResolvedValue([
      { id: 'bed-1', field_id: 'field-1', name: 'Bed 1', position: 1 },
    ]);
    vi.mocked(dynamoRepo.getPlotsForBed).mockResolvedValue([]);

    const res = await app.request(`/api/v1/farms/${FARM_ID}`, { headers: authHeaders() });
    const body = await res.json() as { fields: Array<{ beds: Array<{ plots: unknown[] }> }> };
    expect(body.fields[0].beds[0].plots).toEqual([]);
  });
});

// ── POST /api/v1/farms ────────────────────────────────────────────

describe('POST /api/v1/farms', () => {
  it('creates farm with valid body → 201', async () => {
    vi.mocked(dynamoRepo.createFarm).mockResolvedValue({
      ...farmFixture,
      name: 'New Farm',
    });

    const res = await app.request('/api/v1/farms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ name: 'New Farm', latitude: 36.0, longitude: 138.0 }),
    });
    expect(res.status).toBe(201);
    const body = await res.json() as { name: string };
    expect(body.name).toBe('New Farm');
  });

  it('returns 400 when name is missing', async () => {
    const res = await app.request('/api/v1/farms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ latitude: 36.0, longitude: 138.0 }),
    });
    expect(res.status).toBe(400);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when latitude out of range', async () => {
    const res = await app.request('/api/v1/farms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ name: 'Farm', latitude: 95, longitude: 138.0 }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 when longitude out of range', async () => {
    const res = await app.request('/api/v1/farms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ name: 'Farm', latitude: 36.0, longitude: 200 }),
    });
    expect(res.status).toBe(400);
  });
});

// ── PATCH /api/v1/farms/:farmId ───────────────────────────────────

describe('PATCH /api/v1/farms/:farmId', () => {
  it('updates farm with valid body → 200', async () => {
    vi.mocked(dynamoRepo.updateFarm).mockResolvedValue(undefined);
    // First call: ownership check; second call: re-fetch after update
    vi.mocked(dynamoRepo.getFarm).mockResolvedValue({ ...farmFixture, name: 'Renamed' });

    const res = await app.request(`/api/v1/farms/${FARM_ID}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ name: 'Renamed' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { name: string };
    expect(body.name).toBe('Renamed');
  });

  it('returns 400 when locale is invalid', async () => {
    vi.mocked(dynamoRepo.getFarm).mockResolvedValue(farmFixture);
    const res = await app.request(`/api/v1/farms/${FARM_ID}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ locale: 'zz' }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 404 when farm not found (updateFarm fails)', async () => {
    // Ownership check passes (farm exists with matching user_id)
    vi.mocked(dynamoRepo.getFarm).mockResolvedValueOnce(farmFixture);
    const err = new Error('ConditionalCheckFailedException');
    err.name = 'ConditionalCheckFailedException';
    vi.mocked(dynamoRepo.updateFarm).mockRejectedValue(err);

    const res = await app.request(`/api/v1/farms/${FARM_ID}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ name: 'New Name' }),
    });
    expect(res.status).toBe(404);
  });
});

// ── GET /api/v1/farms/:farmId/plots ──────────────────────────────

describe('GET /api/v1/farms/:farmId/plots', () => {
  it('returns 200 with plot list', async () => {
    vi.mocked(dynamoRepo.getFarm).mockResolvedValue(farmFixture);
    vi.mocked(dynamoRepo.getFieldsForFarm).mockResolvedValue([]);
    vi.mocked(dynamoRepo.getPlotsForFarm).mockResolvedValue([
      {
        id: PLOT_ID,
        bed_id: 'bed-1',
        farm_id: FARM_ID,
        label: 'Plot 1',
        crop_type: 'tomato',
        crop_variety: 'Cherry',
        planted_at: '2026-03-01',
        expected_harvest: '2026-07-01',
        latest_status: 'no_data',
      },
    ]);
    vi.mocked(dynamoRepo.getLatestImageForPlot).mockResolvedValue(null);

    const res = await app.request(`/api/v1/farms/${FARM_ID}/plots`, { headers: authHeaders() });
    expect(res.status).toBe(200);
    const body = await res.json() as { data: unknown[] };
    expect(body.data).toHaveLength(1);
  });

  it('returns 404 when farm not found', async () => {
    vi.mocked(dynamoRepo.getFarm).mockRejectedValue(new NotFoundError('Farm not found'));
    const res = await app.request(`/api/v1/farms/${FARM_ID}/plots`, { headers: authHeaders() });
    expect(res.status).toBe(404);
  });

  it('returns latest_image: null when no images', async () => {
    vi.mocked(dynamoRepo.getFarm).mockResolvedValue(farmFixture);
    vi.mocked(dynamoRepo.getFieldsForFarm).mockResolvedValue([]);
    vi.mocked(dynamoRepo.getPlotsForFarm).mockResolvedValue([
      {
        id: PLOT_ID,
        bed_id: 'bed-1',
        farm_id: FARM_ID,
        label: 'P1',
        crop_type: 'tomato',
        crop_variety: 'Cherry',
        planted_at: '2026-03-01',
        expected_harvest: '2026-07-01',
        latest_status: 'no_data',
      },
    ]);
    vi.mocked(dynamoRepo.getLatestImageForPlot).mockResolvedValue(null);

    const res = await app.request(`/api/v1/farms/${FARM_ID}/plots`, { headers: authHeaders() });
    const body = await res.json() as { data: Array<{ latest_image: null }> };
    expect(body.data[0].latest_image).toBeNull();
  });
});

// ── POST /api/v1/farms/:farmId/plots ──────────────────────────────

const plotFixture = {
  id: PLOT_ID,
  bed_id: 'bed-1',
  farm_id: FARM_ID,
  label: 'Tomato Plot',
  crop_type: 'tomato',
  crop_variety: 'Cherry',
  planted_at: '2026-03-21',
  expected_harvest: '2026-06-19',
  latest_status: 'no_data' as const,
};

describe('POST /api/v1/farms/:farmId/plots', () => {
  it('creates a plot with auto-created field+bed when farm has none → 201', async () => {
    vi.mocked(dynamoRepo.getFarm).mockResolvedValue(farmFixture);
    vi.mocked(dynamoRepo.getFieldsForFarm).mockResolvedValue([]);
    vi.mocked(dynamoRepo.createField).mockResolvedValue({
      id: 'field-1', farm_id: FARM_ID, name: 'Main Field', position: 1,
    });
    vi.mocked(dynamoRepo.createBed).mockResolvedValue({
      id: 'bed-1', field_id: 'field-1', name: 'Bed 1', position: 1,
    });
    vi.mocked(dynamoRepo.createPlot).mockResolvedValue(plotFixture);

    const res = await app.request(`/api/v1/farms/${FARM_ID}/plots`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ crop_type: 'tomato', crop_variety: 'Cherry' }),
    });
    expect(res.status).toBe(201);
    const body = await res.json() as { crop_type: string; id: string };
    expect(body.crop_type).toBe('tomato');
    expect(body.id).toBe(PLOT_ID);
  });

  it('uses existing field+bed when available → 201', async () => {
    vi.mocked(dynamoRepo.getFarm).mockResolvedValue(farmFixture);
    vi.mocked(dynamoRepo.getFieldsForFarm).mockResolvedValue([
      { id: 'field-1', farm_id: FARM_ID, name: 'Main Field', position: 1 },
    ]);
    vi.mocked(dynamoRepo.getBedsForField).mockResolvedValue([
      { id: 'bed-1', field_id: 'field-1', name: 'Bed 1', position: 1 },
    ]);
    vi.mocked(dynamoRepo.createPlot).mockResolvedValue({ ...plotFixture, crop_type: 'lettuce', crop_variety: 'Romaine' });

    const res = await app.request(`/api/v1/farms/${FARM_ID}/plots`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ crop_type: 'lettuce', crop_variety: 'Romaine' }),
    });
    expect(res.status).toBe(201);
  });

  it('auto-creates bed when field exists but has no beds → 201', async () => {
    vi.mocked(dynamoRepo.getFarm).mockResolvedValue(farmFixture);
    vi.mocked(dynamoRepo.getFieldsForFarm).mockResolvedValue([
      { id: 'field-1', farm_id: FARM_ID, name: 'Main Field', position: 1 },
    ]);
    vi.mocked(dynamoRepo.getBedsForField).mockResolvedValue([]);
    vi.mocked(dynamoRepo.createBed).mockResolvedValue({
      id: 'bed-1', field_id: 'field-1', name: 'Bed 1', position: 1,
    });
    vi.mocked(dynamoRepo.createPlot).mockResolvedValue(plotFixture);

    const res = await app.request(`/api/v1/farms/${FARM_ID}/plots`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ crop_type: 'tomato', crop_variety: 'Cherry' }),
    });
    expect(res.status).toBe(201);
  });

  it('uses provided label when given', async () => {
    vi.mocked(dynamoRepo.getFarm).mockResolvedValue(farmFixture);
    vi.mocked(dynamoRepo.getFieldsForFarm).mockResolvedValue([]);
    vi.mocked(dynamoRepo.createField).mockResolvedValue({ id: 'field-1', farm_id: FARM_ID, name: 'Main Field', position: 1 });
    vi.mocked(dynamoRepo.createBed).mockResolvedValue({ id: 'bed-1', field_id: 'field-1', name: 'Bed 1', position: 1 });
    vi.mocked(dynamoRepo.createPlot).mockResolvedValue({ ...plotFixture, label: 'North Patch' });

    const res = await app.request(`/api/v1/farms/${FARM_ID}/plots`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ crop_type: 'tomato', crop_variety: 'Cherry', label: 'North Patch' }),
    });
    expect(res.status).toBe(201);
    // Verify createPlot was called with the provided label
    expect(vi.mocked(dynamoRepo.createPlot)).toHaveBeenCalledWith(
      'bed-1', FARM_ID,
      expect.objectContaining({ label: 'North Patch' }),
    );
  });

  it('returns 400 when crop_type is missing', async () => {
    vi.mocked(dynamoRepo.getFarm).mockResolvedValue(farmFixture);
    const res = await app.request(`/api/v1/farms/${FARM_ID}/plots`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ crop_variety: 'Cherry' }),
    });
    expect(res.status).toBe(400);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when crop_variety is missing', async () => {
    vi.mocked(dynamoRepo.getFarm).mockResolvedValue(farmFixture);
    const res = await app.request(`/api/v1/farms/${FARM_ID}/plots`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ crop_type: 'tomato' }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 404 when farm not found or not owned', async () => {
    vi.mocked(dynamoRepo.getFarm).mockRejectedValue(new NotFoundError('Farm not found'));
    const res = await app.request(`/api/v1/farms/${FARM_ID}/plots`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ crop_type: 'tomato', crop_variety: 'Cherry' }),
    });
    expect(res.status).toBe(404);
  });
});

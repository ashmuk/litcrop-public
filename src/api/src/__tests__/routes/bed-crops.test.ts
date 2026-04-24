import { describe, it, expect, vi, beforeEach } from 'vitest';
import app from '../../app';
import { dynamoRepo } from '../../services/dynamodb';
import { NotFoundError } from '../../errors';
import type { Bed, BedCrop } from '@litcrop/shared';
import { TEST_USER_ID, authHeaders } from '../helpers/auth';
import { FARM_ID, BED_ID, bedFixture, farmFixture, membershipFixture } from '../fixtures';

vi.mock('../../services/dynamodb', () => ({
  dynamoRepo: {
    getBedById: vi.fn(),
    getFarm: vi.fn(),
    getFarmMembership: vi.fn(),
    listBedCropsByBed: vi.fn(),
    getBedCrop: vi.fn(),
    createBedCrop: vi.fn(),
    updateBedCrop: vi.fn(),
    deleteBedCrop: vi.fn(),
  },
}));

const CROP_ID = 'c0000000-0000-0000-0000-000000000001';

const bedCropFixture: BedCrop = {
  id: CROP_ID,
  bed_id: BED_ID,
  farm_id: FARM_ID,
  crop_type: 'tomato',
  crop_variety: 'Brandywine',
  planted_at: '2026-04-01',
  expected_harvest: '2026-07-15',
  status: 'active',
  created_by: TEST_USER_ID,
  created_at: '2026-04-01T10:00:00Z',
  updated_at: '2026-04-01T10:00:00Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(dynamoRepo.getFarmMembership).mockResolvedValue(membershipFixture);
  vi.mocked(dynamoRepo.getFarm).mockResolvedValue(farmFixture);
  vi.mocked(dynamoRepo.getBedById).mockResolvedValue(bedFixture);
});

// ── POST /api/v1/beds/:bedId/crops ───────────────────────────────

describe('POST /api/v1/beds/:bedId/crops', () => {
  it('creates a new BedCrop and returns 201 (happy path)', async () => {
    vi.mocked(dynamoRepo.listBedCropsByBed).mockResolvedValue([]);
    vi.mocked(dynamoRepo.createBedCrop).mockImplementation(async (bc: BedCrop) => bc);

    const res = await app.request(`/api/v1/beds/${BED_ID}/crops`, {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        crop_type: 'lettuce',
        crop_variety: 'Buttercrunch',
        planted_at: '2026-04-10',
      }),
    });

    expect(res.status).toBe(201);
    const body = await res.json() as Record<string, unknown>;
    expect(body['bed_id']).toBe(BED_ID);
    expect(body['farm_id']).toBe(FARM_ID);
    expect(body['crop_type']).toBe('lettuce');
    expect(body['crop_variety']).toBe('Buttercrunch');
    expect(body['status']).toBe('planned'); // default
    expect(body['created_by']).toBe(TEST_USER_ID);
    expect(vi.mocked(dynamoRepo.createBedCrop)).toHaveBeenCalledOnce();
  });

  it('rejects with 409 when bed already has 5 active/planned crops', async () => {
    const existing: BedCrop[] = Array.from({ length: 5 }, (_, i) => ({
      ...bedCropFixture,
      id: `crop-${i}`,
      status: i % 2 === 0 ? 'active' : 'planned',
    }));
    vi.mocked(dynamoRepo.listBedCropsByBed).mockResolvedValue(existing);

    const res = await app.request(`/api/v1/beds/${BED_ID}/crops`, {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ crop_type: 'eggplant' }),
    });

    expect(res.status).toBe(409);
    expect(vi.mocked(dynamoRepo.createBedCrop)).not.toHaveBeenCalled();
  });

  it('does NOT count harvested/failed crops toward the 5-cap', async () => {
    // 5 harvested + 0 active/planned → cap NOT exceeded
    const harvested: BedCrop[] = Array.from({ length: 5 }, (_, i) => ({
      ...bedCropFixture,
      id: `crop-${i}`,
      status: 'harvested',
      completed_at: '2026-03-01',
    }));
    vi.mocked(dynamoRepo.listBedCropsByBed).mockResolvedValue(harvested);
    vi.mocked(dynamoRepo.createBedCrop).mockImplementation(async (bc: BedCrop) => bc);

    const res = await app.request(`/api/v1/beds/${BED_ID}/crops`, {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ crop_type: 'cucumber' }),
    });

    expect(res.status).toBe(201);
  });

  it('returns 404 when the bed does not exist', async () => {
    vi.mocked(dynamoRepo.getBedById).mockRejectedValue(new NotFoundError('Bed not found'));

    const res = await app.request(`/api/v1/beds/${BED_ID}/crops`, {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ crop_type: 'tomato' }),
    });

    expect(res.status).toBe(404);
  });

  it('counts a legacy inline crop toward the 5-cap (S5-4)', async () => {
    // Legacy bed (crop_type set, no completed_at) + 4 real active crops = 5 effective active.
    const fourReal: BedCrop[] = Array.from({ length: 4 }, (_, i) => ({
      ...bedCropFixture,
      id: `crop-${i}`,
      status: 'active',
    }));
    vi.mocked(dynamoRepo.getBedById).mockResolvedValue({
      ...bedFixture,
      crop_type: 'legacy-tomato',
      completed_at: undefined,
    } as Bed);
    vi.mocked(dynamoRepo.listBedCropsByBed).mockResolvedValue(fourReal);

    const res = await app.request(`/api/v1/beds/${BED_ID}/crops`, {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ crop_type: 'cucumber' }),
    });

    expect(res.status).toBe(409);
    expect(vi.mocked(dynamoRepo.createBedCrop)).not.toHaveBeenCalled();
  });
});

// ── GET /api/v1/beds/:bedId/crops ────────────────────────────────

describe('GET /api/v1/beds/:bedId/crops', () => {
  it('returns all crops by default', async () => {
    const crops = [
      { ...bedCropFixture, status: 'active' as const },
      { ...bedCropFixture, id: 'c2', status: 'harvested' as const },
    ];
    vi.mocked(dynamoRepo.listBedCropsByBed).mockResolvedValue(crops);

    const res = await app.request(`/api/v1/beds/${BED_ID}/crops`, { headers: authHeaders() });

    expect(res.status).toBe(200);
    const body = await res.json() as { items: BedCrop[] };
    expect(body.items).toHaveLength(2);
  });

  it('filters by status when ?status=active', async () => {
    const crops = [
      { ...bedCropFixture, status: 'active' as const },
      { ...bedCropFixture, id: 'c2', status: 'harvested' as const },
      { ...bedCropFixture, id: 'c3', status: 'planned' as const },
    ];
    vi.mocked(dynamoRepo.listBedCropsByBed).mockResolvedValue(crops);

    const res = await app.request(`/api/v1/beds/${BED_ID}/crops?status=active`, { headers: authHeaders() });

    expect(res.status).toBe(200);
    const body = await res.json() as { items: BedCrop[] };
    expect(body.items).toHaveLength(1);
    expect(body.items[0].status).toBe('active');
  });

  it('rejects invalid status filter with 400', async () => {
    const res = await app.request(`/api/v1/beds/${BED_ID}/crops?status=growing`, { headers: authHeaders() });
    expect(res.status).toBe(400);
  });
});

// ── PATCH /api/v1/beds/:bedId/crops/:bedCropId ───────────────────

describe('PATCH /api/v1/beds/:bedId/crops/:bedCropId', () => {
  it('updates a BedCrop and returns the merged shape', async () => {
    vi.mocked(dynamoRepo.getBedCrop).mockResolvedValue(bedCropFixture);
    vi.mocked(dynamoRepo.updateBedCrop).mockResolvedValue(undefined);

    const res = await app.request(`/api/v1/beds/${BED_ID}/crops/${CROP_ID}`, {
      method: 'PATCH',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'harvested', completed_at: '2026-07-10' }),
    });

    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body['id']).toBe(CROP_ID);
    expect(body['status']).toBe('harvested');
    expect(body['completed_at']).toBe('2026-07-10');
    expect(vi.mocked(dynamoRepo.updateBedCrop)).toHaveBeenCalledOnce();
  });

  it('returns 404 when the crop does not exist', async () => {
    vi.mocked(dynamoRepo.getBedCrop).mockRejectedValue(new NotFoundError('BedCrop not found'));

    const res = await app.request(`/api/v1/beds/${BED_ID}/crops/${CROP_ID}`, {
      method: 'PATCH',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'harvested' }),
    });

    expect(res.status).toBe(404);
  });

  it('auto-sets completed_at on non-terminal → terminal transition (S5-1)', async () => {
    vi.mocked(dynamoRepo.getBedCrop).mockResolvedValue({ ...bedCropFixture, status: 'active' });
    vi.mocked(dynamoRepo.updateBedCrop).mockResolvedValue(undefined);

    const res = await app.request(`/api/v1/beds/${BED_ID}/crops/${CROP_ID}`, {
      method: 'PATCH',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'harvested' }),
    });

    expect(res.status).toBe(200);
    const updates = vi.mocked(dynamoRepo.updateBedCrop).mock.calls[0][3];
    expect(updates).toHaveProperty('completed_at');
    expect(typeof updates['completed_at']).toBe('string');
  });

  it('auto-clears completed_at on terminal → non-terminal transition (S5-1)', async () => {
    vi.mocked(dynamoRepo.getBedCrop).mockResolvedValue({
      ...bedCropFixture,
      status: 'harvested',
      completed_at: '2026-07-10',
    });
    vi.mocked(dynamoRepo.updateBedCrop).mockResolvedValue(undefined);

    const res = await app.request(`/api/v1/beds/${BED_ID}/crops/${CROP_ID}`, {
      method: 'PATCH',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'active' }),
    });

    expect(res.status).toBe(200);
    const updates = vi.mocked(dynamoRepo.updateBedCrop).mock.calls[0][3];
    expect(updates['completed_at']).toBeNull();
  });
});

// ── DELETE /api/v1/beds/:bedId/crops/:bedCropId ──────────────────

describe('DELETE /api/v1/beds/:bedId/crops/:bedCropId', () => {
  it('hard-deletes when status is planned', async () => {
    vi.mocked(dynamoRepo.getBedCrop).mockResolvedValue({ ...bedCropFixture, status: 'planned' });
    vi.mocked(dynamoRepo.deleteBedCrop).mockResolvedValue(undefined);

    const res = await app.request(`/api/v1/beds/${BED_ID}/crops/${CROP_ID}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });

    expect(res.status).toBe(204);
    expect(vi.mocked(dynamoRepo.deleteBedCrop)).toHaveBeenCalledOnce();
    expect(vi.mocked(dynamoRepo.updateBedCrop)).not.toHaveBeenCalled();
  });

  it('soft-deletes (status → failed) when crop is active', async () => {
    vi.mocked(dynamoRepo.getBedCrop).mockResolvedValue({ ...bedCropFixture, status: 'active' });
    vi.mocked(dynamoRepo.updateBedCrop).mockResolvedValue(undefined);

    const res = await app.request(`/api/v1/beds/${BED_ID}/crops/${CROP_ID}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });

    expect(res.status).toBe(204);
    expect(vi.mocked(dynamoRepo.deleteBedCrop)).not.toHaveBeenCalled();
    const updateCall = vi.mocked(dynamoRepo.updateBedCrop).mock.calls[0];
    expect(updateCall[3]).toMatchObject({ status: 'failed' });
    expect(updateCall[3]).toHaveProperty('completed_at');
  });

  it('returns 204 without mutating when the crop is already terminal (S5-2)', async () => {
    vi.mocked(dynamoRepo.getBedCrop).mockResolvedValue({
      ...bedCropFixture,
      status: 'harvested',
      completed_at: '2026-07-10',
    });

    const res = await app.request(`/api/v1/beds/${BED_ID}/crops/${CROP_ID}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });

    expect(res.status).toBe(204);
    // Neither write path must fire — the historical completed_at is preserved.
    expect(vi.mocked(dynamoRepo.deleteBedCrop)).not.toHaveBeenCalled();
    expect(vi.mocked(dynamoRepo.updateBedCrop)).not.toHaveBeenCalled();
  });
});

import { Hono } from 'hono';
import { randomUUID } from 'crypto';
import { dynamoRepo } from '../services/dynamodb';
import { getAuthContext } from '../middleware/auth';
import { assertBedAccess, assertBedWriteAccess, parseBody } from './_helpers';
import {
  NotFoundError,
  ConflictError,
  ServiceUnavailableError,
} from '../errors';
import {
  CreateBedCropRequestSchema,
  UpdateBedCropRequestSchema,
  BedCropStatusSchema,
  MAX_ACTIVE_CROPS_PER_BED,
} from '@litcrop/shared';
import type { Bed, BedCrop, BedCropStatus } from '@litcrop/shared';

/**
 * BedCrop routes (#279 Wave B).
 *
 * Mounted at /api/v1/beds in app.ts. Nested shape:
 *   POST   /api/v1/beds/:bedId/crops
 *   GET    /api/v1/beds/:bedId/crops?status=active|planned|harvested|failed|all
 *   PATCH  /api/v1/beds/:bedId/crops/:bedCropId
 *   DELETE /api/v1/beds/:bedId/crops/:bedCropId
 *
 * The PATCH/DELETE URLs are nested under :bedId (not flat /crops/:id as
 * the original DESIGN-279 §4.1 draft suggested) so that ownership can be
 * checked via the parent bed without a secondary lookup, and so every
 * BedCrop query can use the repo's single `GSI1PK=BED#<b>` entrypoint.
 */

const router = new Hono();

/**
 * Wrap a DDB call and normalize failures: re-throw NotFoundError verbatim,
 * convert anything else to 503. Used for every repo call in this router.
 */
async function ddbCall<T>(op: () => Promise<T>): Promise<T> {
  try {
    return await op();
  } catch (err) {
    if (err instanceof NotFoundError) throw err;
    throw new ServiceUnavailableError('Storage service unavailable');
  }
}

async function loadBed(bedId: string): Promise<Bed> {
  return ddbCall(() => dynamoRepo.getBedById(bedId));
}

// ── POST /api/v1/beds/:bedId/crops ───────────────────────────────

router.post('/:bedId/crops', async (c) => {
  const { bedId } = c.req.param();
  const { userId } = getAuthContext(c);

  const bed = await loadBed(bedId);
  await assertBedWriteAccess(bed, userId);

  const body = await c.req.json<Record<string, unknown>>();
  const parsed = parseBody(CreateBedCropRequestSchema, body);

  // 5-cap enforcement (scope memory constraint 2 + DESIGN-279 §3.5):
  // count active|planned rows for this bed; harvested/failed are unbounded.
  const existing = await ddbCall(() => dynamoRepo.listBedCropsByBed(bedId));
  const active = existing.filter((c) => c.status === 'active' || c.status === 'planned');
  if (active.length >= MAX_ACTIVE_CROPS_PER_BED) {
    throw new ConflictError(
      `Cannot add crop: bed already has ${active.length} active/planned crops (max ${MAX_ACTIVE_CROPS_PER_BED}).`,
    );
  }

  const now = new Date().toISOString();
  const bedCrop: BedCrop = {
    id: randomUUID(),
    bed_id: bedId,
    farm_id: bed.farm_id,
    crop_type: parsed.crop_type,
    crop_variety: parsed.crop_variety,
    planted_at: parsed.planted_at ?? undefined,
    expected_harvest: parsed.expected_harvest ?? undefined,
    status: parsed.status ?? 'planned',
    notes: parsed.notes,
    created_by: userId,
    created_at: now,
    updated_at: now,
  };

  await ddbCall(() => dynamoRepo.createBedCrop(bedCrop));

  return c.json(bedCrop, 201);
});

// ── GET /api/v1/beds/:bedId/crops?status=all|active|planned|harvested|failed ──

router.get('/:bedId/crops', async (c) => {
  const { bedId } = c.req.param();
  const { userId, isAdmin } = getAuthContext(c);

  const bed = await loadBed(bedId);
  await assertBedAccess(bed, userId, isAdmin);

  const statusQ = c.req.query('status') ?? 'all';
  let filter: BedCropStatus | 'all' = 'all';
  if (statusQ !== 'all') {
    const parsed = BedCropStatusSchema.safeParse(statusQ);
    if (!parsed.success) {
      return c.json({ error: 'Invalid status filter', code: 'INVALID_STATUS' }, 400);
    }
    filter = parsed.data;
  }

  const all = await ddbCall(() => dynamoRepo.listBedCropsByBed(bedId));
  const items = filter === 'all' ? all : all.filter((c) => c.status === filter);

  return c.json({ items });
});

// ── PATCH /api/v1/beds/:bedId/crops/:bedCropId ──────────────────

router.patch('/:bedId/crops/:bedCropId', async (c) => {
  const { bedId, bedCropId } = c.req.param();
  const { userId } = getAuthContext(c);

  const bed = await loadBed(bedId);
  await assertBedWriteAccess(bed, userId);

  // Verify the crop exists + belongs to this bed.
  const existing = await ddbCall(() => dynamoRepo.getBedCrop(bedId, bedCropId));

  const body = await c.req.json<Record<string, unknown>>();
  const validated = parseBody(UpdateBedCropRequestSchema, body);

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const [key, value] of Object.entries(validated)) {
    if (value !== undefined) updates[key] = value;
  }

  await ddbCall(() => dynamoRepo.updateBedCrop(bed.farm_id, bedId, bedCropId, updates));

  // Merge in-memory for response. Null values were REMOVEs — drop them from
  // the merged view so the response doesn't carry `"notes": null` when the
  // caller asked to clear it.
  const merged: Record<string, unknown> = { ...existing };
  for (const [key, value] of Object.entries(updates)) {
    if (value === null) delete merged[key];
    else merged[key] = value;
  }

  return c.json(merged);
});

// ── DELETE /api/v1/beds/:bedId/crops/:bedCropId ─────────────────

router.delete('/:bedId/crops/:bedCropId', async (c) => {
  const { bedId, bedCropId } = c.req.param();
  const { userId } = getAuthContext(c);

  const bed = await loadBed(bedId);
  await assertBedWriteAccess(bed, userId);

  const crop = await ddbCall(() => dynamoRepo.getBedCrop(bedId, bedCropId));

  // Hard-delete only when the crop was never active (status === 'planned');
  // otherwise soft-delete by flipping status to 'failed' + setting completed_at.
  await ddbCall(() => {
    if (crop.status === 'planned') {
      return dynamoRepo.deleteBedCrop(bed.farm_id, bedId, bedCropId);
    }
    const now = new Date().toISOString();
    return dynamoRepo.updateBedCrop(bed.farm_id, bedId, bedCropId, {
      status: 'failed',
      completed_at: now,
      updated_at: now,
    });
  });

  return c.body(null, 204);
});

export default router;

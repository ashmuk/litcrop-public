import { Hono } from 'hono';
import { randomUUID } from 'crypto';
import { dynamoRepo } from '../services/dynamodb';
import { getAuthContext } from '../middleware/auth';
import { assertFarmAccess, parseBody } from './_helpers';
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
 *
 * All handlers:
 *  - resolve the parent bed → farm via dynamoRepo.getBedById
 *  - delegate read-access authz to assertBedAccess (farm membership)
 *  - delegate write-access authz to assertBedWriteAccess (admin|owner)
 */

const router = new Hono();

/** Verify caller is a member of the farm containing this bed. */
async function assertBedAccess(bed: Bed, userId: string, isAdmin?: boolean): Promise<void> {
  try {
    await assertFarmAccess(bed.farm_id, userId, undefined, isAdmin);
  } catch (err) {
    if (err instanceof NotFoundError) {
      throw new NotFoundError(`Bed not found: ${bed.id}`);
    }
    throw err;
  }
}

/** Verify caller is admin|owner for the farm containing this bed (write ops). */
async function assertBedWriteAccess(bed: Bed, userId: string): Promise<void> {
  try {
    await assertFarmAccess(bed.farm_id, userId, ['admin', 'owner']);
  } catch (err) {
    if (err instanceof NotFoundError) {
      throw new NotFoundError(`Bed not found: ${bed.id}`);
    }
    throw err;
  }
}

/** Fetch a bed or throw NotFoundError (wraps DDB errors as 503). */
async function loadBed(bedId: string): Promise<Bed> {
  try {
    return await dynamoRepo.getBedById(bedId);
  } catch (err) {
    if (err instanceof NotFoundError) throw err;
    throw new ServiceUnavailableError('Storage service unavailable');
  }
}

// ── POST /api/v1/beds/:bedId/crops ───────────────────────────────

router.post('/:bedId/crops', async (c) => {
  const { bedId } = c.req.param();
  const { userId } = getAuthContext(c);

  const bed = await loadBed(bedId);
  await assertBedWriteAccess(bed, userId);

  const body = await c.req.json<Record<string, unknown>>();
  const parsed = parseBody(CreateBedCropRequestSchema, body);

  // 5-cap enforcement — count active|planned rows for this bed.
  // Scope memory constraint 2 + DESIGN-279 §3.5.
  let existing: BedCrop[];
  try {
    existing = await dynamoRepo.listBedCropsByBed(bedId);
  } catch {
    throw new ServiceUnavailableError('Storage service unavailable');
  }
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

  try {
    await dynamoRepo.createBedCrop(bedCrop);
  } catch {
    throw new ServiceUnavailableError('Storage service unavailable');
  }

  return c.json(bedCrop, 201);
});

// ── GET /api/v1/beds/:bedId/crops?status=all|active|planned|harvested|failed ──

router.get('/:bedId/crops', async (c) => {
  const { bedId } = c.req.param();
  const { userId, isAdmin } = getAuthContext(c);

  const bed = await loadBed(bedId);
  await assertBedAccess(bed, userId, isAdmin);

  const statusQ = c.req.query('status') ?? 'all';
  let filter: BedCropStatus | 'all';
  if (statusQ === 'all') {
    filter = 'all';
  } else {
    const parsed = BedCropStatusSchema.safeParse(statusQ);
    if (!parsed.success) {
      return c.json({ error: 'Invalid status filter', code: 'INVALID_STATUS' }, 400);
    }
    filter = parsed.data;
  }

  let items: BedCrop[];
  try {
    items = await dynamoRepo.listBedCropsByBed(bedId);
  } catch {
    throw new ServiceUnavailableError('Storage service unavailable');
  }
  if (filter !== 'all') {
    items = items.filter((c) => c.status === filter);
  }

  return c.json({ items });
});

// ── PATCH /api/v1/beds/:bedId/crops/:bedCropId ──────────────────

router.patch('/:bedId/crops/:bedCropId', async (c) => {
  const { bedId, bedCropId } = c.req.param();
  const { userId } = getAuthContext(c);

  const bed = await loadBed(bedId);
  await assertBedWriteAccess(bed, userId);

  // Verify the crop exists + belongs to this bed.
  let existing: BedCrop;
  try {
    existing = await dynamoRepo.getBedCrop(bedId, bedCropId);
  } catch (err) {
    if (err instanceof NotFoundError) throw err;
    throw new ServiceUnavailableError('Storage service unavailable');
  }

  const body = await c.req.json<Record<string, unknown>>();
  const validated = parseBody(UpdateBedCropRequestSchema, body);

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const [key, value] of Object.entries(validated)) {
    if (value !== undefined) updates[key] = value;
  }

  try {
    await dynamoRepo.updateBedCrop(bed.farm_id, bedId, bedCropId, updates);
  } catch {
    throw new ServiceUnavailableError('Storage service unavailable');
  }

  // Merge in-memory for response. Null-values were REMOVEs — drop those
  // from the merged view so the response doesn't carry `"notes": null`
  // when the caller asked to clear it.
  const merged = { ...existing } as Record<string, unknown>;
  for (const [key, value] of Object.entries(updates)) {
    if (value === null) {
      delete merged[key];
    } else {
      merged[key] = value;
    }
  }

  return c.json(merged);
});

// ── DELETE /api/v1/beds/:bedId/crops/:bedCropId ─────────────────

router.delete('/:bedId/crops/:bedCropId', async (c) => {
  const { bedId, bedCropId } = c.req.param();
  const { userId } = getAuthContext(c);

  const bed = await loadBed(bedId);
  await assertBedWriteAccess(bed, userId);

  let crop: BedCrop;
  try {
    crop = await dynamoRepo.getBedCrop(bedId, bedCropId);
  } catch (err) {
    if (err instanceof NotFoundError) throw err;
    throw new ServiceUnavailableError('Storage service unavailable');
  }

  // Soft-delete by default: flip status to 'failed' + set completed_at.
  // Hard delete only when the crop was never active (status === 'planned').
  try {
    if (crop.status === 'planned') {
      await dynamoRepo.deleteBedCrop(bed.farm_id, bedId, bedCropId);
    } else {
      await dynamoRepo.updateBedCrop(bed.farm_id, bedId, bedCropId, {
        status: 'failed',
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }
  } catch {
    throw new ServiceUnavailableError('Storage service unavailable');
  }

  return c.body(null, 204);
});

export default router;

/**
 * Farm Diary routes — Beta-7 (#245)
 *
 * Farm-scoped endpoints (JWT auth via farm membership):
 *   POST   /api/v1/farms/:farmId/diary            — create entry
 *   GET    /api/v1/farms/:farmId/diary            — list entries (paginated)
 *   GET    /api/v1/farms/:farmId/diary/:entryId   — get single entry
 *   PATCH  /api/v1/farms/:farmId/diary/:entryId   — update entry
 *   DELETE /api/v1/farms/:farmId/diary/:entryId   — delete entry
 */

import { Hono } from 'hono';
import { randomUUID } from 'crypto';
import { dynamoRepo } from '../services/dynamodb';
import { getAuthContext } from '../middleware/auth';
import { assertFarmAccess } from './_helpers';
import { ValidationError, NotFoundError, ServiceUnavailableError } from '../errors';
import { appEvents } from '../services/events';
import {
  CreateDiaryEntrySchema,
  UpdateDiaryEntrySchema,
  DiaryListQuerySchema,
  estimateHarvestDate,
} from '@litcrop/shared';
import type { DiaryEntry } from '@litcrop/shared';

export const diaryRouter = new Hono();

// ── Helpers ──────────────────────────────────────────────────────

/**
 * Sum of all costs[].amount regardless of currency.
 * NOTE: This field mixes currencies — use for single-entry display only.
 * For currency-aware aggregation (ROI dashboard), use roi-utils.sumCostsByCurrency().
 */
function calcCostTotal(entry: DiaryEntry): number {
  return entry.costs.reduce((sum, c) => sum + c.amount, 0);
}

/**
 * Resolve a bed_id to its bed_name.
 * Returns null if bed_id is null or the bed has been deleted.
 */
async function resolveBedName(bedId: string | null, nameCache?: Map<string, string | null>): Promise<string | null> {
  if (!bedId) return null;
  if (nameCache?.has(bedId)) return nameCache.get(bedId) ?? null;
  try {
    const bed = await dynamoRepo.getBedById(bedId);
    const name = bed.name;
    nameCache?.set(bedId, name);
    return name;
  } catch (err) {
    if (err instanceof NotFoundError) {
      nameCache?.set(bedId, null);
      return null;
    }
    throw err;
  }
}

/**
 * Resolve a created_by user ID to a display name.
 * Returns the user's display_name, or null if no profile or no display name is set.
 */
async function resolveCreatorName(userId: string, nameCache?: Map<string, string | null>): Promise<string | null> {
  if (nameCache?.has(userId)) return nameCache.get(userId) ?? null;
  try {
    const profile = await dynamoRepo.getUserProfile(userId);
    const name = profile?.display_name || null;
    nameCache?.set(userId, name);
    return name;
  } catch (err) {
    if (err instanceof NotFoundError) {
      nameCache?.set(userId, null);
      return null;
    }
    throw err;
  }
}

/** Build the full diary entry response shape */
async function buildEntryResponse(
  entry: DiaryEntry,
  bedNameCache?: Map<string, string | null>,
  creatorNameCache?: Map<string, string | null>,
) {
  const bed_name = await resolveBedName(entry.bed_id, bedNameCache);
  const created_by_name = await resolveCreatorName(entry.created_by, creatorNameCache);
  return {
    id: entry.id,
    farm_id: entry.farm_id,
    date: entry.date,
    category: entry.category,
    entry_type: entry.entry_type,
    description: entry.description,
    time_spent_minutes: entry.time_spent_minutes,
    bed_id: entry.bed_id,
    bed_name,
    photo_ids: entry.photo_ids,
    costs: entry.costs,
    cost_total: calcCostTotal(entry),
    harvest_amount: entry.harvest_amount,
    harvest_unit: entry.harvest_unit,
    revenue: entry.revenue,
    revenue_currency: entry.revenue_currency,
    created_by: entry.created_by,
    created_by_name,
    created_at: entry.created_at,
    updated_at: entry.updated_at,
  };
}

/**
 * Fetch a diary entry, verify farm scope (IDOR guard), and check creator/role auth.
 * Shared by GET single, PATCH, and DELETE handlers.
 */
async function loadAndAuthorizeEntry(
  farmId: string,
  entryId: string,
  userId: string,
  isAdmin: boolean,
  membership: { role: string },
  requireWrite: boolean,
): Promise<DiaryEntry> {
  let entry: DiaryEntry | null;
  try {
    entry = await dynamoRepo.getDiaryEntryById(entryId);
  } catch {
    throw new ServiceUnavailableError('Storage service unavailable');
  }

  if (!entry || entry.farm_id !== farmId) {
    throw new NotFoundError('Diary entry not found');
  }

  if (requireWrite) {
    const isCreator = entry.created_by === userId;
    const isPrivileged = isAdmin || membership.role === 'admin' || membership.role === 'owner';
    if (!isCreator && !isPrivileged) {
      throw new NotFoundError('Diary entry not found');
    }
  }

  return entry;
}

/**
 * Bridge diary planting/harvesting entries to bed crop dates (#273 M1).
 * Non-blocking: bed update failure is logged but does not fail the diary operation.
 */
async function syncBedDatesFromDiary(
  category: string,
  bedId: string | null,
  date: string | null,
  entryType: string,
): Promise<void> {
  if (!bedId) return;
  if (entryType === 'reserved') return; // reserved entries don't set bed dates (#287)
  if (category !== 'planting' && category !== 'harvesting') return;

  try {
    const bed = await dynamoRepo.getBedById(bedId);

    if (category === 'planting') {
      const updates: Record<string, unknown> = { planted_at: date };
      if (date && bed.crop_type) {
        const harvest = estimateHarvestDate(date, bed.crop_type);
        if (harvest) updates['expected_harvest'] = harvest;
      } else if (date === null) {
        // Clearing planted_at also clears auto-calculated expected_harvest
        updates['expected_harvest'] = null;
      }
      await dynamoRepo.updateBed(bed.farm_id, bedId, bed.row, bed.col, updates);
    } else {
      // category === 'harvesting' — set expected_harvest directly
      await dynamoRepo.updateBed(bed.farm_id, bedId, bed.row, bed.col, {
        expected_harvest: date,
      });
    }
  } catch (err) {
    console.warn(`[diary→bed bridge] Failed to sync ${category} date for bed ${bedId}:`, err);
  }
}

// ── POST /:farmId/diary — Create entry ───────────────────────────

diaryRouter.post('/:farmId/diary', async (c) => {
  const { userId, userEmail, isAdmin } = getAuthContext(c);
  const farmId = c.req.param('farmId');
  await assertFarmAccess(farmId, userId, undefined, isAdmin);

  const body = await c.req.json<Record<string, unknown>>();
  const parsed = CreateDiaryEntrySchema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError('Invalid diary entry data', { issues: parsed.error.issues });
  }

  const { bed_id, photo_ids } = parsed.data;

  if (bed_id) {
    let bed;
    try {
      bed = await dynamoRepo.getBedById(bed_id);
    } catch (err) {
      if (err instanceof NotFoundError) {
        throw new ValidationError('Bed not found in this farm');
      }
      throw new ServiceUnavailableError('Storage service unavailable');
    }
    if (bed.farm_id !== farmId) {
      throw new ValidationError('Bed not found in this farm');
    }
  }

  if (photo_ids.length > 0) {
    await Promise.all(photo_ids.map(async (imageId) => {
      let image;
      try {
        image = await dynamoRepo.getImageById(imageId);
      } catch (err) {
        if (err instanceof NotFoundError) throw new ValidationError(`Photo not found: ${imageId}`);
        throw new ServiceUnavailableError('Storage service unavailable');
      }
      if (!image.bed_id) throw new ValidationError(`Photo not found in this farm: ${imageId}`);
      let imageBed;
      try {
        imageBed = await dynamoRepo.getBedById(image.bed_id);
      } catch (err) {
        if (err instanceof NotFoundError) throw new ValidationError(`Photo not found in this farm: ${imageId}`);
        throw new ServiceUnavailableError('Storage service unavailable');
      }
      if (imageBed.farm_id !== farmId) throw new ValidationError(`Photo not found in this farm: ${imageId}`);
    }));
  }

  const entryId = randomUUID();
  let entry: DiaryEntry;
  try {
    entry = await dynamoRepo.createDiaryEntry(farmId, entryId, {
      ...parsed.data,
      bed_id: parsed.data.bed_id ?? null,
      time_spent_minutes: parsed.data.time_spent_minutes ?? null,
      created_by: userId,
    });
  } catch (err) {
    throw new ServiceUnavailableError('Storage service unavailable');
  }

  appEvents.emit('diary.created', {
    type: 'diary.created',
    timestamp: new Date().toISOString(),
    actor_id: userId,
    actor_email: userEmail,
    payload: {
      farm_id: farmId,
      entry_id: entryId,
      category: entry.category,
      date: entry.date,
    },
  });

  // Bridge: sync bed planted_at / expected_harvest from diary (#273)
  await syncBedDatesFromDiary(entry.category, entry.bed_id, entry.date, entry.entry_type);

  const response = await buildEntryResponse(entry);
  return c.json(response, 201);
});

// ── GET /:farmId/diary — List entries (paginated) ────────────────

diaryRouter.get('/:farmId/diary', async (c) => {
  const { userId, isAdmin } = getAuthContext(c);
  const farmId = c.req.param('farmId');
  await assertFarmAccess(farmId, userId, undefined, isAdmin);

  const rawQuery = {
    from: c.req.query('from'),
    to: c.req.query('to'),
    category: c.req.query('category'),
    limit: c.req.query('limit'),
    cursor: c.req.query('cursor'),
  };

  const parsedQuery = DiaryListQuerySchema.safeParse(rawQuery);
  if (!parsedQuery.success) {
    throw new ValidationError('Invalid query parameters', { issues: parsedQuery.error.issues });
  }

  const { category, limit, cursor } = parsedQuery.data;

  // Default date range: 30 days back → 1 year ahead (includes future reserved entries)
  const now = new Date();
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const oneYearAhead = new Date(now);
  oneYearAhead.setFullYear(oneYearAhead.getFullYear() + 1);
  const defaultFrom = thirtyDaysAgo.toISOString().slice(0, 10);
  const defaultTo = oneYearAhead.toISOString().slice(0, 10);

  const from = parsedQuery.data.from ?? defaultFrom;
  const to = parsedQuery.data.to ?? defaultTo;

  let result: { items: DiaryEntry[]; nextCursor: string | null };
  try {
    result = await dynamoRepo.getDiaryEntries(farmId, from, to, limit, cursor);
  } catch (err) {
    if (
      err instanceof Error &&
      (err.name === 'ValidationException' || err.message?.includes('Invalid cursor'))
    ) {
      throw new ValidationError('Invalid cursor');
    }
    throw new ServiceUnavailableError('Storage service unavailable');
  }

  // Deduplicate lookups across entries sharing the same bed_id or created_by
  const bedNameCache = new Map<string, string | null>();
  const creatorNameCache = new Map<string, string | null>();
  const entries = [];
  for (const entry of result.items) {
    entries.push(await buildEntryResponse(entry, bedNameCache, creatorNameCache));
  }

  const filtered = category ? entries.filter(e => e.category === category) : entries;

  return c.json({
    data: filtered,
    meta: {
      count: filtered.length,
      limit,
      next_cursor: result.nextCursor,
    },
  });
});

// ── GET /:farmId/diary/:entryId — Single entry ───────────────────

diaryRouter.get('/:farmId/diary/:entryId', async (c) => {
  const { userId, isAdmin } = getAuthContext(c);
  const farmId = c.req.param('farmId');
  const entryId = c.req.param('entryId');
  const { membership } = await assertFarmAccess(farmId, userId, undefined, isAdmin);

  const entry = await loadAndAuthorizeEntry(farmId, entryId, userId, isAdmin, membership, false);
  const response = await buildEntryResponse(entry);
  return c.json(response);
});

// ── PATCH /:farmId/diary/:entryId — Update entry ─────────────────

diaryRouter.patch('/:farmId/diary/:entryId', async (c) => {
  const { userId, userEmail, isAdmin } = getAuthContext(c);
  const farmId = c.req.param('farmId');
  const entryId = c.req.param('entryId');
  const { membership } = await assertFarmAccess(farmId, userId, undefined, isAdmin);

  const entry = await loadAndAuthorizeEntry(farmId, entryId, userId, isAdmin, membership, true);

  const body = await c.req.json<Record<string, unknown>>();
  const parsed = UpdateDiaryEntrySchema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError('Invalid diary entry data', { issues: parsed.error.issues });
  }

  if (parsed.data.bed_id !== undefined && parsed.data.bed_id !== null) {
    let bed;
    try {
      bed = await dynamoRepo.getBedById(parsed.data.bed_id);
    } catch (err) {
      if (err instanceof NotFoundError) {
        throw new ValidationError('Bed not found in this farm');
      }
      throw new ServiceUnavailableError('Storage service unavailable');
    }
    if (bed.farm_id !== farmId) {
      throw new ValidationError('Bed not found in this farm');
    }
  }

  let updated: DiaryEntry;
  try {
    updated = await dynamoRepo.updateDiaryEntry(farmId, entryId, entry.date, parsed.data);
  } catch (err) {
    if (err instanceof NotFoundError) throw err;
    throw new ServiceUnavailableError('Storage service unavailable');
  }

  appEvents.emit('diary.updated', {
    type: 'diary.updated',
    timestamp: new Date().toISOString(),
    actor_id: userId,
    actor_email: userEmail,
    payload: {
      farm_id: farmId,
      entry_id: entryId,
      changed_fields: Object.keys(parsed.data),
    },
  });

  // Bridge: sync bed dates from updated entry (#273)
  await syncBedDatesFromDiary(updated.category, updated.bed_id, updated.date, updated.entry_type);

  const response = await buildEntryResponse(updated);
  return c.json(response);
});

// ── DELETE /:farmId/diary/:entryId — Delete entry ────────────────

diaryRouter.delete('/:farmId/diary/:entryId', async (c) => {
  const { userId, userEmail, isAdmin } = getAuthContext(c);
  const farmId = c.req.param('farmId');
  const entryId = c.req.param('entryId');
  const { membership } = await assertFarmAccess(farmId, userId, undefined, isAdmin);

  const entry = await loadAndAuthorizeEntry(farmId, entryId, userId, isAdmin, membership, true);

  try {
    await dynamoRepo.deleteDiaryEntry(farmId, entryId, entry.date);
  } catch (err) {
    if (err instanceof NotFoundError) throw err;
    throw new ServiceUnavailableError('Storage service unavailable');
  }

  appEvents.emit('diary.deleted', {
    type: 'diary.deleted',
    timestamp: new Date().toISOString(),
    actor_id: userId,
    actor_email: userEmail,
    payload: {
      farm_id: farmId,
      entry_id: entryId,
      date: entry.date,
    },
  });

  // Bridge: clear bed date when bridged diary entry is deleted (#273)
  await syncBedDatesFromDiary(entry.category, entry.bed_id, null, entry.entry_type);

  return new Response(null, { status: 204 });
});

export default diaryRouter;

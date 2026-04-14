import { Hono } from 'hono';
import { dynamoRepo } from '../services/dynamodb';
import {
  ValidationError,
  ConflictError,
  NotFoundError,
  ServiceUnavailableError,
} from '../errors';
import { getAuthContext } from '../middleware/auth';
import {
  DEFAULT_THEME,
  DEFAULT_LOCALE,
  CreateFarmRequestSchema,
  UpdateFarmRequestSchema,
  DEMO_FARM_ID,
  FREE_PLAN_MAX_OWNED_FARMS,
} from '@litcrop/shared';
import type { Farm, FarmRole, Bed } from '@litcrop/shared';
import { isConditionalCheckFailed, isTransactionCanceled, makeLatestImage, assertFarmAccess, parseBody } from './_helpers';
import { appEvents } from '../services/events';

const router = new Hono();

// ── Helpers ──────────────────────────────────────────────────────

function farmToResponse(farm: Farm) {
  return {
    id: farm.id,
    user_id: farm.user_id,
    name: farm.name,
    description: farm.description ?? null,
    location_text: farm.location_text,
    latitude: farm.latitude ?? null,
    longitude: farm.longitude ?? null,
    elevation_m: farm.elevation_m ?? null,
    climate_zone: farm.climate_zone ?? null,
    locale: farm.locale,
    theme: farm.theme,
    grid_rows: farm.grid_rows,
    grid_cols: farm.grid_cols,
    created_at: farm.created_at,
    default_currency: farm.default_currency,
    visibility: farm.visibility ?? 'public',
  };
}

function bedToSummary(bed: Bed) {
  return {
    id: bed.id,
    row: bed.row,
    col: bed.col,
    name: bed.name,
    crop_type: bed.crop_type ?? null,
    crop_variety: bed.crop_variety ?? null,
    latest_status: bed.latest_status,
    planted_at: bed.planted_at ?? null,
    expected_harvest: bed.expected_harvest ?? null,
    completed_at: bed.completed_at ?? null,
  };
}

// ── GET /api/v1/farms — list all farms the caller belongs to ──────

router.get('/', async (c) => {
  const { userId, isAdmin } = getAuthContext(c);

  // Admin sees all farms with admin role
  if (isAdmin) {
    let allFarms;
    try {
      allFarms = await dynamoRepo.getAllFarms();
    } catch {
      throw new ServiceUnavailableError('Storage service unavailable');
    }
    return c.json({
      data: allFarms.map((farm) => ({ ...farmToResponse(farm), role: 'admin' as FarmRole })),
    });
  }

  let memberships;
  try {
    memberships = await dynamoRepo.getFarmsForUser(userId);
  } catch {
    throw new ServiceUnavailableError('Storage service unavailable');
  }

  if (memberships.length === 0) {
    return c.json({ data: [] });
  }

  // Fetch each farm in parallel
  const farms = await Promise.all(
    memberships.map(async (m) => {
      try {
        const farm = await dynamoRepo.getFarm(m.farm_id);
        return { ...farmToResponse(farm), role: m.role };
      } catch {
        // Farm record missing — skip stale membership
        return null;
      }
    }),
  );

  return c.json({ data: farms.filter((f): f is NonNullable<typeof f> => f !== null) });
});

// ── GET /api/v1/farms/discoverable ──────────────────────────────
// Must be BEFORE /:farmId — Hono matches /:farmId first otherwise.

router.get('/discoverable', async (c) => {
  const { userId } = getAuthContext(c);

  try {
    const farms = await dynamoRepo.getDiscoverableFarms();
    const memberships = await dynamoRepo.getFarmsForUser(userId);
    const memberFarmIds = new Set(memberships.map((m) => m.farm_id));

    const data = await Promise.all(
      farms
        .filter((f) => !memberFarmIds.has(f.id))
        .filter((f) => f.visibility !== 'private')
        .map(async (farm) => {
          const members = await dynamoRepo.getFarmMembers(farm.id);
          const pendingRequest = await dynamoRepo.getJoinRequest(farm.id, userId);
          return {
            id: farm.id,
            name: farm.name,
            description: farm.description ?? null,
            location_text: farm.location_text,
            latitude: farm.latitude ?? null,
            longitude: farm.longitude ?? null,
            member_count: members.length,
            has_pending_request: pendingRequest?.status === 'pending',
          };
        }),
    );

    return c.json({ data });
  } catch {
    throw new ServiceUnavailableError('Storage service unavailable');
  }
});

// ── GET /api/v1/farms/:farmId ────────────────────────────────────

router.get('/:farmId', async (c) => {
  const { farmId } = c.req.param();
  const { userId, isAdmin } = getAuthContext(c);

  const { farm } = await assertFarmAccess(farmId, userId, undefined, isAdmin);

  const beds = await dynamoRepo.getBedsForFarm(farmId);

  return c.json({
    ...farmToResponse(farm),
    beds: beds.map(bedToSummary),
  });
});

// ── GET /api/v1/farms/:farmId/beds ───────────────────────────────

router.get('/:farmId/beds', async (c) => {
  const { farmId } = c.req.param();
  const { userId, isAdmin } = getAuthContext(c);

  await assertFarmAccess(farmId, userId, undefined, isAdmin);

  const beds = await dynamoRepo.getBedsForFarm(farmId);

  const data = await Promise.all(
    beds.map(async (bed: Bed) => {
      const latestImage = await dynamoRepo.getLatestImageForBed(bed.id);
      return {
        ...bedToSummary(bed),
        latest_image: latestImage ? await makeLatestImage(latestImage) : null,
      };
    }),
  );

  return c.json({ data });
});

// ── GET /api/v1/farms/:farmId/plots — redirect to beds ───────────

router.get('/:farmId/plots', async (c) => {
  const { farmId } = c.req.param();
  return c.json(
    {
      error: {
        code: 'GONE',
        message: `This endpoint has been replaced. Use GET /api/v1/farms/${farmId}/beds instead.`,
      },
    },
    410,
  );
});

// ── POST /api/v1/farms/:farmId/plots — gone ─────────────────────

router.post('/:farmId/plots', async (c) => {
  return c.json(
    {
      error: {
        code: 'GONE',
        message: 'This endpoint has been removed. Beds are auto-created with the farm grid. Use PATCH /api/v1/beds/:bedId to assign crops.',
      },
    },
    410,
  );
});

// ── POST /api/v1/farms ───────────────────────────────────────────

router.post('/', async (c) => {
  const { userId, userEmail, isAdmin } = getAuthContext(c);

  // Free plan: check owned farm count (admin role, excluding demo)
  let ownedCount: number;
  try {
    const farms = await dynamoRepo.getFarmsForUser(userId);
    ownedCount = farms.filter(f => f.farm_id !== DEMO_FARM_ID && (f.role === 'admin' || f.role === 'owner')).length;
  } catch {
    throw new ServiceUnavailableError('Storage service unavailable');
  }

  // Role check: staff cannot create farms (they join via Farm Discovery)
  if (!isAdmin && ownedCount === 0) {
    try {
      const profile = await dynamoRepo.getUserProfile(userId);
      if (profile?.preferred_role === 'staff') {
        throw new ValidationError('Staff accounts cannot create farms. Use Farm Discovery to join an existing farm.');
      }
    } catch (err) {
      if (err instanceof ValidationError) throw err;
      // Profile lookup failure is non-fatal — allow farm creation (fail open)
    }
  }
  if (ownedCount >= FREE_PLAN_MAX_OWNED_FARMS) {
    throw new ValidationError(`Free plan allows up to ${FREE_PLAN_MAX_OWNED_FARMS} farms`);
  }

  const body = await c.req.json<Record<string, unknown>>();
  const validated = parseBody(CreateFarmRequestSchema, body);

  const farmId = crypto.randomUUID();

  let farm: Farm;
  try {
    farm = await dynamoRepo.createFarm(farmId, userId, {
      name: validated.name,
      location_text: validated.location_text,
      description: validated.description ?? undefined,
      latitude: validated.latitude ?? undefined,
      longitude: validated.longitude ?? undefined,
      elevation_m: validated.elevation_m ?? undefined,
      climate_zone: undefined,
      locale: validated.locale ?? DEFAULT_LOCALE,
      theme: validated.theme ?? DEFAULT_THEME,
      grid_rows: validated.grid_rows ?? 1,
      grid_cols: validated.grid_cols ?? 1,
      default_currency: validated.default_currency ?? 'JPY',
      visibility: validated.visibility ?? 'public',
    });
  } catch (err) {
    if (isConditionalCheckFailed(err) || isTransactionCanceled(err)) {
      throw new ConflictError('Farm ID already exists');
    }
    throw new ServiceUnavailableError('Storage service unavailable');
  }

  appEvents.emit('farm.created', {
    type: 'farm.created',
    timestamp: new Date().toISOString(),
    actor_id: userId,
    actor_email: userEmail,
    payload: { farm_id: farm.id, farm_name: farm.name },
  });

  return c.json(farmToResponse(farm), 201);
});

// ── PATCH /api/v1/farms/:farmId ─────────────────────────────────

router.patch('/:farmId', async (c) => {
  const { farmId } = c.req.param();
  const { userId, userEmail } = getAuthContext(c);

  const { farm: oldFarm } = await assertFarmAccess(farmId, userId, ['admin', 'owner']);

  const body = await c.req.json<Record<string, unknown>>();
  const validated = parseBody(UpdateFarmRequestSchema, body);

  const updates: Partial<Pick<Farm, 'name' | 'description' | 'location_text' | 'latitude' | 'longitude' | 'elevation_m' | 'locale' | 'theme' | 'grid_rows' | 'grid_cols' | 'default_currency' | 'visibility'>> = {};
  for (const [key, value] of Object.entries(validated)) {
    if (value !== undefined) {
      (updates as Record<string, unknown>)[key] = value;
    }
  }

  try {
    await dynamoRepo.updateFarm(farmId, updates);
  } catch (err) {
    if (isConditionalCheckFailed(err)) {
      throw new NotFoundError(`Farm not found: ${farmId}`);
    }
    throw new ServiceUnavailableError('Storage service unavailable');
  }

  // If grid expanded, create beds for new positions
  const newRows = updates.grid_rows ?? oldFarm.grid_rows;
  const newCols = updates.grid_cols ?? oldFarm.grid_cols;
  if (newRows > oldFarm.grid_rows || newCols > oldFarm.grid_cols) {
    const newPositions: Array<{ row: number; col: number }> = [];
    for (let row = 1; row <= newRows; row++) {
      for (let col = 1; col <= newCols; col++) {
        // Only create beds for positions that didn't exist before
        if (row > oldFarm.grid_rows || col > oldFarm.grid_cols) {
          newPositions.push({ row, col });
        }
      }
    }
    if (newPositions.length > 0) {
      await dynamoRepo.createBedsForPositions(farmId, newPositions);
    }
  }

  const farm = await dynamoRepo.getFarm(farmId);

  appEvents.emit('farm.updated', {
    type: 'farm.updated',
    timestamp: new Date().toISOString(),
    actor_id: userId,
    actor_email: userEmail,
    payload: {
      farm_id: farmId,
      farm_name: farm.name,
      changed_fields: Object.keys(updates),
    },
  });

  return c.json(farmToResponse(farm));
});

// ── DELETE /api/v1/farms/:farmId ────────────────────────────────

router.delete('/:farmId', async (c) => {
  const { farmId } = c.req.param();
  const { userId, userEmail, isAdmin } = getAuthContext(c);

  if (farmId === DEMO_FARM_ID) {
    throw new ValidationError('The demo farm cannot be deleted');
  }

  // System admin can delete any farm; farm admin/owner can delete their own
  const { farm } = await assertFarmAccess(farmId, userId, ['admin', 'owner'], isAdmin);

  try {
    await dynamoRepo.deleteFarm(farmId);
  } catch {
    throw new ServiceUnavailableError('Storage service unavailable');
  }

  appEvents.emit('farm.deleted', {
    type: 'farm.deleted',
    timestamp: new Date().toISOString(),
    actor_id: userId,
    actor_email: userEmail,
    payload: { farm_id: farmId, farm_name: farm.name },
  });

  return c.body(null, 204);
});

export default router;

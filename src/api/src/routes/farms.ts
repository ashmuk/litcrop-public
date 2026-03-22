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
  THEME_OPTIONS,
  LOCALE_OPTIONS,
  DEFAULT_THEME,
  DEFAULT_LOCALE,
  isValidLatLng,
  FarmRoleSchema,
  MIN_GRID_SIZE,
  MAX_GRID_SIZE,
} from '@litcrop/shared';
import type { Farm, Bed, FarmRole } from '@litcrop/shared';
import { makeLatestImage, assertFarmAccess } from './_helpers';

const router = new Hono();

// ── Helpers ──────────────────────────────────────────────────────

function isConditionalCheckFailed(err: unknown): boolean {
  return err instanceof Error && err.name === 'ConditionalCheckFailedException';
}

function isTransactionCanceled(err: unknown): boolean {
  return err instanceof Error && err.name === 'TransactionCanceledException';
}

/** Validate farm create/update fields. Throws ValidationError on failure. */
function validateFarmFields(body: Record<string, unknown>, required?: string[]) {
  const errors: string[] = [];

  const name = body['name'];
  if (required?.includes('name') && (name === undefined || name === null)) {
    errors.push('Missing required field: name');
  } else if (name !== undefined && name !== null) {
    if (typeof name !== 'string' || name.trim().length === 0 || name.trim().length > 100) {
      errors.push("Invalid value for 'name': must be 1-100 characters");
    }
  }

  const latitude = body['latitude'];
  if (required?.includes('latitude') && (latitude === undefined || latitude === null)) {
    errors.push('Missing required field: latitude');
  } else if (latitude !== undefined && latitude !== null) {
    if (typeof latitude !== 'number' || !isValidLatLng(latitude, 0)) {
      errors.push('Latitude must be between -90 and 90');
    }
  }

  const longitude = body['longitude'];
  if (required?.includes('longitude') && (longitude === undefined || longitude === null)) {
    errors.push('Missing required field: longitude');
  } else if (longitude !== undefined && longitude !== null) {
    if (typeof longitude !== 'number' || !isValidLatLng(0, longitude)) {
      errors.push('Longitude must be between -180 and 180');
    }
  }

  const elevation_m = body['elevation_m'];
  if (elevation_m !== undefined && elevation_m !== null) {
    if (typeof elevation_m !== 'number' || elevation_m < 0 || elevation_m > 9000) {
      errors.push("Invalid value for 'elevation_m': must be between 0 and 9000");
    }
  }

  const locale = body['locale'];
  if (locale !== undefined && locale !== null) {
    if (!(LOCALE_OPTIONS as readonly unknown[]).includes(locale)) {
      errors.push(`Invalid value for 'locale': must be one of ${LOCALE_OPTIONS.join(', ')}`);
    }
  }

  const theme = body['theme'];
  if (theme !== undefined && theme !== null) {
    if (!(THEME_OPTIONS as readonly unknown[]).includes(theme)) {
      errors.push(`Invalid value for 'theme': must be one of ${THEME_OPTIONS.join(', ')}`);
    }
  }

  const description = body['description'];
  if (description !== undefined && description !== null) {
    if (typeof description !== 'string' || description.length > 500) {
      errors.push("Invalid value for 'description': max 500 characters");
    }
  }

  const grid_rows = body['grid_rows'];
  if (grid_rows !== undefined && grid_rows !== null) {
    if (typeof grid_rows !== 'number' || !Number.isInteger(grid_rows) || grid_rows < MIN_GRID_SIZE || grid_rows > MAX_GRID_SIZE) {
      errors.push(`Invalid value for 'grid_rows': must be an integer between ${MIN_GRID_SIZE} and ${MAX_GRID_SIZE}`);
    }
  }

  const grid_cols = body['grid_cols'];
  if (grid_cols !== undefined && grid_cols !== null) {
    if (typeof grid_cols !== 'number' || !Number.isInteger(grid_cols) || grid_cols < MIN_GRID_SIZE || grid_cols > MAX_GRID_SIZE) {
      errors.push(`Invalid value for 'grid_cols': must be an integer between ${MIN_GRID_SIZE} and ${MAX_GRID_SIZE}`);
    }
  }

  if (errors.length > 0) {
    throw new ValidationError(errors[0], { errors });
  }
}

function farmToResponse(farm: Farm) {
  return {
    id: farm.id,
    user_id: farm.user_id,
    name: farm.name,
    description: farm.description ?? null,
    latitude: farm.latitude,
    longitude: farm.longitude,
    elevation_m: farm.elevation_m ?? null,
    climate_zone: farm.climate_zone ?? null,
    locale: farm.locale,
    theme: farm.theme,
    grid_rows: farm.grid_rows,
    grid_cols: farm.grid_cols,
    created_at: farm.created_at,
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
  };
}

// ── GET /api/v1/farms — list all farms the caller belongs to ──────

router.get('/', async (c) => {
  const { userId } = getAuthContext(c);

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

// ── GET /api/v1/farms/:farmId ────────────────────────────────────

router.get('/:farmId', async (c) => {
  const { farmId } = c.req.param();
  const { userId } = getAuthContext(c);

  const { farm } = await assertFarmAccess(farmId, userId);

  const beds = await dynamoRepo.getBedsForFarm(farmId);

  return c.json({
    ...farmToResponse(farm),
    beds: beds.map(bedToSummary),
  });
});

// ── GET /api/v1/farms/:farmId/beds ───────────────────────────────

router.get('/:farmId/beds', async (c) => {
  const { farmId } = c.req.param();
  const { userId } = getAuthContext(c);

  await assertFarmAccess(farmId, userId);

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
  const { userId } = getAuthContext(c);
  const body = await c.req.json<Record<string, unknown>>();

  validateFarmFields(body, ['name', 'latitude', 'longitude']);

  const farmId = crypto.randomUUID();
  const gridRows = typeof body['grid_rows'] === 'number' ? body['grid_rows'] : 1;
  const gridCols = typeof body['grid_cols'] === 'number' ? body['grid_cols'] : 1;

  let farm: Farm;
  try {
    farm = await dynamoRepo.createFarm(farmId, userId, {
      name: (body['name'] as string).trim(),
      description: body['description'] as string | undefined,
      latitude: body['latitude'] as number,
      longitude: body['longitude'] as number,
      elevation_m: body['elevation_m'] as number | undefined,
      climate_zone: undefined,
      locale: (body['locale'] as Farm['locale']) ?? DEFAULT_LOCALE,
      theme: (body['theme'] as Farm['theme']) ?? DEFAULT_THEME,
      grid_rows: gridRows as number,
      grid_cols: gridCols as number,
    });
  } catch (err) {
    if (isConditionalCheckFailed(err) || isTransactionCanceled(err)) {
      throw new ConflictError('Farm ID already exists');
    }
    throw new ServiceUnavailableError('Storage service unavailable');
  }

  return c.json(farmToResponse(farm), 201);
});

// ── PATCH /api/v1/farms/:farmId ─────────────────────────────────

router.patch('/:farmId', async (c) => {
  const { farmId } = c.req.param();
  const { userId } = getAuthContext(c);

  const { farm: oldFarm } = await assertFarmAccess(farmId, userId, ['admin', 'manager']);

  const body = await c.req.json<Record<string, unknown>>();

  validateFarmFields(body);

  const updates: Partial<Pick<Farm, 'name' | 'description' | 'locale' | 'theme' | 'grid_rows' | 'grid_cols'>> = {};
  if (body['name'] !== undefined) updates['name'] = (body['name'] as string).trim();
  if (body['description'] !== undefined) updates['description'] = body['description'] as string | undefined;
  if (body['locale'] !== undefined) updates['locale'] = body['locale'] as Farm['locale'];
  if (body['theme'] !== undefined) updates['theme'] = body['theme'] as Farm['theme'];
  if (body['grid_rows'] !== undefined) updates['grid_rows'] = body['grid_rows'] as number;
  if (body['grid_cols'] !== undefined) updates['grid_cols'] = body['grid_cols'] as number;

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
  return c.json(farmToResponse(farm));
});

// ── POST /api/v1/farms/:farmId/members ───────────────────────────

router.post('/:farmId/members', async (c) => {
  const { farmId } = c.req.param();
  const { userId } = getAuthContext(c);

  // Only admin or manager can add members
  await assertFarmAccess(farmId, userId, ['admin', 'manager']);

  const body = await c.req.json<Record<string, unknown>>();

  const newUserId = body['user_id'];
  if (typeof newUserId !== 'string' || newUserId.trim().length === 0) {
    throw new ValidationError("Missing or invalid 'user_id'");
  }

  const role = body['role'];
  const parsedRole = FarmRoleSchema.safeParse(role);
  if (!parsedRole.success) {
    throw new ValidationError(`Invalid 'role': must be one of ${FarmRoleSchema.options.join(', ')}`);
  }

  let member;
  try {
    member = await dynamoRepo.addFarmMember(
      newUserId.trim(),
      farmId,
      parsedRole.data,
    );
  } catch (err) {
    if (isTransactionCanceled(err)) {
      throw new ConflictError('User is already a member of this farm');
    }
    throw new ServiceUnavailableError('Storage service unavailable');
  }

  return c.json(member, 201);
});

export default router;

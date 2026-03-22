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
} from '@litcrop/shared';
import type { Farm, Field, Bed, Plot, FarmRole } from '@litcrop/shared';
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
    created_at: farm.created_at,
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

// ── 5.1 GET /api/v1/farms/:farmId ────────────────────────────────

router.get('/:farmId', async (c) => {
  const { farmId } = c.req.param();
  const { userId } = getAuthContext(c);

  const { farm } = await assertFarmAccess(farmId, userId);

  const fields = await dynamoRepo.getFieldsForFarm(farmId);

  const fieldsWithBeds = await Promise.all(
    fields.map(async (field: Field) => {
      const beds = await dynamoRepo.getBedsForField(field.id);

      const bedsWithPlots = await Promise.all(
        beds.map(async (bed: Bed) => {
          const plots = await dynamoRepo.getPlotsForBed(bed.id);
          return {
            id: bed.id,
            name: bed.name,
            position: bed.position,
            plots: plots.map((p: Plot) => ({
              id: p.id,
              label: p.label,
              crop_type: p.crop_type,
              crop_variety: p.crop_variety,
              latest_status: p.latest_status,
            })),
          };
        }),
      );

      return {
        id: field.id,
        name: field.name,
        position: field.position,
        beds: bedsWithPlots,
      };
    }),
  );

  return c.json({
    ...farmToResponse(farm),
    fields: fieldsWithBeds,
  });
});

// ── 5.4 GET /api/v1/farms/:farmId/plots ──────────────────────────

router.get('/:farmId/plots', async (c) => {
  const { farmId } = c.req.param();
  const { userId } = getAuthContext(c);

  const { farm } = await assertFarmAccess(farmId, userId);

  // Build bed_id → { bed_name, field_name, field_id } map in parallel with plots fetch
  const fields = await dynamoRepo.getFieldsForFarm(farm.id);
  const bedMeta = new Map<string, { bed_name: string; field_name: string; field_id: string }>();

  const [, plots] = await Promise.all([
    Promise.all(
      fields.map(async (field: Field) => {
        const beds = await dynamoRepo.getBedsForField(field.id);
        for (const bed of beds) {
          bedMeta.set(bed.id, { bed_name: bed.name, field_name: field.name, field_id: field.id });
        }
      }),
    ),
    dynamoRepo.getPlotsForFarm(farmId),
  ]);

  const data = await Promise.all(
    plots.map(async (plot: Plot) => {
      const meta = bedMeta.get(plot.bed_id) ?? { bed_name: '', field_name: '', field_id: '' };
      const latestImage = await dynamoRepo.getLatestImageForPlot(plot.id);
      return {
        id: plot.id,
        label: plot.label,
        bed_id: plot.bed_id,
        field_id: meta.field_id,
        crop_type: plot.crop_type,
        crop_variety: plot.crop_variety,
        latest_status: plot.latest_status,
        latest_image: latestImage ? await makeLatestImage(latestImage) : null,
        field_name: meta.field_name,
        bed_name: meta.bed_name,
      };
    }),
  );

  return c.json({ data });
});

// ── POST /api/v1/farms/:farmId/plots ─────────────────────────────

router.post('/:farmId/plots', async (c) => {
  const { farmId } = c.req.param();
  const { userId } = getAuthContext(c);

  await assertFarmAccess(farmId, userId, ['admin', 'manager']);

  const body = await c.req.json<Record<string, unknown>>();

  const cropType = body['crop_type'];
  if (typeof cropType !== 'string' || cropType.trim().length === 0 || cropType.trim().length > 100) {
    throw new ValidationError("Invalid value for 'crop_type': must be 1-100 characters");
  }

  const cropVariety = body['crop_variety'];
  if (typeof cropVariety !== 'string' || cropVariety.trim().length === 0 || cropVariety.trim().length > 100) {
    throw new ValidationError("Invalid value for 'crop_variety': must be 1-100 characters");
  }

  const today = new Date().toISOString().slice(0, 10);
  const plantedAt = typeof body['planted_at'] === 'string' && body['planted_at'].trim()
    ? body['planted_at'].trim()
    : today;

  const autoLabel = `${cropType.trim()} Plot`;
  const label = typeof body['label'] === 'string' && body['label'].trim()
    ? body['label'].trim()
    : autoLabel;

  // Compute expected harvest: 90 days from planted_at
  const harvestDate = new Date(plantedAt);
  harvestDate.setDate(harvestDate.getDate() + 90);
  const expectedHarvest = harvestDate.toISOString().slice(0, 10);

  // Auto-create default Field + Bed when none exist (keeps UX simple for small farms)
  let bedId: string;
  try {
    const fields = await dynamoRepo.getFieldsForFarm(farmId);
    if (fields.length === 0) {
      const field = await dynamoRepo.createField(farmId, 'Main Field', 1);
      const bed = await dynamoRepo.createBed(field.id, 'Bed 1', 1);
      bedId = bed.id;
    } else {
      const field = fields[0];
      const beds = await dynamoRepo.getBedsForField(field.id);
      if (beds.length === 0) {
        const bed = await dynamoRepo.createBed(field.id, 'Bed 1', 1);
        bedId = bed.id;
      } else {
        bedId = beds[0].id;
      }
    }
  } catch (err) {
    if (err instanceof ValidationError) throw err;
    throw new ServiceUnavailableError('Storage service unavailable');
  }

  let plot: Plot;
  try {
    plot = await dynamoRepo.createPlot(bedId, farmId, {
      label,
      crop_type: cropType.trim(),
      crop_variety: cropVariety.trim(),
      planted_at: plantedAt,
      expected_harvest: expectedHarvest,
      notes: typeof body['notes'] === 'string' ? body['notes'] : undefined,
    });
  } catch {
    throw new ServiceUnavailableError('Storage service unavailable');
  }

  return c.json(plot, 201);
});

// ── 5.2 POST /api/v1/farms ───────────────────────────────────────

router.post('/', async (c) => {
  const { userId } = getAuthContext(c);
  const body = await c.req.json<Record<string, unknown>>();

  validateFarmFields(body, ['name', 'latitude', 'longitude']);

  const farmId = crypto.randomUUID();

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
    });
  } catch (err) {
    if (isConditionalCheckFailed(err) || isTransactionCanceled(err)) {
      throw new ConflictError('Farm ID already exists');
    }
    throw new ServiceUnavailableError('Storage service unavailable');
  }

  return c.json(farmToResponse(farm), 201);
});

// ── 5.3 PATCH /api/v1/farms/:farmId ─────────────────────────────

router.patch('/:farmId', async (c) => {
  const { farmId } = c.req.param();
  const { userId } = getAuthContext(c);

  await assertFarmAccess(farmId, userId, ['admin', 'manager']);

  const body = await c.req.json<Record<string, unknown>>();

  validateFarmFields(body);

  const updates: Partial<Pick<Farm, 'name' | 'description' | 'locale' | 'theme'>> = {};
  if (body['name'] !== undefined) updates['name'] = (body['name'] as string).trim();
  if (body['description'] !== undefined) updates['description'] = body['description'] as string | undefined;
  if (body['locale'] !== undefined) updates['locale'] = body['locale'] as Farm['locale'];
  if (body['theme'] !== undefined) updates['theme'] = body['theme'] as Farm['theme'];

  try {
    await dynamoRepo.updateFarm(farmId, updates);
  } catch (err) {
    if (isConditionalCheckFailed(err)) {
      throw new NotFoundError(`Farm not found: ${farmId}`);
    }
    throw new ServiceUnavailableError('Storage service unavailable');
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

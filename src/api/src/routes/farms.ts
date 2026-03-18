import { Hono } from 'hono';
import { dynamoRepo } from '../services/dynamodb';
import {
  ValidationError,
  ConflictError,
  NotFoundError,
  ServiceUnavailableError,
} from '../errors';
import {
  THEME_OPTIONS,
  LOCALE_OPTIONS,
  DEFAULT_THEME,
  DEFAULT_LOCALE,
  isValidLatLng,
} from '@litcrop/shared';
import type { Farm, Field, Bed, Plot } from '@litcrop/shared';
import { makeLatestImage } from './_helpers';

const router = new Hono();

// ── Helpers ──────────────────────────────────────────────────────

function isConditionalCheckFailed(err: unknown): boolean {
  return err instanceof Error && err.name === 'ConditionalCheckFailedException';
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

// ── 5.1 GET /api/v1/farms/:farmId ────────────────────────────────

router.get('/:farmId', async (c) => {
  const { farmId } = c.req.param();

  let farm: Farm;
  try {
    farm = await dynamoRepo.getFarm(farmId);
  } catch (err) {
    if (err instanceof NotFoundError) throw err;
    throw new ServiceUnavailableError('Storage service unavailable');
  }

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

  let farm: Farm;
  try {
    farm = await dynamoRepo.getFarm(farmId);
  } catch (err) {
    if (err instanceof NotFoundError) throw err;
    throw new ServiceUnavailableError('Storage service unavailable');
  }

  // Build bed_id → { bed_name, field_name } map
  const fields = await dynamoRepo.getFieldsForFarm(farm.id);
  const bedMeta = new Map<string, { bed_name: string; field_name: string }>();
  await Promise.all(
    fields.map(async (field: Field) => {
      const beds = await dynamoRepo.getBedsForField(field.id);
      for (const bed of beds) {
        bedMeta.set(bed.id, { bed_name: bed.name, field_name: field.name });
      }
    }),
  );

  const plots = await dynamoRepo.getPlotsForFarm(farmId);

  const data = await Promise.all(
    plots.map(async (plot: Plot) => {
      const meta = bedMeta.get(plot.bed_id) ?? { bed_name: '', field_name: '' };
      const latestImage = await dynamoRepo.getLatestImageForPlot(plot.id);
      return {
        id: plot.id,
        label: plot.label,
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

// ── 5.2 POST /api/v1/farms ───────────────────────────────────────

router.post('/', async (c) => {
  const body = await c.req.json<Record<string, unknown>>();

  validateFarmFields(body, ['name', 'latitude', 'longitude']);

  const farmId = crypto.randomUUID();

  let farm: Farm;
  try {
    farm = await dynamoRepo.createFarm(farmId, {
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
    if (isConditionalCheckFailed(err)) {
      throw new ConflictError('Farm already exists');
    }
    throw new ServiceUnavailableError('Storage service unavailable');
  }

  return c.json(farmToResponse(farm), 201);
});

// ── 5.3 PATCH /api/v1/farms/:farmId ─────────────────────────────

router.patch('/:farmId', async (c) => {
  const { farmId } = c.req.param();
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

export default router;

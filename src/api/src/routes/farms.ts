import { Hono } from 'hono';
import { dynamoRepo } from '../services/dynamodb';
import { getSignedAvatarUrls } from '../services/s3';
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
  DEMO_FARM_ID,
  FREE_PLAN_MAX_MEMBERSHIPS,
  FREE_PLAN_MAX_OWNED_FARMS,
} from '@litcrop/shared';
import type { Farm, Bed, FarmRole } from '@litcrop/shared';
import { makeLatestImage, assertFarmAccess } from './_helpers';
import { appEvents } from '../services/events';

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

  const location_text = body['location_text'];
  if (required?.includes('location_text') && (location_text === undefined || location_text === null)) {
    errors.push('Missing required field: location_text');
  } else if (location_text !== undefined && location_text !== null) {
    if (typeof location_text !== 'string' || location_text.trim().length === 0 || location_text.trim().length > 200) {
      errors.push("Invalid value for 'location_text': must be 1-200 characters");
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

  const default_currency = body['default_currency'];
  if (default_currency !== undefined && default_currency !== null) {
    if (default_currency !== 'JPY' && default_currency !== 'USD') {
      errors.push("Invalid value for 'default_currency': must be 'JPY' or 'USD'");
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

// ── GET /api/v1/farms/discoverable ────────────────────────────────
// Must be registered BEFORE /:farmId to avoid Hono treating "discoverable" as a param

router.get('/discoverable', async (c) => {
  const { userId } = getAuthContext(c);

  try {
    const farms = await dynamoRepo.getDiscoverableFarms();
    const memberships = await dynamoRepo.getFarmsForUser(userId);
    const memberFarmIds = new Set(memberships.map((m) => m.farm_id));

    const data = await Promise.all(
      farms
        .filter((f) => !memberFarmIds.has(f.id))
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

// ── POST /api/v1/farms/:farmId/join ──────────────────────────────

router.post('/:farmId/join', async (c) => {
  const { farmId } = c.req.param();
  const { userId, userEmail } = getAuthContext(c);

  // Verify farm exists
  const farm = await dynamoRepo.getFarm(farmId).catch((err: unknown) => {
    if (err instanceof NotFoundError) throw err;
    throw new ServiceUnavailableError('Storage service unavailable');
  });

  // Check if already a member
  const existing = await dynamoRepo.getFarmMembership(userId, farmId).catch(() => null);
  if (existing) {
    throw new ConflictError('Already a member of this farm');
  }

  // Check membership limit
  const membershipCount = await dynamoRepo.countUserMemberships(userId);
  if (membershipCount >= FREE_PLAN_MAX_MEMBERSHIPS) {
    throw new ValidationError(`Membership limit reached (max ${FREE_PLAN_MAX_MEMBERSHIPS})`);
  }

  // Check for existing pending/approved request (rejected requests allow re-apply)
  const existingRequest = await dynamoRepo.getJoinRequest(farmId, userId);
  if (existingRequest && existingRequest.status !== 'rejected') {
    throw new ConflictError('Join request already pending or approved');
  }

  // Get display name for denormalization
  const profile = await dynamoRepo.getUserProfile(userId).catch(() => null);
  const displayName = profile?.display_name ?? '';

  await dynamoRepo.createJoinRequest(farmId, userId, displayName);

  appEvents.emit('join_request.submitted', {
    type: 'join_request.submitted',
    timestamp: new Date().toISOString(),
    actor_id: userId,
    actor_email: userEmail,
    payload: { farm_id: farmId, farm_name: farm.name, requester_name: displayName },
  });

  return c.json({
    farm_id: farmId,
    user_id: userId,
    status: 'pending',
    requested_at: new Date().toISOString(),
  }, 201);
});

// ── GET /api/v1/farms/:farmId/join-requests ──────────────────────

router.get('/:farmId/join-requests', async (c) => {
  const { farmId } = c.req.param();
  const { userId } = getAuthContext(c);
  const status = c.req.query('status') ?? 'pending';

  await assertFarmAccess(farmId, userId, ['admin', 'owner']);

  const requests = await dynamoRepo.getJoinRequestsForFarm(farmId, status);
  return c.json({ data: requests });
});

// ── PATCH /api/v1/farms/:farmId/join-requests/:userId ────────────

router.patch('/:farmId/join-requests/:targetUserId', async (c) => {
  const { farmId, targetUserId } = c.req.param();
  const { userId, userEmail } = getAuthContext(c);

  const { farm } = await assertFarmAccess(farmId, userId, ['admin', 'owner']);

  const body = await c.req.json();
  const action = body['action'];
  if (action !== 'approve' && action !== 'reject') {
    throw new ValidationError('action must be "approve" or "reject"');
  }

  // Fetch the target user's display name for the notification
  const targetProfile = await dynamoRepo.getUserProfile(targetUserId).catch(() => null);
  const targetDisplayName = targetProfile?.display_name ?? '';

  try {
    if (action === 'approve') {
      // Check target user's membership limit before approving
      const membershipCount = await dynamoRepo.countUserMemberships(targetUserId);
      if (membershipCount >= FREE_PLAN_MAX_MEMBERSHIPS) {
        throw new ValidationError(`User has reached membership limit (max ${FREE_PLAN_MAX_MEMBERSHIPS})`);
      }
      await dynamoRepo.approveJoinRequest(farmId, targetUserId, userId);
      appEvents.emit('join_request.approved', {
        type: 'join_request.approved',
        timestamp: new Date().toISOString(),
        actor_id: userId,
        actor_email: userEmail,
        payload: { farm_id: farmId, farm_name: farm.name, target_user_id: targetUserId, target_user_name: targetDisplayName },
      });
    } else {
      await dynamoRepo.rejectJoinRequest(farmId, targetUserId, userId);
      appEvents.emit('join_request.rejected', {
        type: 'join_request.rejected',
        timestamp: new Date().toISOString(),
        actor_id: userId,
        actor_email: userEmail,
        payload: { farm_id: farmId, farm_name: farm.name, target_user_id: targetUserId, target_user_name: targetDisplayName },
      });
    }
  } catch (err) {
    if (err instanceof Error && err.name === 'TransactionCanceledException') {
      throw new ConflictError('Request is not pending or membership already exists');
    }
    throw err;
  }

  return c.json({ farm_id: farmId, user_id: targetUserId, action, resolved_at: new Date().toISOString() });
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

// ── GET /api/v1/farms/:farmId/members ─────────────────────────────────────────

router.get('/:farmId/members', async (c) => {
  const { farmId } = c.req.param();
  const { userId, isAdmin } = getAuthContext(c);

  await assertFarmAccess(farmId, userId, undefined, isAdmin);

  let members;
  try {
    members = await dynamoRepo.getFarmMembers(farmId);
  } catch {
    throw new ServiceUnavailableError('Storage service unavailable');
  }

  const enrichedMembers = await Promise.all(
    members.map(async (m) => {
      let displayName = '';
      let profilePictureThumbUrl: string | null = null;
      try {
        const profile = await dynamoRepo.getUserProfile(m.user_id);
        displayName = profile?.display_name ?? '';
        if (profile?.profile_picture_thumb_key) {
          try {
            const { thumbUrl } = await getSignedAvatarUrls(undefined, profile.profile_picture_thumb_key);
            profilePictureThumbUrl = thumbUrl;
          } catch { /* signing failed — show member without avatar */ }
        }
      } catch { /* profile fetch failed — show member without name */ }
      return { ...m, display_name: displayName, profile_picture_thumb_url: profilePictureThumbUrl };
    }),
  );

  return c.json({ data: enrichedMembers });
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
  const { userId, userEmail } = getAuthContext(c);

  // Free plan: check owned farm count (admin role, excluding demo)
  let ownedCount: number;
  try {
    const farms = await dynamoRepo.getFarmsForUser(userId);
    ownedCount = farms.filter(f => f.farm_id !== DEMO_FARM_ID && (f.role === 'admin' || f.role === 'owner')).length;
  } catch {
    throw new ServiceUnavailableError('Storage service unavailable');
  }
  if (ownedCount >= FREE_PLAN_MAX_OWNED_FARMS) {
    throw new ValidationError(`Free plan allows up to ${FREE_PLAN_MAX_OWNED_FARMS} farms`);
  }

  const body = await c.req.json<Record<string, unknown>>();

  validateFarmFields(body, ['name', 'location_text']);

  const farmId = crypto.randomUUID();
  const gridRows = typeof body['grid_rows'] === 'number' ? body['grid_rows'] : 1;
  const gridCols = typeof body['grid_cols'] === 'number' ? body['grid_cols'] : 1;

  let farm: Farm;
  try {
    farm = await dynamoRepo.createFarm(farmId, userId, {
      name: (body['name'] as string).trim(),
      location_text: (body['location_text'] as string).trim(),
      description: body['description'] as string | undefined,
      latitude: body['latitude'] as number | undefined,
      longitude: body['longitude'] as number | undefined,
      elevation_m: body['elevation_m'] as number | undefined,
      climate_zone: undefined,
      locale: (body['locale'] as Farm['locale']) ?? DEFAULT_LOCALE,
      theme: (body['theme'] as Farm['theme']) ?? DEFAULT_THEME,
      grid_rows: gridRows as number,
      grid_cols: gridCols as number,
      default_currency: (body['default_currency'] as Farm['default_currency']) ?? 'JPY',
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

  validateFarmFields(body);

  const updates: Partial<Pick<Farm, 'name' | 'description' | 'location_text' | 'latitude' | 'longitude' | 'elevation_m' | 'locale' | 'theme' | 'grid_rows' | 'grid_cols' | 'default_currency'>> = {};
  if (body['name'] !== undefined) updates['name'] = (body['name'] as string).trim();
  if (body['description'] !== undefined) updates['description'] = body['description'] as string | undefined;
  if (body['location_text'] !== undefined) updates['location_text'] = (body['location_text'] as string).trim();
  if (body['latitude'] !== undefined) updates['latitude'] = body['latitude'] as number;
  if (body['longitude'] !== undefined) updates['longitude'] = body['longitude'] as number;
  if (body['elevation_m'] !== undefined) updates['elevation_m'] = body['elevation_m'] as number;
  if (body['locale'] !== undefined) updates['locale'] = body['locale'] as Farm['locale'];
  if (body['theme'] !== undefined) updates['theme'] = body['theme'] as Farm['theme'];
  if (body['grid_rows'] !== undefined) updates['grid_rows'] = body['grid_rows'] as number;
  if (body['grid_cols'] !== undefined) updates['grid_cols'] = body['grid_cols'] as number;
  if (body['default_currency'] !== undefined) updates['default_currency'] = body['default_currency'] as Farm['default_currency'];

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

// ── POST /api/v1/farms/:farmId/members ───────────────────────────

router.post('/:farmId/members', async (c) => {
  const { farmId } = c.req.param();
  const { userId, userEmail } = getAuthContext(c);

  // Only admin or owner can add members
  await assertFarmAccess(farmId, userId, ['admin', 'owner']);

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
  if (parsedRole.data === 'admin') {
    throw new ValidationError("Cannot assign 'admin' role — admin is system-assigned only");
  }

  // Free plan: check target user's membership count (excluding demo farm)
  if (farmId !== DEMO_FARM_ID) {
    let membershipCount: number;
    try {
      membershipCount = await dynamoRepo.countUserMemberships(newUserId.trim(), DEMO_FARM_ID);
    } catch {
      throw new ServiceUnavailableError('Storage service unavailable');
    }
    if (membershipCount >= FREE_PLAN_MAX_MEMBERSHIPS) {
      throw new ValidationError('User has reached the maximum number of farm memberships (free plan limit)');
    }
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

  // Need farm name for the event; fetch it (best-effort)
  const farmForEvent = await dynamoRepo.getFarm(farmId).catch(() => null);
  appEvents.emit('member.joined', {
    type: 'member.joined',
    timestamp: new Date().toISOString(),
    actor_id: userId,
    actor_email: userEmail,
    payload: {
      farm_id: farmId,
      farm_name: farmForEvent?.name ?? '',
      role: parsedRole.data,
    },
  });

  return c.json(member, 201);
});

// ── PATCH /api/v1/farms/:farmId/members/:userId ─────────────────
// Change a member's role (admin/owner only, staff↔owner)

router.patch('/:farmId/members/:targetUserId', async (c) => {
  const { farmId, targetUserId } = c.req.param();
  const { userId, userEmail } = getAuthContext(c);

  const { farm } = await assertFarmAccess(farmId, userId, ['admin', 'owner']);

  const body = await c.req.json<Record<string, unknown>>();
  const newRole = body['role'];
  if (newRole !== 'owner' && newRole !== 'staff') {
    throw new ValidationError("Role must be 'owner' or 'staff'");
  }

  // Cannot change your own role
  if (targetUserId === userId) {
    throw new ValidationError('Cannot change your own role');
  }

  const targetMembership = await dynamoRepo.getFarmMembership(targetUserId, farmId);
  if (!targetMembership) {
    throw new NotFoundError('Member not found');
  }
  if (targetMembership.role === 'admin') {
    throw new ValidationError('Cannot change admin role');
  }
  if (targetMembership.role === newRole) {
    throw new ValidationError(`Member is already ${newRole}`);
  }

  // When demoting, ensure at least one other owner remains
  if (newRole === 'staff') {
    const members = await dynamoRepo.getFarmMembers(farmId);
    const otherOwners = members.filter(m => (m.role === 'owner' || m.role === 'admin') && m.user_id !== targetUserId);
    if (otherOwners.length === 0) {
      throw new ValidationError('Cannot demote: farm must have at least one owner');
    }
  }

  const oldRole = targetMembership.role;
  await dynamoRepo.updateMemberRole(farmId, targetUserId, newRole);

  const targetProfile = await dynamoRepo.getUserProfile(targetUserId).catch(() => null);
  appEvents.emit('member.role_changed', {
    type: 'member.role_changed',
    timestamp: new Date().toISOString(),
    actor_id: userId,
    actor_email: userEmail,
    payload: {
      farm_id: farmId,
      farm_name: farm.name,
      target_user_id: targetUserId,
      target_user_name: targetProfile?.display_name ?? '',
      old_role: oldRole,
      new_role: newRole,
    },
  });

  return c.json({ user_id: targetUserId, farm_id: farmId, role: newRole });
});

// ── DELETE /api/v1/farms/:farmId/members/me ─────────────────────

router.delete('/:farmId/members/me', async (c) => {
  const { farmId } = c.req.param();
  const { userId, userEmail } = getAuthContext(c);

  // Cannot leave demo farm
  if (farmId === DEMO_FARM_ID) {
    throw new ValidationError('Cannot leave the demo farm');
  }

  // Check membership exists
  const membership = await dynamoRepo.getFarmMembership(userId, farmId);
  if (!membership) {
    throw new NotFoundError('Not a member of this farm');
  }

  // If owner, check there are other owners
  if (membership.role === 'owner') {
    const members = await dynamoRepo.getFarmMembers(farmId);
    const otherOwners = members.filter(m => m.role === 'owner' && m.user_id !== userId);
    if (otherOwners.length === 0) {
      throw new ValidationError('Cannot leave: you are the only owner. Delete the farm or transfer ownership first.');
    }
  }

  // Remove membership (both USER# forward and FARM# reverse records)
  await dynamoRepo.removeFarmMember(userId, farmId);

  // Fetch farm name for event (best-effort — farm may already be deleted)
  const farmForLeaveEvent = await dynamoRepo.getFarm(farmId).catch(() => null);
  const leavingProfile = await dynamoRepo.getUserProfile(userId).catch(() => null);
  appEvents.emit('member.removed', {
    type: 'member.removed',
    timestamp: new Date().toISOString(),
    actor_id: userId,
    actor_email: userEmail,
    payload: {
      farm_id: farmId,
      farm_name: farmForLeaveEvent?.name ?? '',
      removed_user_id: userId,
      removed_user_name: leavingProfile?.display_name ?? '',
    },
  });

  return c.body(null, 204);
});

export default router;

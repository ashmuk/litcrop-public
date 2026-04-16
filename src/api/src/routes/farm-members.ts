import { Hono } from 'hono';
import { dynamoRepo } from '../services/dynamodb';
import { getSignedAvatarUrls } from '../services/s3';
import {
  ValidationError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ServiceUnavailableError,
} from '../errors';
import { getAuthContext } from '../middleware/auth';
import {
  FarmRoleSchema,
  DEMO_FARM_ID,
  FREE_PLAN_MAX_MEMBERSHIPS,
} from '@litcrop/shared';
import { assertFarmAccess, isTransactionCanceled } from './_helpers';
import { appEvents } from '../services/events';

const router = new Hono();

// NOTE: GET /discoverable moved to farms.ts (must precede /:farmId for Hono routing)

// ── POST /api/v1/farms/:farmId/join ──────────────────────────────

router.post('/:farmId/join', async (c) => {
  const { farmId } = c.req.param();
  const { userId, userEmail } = getAuthContext(c);

  const farm = await dynamoRepo.getFarm(farmId).catch((err: unknown) => {
    if (err instanceof NotFoundError) throw err;
    throw new ServiceUnavailableError('Storage service unavailable');
  });

  if (farm.visibility === 'private') {
    throw new ForbiddenError('This farm is not accepting join requests.');
  }

  const existing = await dynamoRepo.getFarmMembership(userId, farmId).catch(() => null);
  if (existing) {
    throw new ConflictError('Already a member of this farm');
  }

  const membershipCount = await dynamoRepo.countUserMemberships(userId);
  if (membershipCount >= FREE_PLAN_MAX_MEMBERSHIPS) {
    throw new ValidationError(`Membership limit reached (max ${FREE_PLAN_MAX_MEMBERSHIPS})`);
  }

  const existingRequest = await dynamoRepo.getJoinRequest(farmId, userId);
  if (existingRequest && existingRequest.status !== 'rejected') {
    throw new ConflictError('Join request already pending or approved');
  }

  const profile = await dynamoRepo.getUserProfile(userId).catch(() => null);
  const displayName = profile?.display_name ?? '';

  await dynamoRepo.createJoinRequest(farmId, userId, displayName, userEmail);

  const members = await dynamoRepo.getFarmMembers(farmId);
  const owners = members.filter(m => m.role === 'owner');
  const ownerProfiles = await Promise.all(
    owners.map(o => dynamoRepo.getUserProfile(o.user_id).catch(() => null)),
  );
  owners.forEach((owner, i) => {
    appEvents.emit('join_request.submitted', {
      type: 'join_request.submitted',
      timestamp: new Date().toISOString(),
      actor_id: userId,
      actor_email: userEmail,
      payload: {
        farm_id: farmId,
        farm_name: farm.name,
        requester_name: displayName,
        target_user_id: owner.user_id,
        target_user_email: ownerProfiles[i]?.email,
      },
    });
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

  const targetProfile = await dynamoRepo.getUserProfile(targetUserId).catch(() => null);
  const targetDisplayName = targetProfile?.display_name ?? '';
  // Retrieve requester email: prefer join request record (stored at creation), fall back to profile
  const joinReq = await dynamoRepo.getJoinRequest(farmId, targetUserId).catch(() => null);
  const targetEmail = joinReq?.email ?? targetProfile?.email ?? undefined;

  try {
    if (action === 'approve') {
      const membershipCount = await dynamoRepo.countUserMemberships(targetUserId);
      if (membershipCount >= FREE_PLAN_MAX_MEMBERSHIPS) {
        throw new ValidationError(`User has reached membership limit (max ${FREE_PLAN_MAX_MEMBERSHIPS})`);
      }
      await dynamoRepo.approveJoinRequest(farmId, targetUserId, userId);
    } else {
      await dynamoRepo.rejectJoinRequest(farmId, targetUserId, userId);
    }
  } catch (err) {
    if (isTransactionCanceled(err)) {
      throw new ConflictError('Request is not pending or membership already exists');
    }
    throw err;
  }

  const eventType = action === 'approve' ? 'join_request.approved' : 'join_request.rejected' as const;
  appEvents.emit(eventType, {
    type: eventType,
    timestamp: new Date().toISOString(),
    actor_id: userId,
    actor_email: userEmail,
    payload: { farm_id: farmId, farm_name: farm.name, target_user_id: targetUserId, target_user_name: targetDisplayName, target_user_email: targetEmail },
  });

  return c.json({ farm_id: farmId, user_id: targetUserId, action, resolved_at: new Date().toISOString() });
});

// ── GET /api/v1/farms/:farmId/members ────────────────────────────

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
          } catch { /* signing failed */ }
        }
      } catch { /* profile fetch failed */ }
      return { ...m, display_name: displayName, profile_picture_thumb_url: profilePictureThumbUrl };
    }),
  );

  return c.json({ data: enrichedMembers });
});

// ── POST /api/v1/farms/:farmId/members ───────────────────────────

router.post('/:farmId/members', async (c) => {
  const { farmId } = c.req.param();
  const { userId, userEmail } = getAuthContext(c);

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
    member = await dynamoRepo.addFarmMember(newUserId.trim(), farmId, parsedRole.data);
  } catch (err) {
    if (isTransactionCanceled(err)) {
      throw new ConflictError('User is already a member of this farm');
    }
    throw new ServiceUnavailableError('Storage service unavailable');
  }

  const farmForEvent = await dynamoRepo.getFarm(farmId).catch(() => null);
  appEvents.emit('member.joined', {
    type: 'member.joined',
    timestamp: new Date().toISOString(),
    actor_id: userId,
    actor_email: userEmail,
    payload: { farm_id: farmId, farm_name: farmForEvent?.name ?? '', role: parsedRole.data },
  });

  return c.json(member, 201);
});

// ── PATCH /api/v1/farms/:farmId/members/:userId ─────────────────

router.patch('/:farmId/members/:targetUserId', async (c) => {
  const { farmId, targetUserId } = c.req.param();
  const { userId, userEmail } = getAuthContext(c);

  const { farm } = await assertFarmAccess(farmId, userId, ['admin', 'owner']);

  const body = await c.req.json<Record<string, unknown>>();
  const newRole = body['role'];
  if (newRole !== 'owner' && newRole !== 'staff') {
    throw new ValidationError("Role must be 'owner' or 'staff'");
  }

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
      target_user_email: targetProfile?.email ?? undefined,
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

  if (farmId === DEMO_FARM_ID) {
    throw new ValidationError('Cannot leave the demo farm');
  }

  const membership = await dynamoRepo.getFarmMembership(userId, farmId);
  if (!membership) {
    throw new NotFoundError('Not a member of this farm');
  }

  if (membership.role === 'owner') {
    const members = await dynamoRepo.getFarmMembers(farmId);
    const otherOwners = members.filter(m => m.role === 'owner' && m.user_id !== userId);
    if (otherOwners.length === 0) {
      throw new ValidationError('Cannot leave: you are the only owner. Delete the farm or transfer ownership first.');
    }
  }

  await dynamoRepo.removeFarmMember(userId, farmId);

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

/**
 * Admin Routes — /api/v1/admin/*
 *
 * Returns entity counts, user list, farm list, and global budget for operators.
 * Access is restricted to users whose email appears in ADMIN_EMAILS env var,
 * using the same isAdmin flag from getAuthContext() (unified mechanism).
 * Returns 403 for all other authenticated users.
 */

import type { Context } from 'hono';
import { Hono } from 'hono';
import { getAuthContext } from '../middleware/auth';
import { dynamoRepo } from '../services/dynamodb';
import { getUsage } from '../services/budget';
import { ServiceUnavailableError, ValidationError, NotFoundError } from '../errors';
import { queryActivities } from '../services/activity';
import { appEvents } from '../services/events';
import { isNotificationEnabled, sendTestEmail } from '../services/notification';
import { CognitoIdentityProviderClient, AdminDeleteUserCommand } from '@aws-sdk/client-cognito-identity-provider';

const router = new Hono();

// Cognito client for admin user deletion (#293)
const COGNITO_USER_POOL_ID = process.env['COGNITO_USER_POOL_ID'] ?? '';
const cognitoClient = COGNITO_USER_POOL_ID
  ? new CognitoIdentityProviderClient({ region: process.env['AWS_REGION'] ?? 'ap-northeast-1' })
  : null;

/**
 * Extracts auth context and verifies admin access via isAdmin (ADMIN_EMAILS).
 * Returns { userId } on success, or a 403 Response if not authorized.
 */
function requireAdmin(c: Context): { userId: string; userEmail: string } | Response {
  const { userId, userEmail, isAdmin } = getAuthContext(c);
  if (!isAdmin) {
    return c.json({ error: { code: 'FORBIDDEN', message: 'Not authorized' } }, 403);
  }
  return { userId, userEmail };
}

// ── GET /api/v1/admin/stats ───────────────────────────────────────

router.get('/stats', async (c) => {
  const result = requireAdmin(c);
  if (result instanceof Response) return result;
  const { userId } = result;

  try {
    const [counts, usage] = await Promise.all([
      dynamoRepo.getStats(),
      getUsage(userId),
    ]);

    return c.json({
      entity_counts: counts,
      global_budget: usage.global_budget,
      period_start: usage.period_start,
      reset_at: usage.reset_at,
      notifications_enabled: isNotificationEnabled,
    });
  } catch (err) {
    console.error('[admin] failed to fetch stats', err);
    throw new ServiceUnavailableError('Unable to retrieve admin stats');
  }
});

// ── GET /api/v1/admin/users ───────────────────────────────────────

router.get('/users', async (c) => {
  const result = requireAdmin(c);
  if (result instanceof Response) return result;
  try {
    const profiles = await dynamoRepo.getAllUserProfiles();
    return c.json({ users: profiles, total: profiles.length });
  } catch (err) {
    console.error('[admin] failed to fetch users', err);
    throw new ServiceUnavailableError('Unable to retrieve user list');
  }
});

// ── GET /api/v1/admin/farms ───────────────────────────────────────

router.get('/farms', async (c) => {
  const result = requireAdmin(c);
  if (result instanceof Response) return result;
  try {
    const farms = await dynamoRepo.getAllFarms();
    const farmsWithCounts = await Promise.all(
      farms.map(async (farm) => {
        const members = await dynamoRepo.getFarmMembers(farm.id);
        return {
          id: farm.id,
          name: farm.name,
          latitude: farm.latitude,
          longitude: farm.longitude,
          grid_rows: farm.grid_rows,
          grid_cols: farm.grid_cols,
          member_count: members.length,
          created_at: farm.created_at,
        };
      }),
    );
    return c.json({ farms: farmsWithCounts, total: farmsWithCounts.length });
  } catch (err) {
    console.error('[admin] failed to fetch farms', err);
    throw new ServiceUnavailableError('Unable to retrieve farm list');
  }
});

// ── POST /api/v1/admin/notifications/test ────────────────────────
// Send a diagnostic test email to all admins. Returns detailed result.

let lastTestEmailAt = 0;

router.post('/notifications/test', async (c) => {
  const result = requireAdmin(c);
  if (result instanceof Response) return result;

  const now = Date.now();
  if (now - lastTestEmailAt < 60_000) {
    throw new ValidationError('Test email already sent recently. Wait 60 seconds.');
  }
  lastTestEmailAt = now;

  const testResult = await sendTestEmail();
  // Return 200 even on failure — the response body has { success, error } for diagnostics.
  // 500 should be reserved for unexpected crashes, not "SES not configured".
  return c.json(testResult);
});

// ── GET /api/v1/admin/activity ────────────────────────────────────

router.get('/activity', async (c) => {
  const result = requireAdmin(c);
  if (result instanceof Response) return result;

  const from = c.req.query('from');
  const to = c.req.query('to');
  const eventTypeRaw = c.req.query('event_type');
  const userId = c.req.query('user_id');
  const farmId = c.req.query('farm_id');
  const q = c.req.query('q');
  if (q && q.length > 500) {
    throw new ValidationError('q must be 500 characters or fewer');
  }
  const cursor = c.req.query('cursor');
  const limitRaw = c.req.query('limit');

  let limit = 50;
  if (limitRaw !== undefined) {
    const parsed = parseInt(limitRaw, 10);
    if (isNaN(parsed) || parsed < 1 || parsed > 100) {
      throw new ValidationError('limit must be an integer between 1 and 100');
    }
    limit = parsed;
  }

  const event_type = eventTypeRaw
    ? eventTypeRaw.split(',').map((s) => s.trim()).filter(Boolean)
    : undefined;

  try {
    const data = await queryActivities({
      from,
      to,
      event_type,
      actor_id: userId,
      farm_id: farmId,
      q,
      cursor,
      limit,
    });
    return c.json(data);
  } catch (err) {
    console.error('[admin] failed to fetch activity log', err);
    throw new ServiceUnavailableError('Unable to retrieve activity log');
  }
});

// ── DELETE /api/v1/admin/users/:userId ────────────────────────────
// Admin-initiated account deletion (#282). Reuses deleteAccount() cascade.

router.delete('/users/:userId', async (c) => {
  const result = requireAdmin(c);
  if (result instanceof Response) return result;
  const { userId: adminId, userEmail } = result;

  const targetUserId = c.req.param('userId');

  // Cannot delete self via admin endpoint — use DELETE /me instead
  if (targetUserId === adminId) {
    throw new ValidationError('Cannot delete your own account via admin endpoint. Use DELETE /me instead.');
  }

  // Verify target user exists (NotFoundError propagates naturally; other errors → 503)
  let profile;
  try {
    profile = await dynamoRepo.getUserProfile(targetUserId);
  } catch (err) {
    if (err instanceof NotFoundError) throw err;
    throw new ServiceUnavailableError('Storage service unavailable');
  }
  if (!profile) {
    throw new NotFoundError(`User not found: ${targetUserId}`);
  }

  try {
    const summary = await dynamoRepo.deleteAccount(targetUserId);

    appEvents.emit('account.deleted', {
      type: 'account.deleted',
      timestamp: new Date().toISOString(),
      actor_id: adminId,
      actor_email: userEmail,
      payload: {
        user_id: targetUserId,
        display_name: profile.display_name ?? '',
        email: '',
        admin_initiated: true,
      },
    });

    // Clean up Cognito user (#293) — non-blocking, best-effort
    let cognitoDeleted = false;
    if (cognitoClient && COGNITO_USER_POOL_ID) {
      try {
        await cognitoClient.send(new AdminDeleteUserCommand({
          UserPoolId: COGNITO_USER_POOL_ID,
          Username: targetUserId,
        }));
        cognitoDeleted = true;
      } catch (cognitoErr) {
        console.warn('[admin] Cognito user deletion failed (DynamoDB data already removed):', cognitoErr);
      }
    }

    return c.json({ deleted: true, summary, cognito_deleted: cognitoDeleted });
  } catch (err) {
    console.error('[admin] deleteAccount failed', err);
    throw new ServiceUnavailableError('Account deletion failed');
  }
});

export default router;

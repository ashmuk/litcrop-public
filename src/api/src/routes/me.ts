import { Hono } from 'hono';
import { dynamoRepo, type UserSettings, DEFAULT_SETTINGS } from '../services/dynamodb';
import { ValidationError } from '../errors';
import { getAuthContext } from '../middleware/auth';
import { UpdateProfileRequestSchema, UpdateSettingsRequestSchema } from '@litcrop/shared';
import type { DeleteAccountSummary } from '../services/dynamodb';
import { appEvents } from '../services/events';
import { DEFAULT_NOTIFICATION_PREFS } from '../services/notification';

const router = new Hono();

// GET /api/v1/me/profile
router.get('/profile', async (c) => {
  const { userId, isAdmin } = getAuthContext(c);
  const profile = await dynamoRepo.getUserProfile(userId);
  const base = profile
    ? { ...profile, is_admin: isAdmin }
    : { user_id: userId, display_name: '', preferred_role: 'observer' as const, created_at: null, is_admin: isAdmin };
  return c.json(base);
});

// PATCH /api/v1/me/profile
router.patch('/profile', async (c) => {
  const { userId } = getAuthContext(c);
  const body = await c.req.json();
  const parsed = UpdateProfileRequestSchema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError('Invalid profile data', { issues: parsed.error.issues });
  }

  // Check if this is the first-time profile creation (user.signup event)
  const existingProfile = await dynamoRepo.getUserProfile(userId).catch(() => null);
  const isFirstCreation = existingProfile === null;

  const profile = await dynamoRepo.upsertUserProfile(userId, parsed.data);

  if (isFirstCreation) {
    // Derive email from the auth context — decoded from JWT in middleware
    const authHeader = c.req.header('Authorization') ?? '';
    let actorEmail = '';
    try {
      const token = authHeader.replace(/^Bearer\s+/i, '');
      const payloadB64 = token.split('.')[1] ?? '';
      const payloadJson = atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/'));
      actorEmail = (JSON.parse(payloadJson) as Record<string, unknown>)['email'] as string ?? '';
    } catch {
      // ignore — email is best-effort
    }
    appEvents.emit('user.signup', {
      type: 'user.signup',
      timestamp: new Date().toISOString(),
      actor_id: userId,
      actor_email: actorEmail,
      payload: { user_id: userId, display_name: profile.display_name, email: actorEmail },
    });
  }

  return c.json(profile);
});

// GET /api/v1/me/settings
router.get('/settings', async (c) => {
  const { userId } = getAuthContext(c);
  const settings = await dynamoRepo.getUserSettings(userId);
  const defaults: UserSettings = { ...DEFAULT_SETTINGS, updated_at: '' };
  return c.json(settings ?? defaults);
});

// PATCH /api/v1/me/settings
router.patch('/settings', async (c) => {
  const { userId } = getAuthContext(c);
  const body = await c.req.json();
  const parsed = UpdateSettingsRequestSchema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError('Invalid settings data', { issues: parsed.error.issues });
  }
  const settings = await dynamoRepo.upsertUserSettings(userId, parsed.data);
  return c.json(settings);
});

// GET /api/v1/me/join-requests — observer's outgoing requests
router.get('/join-requests', async (c) => {
  const { userId } = getAuthContext(c);
  const requests = await dynamoRepo.getMyJoinRequests(userId);
  return c.json({ data: requests });
});

// DELETE /api/v1/me — permanently delete caller's account and all associated data
router.delete('/', async (c) => {
  const { userId } = getAuthContext(c);

  // Capture profile before deletion for the event payload
  const profile = await dynamoRepo.getUserProfile(userId).catch(() => null);
  const displayName = profile?.display_name ?? '';
  const authHeader = c.req.header('Authorization') ?? '';
  let actorEmail = '';
  try {
    const token = authHeader.replace(/^Bearer\s+/i, '');
    const payloadB64 = token.split('.')[1] ?? '';
    const payloadJson = atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/'));
    actorEmail = (JSON.parse(payloadJson) as Record<string, unknown>)['email'] as string ?? '';
  } catch {
    // ignore — email is best-effort
  }

  let summary: DeleteAccountSummary;
  try {
    summary = await dynamoRepo.deleteAccount(userId);
  } catch (err) {
    console.error('[DELETE /me] deleteAccount failed', err);
    return c.json({ error: 'Account deletion failed. Please try again.' }, 500);
  }

  appEvents.emit('account.deleted', {
    type: 'account.deleted',
    timestamp: new Date().toISOString(),
    actor_id: userId,
    actor_email: actorEmail,
    payload: { user_id: userId, display_name: displayName, email: actorEmail },
  });

  return c.json({ deleted: true, summary });
});

// GET /api/v1/me/notification-preferences
router.get('/notification-preferences', async (c) => {
  const { userId, isAdmin } = getAuthContext(c);
  if (!isAdmin) {
    return c.json({ error: { code: 'FORBIDDEN', message: 'Not authorized' } }, 403);
  }
  const stored = await dynamoRepo.getNotificationPrefs(userId);
  const prefs = stored?.prefs ?? DEFAULT_NOTIFICATION_PREFS;
  return c.json({
    prefs,
    updated_at: stored?.updated_at ?? '',
  });
});

// PATCH /api/v1/me/notification-preferences
router.patch('/notification-preferences', async (c) => {
  const { userId, isAdmin } = getAuthContext(c);
  if (!isAdmin) {
    return c.json({ error: { code: 'FORBIDDEN', message: 'Not authorized' } }, 403);
  }
  const body = await c.req.json();
  const incoming = body['prefs'];
  if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) {
    throw new ValidationError('prefs must be an object');
  }
  for (const [key, value] of Object.entries(incoming)) {
    if (!(key in DEFAULT_NOTIFICATION_PREFS)) {
      throw new ValidationError(`Unknown event type: ${key}`);
    }
    if (typeof value !== 'boolean') {
      throw new ValidationError(`Value for ${key} must be a boolean`);
    }
  }
  // Merge with existing or defaults
  const stored = await dynamoRepo.getNotificationPrefs(userId);
  const merged = { ...(stored?.prefs ?? DEFAULT_NOTIFICATION_PREFS), ...(incoming as Record<string, boolean>) };
  const result = await dynamoRepo.upsertNotificationPrefs(userId, merged);
  return c.json(result);
});

export default router;

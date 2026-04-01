import { Hono } from 'hono';
import { dynamoRepo, type UserSettings, DEFAULT_SETTINGS } from '../services/dynamodb';
import { ValidationError } from '../errors';
import { getAuthContext } from '../middleware/auth';
import { UpdateProfileRequestSchema, UpdateSettingsRequestSchema } from '@litcrop/shared';
import type { DeleteAccountSummary } from '../services/dynamodb';

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
  const profile = await dynamoRepo.upsertUserProfile(userId, parsed.data);
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
  let summary: DeleteAccountSummary;
  try {
    summary = await dynamoRepo.deleteAccount(userId);
  } catch (err) {
    console.error('[DELETE /me] deleteAccount failed', err);
    return c.json({ error: 'Account deletion failed. Please try again.' }, 500);
  }
  return c.json({ deleted: true, summary });
});

export default router;

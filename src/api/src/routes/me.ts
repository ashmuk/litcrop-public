import { Hono } from 'hono';
import { dynamoRepo, type UserSettings } from '../services/dynamodb';
import { ValidationError } from '../errors';
import { getAuthContext } from '../middleware/auth';
import { UpdateProfileRequestSchema, UpdateSettingsRequestSchema } from '@litcrop/shared';

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
  const defaults: UserSettings = { locale: 'en', temp_unit: 'C', theme: 'system', updated_at: '' };
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

export default router;

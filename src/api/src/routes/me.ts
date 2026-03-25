import { Hono } from 'hono';
import { dynamoRepo } from '../services/dynamodb';
import { ValidationError } from '../errors';
import { getAuthContext } from '../middleware/auth';
import { UpdateProfileRequestSchema } from '@litcrop/shared';

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

export default router;

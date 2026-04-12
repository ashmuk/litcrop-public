import { Hono } from 'hono';
import { dynamoRepo, type UserSettings, DEFAULT_SETTINGS } from '../services/dynamodb';
import { ValidationError, PayloadTooLargeError } from '../errors';
import { getAuthContext } from '../middleware/auth';
import { UpdateProfileRequestSchema, UpdateSettingsRequestSchema } from '@litcrop/shared';
import { parseBody } from './_helpers';
import type { DeleteAccountSummary } from '../services/dynamodb';
import { appEvents } from '../services/events';
import { DEFAULT_NOTIFICATION_PREFS } from '../services/notification';
import { uploadAvatar, deleteAvatar, getSignedAvatarUrls } from '../services/s3';

const MAX_AVATAR_SIZE = 1024 * 1024; // 1MB
const JPEG_MAGIC = new Uint8Array([0xFF, 0xD8, 0xFF]);
const PNG_MAGIC = new Uint8Array([0x89, 0x50, 0x4E, 0x47]);

const router = new Hono();

// GET /api/v1/me/profile
router.get('/profile', async (c) => {
  const { userId, isAdmin } = getAuthContext(c);
  const profile = await dynamoRepo.getUserProfile(userId);

  // Resolve avatar signed URLs if picture keys exist
  const { url: profilePictureUrl, thumbUrl: profilePictureThumbUrl } = await getSignedAvatarUrls(
    profile?.profile_picture_key,
    profile?.profile_picture_thumb_key,
  );

  if (profile) {
    const { profile_picture_key: _k, profile_picture_thumb_key: _tk, ...rest } = profile;
    return c.json({ ...rest, is_admin: isAdmin, profile_picture_url: profilePictureUrl, profile_picture_thumb_url: profilePictureThumbUrl });
  }
  return c.json({ user_id: userId, display_name: '', preferred_role: 'staff' as const, created_at: null, is_admin: isAdmin, profile_picture_url: null, profile_picture_thumb_url: null });
});

// PATCH /api/v1/me/profile
router.patch('/profile', async (c) => {
  const { userId } = getAuthContext(c);
  const body = await c.req.json();
  const data = parseBody(UpdateProfileRequestSchema, body);

  // Check if this is the first-time profile creation (user.signup event)
  const existingProfile = await dynamoRepo.getUserProfile(userId).catch(() => null);
  const isFirstCreation = existingProfile === null;

  const profile = await dynamoRepo.upsertUserProfile(userId, data);

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

  if (isFirstCreation) {
    appEvents.emit('user.signup', {
      type: 'user.signup',
      timestamp: new Date().toISOString(),
      actor_id: userId,
      actor_email: actorEmail,
      payload: { user_id: userId, display_name: profile.display_name, email: actorEmail },
    });
  } else {
    appEvents.emit('user.profile_updated', {
      type: 'user.profile_updated',
      timestamp: new Date().toISOString(),
      actor_id: userId,
      actor_email: actorEmail,
      payload: { changed_fields: Object.keys(parsed.data) },
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
  const data = parseBody(UpdateSettingsRequestSchema, body);
  const settings = await dynamoRepo.upsertUserSettings(userId, data);
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

// POST /api/v1/me/profile-picture — upload avatar
router.post('/profile-picture', async (c) => {
  const { userId } = getAuthContext(c);

  const body = await c.req.parseBody();
  const file = body['image'];
  if (!(file instanceof File)) {
    throw new ValidationError('image field is required (multipart file upload)');
  }

  if (file.size > MAX_AVATAR_SIZE) {
    throw new PayloadTooLargeError(`Image must be under ${MAX_AVATAR_SIZE / 1024 / 1024}MB`);
  }

  const buffer = new Uint8Array(await file.arrayBuffer());

  // Validate JPEG or PNG magic bytes
  const isJpeg = buffer.length >= 3 && buffer[0] === JPEG_MAGIC[0] && buffer[1] === JPEG_MAGIC[1] && buffer[2] === JPEG_MAGIC[2];
  const isPng = buffer.length >= 4 && buffer[0] === PNG_MAGIC[0] && buffer[1] === PNG_MAGIC[1] && buffer[2] === PNG_MAGIC[2] && buffer[3] === PNG_MAGIC[3];
  if (!isJpeg && !isPng) {
    throw new ValidationError('Image must be JPEG or PNG format');
  }

  // Generate thumbnail using dynamic import (avoids cold-start penalty)
  const sharp = (await import('sharp')).default;
  const thumbBuffer = await sharp(buffer)
    .resize(150, 150, { fit: 'cover', position: 'centre' })
    .jpeg({ quality: 85 })
    .toBuffer();

  const { originalKey, thumbKey } = await uploadAvatar(
    userId,
    buffer,
    new Uint8Array(thumbBuffer),
    isJpeg ? 'image/jpeg' : 'image/png',
  );

  await dynamoRepo.upsertUserProfile(userId, {
    profile_picture_key: originalKey,
    profile_picture_thumb_key: thumbKey,
  });

  const { url, thumbUrl } = await getSignedAvatarUrls(originalKey, thumbKey);

  return c.json({
    profile_picture_url: url,
    profile_picture_thumb_url: thumbUrl,
  }, 201);
});

// DELETE /api/v1/me/profile-picture — remove avatar
router.delete('/profile-picture', async (c) => {
  const { userId } = getAuthContext(c);

  await deleteAvatar(userId);
  await dynamoRepo.upsertUserProfile(userId, {
    profile_picture_key: undefined,
    profile_picture_thumb_key: undefined,
  });

  return c.json({ deleted: true });
});

export default router;

import { ZodError, type ZodSchema } from 'zod';
import { getSignedThumbnailUrl, getSignedImageUrl } from '../services/s3';
import { dynamoRepo } from '../services/dynamodb';
import { NotFoundError, ServiceUnavailableError, ValidationError } from '../errors';
import type { Farm, FarmMember, FarmRole, Image } from '@litcrop/shared';

export function isConditionalCheckFailed(err: unknown): boolean {
  return err instanceof Error && err.name === 'ConditionalCheckFailedException';
}

export function isTransactionCanceled(err: unknown): boolean {
  return err instanceof Error && err.name === 'TransactionCanceledException';
}

export function parseBody<T>(schema: ZodSchema<T>, body: unknown): T {
  try {
    return schema.parse(body);
  } catch (err) {
    if (err instanceof ZodError) {
      const messages = err.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
      throw new ValidationError(messages[0], { errors: messages });
    }
    throw err;
  }
}

/**
 * Assert userId has membership access to the farm.
 * Throws 404 if the farm does not exist or the user is not a member
 * (prevents resource enumeration — never leaks existence of other users' farms).
 * Optionally restrict to specific roles; non-matching role also returns 404.
 *
 * Admin bypass: when isAdmin is true, membership check is skipped and a
 * synthetic admin membership is returned. Admins can read any farm.
 */
export async function assertFarmAccess(
  farmId: string,
  userId: string,
  requiredRoles?: FarmRole[],
  isAdmin?: boolean,
): Promise<{ farm: Farm; membership: FarmMember }> {
  const farm = await dynamoRepo.getFarm(farmId).catch((err: unknown) => {
    if (err instanceof NotFoundError) throw err;
    throw new ServiceUnavailableError('Storage service unavailable');
  });

  // Admin bypass: skip membership check, grant admin-level read access.
  // The synthetic membership uses role 'admin' — callers must NOT use it for write authorization.
  if (isAdmin) {
    const syntheticRole: FarmRole = 'admin';
    if (requiredRoles && !requiredRoles.includes(syntheticRole)) {
      throw new NotFoundError(`Farm not found: ${farmId}`);
    }
    return {
      farm,
      membership: { farm_id: farmId, user_id: userId, role: syntheticRole, joined_at: farm.created_at },
    };
  }

  const membership = await dynamoRepo.getFarmMembership(userId, farmId).catch(() => {
    throw new ServiceUnavailableError('Storage service unavailable');
  });

  if (!membership) {
    throw new NotFoundError(`Farm not found: ${farmId}`);
  }

  if (requiredRoles && !requiredRoles.includes(membership.role)) {
    // Return 404 (not 403) to avoid leaking existence
    throw new NotFoundError(`Farm not found: ${farmId}`);
  }

  return { farm, membership };
}

export async function makeLatestImage(image: Image) {
  const [thumbnail_url, url] = await Promise.all([
    image.thumbnail_key
      ? getSignedThumbnailUrl(image.thumbnail_key)
      : Promise.resolve(null),
    getSignedImageUrl(image.storage_key),
  ]);
  return {
    id: image.id,
    thumbnail_url,
    url,
    captured_at: image.captured_at,
    trigger: image.trigger,
  };
}

/**
 * Build the full latest_image shape for bed detail (includes signed URL + tags).
 * Used by GET /beds/:bedId — heavier than makeLatestImage() which is for list views.
 */
export async function makeBedDetailImage(image: Image) {
  const [thumbnail_url, url, tags] = await Promise.all([
    image.thumbnail_key
      ? getSignedThumbnailUrl(image.thumbnail_key)
      : Promise.resolve(null),
    getSignedImageUrl(image.storage_key),
    dynamoRepo.getTagsForImage(image.id),
  ]);
  return {
    id: image.id,
    thumbnail_url,
    url,
    captured_at: image.captured_at,
    trigger: image.trigger,
    tags: tags.map((t) => ({
      id: t.id,
      tag: t.tag,
      note: t.note ?? null,
      created_at: t.created_at,
    })),
  };
}

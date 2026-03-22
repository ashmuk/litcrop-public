import { getSignedThumbnailUrl, getSignedImageUrl } from '../services/s3';
import { dynamoRepo } from '../services/dynamodb';
import { NotFoundError, ServiceUnavailableError } from '../errors';
import type { Farm, FarmMember, FarmRole, Image } from '@litcrop/shared';

/**
 * Assert userId has membership access to the farm.
 * Throws 404 if the farm does not exist or the user is not a member
 * (prevents resource enumeration — never leaks existence of other users' farms).
 * Optionally restrict to specific roles; non-matching role also returns 404.
 */
export async function assertFarmAccess(
  farmId: string,
  userId: string,
  requiredRoles?: FarmRole[],
): Promise<{ farm: Farm; membership: FarmMember }> {
  const [farm, membership] = await Promise.all([
    dynamoRepo.getFarm(farmId).catch((err: unknown) => {
      if (err instanceof NotFoundError) throw err;
      throw new ServiceUnavailableError('Storage service unavailable');
    }),
    dynamoRepo.getFarmMembership(userId, farmId).catch(() => {
      throw new ServiceUnavailableError('Storage service unavailable');
    }),
  ]);

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
  const thumbnail_url = image.thumbnail_key
    ? await getSignedThumbnailUrl(image.thumbnail_key)
    : null;
  return {
    id: image.id,
    thumbnail_url,
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

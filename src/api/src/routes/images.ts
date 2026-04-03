import { Hono } from 'hono';
import { dynamoRepo } from '../services/dynamodb';
import { getSignedImageUrl, getSignedThumbnailUrl } from '../services/s3';
import {
  NotFoundError,
  ValidationError,
  ServiceUnavailableError,
} from '../errors';
import { getAuthContext } from '../middleware/auth';
import { TAG_VALUES, isValidTagValue } from '@litcrop/shared';
import type { Image, Bed } from '@litcrop/shared';
import { assertFarmAccess } from './_helpers';
import { appEvents } from '../services/events';

/** Resolve farm access for an image via its bed_id. */
async function assertImageOwnership(image: Image, userId: string, isAdmin?: boolean): Promise<void> {
  let bed: Bed;
  try {
    bed = await dynamoRepo.getBedById(image.bed_id);
  } catch (err) {
    if (err instanceof NotFoundError) {
      throw new NotFoundError(`Image not found: ${image.id}`);
    }
    throw new ServiceUnavailableError('Storage service unavailable');
  }
  try {
    await assertFarmAccess(bed.farm_id, userId, undefined, isAdmin);
  } catch (err) {
    if (err instanceof NotFoundError) {
      throw new NotFoundError(`Image not found: ${image.id}`);
    }
    throw err;
  }
}

/** Verify caller has admin or manager role for the farm containing this image (write operations). */
async function assertImageWriteAccess(image: Image, userId: string): Promise<Bed> {
  let bed: Bed;
  try {
    bed = await dynamoRepo.getBedById(image.bed_id);
  } catch (err) {
    if (err instanceof NotFoundError) {
      throw new NotFoundError(`Image not found: ${image.id}`);
    }
    throw new ServiceUnavailableError('Storage service unavailable');
  }
  try {
    await assertFarmAccess(bed.farm_id, userId, ['admin', 'owner']);
  } catch (err) {
    if (err instanceof NotFoundError) {
      throw new NotFoundError(`Image not found: ${image.id}`);
    }
    throw err;
  }
  return bed;
}

const router = new Hono();

// ── GET /api/v1/images/:imageId ──────────────────────────────────

router.get('/:imageId', async (c) => {
  const { imageId } = c.req.param();
  const { userId, isAdmin } = getAuthContext(c);

  let image: Image;
  try {
    image = await dynamoRepo.getImageById(imageId);
  } catch (err) {
    if (err instanceof NotFoundError) throw err;
    throw new ServiceUnavailableError('Storage service unavailable');
  }

  await assertImageOwnership(image, userId, isAdmin);

  const [url, thumbnail_url, tags] = await Promise.all([
    getSignedImageUrl(image.storage_key),
    image.thumbnail_key ? getSignedThumbnailUrl(image.thumbnail_key) : Promise.resolve(null),
    dynamoRepo.getTagsForImage(image.id),
  ]);

  return c.json({
    id: image.id,
    bed_id: image.bed_id,
    node_id: image.node_id,
    captured_at: image.captured_at,
    uploaded_at: image.uploaded_at,
    url,
    thumbnail_url,
    trigger: image.trigger,
    content_type: image.content_type,
    size_bytes: image.size_bytes,
    metadata: image.metadata ?? null,
    tags: tags.map((t) => ({
      id: t.id,
      tag: t.tag,
      note: t.note ?? null,
      created_at: t.created_at,
    })),
  });
});

// ── POST /api/v1/images/:imageId/tags ────────────────────────────

router.post('/:imageId/tags', async (c) => {
  const { imageId } = c.req.param();
  const { userId, userEmail } = getAuthContext(c);
  const body = await c.req.json<Record<string, unknown>>();

  const tagValue = body['tag'];
  if (tagValue === undefined || tagValue === null) {
    throw new ValidationError('Missing required field: tag', { field: 'tag', in: 'body' });
  }
  if (typeof tagValue !== 'string' || !isValidTagValue(tagValue)) {
    throw new ValidationError(
      `Invalid value for 'tag': must be one of ${TAG_VALUES.join(', ')}`,
      { field: 'tag', valid_values: TAG_VALUES },
    );
  }

  const note = body['note'];
  if (note !== undefined && note !== null) {
    if (typeof note !== 'string' || note.length > 500) {
      throw new ValidationError("Invalid value for 'note': max 500 characters", { field: 'note' });
    }
  }

  let image: Image;
  try {
    image = await dynamoRepo.getImageById(imageId);
  } catch (err) {
    if (err instanceof NotFoundError) throw err;
    throw new ServiceUnavailableError('Storage service unavailable');
  }

  const bed = await assertImageWriteAccess(image, userId);

  const tag = await dynamoRepo.createTag(
    imageId,
    image.bed_id,
    bed.farm_id,
    bed.row,
    bed.col,
    tagValue as import('@litcrop/shared').TagValue,
    typeof note === 'string' ? note : undefined,
  );

  appEvents.emit('tag.created', {
    type: 'tag.created',
    timestamp: new Date().toISOString(),
    actor_id: userId,
    actor_email: userEmail,
    payload: {
      image_id: imageId,
      tag_value: tagValue as string,
      farm_id: bed.farm_id,
      // farm_name omitted intentionally — denormalization deferred to avoid extra DDB read in hot path
      farm_name: '',
    },
  });

  return c.json(
    {
      id: tag.id,
      image_id: tag.image_id,
      tag: tag.tag,
      note: tag.note ?? null,
      created_at: tag.created_at,
      bed_status_updated: true,
    },
    201,
  );
});

export default router;

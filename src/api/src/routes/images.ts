import { Hono } from 'hono';
import { dynamoRepo } from '../services/dynamodb';
import { getSignedImageUrl } from '../services/s3';
import {
  NotFoundError,
  ValidationError,
  ServiceUnavailableError,
} from '../errors';
import { TAG_VALUES, isValidTagValue } from '@litcrop/shared';
import type { Image } from '@litcrop/shared';

const router = new Hono();

// ── 5.8 GET /api/v1/images/:imageId ──────────────────────────────

router.get('/:imageId', async (c) => {
  const { imageId } = c.req.param();

  let image: Image;
  try {
    image = await dynamoRepo.getImageById(imageId);
  } catch (err) {
    if (err instanceof NotFoundError) throw err;
    throw new ServiceUnavailableError('Storage service unavailable');
  }

  const [url, tags] = await Promise.all([
    getSignedImageUrl(image.storage_key),
    dynamoRepo.getTagsForImage(image.id),
  ]);

  return c.json({
    id: image.id,
    plot_id: image.plot_id,
    node_id: image.node_id,
    captured_at: image.captured_at,
    uploaded_at: image.uploaded_at,
    url,
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

// ── 5.9 POST /api/v1/images/:imageId/tags ────────────────────────

router.post('/:imageId/tags', async (c) => {
  const { imageId } = c.req.param();
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

  const tag = await dynamoRepo.createTag(
    imageId,
    image.plot_id,
    image.bed_id,  // SF-4: use denormalized bed_id from image record
    tagValue as import('@litcrop/shared').TagValue,
    typeof note === 'string' ? note : undefined,
  );

  return c.json(
    {
      id: tag.id,
      image_id: tag.image_id,
      tag: tag.tag,
      note: tag.note ?? null,
      created_at: tag.created_at,
      plot_status_updated: true,
    },
    201,
  );
});

export default router;

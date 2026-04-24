import { Hono } from 'hono';
import { dynamoRepo } from '../services/dynamodb';
import { getSignedImageUrl, getSignedThumbnailUrl, uploadImage, deleteImage, buildStorageKey } from '../services/s3';
import {
  NotFoundError,
  ValidationError,
  BadCursorError,
  PayloadTooLargeError,
  AppError,
  ServiceUnavailableError,
} from '../errors';
import { getAuthContext } from '../middleware/auth';
import {
  DEFAULT_PAGE_LIMIT,
  MAX_PAGE_LIMIT,
  MIN_PAGE_LIMIT,
  MAX_IMAGE_SIZE_BYTES,
  ACCEPTED_IMAGE_CONTENT_TYPE,
  TRIGGER_TYPES,
  isValidTriggerType,
  UpdateBedRequestSchema,
  toBedActiveCropSummary,
} from '@litcrop/shared';
import type { Bed, Image } from '@litcrop/shared';
import { makeBedDetailImage, assertBedAccess, assertBedWriteAccess, parseBody } from './_helpers';
import { appEvents } from '../services/events';

const router = new Hono();

// ── Helpers ──────────────────────────────────────────────────────

const NODE_ID_RE = /^[a-zA-Z0-9_-]{1,64}$/;

function isJpegBytes(buf: Uint8Array): boolean {
  return buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
}

// ── GET /api/v1/beds/:bedId ─────────────────────────────────────

router.get('/:bedId', async (c) => {
  const { bedId } = c.req.param();
  const { userId, isAdmin } = getAuthContext(c);

  let bed: Bed;
  try {
    bed = await dynamoRepo.getBedById(bedId);
  } catch (err) {
    if (err instanceof NotFoundError) throw err;
    throw new ServiceUnavailableError('Storage service unavailable');
  }

  await assertBedAccess(bed, userId, isAdmin);

  const [latestImage, activeCrop] = await Promise.all([
    dynamoRepo.getLatestImageForBed(bed.id),
    dynamoRepo.getActiveCropForBed(bed.id),
  ]);
  const active = toBedActiveCropSummary(activeCrop);

  return c.json({
    id: bed.id,
    farm_id: bed.farm_id,
    row: bed.row,
    col: bed.col,
    name: bed.name,
    // Wave B (#279) compat shim — inline fields mirror the active crop when one exists.
    crop_type: active?.crop_type ?? bed.crop_type ?? null,
    crop_variety: active?.crop_variety ?? bed.crop_variety ?? null,
    planted_at: active?.planted_at ?? bed.planted_at ?? null,
    expected_harvest: active?.expected_harvest ?? bed.expected_harvest ?? null,
    notes: bed.notes ?? null,
    latest_status: bed.latest_status,
    completed_at: bed.completed_at ?? null,
    active_crop: active,
    latest_image: latestImage ? await makeBedDetailImage(latestImage) : null,
  });
});

// ── PATCH /api/v1/beds/:bedId ───────────────────────────────────

router.patch('/:bedId', async (c) => {
  const { bedId } = c.req.param();
  const { userId, userEmail } = getAuthContext(c);

  let bed: Bed;
  try {
    bed = await dynamoRepo.getBedById(bedId);
  } catch (err) {
    if (err instanceof NotFoundError) throw err;
    throw new ServiceUnavailableError('Storage service unavailable');
  }

  await assertBedWriteAccess(bed, userId);

  const body = await c.req.json<Record<string, unknown>>();
  const validated = parseBody(UpdateBedRequestSchema, body);

  // Pass through null values (to trigger DynamoDB REMOVE) and non-null values (SET)
  const updates: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(validated)) {
    if (value !== undefined) {
      updates[key] = value;
    }
  }

  // When crop_type changes, auto-clear lifecycle dates unless explicitly provided (#321)
  if ('crop_type' in updates && updates['crop_type'] !== bed.crop_type) {
    if (!('planted_at' in updates)) updates['planted_at'] = null;
    if (!('expected_harvest' in updates)) updates['expected_harvest'] = null;
    if (!('completed_at' in updates)) updates['completed_at'] = null;
  }

  try {
    await dynamoRepo.updateBed(bed.farm_id, bedId, bed.row, bed.col, updates);
  } catch (err) {
    if (err instanceof Error && err.name === 'ConditionalCheckFailedException') {
      throw new NotFoundError(`Bed not found: ${bedId}`);
    }
    throw new ServiceUnavailableError('Storage service unavailable');
  }

  // Re-fetch to return updated bed
  const updated = await dynamoRepo.getBedById(bedId);

  appEvents.emit('bed.updated', {
    type: 'bed.updated',
    timestamp: new Date().toISOString(),
    actor_id: userId,
    actor_email: userEmail,
    payload: {
      bed_id: bedId,
      bed_name: updated.name,
      farm_id: updated.farm_id,
      // farm_name omitted intentionally — denormalization deferred to avoid extra DDB read in hot path
      farm_name: '',
      changed_fields: Object.keys(updates),
    },
  });

  return c.json({
    id: updated.id,
    farm_id: updated.farm_id,
    row: updated.row,
    col: updated.col,
    name: updated.name,
    crop_type: updated.crop_type ?? null,
    crop_variety: updated.crop_variety ?? null,
    planted_at: updated.planted_at ?? null,
    expected_harvest: updated.expected_harvest ?? null,
    notes: updated.notes ?? null,
    latest_status: updated.latest_status,
    completed_at: updated.completed_at ?? null,
  });
});

// ── GET /api/v1/beds/:bedId/images ──────────────────────────────

router.get('/:bedId/images', async (c) => {
  const { bedId } = c.req.param();
  const { userId, isAdmin } = getAuthContext(c);
  const rawLimit = c.req.query('limit');
  const cursor = c.req.query('cursor');

  const limit = rawLimit !== undefined ? parseInt(rawLimit, 10) : DEFAULT_PAGE_LIMIT;
  if (isNaN(limit) || limit < MIN_PAGE_LIMIT || limit > MAX_PAGE_LIMIT) {
    throw new ValidationError('Limit must be between 1 and 100', {
      field: 'limit',
      min: MIN_PAGE_LIMIT,
      max: MAX_PAGE_LIMIT,
    });
  }

  // Verify bed exists and caller has access
  let bed: Bed;
  try {
    bed = await dynamoRepo.getBedById(bedId);
  } catch (err) {
    if (err instanceof NotFoundError) throw err;
    throw new ServiceUnavailableError('Storage service unavailable');
  }
  await assertBedAccess(bed, userId, isAdmin);

  let result: { items: Image[]; nextCursor: string | null };
  try {
    result = await dynamoRepo.getImagesForBed(bedId, limit, cursor);
  } catch (err) {
    if (
      err instanceof Error &&
      (err.name === 'ValidationException' || err.message?.includes('ExclusiveStartKey'))
    ) {
      throw new BadCursorError();
    }
    throw new ServiceUnavailableError('Storage service unavailable');
  }

  const data = await Promise.all(
    result.items.map(async (image) => {
      const [thumbnail_url, url, latestTag] = await Promise.all([
        image.thumbnail_key ? getSignedThumbnailUrl(image.thumbnail_key) : Promise.resolve(null),
        getSignedImageUrl(image.storage_key),
        dynamoRepo.getLatestTagForImage(image.id),
      ]);
      return {
        id: image.id,
        thumbnail_url,
        url,
        captured_at: image.captured_at,
        trigger: image.trigger,
        node_id: image.node_id,
        size_bytes: image.size_bytes,
        latest_tag: latestTag?.tag ?? null,
      };
    }),
  );

  return c.json({
    data,
    meta: { count: data.length, limit, next_cursor: result.nextCursor },
  });
});

// ── POST /api/v1/beds/:bedId/images ─────────────────────────────

router.post('/:bedId/images', async (c) => {
  const { bedId } = c.req.param();
  const { userId, userEmail } = getAuthContext(c);

  // Verify bed exists and caller is a farm member (all roles can upload images)
  let bed: Bed;
  try {
    bed = await dynamoRepo.getBedById(bedId);
  } catch (err) {
    if (err instanceof NotFoundError) throw err;
    throw new ServiceUnavailableError('Storage service unavailable');
  }
  await assertBedAccess(bed, userId);

  // Parse multipart form data
  const formData = await c.req.parseBody();

  const imageFile = formData['image'];
  if (!imageFile || !(imageFile instanceof File)) {
    throw new ValidationError('Missing required field: image', { field: 'image', in: 'body' });
  }

  // Size check
  if (imageFile.size > MAX_IMAGE_SIZE_BYTES) {
    throw new PayloadTooLargeError('Image exceeds maximum size of 2MB', {
      max_bytes: MAX_IMAGE_SIZE_BYTES,
      received_bytes: imageFile.size,
    });
  }

  // Read bytes
  const buffer = new Uint8Array(await imageFile.arrayBuffer());

  // JPEG magic bytes check
  if (!isJpegBytes(buffer)) {
    throw new AppError(
      'UNSUPPORTED_MEDIA_TYPE',
      415,
      `Image must be JPEG format (${ACCEPTED_IMAGE_CONTENT_TYPE})`,
    );
  }

  // Required text fields
  const captured_at = formData['captured_at'];
  const node_id = formData['node_id'];
  const trigger = formData['trigger'];

  if (!captured_at || typeof captured_at !== 'string') {
    throw new ValidationError('Missing required field: captured_at', { field: 'captured_at', in: 'body' });
  }
  if (!node_id || typeof node_id !== 'string') {
    throw new ValidationError('Missing required field: node_id', { field: 'node_id', in: 'body' });
  }
  if (!trigger || typeof trigger !== 'string') {
    throw new ValidationError('Missing required field: trigger', { field: 'trigger', in: 'body' });
  }

  // Value validation
  const capturedDate = new Date(captured_at);
  if (isNaN(capturedDate.getTime())) {
    throw new ValidationError("Invalid value for 'captured_at': must be a valid ISO 8601 datetime", {
      field: 'captured_at',
    });
  }
  if (capturedDate.getTime() > Date.now() + 5 * 60 * 1000) {
    throw new ValidationError("Invalid value for 'captured_at': must not be in the future", {
      field: 'captured_at',
    });
  }
  if (!NODE_ID_RE.test(node_id)) {
    throw new ValidationError("Invalid value for 'node_id': must match /^[a-zA-Z0-9_-]{1,64}$/", {
      field: 'node_id',
    });
  }
  if (!isValidTriggerType(trigger)) {
    throw new ValidationError("Invalid trigger type: must be 'scheduled' or 'motion'", {
      field: 'trigger',
      valid_values: TRIGGER_TYPES,
    });
  }

  // Optional metadata JSON
  let metadata: Record<string, unknown> | undefined;
  const metadataRaw = formData['metadata'];
  if (metadataRaw && typeof metadataRaw === 'string') {
    try {
      const parsed = JSON.parse(metadataRaw);
      if (typeof parsed !== 'object' || Array.isArray(parsed) || parsed === null) {
        throw new ValidationError("Invalid value for 'metadata': must be a JSON object");
      }
      if (JSON.stringify(parsed).length > 4096) {
        throw new ValidationError("Invalid value for 'metadata': exceeds 4KB limit");
      }
      metadata = parsed as Record<string, unknown>;
    } catch (err) {
      if (err instanceof ValidationError) throw err;
      throw new ValidationError("Invalid value for 'metadata': must be valid JSON");
    }
  }

  // Write DynamoDB first, then upload to S3.
  // Order matters: the S3 upload triggers the thumbnail Lambda via S3 event,
  // which queries GSI1 for the image record. If DynamoDB isn't written yet,
  // the Lambda silently skips and thumbnail_key is never set (#258).
  const imageId = crypto.randomUUID();
  const uploadedAt = new Date().toISOString();
  const capturedAtIso = capturedDate.toISOString();
  const contentType = ACCEPTED_IMAGE_CONTENT_TYPE;
  const storageKey = buildStorageKey(bed.farm_id, bedId, imageId, capturedAtIso);

  let image: Image;
  try {
    image = await dynamoRepo.createImage(bedId, imageId, {
      node_id,
      captured_at: capturedAtIso,
      uploaded_at: uploadedAt,
      storage_key: storageKey,
      trigger: trigger as Image['trigger'],
      content_type: contentType,
      size_bytes: imageFile.size,
      metadata,
      uploaded_by: userId,
    });
  } catch (err) {
    console.error('[dynamo createImage error]', err);
    throw new ServiceUnavailableError('Storage service unavailable');
  }

  try {
    await uploadImage(
      bed.farm_id,
      bedId,
      imageId,
      capturedAtIso,
      buffer,
      contentType,
    );
  } catch (err) {
    console.error('[s3 upload error]', err);
    throw new ServiceUnavailableError('Storage service unavailable');
  }

  const signedUrl = await getSignedImageUrl(storageKey);

  appEvents.emit('image.uploaded', {
    type: 'image.uploaded',
    timestamp: new Date().toISOString(),
    actor_id: userId,
    actor_email: userEmail,
    payload: {
      image_id: image.id,
      bed_id: bedId,
      bed_name: bed.name,
      farm_id: bed.farm_id,
      // farm_name omitted intentionally — denormalization deferred to avoid extra DDB read in hot path
      farm_name: '',
    },
  });

  return c.json(
    {
      id: image.id,
      url: signedUrl,
      captured_at: image.captured_at,
      uploaded_at: image.uploaded_at,
      trigger: image.trigger,
      size_bytes: image.size_bytes,
    },
    201,
  );
});

export default router;

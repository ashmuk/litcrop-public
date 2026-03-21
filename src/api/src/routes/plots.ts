import { Hono } from 'hono';
import { dynamoRepo } from '../services/dynamodb';
import { getSignedImageUrl, getSignedThumbnailUrl, uploadImage, deleteImage } from '../services/s3';
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
} from '@litcrop/shared';
import type { Farm, Field, Plot, Image } from '@litcrop/shared';
import { makeLatestImage } from './_helpers';

/** Verify caller owns the farm that contains this plot (plot.farm_id → farm.user_id). */
async function assertPlotOwnership(plot: Plot, userId: string): Promise<void> {
  let farm: Farm;
  try {
    farm = await dynamoRepo.getFarm(plot.farm_id);
  } catch (err) {
    if (err instanceof NotFoundError) throw err;
    throw new ServiceUnavailableError('Storage service unavailable');
  }
  if (farm.user_id !== userId) {
    throw new NotFoundError(`Plot not found: ${plot.id}`);
  }
}

const router = new Hono();

// ── Helpers ──────────────────────────────────────────────────────

const NODE_ID_RE = /^[a-zA-Z0-9_-]{1,64}$/;

function isJpegBytes(buf: Uint8Array): boolean {
  return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
}

/**
 * Build bed_id → { bed_name, field_name } lookup for a given farm.
 */
async function buildBedLookup(
  farmId: string,
): Promise<Map<string, { bed_name: string; field_name: string }>> {
  const fields = await dynamoRepo.getFieldsForFarm(farmId);
  const map = new Map<string, { bed_name: string; field_name: string }>();
  await Promise.all(
    fields.map(async (field: Field) => {
      const beds = await dynamoRepo.getBedsForField(field.id);
      for (const bed of beds) {
        map.set(bed.id, { bed_name: bed.name, field_name: field.name });
      }
    }),
  );
  return map;
}

// ── 5.5 GET /api/v1/plots/:plotId ───────────────────────────────

router.get('/:plotId', async (c) => {
  const { plotId } = c.req.param();
  const { userId } = getAuthContext(c);

  let plot: Plot;
  try {
    plot = await dynamoRepo.getPlotById(plotId);
  } catch (err) {
    if (err instanceof NotFoundError) throw err;
    throw new ServiceUnavailableError('Storage service unavailable');
  }

  await assertPlotOwnership(plot, userId);

  const [bedLookup, latestImage] = await Promise.all([
    buildBedLookup(plot.farm_id),
    dynamoRepo.getLatestImageForPlot(plot.id),
  ]);

  const meta = bedLookup.get(plot.bed_id) ?? { bed_name: '', field_name: '' };

  return c.json({
    id: plot.id,
    label: plot.label,
    crop_type: plot.crop_type,
    crop_variety: plot.crop_variety,
    planted_at: plot.planted_at,
    expected_harvest: plot.expected_harvest,
    notes: plot.notes ?? null,
    latest_status: plot.latest_status,
    field_name: meta.field_name,
    bed_name: meta.bed_name,
    farm_id: plot.farm_id,
    latest_image: latestImage ? await makeLatestImage(latestImage) : null,
  });
});

// ── 5.6 GET /api/v1/plots/:plotId/images ─────────────────────────

router.get('/:plotId/images', async (c) => {
  const { plotId } = c.req.param();
  const { userId } = getAuthContext(c);
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

  // Verify plot exists and caller owns it
  let plot: Plot;
  try {
    plot = await dynamoRepo.getPlotById(plotId);
  } catch (err) {
    if (err instanceof NotFoundError) throw err;
    throw new ServiceUnavailableError('Storage service unavailable');
  }
  await assertPlotOwnership(plot, userId);

  let result: { items: Image[]; nextCursor: string | null };
  try {
    result = await dynamoRepo.getImagesForPlot(plotId, limit, cursor);
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
      const [thumbnail_url, tags] = await Promise.all([
        image.thumbnail_key ? getSignedThumbnailUrl(image.thumbnail_key) : Promise.resolve(null),
        dynamoRepo.getTagsForImage(image.id),
      ]);
      // Tags are sorted ascending by createdAt; last entry is the most recent
      const latest_tag = tags.length > 0 ? tags[tags.length - 1].tag : null;
      return {
        id: image.id,
        thumbnail_url,
        captured_at: image.captured_at,
        trigger: image.trigger,
        size_bytes: image.size_bytes,
        latest_tag,
      };
    }),
  );

  return c.json({
    data,
    meta: { count: data.length, limit, next_cursor: result.nextCursor },
  });
});

// ── 5.7 POST /api/v1/plots/:plotId/images ────────────────────────

router.post('/:plotId/images', async (c) => {
  const { plotId } = c.req.param();
  const { userId } = getAuthContext(c);

  // 2. Verify plot exists and caller owns it
  let plot: Plot;
  try {
    plot = await dynamoRepo.getPlotById(plotId);
  } catch (err) {
    if (err instanceof NotFoundError) throw err;
    throw new ServiceUnavailableError('Storage service unavailable');
  }
  await assertPlotOwnership(plot, userId);

  // 1/3. Parse multipart form data
  const formData = await c.req.parseBody();

  const imageFile = formData['image'];
  if (!imageFile || !(imageFile instanceof File)) {
    throw new ValidationError('Missing required field: image', { field: 'image', in: 'body' });
  }

  // 4. Size check
  if (imageFile.size > MAX_IMAGE_SIZE_BYTES) {
    throw new PayloadTooLargeError('Image exceeds maximum size of 2MB', {
      max_bytes: MAX_IMAGE_SIZE_BYTES,
      received_bytes: imageFile.size,
    });
  }

  // Read bytes
  const buffer = new Uint8Array(await imageFile.arrayBuffer());

  // 5. JPEG magic bytes check
  if (!isJpegBytes(buffer)) {
    throw new AppError(
      'UNSUPPORTED_MEDIA_TYPE',
      415,
      `Image must be JPEG format (${ACCEPTED_IMAGE_CONTENT_TYPE})`,
    );
  }

  // 6. Required text fields
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

  // 7. Value validation
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

  // 8. Optional metadata JSON
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

  // 9. Upload to S3 + write DynamoDB
  const imageId = crypto.randomUUID();
  const uploadedAt = new Date().toISOString();
  const capturedAtIso = capturedDate.toISOString();
  const contentType = ACCEPTED_IMAGE_CONTENT_TYPE;

  let storageKey: string;
  try {
    storageKey = await uploadImage(
      plot.farm_id,
      plotId,
      imageId,
      capturedAtIso,
      buffer,
      contentType,
    );
  } catch (err) {
    console.error('[s3 upload error]', err);
    throw new ServiceUnavailableError('Storage service unavailable');
  }

  let image: Image;
  try {
    image = await dynamoRepo.createImage(plotId, imageId, {
      bed_id: plot.bed_id,  // SF-4: denormalize bed_id to enable direct plot-status update
      node_id,
      captured_at: capturedAtIso,
      uploaded_at: uploadedAt,
      storage_key: storageKey,
      trigger: trigger as Image['trigger'],
      content_type: contentType,
      size_bytes: imageFile.size,
      metadata,
    });
  } catch (err) {
    console.error('[dynamo createImage error]', err);
    // Rollback: remove the S3 object that has no metadata record
    try { await deleteImage(storageKey); } catch { /* best-effort */ }
    throw new ServiceUnavailableError('Storage service unavailable');
  }

  const signedUrl = await getSignedImageUrl(storageKey);

  return c.json(
    {
      id: image.id,
      url: signedUrl,
      captured_at: image.captured_at,
      uploaded_at: image.uploaded_at,
      storage_key: image.storage_key,
      trigger: image.trigger,
      size_bytes: image.size_bytes,
    },
    201,
  );
});

export default router;

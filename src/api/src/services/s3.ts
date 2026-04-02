import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { SIGNED_URL_EXPIRY_SECONDS, S3_AVATAR_PREFIX } from '@litcrop/shared';

// ── Configuration ────────────────────────────────────────────────

const AWS_REGION = process.env.AWS_REGION ?? 'ap-northeast-1';
const IMAGE_BUCKET = process.env.S3_IMAGES_BUCKET ?? process.env.IMAGE_BUCKET ?? 'litcrop-dev-images';
if (!process.env.S3_IMAGES_BUCKET && !process.env.IMAGE_BUCKET) console.warn('[s3] IMAGE_BUCKET not set, falling back to litcrop-dev-images');
const THUMBNAIL_BUCKET = process.env.S3_THUMBNAILS_BUCKET ?? 'litcrop-mvp-thumbnails';

// ── Client ───────────────────────────────────────────────────────

const s3 = new S3Client({ region: AWS_REGION });

// ── Key builders ─────────────────────────────────────────────────

/**
 * Build a deterministic S3 key for an image.
 * Format: images/{farmId}/{bedId}/{YYYY}/{MM}/{DD}/{imageId}.jpg
 */
export function buildStorageKey(
  farmId: string,
  bedId: string,
  imageId: string,
  capturedAt: string,
): string {
  const date = new Date(capturedAt);
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  return `images/${farmId}/${bedId}/${yyyy}/${mm}/${dd}/${imageId}.jpg`;
}

/**
 * Derive the thumbnail key from the original image storage key.
 * Replaces the leading "images/" prefix with "thumbnails/".
 * Format: thumbnails/{farmId}/{bedId}/{YYYY}/{MM}/{DD}/{imageId}.jpg
 */
export function buildThumbnailKey(storageKey: string): string {
  return storageKey.replace(/^images\//, 'thumbnails/');
}

// ── Operations ───────────────────────────────────────────────────

/**
 * Upload an image buffer to S3.
 * Returns the storage key used.
 */
export async function uploadImage(
  farmId: string,
  bedId: string,
  imageId: string,
  capturedAt: string,
  buffer: Uint8Array,
  contentType: string,
): Promise<string> {
  const storageKey = buildStorageKey(farmId, bedId, imageId, capturedAt);

  await s3.send(
    new PutObjectCommand({
      Bucket: IMAGE_BUCKET,
      Key: storageKey,
      Body: buffer,
      ContentType: contentType,
    }),
  );

  return storageKey;
}

/**
 * Generate a presigned GET URL for a stored image.
 */
export async function getSignedImageUrl(
  storageKey: string,
  expirySeconds = SIGNED_URL_EXPIRY_SECONDS,
): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: IMAGE_BUCKET,
    Key: storageKey,
  });

  return getSignedUrl(s3, command, { expiresIn: expirySeconds });
}

/**
 * Generate a presigned GET URL for a thumbnail.
 * Thumbnails live in a separate bucket (THUMBNAIL_BUCKET).
 */
export async function getSignedThumbnailUrl(
  thumbnailKey: string,
  expirySeconds = SIGNED_URL_EXPIRY_SECONDS,
): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: THUMBNAIL_BUCKET,
    Key: thumbnailKey,
  });

  return getSignedUrl(s3, command, { expiresIn: expirySeconds });
}

/**
 * Delete an image from S3.
 */
export async function deleteImage(storageKey: string): Promise<void> {
  await s3.send(
    new DeleteObjectCommand({
      Bucket: IMAGE_BUCKET,
      Key: storageKey,
    }),
  );
}

// ── Avatar helpers (Beta-5) ─────────────────────────────────────

function avatarOriginalKey(userId: string): string {
  return `${S3_AVATAR_PREFIX}${userId}/original.jpg`;
}

function avatarThumbKey(userId: string): string {
  return `${S3_AVATAR_PREFIX}${userId}/thumb.jpg`;
}

/**
 * Upload a profile picture original and thumbnail to S3.
 * Returns the S3 keys for both.
 */
export async function uploadAvatar(
  userId: string,
  originalBuffer: Uint8Array,
  thumbBuffer: Uint8Array,
  contentType: string,
): Promise<{ originalKey: string; thumbKey: string }> {
  const originalKey = avatarOriginalKey(userId);
  const thumbKey = avatarThumbKey(userId);

  await Promise.all([
    s3.send(new PutObjectCommand({
      Bucket: IMAGE_BUCKET,
      Key: originalKey,
      Body: originalBuffer,
      ContentType: contentType,
    })),
    s3.send(new PutObjectCommand({
      Bucket: IMAGE_BUCKET,
      Key: thumbKey,
      Body: thumbBuffer,
      ContentType: 'image/jpeg',
    })),
  ]);

  return { originalKey, thumbKey };
}

/**
 * Delete both avatar files from S3.
 */
export async function deleteAvatar(userId: string): Promise<void> {
  await Promise.all([
    s3.send(new DeleteObjectCommand({ Bucket: IMAGE_BUCKET, Key: avatarOriginalKey(userId) })),
    s3.send(new DeleteObjectCommand({ Bucket: IMAGE_BUCKET, Key: avatarThumbKey(userId) })),
  ]);
}

/**
 * Get signed URLs for avatar files. Returns null if keys are not set.
 */
export async function getSignedAvatarUrls(
  originalKey: string | undefined,
  thumbKey: string | undefined,
  expirySeconds = SIGNED_URL_EXPIRY_SECONDS,
): Promise<{ url: string | null; thumbUrl: string | null }> {
  const [url, thumbUrl] = await Promise.all([
    originalKey ? getSignedUrl(s3, new GetObjectCommand({ Bucket: IMAGE_BUCKET, Key: originalKey }), { expiresIn: expirySeconds }) : null,
    thumbKey ? getSignedUrl(s3, new GetObjectCommand({ Bucket: IMAGE_BUCKET, Key: thumbKey }), { expiresIn: expirySeconds }) : null,
  ]);
  return { url, thumbUrl };
}

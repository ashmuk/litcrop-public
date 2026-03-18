import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { SIGNED_URL_EXPIRY_SECONDS } from '@litcrop/shared';

// ── Configuration ────────────────────────────────────────────────

const AWS_REGION = process.env.AWS_REGION ?? 'ap-northeast-1';
const IMAGE_BUCKET = process.env.IMAGE_BUCKET ?? 'litcrop-poc-images';

// ── Client ───────────────────────────────────────────────────────

const s3 = new S3Client({ region: AWS_REGION });

// ── Key builder ──────────────────────────────────────────────────

/**
 * Build a deterministic S3 key for an image.
 * Format: images/{farmId}/{plotId}/{YYYY}/{MM}/{DD}/{imageId}.jpg
 */
export function buildStorageKey(
  farmId: string,
  plotId: string,
  imageId: string,
  capturedAt: string,
): string {
  const date = new Date(capturedAt);
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  return `images/${farmId}/${plotId}/${yyyy}/${mm}/${dd}/${imageId}.jpg`;
}

// ── Operations ───────────────────────────────────────────────────

/**
 * Upload an image buffer to S3.
 * Returns the storage key used.
 */
export async function uploadImage(
  farmId: string,
  plotId: string,
  imageId: string,
  capturedAt: string,
  buffer: Uint8Array,
  contentType: string,
): Promise<string> {
  const storageKey = buildStorageKey(farmId, plotId, imageId, capturedAt);

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

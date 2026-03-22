/**
 * Thumbnail Lambda — litcrop-thumb
 *
 * Triggered by S3 ObjectCreated events on the litcrop-mvp-images bucket
 * (prefix: images/). Generates a 300×300 center-crop JPEG thumbnail and
 * stores it in litcrop-mvp-thumbnails under the same key path (thumbnails/ prefix).
 * Updates the Image record in DynamoDB with the thumbnail_key.
 *
 * Runtime: Node.js 20 (ARM64 / Graviton2)
 * Memory:  1024 MB (image processing benefits from more memory)
 * Timeout: 60s
 */

import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import sharp from 'sharp';

// ── Configuration ─────────────────────────────────────────────────

const AWS_REGION = process.env.AWS_REGION ?? 'ap-northeast-1';
const THUMBNAILS_BUCKET = process.env.S3_THUMBNAILS_BUCKET ?? '';
const TABLE_NAME = process.env.TABLE_NAME ?? '';

const THUMBNAIL_WIDTH = 300;
const THUMBNAIL_HEIGHT = 300;
const THUMBNAIL_QUALITY = 85;

// ── Clients ───────────────────────────────────────────────────────

const s3 = new S3Client({ region: AWS_REGION });
const ddb = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: AWS_REGION }),
  { marshallOptions: { removeUndefinedValues: true } },
);

// ── S3 event types ────────────────────────────────────────────────

interface S3EventRecord {
  s3: {
    bucket: { name: string };
    object: { key: string };
  };
}

interface S3Event {
  Records: S3EventRecord[];
}

// ── Handler ───────────────────────────────────────────────────────

export const handler = async (event: S3Event): Promise<void> => {
  console.log('[thumbnail] handler invoked', { records: event.Records.length });

  for (const record of event.Records) {
    // S3 keys may be URL-encoded; decode before use
    const sourceKey = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));
    const sourceBucket = record.s3.bucket.name;

    try {
      await processThumbnail(sourceBucket, sourceKey);
    } catch (err) {
      // Log but don't rethrow — failed records can be sent to DLQ if configured
      console.error('[thumbnail] processing failed', { sourceKey, err });
    }
  }
};

// ── Core processing ───────────────────────────────────────────────

async function processThumbnail(sourceBucket: string, sourceKey: string): Promise<void> {
  console.log('[thumbnail] processing', { sourceBucket, sourceKey });

  // 1. Parse imageId from storage key: images/{farmId}/{bedId}/{YYYY}/{MM}/{DD}/{imageId}.jpg
  const filename = sourceKey.split('/').pop();
  const imageId = filename?.replace(/\.jpg$/i, '');
  if (!imageId) {
    throw new Error(`Cannot parse imageId from key: ${sourceKey}`);
  }

  // 2. Download original image from S3
  const getResult = await s3.send(
    new GetObjectCommand({ Bucket: sourceBucket, Key: sourceKey }),
  );
  if (!getResult.Body) {
    throw new Error(`Empty body for key: ${sourceKey}`);
  }
  const inputBuffer = Buffer.from(await getResult.Body.transformToByteArray());

  // 3. Generate 300×300 center-crop JPEG thumbnail
  const thumbnailBuffer = await sharp(inputBuffer)
    .resize(THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT, { fit: 'cover', position: 'centre' })
    .jpeg({ quality: THUMBNAIL_QUALITY })
    .toBuffer();

  // 4. Derive thumbnail key (same path, different prefix)
  const thumbnailKey = sourceKey.replace(/^images\//, 'thumbnails/');

  // 5. Upload thumbnail to thumbnails bucket
  await s3.send(
    new PutObjectCommand({
      Bucket: THUMBNAILS_BUCKET,
      Key: thumbnailKey,
      Body: thumbnailBuffer,
      ContentType: 'image/jpeg',
    }),
  );

  console.log('[thumbnail] uploaded', { thumbnailKey, size: thumbnailBuffer.length });

  // 6. Resolve image item PK/SK via GSI1 (only imageId is known here)
  const queryResult = await ddb.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: 'GSI1',
      KeyConditionExpression: 'GSI1PK = :pk AND GSI1SK = :sk',
      ExpressionAttributeValues: {
        ':pk': `IMG#${imageId}`,
        ':sk': '#META',
      },
      Limit: 1,
    }),
  );

  const item = queryResult.Items?.[0];
  if (!item) {
    console.warn('[thumbnail] image record not found in DynamoDB — skipping update', { imageId });
    return;
  }

  // 7. Update image item with thumbnail_key
  await ddb.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { PK: item['PK'] as string, SK: item['SK'] as string },
      UpdateExpression: 'SET thumbnail_key = :key',
      ExpressionAttributeValues: {
        ':key': thumbnailKey,
      },
      ConditionExpression: 'attribute_exists(PK)',
    }),
  );

  console.log('[thumbnail] DynamoDB updated', { imageId, thumbnailKey });
}

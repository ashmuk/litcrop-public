/**
 * scripts/backfill-thumbnails.ts
 * Scans DynamoDB for Image items missing `thumbnail_key`, downloads originals
 * from S3, generates 300×300 thumbnails with Sharp, uploads to thumbnails
 * bucket, and updates DynamoDB.
 *
 * Run: npx tsx scripts/backfill-thumbnails.ts
 * Dry run: DRY_RUN=1 npx tsx scripts/backfill-thumbnails.ts
 *
 * Environment variables:
 *   TABLE_NAME           — DynamoDB table (default: litcrop-poc)
 *   S3_IMAGES_BUCKET     — Source bucket (default: litcrop-mvp-images)
 *   S3_THUMBNAILS_BUCKET — Dest bucket (default: litcrop-mvp-thumbnails)
 *   AWS_REGION           — Region (default: ap-northeast-1)
 *   DRY_RUN              — Set to "1" for read-only mode
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import sharp from 'sharp';

const TABLE_NAME = process.env['TABLE_NAME'] ?? 'litcrop-poc';
const IMAGES_BUCKET = process.env['S3_IMAGES_BUCKET'] ?? 'litcrop-mvp-images';
const THUMBNAILS_BUCKET = process.env['S3_THUMBNAILS_BUCKET'] ?? 'litcrop-mvp-thumbnails';
const AWS_REGION = process.env['AWS_REGION'] ?? 'ap-northeast-1';
const DRY_RUN = process.env['DRY_RUN'] === '1';

const THUMBNAIL_WIDTH = 300;
const THUMBNAIL_HEIGHT = 300;
const THUMBNAIL_QUALITY = 85;

console.log(`[backfill] Table: ${TABLE_NAME}`);
console.log(`[backfill] Images: ${IMAGES_BUCKET} → Thumbnails: ${THUMBNAILS_BUCKET}`);
console.log(`[backfill] Region: ${AWS_REGION}`);
console.log(`[backfill] Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}\n`);

const ddb = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: AWS_REGION }),
  { marshallOptions: { removeUndefinedValues: true } },
);
const s3 = new S3Client({ region: AWS_REGION });

interface ImageRecord {
  PK: string;
  SK: string;
  id: string;
  storage_key: string;
  thumbnail_key?: string;
}

async function scanImagesWithoutThumbnails(): Promise<ImageRecord[]> {
  const results: ImageRecord[] = [];
  let lastKey: Record<string, unknown> | undefined;

  do {
    const resp = await ddb.send(
      new ScanCommand({
        TableName: TABLE_NAME,
        FilterExpression:
          'begins_with(SK, :imgPrefix) AND attribute_exists(storage_key) AND attribute_not_exists(thumbnail_key)',
        ExpressionAttributeValues: {
          ':imgPrefix': 'IMG#',
        },
        ProjectionExpression: 'PK, SK, id, storage_key',
        ExclusiveStartKey: lastKey,
      }),
    );

    for (const item of resp.Items ?? []) {
      results.push(item as unknown as ImageRecord);
    }
    lastKey = resp.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (lastKey);

  return results;
}

async function processImage(record: ImageRecord): Promise<boolean> {
  const { PK, SK, id, storage_key } = record;
  const thumbnailKey = storage_key.replace(/^images\//, 'thumbnails/');

  console.log(`  [${id}] ${storage_key}`);

  if (DRY_RUN) {
    console.log(`    → (dry run) would generate thumbnail: ${thumbnailKey}`);
    return true;
  }

  try {
    // Download original
    const getResult = await s3.send(
      new GetObjectCommand({ Bucket: IMAGES_BUCKET, Key: storage_key }),
    );
    if (!getResult.Body) {
      console.log(`    → SKIP: empty body`);
      return false;
    }
    const inputBuffer = Buffer.from(await getResult.Body.transformToByteArray());

    // Generate thumbnail
    const thumbnailBuffer = await sharp(inputBuffer)
      .resize(THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT, { fit: 'cover', position: 'centre' })
      .jpeg({ quality: THUMBNAIL_QUALITY })
      .toBuffer();

    // Upload thumbnail
    await s3.send(
      new PutObjectCommand({
        Bucket: THUMBNAILS_BUCKET,
        Key: thumbnailKey,
        Body: thumbnailBuffer,
        ContentType: 'image/jpeg',
      }),
    );

    // Update DynamoDB
    await ddb.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { PK, SK },
        UpdateExpression: 'SET thumbnail_key = :key',
        ExpressionAttributeValues: { ':key': thumbnailKey },
        ConditionExpression: 'attribute_exists(PK)',
      }),
    );

    console.log(`    → OK (${thumbnailBuffer.length} bytes)`);
    return true;
  } catch (err) {
    console.error(`    → FAILED:`, err instanceof Error ? err.message : err);
    return false;
  }
}

async function main() {
  console.log('[backfill] Scanning for images without thumbnails...');
  const records = await scanImagesWithoutThumbnails();
  console.log(`[backfill] Found ${records.length} image(s) without thumbnail_key\n`);

  if (records.length === 0) {
    console.log('[backfill] Nothing to do.');
    return;
  }

  let success = 0;
  let failed = 0;
  const BATCH_SIZE = 5;

  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(batch.map(processImage));
    for (const ok of results) {
      if (ok) success++;
      else failed++;
    }
    console.log(`[backfill] Progress: ${Math.min(i + BATCH_SIZE, records.length)}/${records.length}`);
  }

  console.log(`\n[backfill] Done: ${success} succeeded, ${failed} failed`);
}

main().catch((err) => {
  console.error('[backfill] Fatal error:', err);
  process.exit(1);
});

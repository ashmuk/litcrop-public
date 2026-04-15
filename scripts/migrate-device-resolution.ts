/**
 * scripts/migrate-device-resolution.ts
 * Normalizes legacy `resolution_width` / `resolution_height` device records to a
 * single `resolution` string (e.g. "1920x1080") matching the schema #395 expects.
 *
 * Any DEVICE#* record whose `resolution` is missing or fails /^\d+x\d+$/ is
 * rewritten to '1920x1080' (the API default). Existing legacy width/height
 * pairs, when present, take precedence over the default.
 *
 * Run:     npx tsx scripts/migrate-device-resolution.ts
 * Dry run: DRY_RUN=1 npx tsx scripts/migrate-device-resolution.ts
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

const TABLE_NAME = process.env['TABLE_NAME'] ?? 'litcrop-poc';
const AWS_REGION = process.env['AWS_REGION'] ?? 'ap-northeast-1';
const DRY_RUN = process.env['DRY_RUN'] !== '0';
const DEFAULT_RESOLUTION = '1920x1080';
const RESOLUTION_RE = /^\d+x\d+$/;

console.log(`[migrate-device-resolution] Table: ${TABLE_NAME} (${AWS_REGION})`);
console.log(`[migrate-device-resolution] Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);

const client = new DynamoDBClient({ region: AWS_REGION });
const ddb = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

function deriveResolution(item: Record<string, unknown>): string | null {
  const current = item['resolution'];
  if (typeof current === 'string' && RESOLUTION_RE.test(current)) {
    return null;
  }
  const w = item['resolution_width'];
  const h = item['resolution_height'];
  if (typeof w === 'number' && typeof h === 'number' && w > 0 && h > 0) {
    return `${w}x${h}`;
  }
  return DEFAULT_RESOLUTION;
}

async function migrate() {
  let updated = 0;
  let skipped = 0;
  let lastKey: Record<string, unknown> | undefined;

  do {
    const scan = await ddb.send(new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: 'begins_with(SK, :dev)',
      ExpressionAttributeValues: { ':dev': 'DEVICE#' },
      ExclusiveStartKey: lastKey,
    }));

    for (const item of scan.Items ?? []) {
      const next = deriveResolution(item);
      if (next === null) {
        skipped++;
        continue;
      }

      console.log(`  ${item['PK']} / ${item['SK']}: resolution → ${next}`);

      if (!DRY_RUN) {
        await ddb.send(new UpdateCommand({
          TableName: TABLE_NAME,
          Key: { PK: item['PK'], SK: item['SK'] },
          UpdateExpression: 'SET #r = :r REMOVE resolution_width, resolution_height',
          ExpressionAttributeNames: { '#r': 'resolution' },
          ExpressionAttributeValues: { ':r': next },
        }));
      }
      updated++;
    }

    lastKey = scan.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (lastKey);

  console.log(`\n[migrate-device-resolution] Done. Updated: ${updated}, skipped: ${skipped}.`);
  if (DRY_RUN) console.log('[migrate-device-resolution] This was a dry run — no changes written.');
}

migrate().catch((err) => {
  console.error('[migrate-device-resolution] FAILED:', err);
  process.exit(1);
});

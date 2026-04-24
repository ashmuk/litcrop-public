/**
 * scripts/migrate-wave-e-promote-legacy-crops.ts
 *
 * Wave E step 1 (DESIGN-279 §6). Scans every bed across all farms; each bed
 * with inline `crop_type` and no `completed_at` gets a persisted BedCrop row
 * carrying `created_from_legacy: true`. Idempotent via that marker.
 *
 * Run (dry-run):  DRY_RUN=1 npx tsx scripts/migrate-wave-e-promote-legacy-crops.ts
 * Run (live):     npx tsx scripts/migrate-wave-e-promote-legacy-crops.ts
 *
 * Env: TABLE_NAME (default: litcrop-poc), AWS_REGION (default: ap-northeast-1).
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import type { Bed } from '@litcrop/shared';
import { itemToBed } from '../src/api/src/services/repositories/_mappers';
import { promoteLegacyCropForBed, type SkipReason } from '../src/api/src/services/migrations/wave-e-promote-legacy';

const TABLE_NAME = process.env['TABLE_NAME'] ?? 'litcrop-poc';
const AWS_REGION = process.env['AWS_REGION'] ?? 'ap-northeast-1';
const DRY_RUN = process.env['DRY_RUN'] === '1';

console.log(`[wave-e-promote] Table: ${TABLE_NAME} (${AWS_REGION})`);
console.log(`[wave-e-promote] Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);

const client = new DynamoDBClient({ region: AWS_REGION });
const ddb = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

/**
 * Scan every bed row (`SK` starts with `BED#`). Bed rows use composite SK
 * `BED#<row>#<col>#<bedId>`; BedCrop rows use `CROP#…` so the `BED#` prefix
 * alone is sufficient to exclude them.
 */
async function scanBeds(): Promise<Bed[]> {
  const beds: Bed[] = [];
  let lastKey: Record<string, unknown> | undefined;
  let pages = 0;

  do {
    const scan = await ddb.send(new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: 'begins_with(SK, :bed)',
      ExpressionAttributeValues: { ':bed': 'BED#' },
      ExclusiveStartKey: lastKey,
    }));

    for (const item of scan.Items ?? []) {
      const farmId = item['farm_id'] as string | undefined;
      const bedId = item['id'] as string | undefined;
      if (!farmId || !bedId) {
        console.error(`[wave-e-promote] SKIP malformed bed row (missing farm_id or id): PK=${item['PK']} SK=${item['SK']}`);
        continue;
      }
      beds.push(itemToBed(item, farmId, bedId));
    }

    lastKey = scan.LastEvaluatedKey;
    pages += 1;
  } while (lastKey);

  console.log(`[wave-e-promote] Scanned ${beds.length} bed rows across ${pages} page(s).`);
  return beds;
}

async function main() {
  const beds = await scanBeds();

  // Keyed `Record<'promoted' | SkipReason, number>` so TypeScript flags a
  // missing initializer if SkipReason ever gains a new variant.
  const counts: Record<'promoted' | SkipReason, number> = {
    promoted: 0,
    'no-inline-crop': 0,
    'bed-completed': 0,
    'already-has-legacy': 0,
    'has-real-bedcrops': 0,
  };

  const HEARTBEAT_EVERY = 50;
  for (let i = 0; i < beds.length; i++) {
    const bed = beds[i];
    const result = await promoteLegacyCropForBed(bed, { dryRun: DRY_RUN })
      .catch((err) => {
        console.error(`[wave-e-promote] FAILED bed=${bed.id}:`, err);
        return null;
      });
    if (!result) continue;

    if (result.action === 'promoted') {
      counts.promoted += 1;
      console.log(`  ${DRY_RUN ? '[DRY]' : '[OK] '} PROMOTE bed=${bed.id} → crop=${result.bedCropId} (${bed.crop_type})`);
    } else {
      counts[result.reason] += 1;
    }

    // Heartbeat so operators can tell the job is making progress on large tables.
    const done = i + 1;
    if (done % HEARTBEAT_EVERY === 0) {
      console.log(`[wave-e-promote] progress: ${done}/${beds.length} processed (promoted=${counts.promoted})`);
    }
  }

  console.log('[wave-e-promote] Summary:');
  console.log(`  Promoted          : ${counts.promoted}${DRY_RUN ? ' (dry-run — nothing written)' : ''}`);
  console.log(`  Skipped no-inline : ${counts['no-inline-crop']}`);
  console.log(`  Skipped completed : ${counts['bed-completed']}`);
  console.log(`  Skipped already   : ${counts['already-has-legacy']} (previous run already promoted)`);
  console.log(`  Skipped real-crop : ${counts['has-real-bedcrops']} (bed opted out of legacy via real BedCrop)`);
}

main().catch((err) => {
  console.error('[wave-e-promote] fatal:', err);
  process.exit(1);
});

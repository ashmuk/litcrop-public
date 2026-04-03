/**
 * scripts/migrate-roles.ts
 * Migrates DynamoDB role values: manager → owner, observer → staff.
 * Scans all FARM_MEMBER# and MEMBER# records and updates in-place.
 *
 * Run: npx tsx scripts/migrate-roles.ts
 * Dry run: DRY_RUN=1 npx tsx scripts/migrate-roles.ts
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

const TABLE_NAME = process.env['TABLE_NAME'] ?? 'litcrop-poc';
const AWS_REGION = process.env['AWS_REGION'] ?? 'ap-northeast-1';
const DRY_RUN = process.env['DRY_RUN'] === '1';

const ROLE_MAP: Record<string, string> = {
  manager: 'owner',
  observer: 'staff',
};

console.log(`[migrate-roles] Table: ${TABLE_NAME} (${AWS_REGION})`);
console.log(`[migrate-roles] Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);

const client = new DynamoDBClient({ region: AWS_REGION });
const ddb = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

async function migrate() {
  let updated = 0;
  let skipped = 0;
  let lastKey: Record<string, unknown> | undefined;

  do {
    const scan = await ddb.send(new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: 'contains(SK, :fm) OR contains(SK, :m)',
      ExpressionAttributeValues: { ':fm': 'FARM_MEMBER#', ':m': 'MEMBER#' },
      ExclusiveStartKey: lastKey,
    }));

    for (const item of scan.Items ?? []) {
      const role = item['role'] as string | undefined;
      if (!role || !ROLE_MAP[role]) {
        skipped++;
        continue;
      }

      const newRole = ROLE_MAP[role];
      console.log(`  ${item['PK']} / ${item['SK']}: ${role} → ${newRole}`);

      if (!DRY_RUN) {
        await ddb.send(new UpdateCommand({
          TableName: TABLE_NAME,
          Key: { PK: item['PK'], SK: item['SK'] },
          UpdateExpression: 'SET #role = :newRole',
          ExpressionAttributeNames: { '#role': 'role' },
          ExpressionAttributeValues: { ':newRole': newRole },
        }));
      }
      updated++;
    }

    lastKey = scan.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (lastKey);

  // Also migrate preferred_role in user profiles
  let profileLastKey: Record<string, unknown> | undefined;
  let profileUpdated = 0;

  do {
    const scan = await ddb.send(new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: 'contains(SK, :settings)',
      ExpressionAttributeValues: { ':settings': '#PROFILE' },
      ExclusiveStartKey: profileLastKey,
    }));

    for (const item of scan.Items ?? []) {
      const prefRole = item['preferred_role'] as string | undefined;
      if (!prefRole || !ROLE_MAP[prefRole]) continue;

      const newRole = ROLE_MAP[prefRole];
      console.log(`  ${item['PK']} / ${item['SK']}: preferred_role ${prefRole} → ${newRole}`);

      if (!DRY_RUN) {
        await ddb.send(new UpdateCommand({
          TableName: TABLE_NAME,
          Key: { PK: item['PK'], SK: item['SK'] },
          UpdateExpression: 'SET #pr = :newRole',
          ExpressionAttributeNames: { '#pr': 'preferred_role' },
          ExpressionAttributeValues: { ':newRole': newRole },
        }));
      }
      profileUpdated++;
    }

    profileLastKey = scan.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (profileLastKey);

  console.log(`\n[migrate-roles] Done. Memberships: ${updated} updated, ${skipped} skipped. Profiles: ${profileUpdated} updated.`);
  if (DRY_RUN) console.log('[migrate-roles] This was a dry run — no changes written.');
}

migrate().catch((err) => {
  console.error('[migrate-roles] FAILED:', err);
  process.exit(1);
});

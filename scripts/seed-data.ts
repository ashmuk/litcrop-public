/**
 * scripts/seed-data.ts
 * Populates DynamoDB with LitCrop seed data (Farm → Bed model).
 * Idempotent — uses PutItem which overwrites existing items.
 *
 * Run: npx tsx scripts/seed-data.ts
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';

// ── Config ───────────────────────────────────────────────────────

const TABLE_NAME = process.env['TABLE_NAME'] ?? 'litcrop-poc';
const AWS_REGION = process.env['AWS_REGION'] ?? 'ap-northeast-1';
const AWS_PROFILE = process.env['AWS_PROFILE'] ?? 'litcrop';

console.log(`[seed] Table: ${TABLE_NAME} (${AWS_REGION})`);
console.log(`[seed] Profile: ${AWS_PROFILE}`);

// ── Client ───────────────────────────────────────────────────────

const client = new DynamoDBClient({ region: AWS_REGION });
const ddb = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

// ── Deterministic IDs ────────────────────────────────────────────

const DEMO_USER_ID = 'demo-admin-user-00000000000000000001';
const FARM_ID   = '00000000-0000-0000-0000-000000000001';

// 3×2 grid: 6 beds (reusing existing BED_ UUIDs + former PLOT_ UUIDs)
const BED_A1_ID = '00000000-0000-0000-0000-000000000031';
const BED_A2_ID = '00000000-0000-0000-0000-000000000032';
const BED_B1_ID = '00000000-0000-0000-0000-000000000033';
const BED_B2_ID = '00000000-0000-0000-0000-000000000034';
const BED_C1_ID = '00000000-0000-0000-0000-000000000035';
const BED_C2_ID = '00000000-0000-0000-0000-000000000036';

// ── Key builders (mirror DynamoRepository) ───────────────────────

const pk = {
  farm: (id: string) => `FARM#${id}`,
  bed:  (id: string) => `BED#${id}`,
};

const sk = {
  meta: () => '#META',
  bed: (row: number, col: number, id: string) =>
    `BED#${row.toString().padStart(2, '0')}#${col.toString().padStart(2, '0')}#${id}`,
};

// ── Seed items ───────────────────────────────────────────────────

async function put(item: Record<string, unknown>) {
  await ddb.send(new PutCommand({ TableName: TABLE_NAME, Item: item }));
}

async function seedFarm() {
  const FARM_NAME = 'LitCrop Demo Farm';
  const CREATED_AT = '2026-03-17T00:00:00Z';

  console.log('[seed] Farm: LitCrop Demo Farm (3×2 grid)');
  await put({
    PK: pk.farm(FARM_ID),
    SK: sk.meta(),
    id: FARM_ID,
    user_id: DEMO_USER_ID,
    name: FARM_NAME,
    description: 'Demonstration farm in Nagano Prefecture, Japan.',
    latitude: 36.0,
    longitude: 138.3,
    elevation_m: 760,
    climate_zone: 'USDA 7a',
    locale: 'en',
    theme: 'system',
    grid_rows: 3,
    grid_cols: 2,
    created_at: CREATED_AT,
  });

  // Create FARM_MEMBER record: USER# → FARM_MEMBER# (user can list their farms)
  console.log('[seed] FarmMember: demo user → LitCrop Demo Farm (manager)');
  await put({
    PK: `USER#${DEMO_USER_ID}`,
    SK: `FARM_MEMBER#${FARM_ID}`,
    farm_id: FARM_ID,
    role: 'owner',
    joined_at: CREATED_AT,
  });

  // Create MEMBER record: FARM# → MEMBER# (farm can list its members)
  await put({
    PK: pk.farm(FARM_ID),
    SK: `MEMBER#${DEMO_USER_ID}`,
    user_id: DEMO_USER_ID,
    role: 'owner',
    joined_at: CREATED_AT,
  });
}

async function seedBeds() {
  const beds = [
    {
      id: BED_A1_ID,
      row: 1,
      col: 1,
      name: 'A1',
      crop_type: 'Tomato',
      crop_variety: 'Cherry Tomato',
      planted_at: '2026-03-01',
      expected_harvest: '2026-07-31',
      notes: 'Indeterminate variety — stake required.',
      latest_status: 'no_data',
    },
    {
      id: BED_A2_ID,
      row: 1,
      col: 2,
      name: 'A2',
      crop_type: 'Basil',
      crop_variety: 'Sweet Basil',
      planted_at: '2026-03-15',
      expected_harvest: '2026-09-30',
      notes: null,
      latest_status: 'no_data',
    },
    {
      id: BED_B1_ID,
      row: 2,
      col: 1,
      name: 'B1',
      crop_type: 'Cucumber',
      crop_variety: 'Japanese Cucumber',
      planted_at: '2026-03-10',
      expected_harvest: '2026-08-31',
      notes: null,
      latest_status: 'no_data',
    },
    {
      id: BED_B2_ID,
      row: 2,
      col: 2,
      name: 'B2',
      crop_type: 'Lettuce',
      crop_variety: 'Butterhead Lettuce',
      planted_at: '2026-02-15',
      expected_harvest: '2026-05-31',
      notes: 'Succession plant every 3 weeks.',
      latest_status: 'no_data',
    },
    {
      id: BED_C1_ID,
      row: 3,
      col: 1,
      name: 'C1',
      crop_type: 'Strawberry',
      crop_variety: 'Tochiotome',
      planted_at: '2025-10-01',
      expected_harvest: '2026-06-30',
      notes: 'Perennial planting.',
      latest_status: 'no_data',
    },
    {
      id: BED_C2_ID,
      row: 3,
      col: 2,
      name: 'C2',
      crop_type: 'Eggplant',
      crop_variety: 'Nagasaki Long Eggplant',
      planted_at: '2026-03-20',
      expected_harvest: '2026-09-30',
      notes: null,
      latest_status: 'no_data',
    },
  ];

  for (const bed of beds) {
    console.log(`[seed] Bed: ${bed.name} (${bed.crop_type} — ${bed.crop_variety})`);
    await put({
      PK: pk.farm(FARM_ID),
      SK: sk.bed(bed.row, bed.col, bed.id),
      // GSI1: direct bed lookup
      GSI1PK: pk.bed(bed.id),
      GSI1SK: '#META',
      // Entity fields
      id: bed.id,
      farm_id: FARM_ID,
      row: bed.row,
      col: bed.col,
      name: bed.name,
      crop_type: bed.crop_type,
      crop_variety: bed.crop_variety,
      planted_at: bed.planted_at,
      expected_harvest: bed.expected_harvest,
      ...(bed.notes ? { notes: bed.notes } : {}),
      latest_status: bed.latest_status,
    });
  }
}

// ── Main ─────────────────────────────────────────────────────────

async function main() {
  console.log('[seed] Starting seed...');

  await seedFarm();
  await seedBeds();

  console.log('[seed] Done! Seeded:');
  console.log('  - 1 farm: LitCrop Demo Farm (3×2 grid)');
  console.log(`  - 1 demo user membership (user: ${DEMO_USER_ID})`);
  console.log('  - 6 beds: A1 Cherry Tomato, A2 Basil, B1 Cucumber, B2 Lettuce, C1 Strawberry, C2 Eggplant');
}

main().catch((err) => {
  console.error('[seed] Error:', err);
  process.exit(1);
});

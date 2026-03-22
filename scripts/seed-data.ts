/**
 * scripts/seed-data.ts
 * Populates DynamoDB with LitCrop PoC seed data.
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
const FIELD_NORTH_ID = '00000000-0000-0000-0000-000000000011';
const FIELD_SOUTH_ID = '00000000-0000-0000-0000-000000000012';
const BED_A_ID  = '00000000-0000-0000-0000-000000000021'; // North Field
const BED_B_ID  = '00000000-0000-0000-0000-000000000022'; // North Field
const BED_C_ID  = '00000000-0000-0000-0000-000000000023'; // South Field
const PLOT_A1_ID = '00000000-0000-0000-0000-000000000031'; // Cherry Tomato
const PLOT_A2_ID = '00000000-0000-0000-0000-000000000032'; // Basil
const PLOT_B1_ID = '00000000-0000-0000-0000-000000000033'; // Cucumber
const PLOT_B2_ID = '00000000-0000-0000-0000-000000000034'; // Lettuce
const PLOT_C1_ID = '00000000-0000-0000-0000-000000000035'; // Strawberry
const PLOT_C2_ID = '00000000-0000-0000-0000-000000000036'; // Eggplant

// ── Key builders (mirror DynamoRepository) ───────────────────────

const pk = {
  farm:  (id: string) => `FARM#${id}`,
  field: (id: string) => `FIELD#${id}`,
  bed:   (id: string) => `BED#${id}`,
  plot:  (id: string) => `PLOT#${id}`,
};

const sk = {
  meta: () => '#META',
  field: (pos: number, id: string) => `FIELD#${String(pos).padStart(6, '0')}#${id}`,
  bed:   (pos: number, id: string) => `BED#${String(pos).padStart(6, '0')}#${id}`,
  plot:  (id: string) => `PLOT#${id}`,
};

// ── Seed items ───────────────────────────────────────────────────

async function put(item: Record<string, unknown>) {
  await ddb.send(new PutCommand({ TableName: TABLE_NAME, Item: item }));
}

async function seedFarm() {
  const FARM_NAME = 'LitCrop Demo Farm';
  const CREATED_AT = '2026-03-17T00:00:00Z';

  console.log('[seed] Farm: LitCrop Demo Farm');
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
    created_at: CREATED_AT,
  });

  // Create FARM_MEMBER record: USER# → FARM_MEMBER# (user can list their farms)
  console.log('[seed] FarmMember: demo user → LitCrop Demo Farm (manager)');
  await put({
    PK: `USER#${DEMO_USER_ID}`,
    SK: `FARM_MEMBER#${FARM_ID}`,
    farm_id: FARM_ID,
    role: 'manager',
    joined_at: CREATED_AT,
  });

  // Create MEMBER record: FARM# → MEMBER# (farm can list its members)
  await put({
    PK: pk.farm(FARM_ID),
    SK: `MEMBER#${DEMO_USER_ID}`,
    user_id: DEMO_USER_ID,
    role: 'manager',
    joined_at: CREATED_AT,
  });
}

async function seedFields() {
  console.log('[seed] Field: North Field');
  await put({
    PK: pk.farm(FARM_ID),
    SK: sk.field(1, FIELD_NORTH_ID),
    id: FIELD_NORTH_ID,
    farm_id: FARM_ID,
    name: 'North Field',
    position: 1,
  });

  console.log('[seed] Field: South Field');
  await put({
    PK: pk.farm(FARM_ID),
    SK: sk.field(2, FIELD_SOUTH_ID),
    id: FIELD_SOUTH_ID,
    farm_id: FARM_ID,
    name: 'South Field',
    position: 2,
  });
}

async function seedBeds() {
  console.log('[seed] Bed: Bed A (North Field)');
  await put({
    PK: pk.field(FIELD_NORTH_ID),
    SK: sk.bed(1, BED_A_ID),
    id: BED_A_ID,
    field_id: FIELD_NORTH_ID,
    name: 'Bed A',
    position: 1,
  });

  console.log('[seed] Bed: Bed B (North Field)');
  await put({
    PK: pk.field(FIELD_NORTH_ID),
    SK: sk.bed(2, BED_B_ID),
    id: BED_B_ID,
    field_id: FIELD_NORTH_ID,
    name: 'Bed B',
    position: 2,
  });

  console.log('[seed] Bed: Bed C (South Field)');
  await put({
    PK: pk.field(FIELD_SOUTH_ID),
    SK: sk.bed(1, BED_C_ID),
    id: BED_C_ID,
    field_id: FIELD_SOUTH_ID,
    name: 'Bed C',
    position: 1,
  });
}

async function seedPlots() {
  const plots = [
    {
      id: PLOT_A1_ID,
      bed_id: BED_A_ID,
      label: 'A1',
      crop_type: 'Tomato',
      crop_variety: 'Cherry Tomato',
      planted_at: '2026-03-01',
      expected_harvest: '2026-07-31',
      notes: 'Indeterminate variety — stake required.',
      latest_status: 'no_data',
      farm_id: FARM_ID,
    },
    {
      id: PLOT_A2_ID,
      bed_id: BED_A_ID,
      label: 'A2',
      crop_type: 'Basil',
      crop_variety: 'Sweet Basil',
      planted_at: '2026-03-15',
      expected_harvest: '2026-09-30',
      notes: null,
      latest_status: 'no_data',
      farm_id: FARM_ID,
    },
    {
      id: PLOT_B1_ID,
      bed_id: BED_B_ID,
      label: 'B1',
      crop_type: 'Cucumber',
      crop_variety: 'Japanese Cucumber',
      planted_at: '2026-03-10',
      expected_harvest: '2026-08-31',
      notes: null,
      latest_status: 'no_data',
      farm_id: FARM_ID,
    },
    {
      id: PLOT_B2_ID,
      bed_id: BED_B_ID,
      label: 'B2',
      crop_type: 'Lettuce',
      crop_variety: 'Butterhead Lettuce',
      planted_at: '2026-02-15',
      expected_harvest: '2026-05-31',
      notes: 'Succession plant every 3 weeks.',
      latest_status: 'no_data',
      farm_id: FARM_ID,
    },
    {
      id: PLOT_C1_ID,
      bed_id: BED_C_ID,
      label: 'C1',
      crop_type: 'Strawberry',
      crop_variety: 'Tochiotome',
      planted_at: '2025-10-01',
      expected_harvest: '2026-06-30',
      notes: 'Perennial planting.',
      latest_status: 'no_data',
      farm_id: FARM_ID,
    },
    {
      id: PLOT_C2_ID,
      bed_id: BED_C_ID,
      label: 'C2',
      crop_type: 'Eggplant',
      crop_variety: 'Nagasaki Long Eggplant',
      planted_at: '2026-03-20',
      expected_harvest: '2026-09-30',
      notes: null,
      latest_status: 'no_data',
      farm_id: FARM_ID,
    },
  ];

  for (const plot of plots) {
    console.log(`[seed] Plot: ${plot.label} (${plot.crop_type} — ${plot.crop_variety})`);
    await put({
      PK: pk.bed(plot.bed_id),
      SK: sk.plot(plot.id),
      // GSI1: direct plot lookup
      GSI1PK: pk.plot(plot.id),
      GSI1SK: '#META',
      // GSI2: all plots for farm (Farm Overview)
      GSI2PK: pk.farm(FARM_ID),
      GSI2SK: pk.plot(plot.id),
      // Entity fields
      id: plot.id,
      bed_id: plot.bed_id,
      label: plot.label,
      crop_type: plot.crop_type,
      crop_variety: plot.crop_variety,
      planted_at: plot.planted_at,
      expected_harvest: plot.expected_harvest,
      ...(plot.notes ? { notes: plot.notes } : {}),
      latest_status: plot.latest_status,
      farm_id: FARM_ID,
    });
  }
}

// ── Main ─────────────────────────────────────────────────────────

async function main() {
  console.log('[seed] Starting seed...');

  await seedFarm();
  await seedFields();
  await seedBeds();
  await seedPlots();

  console.log('[seed] Done! Seeded:');
  console.log('  - 1 farm: LitCrop Demo Farm');
  console.log(`  - 1 demo user membership (user: ${DEMO_USER_ID})`);
  console.log('  - 2 fields: North Field, South Field');
  console.log('  - 3 beds: Bed A, Bed B, Bed C');
  console.log('  - 6 plots: A1 Cherry Tomato, A2 Basil, B1 Cucumber, B2 Lettuce, C1 Strawberry, C2 Eggplant');
}

main().catch((err) => {
  console.error('[seed] Error:', err);
  process.exit(1);
});

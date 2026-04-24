import { describe, it, expect, beforeEach } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import {
  DynamoDBDocumentClient,
  QueryCommand,
  PutCommand,
  DeleteCommand,
} from '@aws-sdk/lib-dynamodb';
import { DynamoRepository } from '../../services/dynamodb';
import { NotFoundError } from '../../errors';
import type { BedCrop } from '@litcrop/shared';

const ddbMock = mockClient(DynamoDBDocumentClient);

beforeEach(() => {
  ddbMock.reset();
});

const repo = new DynamoRepository();

const FARM_ID = 'f0000000-0000-0000-0000-000000000001';
const BED_ID = 'bd000000-0000-0000-0000-000000000001';
const CROP_ID = 'c0000000-0000-0000-0000-000000000001';

const cropItem: Record<string, unknown> = {
  PK: `FARM#${FARM_ID}`,
  SK: `CROP#${BED_ID}#${CROP_ID}`,
  GSI1PK: `BED#${BED_ID}`,
  GSI1SK: `CROP#${CROP_ID}`,
  id: CROP_ID,
  bed_id: BED_ID,
  farm_id: FARM_ID,
  crop_type: 'tomato',
  crop_variety: 'Brandywine',
  planted_at: '2026-04-01',
  expected_harvest: '2026-07-15',
  status: 'active',
  created_by: 'user-1',
  created_at: '2026-04-01T10:00:00Z',
  updated_at: '2026-04-01T10:00:00Z',
};

// ── listBedCropsByBed — S4-2 GSI1 prefix guardrail ──────────────

describe('listBedCropsByBed', () => {
  it('issues a GSI1 query with mandatory begins_with(GSI1SK, CROP#) filter', async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [cropItem] });

    await repo.listBedCropsByBed(BED_ID);

    const call = ddbMock.commandCalls(QueryCommand)[0];
    const input = call.args[0].input;
    expect(input.IndexName).toBe('GSI1');
    expect(input.KeyConditionExpression).toBe('GSI1PK = :pk AND begins_with(GSI1SK, :prefix)');
    expect(input.ExpressionAttributeValues).toMatchObject({
      ':pk': `BED#${BED_ID}`,
      ':prefix': 'CROP#',
    });
  });

  it('maps DDB items to BedCrop shape', async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [cropItem] });

    const crops = await repo.listBedCropsByBed(BED_ID);

    expect(crops).toHaveLength(1);
    expect(crops[0]).toMatchObject({
      id: CROP_ID,
      bed_id: BED_ID,
      farm_id: FARM_ID,
      crop_type: 'tomato',
      status: 'active',
    });
  });

  it('returns empty array when no crops exist', async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [] });

    const crops = await repo.listBedCropsByBed(BED_ID);

    expect(crops).toEqual([]);
  });
});

// ── getBedCrop ──────────────────────────────────────────────────

describe('getBedCrop', () => {
  it('throws NotFoundError when no matching crop', async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [] });

    await expect(repo.getBedCrop(BED_ID, CROP_ID)).rejects.toThrow(NotFoundError);
  });

  it('returns mapped BedCrop when found', async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [cropItem] });

    const crop = await repo.getBedCrop(BED_ID, CROP_ID);

    expect(crop.id).toBe(CROP_ID);
    expect(crop.crop_type).toBe('tomato');
  });
});

// ── createBedCrop ───────────────────────────────────────────────

describe('createBedCrop', () => {
  it('writes correct PK/SK/GSI1PK/GSI1SK + all BedCrop fields', async () => {
    ddbMock.on(PutCommand).resolves({});

    const bedCrop: BedCrop = {
      id: CROP_ID,
      bed_id: BED_ID,
      farm_id: FARM_ID,
      crop_type: 'lettuce',
      status: 'planned',
      created_by: 'user-1',
      created_at: '2026-04-23T10:00:00Z',
      updated_at: '2026-04-23T10:00:00Z',
    };

    await repo.createBedCrop(bedCrop);

    const call = ddbMock.commandCalls(PutCommand)[0];
    const item = call.args[0].input.Item!;
    expect(item.PK).toBe(`FARM#${FARM_ID}`);
    expect(item.SK).toBe(`CROP#${BED_ID}#${CROP_ID}`);
    expect(item.GSI1PK).toBe(`BED#${BED_ID}`);
    expect(item.GSI1SK).toBe(`CROP#${CROP_ID}`);
    expect(item.crop_type).toBe('lettuce');
    expect(item.status).toBe('planned');
  });
});

// ── deleteBedCrop ───────────────────────────────────────────────

describe('deleteBedCrop', () => {
  it('deletes with the correct primary key tuple', async () => {
    ddbMock.on(DeleteCommand).resolves({});

    await repo.deleteBedCrop(FARM_ID, BED_ID, CROP_ID);

    const call = ddbMock.commandCalls(DeleteCommand)[0];
    expect(call.args[0].input.Key).toEqual({
      PK: `FARM#${FARM_ID}`,
      SK: `CROP#${BED_ID}#${CROP_ID}`,
    });
  });
});

// ── getActiveCropForBed — lazy-materialize (design §6) ───────────

describe('getActiveCropForBed', () => {
  const legacyBedItem: Record<string, unknown> = {
    PK: `FARM#${FARM_ID}`,
    SK: `BED#01#01#${BED_ID}`,
    GSI1PK: `BED#${BED_ID}`,
    GSI1SK: '#META',
    id: BED_ID,
    farm_id: FARM_ID,
    row: 1,
    col: 1,
    name: 'A1',
    crop_type: 'eggplant',
    planted_at: '2026-03-15',
    latest_status: 'healthy',
  };

  it('returns the real active BedCrop when one exists', async () => {
    ddbMock
      .on(QueryCommand, { IndexName: 'GSI1' })
      .resolvesOnce({ Items: [cropItem] });

    const crop = await repo.getActiveCropForBed(BED_ID);

    expect(crop).not.toBeNull();
    expect(crop?.id).toBe(CROP_ID);
    expect(crop?.status).toBe('active');
  });

  it('synthesizes a virtual crop from legacy Bed fields when no real crops exist', async () => {
    ddbMock
      .on(QueryCommand)
      .resolvesOnce({ Items: [] })           // listBedCropsByBed → no real crops
      .resolvesOnce({ Items: [legacyBedItem] }); // getBedById → legacy crop_type present

    const crop = await repo.getActiveCropForBed(BED_ID);

    expect(crop).not.toBeNull();
    expect(crop?.id).toBe(`bed-legacy-${BED_ID}`);
    expect(crop?.crop_type).toBe('eggplant');
    expect(crop?.status).toBe('active');
    expect(crop?.created_by).toBe('system');
  });

  it('returns null when neither real crops nor legacy crop_type exist', async () => {
    const bareBedItem = { ...legacyBedItem, crop_type: undefined };
    ddbMock
      .on(QueryCommand)
      .resolvesOnce({ Items: [] })
      .resolvesOnce({ Items: [bareBedItem] });

    const crop = await repo.getActiveCropForBed(BED_ID);

    expect(crop).toBeNull();
  });

  it('returns null when legacy bed has crop_type but also completed_at (cycle already done)', async () => {
    const completedBedItem = { ...legacyBedItem, completed_at: '2026-02-01' };
    ddbMock
      .on(QueryCommand)
      .resolvesOnce({ Items: [] })
      .resolvesOnce({ Items: [completedBedItem] });

    const crop = await repo.getActiveCropForBed(BED_ID);

    expect(crop).toBeNull();
  });
});

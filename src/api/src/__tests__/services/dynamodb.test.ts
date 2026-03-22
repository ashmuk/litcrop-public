import { describe, it, expect, beforeEach } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
  PutCommand,
  UpdateCommand,
  TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import { DynamoRepository } from '../../services/dynamodb';
import { NotFoundError } from '../../errors';

const ddbMock = mockClient(DynamoDBDocumentClient);

beforeEach(() => {
  ddbMock.reset();
});

const repo = new DynamoRepository();

// ── Fixtures ─────────────────────────────────────────────────────

const FARM_ID = 'f0000000-0000-0000-0000-000000000001';
const FIELD_ID = 'fd000000-0000-0000-0000-000000000001';
const BED_ID = 'bd000000-0000-0000-0000-000000000001';
const PLOT_ID = 'a0000000-0000-0000-0000-000000000001';
const IMAGE_ID = 'e0000000-0000-0000-0000-000000000001';
const TAG_ID = 't0000000-0000-0000-0000-000000000001';

const farmItem = {
  PK: `FARM#${FARM_ID}`,
  SK: '#META',
  id: FARM_ID,
  name: 'Test Farm',
  latitude: 36.0,
  longitude: 138.3,
  locale: 'en',
  theme: 'system',
  created_at: '2026-03-17T00:00:00.000Z',
};

const fieldItem = {
  PK: `FARM#${FARM_ID}`,
  SK: `FIELD#000001#${FIELD_ID}`,
  name: 'Field A',
  position: 1,
};

const bedItem = {
  PK: `FIELD#${FIELD_ID}`,
  SK: `BED#000001#${BED_ID}`,
  name: 'Bed 1',
  position: 1,
};

const plotItem = {
  PK: `BED#${BED_ID}`,
  SK: `PLOT#${PLOT_ID}`,
  GSI1PK: `PLOT#${PLOT_ID}`,
  GSI1SK: '#META',
  GSI2PK: `FARM#${FARM_ID}`,
  GSI2SK: `PLOT#${PLOT_ID}`,
  bed_id: BED_ID,
  farm_id: FARM_ID,
  label: 'Plot 1',
  crop_type: 'tomato',
  crop_variety: 'Cherry',
  planted_at: '2026-03-01',
  expected_harvest: '2026-07-01',
  latest_status: 'no_data',
};

const imageItem = {
  PK: `PLOT#${PLOT_ID}`,
  SK: `IMG#2026-03-17T10:00:00.000Z#${IMAGE_ID}`,
  GSI1PK: `IMG#${IMAGE_ID}`,
  GSI1SK: '#META',
  plot_id: PLOT_ID,
  node_id: 'cam-001',
  captured_at: '2026-03-17T10:00:00.000Z',
  uploaded_at: '2026-03-17T10:00:05.000Z',
  storage_key: `images/${FARM_ID}/${PLOT_ID}/2026/03/17/${IMAGE_ID}.jpg`,
  trigger: 'scheduled',
  content_type: 'image/jpeg',
  size_bytes: 102400,
};

// ── AP-1: getFarm ─────────────────────────────────────────────────

describe('getFarm', () => {
  it('returns mapped Farm on success', async () => {
    ddbMock.on(GetCommand).resolves({ Item: farmItem });
    const farm = await repo.getFarm(FARM_ID);
    expect(farm.id).toBe(FARM_ID);
    expect(farm.name).toBe('Test Farm');
    expect(farm.latitude).toBe(36.0);
    expect(farm.locale).toBe('en');
  });

  it('throws NotFoundError when item missing', async () => {
    ddbMock.on(GetCommand).resolves({ Item: undefined });
    await expect(repo.getFarm(FARM_ID)).rejects.toThrow(NotFoundError);
  });

  it('uses correct PK/SK keys', async () => {
    ddbMock.on(GetCommand).resolves({ Item: farmItem });
    await repo.getFarm(FARM_ID);
    const calls = ddbMock.commandCalls(GetCommand);
    expect(calls[0].args[0].input.Key).toEqual({ PK: `FARM#${FARM_ID}`, SK: '#META' });
  });
});

// ── AP-2: getFieldsForFarm ────────────────────────────────────────

describe('getFieldsForFarm', () => {
  it('returns fields with IDs extracted from SK', async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [fieldItem] });
    const fields = await repo.getFieldsForFarm(FARM_ID);
    expect(fields).toHaveLength(1);
    expect(fields[0].id).toBe(FIELD_ID);
    expect(fields[0].name).toBe('Field A');
    expect(fields[0].position).toBe(1);
  });

  it('returns empty array when no fields', async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [] });
    const fields = await repo.getFieldsForFarm(FARM_ID);
    expect(fields).toEqual([]);
  });

  it('queries by FARM# PK with FIELD# prefix', async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [] });
    await repo.getFieldsForFarm(FARM_ID);
    const calls = ddbMock.commandCalls(QueryCommand);
    const values = calls[0].args[0].input.ExpressionAttributeValues as Record<string, string>;
    expect(values[':pk']).toBe(`FARM#${FARM_ID}`);
    expect(values[':prefix']).toBe('FIELD#');
  });
});

// ── AP-2b: getBedsForField ────────────────────────────────────────

describe('getBedsForField', () => {
  it('returns beds with IDs extracted from SK', async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [bedItem] });
    const beds = await repo.getBedsForField(FIELD_ID);
    expect(beds).toHaveLength(1);
    expect(beds[0].id).toBe(BED_ID);
    expect(beds[0].name).toBe('Bed 1');
  });

  it('queries FIELD# PK with BED# prefix', async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [] });
    await repo.getBedsForField(FIELD_ID);
    const calls = ddbMock.commandCalls(QueryCommand);
    const values = calls[0].args[0].input.ExpressionAttributeValues as Record<string, string>;
    expect(values[':pk']).toBe(`FIELD#${FIELD_ID}`);
    expect(values[':prefix']).toBe('BED#');
  });
});

// ── AP-3: getPlotsForFarm (GSI2) ──────────────────────────────────

describe('getPlotsForFarm', () => {
  it('extracts plotId from GSI2SK', async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [plotItem] });
    const plots = await repo.getPlotsForFarm(FARM_ID);
    expect(plots[0].id).toBe(PLOT_ID);
    expect(plots[0].crop_type).toBe('tomato');
  });

  it('uses GSI2 index', async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [] });
    await repo.getPlotsForFarm(FARM_ID);
    const input = ddbMock.commandCalls(QueryCommand)[0].args[0].input;
    expect(input.IndexName).toBe('GSI2');
  });
});

// ── AP-4: getPlotById (GSI1) ──────────────────────────────────────

describe('getPlotById', () => {
  it('returns plot on success', async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [plotItem] });
    const plot = await repo.getPlotById(PLOT_ID);
    expect(plot.id).toBe(PLOT_ID);
    expect(plot.label).toBe('Plot 1');
  });

  it('throws NotFoundError when no items', async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [] });
    await expect(repo.getPlotById(PLOT_ID)).rejects.toThrow(NotFoundError);
  });

  it('uses GSI1 with PLOT# pk and #META sk', async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [plotItem] });
    await repo.getPlotById(PLOT_ID);
    const input = ddbMock.commandCalls(QueryCommand)[0].args[0].input;
    expect(input.IndexName).toBe('GSI1');
    const values = input.ExpressionAttributeValues as Record<string, string>;
    expect(values[':pk']).toBe(`PLOT#${PLOT_ID}`);
    expect(values[':sk']).toBe('#META');
  });
});

// ── AP-5: getImagesForPlot (paginated) ───────────────────────────

describe('getImagesForPlot', () => {
  it('returns images newest-first (ScanIndexForward: false)', async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [imageItem] });
    const result = await repo.getImagesForPlot(PLOT_ID, 20);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].id).toBe(IMAGE_ID);
    const input = ddbMock.commandCalls(QueryCommand)[0].args[0].input;
    expect(input.ScanIndexForward).toBe(false);
  });

  it('returns nextCursor when LastEvaluatedKey exists', async () => {
    const lastKey = { PK: `PLOT#${PLOT_ID}`, SK: `IMG#2026-03-17T10:00:00.000Z#${IMAGE_ID}` };
    ddbMock.on(QueryCommand).resolves({ Items: [imageItem], LastEvaluatedKey: lastKey });
    const result = await repo.getImagesForPlot(PLOT_ID, 1);
    expect(result.nextCursor).not.toBeNull();
    expect(typeof result.nextCursor).toBe('string');
  });

  it('returns null nextCursor when no more items', async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [imageItem] });
    const result = await repo.getImagesForPlot(PLOT_ID, 20);
    expect(result.nextCursor).toBeNull();
  });

  it('decodes cursor back into ExclusiveStartKey', async () => {
    const lastKey = { PK: `PLOT#${PLOT_ID}`, SK: `IMG#2026-03-17T10:00:00.000Z#${IMAGE_ID}` };
    ddbMock.on(QueryCommand).resolves({ Items: [imageItem], LastEvaluatedKey: lastKey });
    const { nextCursor } = await repo.getImagesForPlot(PLOT_ID, 1);

    ddbMock.reset();
    ddbMock.on(QueryCommand).resolves({ Items: [] });
    await repo.getImagesForPlot(PLOT_ID, 1, nextCursor!);
    const input = ddbMock.commandCalls(QueryCommand)[0].args[0].input;
    expect(input.ExclusiveStartKey).toEqual(lastKey);
  });
});

// ── AP-6: getImageById (GSI1) ────────────────────────────────────

describe('getImageById', () => {
  it('returns image on success', async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [imageItem] });
    const image = await repo.getImageById(IMAGE_ID);
    expect(image.id).toBe(IMAGE_ID);
    expect(image.trigger).toBe('scheduled');
  });

  it('throws NotFoundError when not found', async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [] });
    await expect(repo.getImageById(IMAGE_ID)).rejects.toThrow(NotFoundError);
  });
});

// ── AP-7: getTagsForImage ─────────────────────────────────────────

describe('getTagsForImage', () => {
  it('returns empty array when no tags', async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [] });
    const tags = await repo.getTagsForImage(IMAGE_ID);
    expect(tags).toEqual([]);
  });

  it('returns tags with IDs extracted from SK', async () => {
    const tagItem = {
      PK: `IMG#${IMAGE_ID}`,
      SK: `TAG#2026-03-17T11:00:00.000Z#${TAG_ID}`,
      image_id: IMAGE_ID,
      tag: 'healthy',
      created_at: '2026-03-17T11:00:00.000Z',
    };
    ddbMock.on(QueryCommand).resolves({ Items: [tagItem] });
    const tags = await repo.getTagsForImage(IMAGE_ID);
    expect(tags[0].id).toBe(TAG_ID);
    expect(tags[0].tag).toBe('healthy');
  });
});

// ── AP-8+9: createTag ─────────────────────────────────────────────

describe('createTag', () => {
  it('puts tag and calls UpdateCommand on BED# pk (not PLOT# pk)', async () => {
    // SF-4: bed_id is now passed directly — no intermediate getPlotById GSI1 query needed
    ddbMock.on(PutCommand).resolves({});
    ddbMock.on(UpdateCommand).resolves({});

    const tag = await repo.createTag(IMAGE_ID, PLOT_ID, BED_ID, 'healthy', 'Looks good');

    expect(tag.tag).toBe('healthy');
    expect(tag.note).toBe('Looks good');
    expect(tag.image_id).toBe(IMAGE_ID);

    // UpdateCommand key must use BED# not PLOT#
    const updateCalls = ddbMock.commandCalls(UpdateCommand);
    expect(updateCalls).toHaveLength(1);
    const updateKey = updateCalls[0].args[0].input.Key as Record<string, string>;
    expect(updateKey.PK).toBe(`BED#${BED_ID}`);
    expect(updateKey.SK).toBe(`PLOT#${PLOT_ID}`);
  });
});

// ── Write: createFarm ─────────────────────────────────────────────

const USER_ID = 'user-cognito-sub-001';

describe('createFarm', () => {
  it('creates farm and returns it', async () => {
    ddbMock.on(TransactWriteCommand).resolves({});
    const farm = await repo.createFarm(FARM_ID, USER_ID, {
      name: 'Test Farm',
      latitude: 36.03,
      longitude: 138.26,
      locale: 'en',
      theme: 'system',
    });
    expect(farm.id).toBe(FARM_ID);
    expect(farm.name).toBe('Test Farm');
    expect(farm.user_id).toBe(USER_ID);
    expect(typeof farm.created_at).toBe('string');
  });

  it('TransactWriteCommand includes farm Put, user FARM_MEMBER Put, and farm MEMBER Put', async () => {
    ddbMock.on(TransactWriteCommand).resolves({});
    await repo.createFarm(FARM_ID, USER_ID, {
      name: 'Farm',
      latitude: 0,
      longitude: 0,
      locale: 'en',
      theme: 'system',
    });
    const calls = ddbMock.commandCalls(TransactWriteCommand);
    expect(calls).toHaveLength(1);
    const items = calls[0].args[0].input.TransactItems as Array<Record<string, unknown>>;
    expect(items).toHaveLength(3);
    // Item 0: farm metadata record
    const farmPut = items[0]['Put'] as Record<string, unknown>;
    expect(farmPut['ConditionExpression']).toBe('attribute_not_exists(PK)');
    // Item 1: user→farm membership record (USER# PK, FARM_MEMBER# SK)
    const userPut = items[1]['Put'] as Record<string, unknown>;
    const userItem = userPut['Item'] as Record<string, unknown>;
    expect(userItem['PK']).toBe(`USER#${USER_ID}`);
    expect(typeof userItem['SK']).toBe('string');
    expect((userItem['SK'] as string).startsWith('FARM_MEMBER#')).toBe(true);
    expect(userItem['role']).toBe('manager');
    // Item 2: farm→member index record (FARM# PK, MEMBER# SK)
    const memberPut = items[2]['Put'] as Record<string, unknown>;
    const memberItem = memberPut['Item'] as Record<string, unknown>;
    expect((memberItem['PK'] as string).startsWith('FARM#')).toBe(true);
    expect((memberItem['SK'] as string).startsWith('MEMBER#')).toBe(true);
    expect(memberItem['user_id']).toBe(USER_ID);
    expect(memberItem['role']).toBe('manager');
  });
});

// ── Write: createImage ────────────────────────────────────────────

describe('createImage', () => {
  it('stores GSI1 keys for direct image lookup', async () => {
    ddbMock.on(PutCommand).resolves({});
    await repo.createImage(PLOT_ID, IMAGE_ID, {
      bed_id: BED_ID,  // SF-4: denormalized
      node_id: 'cam-001',
      captured_at: '2026-03-17T10:00:00.000Z',
      uploaded_at: '2026-03-17T10:00:05.000Z',
      storage_key: 'images/f/p/2026/03/17/i.jpg',
      trigger: 'scheduled',
      content_type: 'image/jpeg',
      size_bytes: 1024,
    });

    const item = ddbMock.commandCalls(PutCommand)[0].args[0].input.Item as Record<string, string>;
    expect(item['GSI1PK']).toBe(`IMG#${IMAGE_ID}`);
    expect(item['GSI1SK']).toBe('#META');
    expect(item['PK']).toBe(`PLOT#${PLOT_ID}`);
  });
});

// ── updateImageThumbnailKey ───────────────────────────────────────

describe('updateImageThumbnailKey', () => {
  const thumbnailKey = `thumbnails/${FARM_ID}/${PLOT_ID}/2026/03/17/${IMAGE_ID}.jpg`;

  it('resolves PK/SK via GSI1 then updates thumbnail_key', async () => {
    ddbMock.on(QueryCommand).resolves({
      Items: [imageItem],
    });
    ddbMock.on(UpdateCommand).resolves({});

    await repo.updateImageThumbnailKey(IMAGE_ID, thumbnailKey);

    const updateCalls = ddbMock.commandCalls(UpdateCommand);
    expect(updateCalls).toHaveLength(1);
    const input = updateCalls[0].args[0].input;
    expect(input.Key).toEqual({
      PK: `PLOT#${PLOT_ID}`,
      SK: `IMG#2026-03-17T10:00:00.000Z#${IMAGE_ID}`,
    });
    expect(input.ExpressionAttributeValues![':key']).toBe(thumbnailKey);
  });

  it('throws NotFoundError when image not found in GSI1', async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [] });

    await expect(repo.updateImageThumbnailKey(IMAGE_ID, thumbnailKey))
      .rejects.toThrow(NotFoundError);
  });
});

// ── getFarmsForUser ───────────────────────────────────────────────

describe('getFarmsForUser', () => {
  it('returns empty array when user has no memberships', async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [] });
    const result = await repo.getFarmsForUser(USER_ID);
    expect(result).toEqual([]);
  });

  it('returns memberships mapped from FARM_MEMBER# items', async () => {
    const memberItem = {
      PK: `USER#${USER_ID}`,
      SK: `FARM_MEMBER#${FARM_ID}`,
      farm_id: FARM_ID,
      role: 'manager',
      joined_at: '2026-03-17T00:00:00.000Z',
    };
    ddbMock.on(QueryCommand).resolves({ Items: [memberItem] });
    const result = await repo.getFarmsForUser(USER_ID);
    expect(result).toHaveLength(1);
    expect(result[0].farm_id).toBe(FARM_ID);
    expect(result[0].role).toBe('manager');
    expect(result[0].user_id).toBe(USER_ID);
  });

  it('queries USER# PK with FARM_MEMBER# prefix', async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [] });
    await repo.getFarmsForUser(USER_ID);
    const calls = ddbMock.commandCalls(QueryCommand);
    const values = calls[0].args[0].input.ExpressionAttributeValues as Record<string, string>;
    expect(values[':pk']).toBe(`USER#${USER_ID}`);
    expect(values[':sk']).toBe('FARM_MEMBER#');
  });
});

// ── getFarmMembership ─────────────────────────────────────────────

describe('getFarmMembership', () => {
  it('returns null when no membership record exists', async () => {
    ddbMock.on(GetCommand).resolves({ Item: undefined });
    const result = await repo.getFarmMembership(USER_ID, FARM_ID);
    expect(result).toBeNull();
  });

  it('returns membership when record exists', async () => {
    const memberItem = {
      PK: `USER#${USER_ID}`,
      SK: `FARM_MEMBER#${FARM_ID}`,
      farm_id: FARM_ID,
      role: 'observer',
      joined_at: '2026-03-17T00:00:00.000Z',
    };
    ddbMock.on(GetCommand).resolves({ Item: memberItem });
    const result = await repo.getFarmMembership(USER_ID, FARM_ID);
    expect(result).not.toBeNull();
    expect(result!.role).toBe('observer');
    expect(result!.farm_id).toBe(FARM_ID);
    expect(result!.user_id).toBe(USER_ID);
  });

  it('uses correct USER# PK and FARM_MEMBER# SK', async () => {
    ddbMock.on(GetCommand).resolves({ Item: undefined });
    await repo.getFarmMembership(USER_ID, FARM_ID);
    const calls = ddbMock.commandCalls(GetCommand);
    const key = calls[0].args[0].input.Key as Record<string, string>;
    expect(key['PK']).toBe(`USER#${USER_ID}`);
    expect(key['SK']).toBe(`FARM_MEMBER#${FARM_ID}`);
  });
});

// ── addFarmMember ─────────────────────────────────────────────────

describe('addFarmMember', () => {
  it('writes both USER# and FARM# records in a single TransactWrite', async () => {
    ddbMock.on(TransactWriteCommand).resolves({});
    const result = await repo.addFarmMember(USER_ID, FARM_ID, 'observer');
    expect(result.user_id).toBe(USER_ID);
    expect(result.farm_id).toBe(FARM_ID);
    expect(result.role).toBe('observer');

    const calls = ddbMock.commandCalls(TransactWriteCommand);
    const items = calls[0].args[0].input.TransactItems as Array<Record<string, unknown>>;
    expect(items).toHaveLength(2);
    // First item: USER# → FARM_MEMBER# (with ConditionExpression to prevent duplicate)
    const userItem = (items[0]['Put'] as Record<string, unknown>)['Item'] as Record<string, unknown>;
    expect(userItem['PK']).toBe(`USER#${USER_ID}`);
    expect((userItem['SK'] as string).startsWith('FARM_MEMBER#')).toBe(true);
    expect((items[0]['Put'] as Record<string, unknown>)['ConditionExpression']).toBe('attribute_not_exists(PK)');
    // Second item: FARM# → MEMBER#
    const farmItem2 = (items[1]['Put'] as Record<string, unknown>)['Item'] as Record<string, unknown>;
    expect((farmItem2['PK'] as string).startsWith('FARM#')).toBe(true);
    expect((farmItem2['SK'] as string).startsWith('MEMBER#')).toBe(true);
  });
});

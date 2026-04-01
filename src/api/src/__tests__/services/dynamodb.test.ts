import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
  PutCommand,
  UpdateCommand,
  TransactWriteCommand,
  BatchWriteCommand,
  DeleteCommand,
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
const BED_ID = 'bd000000-0000-0000-0000-000000000001';
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
  grid_rows: 2,
  grid_cols: 2,
  created_at: '2026-03-17T00:00:00.000Z',
};

const bedItem = {
  PK: `FARM#${FARM_ID}`,
  SK: `BED#01#01#${BED_ID}`,
  GSI1PK: `BED#${BED_ID}`,
  GSI1SK: '#META',
  id: BED_ID,
  farm_id: FARM_ID,
  row: 1,
  col: 1,
  name: 'A1',
  crop_type: 'tomato',
  crop_variety: 'Cherry',
  latest_status: 'no_data',
};

const imageItem = {
  PK: `BED#${BED_ID}`,
  SK: `IMG#2026-03-17T10:00:00.000Z#${IMAGE_ID}`,
  GSI1PK: `IMG#${IMAGE_ID}`,
  GSI1SK: '#META',
  bed_id: BED_ID,
  node_id: 'cam-001',
  captured_at: '2026-03-17T10:00:00.000Z',
  uploaded_at: '2026-03-17T10:00:05.000Z',
  storage_key: `images/${FARM_ID}/${BED_ID}/2026/03/17/${IMAGE_ID}.jpg`,
  trigger: 'scheduled',
  content_type: 'image/jpeg',
  size_bytes: 102400,
};

// ── AP-1: getFarm ─────────────────────────────────────────────────

describe('getFarm', () => {
  it('returns mapped Farm on success with grid_rows/grid_cols', async () => {
    ddbMock.on(GetCommand).resolves({ Item: farmItem });
    const farm = await repo.getFarm(FARM_ID);
    expect(farm.id).toBe(FARM_ID);
    expect(farm.name).toBe('Test Farm');
    expect(farm.latitude).toBe(36.0);
    expect(farm.locale).toBe('en');
    expect(farm.grid_rows).toBe(2);
    expect(farm.grid_cols).toBe(2);
  });

  it('defaults grid_rows/grid_cols to 1 for legacy records', async () => {
    const legacyItem = { ...farmItem };
    delete (legacyItem as Record<string, unknown>)['grid_rows'];
    delete (legacyItem as Record<string, unknown>)['grid_cols'];
    ddbMock.on(GetCommand).resolves({ Item: legacyItem });
    const farm = await repo.getFarm(FARM_ID);
    expect(farm.grid_rows).toBe(1);
    expect(farm.grid_cols).toBe(1);
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

// ── AP-2: getBedsForFarm ────────────────────────────────────────

describe('getBedsForFarm', () => {
  it('returns beds with IDs extracted from SK', async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [bedItem] });
    const beds = await repo.getBedsForFarm(FARM_ID);
    expect(beds).toHaveLength(1);
    expect(beds[0].id).toBe(BED_ID);
    expect(beds[0].name).toBe('A1');
    expect(beds[0].row).toBe(1);
    expect(beds[0].col).toBe(1);
    expect(beds[0].farm_id).toBe(FARM_ID);
  });

  it('returns empty array when no beds', async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [] });
    const beds = await repo.getBedsForFarm(FARM_ID);
    expect(beds).toEqual([]);
  });

  it('queries by FARM# PK with BED# prefix', async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [] });
    await repo.getBedsForFarm(FARM_ID);
    const calls = ddbMock.commandCalls(QueryCommand);
    const values = calls[0].args[0].input.ExpressionAttributeValues as Record<string, string>;
    expect(values[':pk']).toBe(`FARM#${FARM_ID}`);
    expect(values[':prefix']).toBe('BED#');
  });
});

// ── AP-3: getBedById (GSI1) ──────────────────────────────────────

describe('getBedById', () => {
  it('returns bed on success', async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [bedItem] });
    const bed = await repo.getBedById(BED_ID);
    expect(bed.id).toBe(BED_ID);
    expect(bed.farm_id).toBe(FARM_ID);
    expect(bed.name).toBe('A1');
  });

  it('throws NotFoundError when no items', async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [] });
    await expect(repo.getBedById(BED_ID)).rejects.toThrow(NotFoundError);
  });

  it('uses GSI1 with BED# pk and #META sk', async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [bedItem] });
    await repo.getBedById(BED_ID);
    const input = ddbMock.commandCalls(QueryCommand)[0].args[0].input;
    expect(input.IndexName).toBe('GSI1');
    const values = input.ExpressionAttributeValues as Record<string, string>;
    expect(values[':pk']).toBe(`BED#${BED_ID}`);
    expect(values[':sk']).toBe('#META');
  });
});

// ── AP-5: getImagesForBed (paginated) ───────────────────────────

describe('getImagesForBed', () => {
  it('returns images newest-first (ScanIndexForward: false)', async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [imageItem] });
    const result = await repo.getImagesForBed(BED_ID, 20);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].id).toBe(IMAGE_ID);
    const input = ddbMock.commandCalls(QueryCommand)[0].args[0].input;
    expect(input.ScanIndexForward).toBe(false);
  });

  it('returns nextCursor when LastEvaluatedKey exists', async () => {
    const lastKey = { PK: `BED#${BED_ID}`, SK: `IMG#2026-03-17T10:00:00.000Z#${IMAGE_ID}` };
    ddbMock.on(QueryCommand).resolves({ Items: [imageItem], LastEvaluatedKey: lastKey });
    const result = await repo.getImagesForBed(BED_ID, 1);
    expect(result.nextCursor).not.toBeNull();
    expect(typeof result.nextCursor).toBe('string');
  });

  it('returns null nextCursor when no more items', async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [imageItem] });
    const result = await repo.getImagesForBed(BED_ID, 20);
    expect(result.nextCursor).toBeNull();
  });

  it('decodes cursor back into ExclusiveStartKey', async () => {
    const lastKey = { PK: `BED#${BED_ID}`, SK: `IMG#2026-03-17T10:00:00.000Z#${IMAGE_ID}` };
    ddbMock.on(QueryCommand).resolves({ Items: [imageItem], LastEvaluatedKey: lastKey });
    const { nextCursor } = await repo.getImagesForBed(BED_ID, 1);

    ddbMock.reset();
    ddbMock.on(QueryCommand).resolves({ Items: [] });
    await repo.getImagesForBed(BED_ID, 1, nextCursor!);
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
  it('puts tag and updates bed status on FARM# partition', async () => {
    ddbMock.on(PutCommand).resolves({});
    ddbMock.on(UpdateCommand).resolves({});

    const tag = await repo.createTag(IMAGE_ID, BED_ID, FARM_ID, 1, 1, 'healthy', 'Looks good');

    expect(tag.tag).toBe('healthy');
    expect(tag.note).toBe('Looks good');
    expect(tag.image_id).toBe(IMAGE_ID);

    // UpdateCommand key must use FARM# PK with BED# SK
    const updateCalls = ddbMock.commandCalls(UpdateCommand);
    expect(updateCalls).toHaveLength(1);
    const updateKey = updateCalls[0].args[0].input.Key as Record<string, string>;
    expect(updateKey.PK).toBe(`FARM#${FARM_ID}`);
    expect(updateKey.SK).toMatch(/^BED#01#01#/);
  });
});

// ── Write: createFarm ─────────────────────────────────────────────

const USER_ID = 'user-cognito-sub-001';

describe('createFarm', () => {
  it('creates farm with grid and returns it', async () => {
    ddbMock.on(TransactWriteCommand).resolves({});
    ddbMock.on(BatchWriteCommand).resolves({});
    const farm = await repo.createFarm(FARM_ID, USER_ID, {
      name: 'Test Farm',
      latitude: 36.03,
      longitude: 138.26,
      locale: 'en',
      theme: 'system',
      grid_rows: 2,
      grid_cols: 2,
    });
    expect(farm.id).toBe(FARM_ID);
    expect(farm.name).toBe('Test Farm');
    expect(farm.user_id).toBe(USER_ID);
    expect(farm.grid_rows).toBe(2);
    expect(farm.grid_cols).toBe(2);
    expect(typeof farm.created_at).toBe('string');
  });

  it('TransactWriteCommand includes farm Put, user FARM_MEMBER Put, and farm MEMBER Put', async () => {
    ddbMock.on(TransactWriteCommand).resolves({});
    ddbMock.on(BatchWriteCommand).resolves({});
    await repo.createFarm(FARM_ID, USER_ID, {
      name: 'Farm',
      latitude: 0,
      longitude: 0,
      locale: 'en',
      theme: 'system',
      grid_rows: 1,
      grid_cols: 1,
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
    expect(userItem['role']).toBe('admin');
    // Item 2: farm→member index record (FARM# PK, MEMBER# SK)
    const memberPut = items[2]['Put'] as Record<string, unknown>;
    const memberItem = memberPut['Item'] as Record<string, unknown>;
    expect((memberItem['PK'] as string).startsWith('FARM#')).toBe(true);
    expect((memberItem['SK'] as string).startsWith('MEMBER#')).toBe(true);
    expect(memberItem['user_id']).toBe(USER_ID);
    expect(memberItem['role']).toBe('admin');
  });

  it('calls createBedsForFarm after the TransactWrite', async () => {
    ddbMock.on(TransactWriteCommand).resolves({});
    ddbMock.on(BatchWriteCommand).resolves({});
    await repo.createFarm(FARM_ID, USER_ID, {
      name: 'Farm',
      latitude: 0,
      longitude: 0,
      locale: 'en',
      theme: 'system',
      grid_rows: 2,
      grid_cols: 3,
    });
    // Should create 2x3=6 beds via BatchWrite
    const batchCalls = ddbMock.commandCalls(BatchWriteCommand);
    expect(batchCalls.length).toBeGreaterThan(0);
  });
});

// ── Write: createImage ────────────────────────────────────────────

describe('createImage', () => {
  it('stores GSI1 keys for direct image lookup on BED# PK', async () => {
    ddbMock.on(PutCommand).resolves({});
    await repo.createImage(BED_ID, IMAGE_ID, {
      node_id: 'cam-001',
      captured_at: '2026-03-17T10:00:00.000Z',
      uploaded_at: '2026-03-17T10:00:05.000Z',
      storage_key: 'images/f/b/2026/03/17/i.jpg',
      trigger: 'scheduled',
      content_type: 'image/jpeg',
      size_bytes: 1024,
    });

    const item = ddbMock.commandCalls(PutCommand)[0].args[0].input.Item as Record<string, string>;
    expect(item['GSI1PK']).toBe(`IMG#${IMAGE_ID}`);
    expect(item['GSI1SK']).toBe('#META');
    expect(item['PK']).toBe(`BED#${BED_ID}`);
  });
});

// ── updateImageThumbnailKey ───────────────────────────────────────

describe('updateImageThumbnailKey', () => {
  const thumbnailKey = `thumbnails/${FARM_ID}/${BED_ID}/2026/03/17/${IMAGE_ID}.jpg`;

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
      PK: `BED#${BED_ID}`,
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

// ── updateMemberRole ──────────────────────────────────────────────

describe('updateMemberRole', () => {
  it('sends a TransactWrite with two Update items', async () => {
    ddbMock.on(TransactWriteCommand).resolves({});
    await repo.updateMemberRole(FARM_ID, USER_ID, 'admin');

    const calls = ddbMock.commandCalls(TransactWriteCommand);
    expect(calls).toHaveLength(1);
    const items = calls[0].args[0].input.TransactItems as Array<Record<string, unknown>>;
    expect(items).toHaveLength(2);

    // USER# record
    const userUpdate = items[0]['Update'] as Record<string, unknown>;
    const userKey = userUpdate['Key'] as Record<string, string>;
    expect(userKey['PK']).toBe(`USER#${USER_ID}`);
    expect(userKey['SK']).toBe(`FARM_MEMBER#${FARM_ID}`);
    expect((userUpdate['ExpressionAttributeValues'] as Record<string, string>)[':role']).toBe('admin');

    // FARM# record
    const farmUpdate = items[1]['Update'] as Record<string, unknown>;
    const farmKey = farmUpdate['Key'] as Record<string, string>;
    expect(farmKey['PK']).toBe(`FARM#${FARM_ID}`);
    expect(farmKey['SK']).toBe(`MEMBER#${USER_ID}`);
    expect((farmUpdate['ExpressionAttributeValues'] as Record<string, string>)[':role']).toBe('admin');
  });
});

// ── deleteJoinRequest ─────────────────────────────────────────────

describe('deleteJoinRequest', () => {
  it('sends a DeleteCommand for FARM#/JOIN_REQUEST# key', async () => {
    ddbMock.on(DeleteCommand).resolves({});
    await repo.deleteJoinRequest(FARM_ID, USER_ID);

    const calls = ddbMock.commandCalls(DeleteCommand);
    expect(calls).toHaveLength(1);
    const input = calls[0].args[0].input;
    expect(input.Key?.['PK']).toBe(`FARM#${FARM_ID}`);
    expect(input.Key?.['SK']).toBe(`JOIN_REQUEST#${USER_ID}`);
  });
});

// ── deleteUserItems ───────────────────────────────────────────────

describe('deleteUserItems', () => {
  it('sends a BatchWrite deleting PROFILE and SETTINGS items', async () => {
    ddbMock.on(BatchWriteCommand).resolves({});
    await repo.deleteUserItems(USER_ID);

    const calls = ddbMock.commandCalls(BatchWriteCommand);
    expect(calls).toHaveLength(1);
    const tableRequests = calls[0].args[0].input.RequestItems as Record<string, unknown[]>;
    const requests = Object.values(tableRequests)[0] as Array<{ DeleteRequest: { Key: Record<string, string> } }>;
    expect(requests).toHaveLength(2);

    const keys = requests.map((r) => r.DeleteRequest.Key['SK']);
    expect(keys).toContain('#PROFILE');
    expect(keys).toContain('#SETTINGS');
    for (const r of requests) {
      expect(r.DeleteRequest.Key['PK']).toBe(`USER#${USER_ID}`);
    }
  });
});

// ── deleteAccount ─────────────────────────────────────────────────

describe('deleteAccount', () => {
  const FARM_ID_2 = 'f0000000-0000-0000-0000-000000000002';
  const FARM_ID_3 = 'f0000000-0000-0000-0000-000000000003';
  const OTHER_USER_ID = 'u9999999-0000-0000-0000-000000000099';

  it('A1 — deletes farm when user is sole member', async () => {
    const spyDeleteFarm = vi.spyOn(repo, 'deleteFarm').mockResolvedValue();
    const spyDeleteUserItems = vi.spyOn(repo, 'deleteUserItems').mockResolvedValue();
    const spyGetMyJoinRequests = vi.spyOn(repo, 'getMyJoinRequests').mockResolvedValue([]);

    vi.spyOn(repo, 'getFarmsForUser').mockResolvedValue([
      { user_id: USER_ID, farm_id: FARM_ID, role: 'admin', joined_at: '2026-01-01T00:00:00.000Z' },
    ]);
    vi.spyOn(repo, 'getFarmMembers').mockResolvedValue([
      { user_id: USER_ID, role: 'admin', joined_at: '2026-01-01T00:00:00.000Z' },
    ]);

    const summary = await repo.deleteAccount(USER_ID);

    expect(spyDeleteFarm).toHaveBeenCalledWith(FARM_ID);
    expect(summary.farms_deleted).toContain(FARM_ID);
    expect(summary.farms_transferred).toHaveLength(0);
    expect(summary.farms_left).toHaveLength(0);
    expect(spyDeleteUserItems).toHaveBeenCalledWith(USER_ID);
    expect(summary.profile_deleted).toBe(true);
    expect(summary.settings_deleted).toBe(true);

    spyDeleteFarm.mockRestore();
    spyDeleteUserItems.mockRestore();
    spyGetMyJoinRequests.mockRestore();
  });

  it('A2 — transfers admin to manager when admin has other members', async () => {
    const spyUpdateRole = vi.spyOn(repo, 'updateMemberRole').mockResolvedValue();
    const spyRemoveMember = vi.spyOn(repo, 'removeFarmMember').mockResolvedValue();
    vi.spyOn(repo, 'deleteUserItems').mockResolvedValue();
    vi.spyOn(repo, 'getMyJoinRequests').mockResolvedValue([]);

    vi.spyOn(repo, 'getFarmsForUser').mockResolvedValue([
      { user_id: USER_ID, farm_id: FARM_ID, role: 'admin', joined_at: '2026-01-01T00:00:00.000Z' },
    ]);
    vi.spyOn(repo, 'getFarmMembers').mockResolvedValue([
      { user_id: USER_ID, role: 'admin', joined_at: '2026-01-01T00:00:00.000Z' },
      { user_id: OTHER_USER_ID, role: 'manager', joined_at: '2026-02-01T00:00:00.000Z' },
    ]);

    const summary = await repo.deleteAccount(USER_ID);

    expect(spyUpdateRole).toHaveBeenCalledWith(FARM_ID, OTHER_USER_ID, 'admin');
    expect(spyRemoveMember).toHaveBeenCalledWith(USER_ID, FARM_ID);
    expect(summary.farms_transferred).toHaveLength(1);
    expect(summary.farms_transferred[0].farm_id).toBe(FARM_ID);
    expect(summary.farms_transferred[0].new_admin).toBe(OTHER_USER_ID);

    spyUpdateRole.mockRestore();
    spyRemoveMember.mockRestore();
  });

  it('A3 — transfers admin to member when no managers exist', async () => {
    const spyUpdateRole = vi.spyOn(repo, 'updateMemberRole').mockResolvedValue();
    const spyRemoveMember = vi.spyOn(repo, 'removeFarmMember').mockResolvedValue();
    vi.spyOn(repo, 'deleteUserItems').mockResolvedValue();
    vi.spyOn(repo, 'getMyJoinRequests').mockResolvedValue([]);

    vi.spyOn(repo, 'getFarmsForUser').mockResolvedValue([
      { user_id: USER_ID, farm_id: FARM_ID, role: 'admin', joined_at: '2026-01-01T00:00:00.000Z' },
    ]);
    vi.spyOn(repo, 'getFarmMembers').mockResolvedValue([
      { user_id: USER_ID, role: 'admin', joined_at: '2026-01-01T00:00:00.000Z' },
      { user_id: OTHER_USER_ID, role: 'observer', joined_at: '2026-02-01T00:00:00.000Z' },
    ]);

    await repo.deleteAccount(USER_ID);

    expect(spyUpdateRole).toHaveBeenCalledWith(FARM_ID, OTHER_USER_ID, 'admin');

    spyUpdateRole.mockRestore();
    spyRemoveMember.mockRestore();
  });

  it('A4 — removes non-admin member without affecting farm', async () => {
    const spyRemoveMember = vi.spyOn(repo, 'removeFarmMember').mockResolvedValue();
    const spyDeleteFarm = vi.spyOn(repo, 'deleteFarm').mockResolvedValue();
    vi.spyOn(repo, 'deleteUserItems').mockResolvedValue();
    vi.spyOn(repo, 'getMyJoinRequests').mockResolvedValue([]);

    vi.spyOn(repo, 'getFarmsForUser').mockResolvedValue([
      { user_id: USER_ID, farm_id: FARM_ID, role: 'observer', joined_at: '2026-01-01T00:00:00.000Z' },
    ]);
    vi.spyOn(repo, 'getFarmMembers').mockResolvedValue([
      { user_id: OTHER_USER_ID, role: 'admin', joined_at: '2026-01-01T00:00:00.000Z' },
      { user_id: USER_ID, role: 'observer', joined_at: '2026-02-01T00:00:00.000Z' },
    ]);

    const summary = await repo.deleteAccount(USER_ID);

    expect(spyRemoveMember).toHaveBeenCalledWith(USER_ID, FARM_ID);
    expect(spyDeleteFarm).not.toHaveBeenCalled();
    expect(summary.farms_left).toContain(FARM_ID);

    spyRemoveMember.mockRestore();
    spyDeleteFarm.mockRestore();
  });

  it('A5 — handles multiple farms with mixed scenarios', async () => {
    const spyDeleteFarm = vi.spyOn(repo, 'deleteFarm').mockResolvedValue();
    const spyUpdateRole = vi.spyOn(repo, 'updateMemberRole').mockResolvedValue();
    const spyRemoveMember = vi.spyOn(repo, 'removeFarmMember').mockResolvedValue();
    vi.spyOn(repo, 'deleteUserItems').mockResolvedValue();
    vi.spyOn(repo, 'getMyJoinRequests').mockResolvedValue([]);

    vi.spyOn(repo, 'getFarmsForUser').mockResolvedValue([
      { user_id: USER_ID, farm_id: FARM_ID, role: 'admin', joined_at: '2026-01-01T00:00:00.000Z' },    // sole member
      { user_id: USER_ID, farm_id: FARM_ID_2, role: 'admin', joined_at: '2026-01-01T00:00:00.000Z' }, // admin + others
      { user_id: USER_ID, farm_id: FARM_ID_3, role: 'observer', joined_at: '2026-01-01T00:00:00.000Z' }, // non-admin
    ]);
    vi.spyOn(repo, 'getFarmMembers')
      .mockResolvedValueOnce([{ user_id: USER_ID, role: 'admin', joined_at: '2026-01-01T00:00:00.000Z' }]) // FARM_ID: sole
      .mockResolvedValueOnce([
        { user_id: USER_ID, role: 'admin', joined_at: '2026-01-01T00:00:00.000Z' },
        { user_id: OTHER_USER_ID, role: 'manager', joined_at: '2026-02-01T00:00:00.000Z' },
      ])
      .mockResolvedValueOnce([
        { user_id: OTHER_USER_ID, role: 'admin', joined_at: '2026-01-01T00:00:00.000Z' },
        { user_id: USER_ID, role: 'observer', joined_at: '2026-02-01T00:00:00.000Z' },
      ]);

    const summary = await repo.deleteAccount(USER_ID);

    expect(summary.farms_deleted).toContain(FARM_ID);
    expect(summary.farms_transferred[0].farm_id).toBe(FARM_ID_2);
    expect(summary.farms_left).toContain(FARM_ID_3);
    expect(spyDeleteFarm).toHaveBeenCalledWith(FARM_ID);
    expect(spyUpdateRole).toHaveBeenCalledWith(FARM_ID_2, OTHER_USER_ID, 'admin');
    expect(spyRemoveMember).toHaveBeenCalledWith(USER_ID, FARM_ID_2);
    expect(spyRemoveMember).toHaveBeenCalledWith(USER_ID, FARM_ID_3);

    spyDeleteFarm.mockRestore();
    spyUpdateRole.mockRestore();
    spyRemoveMember.mockRestore();
  });

  it('A6 — deletes pending join requests', async () => {
    const spyDeleteJR = vi.spyOn(repo, 'deleteJoinRequest').mockResolvedValue();
    vi.spyOn(repo, 'getFarmsForUser').mockResolvedValue([]);
    vi.spyOn(repo, 'deleteUserItems').mockResolvedValue();
    vi.spyOn(repo, 'getMyJoinRequests').mockResolvedValue([
      { farm_id: FARM_ID_2, status: 'pending', requested_at: '2026-01-01T00:00:00.000Z' },
      { farm_id: FARM_ID_3, status: 'pending', requested_at: '2026-01-01T00:00:00.000Z' },
    ]);

    const summary = await repo.deleteAccount(USER_ID);

    expect(spyDeleteJR).toHaveBeenCalledWith(FARM_ID_2, USER_ID);
    expect(spyDeleteJR).toHaveBeenCalledWith(FARM_ID_3, USER_ID);
    expect(summary.join_requests_deleted).toBe(2);

    spyDeleteJR.mockRestore();
  });

  it('A8 — succeeds when user has no farms', async () => {
    vi.spyOn(repo, 'getFarmsForUser').mockResolvedValue([]);
    vi.spyOn(repo, 'getMyJoinRequests').mockResolvedValue([]);
    vi.spyOn(repo, 'deleteUserItems').mockResolvedValue();

    const summary = await repo.deleteAccount(USER_ID);

    expect(summary.farms_deleted).toHaveLength(0);
    expect(summary.farms_left).toHaveLength(0);
    expect(summary.farms_transferred).toHaveLength(0);
    expect(summary.join_requests_deleted).toBe(0);
    expect(summary.profile_deleted).toBe(true);
    expect(summary.settings_deleted).toBe(true);
  });
});


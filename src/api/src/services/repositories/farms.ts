import { GetCommand, PutCommand, ScanCommand, QueryCommand, UpdateCommand, TransactWriteCommand, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';
import type { Farm } from '@litcrop/shared';
import { DDB_KEY_PREFIXES, DEMO_FARM_ID } from '@litcrop/shared';
import { ddb, TABLE_NAME, pk, sk } from './_infrastructure';
import { itemToFarm, buildMembershipItems } from './_mappers';
import { NotFoundError } from '../../errors';
import { createBedsForFarm } from './beds';

export async function getFarm(farmId: string): Promise<Farm> {
  const result = await ddb.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: pk.farm(farmId), SK: sk.meta() },
    }),
  );
  if (!result.Item) throw new NotFoundError(`Farm not found: ${farmId}`);
  return itemToFarm(result.Item, farmId);
}

export async function getAllFarms(): Promise<Farm[]> {
  const farms: Farm[] = [];
  let lastKey: Record<string, unknown> | undefined;
  do {
    const result = await ddb.send(
      new ScanCommand({
        TableName: TABLE_NAME,
        FilterExpression: 'begins_with(PK, :prefix) AND SK = :meta',
        ExpressionAttributeValues: {
          ':prefix': DDB_KEY_PREFIXES.FARM,
          ':meta': DDB_KEY_PREFIXES.META,
        },
        ExclusiveStartKey: lastKey,
      }),
    );
    for (const item of result.Items ?? []) {
      const farmId = (item['PK'] as string).slice(DDB_KEY_PREFIXES.FARM.length);
      farms.push(itemToFarm(item, farmId));
    }
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);
  return farms;
}

export async function createFarm(
  farmId: string,
  userId: string,
  data: Omit<Farm, 'id' | 'user_id' | 'created_at'>,
): Promise<Farm> {
  const createdAt = new Date().toISOString();
  const gridRows = data.grid_rows ?? 1;
  const gridCols = data.grid_cols ?? 1;
  const farm: Farm = {
    id: farmId,
    user_id: userId,
    ...data,
    grid_rows: gridRows,
    grid_cols: gridCols,
    created_at: createdAt,
  };
  const joinedAt = createdAt;

  await ddb.send(
    new TransactWriteCommand({
      TransactItems: [
        {
          Put: {
            TableName: TABLE_NAME,
            Item: {
              PK: pk.farm(farmId),
              SK: sk.meta(),
              ...farm,
            },
            ConditionExpression: 'attribute_not_exists(PK)',
          },
        },
        ...buildMembershipItems(userId, farmId, 'owner', joinedAt),
      ],
    }),
  );

  // Cross-domain: create bed grid after farm is written
  await createBedsForFarm(farmId, gridRows, gridCols);

  return farm;
}

export async function updateFarm(
  farmId: string,
  updates: Partial<Pick<Farm, 'name' | 'description' | 'location_text' | 'latitude' | 'longitude' | 'elevation_m' | 'locale' | 'theme' | 'grid_rows' | 'grid_cols' | 'default_currency'>>,
): Promise<void> {
  const expressions: string[] = [];
  const values: Record<string, unknown> = {};
  const names: Record<string, string> = {};

  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) {
      expressions.push(`#${key} = :${key}`);
      values[`:${key}`] = value;
      names[`#${key}`] = key;
    }
  }

  if (expressions.length === 0) return;

  await ddb.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { PK: pk.farm(farmId), SK: sk.meta() },
      UpdateExpression: `SET ${expressions.join(', ')}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
      ConditionExpression: 'attribute_exists(PK)',
    }),
  );
}

/**
 * Delete a farm and all its associated data.
 * Performs a partition-wide scan+delete of ALL items under FARM#{farmId}.
 * This implicitly cascades to beds, devices, diary entries, join requests,
 * and member reverse records without importing those domain modules.
 * Images are NOT deleted (kept for data retention).
 */
export async function deleteFarm(farmId: string): Promise<void> {
  let farmItems: Array<{ PK: string; SK: string }> = [];
  let lastKey: Record<string, unknown> | undefined;
  do {
    const result = await ddb.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk',
        ExpressionAttributeValues: { ':pk': pk.farm(farmId) },
        ProjectionExpression: 'PK, SK',
        ExclusiveStartKey: lastKey,
      }),
    );
    farmItems = farmItems.concat(
      (result.Items ?? []).map((i) => ({ PK: i['PK'] as string, SK: i['SK'] as string })),
    );
    lastKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (lastKey);

  const memberUserIds: string[] = farmItems
    .filter((i) => i.SK.startsWith(DDB_KEY_PREFIXES.MEMBER))
    .map((i) => i.SK.slice(DDB_KEY_PREFIXES.MEMBER.length));

  const deleteRequests: Array<{ DeleteRequest: { Key: { PK: string; SK: string } } }> = farmItems.map(
    (item) => ({ DeleteRequest: { Key: { PK: item.PK, SK: item.SK } } }),
  );

  for (const userId of memberUserIds) {
    deleteRequests.push({
      DeleteRequest: {
        Key: { PK: pk.user(userId), SK: sk.farmMember(farmId) },
      },
    });
  }

  for (let i = 0; i < deleteRequests.length; i += 25) {
    const chunk = deleteRequests.slice(i, i + 25);
    const result = await ddb.send(
      new BatchWriteCommand({ RequestItems: { [TABLE_NAME]: chunk } }),
    );
    const unprocessed = result.UnprocessedItems?.[TABLE_NAME];
    if (unprocessed && unprocessed.length > 0) {
      const retryResult = await ddb.send(
        new BatchWriteCommand({ RequestItems: { [TABLE_NAME]: unprocessed } }),
      );
      const stillUnprocessed = retryResult.UnprocessedItems?.[TABLE_NAME];
      if (stillUnprocessed && stillUnprocessed.length > 0) {
        console.warn(`[deleteFarm] ${stillUnprocessed.length} items still unprocessed after retry for farm ${farmId}`);
      }
    }
  }
}

export async function getDiscoverableFarms(): Promise<Farm[]> {
  const allFarms = await getAllFarms();
  return allFarms.filter((f) => f.id !== DEMO_FARM_ID);
}

export async function getStats(): Promise<{ farms: number; users: number; beds: number }> {
  const CACHE_KEY = { PK: 'STATS#GLOBAL', SK: '#COUNTS' };
  const CACHE_TTL_MS = 5 * 60 * 1000;

  const cached = await ddb.send(
    new GetCommand({ TableName: TABLE_NAME, Key: CACHE_KEY }),
  );
  if (cached.Item && typeof cached.Item['computed_at'] === 'string') {
    const age = Date.now() - new Date(cached.Item['computed_at']).getTime();
    if (age < CACHE_TTL_MS) {
      return {
        farms: (cached.Item['farms'] as number) ?? 0,
        users: (cached.Item['users'] as number) ?? 0,
        beds: (cached.Item['beds'] as number) ?? 0,
      };
    }
  }

  const countScan = async (
    filterExpr: string,
    exprValues: Record<string, string>,
  ): Promise<number> => {
    let count = 0;
    let lastKey: Record<string, unknown> | undefined;
    do {
      const result = await ddb.send(
        new ScanCommand({
          TableName: TABLE_NAME,
          FilterExpression: filterExpr,
          ExpressionAttributeValues: exprValues,
          Select: 'COUNT',
          ExclusiveStartKey: lastKey,
        }),
      );
      count += result.Count ?? 0;
      lastKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
    } while (lastKey);
    return count;
  };

  const [farms, users, beds] = await Promise.all([
    countScan('begins_with(PK, :p) AND SK = :s', { ':p': 'FARM#', ':s': '#META' }),
    countScan('begins_with(PK, :p) AND SK = :s', { ':p': 'USER#', ':s': '#PROFILE' }),
    countScan('begins_with(SK, :s)', { ':s': 'BED#' }),
  ]);

  // Cache result (fire-and-forget)
  ddb.send(new PutCommand({
    TableName: TABLE_NAME,
    Item: { ...CACHE_KEY, farms, users, beds, computed_at: new Date().toISOString() },
  })).catch((err) => console.warn('[getStats] cache write failed:', err));

  return { farms, users, beds };
}

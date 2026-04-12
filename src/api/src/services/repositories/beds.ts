import { QueryCommand, UpdateCommand, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';
import type { Bed } from '@litcrop/shared';
import { DDB_KEY_PREFIXES } from '@litcrop/shared';
import { ddb, TABLE_NAME, pk, sk, GSI1_INDEX, extractIdFromSk, bedName } from './_infrastructure';
import { itemToBed } from './_mappers';
import { NotFoundError } from '../../errors';

export async function getBedsForFarm(farmId: string): Promise<Bed[]> {
  const result = await ddb.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
      ExpressionAttributeValues: {
        ':pk': pk.farm(farmId),
        ':prefix': DDB_KEY_PREFIXES.BED,
      },
    }),
  );
  return (result.Items ?? []).map((item) => {
    const bedId = extractIdFromSk(item['SK'] as string, DDB_KEY_PREFIXES.BED);
    return itemToBed(item, farmId, bedId);
  });
}

export async function getBedById(bedId: string): Promise<Bed> {
  const result = await ddb.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: GSI1_INDEX,
      KeyConditionExpression: 'GSI1PK = :pk AND GSI1SK = :sk',
      ExpressionAttributeValues: {
        ':pk': pk.bed(bedId),
        ':sk': sk.meta(),
      },
      Limit: 1,
    }),
  );
  const item = result.Items?.[0];
  if (!item) throw new NotFoundError(`Bed not found: ${bedId}`);
  const farmId = item['farm_id'] as string;
  return itemToBed(item, farmId, bedId);
}

export async function updateBed(
  farmId: string,
  bedId: string,
  row: number,
  col: number,
  updates: Record<string, unknown>,
): Promise<void> {
  const setExpressions: string[] = [];
  const removeExpressions: string[] = [];
  const values: Record<string, unknown> = {};
  const names: Record<string, string> = {};

  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined) continue;
    names[`#${key}`] = key;
    if (value === null) {
      removeExpressions.push(`#${key}`);
    } else {
      setExpressions.push(`#${key} = :${key}`);
      values[`:${key}`] = value;
    }
  }

  if (setExpressions.length === 0 && removeExpressions.length === 0) return;

  const parts: string[] = [];
  if (setExpressions.length > 0) parts.push(`SET ${setExpressions.join(', ')}`);
  if (removeExpressions.length > 0) parts.push(`REMOVE ${removeExpressions.join(', ')}`);

  await ddb.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { PK: pk.farm(farmId), SK: sk.bed(row, col, bedId) },
      UpdateExpression: parts.join(' '),
      ExpressionAttributeNames: names,
      ...(Object.keys(values).length > 0 ? { ExpressionAttributeValues: values } : {}),
      ConditionExpression: 'attribute_exists(PK)',
    }),
  );
}

export async function createBedsForFarm(farmId: string, gridRows: number, gridCols: number): Promise<Bed[]> {
  const positions: Array<{ row: number; col: number }> = [];
  for (let row = 1; row <= gridRows; row++) {
    for (let col = 1; col <= gridCols; col++) {
      positions.push({ row, col });
    }
  }
  return createBedsForPositions(farmId, positions);
}

export async function createBedsForPositions(
  farmId: string,
  positions: Array<{ row: number; col: number }>,
): Promise<Bed[]> {
  if (positions.length === 0) return [];

  const beds: Bed[] = [];
  const items: Array<{ PutRequest: { Item: Record<string, unknown> } }> = [];

  for (const { row, col } of positions) {
    const bedId = crypto.randomUUID();
    const name = bedName(row, col);
    const bed: Bed = {
      id: bedId,
      farm_id: farmId,
      row,
      col,
      name,
      latest_status: 'no_data',
    };
    beds.push(bed);
    items.push({
      PutRequest: {
        Item: {
          PK: pk.farm(farmId),
          SK: sk.bed(row, col, bedId),
          GSI1PK: pk.bed(bedId),
          GSI1SK: sk.meta(),
          ...bed,
        },
      },
    });
  }

  for (let i = 0; i < items.length; i += 25) {
    const chunk = items.slice(i, i + 25);
    const result = await ddb.send(
      new BatchWriteCommand({
        RequestItems: { [TABLE_NAME]: chunk },
      }),
    );

    const unprocessed = result.UnprocessedItems?.[TABLE_NAME];
    if (unprocessed && unprocessed.length > 0) {
      const retryResult = await ddb.send(
        new BatchWriteCommand({
          RequestItems: { [TABLE_NAME]: unprocessed },
        }),
      );
      const stillUnprocessed = retryResult.UnprocessedItems?.[TABLE_NAME];
      if (stillUnprocessed && stillUnprocessed.length > 0) {
        console.warn(`[createBedsForPositions] ${stillUnprocessed.length} items still unprocessed after retry for farm ${farmId}`);
      }
    }
  }

  return beds;
}

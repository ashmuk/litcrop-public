import { PutCommand, QueryCommand, UpdateCommand, DeleteCommand, type QueryCommandInput } from '@aws-sdk/lib-dynamodb';
import type { DiaryEntry, DiaryEntryType, DiaryCategory, CostItem } from '@litcrop/shared';
import { DDB_KEY_PREFIXES } from '@litcrop/shared';
import { ddb, TABLE_NAME, pk, sk, GSI1_INDEX, extractIdFromSk, encodeCursor, decodeCursor } from './_infrastructure';

function itemToDiaryEntry(item: Record<string, unknown>, entryId: string): DiaryEntry {
  return {
    id: (item['id'] as string) ?? entryId,
    farm_id: item['farm_id'] as string,
    date: item['date'] as string,
    category: item['category'] as DiaryCategory,
    entry_type: (item['entry_type'] as DiaryEntryType) ?? 'actual',
    description: item['description'] as string,
    time_spent_minutes: (item['time_spent_minutes'] as number) ?? null,
    bed_id: (item['bed_id'] as string) ?? null,
    // Wave D (#279) — nullable FK to BedCrop.id; pre-Wave-D records lack the
    // attribute and surface here as null (leave-null migration).
    bed_crop_id: (item['bed_crop_id'] as string) ?? null,
    photo_ids: (item['photo_ids'] as string[]) ?? [],
    costs: (item['costs'] as CostItem[]) ?? [],
    harvest_amount: (item['harvest_amount'] as number) ?? null,
    harvest_unit: (item['harvest_unit'] as string) ?? null,
    revenue: (item['revenue'] as number) ?? null,
    revenue_currency: (item['revenue_currency'] as DiaryEntry['revenue_currency']) ?? null,
    created_by: item['created_by'] as string,
    created_at: item['created_at'] as string,
    updated_at: item['updated_at'] as string,
  };
}

export async function createDiaryEntry(
  farmId: string,
  entryId: string,
  data: {
    date: string;
    category: DiaryCategory;
    entry_type: DiaryEntryType;
    description: string;
    time_spent_minutes: number | null;
    bed_id: string | null;
    bed_crop_id: string | null;
    photo_ids: string[];
    costs: CostItem[];
    harvest_amount?: number | null;
    harvest_unit?: string | null;
    revenue?: number | null;
    revenue_currency?: DiaryEntry['revenue_currency'];
    created_by: string;
  },
): Promise<DiaryEntry> {
  const now = new Date().toISOString();
  const item: Record<string, unknown> = {
    PK: pk.farm(farmId),
    SK: sk.diary(data.date, entryId),
    GSI1PK: `${DDB_KEY_PREFIXES.DIARY}${entryId}`,
    GSI1SK: DDB_KEY_PREFIXES.META,
    id: entryId,
    farm_id: farmId,
    date: data.date,
    category: data.category,
    entry_type: data.entry_type,
    description: data.description,
    time_spent_minutes: data.time_spent_minutes,
    bed_id: data.bed_id,
    bed_crop_id: data.bed_crop_id,
    photo_ids: data.photo_ids,
    costs: data.costs,
    created_by: data.created_by,
    created_at: now,
    updated_at: now,
  };
  if (data.harvest_amount != null) item['harvest_amount'] = data.harvest_amount;
  if (data.harvest_unit != null) item['harvest_unit'] = data.harvest_unit;
  if (data.revenue != null) item['revenue'] = data.revenue;
  if (data.revenue_currency != null) item['revenue_currency'] = data.revenue_currency;

  await ddb.send(new PutCommand({
    TableName: TABLE_NAME,
    Item: item,
    ConditionExpression: 'attribute_not_exists(SK)',
  }));
  return itemToDiaryEntry(item, entryId);
}

export async function getDiaryEntryById(entryId: string): Promise<DiaryEntry | null> {
  const result = await ddb.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: GSI1_INDEX,
      KeyConditionExpression: 'GSI1PK = :pk AND GSI1SK = :sk',
      ExpressionAttributeValues: {
        ':pk': `${DDB_KEY_PREFIXES.DIARY}${entryId}`,
        ':sk': DDB_KEY_PREFIXES.META,
      },
      Limit: 1,
    }),
  );
  const item = result.Items?.[0];
  if (!item) return null;
  const id = extractIdFromSk(item['SK'] as string, DDB_KEY_PREFIXES.DIARY);
  return itemToDiaryEntry(item, id);
}

export async function getDiaryEntries(
  farmId: string,
  from: string,
  to: string,
  limit = 20,
  cursor?: string,
): Promise<{ items: DiaryEntry[]; nextCursor: string | null }> {
  const queryInput: QueryCommandInput = {
    TableName: TABLE_NAME,
    KeyConditionExpression: 'PK = :pk AND SK BETWEEN :from AND :to',
    ExpressionAttributeValues: {
      ':pk': pk.farm(farmId),
      ':from': `${DDB_KEY_PREFIXES.DIARY}${from}`,
      ':to': `${DDB_KEY_PREFIXES.DIARY}${to}~`,
    },
    ScanIndexForward: false,
    Limit: limit,
  };

  if (cursor) {
    try {
      queryInput.ExclusiveStartKey = decodeCursor(cursor, pk.farm(farmId));
    } catch {
      const badCursor = new Error('Invalid cursor format');
      badCursor.name = 'ValidationException';
      throw badCursor;
    }
  }

  const result = await ddb.send(new QueryCommand(queryInput));
  const items = (result.Items ?? []).map((item) => {
    const id = extractIdFromSk(item['SK'] as string, DDB_KEY_PREFIXES.DIARY);
    return itemToDiaryEntry(item, id);
  });

  const nextCursor = result.LastEvaluatedKey
    ? encodeCursor(result.LastEvaluatedKey)
    : null;

  return { items, nextCursor };
}

export async function updateDiaryEntry(
  farmId: string,
  entryId: string,
  date: string,
  updates: Partial<{
    category: DiaryCategory;
    entry_type: DiaryEntryType;
    description: string;
    time_spent_minutes: number | null;
    bed_id: string | null;
    bed_crop_id: string | null;
    photo_ids: string[];
    costs: CostItem[];
    harvest_amount: number | null;
    harvest_unit: string | null;
    revenue: number | null;
    revenue_currency: DiaryEntry['revenue_currency'];
  }>,
): Promise<DiaryEntry> {
  const setExpressions: string[] = ['#updated_at = :now'];
  const removeExpressions: string[] = [];
  const names: Record<string, string> = { '#updated_at': 'updated_at' };
  const values: Record<string, unknown> = { ':now': new Date().toISOString() };

  for (const [key, val] of Object.entries(updates)) {
    if (val === undefined) continue;
    names[`#${key}`] = key;
    if (val === null) {
      removeExpressions.push(`#${key}`);
    } else {
      setExpressions.push(`#${key} = :${key}`);
      values[`:${key}`] = val;
    }
  }

  const parts: string[] = [];
  if (setExpressions.length > 0) parts.push(`SET ${setExpressions.join(', ')}`);
  if (removeExpressions.length > 0) parts.push(`REMOVE ${removeExpressions.join(', ')}`);

  const result = await ddb.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { PK: pk.farm(farmId), SK: sk.diary(date, entryId) },
      UpdateExpression: parts.join(' '),
      ExpressionAttributeNames: names,
      ...(Object.keys(values).length > 0 ? { ExpressionAttributeValues: values } : {}),
      ConditionExpression: 'attribute_exists(PK)',
      ReturnValues: 'ALL_NEW',
    }),
  );
  return itemToDiaryEntry(result.Attributes as Record<string, unknown>, entryId);
}

export async function deleteDiaryEntry(farmId: string, entryId: string, date: string): Promise<void> {
  await ddb.send(
    new DeleteCommand({
      TableName: TABLE_NAME,
      Key: { PK: pk.farm(farmId), SK: sk.diary(date, entryId) },
      ConditionExpression: 'attribute_exists(PK)',
    }),
  );
}

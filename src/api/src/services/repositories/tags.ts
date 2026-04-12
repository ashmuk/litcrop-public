import { QueryCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import type { Tag, TagValue, BedStatus } from '@litcrop/shared';
import { DDB_KEY_PREFIXES } from '@litcrop/shared';
import { ddb, TABLE_NAME, pk, sk, extractIdFromSk } from './_infrastructure';
import { itemToTag } from './_mappers';

export async function getTagsForImage(imageId: string): Promise<Tag[]> {
  const result = await ddb.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
      ExpressionAttributeValues: {
        ':pk': pk.image(imageId),
        ':prefix': DDB_KEY_PREFIXES.TAG,
      },
    }),
  );
  return (result.Items ?? []).map((item) => {
    const tagId = extractIdFromSk(item['SK'] as string, DDB_KEY_PREFIXES.TAG);
    return itemToTag(item, tagId);
  });
}

export async function getLatestTagForImage(imageId: string): Promise<Tag | null> {
  const result = await ddb.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
      ExpressionAttributeValues: {
        ':pk': pk.image(imageId),
        ':prefix': DDB_KEY_PREFIXES.TAG,
      },
      ScanIndexForward: false,
      Limit: 1,
    }),
  );
  const item = result.Items?.[0];
  if (!item) return null;
  const tagId = extractIdFromSk(item['SK'] as string, DDB_KEY_PREFIXES.TAG);
  return itemToTag(item, tagId);
}

export async function createTag(
  imageId: string,
  bedId: string,
  farmId: string,
  row: number,
  col: number,
  tagValue: TagValue,
  note?: string,
): Promise<Tag> {
  const tagId = crypto.randomUUID();
  const createdAt = new Date().toISOString();

  const tag: Tag = {
    id: tagId,
    image_id: imageId,
    tag: tagValue,
    note,
    created_at: createdAt,
  };

  await Promise.all([
    ddb.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          PK: pk.image(imageId),
          SK: sk.tag(createdAt, tagId),
          ...tag,
        },
      }),
    ),
    // Update bed status on the FARM# partition
    ddb.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: {
          PK: pk.farm(farmId),
          SK: sk.bed(row, col, bedId),
        },
        UpdateExpression: 'SET latest_status = :status',
        ExpressionAttributeValues: {
          ':status': tagValue as BedStatus,
        },
      }),
    ),
  ]);

  return tag;
}

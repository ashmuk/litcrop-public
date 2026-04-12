import { QueryCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import type { Image } from '@litcrop/shared';
import { DDB_KEY_PREFIXES } from '@litcrop/shared';
import { ddb, TABLE_NAME, pk, sk, GSI1_INDEX, extractIdFromSk, encodeCursor, decodeCursor } from './_infrastructure';
import { itemToImage } from './_mappers';
import { NotFoundError } from '../../errors';

export async function getImagesForBed(
  bedId: string,
  limit = 20,
  cursor?: string,
): Promise<{ items: Image[]; nextCursor: string | null }> {
  const queryInput: import('@aws-sdk/lib-dynamodb').QueryCommandInput = {
    TableName: TABLE_NAME,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
    ExpressionAttributeValues: {
      ':pk': pk.bed(bedId),
      ':prefix': DDB_KEY_PREFIXES.IMG,
    },
    ScanIndexForward: false,
    Limit: limit,
  };

  if (cursor) {
    try {
      queryInput.ExclusiveStartKey = decodeCursor(cursor, pk.bed(bedId));
    } catch {
      const badCursor = new Error('Invalid cursor format');
      badCursor.name = 'ValidationException';
      throw badCursor;
    }
  }

  const result = await ddb.send(new QueryCommand(queryInput));
  const items = (result.Items ?? []).map((item) => {
    const imageId = extractIdFromSk(item['SK'] as string, DDB_KEY_PREFIXES.IMG);
    return itemToImage(item, imageId);
  });

  const nextCursor = result.LastEvaluatedKey
    ? encodeCursor(result.LastEvaluatedKey)
    : null;

  return { items, nextCursor };
}

export async function getLatestImageForBed(bedId: string): Promise<Image | null> {
  const result = await ddb.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
      ExpressionAttributeValues: {
        ':pk': pk.bed(bedId),
        ':prefix': DDB_KEY_PREFIXES.IMG,
      },
      ScanIndexForward: false,
      Limit: 1,
    }),
  );
  const item = result.Items?.[0];
  if (!item) return null;
  const imageId = extractIdFromSk(item['SK'] as string, DDB_KEY_PREFIXES.IMG);
  return itemToImage(item, imageId);
}

export async function getImageById(imageId: string): Promise<Image> {
  const result = await ddb.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: GSI1_INDEX,
      KeyConditionExpression: 'GSI1PK = :pk AND GSI1SK = :sk',
      ExpressionAttributeValues: {
        ':pk': pk.image(imageId),
        ':sk': sk.meta(),
      },
      Limit: 1,
    }),
  );
  const item = result.Items?.[0];
  if (!item) throw new NotFoundError(`Image not found: ${imageId}`);
  return itemToImage(item, imageId);
}

export async function createImage(
  bedId: string,
  imageId: string,
  data: Omit<Image, 'id' | 'bed_id'>,
): Promise<Image> {
  const image: Image = { id: imageId, bed_id: bedId, ...data };

  await ddb.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: pk.bed(bedId),
        SK: sk.image(data.captured_at, imageId),
        GSI1PK: pk.image(imageId),
        GSI1SK: sk.meta(),
        ...image,
      },
    }),
  );

  return image;
}

export async function updateImageThumbnailKey(imageId: string, thumbnailKey: string): Promise<void> {
  const queryResult = await ddb.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: GSI1_INDEX,
      KeyConditionExpression: 'GSI1PK = :pk AND GSI1SK = :sk',
      ExpressionAttributeValues: {
        ':pk': pk.image(imageId),
        ':sk': sk.meta(),
      },
      Limit: 1,
    }),
  );

  const item = queryResult.Items?.[0];
  if (!item) throw new NotFoundError(`Image not found: ${imageId}`);

  await ddb.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { PK: item['PK'] as string, SK: item['SK'] as string },
      UpdateExpression: 'SET thumbnail_key = :key',
      ExpressionAttributeValues: {
        ':key': thumbnailKey,
      },
      ConditionExpression: 'attribute_exists(PK)',
    }),
  );
}

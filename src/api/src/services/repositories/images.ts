import { QueryCommand, PutCommand, UpdateCommand, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';
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

/**
 * Write fields the image route owns at creation time. `thumbnail_key` is
 * intentionally absent — it's filled async by the thumbnail Lambda via
 * `updateImageThumbnailKey` once the derivative is generated.
 */
export interface CreateImageData {
  node_id: string;
  captured_at: string;
  uploaded_at: string;
  storage_key: string;
  trigger: Image['trigger'];
  content_type: string;
  size_bytes: number;
  metadata?: Record<string, unknown>;
  /** Cognito sub of the uploader. Optional on the write path because
   *  pre-v0.99.7.3 records + some test fixtures don't set it; production
   *  POST /beds/:bedId/images always passes it per the Phase 1 contract. */
  uploaded_by?: string | null;
}

export async function createImage(
  bedId: string,
  imageId: string,
  data: CreateImageData,
): Promise<Image> {
  // Enumerate the write-item fields explicitly (matches createDevice's style)
  // so any future optional field added to Image must be opted in here before
  // it lands in DDB — avoids silent schema drift at the write path.
  // Resolves #462 Phase 1 finding #5.
  await ddb.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: pk.bed(bedId),
        SK: sk.image(data.captured_at, imageId),
        GSI1PK: pk.image(imageId),
        GSI1SK: sk.meta(),
        id: imageId,
        bed_id: bedId,
        node_id: data.node_id,
        captured_at: data.captured_at,
        uploaded_at: data.uploaded_at,
        storage_key: data.storage_key,
        trigger: data.trigger,
        content_type: data.content_type,
        size_bytes: data.size_bytes,
        // metadata and uploaded_by may be undefined/null — removeUndefinedValues
        // on the marshaller drops undefined, and null is stored as-is.
        metadata: data.metadata,
        uploaded_by: data.uploaded_by,
      },
    }),
  );

  return {
    id: imageId,
    bed_id: bedId,
    node_id: data.node_id,
    captured_at: data.captured_at,
    uploaded_at: data.uploaded_at,
    storage_key: data.storage_key,
    trigger: data.trigger,
    content_type: data.content_type,
    size_bytes: data.size_bytes,
    metadata: data.metadata,
    uploaded_by: data.uploaded_by,
  };
}

/**
 * List images for a bed captured on a specific day (UTC).
 * `day` must be ISO 8601 date format `YYYY-MM-DD`.
 *
 * Implementation note: image SK is `IMG#<captured_at>#<imageId>` where
 * `captured_at` is full ISO 8601. Because ISO 8601 sorts lexicographically by
 * date prefix, `begins_with(SK, 'IMG#YYYY-MM-DD')` is an O(items-in-day)
 * range query against the bed partition — no GSI required.
 */
export async function listImagesByBedAndDay(bedId: string, day: string): Promise<Image[]> {
  const result = await ddb.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
      ExpressionAttributeValues: {
        ':pk': pk.bed(bedId),
        ':prefix': `${DDB_KEY_PREFIXES.IMG}${day}`,
      },
      ScanIndexForward: false,
    }),
  );
  return (result.Items ?? []).map((item) => {
    const imageId = extractIdFromSk(item['SK'] as string, DDB_KEY_PREFIXES.IMG);
    return itemToImage(item, imageId);
  });
}

/**
 * Delete an image row and its tags. Tags live in `PK=IMG#<imageId>` so they
 * are collected first and batched with the image-row delete (25/chunk per
 * AWS limit, matching `deleteFarm`).
 *
 * Not transactional: a failed tag delete leaves an orphan row that is
 * invisible (its image_id no longer resolves). S3 cleanup is the caller's
 * job — DDB and S3 have independent failure modes.
 */
export async function deleteImage(image: Image): Promise<void> {
  const tagsResult = await ddb.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
      ExpressionAttributeValues: {
        ':pk': pk.image(image.id),
        ':prefix': DDB_KEY_PREFIXES.TAG,
      },
      ProjectionExpression: 'PK, SK',
    }),
  );

  const deleteRequests: Array<{ DeleteRequest: { Key: { PK: string; SK: string } } }> = [
    {
      DeleteRequest: {
        Key: { PK: pk.bed(image.bed_id), SK: sk.image(image.captured_at, image.id) },
      },
    },
    ...(tagsResult.Items ?? []).map((item) => ({
      DeleteRequest: { Key: { PK: item['PK'] as string, SK: item['SK'] as string } },
    })),
  ];

  for (let i = 0; i < deleteRequests.length; i += 25) {
    const chunk = deleteRequests.slice(i, i + 25);
    const result = await ddb.send(
      new BatchWriteCommand({ RequestItems: { [TABLE_NAME]: chunk } }),
    );
    const unprocessed = result.UnprocessedItems?.[TABLE_NAME];
    if (unprocessed && unprocessed.length > 0) {
      const retry = await ddb.send(
        new BatchWriteCommand({ RequestItems: { [TABLE_NAME]: unprocessed } }),
      );
      const stillUnprocessed = retry.UnprocessedItems?.[TABLE_NAME];
      if (stillUnprocessed && stillUnprocessed.length > 0) {
        console.warn(`[deleteImage] ${stillUnprocessed.length} items still unprocessed after retry for image ${image.id}`);
      }
    }
  }
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

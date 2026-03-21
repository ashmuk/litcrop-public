import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
  UpdateCommand,
  TransactWriteCommand,
  type QueryCommandInput,
} from '@aws-sdk/lib-dynamodb';
import type { Farm, Field, Bed, Plot, Image, Tag, TagValue, PlotStatus } from '@litcrop/shared';
import { DDB_KEY_PREFIXES } from '@litcrop/shared';
import { NotFoundError } from '../errors';

// ── Conversation history type ─────────────────────────────────────

/** Serializable message record for DynamoDB storage. Matches MessageParam shape. */
export interface StoredMessage {
  role: 'user' | 'assistant';
  content: unknown; // string | content block array (MessageParam['content'])
}

// ── Configuration ────────────────────────────────────────────────

const TABLE_NAME = process.env.TABLE_NAME ?? 'litcrop-poc';
const AWS_REGION = process.env.AWS_REGION ?? 'ap-northeast-1';
const GSI1_INDEX = 'GSI1';
const GSI2_INDEX = 'GSI2';

// ── Client ───────────────────────────────────────────────────────

const ddbClient = new DynamoDBClient({ region: AWS_REGION });
const ddb = DynamoDBDocumentClient.from(ddbClient, {
  marshallOptions: { removeUndefinedValues: true },
});

// ── Key builders ─────────────────────────────────────────────────

const pk = {
  farm: (farmId: string) => `${DDB_KEY_PREFIXES.FARM}${farmId}`,
  field: (fieldId: string) => `${DDB_KEY_PREFIXES.FIELD}${fieldId}`,
  bed: (bedId: string) => `${DDB_KEY_PREFIXES.BED}${bedId}`,
  plot: (plotId: string) => `${DDB_KEY_PREFIXES.PLOT}${plotId}`,
  image: (imageId: string) => `${DDB_KEY_PREFIXES.IMG}${imageId}`,
  tag: (tagId: string) => `${DDB_KEY_PREFIXES.TAG}${tagId}`,
};

const sk = {
  meta: () => DDB_KEY_PREFIXES.META,
  field: (position: number, fieldId: string) => `${DDB_KEY_PREFIXES.FIELD}${String(position).padStart(6, '0')}#${fieldId}`,
  bed: (position: number, bedId: string) => `${DDB_KEY_PREFIXES.BED}${String(position).padStart(6, '0')}#${bedId}`,
  plot: (plotId: string) => `${DDB_KEY_PREFIXES.PLOT}${plotId}`,
  image: (capturedAt: string, imageId: string) => `${DDB_KEY_PREFIXES.IMG}${capturedAt}#${imageId}`,
  tag: (createdAt: string, tagId: string) => `${DDB_KEY_PREFIXES.TAG}${createdAt}#${tagId}`,
};

// ── Pagination helpers ────────────────────────────────────────────

function encodeCursor(lastKey: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(lastKey)).toString('base64url');
}

function decodeCursor(cursor: string, expectedPkPrefix: string): Record<string, unknown> {
  const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf-8'));
  // S4: Validate decoded PK matches the caller's expected prefix to prevent
  // cross-user data access via crafted cursors.
  const pk = decoded['PK'];
  if (typeof pk !== 'string' || !pk.startsWith(expectedPkPrefix)) {
    const err = new Error('Invalid cursor: PK mismatch');
    err.name = 'ValidationException';
    throw err;
  }
  return decoded;
}

// ── Item mappers ─────────────────────────────────────────────────

function itemToFarm(item: Record<string, unknown>, farmId: string): Farm {
  return {
    id: farmId,
    user_id: (item['user_id'] as string) ?? '',
    name: item['name'] as string,
    description: item['description'] as string | undefined,
    latitude: item['latitude'] as number,
    longitude: item['longitude'] as number,
    elevation_m: item['elevation_m'] as number | undefined,
    climate_zone: item['climate_zone'] as string | undefined,
    locale: (item['locale'] as Farm['locale']) ?? 'en',
    theme: (item['theme'] as Farm['theme']) ?? 'system',
    created_at: item['created_at'] as string,
  };
}

function itemToField(item: Record<string, unknown>, farmId: string, fieldId: string): Field {
  return {
    id: fieldId,
    farm_id: farmId,
    name: item['name'] as string,
    position: item['position'] as number,
  };
}

function itemToBed(item: Record<string, unknown>, fieldId: string, bedId: string): Bed {
  return {
    id: bedId,
    field_id: fieldId,
    name: item['name'] as string,
    position: item['position'] as number,
  };
}

function itemToPlot(item: Record<string, unknown>, plotId: string): Plot {
  return {
    id: plotId,
    bed_id: item['bed_id'] as string,
    label: item['label'] as string,
    crop_type: item['crop_type'] as string,
    crop_variety: item['crop_variety'] as string,
    planted_at: item['planted_at'] as string,
    expected_harvest: item['expected_harvest'] as string,
    notes: item['notes'] as string | undefined,
    latest_status: (item['latest_status'] as PlotStatus) ?? 'no_data',
    farm_id: item['farm_id'] as string,
  };
}

function itemToImage(item: Record<string, unknown>, imageId: string): Image {
  return {
    id: imageId,
    plot_id: item['plot_id'] as string,
    bed_id: item['bed_id'] as string,
    node_id: item['node_id'] as string,
    captured_at: item['captured_at'] as string,
    uploaded_at: item['uploaded_at'] as string,
    storage_key: item['storage_key'] as string,
    thumbnail_key: item['thumbnail_key'] as string | undefined,
    trigger: item['trigger'] as Image['trigger'],
    content_type: item['content_type'] as string,
    size_bytes: item['size_bytes'] as number,
    metadata: item['metadata'] as Record<string, unknown> | undefined,
  };
}

function itemToTag(item: Record<string, unknown>, tagId: string): Tag {
  return {
    id: tagId,
    image_id: item['image_id'] as string,
    tag: item['tag'] as TagValue,
    note: item['note'] as string | undefined,
    created_at: item['created_at'] as string,
  };
}

// Extract entity ID from a composite key, e.g. "FIELD#pos#<id>" → "<id>"
function extractIdFromSk(skValue: string, prefix: string): string {
  const withoutPrefix = skValue.slice(prefix.length);
  // For keys with position padding: "000001#<uuid>", extract uuid after last #
  const lastHash = withoutPrefix.lastIndexOf('#');
  return lastHash >= 0 ? withoutPrefix.slice(lastHash + 1) : withoutPrefix;
}

// ── Repository ───────────────────────────────────────────────────

export class DynamoRepository {
  // 1. Get farm metadata
  async getFarm(farmId: string): Promise<Farm> {
    const result = await ddb.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: { PK: pk.farm(farmId), SK: sk.meta() },
      }),
    );
    if (!result.Item) throw new NotFoundError(`Farm not found: ${farmId}`);
    return itemToFarm(result.Item, farmId);
  }

  // 2. Get all fields for a farm (ordered by position via SK prefix sort)
  async getFieldsForFarm(farmId: string): Promise<Field[]> {
    const result = await ddb.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
        ExpressionAttributeValues: {
          ':pk': pk.farm(farmId),
          ':prefix': DDB_KEY_PREFIXES.FIELD,
        },
      }),
    );
    return (result.Items ?? []).map((item) => {
      const fieldId = extractIdFromSk(item['SK'] as string, DDB_KEY_PREFIXES.FIELD);
      return itemToField(item, farmId, fieldId);
    });
  }

  // 2b. Get all beds for a field
  async getBedsForField(fieldId: string): Promise<Bed[]> {
    const result = await ddb.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
        ExpressionAttributeValues: {
          ':pk': pk.field(fieldId),
          ':prefix': DDB_KEY_PREFIXES.BED,
        },
      }),
    );
    return (result.Items ?? []).map((item) => {
      const bedId = extractIdFromSk(item['SK'] as string, DDB_KEY_PREFIXES.BED);
      return itemToBed(item, fieldId, bedId);
    });
  }

  // 3. Get all plots for a farm via GSI2
  async getPlotsForFarm(farmId: string): Promise<Plot[]> {
    const result = await ddb.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: GSI2_INDEX,
        KeyConditionExpression: 'GSI2PK = :pk',
        ExpressionAttributeValues: {
          ':pk': pk.farm(farmId),
        },
      }),
    );
    return (result.Items ?? []).map((item) => {
      const plotId = extractIdFromSk(item['GSI2SK'] as string, DDB_KEY_PREFIXES.PLOT);
      return itemToPlot(item, plotId);
    });
  }

  // 4. Get plot by ID via GSI1
  async getPlotById(plotId: string): Promise<Plot> {
    const result = await ddb.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: GSI1_INDEX,
        KeyConditionExpression: 'GSI1PK = :pk AND GSI1SK = :sk',
        ExpressionAttributeValues: {
          ':pk': pk.plot(plotId),
          ':sk': sk.meta(),
        },
        Limit: 1,
      }),
    );
    const item = result.Items?.[0];
    if (!item) throw new NotFoundError(`Plot not found: ${plotId}`);
    return itemToPlot(item, plotId);
  }

  // 5. Get images for a plot (paginated, newest first)
  async getImagesForPlot(
    plotId: string,
    limit = 20,
    cursor?: string,
  ): Promise<{ items: Image[]; nextCursor: string | null }> {
    const queryInput: QueryCommandInput = {
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
      ExpressionAttributeValues: {
        ':pk': pk.plot(plotId),
        ':prefix': DDB_KEY_PREFIXES.IMG,
      },
      ScanIndexForward: false,
      Limit: limit,
    };

    if (cursor) {
      try {
        queryInput.ExclusiveStartKey = decodeCursor(cursor, pk.plot(plotId));
      } catch {
        // Malformed base64url, non-JSON, or PK mismatch: treat as a client error
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

  // 6. Get image by ID via GSI1
  async getImageById(imageId: string): Promise<Image> {
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

  // 7. Get tags for an image
  async getTagsForImage(imageId: string): Promise<Tag[]> {
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

  // 8. Write tag + 9. Update plot status
  //
  // SF-4: accepts bed_id directly from the caller (read from the Image record,
  // which stores it at upload time). This removes the PoC-era race condition where
  // two concurrent tag writes would both do a GSI1 read, then race on the UpdateItem.
  async createTag(
    imageId: string,
    plotId: string,
    bedId: string,
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

    // 8. PutItem for the tag
    await ddb.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          PK: pk.image(imageId),
          SK: sk.tag(createdAt, tagId),
          ...tag,
        },
      }),
    );

    // 9. Update plot status using bed_id from the Image record (SF-4).
    // No intermediate getPlotById call needed — bed_id was denormalized at image
    // upload time, eliminating the non-atomic read-then-write race condition.
    await ddb.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: {
          PK: pk.bed(bedId),
          SK: sk.plot(plotId),
        },
        UpdateExpression: 'SET latest_status = :status',
        ExpressionAttributeValues: {
          ':status': tagValue as PlotStatus,
        },
      }),
    );

    return tag;
  }

  // ── Write operations ─────────────────────────────────────────────

  async createFarm(
    farmId: string,
    userId: string,
    data: Omit<Farm, 'id' | 'user_id' | 'created_at'>,
  ): Promise<Farm> {
    const createdAt = new Date().toISOString();
    const farm: Farm = { id: farmId, user_id: userId, ...data, created_at: createdAt };

    // Atomic write: farm item + user→farm index (one farm per user constraint)
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
          {
            Put: {
              TableName: TABLE_NAME,
              Item: {
                PK: `USER#${userId}`,
                SK: '#FARM',
                farm_id: farmId,
              },
              // Ensures only one farm per Cognito user
              ConditionExpression: 'attribute_not_exists(PK)',
            },
          },
        ],
      }),
    );

    return farm;
  }

  /** Look up the farm owned by a Cognito user. Returns null if none. */
  async getFarmForUser(userId: string): Promise<Farm | null> {
    const result = await ddb.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: { PK: `USER#${userId}`, SK: '#FARM' },
      }),
    );
    if (!result.Item) return null;
    return this.getFarm(result.Item['farm_id'] as string);
  }

  async createField(farmId: string, name: string, position: number): Promise<Field> {
    const fieldId = crypto.randomUUID();
    await ddb.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          PK: pk.farm(farmId),
          SK: sk.field(position, fieldId),
          id: fieldId,
          farm_id: farmId,
          name,
          position,
        },
      }),
    );
    return { id: fieldId, farm_id: farmId, name, position };
  }

  async createBed(fieldId: string, name: string, position: number): Promise<Bed> {
    const bedId = crypto.randomUUID();
    await ddb.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          PK: pk.field(fieldId),
          SK: sk.bed(position, bedId),
          id: bedId,
          field_id: fieldId,
          name,
          position,
        },
      }),
    );
    return { id: bedId, field_id: fieldId, name, position };
  }

  async createPlot(
    bedId: string,
    farmId: string,
    data: {
      label: string;
      crop_type: string;
      crop_variety: string;
      planted_at: string;
      expected_harvest: string;
      notes?: string;
    },
  ): Promise<Plot> {
    const plotId = crypto.randomUUID();
    const plot: Plot = {
      id: plotId,
      bed_id: bedId,
      farm_id: farmId,
      label: data.label,
      crop_type: data.crop_type,
      crop_variety: data.crop_variety,
      planted_at: data.planted_at,
      expected_harvest: data.expected_harvest,
      notes: data.notes,
      latest_status: 'no_data',
    };
    await ddb.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          PK: pk.bed(bedId),
          SK: sk.plot(plotId),
          // GSI2: farm-level plot queries (getPlotsForFarm)
          GSI2PK: pk.farm(farmId),
          GSI2SK: sk.plot(plotId),
          ...plot,
        },
      }),
    );
    return plot;
  }

  async updateFarm(
    farmId: string,
    updates: Partial<Pick<Farm, 'name' | 'description' | 'locale' | 'theme'>>,
  ): Promise<void> {
    const expressions: string[] = [];
    const values: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        expressions.push(`#${key} = :${key}`);
        values[`:${key}`] = value;
      }
    }

    if (expressions.length === 0) return;

    const names: Record<string, string> = {};
    for (const key of Object.keys(updates)) {
      names[`#${key}`] = key;
    }

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

  // Get all plots for a specific bed
  async getPlotsForBed(bedId: string): Promise<Plot[]> {
    const result = await ddb.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
        ExpressionAttributeValues: {
          ':pk': pk.bed(bedId),
          ':prefix': DDB_KEY_PREFIXES.PLOT,
        },
      }),
    );
    return (result.Items ?? []).map((item) => {
      const plotId = extractIdFromSk(item['SK'] as string, DDB_KEY_PREFIXES.PLOT);
      return itemToPlot(item, plotId);
    });
  }

  // Get the most recent image for a plot (null if none)
  async getLatestImageForPlot(plotId: string): Promise<Image | null> {
    const result = await ddb.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
        ExpressionAttributeValues: {
          ':pk': pk.plot(plotId),
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

  async createImage(
    plotId: string,
    imageId: string,
    data: Omit<Image, 'id' | 'plot_id'>,
  ): Promise<Image> {
    const image: Image = { id: imageId, plot_id: plotId, ...data };
    // bed_id is included in `data` (SF-4) and spread into the DDB item below.

    await ddb.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          PK: pk.plot(plotId),
          SK: sk.image(data.captured_at, imageId),
          // GSI1 for direct lookup
          GSI1PK: pk.image(imageId),
          GSI1SK: sk.meta(),
          ...image,
        },
      }),
    );

    return image;
  }

  /**
   * Set thumbnail_key on an image item after async thumbnail generation.
   * Called by the thumbnail Lambda via GSI1 query (PK + SK unknown at call site).
   */
  async updateImageThumbnailKey(imageId: string, thumbnailKey: string): Promise<void> {
    // First resolve the actual PK/SK via GSI1 (thumbnail Lambda only knows imageId)
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

  // ── Conversation history (chat multi-turn) ───────────────────────
  // Key pattern: PK = CONV#<conversationId>, SK = #HISTORY
  // TTL: 24 hours from last write.

  async getConversationHistory(conversationId: string, userId: string): Promise<StoredMessage[]> {
    const result = await ddb.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: { PK: `${DDB_KEY_PREFIXES.CONV}${conversationId}`, SK: '#HISTORY' },
      }),
    );
    if (!result.Item) return [];
    // Ownership check: reject history belonging to another user
    if (result.Item['user_id'] !== userId) return [];
    return (result.Item['messages'] as StoredMessage[]) ?? [];
  }

  async saveConversationHistory(
    conversationId: string,
    messages: StoredMessage[],
    userId: string,
  ): Promise<void> {
    const ttl = Math.floor(Date.now() / 1000) + 24 * 3600;
    await ddb.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          PK: `${DDB_KEY_PREFIXES.CONV}${conversationId}`,
          SK: '#HISTORY',
          messages,
          user_id: userId,
          ttl,
          updated_at: new Date().toISOString(),
        },
      }),
    );
  }

  /**
   * Count entity types across the table for admin observability.
   * Uses paginated scans with Select:COUNT — acceptable at MVP scale.
   */
  async getStats(): Promise<{ farms: number; users: number; plots: number }> {
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

    const [farms, users, plots] = await Promise.all([
      countScan('begins_with(PK, :p) AND SK = :s', { ':p': 'FARM#', ':s': '#META' }),
      countScan('begins_with(PK, :p)', { ':p': 'USER#' }),
      countScan('begins_with(SK, :s)', { ':s': 'PLOT#' }),
    ]);

    return { farms, users, plots };
  }
}

export const dynamoRepo = new DynamoRepository();

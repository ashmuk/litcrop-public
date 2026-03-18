import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
  type QueryCommandInput,
} from '@aws-sdk/lib-dynamodb';
import type { Farm, Field, Bed, Plot, Image, Tag, TagValue, PlotStatus } from '@litcrop/shared';
import { NotFoundError } from '../errors';

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
  farm: (farmId: string) => `FARM#${farmId}`,
  field: (fieldId: string) => `FIELD#${fieldId}`,
  bed: (bedId: string) => `BED#${bedId}`,
  plot: (plotId: string) => `PLOT#${plotId}`,
  image: (imageId: string) => `IMG#${imageId}`,
  tag: (tagId: string) => `TAG#${tagId}`,
};

const sk = {
  meta: () => '#META',
  field: (position: number, fieldId: string) => `FIELD#${String(position).padStart(6, '0')}#${fieldId}`,
  bed: (position: number, bedId: string) => `BED#${String(position).padStart(6, '0')}#${bedId}`,
  plot: (plotId: string) => `PLOT#${plotId}`,
  image: (capturedAt: string, imageId: string) => `IMG#${capturedAt}#${imageId}`,
  tag: (createdAt: string, tagId: string) => `TAG#${createdAt}#${tagId}`,
};

// ── Pagination helpers ────────────────────────────────────────────

function encodeCursor(lastKey: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(lastKey)).toString('base64url');
}

function decodeCursor(cursor: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(cursor, 'base64url').toString('utf-8'));
}

// ── Item mappers ─────────────────────────────────────────────────

function itemToFarm(item: Record<string, unknown>, farmId: string): Farm {
  return {
    id: farmId,
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
    node_id: item['node_id'] as string,
    captured_at: item['captured_at'] as string,
    uploaded_at: item['uploaded_at'] as string,
    storage_key: item['storage_key'] as string,
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
          ':prefix': 'FIELD#',
        },
      }),
    );
    return (result.Items ?? []).map((item) => {
      const fieldId = extractIdFromSk(item['SK'] as string, 'FIELD#');
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
          ':prefix': 'BED#',
        },
      }),
    );
    return (result.Items ?? []).map((item) => {
      const bedId = extractIdFromSk(item['SK'] as string, 'BED#');
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
      const plotId = extractIdFromSk(item['GSI2SK'] as string, 'PLOT#');
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
        ':prefix': 'IMG#',
      },
      ScanIndexForward: false,
      Limit: limit,
    };

    if (cursor) {
      try {
        queryInput.ExclusiveStartKey = decodeCursor(cursor);
      } catch {
        // Malformed base64url or non-JSON payload: treat as a client error
        const badCursor = new Error('Invalid cursor format');
        badCursor.name = 'ValidationException';
        throw badCursor;
      }
    }

    const result = await ddb.send(new QueryCommand(queryInput));
    const items = (result.Items ?? []).map((item) => {
      // SK = IMG#{capturedAt}#{imageId}
      const skValue = item['SK'] as string;
      const withoutPrefix = skValue.slice('IMG#'.length);
      const lastHash = withoutPrefix.lastIndexOf('#');
      const imageId = withoutPrefix.slice(lastHash + 1);
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
          ':prefix': 'TAG#',
        },
      }),
    );
    return (result.Items ?? []).map((item) => {
      const tagId = extractIdFromSk(item['SK'] as string, 'TAG#');
      return itemToTag(item, tagId);
    });
  }

  // 8. Write tag + 9. Update plot status
  async createTag(
    imageId: string,
    plotId: string,
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

    // 9. Update plot status (latest_status reflects the new tag)
    // First get the plot to obtain the bed_id (needed for PK in base table).
    // NOTE (PoC): This read-then-write is non-atomic. Two concurrent tag writes
    // can both read the same plot and race on the UpdateItem, leaving latest_status
    // reflecting whichever write landed last rather than the chronologically latest tag.
    // Fix at MVP: denormalize bed_id onto the Image record at write time so this
    // UpdateItem can be issued directly without the intermediate GSI1 read.
    const plot = await this.getPlotById(plotId);
    await ddb.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: {
          PK: pk.bed(plot.bed_id),
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
    data: Omit<Farm, 'id' | 'created_at'>,
  ): Promise<Farm> {
    const createdAt = new Date().toISOString();
    const farm: Farm = { id: farmId, ...data, created_at: createdAt };

    await ddb.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          PK: pk.farm(farmId),
          SK: sk.meta(),
          ...farm,
        },
        ConditionExpression: 'attribute_not_exists(PK)',
      }),
    );

    return farm;
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
          ':prefix': 'PLOT#',
        },
      }),
    );
    return (result.Items ?? []).map((item) => {
      const plotId = extractIdFromSk(item['SK'] as string, 'PLOT#');
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
          ':prefix': 'IMG#',
        },
        ScanIndexForward: false,
        Limit: 1,
      }),
    );
    const item = result.Items?.[0];
    if (!item) return null;
    const skValue = item['SK'] as string;
    const withoutPrefix = skValue.slice('IMG#'.length);
    const lastHash = withoutPrefix.lastIndexOf('#');
    const imageId = withoutPrefix.slice(lastHash + 1);
    return itemToImage(item, imageId);
  }

  async createImage(
    plotId: string,
    imageId: string,
    data: Omit<Image, 'id' | 'plot_id'>,
  ): Promise<Image> {
    const image: Image = { id: imageId, plot_id: plotId, ...data };

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
}

export const dynamoRepo = new DynamoRepository();

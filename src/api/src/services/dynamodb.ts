import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
  UpdateCommand,
  TransactWriteCommand,
  BatchWriteCommand,
  type QueryCommandInput,
} from '@aws-sdk/lib-dynamodb';
import type { Farm, Bed, Image, Tag, TagValue, BedStatus, FarmRole, FarmMember, UserProfile } from '@litcrop/shared';
import { DDB_KEY_PREFIXES } from '@litcrop/shared';
import { NotFoundError } from '../errors';

// ── Conversation history type ─────────────────────────────────────

/** Serializable message record for DynamoDB storage. Matches MessageParam shape. */
export interface StoredMessage {
  role: 'user' | 'assistant';
  content: unknown; // string | content block array (MessageParam['content'])
}

// ── Configuration ────────────────────────────────────────────────

const TABLE_NAME = process.env.TABLE_NAME ?? 'litcrop-dev';
if (!process.env.TABLE_NAME) console.warn('[dynamodb] TABLE_NAME not set, falling back to litcrop-dev');
const AWS_REGION = process.env.AWS_REGION ?? 'ap-northeast-1';
const GSI1_INDEX = 'GSI1';

// ── Client ───────────────────────────────────────────────────────

const ddbClient = new DynamoDBClient({ region: AWS_REGION });
const ddb = DynamoDBDocumentClient.from(ddbClient, {
  marshallOptions: { removeUndefinedValues: true },
});

// ── Key builders ─────────────────────────────────────────────────

const pk = {
  farm: (farmId: string) => `${DDB_KEY_PREFIXES.FARM}${farmId}`,
  bed: (bedId: string) => `${DDB_KEY_PREFIXES.BED}${bedId}`,
  image: (imageId: string) => `${DDB_KEY_PREFIXES.IMG}${imageId}`,
  tag: (tagId: string) => `${DDB_KEY_PREFIXES.TAG}${tagId}`,
  user: (userId: string) => `${DDB_KEY_PREFIXES.USER}${userId}`,
};

const sk = {
  meta: () => DDB_KEY_PREFIXES.META,
  profile: () => '#PROFILE',
  bed: (row: number, col: number, bedId: string) =>
    `${DDB_KEY_PREFIXES.BED}${row.toString().padStart(2, '0')}#${col.toString().padStart(2, '0')}#${bedId}`,
  image: (capturedAt: string, imageId: string) => `${DDB_KEY_PREFIXES.IMG}${capturedAt}#${imageId}`,
  tag: (createdAt: string, tagId: string) => `${DDB_KEY_PREFIXES.TAG}${createdAt}#${tagId}`,
  farmMember: (farmId: string) => `${DDB_KEY_PREFIXES.FARM_MEMBER}${farmId}`,
  member: (userId: string) => `${DDB_KEY_PREFIXES.MEMBER}${userId}`,
};

// ── Pagination helpers ────────────────────────────────────────────

function encodeCursor(lastKey: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(lastKey)).toString('base64url');
}

function decodeCursor(cursor: string, expectedPkPrefix: string): Record<string, unknown> {
  const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf-8'));
  // S4: Validate decoded PK matches the caller's expected prefix to prevent
  // cross-user data access via crafted cursors.
  const pkVal = decoded['PK'];
  if (typeof pkVal !== 'string' || !pkVal.startsWith(expectedPkPrefix)) {
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
    grid_rows: (item['grid_rows'] as number) ?? 1,
    grid_cols: (item['grid_cols'] as number) ?? 1,
    created_at: item['created_at'] as string,
  };
}

function itemToBed(item: Record<string, unknown>, farmId: string, bedId: string): Bed {
  return {
    id: bedId,
    farm_id: farmId,
    row: item['row'] as number,
    col: item['col'] as number,
    name: item['name'] as string,
    crop_type: item['crop_type'] as string | undefined,
    crop_variety: item['crop_variety'] as string | undefined,
    planted_at: item['planted_at'] as string | undefined,
    expected_harvest: item['expected_harvest'] as string | undefined,
    notes: item['notes'] as string | undefined,
    latest_status: (item['latest_status'] as BedStatus) ?? 'no_data',
  };
}

function itemToImage(item: Record<string, unknown>, imageId: string): Image {
  return {
    id: imageId,
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

function itemToFarmMember(userId: string, item: Record<string, unknown>): FarmMember {
  return {
    user_id: userId,
    farm_id: item['farm_id'] as string,
    role: item['role'] as FarmRole,
    joined_at: item['joined_at'] as string,
  };
}

function buildMembershipItems(userId: string, farmId: string, role: FarmRole, joinedAt: string) {
  return [
    {
      Put: {
        TableName: TABLE_NAME,
        Item: {
          PK: pk.user(userId),
          SK: sk.farmMember(farmId),
          farm_id: farmId,
          role,
          joined_at: joinedAt,
        },
      },
    },
    {
      Put: {
        TableName: TABLE_NAME,
        Item: {
          PK: pk.farm(farmId),
          SK: sk.member(userId),
          user_id: userId,
          role,
          joined_at: joinedAt,
        },
      },
    },
  ];
}

function itemToUserProfile(item: Record<string, unknown>, userId: string): UserProfile {
  return {
    user_id: userId,
    display_name: (item['display_name'] as string) ?? '',
    preferred_role: (item['preferred_role'] as UserProfile['preferred_role']) ?? 'observer',
    created_at: (item['created_at'] as string) ?? '',
  };
}

// Extract entity ID from a composite key, e.g. "BED#01#01#<id>" → "<id>"
function extractIdFromSk(skValue: string, prefix: string): string {
  const withoutPrefix = skValue.slice(prefix.length);
  // For keys with position padding: "01#01#<uuid>", extract uuid after last #
  const lastHash = withoutPrefix.lastIndexOf('#');
  return lastHash >= 0 ? withoutPrefix.slice(lastHash + 1) : withoutPrefix;
}

/** Generate a bed name from row/col: row 1='A', 2='B', etc. + col number */
function bedName(row: number, col: number): string {
  return `${String.fromCharCode(64 + row)}${col}`;
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

  // 2. Get all beds for a farm (ordered by row/col via SK prefix sort)
  async getBedsForFarm(farmId: string): Promise<Bed[]> {
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

  // 3. Get bed by ID via GSI1
  async getBedById(bedId: string): Promise<Bed> {
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

  // 4. Update bed crop/details
  // Accepts null values to clear fields (DynamoDB REMOVE) and non-null to set.
  async updateBed(
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
        // null means "clear field" — use REMOVE
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

  // 5. Create beds for a farm grid
  async createBedsForFarm(farmId: string, gridRows: number, gridCols: number): Promise<Bed[]> {
    const positions: Array<{ row: number; col: number }> = [];
    for (let row = 1; row <= gridRows; row++) {
      for (let col = 1; col <= gridCols; col++) {
        positions.push({ row, col });
      }
    }
    return this.createBedsForPositions(farmId, positions);
  }

  // 5b. Create beds for specific positions (used when expanding grid)
  async createBedsForPositions(
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

    // BatchWrite in chunks of 25, with one retry for unprocessed items
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

  // 6. Get images for a bed (paginated, newest first)
  async getImagesForBed(
    bedId: string,
    limit = 20,
    cursor?: string,
  ): Promise<{ items: Image[]; nextCursor: string | null }> {
    const queryInput: QueryCommandInput = {
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

  // 7. Get the most recent image for a bed (null if none)
  async getLatestImageForBed(bedId: string): Promise<Image | null> {
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

  // 8. Get image by ID via GSI1
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

  // 9. Get tags for an image
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

  // 9b. Get the most recent tag for an image (null if none)
  async getLatestTagForImage(imageId: string): Promise<Tag | null> {
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

  // 10. Write tag + update bed status
  async createTag(
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
      // PutItem for the tag
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

  // ── Write operations ─────────────────────────────────────────────

  async createFarm(
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

    // Atomic write: farm item + user membership record (both directions)
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
          ...buildMembershipItems(userId, farmId, 'admin', joinedAt),
        ],
      }),
    );

    // Create bed grid after the farm is written
    await this.createBedsForFarm(farmId, gridRows, gridCols);

    return farm;
  }

  /** Count farm memberships for a user, excluding demo farm. */
  async countUserMemberships(userId: string, excludeFarmId?: string): Promise<number> {
    const result = await ddb.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: {
          ':pk': pk.user(userId),
          ':sk': DDB_KEY_PREFIXES.FARM_MEMBER,
          ...(excludeFarmId ? { ':excl': excludeFarmId } : {}),
        },
        ...(excludeFarmId
          ? { FilterExpression: 'farm_id <> :excl', Select: 'ALL_ATTRIBUTES' }
          : { Select: 'COUNT' }),
      }),
    );
    return excludeFarmId ? (result.Items?.length ?? 0) : (result.Count ?? 0);
  }

  /** Look up all farms a Cognito user belongs to. Returns empty array if none. */
  async getFarmsForUser(userId: string): Promise<FarmMember[]> {
    const result = await ddb.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: {
          ':pk': pk.user(userId),
          ':sk': DDB_KEY_PREFIXES.FARM_MEMBER,
        },
      }),
    );
    return (result.Items ?? []).map((item) => itemToFarmMember(userId, item));
  }

  /** Check if a user has membership access to a specific farm. Returns null if not a member. */
  async getFarmMembership(userId: string, farmId: string): Promise<FarmMember | null> {
    const result = await ddb.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: {
          PK: pk.user(userId),
          SK: sk.farmMember(farmId),
        },
      }),
    );
    if (!result.Item) return null;
    return itemToFarmMember(userId, result.Item);
  }

  /** Add a member to a farm (both USER# and FARM# directions). */
  async addFarmMember(userId: string, farmId: string, role: FarmRole): Promise<FarmMember> {
    const joinedAt = new Date().toISOString();
    const [userItem, farmItem] = buildMembershipItems(userId, farmId, role, joinedAt);
    await ddb.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Put: {
              ...userItem.Put,
              ConditionExpression: 'attribute_not_exists(PK)',
            },
          },
          farmItem,
        ],
      }),
    );
    return { user_id: userId, farm_id: farmId, role, joined_at: joinedAt };
  }

  /** List all members of a farm. */
  async getFarmMembers(farmId: string): Promise<Array<{ user_id: string; role: FarmRole; joined_at: string }>> {
    const result = await ddb.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: {
          ':pk': pk.farm(farmId),
          ':sk': DDB_KEY_PREFIXES.MEMBER,
        },
      }),
    );
    return (result.Items ?? []).map((item) => ({
      user_id: item['user_id'] as string,
      role: item['role'] as FarmRole,
      joined_at: item['joined_at'] as string,
    }));
  }

  async updateFarm(
    farmId: string,
    updates: Partial<Pick<Farm, 'name' | 'description' | 'locale' | 'theme' | 'grid_rows' | 'grid_cols'>>,
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

  async createImage(
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
   * Delete a farm and all its associated data:
   * - All bed records (stored under FARM# partition with BED# SK prefix)
   * - All FARM_MEMBER reverse-index records (stored under FARM# partition with MEMBER# SK prefix)
   * - All USER# → FARM_MEMBER# forward-index records for each member
   * - The farm metadata record itself
   *
   * Images are NOT deleted (kept for data retention).
   */
  async deleteFarm(farmId: string): Promise<void> {
    // 1. Query all items under FARM# partition (beds + member reverse records + meta)
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

    // 2. Collect member userIds from MEMBER# SK records so we can remove USER# forward records
    const memberUserIds: string[] = farmItems
      .filter((i) => i.SK.startsWith(DDB_KEY_PREFIXES.MEMBER))
      .map((i) => i.SK.slice(DDB_KEY_PREFIXES.MEMBER.length));

    // 3. Build delete requests for all FARM# partition items
    const deleteRequests: Array<{ DeleteRequest: { Key: { PK: string; SK: string } } }> = farmItems.map(
      (item) => ({ DeleteRequest: { Key: { PK: item.PK, SK: item.SK } } }),
    );

    // 4. Add delete requests for USER# → FARM_MEMBER# forward records
    for (const userId of memberUserIds) {
      deleteRequests.push({
        DeleteRequest: {
          Key: { PK: pk.user(userId), SK: sk.farmMember(farmId) },
        },
      });
    }

    // 5. BatchWrite in chunks of 25 with one retry for unprocessed items
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

  /**
   * Count entity types across the table for admin observability.
   * Uses paginated scans with Select:COUNT — acceptable at MVP scale.
   */
  async getStats(): Promise<{ farms: number; users: number; beds: number }> {
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
      countScan('begins_with(PK, :p)', { ':p': 'USER#' }),
      countScan('begins_with(SK, :s)', { ':s': 'BED#' }),
    ]);

    return { farms, users, beds };
  }

  // ── User Profile ──────────────────────────────────────────────────

  /** Get a user's profile record. Returns null if no profile exists yet. */
  async getUserProfile(userId: string): Promise<UserProfile | null> {
    const result = await ddb.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: { PK: pk.user(userId), SK: sk.profile() },
      }),
    );
    if (!result.Item) return null;
    return itemToUserProfile(result.Item, userId);
  }

  /** Create or update a user's profile record. */
  async upsertUserProfile(
    userId: string,
    data: { display_name?: string; preferred_role?: string },
  ): Promise<UserProfile> {
    const now = new Date().toISOString();
    const setExpressions: string[] = [
      'created_at = if_not_exists(created_at, :now)',
    ];
    const values: Record<string, unknown> = { ':now': now };
    const names: Record<string, string> = {};

    if (data.display_name !== undefined) {
      setExpressions.push('#display_name = :display_name');
      names['#display_name'] = 'display_name';
      values[':display_name'] = data.display_name;
    }
    if (data.preferred_role !== undefined) {
      setExpressions.push('#preferred_role = :preferred_role');
      names['#preferred_role'] = 'preferred_role';
      values[':preferred_role'] = data.preferred_role;
    }

    const result = await ddb.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { PK: pk.user(userId), SK: sk.profile() },
        UpdateExpression: `SET ${setExpressions.join(', ')}`,
        ExpressionAttributeValues: values,
        ...(Object.keys(names).length > 0 ? { ExpressionAttributeNames: names } : {}),
        ReturnValues: 'ALL_NEW',
      }),
    );

    return itemToUserProfile(result.Attributes as Record<string, unknown>, userId);
  }

}

export const dynamoRepo = new DynamoRepository();

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
import type { Farm, Bed, Image, Tag, TagValue, BedStatus, FarmRole, FarmMember, UserProfile, Locale, Theme, TempUnit } from '@litcrop/shared';
import { DDB_KEY_PREFIXES, DEMO_FARM_ID } from '@litcrop/shared';
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
  settings: () => DDB_KEY_PREFIXES.SETTINGS,
  joinRequest: (userId: string) => `${DDB_KEY_PREFIXES.JOIN_REQUEST}${userId}`,
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

export interface UserSettings {
  locale: Locale;
  temp_unit: TempUnit;
  theme: Theme;
  updated_at: string;
}

const DEFAULT_SETTINGS: Omit<UserSettings, 'updated_at'> = {
  locale: 'en',
  temp_unit: 'C',
  theme: 'system',
};

function itemToUserSettings(item: Record<string, unknown>): UserSettings {
  return {
    locale: (item['locale'] as Locale) ?? DEFAULT_SETTINGS.locale,
    temp_unit: (item['temp_unit'] as TempUnit) ?? DEFAULT_SETTINGS.temp_unit,
    theme: (item['theme'] as Theme) ?? DEFAULT_SETTINGS.theme,
    updated_at: (item['updated_at'] as string) ?? '',
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

  /** List all farms in the system (admin-only). Scan with PK prefix + SK filter. */
  async getAllFarms(): Promise<Farm[]> {
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

  /** Remove a member from a farm (deletes both USER# forward and FARM# reverse records). */
  async removeFarmMember(userId: string, farmId: string): Promise<void> {
    const deleteRequests = [
      { DeleteRequest: { Key: { PK: pk.user(userId), SK: sk.farmMember(farmId) } } },
      { DeleteRequest: { Key: { PK: pk.farm(farmId), SK: sk.member(userId) } } },
    ];
    await ddb.send(new BatchWriteCommand({ RequestItems: { [TABLE_NAME]: deleteRequests } }));
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

  /** List all user profiles (admin-only). Scan with PK prefix + SK filter. */
  async getAllUserProfiles(): Promise<UserProfile[]> {
    const profiles: UserProfile[] = [];
    let lastKey: Record<string, unknown> | undefined;
    do {
      const result = await ddb.send(
        new ScanCommand({
          TableName: TABLE_NAME,
          FilterExpression: 'begins_with(PK, :prefix) AND SK = :profile',
          ExpressionAttributeValues: {
            ':prefix': DDB_KEY_PREFIXES.USER,
            ':profile': '#PROFILE',
          },
          ExclusiveStartKey: lastKey,
        }),
      );
      for (const item of result.Items ?? []) {
        const userId = (item['PK'] as string).slice(DDB_KEY_PREFIXES.USER.length);
        profiles.push(itemToUserProfile(item, userId));
      }
      lastKey = result.LastEvaluatedKey;
    } while (lastKey);
    return profiles;
  }

  // ── User Settings ────────────────────────────────────────────────

  /** Get a user's settings. Returns null if no settings saved yet. */
  async getUserSettings(userId: string): Promise<UserSettings | null> {
    const result = await ddb.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: { PK: pk.user(userId), SK: sk.settings() },
      }),
    );
    if (!result.Item) return null;
    return itemToUserSettings(result.Item);
  }

  /** Create or update a user's settings. */
  async upsertUserSettings(
    userId: string,
    data: { locale?: Locale; temp_unit?: TempUnit; theme?: Theme },
  ): Promise<UserSettings> {
    const now = new Date().toISOString();
    const setExpressions: string[] = [
      'locale = if_not_exists(locale, :default_locale)',
      'temp_unit = if_not_exists(temp_unit, :default_temp_unit)',
      'theme = if_not_exists(theme, :default_theme)',
      'updated_at = :now',
    ];
    const values: Record<string, unknown> = {
      ':default_locale': DEFAULT_SETTINGS.locale,
      ':default_temp_unit': DEFAULT_SETTINGS.temp_unit,
      ':default_theme': DEFAULT_SETTINGS.theme,
      ':now': now,
    };

    if (data.locale !== undefined) {
      setExpressions[0] = 'locale = :locale';
      values[':locale'] = data.locale;
    }
    if (data.temp_unit !== undefined) {
      setExpressions[1] = 'temp_unit = :temp_unit';
      values[':temp_unit'] = data.temp_unit;
    }
    if (data.theme !== undefined) {
      setExpressions[2] = 'theme = :theme';
      values[':theme'] = data.theme;
    }

    const result = await ddb.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { PK: pk.user(userId), SK: sk.settings() },
        UpdateExpression: `SET ${setExpressions.join(', ')}`,
        ExpressionAttributeValues: values,
        ReturnValues: 'ALL_NEW',
      }),
    );

    return itemToUserSettings(result.Attributes as Record<string, unknown>);
  }

  // ── Join Requests ──────────────────────────────────────────────────

  /** Create a join request (pending). */
  async createJoinRequest(farmId: string, userId: string, displayName: string): Promise<void> {
    const now = new Date().toISOString();
    await ddb.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          PK: pk.farm(farmId),
          SK: sk.joinRequest(userId),
          GSI1PK: pk.user(userId),
          GSI1SK: `${DDB_KEY_PREFIXES.JOIN_REQUEST}${farmId}`,
          farm_id: farmId,
          user_id: userId,
          status: 'pending',
          display_name: displayName,
          requested_at: now,
          resolved_at: null,
          resolved_by: null,
        },
        ConditionExpression: 'attribute_not_exists(PK)',
      }),
    );
  }

  /** Get a specific join request. */
  async getJoinRequest(farmId: string, userId: string): Promise<{ status: string; requested_at: string; display_name: string } | null> {
    const result = await ddb.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: { PK: pk.farm(farmId), SK: sk.joinRequest(userId) },
      }),
    );
    if (!result.Item) return null;
    return {
      status: result.Item['status'] as string,
      requested_at: result.Item['requested_at'] as string,
      display_name: (result.Item['display_name'] as string) ?? '',
    };
  }

  /** List join requests for a farm (optionally filtered by status). */
  async getJoinRequestsForFarm(farmId: string, statusFilter?: string): Promise<Array<{ user_id: string; status: string; display_name: string; requested_at: string; resolved_at: string | null }>> {
    const result = await ddb.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
        ExpressionAttributeValues: {
          ':pk': pk.farm(farmId),
          ':prefix': DDB_KEY_PREFIXES.JOIN_REQUEST,
        },
      }),
    );
    const items = (result.Items ?? []).map((item) => ({
      user_id: (item['user_id'] as string),
      status: (item['status'] as string),
      display_name: (item['display_name'] as string) ?? '',
      requested_at: (item['requested_at'] as string),
      resolved_at: (item['resolved_at'] as string) ?? null,
    }));
    if (statusFilter && statusFilter !== 'all') {
      return items.filter((i) => i.status === statusFilter);
    }
    return items;
  }

  /** Approve a join request atomically: update status + create FARM_MEMBER in a transaction. */
  async approveJoinRequest(farmId: string, userId: string, resolvedBy: string): Promise<void> {
    const now = new Date().toISOString();
    await ddb.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Update: {
              TableName: TABLE_NAME,
              Key: { PK: pk.farm(farmId), SK: sk.joinRequest(userId) },
              UpdateExpression: 'SET #status = :approved, resolved_at = :now, resolved_by = :by',
              ConditionExpression: '#status = :pending',
              ExpressionAttributeNames: { '#status': 'status' },
              ExpressionAttributeValues: { ':approved': 'approved', ':pending': 'pending', ':now': now, ':by': resolvedBy },
            },
          },
          ...membershipTransactItems(farmId, userId, 'observer', now),
        ],
      }),
    );
  }

  /** Reject a join request. */
  async rejectJoinRequest(farmId: string, userId: string, resolvedBy: string): Promise<void> {
    const now = new Date().toISOString();
    await ddb.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { PK: pk.farm(farmId), SK: sk.joinRequest(userId) },
        UpdateExpression: 'SET #status = :rejected, resolved_at = :now, resolved_by = :by',
        ConditionExpression: '#status = :pending',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: { ':rejected': 'rejected', ':pending': 'pending', ':now': now, ':by': resolvedBy },
      }),
    );
  }

  /** Get a user's outgoing join requests via GSI1. */
  async getMyJoinRequests(userId: string): Promise<Array<{ farm_id: string; status: string; requested_at: string }>> {
    const result = await ddb.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: GSI1_INDEX,
        KeyConditionExpression: 'GSI1PK = :pk AND begins_with(GSI1SK, :prefix)',
        ExpressionAttributeValues: {
          ':pk': pk.user(userId),
          ':prefix': DDB_KEY_PREFIXES.JOIN_REQUEST,
        },
      }),
    );
    return (result.Items ?? []).map((item) => ({
      farm_id: (item['farm_id'] as string),
      status: (item['status'] as string),
      requested_at: (item['requested_at'] as string),
    }));
  }

  /** Get discoverable farms (where discoverable != false). Excludes demo farm. */
  async getDiscoverableFarms(): Promise<Farm[]> {
    const allFarms = await this.getAllFarms();
    return allFarms.filter((f) => f.id !== DEMO_FARM_ID);
  }

}

export const dynamoRepo = new DynamoRepository();

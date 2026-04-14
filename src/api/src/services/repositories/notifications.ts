import { GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import type { NotificationType, Notification } from '@litcrop/shared';
import { DDB_KEY_PREFIXES, NOTIFICATION_TTL_DAYS } from '@litcrop/shared';
import { ddb, TABLE_NAME, pk, sk } from './_infrastructure';
import type { NotificationPrefs } from './_types';

export async function getNotificationPrefs(userId: string): Promise<NotificationPrefs | null> {
  const result = await ddb.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: pk.user(userId), SK: '#NOTIFICATION_PREFS' },
    }),
  );
  if (!result.Item) return null;
  return {
    prefs: result.Item['prefs'] as Record<string, boolean>,
    updated_at: result.Item['updated_at'] as string,
  };
}

export async function upsertNotificationPrefs(
  userId: string,
  prefs: Record<string, boolean>,
): Promise<NotificationPrefs> {
  const now = new Date().toISOString();
  await ddb.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: pk.user(userId),
        SK: '#NOTIFICATION_PREFS',
        prefs,
        updated_at: now,
      },
    }),
  );
  return { prefs, updated_at: now };
}

// ── In-app notifications (#391) ─────────────────────────────────

function ttlEpoch(): number {
  return Math.floor(Date.now() / 1000) + NOTIFICATION_TTL_DAYS * 86400;
}

function itemToNotification(item: Record<string, unknown>): Notification {
  const skVal = item['SK'] as string;
  // SK format: NOTIF#<timestamp>#<id> — extract id after second #
  const parts = skVal.slice(DDB_KEY_PREFIXES.NOTIF.length).split('#');
  const id = parts[1] ?? parts[0];
  return {
    id,
    user_id: (item['PK'] as string).slice(DDB_KEY_PREFIXES.USER.length),
    type: item['notif_type'] as NotificationType,
    title: (item['title'] as string) ?? '',
    body: (item['body'] as string) ?? '',
    farm_id: item['farm_id'] as string | undefined,
    farm_name: item['farm_name'] as string | undefined,
    read: (item['read'] as boolean) ?? false,
    created_at: (item['created_at'] as string) ?? '',
  };
}

export async function createNotification(
  userId: string,
  data: { type: NotificationType; title: string; body: string; farm_id?: string; farm_name?: string },
): Promise<Notification> {
  const now = new Date().toISOString();
  const notifId = crypto.randomUUID();
  const item = {
    PK: pk.user(userId),
    SK: sk.notif(now, notifId),
    notif_type: data.type,
    title: data.title,
    body: data.body,
    farm_id: data.farm_id ?? null,
    farm_name: data.farm_name ?? null,
    read: false,
    created_at: now,
    ttl: ttlEpoch(),
  };
  await ddb.send(new PutCommand({ TableName: TABLE_NAME, Item: item }));
  return {
    id: notifId,
    user_id: userId,
    type: data.type,
    title: data.title,
    body: data.body,
    farm_id: data.farm_id,
    farm_name: data.farm_name,
    read: false,
    created_at: now,
  };
}

export async function getUserNotifications(
  userId: string,
  limit = 20,
): Promise<Notification[]> {
  const result = await ddb.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
      ExpressionAttributeValues: {
        ':pk': pk.user(userId),
        ':prefix': DDB_KEY_PREFIXES.NOTIF,
      },
      ScanIndexForward: false, // newest first
      Limit: limit,
    }),
  );
  return (result.Items ?? []).map(itemToNotification);
}

export async function getUnreadCount(userId: string): Promise<number> {
  let total = 0;
  let lastKey: Record<string, unknown> | undefined;
  do {
    const result = await ddb.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
        FilterExpression: '#read = :false',
        ExpressionAttributeNames: { '#read': 'read' },
        ExpressionAttributeValues: {
          ':pk': pk.user(userId),
          ':prefix': DDB_KEY_PREFIXES.NOTIF,
          ':false': false,
        },
        Select: 'COUNT',
        ExclusiveStartKey: lastKey,
      }),
    );
    total += result.Count ?? 0;
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);
  return total;
}

export async function markAsRead(userId: string, notifId: string): Promise<boolean> {
  // notifId is embedded in the SK (NOTIF#<timestamp>#<id>); paginate to handle
  // users with many notifications where the target may be beyond the first page.
  let lastKey: Record<string, unknown> | undefined;
  do {
    const result = await ddb.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
        FilterExpression: 'contains(SK, :notifId)',
        ExpressionAttributeValues: {
          ':pk': pk.user(userId),
          ':prefix': DDB_KEY_PREFIXES.NOTIF,
          ':notifId': notifId,
        },
        ExclusiveStartKey: lastKey,
      }),
    );
    const item = result.Items?.[0];
    if (item) {
      await ddb.send(
        new UpdateCommand({
          TableName: TABLE_NAME,
          Key: { PK: pk.user(userId), SK: item['SK'] as string },
          UpdateExpression: 'SET #read = :true',
          ExpressionAttributeNames: { '#read': 'read' },
          ExpressionAttributeValues: { ':true': true },
        }),
      );
      return true;
    }
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);
  return false;
}

export async function markAllAsRead(userId: string): Promise<number> {
  const allUnread: Record<string, unknown>[] = [];
  let lastKey: Record<string, unknown> | undefined;
  do {
    const result = await ddb.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
        FilterExpression: '#read = :false',
        ExpressionAttributeNames: { '#read': 'read' },
        ExpressionAttributeValues: {
          ':pk': pk.user(userId),
          ':prefix': DDB_KEY_PREFIXES.NOTIF,
          ':false': false,
        },
        ExclusiveStartKey: lastKey,
      }),
    );
    allUnread.push(...(result.Items ?? []));
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);
  await Promise.all(
    allUnread.map((item) =>
      ddb.send(
        new UpdateCommand({
          TableName: TABLE_NAME,
          Key: { PK: pk.user(userId), SK: item['SK'] as string },
          UpdateExpression: 'SET #read = :true',
          ExpressionAttributeNames: { '#read': 'read' },
          ExpressionAttributeValues: { ':true': true },
        }),
      ),
    ),
  );
  return allUnread.length;
}

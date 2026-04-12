import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE_NAME, pk } from './_infrastructure';
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

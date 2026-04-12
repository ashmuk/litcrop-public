import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { DDB_KEY_PREFIXES } from '@litcrop/shared';
import { ddb, TABLE_NAME } from './_infrastructure';
import type { StoredMessage } from './_types';

export async function getConversationHistory(conversationId: string, userId: string): Promise<StoredMessage[]> {
  const result = await ddb.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: `${DDB_KEY_PREFIXES.CONV}${conversationId}`, SK: '#HISTORY' },
    }),
  );
  if (!result.Item) return [];
  if (result.Item['user_id'] !== userId) return [];
  return (result.Item['messages'] as StoredMessage[]) ?? [];
}

export async function saveConversationHistory(
  conversationId: string,
  messages: StoredMessage[],
  userId: string,
): Promise<void> {
  const TTL = Math.floor(Date.now() / 1000) + 24 * 3600;
  await ddb.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: `${DDB_KEY_PREFIXES.CONV}${conversationId}`,
        SK: '#HISTORY',
        messages,
        user_id: userId,
        TTL,
        updated_at: new Date().toISOString(),
      },
    }),
  );
}

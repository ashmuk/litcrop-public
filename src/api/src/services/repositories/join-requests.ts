import { PutCommand, GetCommand, QueryCommand, UpdateCommand, DeleteCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import type { FarmRole } from '@litcrop/shared';
import { DDB_KEY_PREFIXES } from '@litcrop/shared';
import { ddb, TABLE_NAME, pk, sk, GSI1_INDEX } from './_infrastructure';
import { buildMembershipItems } from './_mappers';

export async function createJoinRequest(farmId: string, userId: string, displayName: string, email?: string): Promise<void> {
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
        email: email ?? null,
        requested_at: now,
        resolved_at: null,
        resolved_by: null,
      },
      ConditionExpression: 'attribute_not_exists(PK)',
    }),
  );
}

export async function getJoinRequest(farmId: string, userId: string): Promise<{ status: string; requested_at: string; display_name: string; email: string | null } | null> {
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
    email: (result.Item['email'] as string) ?? null,
  };
}

export async function getJoinRequestsForFarm(farmId: string, statusFilter?: string): Promise<Array<{ user_id: string; status: string; display_name: string; requested_at: string; resolved_at: string | null }>> {
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

export async function approveJoinRequest(farmId: string, userId: string, resolvedBy: string): Promise<void> {
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
        ...buildMembershipItems(userId, farmId, 'staff', now),
      ],
    }),
  );
}

export async function rejectJoinRequest(farmId: string, userId: string, resolvedBy: string): Promise<void> {
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

export async function getMyJoinRequests(userId: string): Promise<Array<{ farm_id: string; status: string; requested_at: string }>> {
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

export async function deleteJoinRequest(farmId: string, userId: string): Promise<void> {
  await ddb.send(
    new DeleteCommand({
      TableName: TABLE_NAME,
      Key: { PK: pk.farm(farmId), SK: sk.joinRequest(userId) },
    }),
  );
}

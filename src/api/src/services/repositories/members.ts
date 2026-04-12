import { GetCommand, QueryCommand, TransactWriteCommand, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';
import type { FarmRole, FarmMember } from '@litcrop/shared';
import { DDB_KEY_PREFIXES } from '@litcrop/shared';
import { ddb, TABLE_NAME, pk, sk } from './_infrastructure';
import { itemToFarmMember, buildMembershipItems } from './_mappers';

export async function countUserMemberships(userId: string, excludeFarmId?: string): Promise<number> {
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

export async function getFarmsForUser(userId: string): Promise<FarmMember[]> {
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

export async function getFarmMembership(userId: string, farmId: string): Promise<FarmMember | null> {
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

export async function removeFarmMember(userId: string, farmId: string): Promise<void> {
  const deleteRequests = [
    { DeleteRequest: { Key: { PK: pk.user(userId), SK: sk.farmMember(farmId) } } },
    { DeleteRequest: { Key: { PK: pk.farm(farmId), SK: sk.member(userId) } } },
  ];
  await ddb.send(new BatchWriteCommand({ RequestItems: { [TABLE_NAME]: deleteRequests } }));
}

export async function addFarmMember(userId: string, farmId: string, role: FarmRole): Promise<FarmMember> {
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

export async function getFarmMembers(farmId: string): Promise<Array<{ user_id: string; role: FarmRole; joined_at: string }>> {
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

export async function updateMemberRole(farmId: string, userId: string, role: FarmRole): Promise<void> {
  await ddb.send(
    new TransactWriteCommand({
      TransactItems: [
        {
          Update: {
            TableName: TABLE_NAME,
            Key: { PK: pk.user(userId), SK: sk.farmMember(farmId) },
            UpdateExpression: 'SET #role = :role',
            ExpressionAttributeNames: { '#role': 'role' },
            ExpressionAttributeValues: { ':role': role },
          },
        },
        {
          Update: {
            TableName: TABLE_NAME,
            Key: { PK: pk.farm(farmId), SK: sk.member(userId) },
            UpdateExpression: 'SET #role = :role',
            ExpressionAttributeNames: { '#role': 'role' },
            ExpressionAttributeValues: { ':role': role },
          },
        },
      ],
    }),
  );
}

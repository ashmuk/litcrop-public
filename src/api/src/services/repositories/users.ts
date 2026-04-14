import { GetCommand, UpdateCommand, ScanCommand, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';
import type { UserProfile, Locale, TempUnit, Theme } from '@litcrop/shared';
import { DDB_KEY_PREFIXES } from '@litcrop/shared';
import { ddb, TABLE_NAME, pk, sk } from './_infrastructure';
import { itemToUserProfile, itemToUserSettings } from './_mappers';
import type { UserSettings } from './_types';
import { DEFAULT_SETTINGS } from './_types';

export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  const result = await ddb.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: pk.user(userId), SK: sk.profile() },
    }),
  );
  if (!result.Item) return null;
  return itemToUserProfile(result.Item, userId);
}

export async function upsertUserProfile(
  userId: string,
  data: { display_name?: string; email?: string; preferred_role?: string; profile_picture_key?: string; profile_picture_thumb_key?: string },
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
  if (data.email !== undefined) {
    setExpressions.push('#email = :email');
    names['#email'] = 'email';
    values[':email'] = data.email;
  }
  if (data.preferred_role !== undefined) {
    setExpressions.push('#preferred_role = :preferred_role');
    names['#preferred_role'] = 'preferred_role';
    values[':preferred_role'] = data.preferred_role;
  }
  if (data.profile_picture_key !== undefined) {
    setExpressions.push('#ppk = :ppk');
    names['#ppk'] = 'profile_picture_key';
    values[':ppk'] = data.profile_picture_key;
  }
  if (data.profile_picture_thumb_key !== undefined) {
    setExpressions.push('#pptk = :pptk');
    names['#pptk'] = 'profile_picture_thumb_key';
    values[':pptk'] = data.profile_picture_thumb_key;
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

export async function getAllUserProfiles(): Promise<UserProfile[]> {
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

export async function getUserSettings(userId: string): Promise<UserSettings | null> {
  const result = await ddb.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: pk.user(userId), SK: sk.settings() },
    }),
  );
  if (!result.Item) return null;
  return itemToUserSettings(result.Item);
}

export async function upsertUserSettings(
  userId: string,
  data: { locale?: Locale; temp_unit?: TempUnit; theme?: Theme },
): Promise<UserSettings> {
  const now = new Date().toISOString();
  const setExpressions: string[] = ['updated_at = :now'];
  const values: Record<string, unknown> = { ':now': now };

  for (const field of ['locale', 'temp_unit', 'theme'] as const) {
    if (data[field] !== undefined) {
      setExpressions.push(`${field} = :${field}`);
      values[`:${field}`] = data[field];
    } else {
      setExpressions.push(`${field} = if_not_exists(${field}, :default_${field})`);
      values[`:default_${field}`] = DEFAULT_SETTINGS[field];
    }
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

export async function deleteUserItems(userId: string): Promise<void> {
  await ddb.send(
    new BatchWriteCommand({
      RequestItems: {
        [TABLE_NAME]: [
          { DeleteRequest: { Key: { PK: pk.user(userId), SK: sk.profile() } } },
          { DeleteRequest: { Key: { PK: pk.user(userId), SK: sk.settings() } } },
        ],
      },
    }),
  );
}

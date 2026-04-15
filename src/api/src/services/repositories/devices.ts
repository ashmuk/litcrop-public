import { PutCommand, QueryCommand, UpdateCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import type { Device, DeviceStatus, StorageStatus, DeviceCapabilities, EffectiveConfig } from '@litcrop/shared';
import { DDB_KEY_PREFIXES } from '@litcrop/shared';
import { ddb, TABLE_NAME, pk, sk, GSI1_INDEX } from './_infrastructure';

function itemToDevice(item: Record<string, unknown>, deviceId: string): Device {
  return {
    device_id: deviceId,
    farm_id: item['farm_id'] as string,
    bed_id: item['bed_id'] as string,
    node_name: item['node_name'] as string,
    status: (item['status'] as DeviceStatus) ?? 'inactive',
    capture_interval: item['capture_interval'] as number,
    resolution: item['resolution'] as string,
    jpeg_quality: item['jpeg_quality'] as number,
    active_window: {
      start: item['active_window_start'] as string,
      end: item['active_window_end'] as string,
    },
    trigger_type: (item['trigger_type'] as Device['trigger_type']) ?? 'scheduled',
    last_seen_at: (item['last_seen_at'] as string) ?? null,
    battery_level: (item['battery_level'] as number) ?? null,
    wifi_signal_dbm: (item['wifi_signal_dbm'] as number) ?? null,
    storage_status: (item['storage_status'] as StorageStatus) ?? null,
    capabilities: (item['capabilities'] as DeviceCapabilities) ?? null,
    test_shot_requested: !!(item['test_shot_requested']),
    // --- #406 config-propagation visibility ---
    last_config_polled_at: (item['last_config_polled_at'] as string) ?? null,
    effective_config: (item['effective_config'] as EffectiveConfig) ?? null,
    created_at: item['created_at'] as string,
    updated_at: item['updated_at'] as string,
  };
}

export async function createDevice(
  farmId: string,
  deviceId: string,
  data: {
    bed_id: string;
    node_name: string;
    device_api_key_hash: string;
    capture_interval: number;
    resolution: string;
    jpeg_quality: number;
    active_window_start: string;
    active_window_end: string;
  },
): Promise<void> {
  const now = new Date().toISOString();
  await ddb.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: pk.farm(farmId),
        SK: sk.device(deviceId),
        GSI1PK: `${DDB_KEY_PREFIXES.DEVICE}${deviceId}`,
        GSI1SK: DDB_KEY_PREFIXES.META,
        device_id: deviceId,
        farm_id: farmId,
        bed_id: data.bed_id,
        node_name: data.node_name,
        device_api_key_hash: data.device_api_key_hash,
        status: 'inactive',
        capture_interval: data.capture_interval,
        resolution: data.resolution,
        jpeg_quality: data.jpeg_quality,
        active_window_start: data.active_window_start,
        active_window_end: data.active_window_end,
        trigger_type: 'scheduled',
        test_shot_requested: false,
        created_at: now,
        updated_at: now,
      },
      ConditionExpression: 'attribute_not_exists(SK)',
    }),
  );
}

export async function getDeviceById(deviceId: string): Promise<(Device & { device_api_key_hash: string }) | null> {
  const result = await ddb.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: GSI1_INDEX,
      KeyConditionExpression: 'GSI1PK = :pk AND GSI1SK = :sk',
      ExpressionAttributeValues: {
        ':pk': `${DDB_KEY_PREFIXES.DEVICE}${deviceId}`,
        ':sk': DDB_KEY_PREFIXES.META,
      },
      Limit: 1,
    }),
  );
  const item = result.Items?.[0];
  if (!item) return null;
  const id = (item['SK'] as string).replace(DDB_KEY_PREFIXES.DEVICE, '');
  return {
    ...itemToDevice(item, id),
    device_api_key_hash: item['device_api_key_hash'] as string,
  };
}

export async function getDevicesForFarm(farmId: string): Promise<Device[]> {
  const allItems: Record<string, unknown>[] = [];
  let lastKey: Record<string, unknown> | undefined;

  do {
    const result = await ddb.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
        ExpressionAttributeValues: {
          ':pk': pk.farm(farmId),
          ':prefix': DDB_KEY_PREFIXES.DEVICE,
        },
        ExclusiveStartKey: lastKey,
      }),
    );
    allItems.push(...(result.Items ?? []));
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);

  return allItems.map((item) => {
    const id = (item['SK'] as string).replace(DDB_KEY_PREFIXES.DEVICE, '');
    return itemToDevice(item, id);
  });
}

export async function updateDeviceConfig(
  farmId: string,
  deviceId: string,
  updates: Partial<{
    node_name: string;
    bed_id: string;
    capture_interval: number;
    resolution: string;
    jpeg_quality: number;
    active_window_start: string;
    active_window_end: string;
  }>,
): Promise<Device> {
  const expressions: string[] = ['#updated_at = :now'];
  const names: Record<string, string> = { '#updated_at': 'updated_at' };
  const values: Record<string, unknown> = { ':now': new Date().toISOString() };

  for (const [key, val] of Object.entries(updates)) {
    if (val !== undefined) {
      const alias = `#${key}`;
      const valAlias = `:${key}`;
      names[alias] = key;
      values[valAlias] = val;
      expressions.push(`${alias} = ${valAlias}`);
    }
  }

  const result = await ddb.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { PK: pk.farm(farmId), SK: sk.device(deviceId) },
      UpdateExpression: `SET ${expressions.join(', ')}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
      ConditionExpression: 'attribute_exists(PK)',
      ReturnValues: 'ALL_NEW',
    }),
  );
  return itemToDevice(result.Attributes as Record<string, unknown>, deviceId);
}

export async function updateDeviceHeartbeat(
  farmId: string,
  deviceId: string,
  health: {
    battery_level?: number | null;
    wifi_signal_dbm?: number | null;
    storage_status?: StorageStatus;
    capabilities?: DeviceCapabilities;
    effective_config?: EffectiveConfig;
  },
): Promise<void> {
  const expressions: string[] = ['#status = :online', '#last_seen_at = :now', '#updated_at = :now'];
  const names: Record<string, string> = {
    '#status': 'status',
    '#last_seen_at': 'last_seen_at',
    '#updated_at': 'updated_at',
  };
  const values: Record<string, unknown> = {
    ':online': 'online',
    ':now': new Date().toISOString(),
  };

  if (health.battery_level !== undefined) {
    names['#battery_level'] = 'battery_level';
    values[':battery_level'] = health.battery_level;
    expressions.push('#battery_level = :battery_level');
  }
  if (health.wifi_signal_dbm !== undefined) {
    names['#wifi_signal_dbm'] = 'wifi_signal_dbm';
    values[':wifi_signal_dbm'] = health.wifi_signal_dbm;
    expressions.push('#wifi_signal_dbm = :wifi_signal_dbm');
  }
  if (health.storage_status !== undefined) {
    names['#storage_status'] = 'storage_status';
    values[':storage_status'] = health.storage_status;
    expressions.push('#storage_status = :storage_status');
  }
  if (health.capabilities !== undefined) {
    names['#capabilities'] = 'capabilities';
    values[':capabilities'] = health.capabilities;
    expressions.push('#capabilities = :capabilities');
  }
  if (health.effective_config !== undefined) {
    names['#effective_config'] = 'effective_config';
    values[':effective_config'] = health.effective_config;
    expressions.push('#effective_config = :effective_config');
  }

  await ddb.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { PK: pk.farm(farmId), SK: sk.device(deviceId) },
      UpdateExpression: `SET ${expressions.join(', ')}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
      ConditionExpression: 'attribute_exists(PK)',
    }),
  );
}

/**
 * #406: Record the timestamp of a successful config fetch so the UI can
 * show freshness. Called from the Pi-facing GET /devices/:id/config
 * handler AFTER authentication succeeds. Tolerates missing devices
 * silently (we don't want to fail the config poll on a telemetry write).
 */
export async function recordConfigPoll(farmId: string, deviceId: string): Promise<void> {
  try {
    await ddb.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { PK: pk.farm(farmId), SK: sk.device(deviceId) },
        UpdateExpression: 'SET #last_config_polled_at = :now',
        ExpressionAttributeNames: { '#last_config_polled_at': 'last_config_polled_at' },
        ExpressionAttributeValues: { ':now': new Date().toISOString() },
        ConditionExpression: 'attribute_exists(PK)',
      }),
    );
  } catch (err) {
    // Best-effort write — do not surface DynamoDB errors to the Pi since
    // the config response itself is still valid. Telemetry loss is
    // preferable to a false 5xx that would flip the device offline.
    // Warn so a regional Dynamo outage that only kills this write is at
    // least visible in CloudWatch, not silent.
    console.warn(`[recordConfigPoll] swallow failure deviceId=${deviceId}`, err);
  }
}

export async function deleteDevice(farmId: string, deviceId: string): Promise<void> {
  await ddb.send(
    new DeleteCommand({
      TableName: TABLE_NAME,
      Key: { PK: pk.farm(farmId), SK: sk.device(deviceId) },
      ConditionExpression: 'attribute_exists(PK)',
    }),
  );
}

export async function setTestShotFlag(farmId: string, deviceId: string, requested: boolean): Promise<void> {
  await ddb.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { PK: pk.farm(farmId), SK: sk.device(deviceId) },
      UpdateExpression: 'SET #tsr = :val, #updated_at = :now',
      ExpressionAttributeNames: { '#tsr': 'test_shot_requested', '#updated_at': 'updated_at' },
      ExpressionAttributeValues: {
        ':val': requested,
        ':now': new Date().toISOString(),
      },
      ConditionExpression: 'attribute_exists(PK)',
    }),
  );
}

export async function countDevicesForFarm(farmId: string): Promise<number> {
  const result = await ddb.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
      ExpressionAttributeValues: {
        ':pk': pk.farm(farmId),
        ':prefix': DDB_KEY_PREFIXES.DEVICE,
      },
      Select: 'COUNT',
    }),
  );
  return result.Count ?? 0;
}

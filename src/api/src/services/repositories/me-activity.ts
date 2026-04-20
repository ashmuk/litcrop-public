import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import type {
  ActivityItem,
  ActivityItemType,
  DiaryActivityItem,
  DeviceActivityItem,
  ImageActivityItem,
  DiaryCategory,
  DiaryEntryType,
  TriggerType,
} from '@litcrop/shared';
import { DDB_KEY_PREFIXES } from '@litcrop/shared';
import { ddb, TABLE_NAME, pk } from './_infrastructure';
import { getFarm } from './farms';
import { getBedsForFarm } from './beds';
import { getFarmsForUser } from './members';
import { getUserProfile } from './users';

// ── Cursor (I8: user-scoped) ─────────────────────────────────────

interface ActivityCursor {
  user_id: string;
  ts: string;
  type: ActivityItemType;
  id: string;
}

export function encodeActivityCursor(c: ActivityCursor): string {
  return Buffer.from(JSON.stringify(c)).toString('base64url');
}

/**
 * Decode an activity cursor and assert it belongs to the caller. This is
 * the I8 defense: user A's cursor must not be usable by user B.
 * Throws a ValidationException on malformed or cross-user cursors so the
 * route handler can map it to a 400.
 */
export function decodeActivityCursor(cursor: string, expectedUserId: string): ActivityCursor {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf-8'));
  } catch {
    const err = new Error('Invalid cursor format');
    err.name = 'ValidationException';
    throw err;
  }
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    typeof (parsed as ActivityCursor).user_id !== 'string' ||
    typeof (parsed as ActivityCursor).ts !== 'string' ||
    typeof (parsed as ActivityCursor).type !== 'string' ||
    typeof (parsed as ActivityCursor).id !== 'string'
  ) {
    const err = new Error('Invalid cursor payload');
    err.name = 'ValidationException';
    throw err;
  }
  const c = parsed as ActivityCursor;
  if (c.user_id !== expectedUserId) {
    const err = new Error('Invalid cursor: user mismatch');
    err.name = 'ValidationException';
    throw err;
  }
  if (c.type !== 'diary' && c.type !== 'device' && c.type !== 'image') {
    const err = new Error('Invalid cursor: unknown type');
    err.name = 'ValidationException';
    throw err;
  }
  return c;
}

// ── Deep-link builders ───────────────────────────────────────────

function diaryDeepLink(farmId: string, entryId: string): string {
  return `/diary?farm=${encodeURIComponent(farmId)}&entry=${encodeURIComponent(entryId)}`;
}

function deviceDeepLink(farmId: string, deviceId: string): string {
  return `/devices?farm=${encodeURIComponent(farmId)}&device=${encodeURIComponent(deviceId)}`;
}

function imageDeepLink(bedId: string, imageId: string): string {
  return `/beds/${encodeURIComponent(bedId)}?image=${encodeURIComponent(imageId)}`;
}

// ── Per-source queries (farm-scoped, filtered by caller) ─────────

async function queryDiaryForUserInFarm(
  farmId: string,
  userId: string,
): Promise<Array<{ id: string; timestamp: string; category: DiaryCategory; entry_type: DiaryEntryType; description: string; bed_id: string | null }>> {
  // Scan the farm's diary block; filter by created_by in-memory.
  const items: Record<string, unknown>[] = [];
  let lastKey: Record<string, unknown> | undefined;
  do {
    const result = await ddb.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
        ExpressionAttributeValues: {
          ':pk': pk.farm(farmId),
          ':prefix': DDB_KEY_PREFIXES.DIARY,
        },
        ExclusiveStartKey: lastKey,
      }),
    );
    items.push(...(result.Items ?? []));
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);
  return items
    .filter((it) => it['created_by'] === userId)
    .map((it) => ({
      id: it['id'] as string,
      timestamp: it['created_at'] as string,
      category: it['category'] as DiaryCategory,
      entry_type: ((it['entry_type'] as DiaryEntryType) ?? 'actual'),
      description: it['description'] as string,
      bed_id: ((it['bed_id'] as string) ?? null),
    }));
}

async function queryDevicesForUserInFarm(
  farmId: string,
  userId: string,
): Promise<Array<{ id: string; timestamp: string; node_name: string; bed_id: string }>> {
  const items: Record<string, unknown>[] = [];
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
    items.push(...(result.Items ?? []));
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);
  return items
    .filter((it) => it['registered_by'] === userId)
    .map((it) => ({
      id: (it['device_id'] as string),
      timestamp: (it['created_at'] as string),
      node_name: (it['node_name'] as string),
      bed_id: (it['bed_id'] as string),
    }));
}

/**
 * Images are bed-partitioned, so we must enumerate beds and scan per bed.
 * Pi-auth reality (#462 issue comment 4280185580): an image belongs to the
 * user's activity when EITHER `uploaded_by = me` (manual UI upload) OR
 * `trigger = 'scheduled'` AND the bed's device was `registered_by = me`
 * (Pi capture under the shared service-user JWT).
 */
async function queryImagesForUserInFarm(
  farmId: string,
  userId: string,
  piBedIds: Set<string>,
): Promise<Array<{ id: string; timestamp: string; bed_id: string; trigger: TriggerType; thumbnail_key: string | null }>> {
  const beds = await getBedsForFarm(farmId);
  const out: Array<{ id: string; timestamp: string; bed_id: string; trigger: TriggerType; thumbnail_key: string | null }> = [];
  for (const bed of beds) {
    const items: Record<string, unknown>[] = [];
    let lastKey: Record<string, unknown> | undefined;
    do {
      const result = await ddb.send(
        new QueryCommand({
          TableName: TABLE_NAME,
          KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
          ExpressionAttributeValues: {
            ':pk': pk.bed(bed.id),
            ':prefix': DDB_KEY_PREFIXES.IMG,
          },
          ExclusiveStartKey: lastKey,
        }),
      );
      items.push(...(result.Items ?? []));
      lastKey = result.LastEvaluatedKey;
    } while (lastKey);
    for (const it of items) {
      const uploadedBy = (it['uploaded_by'] as string | null | undefined) ?? null;
      const trigger = ((it['trigger'] as TriggerType) ?? 'scheduled');
      const isManualMatch = uploadedBy !== null && uploadedBy === userId;
      const isPiMatch = trigger === 'scheduled' && piBedIds.has(bed.id);
      if (!isManualMatch && !isPiMatch) continue;
      out.push({
        id: it['id'] as string,
        timestamp: it['uploaded_at'] as string,
        bed_id: bed.id,
        trigger,
        thumbnail_key: ((it['thumbnail_key'] as string) ?? null),
      });
    }
  }
  return out;
}

// ── Public API ────────────────────────────────────────────────────

export async function getActivityForUser(
  userId: string,
  limit: number,
  cursor?: string,
): Promise<{ items: ActivityItem[]; nextCursor: string | null; totalCount: number }> {
  const decodedCursor = cursor ? decodeActivityCursor(cursor, userId) : null;

  const memberships = await getFarmsForUser(userId);
  const farmIds = memberships.map((m) => m.farm_id);

  // Resolve display name once (same actor on every item — always self).
  const profile = await getUserProfile(userId).catch(() => null);
  const actorName = profile?.display_name ?? null;

  const allItems: ActivityItem[] = [];

  for (const farmId of farmIds) {
    const farm = await getFarm(farmId).catch(() => null);
    const farmName = farm?.name ?? null;

    // Device query doubles as the source of Pi-bed IDs for the image query.
    const [diary, devices] = await Promise.all([
      queryDiaryForUserInFarm(farmId, userId),
      queryDevicesForUserInFarm(farmId, userId),
    ]);
    const piBedIds = new Set(devices.map((d) => d.bed_id));
    const images = await queryImagesForUserInFarm(farmId, userId, piBedIds);

    // Build bed-name map lazily — only for beds referenced by items we'll keep.
    const bedIdsNeeded = new Set<string>();
    for (const d of diary) if (d.bed_id) bedIdsNeeded.add(d.bed_id);
    for (const d of devices) bedIdsNeeded.add(d.bed_id);
    for (const i of images) bedIdsNeeded.add(i.bed_id);
    let bedNameByBedId = new Map<string, string>();
    if (bedIdsNeeded.size > 0) {
      const beds = await getBedsForFarm(farmId);
      bedNameByBedId = new Map(beds.map((b) => [b.id, b.name]));
    }

    for (const d of diary) {
      const item: DiaryActivityItem = {
        id: `diary:${d.id}`,
        type: 'diary',
        timestamp: d.timestamp,
        farm_id: farmId,
        farm_name: farmName,
        actor_id: userId,
        actor_name: actorName,
        deep_link: diaryDeepLink(farmId, d.id),
        diary_category: d.category,
        diary_entry_type: d.entry_type,
        description: d.description,
        bed_id: d.bed_id,
        bed_name: d.bed_id ? (bedNameByBedId.get(d.bed_id) ?? null) : null,
      };
      allItems.push(item);
    }
    for (const dv of devices) {
      const item: DeviceActivityItem = {
        id: `device:${dv.id}`,
        type: 'device',
        timestamp: dv.timestamp,
        farm_id: farmId,
        farm_name: farmName,
        actor_id: userId,
        actor_name: actorName,
        deep_link: deviceDeepLink(farmId, dv.id),
        device_id: dv.id,
        node_name: dv.node_name,
        bed_id: dv.bed_id,
        bed_name: bedNameByBedId.get(dv.bed_id) ?? null,
      };
      allItems.push(item);
    }
    for (const im of images) {
      const item: ImageActivityItem = {
        id: `image:${im.id}`,
        type: 'image',
        timestamp: im.timestamp,
        farm_id: farmId,
        farm_name: farmName,
        actor_id: userId,
        actor_name: actorName,
        deep_link: imageDeepLink(im.bed_id, im.id),
        image_id: im.id,
        bed_id: im.bed_id,
        bed_name: bedNameByBedId.get(im.bed_id) ?? null,
        trigger: im.trigger,
        thumbnail_key: im.thumbnail_key,
      };
      allItems.push(item);
    }
  }

  // DESC sort with stable tiebreaker on id DESC.
  allItems.sort((a, b) => {
    if (a.timestamp !== b.timestamp) return a.timestamp < b.timestamp ? 1 : -1;
    return a.id < b.id ? 1 : -1;
  });

  const totalCount = allItems.length;

  const filtered = decodedCursor
    ? allItems.filter(
        (it) =>
          it.timestamp < decodedCursor.ts ||
          (it.timestamp === decodedCursor.ts && it.id < decodedCursor.id),
      )
    : allItems;

  const page = filtered.slice(0, limit);
  const hasMore = filtered.length > limit;
  const last = page.length > 0 ? page[page.length - 1] : undefined;
  const nextCursor =
    hasMore && last
      ? encodeActivityCursor({ user_id: userId, ts: last.timestamp, type: last.type, id: last.id })
      : null;

  return { items: page, nextCursor, totalCount };
}

/**
 * Activity Log Service — Wave 3 (#207)
 *
 * Subscribes to all 14 domain events from appEvents and persists them as
 * ACTIVITY# items in the single DynamoDB table.
 *
 * Key design:
 *   PK:     ACTIVITY#{YYYY-MM}           — monthly partition (write path)
 *   SK:     {ISO-timestamp}#{eventId}    — time-ordered, unique
 *   GSI2PK: ACTIVITY#ALL                 — global timeline (query path)
 *        or ACTIVITY#FARM#{farmId}       — farm-scoped timeline
 *   GSI2SK: same as SK
 *
 * For events with a farm_id, two items are written:
 *   1. Global:      GSI2PK = ACTIVITY#ALL
 *   2. Farm-scoped: GSI2PK = ACTIVITY#FARM#{farmId}
 *
 * TTL: 90 days (uppercase TTL per CDK definition).
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  BatchWriteCommand,
  QueryCommand,
  type QueryCommandInput,
} from '@aws-sdk/lib-dynamodb';
import { appEvents, type AppEventType, type AppEventMap } from './events';
import { ACTIVITY_TTL_DAYS } from '@litcrop/shared';

// ── Config ───────────────────────────────────────────────────────

const TABLE_NAME = process.env.TABLE_NAME ?? 'litcrop-dev';
const AWS_REGION = process.env.AWS_REGION ?? 'ap-northeast-1';
const GSI2_INDEX = 'GSI2';

// ── DynamoDB client ──────────────────────────────────────────────

const ddbClient = new DynamoDBClient({ region: AWS_REGION });
const ddb = DynamoDBDocumentClient.from(ddbClient, {
  marshallOptions: { removeUndefinedValues: true },
});

// ── Types ────────────────────────────────────────────────────────

export interface ActivityItem {
  id: string;
  event_type: string;
  actor_id: string;
  actor_email: string;
  target_type: string;
  target_id: string;
  target_name: string;
  farm_id?: string;
  details?: Record<string, unknown>;
  created_at: string;
}

interface DomainEventRecord {
  event_type: string;
  actor_id: string;
  actor_email: string;
  target_type: string;
  target_id: string;
  target_name: string;
  farm_id?: string;
  details?: Record<string, unknown>;
}

export interface ActivityFilters {
  from?: string;
  to?: string;
  event_type?: string[];
  actor_id?: string;
  farm_id?: string;
  q?: string;
  cursor?: string;
  limit?: number;
}

export interface ActivityResult {
  activities: ActivityItem[];
  next_cursor?: string;
}

// ── Cursor helpers (mirrors dynamodb.ts pattern) ─────────────────

function encodeCursor(lastKey: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(lastKey)).toString('base64url');
}

function decodeCursor(cursor: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(cursor, 'base64url').toString('utf-8'));
}

// ── recordActivity ───────────────────────────────────────────────

async function recordActivity(event: DomainEventRecord): Promise<void> {
  const now = new Date();
  const eventId = `evt_${crypto.randomUUID().slice(0, 12)}`;
  const timestamp = now.toISOString();
  const yearMonth = timestamp.slice(0, 7); // "2026-04"
  const sk = `${timestamp}#${eventId}`;
  const TTL = Math.floor(now.getTime() / 1000) + ACTIVITY_TTL_DAYS * 86400;

  const baseItem = {
    SK: sk,
    GSI2SK: sk,
    id: eventId,
    event_type: event.event_type,
    actor_id: event.actor_id,
    actor_email: event.actor_email,
    target_type: event.target_type,
    target_id: event.target_id,
    target_name: event.target_name,
    ...(event.farm_id !== undefined ? { farm_id: event.farm_id } : {}),
    ...(event.details !== undefined ? { details: event.details } : {}),
    created_at: timestamp,
    TTL,
  };

  // Item 1: Global timeline
  const globalItem = {
    PK: `ACTIVITY#${yearMonth}`,
    GSI2PK: 'ACTIVITY#ALL',
    ...baseItem,
  };

  const items: Record<string, unknown>[] = [globalItem];

  // Item 2: Farm-scoped timeline (only if farm_id present)
  if (event.farm_id) {
    items.push({
      PK: `ACTIVITY#FARM#${event.farm_id}#${yearMonth}`,
      GSI2PK: `ACTIVITY#FARM#${event.farm_id}`,
      ...baseItem,
    });
  }

  await ddb.send(
    new BatchWriteCommand({
      RequestItems: {
        [TABLE_NAME]: items.map((item) => ({ PutRequest: { Item: item } })),
      },
    }),
  );
}

// ── queryActivities ──────────────────────────────────────────────

export async function queryActivities(filters: ActivityFilters): Promise<ActivityResult> {
  const limit = Math.min(filters.limit ?? 50, 100);
  const gsi2pk = filters.farm_id
    ? `ACTIVITY#FARM#${filters.farm_id}`
    : 'ACTIVITY#ALL';

  // Build KeyConditionExpression
  const exprValues: Record<string, unknown> = { ':gsi2pk': gsi2pk };
  let keyCondition = 'GSI2PK = :gsi2pk';

  const fromDate = filters.from ?? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const toDate = filters.to ?? new Date().toISOString();

  keyCondition += ' AND GSI2SK BETWEEN :from AND :to';
  exprValues[':from'] = fromDate;
  exprValues[':to'] = toDate;

  // Build FilterExpression
  const filterParts: string[] = [];
  const exprNames: Record<string, string> = {};

  if (filters.event_type && filters.event_type.length > 0) {
    const eventTypeParts = filters.event_type.map((et, i) => {
      exprValues[`:et${i}`] = et;
      return `:et${i}`;
    });
    filterParts.push(`event_type IN (${eventTypeParts.join(', ')})`);
  }

  if (filters.actor_id) {
    exprValues[':actor_id'] = filters.actor_id;
    filterParts.push('actor_id = :actor_id');
  }

  const filterExpression = filterParts.length > 0 ? filterParts.join(' AND ') : undefined;

  // Parse cursor
  let exclusiveStartKey: Record<string, unknown> | undefined;
  if (filters.cursor) {
    try {
      exclusiveStartKey = decodeCursor(filters.cursor);
      // Defense-in-depth: reject cursors that belong to a different partition.
      // This prevents partition-hopping even for admin users.
      if (exclusiveStartKey['GSI2PK'] !== gsi2pk) {
        exclusiveStartKey = undefined;
      }
    } catch {
      // Invalid cursor — ignore, start from beginning
    }
  }

  const params: QueryCommandInput = {
    TableName: TABLE_NAME,
    IndexName: GSI2_INDEX,
    KeyConditionExpression: keyCondition,
    ExpressionAttributeValues: exprValues,
    ...(Object.keys(exprNames).length > 0 ? { ExpressionAttributeNames: exprNames } : {}),
    ...(filterExpression ? { FilterExpression: filterExpression } : {}),
    ScanIndexForward: false, // newest first
    Limit: limit * 2, // over-fetch to account for FilterExpression discards
    ...(exclusiveStartKey ? { ExclusiveStartKey: exclusiveStartKey } : {}),
  };

  const result = await ddb.send(new QueryCommand(params));

  let items = (result.Items ?? []) as Record<string, unknown>[];

  // Post-filter: free text search
  if (filters.q) {
    const q = filters.q.toLowerCase();
    items = items.filter((item) => {
      const email = String(item['actor_email'] ?? '').toLowerCase();
      const targetName = String(item['target_name'] ?? '').toLowerCase();
      const details = JSON.stringify(item['details'] ?? '').toLowerCase();
      return email.includes(q) || targetName.includes(q) || details.includes(q);
    });
  }

  // Trim to requested limit
  const truncated = items.slice(0, limit);

  const activities: ActivityItem[] = truncated.map((item) => ({
    id: String(item['id'] ?? ''),
    event_type: String(item['event_type'] ?? ''),
    actor_id: String(item['actor_id'] ?? ''),
    actor_email: String(item['actor_email'] ?? ''),
    target_type: String(item['target_type'] ?? ''),
    target_id: String(item['target_id'] ?? ''),
    target_name: String(item['target_name'] ?? ''),
    ...(item['farm_id'] !== undefined ? { farm_id: String(item['farm_id']) } : {}),
    ...(item['details'] !== undefined ? { details: item['details'] as Record<string, unknown> } : {}),
    created_at: String(item['created_at'] ?? ''),
  }));

  let next_cursor: string | undefined;
  if (result.LastEvaluatedKey) {
    if (filters.q) {
      // When a free-text filter is active, post-filtering may have reduced the page
      // below `limit` even though more data exists in DynamoDB. Always propagate the
      // cursor so the client can fetch the next page and not silently miss results.
      next_cursor = encodeCursor(result.LastEvaluatedKey);
    } else if (truncated.length === limit) {
      // Without post-filtering, only provide a cursor when we hit the page limit —
      // the page is full so there are likely more results.
      next_cursor = encodeCursor(result.LastEvaluatedKey);
    }
  }

  return { activities, next_cursor };
}

// ── Event → DomainEventRecord converters ─────────────────────────

function fromPayload<T extends AppEventType>(
  type: T,
  event: AppEventMap[T],
): DomainEventRecord {
  const p = event.payload as Record<string, unknown>;

  switch (type) {
    case 'user.signup':
      return {
        event_type: type,
        actor_id: event.actor_id,
        actor_email: event.actor_email,
        target_type: 'user',
        target_id: String(p['user_id'] ?? event.actor_id),
        target_name: String(p['display_name'] ?? ''),
        details: { email: p['email'] },
      };

    case 'farm.created':
      return {
        event_type: type,
        actor_id: event.actor_id,
        actor_email: event.actor_email,
        target_type: 'farm',
        target_id: String(p['farm_id'] ?? ''),
        target_name: String(p['farm_name'] ?? ''),
        farm_id: String(p['farm_id'] ?? ''),
      };

    case 'farm.deleted':
      return {
        event_type: type,
        actor_id: event.actor_id,
        actor_email: event.actor_email,
        target_type: 'farm',
        target_id: String(p['farm_id'] ?? ''),
        target_name: String(p['farm_name'] ?? ''),
        farm_id: String(p['farm_id'] ?? ''),
      };

    case 'farm.updated':
      return {
        event_type: type,
        actor_id: event.actor_id,
        actor_email: event.actor_email,
        target_type: 'farm',
        target_id: String(p['farm_id'] ?? ''),
        target_name: String(p['farm_name'] ?? ''),
        farm_id: String(p['farm_id'] ?? ''),
        details: p['changed_fields'] ? { changed_fields: p['changed_fields'] } : undefined,
      };

    case 'bed.updated':
      return {
        event_type: type,
        actor_id: event.actor_id,
        actor_email: event.actor_email,
        target_type: 'bed',
        target_id: String(p['bed_id'] ?? ''),
        target_name: String(p['bed_name'] ?? ''),
        farm_id: String(p['farm_id'] ?? ''),
        details: p['changed_fields'] ? { changed_fields: p['changed_fields'] } : undefined,
      };

    case 'image.uploaded':
      return {
        event_type: type,
        actor_id: event.actor_id,
        actor_email: event.actor_email,
        target_type: 'image',
        target_id: String(p['image_id'] ?? ''),
        target_name: String(p['bed_name'] ?? ''),
        farm_id: String(p['farm_id'] ?? ''),
        details: { bed_id: p['bed_id'] },
      };

    case 'tag.created':
      return {
        event_type: type,
        actor_id: event.actor_id,
        actor_email: event.actor_email,
        target_type: 'image',
        target_id: String(p['image_id'] ?? ''),
        target_name: String(p['tag_value'] ?? ''),
        farm_id: String(p['farm_id'] ?? ''),
        details: { tag_value: p['tag_value'] },
      };

    case 'member.joined':
      return {
        event_type: type,
        actor_id: event.actor_id,
        actor_email: event.actor_email,
        target_type: 'farm',
        target_id: String(p['farm_id'] ?? ''),
        target_name: String(p['farm_name'] ?? ''),
        farm_id: String(p['farm_id'] ?? ''),
        details: { role: p['role'] },
      };

    case 'member.removed':
      return {
        event_type: type,
        actor_id: event.actor_id,
        actor_email: event.actor_email,
        target_type: 'farm',
        target_id: String(p['farm_id'] ?? ''),
        target_name: String(p['farm_name'] ?? ''),
        farm_id: String(p['farm_id'] ?? ''),
        details: { removed_user_id: p['removed_user_id'], removed_user_name: p['removed_user_name'] },
      };

    case 'member.role_changed':
      return {
        event_type: type,
        actor_id: event.actor_id,
        actor_email: event.actor_email,
        target_type: 'user',
        target_id: String(p['target_user_id'] ?? ''),
        target_name: String(p['target_user_name'] ?? ''),
        farm_id: String(p['farm_id'] ?? ''),
        details: { old_role: p['old_role'], new_role: p['new_role'] },
      };

    case 'join_request.submitted':
      return {
        event_type: type,
        actor_id: event.actor_id,
        actor_email: event.actor_email,
        target_type: 'farm',
        target_id: String(p['farm_id'] ?? ''),
        target_name: String(p['farm_name'] ?? ''),
        farm_id: String(p['farm_id'] ?? ''),
        details: { requester_name: p['requester_name'] },
      };

    case 'join_request.approved':
    case 'join_request.rejected':
      return {
        event_type: type,
        actor_id: event.actor_id,
        actor_email: event.actor_email,
        target_type: 'farm',
        target_id: String(p['farm_id'] ?? ''),
        target_name: String(p['farm_name'] ?? ''),
        farm_id: String(p['farm_id'] ?? ''),
        details: {
          target_user_id: p['target_user_id'],
          target_user_name: p['target_user_name'],
        },
      };

    case 'account.deleted':
      return {
        event_type: type,
        actor_id: event.actor_id,
        actor_email: event.actor_email,
        target_type: 'user',
        target_id: String(p['user_id'] ?? event.actor_id),
        target_name: String(p['display_name'] ?? ''),
        details: { email: p['email'] },
      };

    case 'user.profile_updated':
      return {
        event_type: type,
        actor_id: event.actor_id,
        actor_email: event.actor_email,
        target_type: 'user',
        target_id: event.actor_id,
        target_name: event.actor_email,
        details: p['changed_fields'] ? { changed_fields: p['changed_fields'] } : undefined,
      };

    // Device events (Beta-5)
    case 'device.registered':
    case 'device.deregistered':
      return {
        event_type: type,
        actor_id: event.actor_id,
        actor_email: event.actor_email,
        target_type: 'device',
        target_id: String(p['device_id'] ?? ''),
        target_name: String(p['node_name'] ?? ''),
        farm_id: String(p['farm_id'] ?? ''),
        details: { bed_id: p['bed_id'] },
      };

    case 'device.config_updated':
      return {
        event_type: type,
        actor_id: event.actor_id,
        actor_email: event.actor_email,
        target_type: 'device',
        target_id: String(p['device_id'] ?? ''),
        target_name: '',
        farm_id: String(p['farm_id'] ?? ''),
        details: { changes: p['changes'] },
      };

    case 'device.test_shot':
      return {
        event_type: type,
        actor_id: event.actor_id,
        actor_email: event.actor_email,
        target_type: 'device',
        target_id: String(p['device_id'] ?? ''),
        target_name: '',
        farm_id: String(p['farm_id'] ?? ''),
      };

    default:
      return {
        event_type: type,
        actor_id: event.actor_id,
        actor_email: event.actor_email,
        target_type: 'unknown',
        target_id: '',
        target_name: '',
      };
  }
}

// ── initActivitySubscriptions ────────────────────────────────────

const ALL_EVENT_TYPES: AppEventType[] = [
  'user.signup',
  'farm.created',
  'farm.deleted',
  'join_request.submitted',
  'join_request.approved',
  'join_request.rejected',
  'account.deleted',
  'farm.updated',
  'bed.updated',
  'image.uploaded',
  'tag.created',
  'member.joined',
  'member.removed',
  'member.role_changed',
  'user.profile_updated',
  'device.registered',
  'device.deregistered',
  'device.config_updated',
  'device.test_shot',
];

let _initialized = false;

export function initActivitySubscriptions(): void {
  if (_initialized) return;
  _initialized = true;

  for (const eventType of ALL_EVENT_TYPES) {
    appEvents.on(eventType, (event) => {
      const record = fromPayload(eventType, event);
      recordActivity(record).catch((err) => {
        console.error(`[activity] failed to record ${eventType}:`, err);
      });
    });
  }
  console.log(`[activity] subscribed to ${ALL_EVENT_TYPES.length} event types`);
}

// Initialize at module load time
initActivitySubscriptions();

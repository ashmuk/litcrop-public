/**
 * Tests for services/activity.ts
 *
 * - recordActivity writes correct PK/SK/GSI2 keys
 * - dual-write for farm-scoped events
 * - TTL calculation (90 days from now)
 * - queryActivities with filters
 * - event subscriptions: all 14 event types trigger recording
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock DynamoDB before importing activity service ───────────────

const { mockDdbSend } = vi.hoisted(() => ({ mockDdbSend: vi.fn() }));

vi.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: class MockDynamoDBClient {
    constructor(_config: unknown) {}
  },
}));

vi.mock('@aws-sdk/lib-dynamodb', () => {
  class MockBatchWriteCommand {
    input: unknown;
    constructor(input: unknown) { this.input = input; }
  }
  class MockQueryCommand {
    input: unknown;
    constructor(input: unknown) { this.input = input; }
  }
  const DynamoDBDocumentClient = {
    from: vi.fn().mockReturnValue({ send: mockDdbSend }),
  };
  return {
    DynamoDBDocumentClient,
    BatchWriteCommand: MockBatchWriteCommand,
    QueryCommand: MockQueryCommand,
  };
});

// Must be set before importing activity (which runs initActivitySubscriptions at load)
vi.hoisted(() => {
  process.env['TABLE_NAME'] = 'litcrop-test';
  process.env['AWS_REGION'] = 'ap-northeast-1';
});

// Import after mocks
import { queryActivities } from '../../services/activity';
import { appEvents } from '../../services/events';

// ── Helpers ───────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper builds partial events
function makeEvent<T extends string>(type: T, payload: unknown): any {
  return {
    type,
    timestamp: '2026-04-01T12:00:00.000Z',
    actor_id: 'user-001',
    actor_email: 'alice@litcrop.test',
    payload,
  };
}

function getBatchWriteItems(call: unknown[]): Record<string, unknown>[] {
  const cmd = call[0] as { input: { RequestItems: Record<string, Array<{ PutRequest: { Item: Record<string, unknown> } }>> } };
  const tableItems = cmd.input.RequestItems['litcrop-test'] ?? [];
  return tableItems.map((r) => r.PutRequest.Item);
}

beforeEach(() => {
  mockDdbSend.mockReset();
  mockDdbSend.mockResolvedValue({});
});

// ── recordActivity via event subscription ─────────────────────────

describe('activity subscriptions — recordActivity', () => {
  it('records user.signup with global item only (no farm_id)', async () => {
    appEvents.emit('user.signup', makeEvent('user.signup', {
      user_id: 'user-001',
      display_name: 'Alice',
      email: 'alice@litcrop.test',
    }));

    await new Promise((r) => setTimeout(r, 50));

    expect(mockDdbSend).toHaveBeenCalledOnce();
    const items = getBatchWriteItems(mockDdbSend.mock.calls[0]);
    expect(items).toHaveLength(1);

    const item = items[0];
    expect(item['PK']).toMatch(/^ACTIVITY#\d{4}-\d{2}$/);
    expect(item['GSI2PK']).toBe('ACTIVITY#ALL');
    expect(item['GSI2SK']).toBe(item['SK']);
    expect(item['event_type']).toBe('user.signup');
    expect(item['actor_id']).toBe('user-001');
    expect(item['actor_email']).toBe('alice@litcrop.test');
  });

  it('records farm.created with dual write (global + farm-scoped)', async () => {
    appEvents.emit('farm.created', makeEvent('farm.created', {
      farm_id: 'farm-abc',
      farm_name: 'Sunset Farm',
    }));

    await new Promise((r) => setTimeout(r, 50));

    expect(mockDdbSend).toHaveBeenCalledOnce();
    const items = getBatchWriteItems(mockDdbSend.mock.calls[0]);
    expect(items).toHaveLength(2);

    const global = items.find((i) => i['GSI2PK'] === 'ACTIVITY#ALL');
    const farmed = items.find((i) => (i['GSI2PK'] as string).startsWith('ACTIVITY#FARM#'));

    expect(global).toBeDefined();
    expect(farmed).toBeDefined();
    expect(farmed!['GSI2PK']).toBe('ACTIVITY#FARM#farm-abc');
    expect((farmed!['PK'] as string)).toMatch(/^ACTIVITY#FARM#farm-abc#/);

    // Both items share the same SK (same event, two views)
    expect(global!['SK']).toBe(farmed!['SK']);
    expect(global!['GSI2SK']).toBe(global!['SK']);
    expect(farmed!['GSI2SK']).toBe(farmed!['SK']);
  });

  it('sets TTL approximately 90 days from now', async () => {
    const beforeMs = Date.now();
    appEvents.emit('user.signup', makeEvent('user.signup', {
      user_id: 'user-002',
      display_name: 'Bob',
      email: 'bob@litcrop.test',
    }));
    await new Promise((r) => setTimeout(r, 50));

    expect(mockDdbSend).toHaveBeenCalledOnce();
    const items = getBatchWriteItems(mockDdbSend.mock.calls[0]);
    // TTL is on the item; the attribute name is uppercase 'TTL' per CDK definition
    const ttl = items[0]['TTL'] as number;
    const afterMs = Date.now();

    expect(typeof ttl).toBe('number');
    const expectedMin = Math.floor(beforeMs / 1000) + 90 * 86400;
    const expectedMax = Math.floor(afterMs / 1000) + 90 * 86400;
    expect(ttl).toBeGreaterThanOrEqual(expectedMin);
    expect(ttl).toBeLessThanOrEqual(expectedMax);
  });

  it('records farm.deleted event', async () => {
    appEvents.emit('farm.deleted', makeEvent('farm.deleted', {
      farm_id: 'farm-del',
      farm_name: 'Old Farm',
    }));
    await new Promise((r) => setTimeout(r, 50));
    expect(mockDdbSend).toHaveBeenCalledOnce();
    const items = getBatchWriteItems(mockDdbSend.mock.calls[0]);
    expect(items[0]['event_type']).toBe('farm.deleted');
  });

  it('records bed.updated event with farm_id', async () => {
    appEvents.emit('bed.updated', makeEvent('bed.updated', {
      bed_id: 'bed-001',
      bed_name: 'Bed A1',
      farm_id: 'farm-xyz',
      farm_name: 'Test Farm',
      changed_fields: ['crop_type'],
    }));
    await new Promise((r) => setTimeout(r, 50));
    const items = getBatchWriteItems(mockDdbSend.mock.calls[0]);
    expect(items).toHaveLength(2);
    expect(items[0]['event_type']).toBe('bed.updated');
    expect(items[0]['target_type']).toBe('bed');
  });

  // ── #482 regression: image.deleted + images.bulk_deleted ────────
  // These events were emitted by the routes (v0.99.8.6 / #478) but
  // never persisted to the activity log because they were missing
  // from ALL_EVENT_TYPES + fromPayload(). v0.99.8.7 (#482) wires
  // them in. Tests assert end-to-end emit → persist → mapped row.

  it('records image.deleted with target_type=image and details capturing bed_id + captured_at', async () => {
    appEvents.emit('image.deleted', makeEvent('image.deleted', {
      image_id: 'img-123',
      bed_id: 'bed-001',
      farm_id: 'farm-xyz',
      captured_at: '2026-04-15T08:30:00.000Z',
    }));
    await new Promise((r) => setTimeout(r, 50));

    expect(mockDdbSend).toHaveBeenCalledOnce();
    const items = getBatchWriteItems(mockDdbSend.mock.calls[0]);
    expect(items).toHaveLength(2);

    const global = items.find((i) => i['GSI2PK'] === 'ACTIVITY#ALL')!;
    expect(global['event_type']).toBe('image.deleted');
    expect(global['target_type']).toBe('image');
    expect(global['target_id']).toBe('img-123');
    expect(global['farm_id']).toBe('farm-xyz');
    expect(global['details']).toEqual({ bed_id: 'bed-001', captured_at: '2026-04-15T08:30:00.000Z' });
  });

  it('records images.bulk_deleted with target_id=bed_id and details.count derived from image_ids', async () => {
    appEvents.emit('images.bulk_deleted', makeEvent('images.bulk_deleted', {
      bed_id: 'bed-001',
      farm_id: 'farm-xyz',
      day: '2026-04-15',
      image_ids: ['img-1', 'img-2', 'img-3'],
    }));
    await new Promise((r) => setTimeout(r, 50));

    expect(mockDdbSend).toHaveBeenCalledOnce();
    const items = getBatchWriteItems(mockDdbSend.mock.calls[0]);
    expect(items).toHaveLength(2);

    const global = items.find((i) => i['GSI2PK'] === 'ACTIVITY#ALL')!;
    expect(global['event_type']).toBe('images.bulk_deleted');
    expect(global['target_type']).toBe('image');
    expect(global['target_id']).toBe('bed-001');
    expect(global['farm_id']).toBe('farm-xyz');
    const details = global['details'] as Record<string, unknown>;
    expect(details['bed_id']).toBe('bed-001');
    expect(details['day']).toBe('2026-04-15');
    expect(details['count']).toBe(3);
    expect(details['image_ids']).toEqual(['img-1', 'img-2', 'img-3']);
  });

  it('records all enumerated event types without throwing', async () => {
    const events: Array<[string, unknown]> = [
      ['user.signup', { user_id: 'u1', display_name: 'A', email: 'a@test.com' }],
      ['farm.created', { farm_id: 'f1', farm_name: 'F1' }],
      ['farm.deleted', { farm_id: 'f1', farm_name: 'F1' }],
      ['farm.updated', { farm_id: 'f1', farm_name: 'F1', changed_fields: ['name'] }],
      ['bed.updated', { bed_id: 'b1', bed_name: 'B1', farm_id: 'f1', farm_name: 'F1', changed_fields: [] }],
      ['image.uploaded', { image_id: 'i1', bed_id: 'b1', bed_name: 'B1', farm_id: 'f1', farm_name: 'F1' }],
      ['tag.created', { image_id: 'i1', tag_value: 'healthy', farm_id: 'f1', farm_name: 'F1' }],
      ['member.joined', { farm_id: 'f1', farm_name: 'F1', role: 'staff' }],
      ['member.removed', { farm_id: 'f1', farm_name: 'F1', removed_user_id: 'u2', removed_user_name: 'Bob' }],
      ['join_request.submitted', { farm_id: 'f1', farm_name: 'F1', requester_name: 'Carol' }],
      ['join_request.approved', { farm_id: 'f1', farm_name: 'F1', target_user_id: 'u3', target_user_name: 'Dave' }],
      ['join_request.rejected', { farm_id: 'f1', farm_name: 'F1', target_user_id: 'u4', target_user_name: 'Eve' }],
      ['account.deleted', { user_id: 'u5', display_name: 'Fay', email: 'fay@test.com' }],
      ['user.profile_updated', { changed_fields: ['display_name'] }],
      ['image.deleted', { image_id: 'i9', bed_id: 'b9', farm_id: 'f9', captured_at: '2026-04-15T08:30:00.000Z' }],
      ['images.bulk_deleted', { bed_id: 'b9', farm_id: 'f9', day: '2026-04-15', image_ids: ['i1', 'i2'] }],
    ];

    for (const [type, payload] of events) {
      appEvents.emit(type as keyof import('../../services/events').AppEventMap, makeEvent(type, payload) as never);
    }

    await new Promise((r) => setTimeout(r, 100));

    // Each emit triggers one DDB send call (1 or 2 items depending on farm_id)
    expect(mockDdbSend).toHaveBeenCalledTimes(events.length);
  });
});

// ── queryActivities ───────────────────────────────────────────────

describe('queryActivities', () => {
  const activityItem = {
    PK: 'ACTIVITY#2026-04',
    SK: '2026-04-01T12:00:00.000Z#evt_abc123def4',
    GSI2PK: 'ACTIVITY#ALL',
    GSI2SK: '2026-04-01T12:00:00.000Z#evt_abc123def4',
    id: 'evt_abc123def4',
    event_type: 'farm.created',
    actor_id: 'user-001',
    actor_email: 'alice@litcrop.test',
    target_type: 'farm',
    target_id: 'farm-001',
    target_name: 'Sunset Farm',
    farm_id: 'farm-001',
    created_at: '2026-04-01T12:00:00.000Z',
    TTL: 1760040000,
  };

  it('returns activities from GSI2 query with ACTIVITY#ALL partition', async () => {
    mockDdbSend.mockResolvedValueOnce({ Items: [activityItem], LastEvaluatedKey: undefined });

    const result = await queryActivities({ limit: 10 });

    expect(result.activities).toHaveLength(1);
    expect(result.activities[0].event_type).toBe('farm.created');
    expect(result.activities[0].actor_email).toBe('alice@litcrop.test');
    expect(result.next_cursor).toBeUndefined();

    // Verify GSI2PK used
    const queryInput = (mockDdbSend.mock.calls[0][0] as { input: { IndexName: string; FilterExpression?: string; ExpressionAttributeValues: Record<string, unknown>; Limit?: number } }).input;
    expect(queryInput.IndexName).toBe('GSI2');
    expect(queryInput.ExpressionAttributeValues[':gsi2pk']).toBe('ACTIVITY#ALL');
  });

  it('uses farm-scoped GSI2PK when farm_id filter provided', async () => {
    mockDdbSend.mockResolvedValueOnce({ Items: [], LastEvaluatedKey: undefined });

    await queryActivities({ farm_id: 'farm-xyz', limit: 10 });

    const queryInput = (mockDdbSend.mock.calls[0][0] as { input: { IndexName: string; FilterExpression?: string; ExpressionAttributeValues: Record<string, unknown>; Limit?: number } }).input;
    expect(queryInput.ExpressionAttributeValues[':gsi2pk']).toBe('ACTIVITY#FARM#farm-xyz');
  });

  it('applies event_type filter as FilterExpression', async () => {
    mockDdbSend.mockResolvedValueOnce({ Items: [activityItem], LastEvaluatedKey: undefined });

    await queryActivities({ event_type: ['farm.created'], limit: 10 });

    const queryInput = (mockDdbSend.mock.calls[0][0] as { input: { IndexName: string; FilterExpression?: string; ExpressionAttributeValues: Record<string, unknown>; Limit?: number } }).input;
    expect(queryInput.FilterExpression).toContain('event_type IN');
    expect(queryInput.ExpressionAttributeValues[':et0']).toBe('farm.created');
  });

  it('applies actor_id filter as FilterExpression', async () => {
    mockDdbSend.mockResolvedValueOnce({ Items: [], LastEvaluatedKey: undefined });

    await queryActivities({ actor_id: 'user-001', limit: 10 });

    const queryInput = (mockDdbSend.mock.calls[0][0] as { input: { IndexName: string; FilterExpression?: string; ExpressionAttributeValues: Record<string, unknown>; Limit?: number } }).input;
    expect(queryInput.FilterExpression).toContain('actor_id = :actor_id');
    expect(queryInput.ExpressionAttributeValues[':actor_id']).toBe('user-001');
  });

  it('post-filters by q (free text) on actor_email', async () => {
    const noMatch = { ...activityItem, actor_email: 'other@test.com', id: 'evt_zzz' };
    mockDdbSend.mockResolvedValueOnce({ Items: [activityItem, noMatch], LastEvaluatedKey: undefined });

    const result = await queryActivities({ q: 'alice', limit: 10 });

    expect(result.activities).toHaveLength(1);
    expect(result.activities[0].actor_email).toBe('alice@litcrop.test');
  });

  it('post-filters by q on target_name', async () => {
    const item2 = { ...activityItem, target_name: 'Other Farm', id: 'evt_zzz2' };
    mockDdbSend.mockResolvedValueOnce({ Items: [activityItem, item2], LastEvaluatedKey: undefined });

    const result = await queryActivities({ q: 'sunset', limit: 10 });

    expect(result.activities).toHaveLength(1);
    expect(result.activities[0].target_name).toBe('Sunset Farm');
  });

  it('returns next_cursor when LastEvaluatedKey is present and limit reached', async () => {
    const lastKey = { PK: 'ACTIVITY#2026-04', SK: 'xyz', GSI2PK: 'ACTIVITY#ALL', GSI2SK: 'xyz' };
    mockDdbSend.mockResolvedValueOnce({ Items: [activityItem], LastEvaluatedKey: lastKey });

    const result = await queryActivities({ limit: 1 });

    expect(result.next_cursor).toBeDefined();
    // Cursor is base64url encoded JSON
    const decoded = JSON.parse(Buffer.from(result.next_cursor!, 'base64url').toString('utf-8'));
    expect(decoded).toEqual(lastKey);
  });

  it('returns empty list when no items found', async () => {
    mockDdbSend.mockResolvedValueOnce({ Items: [], LastEvaluatedKey: undefined });

    const result = await queryActivities({});
    expect(result.activities).toHaveLength(0);
    expect(result.next_cursor).toBeUndefined();
  });

  it('defaults limit to 50, max capped at 100', async () => {
    mockDdbSend.mockResolvedValueOnce({ Items: [], LastEvaluatedKey: undefined });
    await queryActivities({ limit: 999 });

    const queryInput = (mockDdbSend.mock.calls[0][0] as { input: { IndexName: string; FilterExpression?: string; ExpressionAttributeValues: Record<string, unknown>; Limit?: number } }).input;
    // Over-fetch is limit * 2 = 200 (capped at 100 * 2)
    expect(queryInput.Limit).toBe(200);
  });
});

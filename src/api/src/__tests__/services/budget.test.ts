/**
 * BudgetService unit tests.
 * Uses aws-sdk-client-mock to intercept DynamoDB calls without hitting AWS.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import {
  checkBudget,
  recordUsage,
  todayUtc,
  nextMidnightUtc,
  todayStartUtc,
  getUsage,
  MESSAGES_PER_HOUR_LIMIT,
} from '../../services/budget';

const ddbMock = mockClient(DynamoDBDocumentClient);

beforeEach(() => {
  ddbMock.reset();
});

// ── todayUtc / nextMidnightUtc helpers ────────────────────────────

describe('date helpers', () => {
  it('todayUtc returns YYYY-MM-DD format', () => {
    expect(todayUtc()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('nextMidnightUtc is after now', () => {
    const midnight = new Date(nextMidnightUtc());
    expect(midnight.getTime()).toBeGreaterThan(Date.now());
  });

  it('nextMidnightUtc is at exactly midnight UTC', () => {
    const midnight = new Date(nextMidnightUtc());
    expect(midnight.getUTCHours()).toBe(0);
    expect(midnight.getUTCMinutes()).toBe(0);
    expect(midnight.getUTCSeconds()).toBe(0);
  });

  it('todayStartUtc is before now', () => {
    const start = new Date(todayStartUtc());
    expect(start.getTime()).toBeLessThanOrEqual(Date.now());
  });
});

// ── checkBudget ────────────────────────────────────────────────────

describe('checkBudget', () => {
  it('allows when user and global are under limit', async () => {
    ddbMock.on(GetCommand).resolves({ Item: undefined });

    const result = await checkBudget('user-001');
    expect(result.allowed).toBe(true);
    expect(result.scope).toBeUndefined();
  });

  it('returns { allowed: false, scope: "user" } when user input at limit', async () => {
    // First GetCommand: user record (at limit), Second: global record (under limit)
    ddbMock
      .on(GetCommand, { Key: { PK: 'USAGE#user-001', SK: `DAY#${todayUtc()}` } })
      .resolves({ Item: { input_tokens_used: 49_600, output_tokens_used: 0, messages_sent: 10 } })
      .on(GetCommand, { Key: { PK: 'USAGE#GLOBAL', SK: `DAY#${todayUtc()}` } })
      .resolves({ Item: { input_tokens_used: 0, output_tokens_used: 0, messages_sent: 0 } });

    const result = await checkBudget('user-001');
    expect(result.allowed).toBe(false);
    expect(result.scope).toBe('user');
    expect(result.reset_at).toBeDefined();
    // reset_at must be a future midnight UTC
    expect(new Date(result.reset_at!).getTime()).toBeGreaterThan(Date.now());
  });

  it('returns { allowed: false, scope: "user" } when user output at limit', async () => {
    ddbMock
      .on(GetCommand, { Key: { PK: 'USAGE#user-002', SK: `DAY#${todayUtc()}` } })
      .resolves({ Item: { input_tokens_used: 0, output_tokens_used: 9_950, messages_sent: 5 } })
      .on(GetCommand, { Key: { PK: 'USAGE#GLOBAL', SK: `DAY#${todayUtc()}` } })
      .resolves({ Item: undefined });

    const result = await checkBudget('user-002');
    expect(result.allowed).toBe(false);
    expect(result.scope).toBe('user');
  });

  it('returns { allowed: false, scope: "global" } when user under limit but global exceeded', async () => {
    ddbMock
      .on(GetCommand, { Key: { PK: 'USAGE#user-003', SK: `DAY#${todayUtc()}` } })
      .resolves({ Item: { input_tokens_used: 100, output_tokens_used: 50, messages_sent: 1 } })
      .on(GetCommand, { Key: { PK: 'USAGE#GLOBAL', SK: `DAY#${todayUtc()}` } })
      .resolves({ Item: { input_tokens_used: 499_600, output_tokens_used: 0, messages_sent: 500 } });

    const result = await checkBudget('user-003');
    expect(result.allowed).toBe(false);
    expect(result.scope).toBe('global');
  });

  it('returns user_record and global_record in result', async () => {
    ddbMock.on(GetCommand).resolves({ Item: undefined });

    const result = await checkBudget('user-004');
    expect(result.user_record).toBeDefined();
    expect(result.global_record).toBeDefined();
    expect(result.user_record?.input_tokens_used).toBe(0);
  });

  it('treats missing DynamoDB item as zero usage', async () => {
    ddbMock.on(GetCommand).resolves({ Item: undefined });

    const result = await checkBudget('new-user');
    expect(result.allowed).toBe(true);
  });

  it('allows when user input is exactly at safe boundary (50000 - 500 = 49500 tokens used)', async () => {
    // With USER_INPUT_LIMIT=50000 and MIN_EXCHANGE_INPUT=500:
    //   49500 + 500 = 50000, which is NOT > 50000 → still allowed
    ddbMock
      .on(GetCommand, { Key: { PK: 'USAGE#user-boundary', SK: `DAY#${todayUtc()}` } })
      .resolves({ Item: { input_tokens_used: 49500, output_tokens_used: 0, messages_sent: 5 } })
      .on(GetCommand, { Key: { PK: 'USAGE#GLOBAL', SK: `DAY#${todayUtc()}` } })
      .resolves({ Item: undefined });

    const result = await checkBudget('user-boundary');
    expect(result.allowed).toBe(true);
  });

  it('blocks when user input is one token over the safe boundary (49501 used)', async () => {
    // 49501 + 500 = 50001 > 50000 → blocked
    ddbMock
      .on(GetCommand, { Key: { PK: 'USAGE#user-over-boundary', SK: `DAY#${todayUtc()}` } })
      .resolves({ Item: { input_tokens_used: 49501, output_tokens_used: 0, messages_sent: 5 } })
      .on(GetCommand, { Key: { PK: 'USAGE#GLOBAL', SK: `DAY#${todayUtc()}` } })
      .resolves({ Item: undefined });

    const result = await checkBudget('user-over-boundary');
    expect(result.allowed).toBe(false);
    expect(result.scope).toBe('user');
  });
});

// ── recordUsage ────────────────────────────────────────────────────

describe('recordUsage', () => {
  it('sends two UpdateCommands (user + global)', async () => {
    ddbMock.on(UpdateCommand).resolves({});

    await recordUsage('user-001', { input_tokens: 300, output_tokens: 150 });

    const calls = ddbMock.commandCalls(UpdateCommand);
    expect(calls).toHaveLength(2);
  });

  it('uses ADD expression (not SET) for atomic increment', async () => {
    ddbMock.on(UpdateCommand).resolves({});

    await recordUsage('user-001', { input_tokens: 300, output_tokens: 150 });

    const call = ddbMock.commandCalls(UpdateCommand)[0];
    const expr = call.args[0].input.UpdateExpression as string;
    expect(expr).toContain('ADD');
    expect(expr).not.toMatch(/^SET/);
  });

  it('increments user counter with correct token values', async () => {
    ddbMock.on(UpdateCommand).resolves({});

    await recordUsage('user-abc', { input_tokens: 500, output_tokens: 200 });

    const calls = ddbMock.commandCalls(UpdateCommand);
    const userCall = calls.find(
      (c) => (c.args[0].input.Key as Record<string, string>)['PK'] === 'USAGE#user-abc',
    );
    expect(userCall).toBeDefined();
    const values = userCall!.args[0].input.ExpressionAttributeValues as Record<string, unknown>;
    expect(values[':i']).toBe(500);
    expect(values[':o']).toBe(200);
    expect(values[':m']).toBe(1);
  });

  it('includes TTL attribute as a number (epoch seconds)', async () => {
    ddbMock.on(UpdateCommand).resolves({});

    await recordUsage('user-001', { input_tokens: 100, output_tokens: 50 });

    const call = ddbMock.commandCalls(UpdateCommand)[0];
    const values = call.args[0].input.ExpressionAttributeValues as Record<string, unknown>;
    expect(typeof values[':ttl']).toBe('number');
    // TTL = start of today (UTC midnight) + 48h.
    // From any point during today, that's between 24h and 48h from now.
    const nowEpoch = Math.floor(Date.now() / 1000);
    expect(values[':ttl'] as number).toBeGreaterThan(nowEpoch + 23 * 3600);
    expect(values[':ttl'] as number).toBeLessThan(nowEpoch + 49 * 3600);
  });

  it('updates global counter PK with USAGE#GLOBAL', async () => {
    ddbMock.on(UpdateCommand).resolves({});

    await recordUsage('user-001', { input_tokens: 100, output_tokens: 50 });

    const calls = ddbMock.commandCalls(UpdateCommand);
    const globalCall = calls.find(
      (c) => (c.args[0].input.Key as Record<string, string>)['PK'] === 'USAGE#GLOBAL',
    );
    expect(globalCall).toBeDefined();
  });
});

// ── getUsage ───────────────────────────────────────────────────────

describe('getUsage', () => {
  it('returns a valid UsageResponse shape', async () => {
    ddbMock
      .on(GetCommand, { Key: { PK: 'USAGE#user-x', SK: `DAY#${todayUtc()}` } })
      .resolves({ Item: { input_tokens_used: 1000, output_tokens_used: 200, messages_sent: 3 } })
      .on(GetCommand, { Key: { PK: 'USAGE#GLOBAL', SK: `DAY#${todayUtc()}` } })
      .resolves({ Item: { input_tokens_used: 5000, output_tokens_used: 1000, messages_sent: 15 } });

    const usage = await getUsage('user-x');

    expect(usage.user_id).toBe('user-x');
    expect(usage.period).toBe('daily');
    expect(usage.user_budget.input_tokens_used).toBe(1000);
    expect(usage.user_budget.output_tokens_used).toBe(200);
    expect(usage.user_budget.messages_sent).toBe(3);
    expect(usage.user_budget.messages_limit).toBe(MESSAGES_PER_HOUR_LIMIT);
    expect(usage.global_budget.input_tokens_used).toBe(5000);
    expect(usage.global_budget.utilization_pct).toBeGreaterThanOrEqual(0);
    expect(usage.global_budget.utilization_pct).toBeLessThanOrEqual(100);
  });

  it('returns zero counters when no usage today (new user)', async () => {
    ddbMock.on(GetCommand).resolves({ Item: undefined });

    const usage = await getUsage('brand-new-user');

    expect(usage.user_budget.input_tokens_used).toBe(0);
    expect(usage.user_budget.output_tokens_used).toBe(0);
    expect(usage.user_budget.messages_sent).toBe(0);
    expect(usage.global_budget.utilization_pct).toBe(0);
  });

  it('period_start and reset_at are valid ISO 8601', async () => {
    ddbMock.on(GetCommand).resolves({ Item: undefined });

    const usage = await getUsage('user-y');

    expect(() => new Date(usage.period_start)).not.toThrow();
    expect(() => new Date(usage.reset_at)).not.toThrow();
    expect(new Date(usage.period_start).getTime()).toBeLessThanOrEqual(Date.now());
    expect(new Date(usage.reset_at).getTime()).toBeGreaterThan(Date.now());
  });

  it('utilization_pct is capped at 100', async () => {
    ddbMock
      .on(GetCommand, { Key: { PK: 'USAGE#user-z', SK: `DAY#${todayUtc()}` } })
      .resolves({ Item: { input_tokens_used: 0, output_tokens_used: 0, messages_sent: 0 } })
      .on(GetCommand, { Key: { PK: 'USAGE#GLOBAL', SK: `DAY#${todayUtc()}` } })
      .resolves({ Item: { input_tokens_used: 999999, output_tokens_used: 0, messages_sent: 999 } });

    const usage = await getUsage('user-z');
    expect(usage.global_budget.utilization_pct).toBe(100);
  });
});

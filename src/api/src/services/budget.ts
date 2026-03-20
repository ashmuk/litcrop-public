/**
 * BudgetService — daily token budget tracking for AI chat.
 *
 * DynamoDB key pattern:
 *   PK = USAGE#{userId | GLOBAL}
 *   SK = DAY#{yyyy-mm-dd}         (UTC date)
 *
 * Counters are updated via atomic ADD operations so concurrent Lambda
 * invocations cannot produce incorrect totals.
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import type { UsageResponse } from '@litcrop/shared';

// ── Config ────────────────────────────────────────────────────────

const TABLE_NAME = process.env.TABLE_NAME ?? 'litcrop-poc';
const AWS_REGION = process.env.AWS_REGION ?? 'ap-northeast-1';

// Per-user daily limits (can be overridden via env vars)
const USER_INPUT_LIMIT = parseInt(process.env['CHAT_DAILY_USER_INPUT_LIMIT'] ?? '50000', 10);
const USER_OUTPUT_LIMIT = parseInt(process.env['CHAT_DAILY_USER_OUTPUT_LIMIT'] ?? '10000', 10);

// Global daily limits across all users
const GLOBAL_INPUT_LIMIT = parseInt(process.env['CHAT_DAILY_GLOBAL_INPUT_LIMIT'] ?? '500000', 10);
const GLOBAL_OUTPUT_LIMIT = parseInt(process.env['CHAT_DAILY_GLOBAL_OUTPUT_LIMIT'] ?? '100000', 10);

// Messages/hour rate limit (enforced in-memory in the route)
export const MESSAGES_PER_HOUR_LIMIT = 20;

// Minimum estimated tokens per exchange; reject if remaining budget < this
const MIN_EXCHANGE_INPUT = 500;
const MIN_EXCHANGE_OUTPUT = 100;

export const CHAT_MODEL = process.env['CHAT_MODEL'] ?? 'claude-haiku-4-5-20251001';

// ── DynamoDB client ───────────────────────────────────────────────

const ddbClient = new DynamoDBClient({ region: AWS_REGION });
export const budgetDdb = DynamoDBDocumentClient.from(ddbClient, {
  marshallOptions: { removeUndefinedValues: true },
});

// ── Helpers ───────────────────────────────────────────────────────

/** Today's UTC date as YYYY-MM-DD */
export function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Next midnight UTC as ISO 8601 string */
export function nextMidnightUtc(): string {
  const now = new Date();
  const midnight = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
  );
  return midnight.toISOString();
}

/** Start of today (UTC midnight) as ISO 8601 string */
export function todayStartUtc(): string {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return start.toISOString();
}

/** TTL = 48 hours after start of today (epoch seconds) */
function ttlFor(date: string): number {
  const dayStart = new Date(`${date}T00:00:00Z`);
  return Math.floor(dayStart.getTime() / 1000) + 48 * 3600;
}

function usageKey(userOrGlobal: string) {
  return { PK: `USAGE#${userOrGlobal}`, SK: `DAY#${todayUtc()}` };
}

// ── UsageBudget record ────────────────────────────────────────────

interface UsageBudgetRecord {
  input_tokens_used: number;
  output_tokens_used: number;
  messages_sent: number;
}

async function getRecord(id: string): Promise<UsageBudgetRecord> {
  const result = await budgetDdb.send(
    new GetCommand({ TableName: TABLE_NAME, Key: usageKey(id) }),
  );
  if (!result.Item) {
    return { input_tokens_used: 0, output_tokens_used: 0, messages_sent: 0 };
  }
  return {
    input_tokens_used: (result.Item['input_tokens_used'] as number) ?? 0,
    output_tokens_used: (result.Item['output_tokens_used'] as number) ?? 0,
    messages_sent: (result.Item['messages_sent'] as number) ?? 0,
  };
}

// ── Public API ────────────────────────────────────────────────────

export interface BudgetCheckResult {
  allowed: boolean;
  scope?: 'user' | 'global';
  reset_at?: string;
  user_record?: UsageBudgetRecord;
  global_record?: UsageBudgetRecord;
}

/**
 * Check if the user has remaining budget for another exchange.
 * Returns full records so the caller can build the 429 error details.
 */
export async function checkBudget(userId: string): Promise<BudgetCheckResult> {
  const [userRec, globalRec] = await Promise.all([
    getRecord(userId),
    getRecord('GLOBAL'),
  ]);

  const reset_at = nextMidnightUtc();

  // Check user budget first
  if (
    userRec.input_tokens_used + MIN_EXCHANGE_INPUT > USER_INPUT_LIMIT ||
    userRec.output_tokens_used + MIN_EXCHANGE_OUTPUT > USER_OUTPUT_LIMIT
  ) {
    return {
      allowed: false,
      scope: 'user',
      reset_at,
      user_record: userRec,
      global_record: globalRec,
    };
  }

  // Check global budget
  if (
    globalRec.input_tokens_used + MIN_EXCHANGE_INPUT > GLOBAL_INPUT_LIMIT ||
    globalRec.output_tokens_used + MIN_EXCHANGE_OUTPUT > GLOBAL_OUTPUT_LIMIT
  ) {
    return {
      allowed: false,
      scope: 'global',
      reset_at,
      user_record: userRec,
      global_record: globalRec,
    };
  }

  return { allowed: true, user_record: userRec, global_record: globalRec };
}

/**
 * Atomically increment token counters for user and global after a successful LLM call.
 */
export async function recordUsage(
  userId: string,
  usage: { input_tokens: number; output_tokens: number },
): Promise<void> {
  const date = todayUtc();
  const ttl = ttlFor(date);
  const now = new Date().toISOString();

  const updateExpr =
    'ADD input_tokens_used :i, output_tokens_used :o, messages_sent :m ' +
    'SET updated_at = :ts, #ttl = :ttl';
  const exprAttrNames = { '#ttl': 'ttl' };
  const exprAttrValues = {
    ':i': usage.input_tokens,
    ':o': usage.output_tokens,
    ':m': 1,
    ':ts': now,
    ':ttl': ttl,
  };

  await Promise.all([
    budgetDdb.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: usageKey(userId),
        UpdateExpression: updateExpr,
        ExpressionAttributeNames: exprAttrNames,
        ExpressionAttributeValues: exprAttrValues,
      }),
    ),
    budgetDdb.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: usageKey('GLOBAL'),
        UpdateExpression: updateExpr,
        ExpressionAttributeNames: exprAttrNames,
        ExpressionAttributeValues: exprAttrValues,
      }),
    ),
  ]);
}

/**
 * Get full usage stats for the GET /api/v1/usage endpoint.
 */
export async function getUsage(userId: string): Promise<UsageResponse> {
  const [userRec, globalRec] = await Promise.all([
    getRecord(userId),
    getRecord('GLOBAL'),
  ]);

  const globalInputUsed = globalRec.input_tokens_used;
  const globalInputLimit = GLOBAL_INPUT_LIMIT;

  return {
    user_id: userId,
    period: 'daily',
    period_start: todayStartUtc(),
    reset_at: nextMidnightUtc(),
    user_budget: {
      input_tokens_used: userRec.input_tokens_used,
      input_tokens_limit: USER_INPUT_LIMIT,
      output_tokens_used: userRec.output_tokens_used,
      output_tokens_limit: USER_OUTPUT_LIMIT,
      messages_sent: userRec.messages_sent,
      messages_limit: MESSAGES_PER_HOUR_LIMIT,
    },
    global_budget: {
      input_tokens_used: globalInputUsed,
      input_tokens_limit: globalInputLimit,
      output_tokens_used: globalRec.output_tokens_used,
      output_tokens_limit: GLOBAL_OUTPUT_LIMIT,
      utilization_pct: Math.min(100, Math.round((globalInputUsed / globalInputLimit) * 100)),
    },
    model: CHAT_MODEL,
  };
}

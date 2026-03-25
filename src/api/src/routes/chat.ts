import { Hono } from 'hono';
import Anthropic from '@anthropic-ai/sdk';
import type { MessageParam, Tool, ToolUseBlock, TextBlock } from '@anthropic-ai/sdk/resources/messages';
import { dynamoRepo } from '../services/dynamodb';
import type { StoredMessage } from '../services/dynamodb';
import { ValidationError, UpstreamError, RateLimitError, BudgetExceededError } from '../errors';
import { getAuthContext } from '../middleware/auth';
import {
  checkBudget,
  recordUsage,
  MESSAGES_PER_HOUR_LIMIT,
  CHAT_MODEL,
} from '../services/budget';
import { assertFarmAccess } from './_helpers';
import type { Farm, Bed } from '@litcrop/shared';

const router = new Hono();

// ── Lazy-initialized Anthropic client (singleton per cold start) ──

let _anthropicClient: Anthropic | null = null;

function getAnthropicClient(): Anthropic {
  if (!_anthropicClient) {
    _anthropicClient = new Anthropic({ apiKey: process.env['LLM_API_KEY']! });
  }
  return _anthropicClient;
}

// ── Config ───────────────────────────────────────────────────────

const MAX_CONVERSATION_TURNS = 20; // user turns per conversation
const MAX_TOOL_ITERATIONS = 5;     // max LLM↔tool rounds per request

// ── In-memory rate limiter (20 messages/hour per user) ────────────
// CAVEAT: This store is in-memory and has two important Lambda limitations:
//   1. Cold starts — every new Lambda container initialises an empty store, so a
//      user can exceed 20 messages/hour by landing on a freshly-started instance.
//   2. Concurrency — concurrent Lambda instances each hold independent stores,
//      meaning a user hitting multiple instances in parallel faces no shared cap.
// This is intentionally best-effort; the DynamoDB-backed daily budget is the
// authoritative hard cap that cannot be bypassed regardless of instance count.
// TODO: Replace with a DynamoDB-backed sliding-window counter if stricter
// per-hour enforcement is required at production scale.

export const rateLimitStore = new Map<string, number[]>();

export function checkRateLimit(userId: string): void {
  const now = Date.now();
  const windowMs = 60 * 60 * 1000; // 1 hour
  const existing = rateLimitStore.get(userId) ?? [];
  const recent = existing.filter((ts) => now - ts < windowMs);
  if (recent.length >= MESSAGES_PER_HOUR_LIMIT) {
    const oldestInWindow = recent[0];
    const retryAfterMs = windowMs - (now - oldestInWindow);
    throw new RateLimitError('Chat rate limit exceeded. Try again later.', {
      retry_after_seconds: Math.ceil(retryAfterMs / 1000),
    });
  }
  recent.push(now);
  rateLimitStore.set(userId, recent);
}

// ── Default suggestions (fallback) ───────────────────────────────

const DEFAULT_SUGGESTIONS = [
  'What should I plant this season?',
  'Help me plan my crop rotation',
  'What are common pests in my area?',
];

// ── System prompt builder ─────────────────────────────────────────

function buildSystemPrompt(farm: Farm | null, beds: Bed[]): string {
  const base = `You are a crop planning assistant for small-scale farmers.
You give practical, location-specific advice about what to grow, when to plant,
and how to manage crops. Keep answers concise and actionable.
Use Markdown formatting for readability.

You have tools to look up farm data and weather. Use them when the user asks
about their specific farm, crops, or weather conditions.

End your response with exactly 2-4 follow-up suggestions as a JSON array
on a new line prefixed with "SUGGESTIONS:". Example:
SUGGESTIONS: ["What soil pH do tomatoes need?", "When to harvest cucumbers?"]`;

  if (!farm) return base;

  const cropList = beds
    .filter((b) => b.crop_type)
    .map((b) => `- ${b.name}: ${b.crop_type} (${b.crop_variety ?? 'unknown'}), planted ${b.planted_at ?? 'unknown'}`)
    .join('\n');

  return `${base}

## Farm Context
- Location: ${farm.latitude}°N, ${farm.longitude}°E
- Elevation: ${farm.elevation_m ?? 'unknown'}m
- Climate zone: ${farm.climate_zone ?? 'unknown'}
- Locale: ${farm.locale}

## Current Crops
${cropList || 'No crops planted yet.'}

Tailor your recommendations to this specific location and climate.
When suggesting planting dates, calibrate to the local frost dates and growing season.
If the user's locale is "ja", respond in Japanese.`;
}

// ── Parse SUGGESTIONS from LLM response ──────────────────────────

function parseSuggestions(text: string): { reply: string; suggestions: string[] } {
  const lines = text.split('\n');
  let suggestionsLineIdx = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].trim().startsWith('SUGGESTIONS:')) {
      suggestionsLineIdx = i;
      break;
    }
  }

  if (suggestionsLineIdx === -1) {
    return { reply: text.trim(), suggestions: DEFAULT_SUGGESTIONS };
  }

  const suggestionsLine = lines[suggestionsLineIdx].trim();
  const jsonPart = suggestionsLine.slice('SUGGESTIONS:'.length).trim();

  let suggestions = DEFAULT_SUGGESTIONS;
  try {
    const parsed = JSON.parse(jsonPart);
    if (Array.isArray(parsed) && parsed.every((s) => typeof s === 'string')) {
      suggestions = parsed.slice(0, 4);
    }
  } catch {
    // fall through to default
  }

  const reply = lines.slice(0, suggestionsLineIdx).join('\n').trim();
  return { reply, suggestions };
}

// ── Stub response (no API key) ────────────────────────────────────

const DEFAULT_SUGGESTIONS_JA = [
  '今の季節に何を植えればいいですか？',
  '輪作の計画を立てるのを手伝ってください',
  '地域でよく見られる害虫は何ですか？',
];

function stubResponse(message: string, locale = 'en'): { reply: string; suggestions: string[] } {
  // Escape Markdown special characters to prevent XSS when rendered as HTML (S6)
  const escaped = message.replace(/[*_`[\]()~>#+=|{}!\\]/g, '\\$&');

  if (locale === 'ja') {
    return {
      reply: `現在、AIアシスタントをご利用いただけません。しばらくしてから再度お試しください。\n\nご質問：*"${escaped}"*`,
      suggestions: DEFAULT_SUGGESTIONS_JA,
    };
  }

  return {
    reply: `The AI assistant is not available right now. Please try again later.\n\nYour question: *"${escaped}"*`,
    suggestions: DEFAULT_SUGGESTIONS,
  };
}

// ── Tool definitions ──────────────────────────────────────────────

const TOOL_NAMES = {
  FARM_DATA: 'get_farm_data',
  WEATHER: 'get_weather',
} as const;

const TOOLS: Tool[] = [
  {
    name: TOOL_NAMES.FARM_DATA,
    description:
      'Retrieve farm details (location, climate, elevation) and current crop list. ' +
      'Use when the user asks about their specific farm, crops, or needs farm-specific advice.',
    input_schema: {
      type: 'object' as const,
      properties: {
        farm_id: {
          type: 'string',
          description: 'The farm ID to retrieve data for.',
        },
      },
      required: ['farm_id'],
    },
  },
  {
    name: TOOL_NAMES.WEATHER,
    description:
      'Get current weather conditions and 7-day forecast for a farm location. ' +
      'Use when the user asks about weather, planting timing, frost risk, or weather-dependent advice.',
    input_schema: {
      type: 'object' as const,
      properties: {
        farm_id: {
          type: 'string',
          description: 'The farm ID to get weather for.',
        },
      },
      required: ['farm_id'],
    },
  },
];

// ── Tool executor ─────────────────────────────────────────────────

async function executeTool(
  toolName: string,
  input: Record<string, unknown>,
  userId: string,
  isAdmin?: boolean,
): Promise<string> {
  if (toolName === TOOL_NAMES.FARM_DATA) {
    const farmId = input['farm_id'];
    if (typeof farmId !== 'string') return 'Error: farm_id is required';
    let farm: Farm;
    try {
      ({ farm } = await assertFarmAccess(farmId, userId, undefined, isAdmin));
    } catch {
      return 'Error: Farm not found';
    }
    try {
      const beds = await dynamoRepo.getBedsForFarm(farmId);
      return JSON.stringify({ farm, beds });
    } catch {
      return 'Error: Could not retrieve farm data';
    }
  }

  if (toolName === TOOL_NAMES.WEATHER) {
    const farmId = input['farm_id'];
    if (typeof farmId !== 'string') return 'Error: farm_id is required';
    let farm: Farm;
    try {
      ({ farm } = await assertFarmAccess(farmId, userId, undefined, isAdmin));
    } catch {
      return 'Error: Farm not found';
    }
    try {
      const params = new URLSearchParams({
        latitude: farm.latitude.toString(),
        longitude: farm.longitude.toString(),
        current: 'temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m',
        daily: 'temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,weather_code',
        timezone: 'auto',
        forecast_days: '7',
      });
      const resp = await fetch(
        `https://api.open-meteo.com/v1/forecast?${params.toString()}`,
        { signal: AbortSignal.timeout(10_000) },
      );
      if (!resp.ok) return 'Error: Weather service temporarily unavailable';
      const data = await resp.json();
      return JSON.stringify(data);
    } catch {
      return 'Error: Could not retrieve weather data';
    }
  }

  return `Error: Unknown tool "${toolName}"`;
}

// ── LLM call with tool use loop ───────────────────────────────────

interface LLMResult {
  text: string;
  input_tokens: number;
  output_tokens: number;
  messages: StoredMessage[]; // updated history to persist
}

async function callWithTools(
  systemPrompt: string,
  history: StoredMessage[],
  userMessage: string,
  userId: string,
  isAdmin?: boolean,
): Promise<LLMResult> {
  const client = getAnthropicClient();

  const messages: MessageParam[] = [
    ...(history as MessageParam[]),
    { role: 'user', content: userMessage },
  ];

  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let lastTextContent = '';

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    let response: Anthropic.Messages.Message;
    try {
      response = await client.messages.create({
        model: CHAT_MODEL,
        max_tokens: 1024,
        system: systemPrompt,
        messages,
        tools: TOOLS,
      });
    } catch (err) {
      if (err instanceof Anthropic.APIError) {
        const status = err.status ?? 500;
        console.error('[chat] LLM error', { status, error_type: err.error?.type ?? 'unknown' });
        if (status === 429) {
          throw new RateLimitError('AI service rate limit reached. Try again later.');
        }
        throw new UpstreamError('AI service temporarily unavailable');
      }
      throw new UpstreamError('AI service temporarily unavailable');
    }

    totalInputTokens += response.usage.input_tokens;
    totalOutputTokens += response.usage.output_tokens;

    // Collect text from this response
    const textBlocks = response.content.filter((b): b is TextBlock => b.type === 'text');
    if (textBlocks.length > 0) {
      lastTextContent = textBlocks[0].text;
    }

    if (response.stop_reason !== 'tool_use') {
      // Append final assistant turn to history
      messages.push({ role: 'assistant', content: response.content });
      break;
    }

    // Collect tool use blocks
    const toolUseBlocks = response.content.filter(
      (b): b is ToolUseBlock => b.type === 'tool_use',
    );

    // Append assistant turn (with tool_use blocks) to messages
    messages.push({ role: 'assistant', content: response.content });

    // Execute all tools and collect results
    const toolResults = await Promise.all(
      toolUseBlocks.map(async (tu) => ({
        type: 'tool_result' as const,
        tool_use_id: tu.id,
        content: await executeTool(tu.name, tu.input as Record<string, unknown>, userId, isAdmin),
      })),
    );

    // Append tool results as the next user turn
    messages.push({ role: 'user', content: toolResults });
  }

  return {
    text: lastTextContent,
    input_tokens: totalInputTokens,
    output_tokens: totalOutputTokens,
    messages: messages as StoredMessage[],
  };
}

// ── 5.11 POST /api/v1/chat ───────────────────────────────────────

router.post('/', async (c) => {
  const { userId, isAdmin } = getAuthContext(c);
  const body = await c.req.json<Record<string, unknown>>();

  // Validate message
  const rawMessage = body['message'];
  if (typeof rawMessage !== 'string' || rawMessage.trim().length === 0) {
    throw new ValidationError('Missing required field: message', { field: 'message', in: 'body' });
  }
  const message = rawMessage.trim();
  if (message.length > 2000) {
    throw new ValidationError("Invalid value for 'message': max 2000 characters", {
      field: 'message',
      max_length: 2000,
    });
  }

  // Resolve conversation ID (provided or new)
  const requestedConvId = body['conversation_id'];
  const conversationId =
    typeof requestedConvId === 'string' && requestedConvId.length > 0
      ? requestedConvId
      : `conv-${crypto.randomUUID()}`;

  // Load conversation history (empty array for new conversations)
  let history: StoredMessage[] = [];
  if (typeof requestedConvId === 'string' && requestedConvId.length > 0) {
    try {
      history = await dynamoRepo.getConversationHistory(requestedConvId, userId);
    } catch {
      // Non-fatal: start fresh if history cannot be loaded
    }
  }

  // Enforce per-conversation turn limit (FR-9.10)
  const userTurns = history.filter(
    (m) => m.role === 'user' && typeof m.content === 'string',
  ).length;
  if (userTurns >= MAX_CONVERSATION_TURNS) {
    throw new RateLimitError(
      'Conversation turn limit reached. Please start a new conversation.',
      { turn_limit: MAX_CONVERSATION_TURNS },
    );
  }

  // Load farm context for system prompt — only the caller's own farm (T-AUTH-05)
  let farm: Farm | null = null;
  let beds: Bed[] = [];

  const farmId = body['farm_id'];
  if (farmId && typeof farmId === 'string') {
    try {
      ({ farm } = await assertFarmAccess(farmId, userId, undefined, isAdmin));
      try {
        beds = await dynamoRepo.getBedsForFarm(farmId);
      } catch {
        // Non-fatal: proceed with farm but no beds
      }
    } catch {
      // Non-fatal: proceed without farm context if not a member
    }
  }

  const systemPrompt = buildSystemPrompt(farm, beds);

  // If no API key, return stub (no rate limit or budget check needed)
  if (!process.env['LLM_API_KEY']) {
    const stub = stubResponse(message, farm?.locale ?? 'en');
    return c.json({ ...stub, conversation_id: conversationId });
  }

  // Rate limit check (in-memory, per-user, 20 msgs/hour — best-effort in Lambda)
  checkRateLimit(userId);

  // Token budget check (DynamoDB, pre-flight)
  const budgetResult = await checkBudget(userId);
  if (!budgetResult.allowed) {
    const userRec = budgetResult.user_record!;
    const globalRec = budgetResult.global_record!;
    const isUser = budgetResult.scope === 'user';
    throw new BudgetExceededError(
      `Daily token budget exceeded. Resets at ${budgetResult.reset_at}`,
      {
        scope: budgetResult.scope!,
        reset_at: budgetResult.reset_at!,
        input_tokens_used: isUser ? userRec.input_tokens_used : globalRec.input_tokens_used,
        output_tokens_used: isUser ? userRec.output_tokens_used : globalRec.output_tokens_used,
        input_tokens_limit: isUser
          ? parseInt(process.env['CHAT_DAILY_USER_INPUT_LIMIT'] ?? '50000', 10)
          : parseInt(process.env['CHAT_DAILY_GLOBAL_INPUT_LIMIT'] ?? '500000', 10),
        output_tokens_limit: isUser
          ? parseInt(process.env['CHAT_DAILY_USER_OUTPUT_LIMIT'] ?? '10000', 10)
          : parseInt(process.env['CHAT_DAILY_GLOBAL_OUTPUT_LIMIT'] ?? '100000', 10),
      },
    );
  }

  // Call LLM with tool use loop
  const result = await callWithTools(systemPrompt, history, message, userId, isAdmin);

  // Record token usage asynchronously (non-blocking — don't delay response)
  recordUsage(userId, {
    input_tokens: result.input_tokens,
    output_tokens: result.output_tokens,
  }).catch((err) => console.error('[budget] recordUsage failed', err));

  // Persist updated conversation history asynchronously
  dynamoRepo
    .saveConversationHistory(conversationId, result.messages, userId)
    .catch((err) => console.error('[chat] saveConversationHistory failed', err));

  const { reply, suggestions } = parseSuggestions(result.text);

  return c.json({ reply, suggestions, conversation_id: conversationId });
});

export default router;

import { Hono } from 'hono';
import { dynamoRepo } from '../services/dynamodb';
import { ValidationError, UpstreamError } from '../errors';
import type { Farm, Plot } from '@litcrop/shared';

const router = new Hono();

// ── Config ───────────────────────────────────────────────────────

const LLM_PROVIDER = (process.env['LLM_API_PROVIDER'] ?? 'anthropic').toLowerCase();
const LLM_API_KEY = process.env['LLM_API_KEY'];
const ANTHROPIC_MODEL = 'claude-haiku-4-5-20251001';
const OPENAI_MODEL = 'gpt-4o-mini';

// ── Default suggestions (fallback) ───────────────────────────────

const DEFAULT_SUGGESTIONS = [
  'What should I plant this season?',
  'Help me plan my crop rotation',
  'What are common pests in my area?',
];

// ── System prompt builder ─────────────────────────────────────────

function buildSystemPrompt(farm: Farm | null, plots: Plot[]): string {
  const base = `You are a crop planning assistant for small-scale farmers.
You give practical, location-specific advice about what to grow, when to plant,
and how to manage crops. Keep answers concise and actionable.
Use Markdown formatting for readability.

End your response with exactly 2-4 follow-up suggestions as a JSON array
on a new line prefixed with "SUGGESTIONS:". Example:
SUGGESTIONS: ["What soil pH do tomatoes need?", "When to harvest cucumbers?"]`;

  if (!farm) return base;

  const cropList = plots
    .map((p) => `- ${p.label}: ${p.crop_type} (${p.crop_variety}), planted ${p.planted_at}`)
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

// ── LLM API callers ───────────────────────────────────────────────

async function callAnthropic(systemPrompt: string, userMessage: string): Promise<string> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': LLM_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    const err = await response.text().catch(() => 'unknown');
    console.error('[anthropic error]', response.status, err);
    throw new UpstreamError('AI service temporarily unavailable');
  }

  const data = (await response.json()) as Record<string, unknown>;
  const content = data['content'] as Array<{ type: string; text: string }>;
  return content[0]?.text ?? '';
}

async function callOpenAI(systemPrompt: string, userMessage: string): Promise<string> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${LLM_API_KEY}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      max_tokens: 1024,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    const err = await response.text().catch(() => 'unknown');
    console.error('[openai error]', response.status, err);
    throw new UpstreamError('AI service temporarily unavailable');
  }

  const data = (await response.json()) as Record<string, unknown>;
  const choices = data['choices'] as Array<{ message: { content: string } }>;
  return choices[0]?.message?.content ?? '';
}

function stubResponse(message: string): { reply: string; suggestions: string[] } {
  return {
    reply: `> ⚠️ **No LLM API key configured.** Responding with a stub.

Your question: *"${message}"*

I'm a crop planning assistant for LitCrop. To get real AI-powered advice, configure \`LLM_API_KEY\` and \`LLM_API_PROVIDER\` environment variables.

**Quick tips for Nagano, Japan:**
- Spring: Plant cold-tolerant crops (lettuce, spinach) after the last frost (~mid-April)
- Summer: Tomatoes, cucumbers, and eggplant thrive in your climate
- Fall: Daikon radish and napa cabbage are excellent choices`,
    suggestions: DEFAULT_SUGGESTIONS,
  };
}

// ── 5.11 POST /api/v1/chat ───────────────────────────────────────

router.post('/', async (c) => {
  const body = await c.req.json<Record<string, unknown>>();

  // Validate message
  const rawMessage = body['message'];
  if (rawMessage === undefined || rawMessage === null || rawMessage === '') {
    throw new ValidationError('Missing required field: message', { field: 'message', in: 'body' });
  }
  if (typeof rawMessage !== 'string') {
    throw new ValidationError("Invalid value for 'message': must be a string", { field: 'message' });
  }
  const message = rawMessage.trim();
  if (message.length === 0) {
    throw new ValidationError('Missing required field: message', { field: 'message', in: 'body' });
  }
  if (message.length > 2000) {
    throw new ValidationError("Invalid value for 'message': max 2000 characters", {
      field: 'message',
      max_length: 2000,
    });
  }

  // Load farm context if farm_id provided
  let farm: Farm | null = null;
  let plots: Plot[] = [];

  const farmId = body['farm_id'];
  if (farmId && typeof farmId === 'string') {
    try {
      farm = await dynamoRepo.getFarm(farmId);
      plots = await dynamoRepo.getPlotsForFarm(farmId);
    } catch {
      // Non-fatal: proceed without farm context
    }
  }

  const systemPrompt = buildSystemPrompt(farm, plots);
  const conversationId = `conv-${crypto.randomUUID()}`;

  // If no API key, return stub
  if (!LLM_API_KEY) {
    const stub = stubResponse(message);
    return c.json({ ...stub, conversation_id: conversationId });
  }

  // Call LLM
  let rawReply: string;
  try {
    if (LLM_PROVIDER === 'openai') {
      rawReply = await callOpenAI(systemPrompt, message);
    } else {
      rawReply = await callAnthropic(systemPrompt, message);
    }
  } catch (err) {
    if (err instanceof UpstreamError) throw err;
    throw new UpstreamError('AI service temporarily unavailable');
  }

  const { reply, suggestions } = parseSuggestions(rawReply);

  return c.json({ reply, suggestions, conversation_id: conversationId });
});

export default router;

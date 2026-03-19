# ADR-009: AI/LLM Framework Selection

## Status
Accepted (2026-03-20)

## Context
LitCrop has an AI chatbot endpoint (`POST /api/v1/chat`) that provides crop planning advice. The current implementation uses direct `fetch()` calls to the Anthropic Messages API (and optionally OpenAI). The user has confirmed that **Anthropic Claude API** (not Bedrock) will be the LLM provider going forward.

### Current State
- Single Hono route in `src/api/src/routes/chat.ts`
- Direct `fetch('https://api.anthropic.com/v1/messages', ...)` call
- Single-turn only: no conversation history, each request is independent
- Context injection: farm metadata and plot data are loaded from DynamoDB and injected into the system prompt
- Model: `claude-haiku-4-5-20251001` (Haiku for cost efficiency)
- Response parsing: custom `parseSuggestions()` extracts follow-up suggestions from LLM text
- Stub mode: returns canned response when `LLM_API_KEY` is not configured
- No streaming: response is buffered and returned as JSON
- No tool use: LLM cannot query data or perform actions
- Bundle: Lambda is bundled with esbuild; AWS SDK is externalized

### MVP Aspirations
- **Multi-turn conversations**: maintain conversation history within a session
- **Tool use**: allow the LLM to query farm data (DynamoDB), check weather (Open-Meteo API), look up crop databases
- **Streaming responses**: improve perceived latency for longer responses
- **Structured outputs**: reliable JSON extraction (replace regex-based SUGGESTIONS parsing)

### Decision Drivers
- Lambda cold start impact: package size directly affects cold start time (~1ms per 10KB of uncompressed JS)
- Bundle size: esbuild bundles all dependencies except `@aws-sdk/*`
- Current simplicity: the existing implementation is ~230 lines and works
- Incremental path: can we add features without replacing the foundation?
- Operational cost: framework overhead per request (memory, CPU)
- Maturity: production readiness for a Lambda deployment

## Options Considered

### Option A: Direct Anthropic API (current approach)
- **Description**: Continue using `fetch()` calls to `api.anthropic.com/v1/messages`. Add multi-turn by passing conversation history in the `messages` array. Add tool use by implementing the Anthropic tool use protocol manually.
- **Pros**:
  - Zero additional dependencies — no package size impact on Lambda bundle
  - Full control over request/response handling
  - Already working and tested in production
  - Minimal abstraction: easy to understand and debug
  - Cold start: no additional overhead
  - Can implement streaming with `fetch()` + ReadableStream (SSE parsing)
  - Anthropic tool use protocol is well-documented (JSON schema for tools, `tool_use` / `tool_result` message types)
- **Cons**:
  - No type safety: request/response types must be manually defined or cast
  - Streaming SSE parsing must be implemented manually (~50-80 lines)
  - Tool use loop (LLM calls tool -> execute -> return result -> LLM continues) must be implemented manually (~100-150 lines)
  - No retry logic or rate limit handling (must build)
  - Version tracking: must manually update `anthropic-version` header when API evolves
  - Error handling for edge cases (partial responses, token limits) must be built
- **Effort**: Low (current), Medium (to add tool use + streaming)
- **Package Size Impact**: 0 KB (no new dependencies)

### Option B: Anthropic SDK (`@anthropic-ai/sdk`)
- **Description**: Official TypeScript SDK from Anthropic. Provides typed client, automatic retries, streaming helpers, and tool use support.
- **Pros**:
  - **Full type safety**: `Anthropic.Messages.create()` with typed params and responses
  - **Streaming built-in**: `client.messages.stream()` returns an async iterable with helper methods
  - **Tool use support**: typed tool definitions, automatic tool result message construction
  - **Automatic retries**: configurable retry with exponential backoff for rate limits (429) and server errors (500+)
  - **Error classes**: `APIError`, `RateLimitError`, `AuthenticationError` for precise error handling
  - **Version management**: SDK handles `anthropic-version` header automatically
  - **Maintained by Anthropic**: updates track API changes
  - Tree-shakeable: esbuild will only bundle what is imported
- **Cons**:
  - Package size: ~3.2MB unpacked (but esbuild tree-shakes to ~150-200KB for Messages API usage)
  - Adds a dependency to manage (version updates, breaking changes)
  - Slight abstraction over the raw API (less control over HTTP details)
  - Node.js runtime dependency (uses `node:stream` — fine for Lambda, not for edge)
- **Effort**: Low (drop-in replacement for current fetch calls)
- **Package Size Impact**: ~150-200KB bundled (estimated after esbuild tree-shaking)

### Option C: Strands Agents SDK (`@strands-agents/sdk`)
- **Description**: AWS open-source agentic AI framework. TypeScript SDK (v0.7.0, experimental). Provides agent loop, tool execution, memory management, and multi-model support.
- **Pros**:
  - Full agent framework: automatic tool use loop, conversation memory, state management
  - Multi-model support: can switch between Anthropic, Bedrock, OpenAI
  - Built-in tool executor with sandboxing
  - Agent-to-Agent (A2A) protocol support for multi-agent architectures
  - AWS-backed: designed for AWS deployment (Lambda, Bedrock AgentCore)
- **Cons**:
  - **Experimental**: TypeScript SDK is explicitly labeled "experimental" with expected breaking changes
  - **Python-first**: community tools package is Python-only; TypeScript has limited vended tools
  - **Package size**: ~3.7MB unpacked; agent framework pulls in significant dependencies
  - **Overkill**: agent loop, A2A protocol, memory management are not needed for a crop chat assistant
  - **Cold start**: framework initialization adds overhead to Lambda cold start
  - **Bedrock-oriented**: primary model provider is Bedrock; direct Anthropic API is secondary
  - **Small community**: v0.7.0, limited Stack Overflow coverage, few production deployments
  - **Lock-in**: Strands-specific tool definitions and agent patterns
- **Effort**: Medium-High (learn framework concepts, restructure chat endpoint)
- **Package Size Impact**: ~300-500KB bundled (estimated; framework + model provider)

### Option D: Mastra Framework
- **Description**: TypeScript AI framework for building AI-powered applications with workflows, agents, RAG, and integrations.
- **Pros**:
  - TypeScript-native framework with modern API design
  - Workflow orchestration for multi-step AI processes
  - Built-in RAG support for knowledge base queries
  - Integration ecosystem for third-party services
- **Cons**:
  - **Package size**: ~41MB unpacked (`@mastra/core`) — disqualifying for Lambda
  - **Overkill**: workflow orchestration, RAG pipelines, integration framework far exceed chat needs
  - **Cold start**: 41MB of dependencies would add seconds to Lambda cold start
  - **Server-oriented**: designed for long-running servers, not serverless functions
  - **Complexity**: framework concepts (workflows, agents, tools, integrations) add significant learning curve
  - **Bundle risk**: even with tree-shaking, core framework is large
- **Effort**: High (learn framework, restructure application architecture)
- **Package Size Impact**: ~2-5MB+ bundled (even with aggressive tree-shaking)

## Decision
We choose **Option B: Anthropic SDK (`@anthropic-ai/sdk`)** as the foundation, with an incremental migration path from the current direct API calls.

Specifically:
- Install `@anthropic-ai/sdk` as a dependency in `@litcrop/api`
- Replace `callAnthropic()` fetch call with `new Anthropic().messages.create()`
- Remove `callOpenAI()` — consolidate on Anthropic (user's stated direction)
- Use SDK's streaming support (`messages.stream()`) when adding streaming to the chat endpoint
- Use SDK's tool use types when adding tool calling (query farm data, check weather)
- Keep the endpoint structure: single Hono route, single Lambda function

## Rationale

### Why Anthropic SDK over Direct API (Option A)?
The current direct fetch approach works, but the MVP needs multi-turn conversations, tool use, and potentially streaming. Implementing the tool use loop manually (send message -> detect tool_use -> execute tool -> send tool_result -> repeat) requires ~150 lines of careful protocol handling with edge cases (parallel tool calls, errors, token limits). The SDK provides this as `messages.create({ tools: [...] })` with typed responses. The ~150-200KB bundle size increase is negligible against the cold start budget (~15-20ms additional). Type safety alone prevents a class of bugs (malformed requests, missing required fields) that are common with raw fetch.

### Why Anthropic SDK over Strands (Option C)?
Strands is experimental (v0.7.0), TypeScript support is explicitly labeled unstable, and the framework's agent loop / A2A / memory abstractions are not needed. LitCrop's chat is a single endpoint that sends messages and optionally calls tools — not an autonomous agent. Adopting an agent framework adds complexity without proportional value. If agentic capabilities are needed in Production scope, Strands (or a successor) can be evaluated then.

### Why Anthropic SDK over Mastra (Option D)?
Mastra's 41MB unpacked size is disqualifying for Lambda. Even with tree-shaking, the framework's server-oriented architecture and workflow engine add cold start overhead and complexity that is inappropriate for a single chat endpoint.

### Deciding factors
1. **Right-sized**: SDK adds typed API client without framework overhead
2. **Bundle efficiency**: ~150-200KB after tree-shaking (vs. 0 for raw fetch, but worth it for type safety + tool use)
3. **Incremental adoption**: drop-in replacement for current `fetch()` calls; no architectural changes
4. **Tool use support**: typed tool definitions and automatic result handling for MVP features
5. **Maintained by Anthropic**: guaranteed API compatibility

## Consequences

### Positive
- Type-safe API calls: compile-time errors for malformed requests
- Automatic retries for rate limits and transient errors
- Streaming support available without manual SSE parsing
- Tool use protocol handled by SDK (tool call detection, result message construction)
- Version management: SDK tracks API versions automatically
- Drop-in migration: minimal code changes from current implementation

### Negative / Risks
- **New dependency**: must track SDK version updates. Mitigation: pin version, update deliberately.
- **Bundle size increase**: ~150-200KB. Mitigation: measure actual cold start impact; acceptable at this scale.
- **Anthropic lock-in**: SDK is Anthropic-specific. Mitigation: chat route is already Anthropic-specific; abstraction layer can be added if multi-provider becomes a requirement.
- **SDK abstractions**: less visibility into raw HTTP requests. Mitigation: SDK supports `httpAgent` and request logging for debugging.

## Implementation Notes

### Phase 1: SDK Migration (MVP baseline)
```typescript
// Before (current)
const response = await fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: { 'x-api-key': LLM_API_KEY!, 'anthropic-version': '2023-06-01', ... },
  body: JSON.stringify({ model: ANTHROPIC_MODEL, max_tokens: 1024, ... }),
});

// After (SDK)
import Anthropic from '@anthropic-ai/sdk';
const client = new Anthropic({ apiKey: LLM_API_KEY });
const response = await client.messages.create({
  model: ANTHROPIC_MODEL,
  max_tokens: 1024,
  system: systemPrompt,
  messages: [{ role: 'user', content: userMessage }],
});
```

### Phase 2: Tool Use (MVP feature)
```typescript
const response = await client.messages.create({
  model: ANTHROPIC_MODEL,
  max_tokens: 1024,
  system: systemPrompt,
  messages: conversationHistory,
  tools: [
    { name: 'get_farm_data', description: '...', input_schema: { ... } },
    { name: 'get_weather', description: '...', input_schema: { ... } },
  ],
});
// SDK provides typed tool_use content blocks for dispatch
```

### Phase 3: Streaming (MVP or Production)
```typescript
const stream = client.messages.stream({
  model: ANTHROPIC_MODEL,
  max_tokens: 1024,
  messages: conversationHistory,
});
// Return SSE to frontend via Hono's streaming response
```

### Conversation History
- Store conversation messages in DynamoDB keyed by `conversation_id`
- Load history on each request; append user message and assistant response
- Set TTL on conversation records (e.g., 24 hours) for automatic cleanup
- Limit history to last N messages to control token usage and cost

## Scope Progression
- **MVP**: SDK migration, multi-turn (DynamoDB history), tool use (farm data + weather queries)
- **Production**: streaming responses, conversation summarization for long histories, usage tracking and cost monitoring, prompt versioning

## References
- [@anthropic-ai/sdk on npm](https://www.npmjs.com/package/@anthropic-ai/sdk) — v0.80.0, ~3.2MB unpacked
- [Anthropic Tool Use Documentation](https://docs.anthropic.com/en/docs/build-with-claude/tool-use)
- [Anthropic Streaming Documentation](https://docs.anthropic.com/en/docs/build-with-claude/streaming)
- Current implementation: `src/api/src/routes/chat.ts`
- ADR-002 (Backend Platform): Hono on Lambda, esbuild bundling

# ADR-020: AI Context Pipeline — How Platform Content Feeds AI Assist

## Status
Accepted (2026-04-12)

## Context
LitCrop has a working AI chat endpoint (`POST /api/v1/chat`) using Claude Haiku via the Anthropic SDK. The current implementation injects **minimal farm context** into the system prompt — farm location/climate and a flat crop list. This ADR designs the full context pipeline: what platform data feeds the AI, how it's structured for the LLM, and how cost/privacy constraints shape the design.

### Current State (as of v0.52)
- **System prompt injection**: farm location, elevation, climate zone, locale, bed names with crop type/variety/planted_at
- **Tool use**: `get_farm_data` (returns farm + beds JSON), `get_weather` (Open-Meteo 7-day forecast)
- **Conversation history**: DynamoDB-backed, 24h TTL, 20-turn limit per conversation
- **Budget**: Haiku model, 50k input / 10k output tokens per user/day, 500k / 100k global/day
- **Rate limiting**: 20 messages/hour (in-memory, best-effort) + DynamoDB budget (authoritative)
- **Frontend**: `ChatAssistant.tsx` island component exists but is not rendered on any page

### What's Missing
The AI knows about farm metadata and current crops, but has **no access to**:
1. **Crop library** — species characteristics, days to harvest, propagation methods, companions
2. **Diary history** — work patterns, costs, timing, harvest yields, what the farmer actually does
3. **Lifecycle dates** — seeded_at, planted_at, expected_harvest, completed_at per bed
4. **ROI data** — costs per crop cycle, revenue from harvests, time invested
5. **Image metadata** — what photos exist, when captured, which beds they're from (no vision yet)

Without this data, the AI gives generic crop advice instead of personalized recommendations grounded in the farmer's actual operations.

### Decision Drivers
- **Budget ceiling**: ~$1.18/mo AWS cost, $5 hard ceiling. Every token counts.
- **Haiku model**: cost-optimized ($0.80/1M input, $4/1M output). Must stay on Haiku unless BYOK (#333).
- **Privacy**: geo is opt-in, cost data should be summarized not raw, user controls what leaves the platform.
- **Latency**: Lambda cold start + LLM API call. Context assembly must be fast (<200ms).
- **Data freshness**: farm data changes slowly (days/weeks), weather changes hourly.

## Design

### 1. Context Categories and Token Budgets

Total system prompt budget: **~2,000 tokens** (leaves room for conversation history + response within Haiku's 200k window, while keeping costs minimal).

| Category | Source | Tokens | Injection | Freshness |
|---|---|---|---|---|
| Farm metadata | DynamoDB (Farm) | ~100 | System prompt | Per-request |
| Current crops | DynamoDB (Beds) | ~200 | System prompt | Per-request |
| Crop knowledge | Static JSON library | ~300 | System prompt (filtered) | Static |
| Lifecycle status | DynamoDB (Beds) | ~150 | System prompt | Per-request |
| Diary summary | DynamoDB (DiaryEntry) | ~200 | Tool result | On-demand |
| ROI summary | DynamoDB (DiaryEntry) | ~200 | Tool result | On-demand |
| Weather | Open-Meteo API | ~300 | Tool result | On-demand |
| Image catalog | DynamoDB (Image) | ~100 | Tool result | On-demand |

**Design principle**: Static/slow-changing data goes in the system prompt (cheap, always available). Dynamic/expensive data is fetched via tools (only when the LLM needs it).

### 2. System Prompt Context (Always Injected)

Expand `buildSystemPrompt()` to include:

```
## Farm Context
- Location: {location} ({lat}, {lon})
- Elevation: {elevation}m | Climate: {climate_zone}
- Locale: {locale} | Currency: {default_currency}

## Active Crops
| Bed | Crop | Variety | Seeded | Planted | Expected Harvest | Status |
| {name} | {crop_type} | {variety} | {seeded_at} | {planted_at} | {expected_harvest} | {status} |

## Crop Knowledge (active crops only)
- {crop_type}: {days_to_harvest_min}-{days_to_harvest_max} days, propagation: {propagation}, season: {season}, companions: {companions}
```

**Key design choice**: Only include crop library entries for crops the farmer is **currently growing**. This keeps token count bounded (5-15 crops typical) rather than sending the full 100-entry library.

### 3. Tool Definitions (On-Demand via LLM)

#### Existing tools (keep as-is):
- `get_farm_data` — farm details + full bed list
- `get_weather` — 7-day forecast from Open-Meteo

#### New tools to add:

**`get_diary_summary`** — Recent work log aggregated by category
```json
{
  "farm_id": "string",
  "days_back": 30
}
```
Returns: category counts, total hours, total cost, recent entries (last 5). Summarized server-side to minimize tokens.

**`get_crop_roi`** — Cost/revenue summary per crop
```json
{
  "farm_id": "string",
  "bed_id": "string (optional)"
}
```
Returns: total cost, total revenue, net profit/loss, hours invested per crop. Aggregated from diary entries with `category: 'harvesting'` and `costs[]` data.

**`get_crop_info`** — Crop library lookup for any crop (not just active)
```json
{
  "crop_name": "string"
}
```
Returns: full crop library entry (days to harvest, season, companions, propagation). Enables the AI to advise on crops the farmer isn't yet growing.

**`get_image_catalog`** — Photo metadata for a bed (no vision)
```json
{
  "farm_id": "string",
  "bed_id": "string",
  "limit": 10
}
```
Returns: image count, date range, latest capture date. Useful for "when was the last photo of bed X?" queries. Does NOT send image bytes — vision analysis (#320) is a separate feature.

### 4. Context Assembly Flow

```
User sends message
       │
       ▼
┌─────────────────────┐
│ Load farm + beds     │ ◄── DynamoDB (always, ~50ms)
│ Filter active crops  │
│ Lookup crop library  │ ◄── Static JSON Map (0ms)
│ Build system prompt  │
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│ Anthropic API call   │ ◄── System prompt + history + user message
│ (with tool defs)     │
└─────────┬───────────┘
          │
    ┌─────┴─────┐
    │ tool_use? │
    └─────┬─────┘
     Yes  │  No
     ▼    │   ▼
┌──────────┐  ┌──────────┐
│ Execute   │  │ Return   │
│ tool(s)   │  │ response │
│ (DynamoDB │  └──────────┘
│  or API)  │
└─────┬────┘
      │
      ▼
   Continue LLM loop (max 5 iterations)
```

### 5. Privacy Boundaries

| Data | Rule | Rationale |
|---|---|---|
| Farm coordinates | Only sent if `latitude`/`longitude` non-null (user opted in) | Geo privacy — city-level minimum |
| Individual cost items | Sent as category totals, not line items | Financial privacy |
| Diary descriptions | Sent in full (user wrote them for the farm) | Operational context |
| Photo bytes | Never sent to LLM (metadata only) | Cost + privacy (#320 is separate) |
| User identity | Never included in LLM context | Not relevant to crop advice |
| Other users' data | Farm access enforced via `assertFarmAccess()` | Multi-tenancy |

### 6. Cost Analysis

Estimating per-conversation cost with expanded context:

| Component | Input Tokens | Output Tokens | Cost (Haiku) |
|---|---|---|---|
| System prompt (expanded) | ~800 | — | $0.00064 |
| Average user turn (5 turns) | ~500 | ~400 | $0.0084 |
| Tool calls (2 per conv avg) | ~600 | ~200 | $0.00128 |
| **Total per conversation** | **~3,400** | **~2,200** | **~$0.011** |

At **100 conversations/month** (generous for a small-farm app): **~$1.10/month** on LLM alone.

This fits within the ~$1.18 AWS budget, but leaves minimal headroom. Mitigations:
- Keep Haiku as default model (10x cheaper than Sonnet)
- Tool results are summarized server-side (not raw DynamoDB dumps)
- Daily budget caps prevent runaway costs
- BYOK (#333) would shift LLM cost to user's own API key

### 7. Caching Strategy

- **Crop library**: Already static JSON, loaded once per Lambda cold start. Zero cost.
- **Farm + beds**: Loaded per-request (DynamoDB read). Consider caching in Lambda memory for 60s if same farm_id. Low priority — DynamoDB reads are fast and cheap.
- **Weather**: Open-Meteo is free. Cache 1 hour per farm location to avoid redundant calls.
- **Diary/ROI summaries**: Compute on-demand per tool call. No caching needed — these change when the user adds entries, and queries are infrequent.
- **Conversation history**: Already cached in DynamoDB with 24h TTL. No changes needed.

### 8. What This ADR Does NOT Cover

- **Image vision analysis** (#320) — Requires sending image bytes to Claude Sonnet/Opus. Separate ADR needed for cost/model selection.
- **BYOK (Bring Your Own Key)** (#333) — User provides their own Anthropic API key. Depends on this ADR (pipeline design) + #281 (monetization tiers).
- **AI chat on all pages** (#183) — Frontend integration. This ADR covers the backend pipeline; #183 is a UI routing change.
- **Streaming responses** — Listed in ADR-009 Phase 3. Orthogonal to context pipeline.
- **Prompt versioning** — Production concern. For now, system prompt is inline in `buildSystemPrompt()`.

## Decision

Adopt the **tiered context pipeline**: static/slow data in system prompt, dynamic data via tools.

Specifically:
1. Expand `buildSystemPrompt()` to include crop library metadata for active crops and lifecycle dates
2. Add 4 new tools: `get_diary_summary`, `get_crop_roi`, `get_crop_info`, `get_image_catalog`
3. Summarize tool results server-side to minimize token usage
4. Enforce privacy boundaries at the tool executor level (not the LLM)
5. Keep Haiku model; daily budgets unchanged
6. No caching in Phase 1 (optimize later if budget pressure emerges)

## Consequences

### Positive
- AI gives personalized advice grounded in actual farm data (diary, costs, lifecycle)
- Token-efficient: only active crop metadata in prompt; everything else on-demand
- Privacy-respecting: summarized costs, opt-in geo, no user identity
- Fits within $1.18/mo budget at expected usage
- Unblocks #333 (BYOK), #183 (chat on all pages), #320 (image AI — partially)

### Negative / Risks
- **4 new tool implementations**: ~200 lines of new code in chat.ts or a tools module. Mitigation: tools are simple DynamoDB queries with aggregation.
- **Token budget creep**: As more data is injected, costs rise. Mitigation: daily budget caps are the hard stop; monitor via `/api/v1/usage`.
- **Tool call latency**: Each tool call adds ~50-100ms (DynamoDB) + one more LLM round. Mitigation: max 5 tool iterations already enforced.
- **Haiku limitations**: Haiku may struggle with complex multi-step reasoning across many tools. Mitigation: BYOK (#333) allows users to upgrade to Sonnet with their own key.

## Implementation Phases

### Phase 1: Enriched System Prompt (this sprint)
- Expand `buildSystemPrompt()` with lifecycle dates and crop library metadata
- Zero new tools, zero new DynamoDB queries (data already loaded)
- Estimated effort: 2-3 hours

### Phase 2: Diary + ROI Tools (next sprint or Pre-PROD)
- Add `get_diary_summary` and `get_crop_roi` tools
- New DynamoDB query: aggregate diary entries by farm_id with date range
- Estimated effort: 4-6 hours

### Phase 3: Crop Lookup + Image Catalog Tools (Pre-PROD)
- Add `get_crop_info` (static library lookup) and `get_image_catalog` (DynamoDB query)
- Estimated effort: 2-3 hours

### Phase 4: BYOK + Model Upgrade Path (#333)
- Depends on #281 (monetization tiers)
- Allow user-provided API key; optionally switch to Sonnet for richer responses
- Separate ADR required

## Rollback Plan
Each phase is additive (new tools, expanded prompt). Rollback = revert to current `buildSystemPrompt()` and remove tool definitions. No data migration needed.

## References
- Current implementation: `src/api/src/routes/chat.ts` (494 lines)
- Budget service: `src/api/src/services/budget.ts`
- ADR-009: AI/LLM Framework Selection (Anthropic SDK)
- ADR-20260405: Static-First Crop Library
- Crop library: `packages/shared/src/data/crop-library.json`
- Domain types: `packages/shared/src/types/domain.ts`
- Issue #278: design(ai): define AI context pipeline
- Dependent issues: #333 (BYOK), #183 (chat all pages), #320 (image AI)

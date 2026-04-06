# ADR-20260406: ROI Dashboard Data Model and Aggregation Strategy

## Status
Proposed

## Context

The Farm Diary (Beta-7/8) tracks daily work and costs via `DiaryEntry` with `costs: CostItem[]`. Farmers need financial analytics to answer: "Is this bed/crop profitable?" and "Where am I spending the most?"

Issue #248 (ROI Dashboard) and #245 (Farm Diary foundation) require:
- Harvest volume tracking (kg, pieces harvested)
- Revenue/income recording per harvest
- Aggregated financial views (per-bed, per-crop, per-month)
- ROI computation: `(revenue - costs) / costs * 100`

**Forces at play:**
- AWS budget ceiling of ~$1.18/month ($5 hard ceiling) — no new services
- Existing DynamoDB single-table design with DIARY# items
- Typical farm: ~50 beds, ~500-2000 diary entries/year
- DiaryEntry already has `category: 'harvesting'` as a natural anchor point
- Project is at MVP scope level

## Options Considered

### Option 1: Extend DiaryEntry with inline harvest + revenue fields
- **Description**: Add `harvest_amount`, `harvest_unit`, `revenue`, `revenue_currency` as nullable fields on the existing DiaryEntry. Only populated when `category === 'harvesting'`. Client-side aggregation computes ROI.
- **Pros**: Minimal change — 4 fields on an existing entity. No new DDB entity, no new GSI, no new API endpoint. Reuses all existing CRUD. Zero cost increase. Backward compatible (old entries have null fields).
- **Cons**: DiaryEntry becomes slightly "wider" with fields only relevant to one category. Aggregation is purely client-side (fine for <2000 entries, may not scale to 10K+).
- **Effort**: Low

### Option 2: Separate HarvestRecord entity + server-side aggregation endpoint
- **Description**: New DDB entity type (PK=FARM#farmId, SK=HARVEST#date#recordId) with full harvest data. New REST endpoint `GET /farms/:farmId/analytics` returns pre-aggregated data computed in Lambda.
- **Pros**: Clean data separation. Server handles aggregation. Scales to larger data volumes.
- **Cons**: Significant implementation: new entity type, new DDB access patterns, new Zod schemas, new API routes, new Lambda handler. Doubles the write path for harvest events (diary entry + harvest record). Over-engineered for MVP data volumes.
- **Effort**: High

### Option 3: Pre-computed aggregate records in DynamoDB
- **Description**: Store summary records (PK=FARM#farmId, SK=AGG#month or AGG#bed) that are updated on every diary write via DynamoDB transactions.
- **Pros**: Fast reads for dashboard — single query returns aggregates.
- **Cons**: Write amplification (every diary CRUD updates 2-3 aggregate records). Eventual consistency risk. Complex rollback logic on update failures. Additional DynamoDB WCU cost. Over-engineered for <2000 entries.
- **Effort**: High

## Decision

**Option 1: Extend DiaryEntry with inline harvest + revenue fields, client-side aggregation.**

Specific additions to DiaryEntry:
- `harvest_amount: number | null` — quantity harvested
- `harvest_unit: string | null` — unit label (kg, bunch, piece, etc.)
- `revenue: number | null` — sale value of harvest
- `revenue_currency: 'JPY' | 'USD' | null` — currency of revenue

Plus `default_currency: 'JPY' | 'USD'` on the Farm entity for aggregation filtering.

All aggregation (ROI by bed, cost by category, monthly trends) computed client-side in `roi-utils.ts`.

## Rationale

1. **Data volume is small**: 500-2000 entries/year at ~200 bytes each is ~400KB — trivially handled client-side. Server-side aggregation adds latency (extra round-trip) and Lambda cost for no benefit.
2. **Zero cost increase**: No new DDB entities, GSIs, or Lambda endpoints. Four nullable attributes on existing items add negligible storage.
3. **Reversibility**: If client-side aggregation proves too slow at Production scale, we can add a server-side endpoint without changing the data model. The inline fields remain correct regardless of aggregation strategy.
4. **Existing pattern**: DiaryEntry already has category-specific semantics (e.g., `syncBedDatesFromDiary` only fires for planting/harvesting). Adding category-conditional fields follows the same pattern.
5. **Budget compliance**: $0.00 monthly delta stays well within the $1.18 target.

## Consequences

### Positive
- Fastest path to user-facing ROI analytics (low implementation effort)
- No migration needed — DynamoDB is schemaless, old entries work unchanged
- Aggregation logic is pure functions, highly testable without infrastructure
- Dashboard is instantly responsive (no API call for each filter change)

### Negative
- DiaryEntry has 4 fields only meaningful for one category (mild schema "smell")
- Client must fetch all entries in date range before rendering (pagination adds latency for first load)
- No real-time currency conversion — mixed-currency farms see partial aggregates
- If data volume exceeds ~5000 entries, client-side aggregation may need optimization (unlikely at MVP)

## Implementation Notes

1. **Schema validation**: `CreateDiaryEntrySchema` uses `.refine()` to reject harvest/revenue fields when category is not 'harvesting'
2. **Backward compatibility**: `itemToDiaryEntry()` in DynamoDB service defaults new fields to `null` for existing items
3. **Currency filtering**: ROI dashboard shows aggregates for farm's `default_currency` only; other-currency entries listed separately
4. **Chart rendering**: Pure CSS (horizontal bars, stacked bars) following the Gantt chart pattern — no new dependencies
5. **Date range**: Default to current calendar year; user can adjust with from/to pickers
6. **Auto-pagination**: Frontend fetches all pages (limit=100 per page) before computing aggregates; loading spinner shown during fetch

## Rollback Plan

- Remove the 4 fields from schemas and types; null values in DDB are harmless (ignored on read)
- Remove `default_currency` from Farm entity
- Remove frontend ROI tab and components
- No data migration needed in either direction

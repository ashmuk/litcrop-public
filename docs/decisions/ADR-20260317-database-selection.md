# ADR-20260317: Database Selection for Farm Metadata

## Status
Accepted

## Context
LitCrop needs to store structured metadata for 6 entities: Farm, Field, Bed, Plot, Image, and Tag. The data model is inherently relational (Farm -> Field -> Bed -> Plot -> Image -> Tag), but the PoC is single-farm, single-user with very low data volume.

Access patterns required:
1. Get farm with full hierarchy (Farm Overview screen)
2. List all plots with latest status (Farm Overview grid)
3. Get single plot with crop metadata (Plot Detail screen)
4. List images for a plot, paginated by time (Image Timeline)
5. Get single image with signed URL (Image view)
6. Add tag to image, update plot latest_status (Tagging)

Vision.md mentions "NoSQL database for farm and crop metadata" but the data model from REQUIREMENTS.md is clearly relational with foreign keys.

### Decision Drivers
- Cost: Must be zero or near-zero at PoC scale
- Data model fit: 6 entities with FK relationships, hierarchical queries
- Query flexibility: Need joins/lookups across entities for dashboard screens
- Simplicity: Minimal operational overhead
- Scalability path: Must work for MVP scale (hundreds of plots, thousands of images)

## Options Considered

### Option A: DynamoDB (single-table design)
- **Description**: Store all entities in a single DynamoDB table using composite keys and GSIs for access patterns.
- **Pros**:
  - 25GB free tier storage, 25 RCU/WCU free (perpetual, not 12-month)
  - Zero operational maintenance (fully managed, serverless)
  - Predictable single-digit millisecond latency
  - Native AWS integration (Lambda SDK)
  - Scales effortlessly from zero to massive
- **Cons**:
  - Single-table design is complex for relational data
  - No joins; must denormalize or use multiple queries
  - Hierarchical queries (farm -> all plots) require careful key design
  - Cursor-based pagination needs careful GSI design
  - Hard to query ad-hoc during development
  - Learning curve for single-table patterns
- **Effort**: High (design), Low (operations)

### Option B: PostgreSQL via Neon (serverless)
- **Description**: Use Neon's serverless PostgreSQL with auto-suspend (scales to zero).
- **Pros**:
  - Natural fit for relational data model with foreign keys
  - SQL for all queries; joins across entities are trivial
  - Scales to zero (no cost when idle)
  - Standard PostgreSQL; no vendor lock-in on data model
  - Easy to explore data during development
- **Cons**:
  - Free tier: 0.5GB storage, 1 project (sufficient for PoC)
  - Cold start on wake from suspend (~500ms)
  - External service (not AWS-native); adds network hop from Lambda
  - Connection pooling needed for Lambda (Neon provides this)
  - Another vendor relationship beyond AWS
- **Effort**: Low (design), Low (operations)

### Option C: DynamoDB with simplified key design
- **Description**: Use DynamoDB but with multiple tables (one per entity) instead of single-table design, accepting the trade-off of multiple queries.
- **Pros**:
  - Simpler than single-table DynamoDB
  - AWS-native, free tier
  - Each table is straightforward
- **Cons**:
  - Still no joins; dashboard queries need multiple round-trips
  - Multiple tables to manage
  - Doesn't leverage DynamoDB's strength (single-table access patterns)
  - More complex than SQL for the relational queries needed
- **Effort**: Medium

## Decision
We choose **Option A: DynamoDB (single-table design)**.

Despite the higher design effort, DynamoDB is the best fit for the full lifecycle:
- Perpetual free tier (25GB, 25 RCU/WCU) means guaranteed $0 at PoC and likely $0 through MVP
- Zero operational overhead (no connection pooling, no cold-start wake-up, no storage limits at PoC scale)
- AWS-native eliminates external dependency and network hop
- Single-table design, while complex upfront, produces the most efficient access patterns for the dashboard

### Single-Table Key Design

| Entity | PK | SK | GSI1-PK | GSI1-SK | GSI2-PK | GSI2-SK |
|--------|----|----|---------|---------|---------|---------|
| Farm | `FARM#{farmId}` | `#META` | — | — | — | — |
| Field | `FARM#{farmId}` | `FIELD#{position}#{fieldId}` | — | — | — | — |
| Bed | `FIELD#{fieldId}` | `BED#{position}#{bedId}` | — | — | — | — |
| Plot | `BED#{bedId}` | `PLOT#{plotId}` | `PLOT#{plotId}` | `#META` | `FARM#{farmId}` | `PLOT#{plotId}` |
| Image | `PLOT#{plotId}` | `IMG#{capturedAt}#{imageId}` | `IMG#{imageId}` | `#META` | — | — |
| Tag | `IMG#{imageId}` | `TAG#{createdAt}#{tagId}` | — | — | — | — |

> **Note**: Field and Bed SKs include a position prefix for ordered retrieval by display position.
> Plot items carry a denormalized `farm_id` attribute (not in REQUIREMENTS.md data model) to support GSI2 for the Farm Overview "all plots for a farm" query.

**GSI1** enables:
- Get plot by plotId (Plot Detail screen)
- Get image by imageId (Image metadata + signed URL)

**GSI2** enables:
- Get all plots for a farm (Farm Overview screen) — flattens the hierarchy via denormalized `farm_id`

**Base table** enables:
- Get farm + fields (PK = `FARM#{farmId}`, SK begins_with `FIELD#`, ordered by position)
- Get beds for field (PK = `FIELD#{fieldId}`, SK begins_with `BED#`, ordered by position)
- Get plots for bed (PK = `BED#{bedId}`, SK begins_with `PLOT#`)
- Get images for plot, time-ordered (PK = `PLOT#{plotId}`, SK begins_with `IMG#`)
- Get tags for image (PK = `IMG#{imageId}`, SK begins_with `TAG#`)

## Consequences

### Positive
- $0 perpetual cost for PoC and likely MVP
- Single AWS service; no external dependencies
- Millisecond latency for all access patterns
- Cursor-based pagination natural with SK ordering

### Negative / Risks
- Single-table DynamoDB requires careful key design upfront
- "Get all plots for a farm" requires multiple queries (farm -> fields -> beds -> plots) or denormalization
- Ad-hoc queries during development are harder than SQL
- Team needs to learn DynamoDB single-table patterns

### Mitigations
- For "all plots" query: create a GSI2 with PK=`FARM#{farmId}` SK=`PLOT#{plotId}` by adding farm_id as an attribute on Plot items. This flattens the hierarchy for the Farm Overview screen.
- Use DynamoDB local for development and testing
- Document all access patterns and key designs in ARCHITECTURE.md
- If single-table proves too complex during implementation, can fall back to multi-table DynamoDB (Option C) with minimal code changes

### Rollback Plan
- Data can be exported to JSON and imported into PostgreSQL
- Hono route handlers abstract the data layer; swapping DynamoDB for SQL requires changing the data access module only
- Migration to Neon PostgreSQL is feasible at any point

## References
- [DynamoDB Single-Table Design](https://www.alexdebrie.com/posts/dynamodb-single-table-design-lessons/)
- [DynamoDB Free Tier](https://aws.amazon.com/dynamodb/pricing/) — 25GB, 25 RCU, 25 WCU perpetual
- REQUIREMENTS.md: Data model, 6 entities, access patterns

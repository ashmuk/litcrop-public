# ADR-20260322: Phase D Bed-Grid Data Model

## Status
Proposed

## Context

Phase D (UX Restructure) introduces a bed-grid layout model where farms have a rows x cols grid (max 5x5 = 25 beds). The scenario specifies "one crop per bed" -- a significant simplification from the current 4-level hierarchy (Farm -> Field -> Bed -> Plot).

The current hierarchy was designed for PoC flexibility but has proven to be:
1. Over-engineered for actual usage (demo farm has 2 fields, 3 beds, 6 plots)
2. Expensive to query (N+1 DynamoDB reads to reconstruct the tree)
3. Confusing for end users who think in terms of "beds with crops"

The new bed-grid model must coexist with existing demo farm data that uses the full hierarchy.

### Forces
- Existing demo farm data uses Field/Bed/Plot hierarchy -- migration required
- Frontend "Layout" view needs row/col coordinates per bed
- "One crop per bed" eliminates the need for a separate Plot entity
- Image uploads currently reference `plot_id` -- all image associations must be updated
- Camera simulator references plot IDs in upload paths
- GSI2 indexes plots by farm_id for the farm overview query
- Simplicity is a project value -- fewer entities = less cognitive load

## Options Considered

### Option A: Keep 4-level hierarchy, auto-generate from grid
- **Description**: Keep Farm->Field->Bed->Plot. Auto-generate a single Field ("Grid") and Bed/Plot pairs from grid dimensions. Plot remains the image target.
- **Pros**: Zero migration of existing data model. No API shape changes for image uploads. Backward-compatible.
- **Cons**: Maintains unnecessary complexity (Field layer, Plot layer). Grid coordinates must be stored somewhere extra. "One crop per bed" is a convention, not enforced. New code must auto-generate 3 entity types per bed cell.
- **Effort**: Low

### Option B: Flatten to Farm->Bed, merge Plot into Bed
- **Description**: Remove Field and Plot entities. Add `row`, `col`, `crop_type`, `crop_variety`, `planted_at`, `expected_harvest`, `latest_status` directly to Bed. Bed becomes the image target (replace `plot_id` with `bed_id` everywhere). Add `grid_rows` and `grid_cols` to Farm.
- **Pros**: Maximum simplicity -- 2-level hierarchy. One entity per grid cell. Grid coordinates are first-class fields. "One crop per bed" is structurally enforced. Fewer DynamoDB queries (farm meta + beds in 2 queries). Aligns with user mental model.
- **Cons**: Breaking change to Image entity (`plot_id` -> `bed_id`). Requires data migration for demo farm. Field entity becomes dead code. Existing "Add Plot" wizard replaced entirely.
- **Effort**: Medium

### Option C: Keep Bed and Plot as 1:1 enforced, add row/col to Bed
- **Description**: Remove Field. Keep Bed (with row/col) and Plot (with crop data) as separate entities but enforce 1:1 relationship. Images still target Plot.
- **Pros**: Plot remains the image target (less API churn). Bed handles layout, Plot handles crop -- separation of concerns.
- **Cons**: Two entities for what is conceptually one thing. 1:1 enforcement adds validation complexity. Still requires Field removal migration. More queries than Option B for the same result.
- **Effort**: Medium

## Decision

**Option B: Flatten to Farm->Bed, merge Plot into Bed.**

With one modification: Image entities will use `bed_id` as their primary association (replacing `plot_id`). The existing `bed_id` field on Image already exists (added as a denormalization in MVP), so the transition is partially pre-built.

## Rationale

1. **Simplicity wins**: The 4-level hierarchy was speculative design. Real usage shows beds-with-crops is the natural unit. Option B eliminates two entity types (Field, Plot) and matches the user mental model exactly.

2. **Query efficiency**: Farm overview goes from 1 + N(fields) + N(beds) + N(plots) queries to 1 (farm meta) + 1 (all beds for farm) = 2 queries. This is a significant improvement.

3. **Image already has bed_id**: The `bed_id` field was denormalized onto Image in MVP (SF-4). Switching the primary association from `plot_id` to `bed_id` is low-risk because the data already exists.

4. **Grid is first-class**: `row`/`col` on Bed plus `grid_rows`/`grid_cols` on Farm make the layout intrinsic to the data model, not a UI interpretation.

5. **Migration scope is bounded**: Only the demo farm has data. This is a controlled migration of seed data, not a production migration with unknown volume.

## Consequences

### Positive
- Simpler domain model (Farm, Bed, Image, Tag -- 4 core entities vs 6)
- Faster farm overview queries (2 DynamoDB reads instead of N+1)
- Grid layout is a structural guarantee, not a UI convention
- Frontend code simplification (no Field/Plot layers to render)

### Negative
- Breaking API change: `plot_id` references become `bed_id` in Image endpoints
- Dead code: Field and Plot types, schemas, and DynamoDB operations need removal
- Seed data script must be rewritten for the new model
- Camera simulator must be updated to target beds instead of plots

### Risks
- If future requirements need sub-bed divisions (multiple crops per bed), this model would need extension. Mitigation: the 5x5 grid limit makes this unlikely for MVP+; a future "split bed" feature could add child beds.

## Implementation Notes
- Phase the migration: update types/schemas first, then API, then frontend, then seed data
- Keep old Field/Plot DynamoDB operations as deprecated until seed data is confirmed migrated
- GSI2 repurposed: beds indexed by farm_id (currently plots indexed by farm_id)
- Image upload path changes: `images/{farmId}/{bedId}/...` instead of `images/{farmId}/{plotId}/...`

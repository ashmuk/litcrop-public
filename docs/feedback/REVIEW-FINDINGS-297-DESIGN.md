# Design Review Findings: #297 Gantt Chart with Diary Events

> Reviewed by my-reviewer on 2026-04-06
> Artifacts: ADR-20260406, ARCHITECTURE.md S14, TASK-BREAKDOWN.md Beta-9, gantt-events.html mockup
> Status: **Conditional Approval** -- proceed after addressing MUST-FIX items

---

## Part 1: Standard Design Review

### Findings

| Ref | File / Section | Issue | Severity |
|-----|---------------|-------|----------|
| F1 | ARCHITECTURE.md S14.2 | **`completed_at` semantics are ambiguous**: The design says "set by Mark done action" but does not define what "done" means. Is it "this crop cycle is finished" or "this bed is retired/decommissioned"? This distinction is critical for Beta-10 (1:N bed:crop) and for Crops page cross-reference. If it means "crop cycle done", it belongs on a crop assignment, not the bed. If it means "bed retired", it should prevent new crop assignments. The current design conflates both. | **MUST-FIX** |
| F2 | ARCHITECTURE.md S14.2 | **`completed_at` on Bed will require migration in Beta-10**: When 1:N bed:crop lands (#279), `completed_at` on Bed must either be moved to a CropAssignment entity or reinterpreted. Adding it to Bed now creates a known rework obligation. The ADR does not acknowledge this. | **MUST-FIX** |
| F3 | api.ts, domain.ts | **`FarmBed` type missing `completed_at`**: The design says bed list responses must include `completed_at` (S14.7), but the `FarmBed` interface in `api.ts` does not include it. The task breakdown (T9.3) mentions it, but the architecture section does not explicitly list the `FarmBed` / `FarmBedItem` type change. This could be missed during implementation. | SHOULD-FIX |
| F4 | ARCHITECTURE.md S14.3 | **`computeRangePosition` is a trivial alias**: The doc defines `computeRangePosition()` as identical to `computeBarPosition()` ("just renamed for clarity"). Adding a second function with the same implementation adds confusion, not clarity. Either reuse `computeBarPosition` directly (it already accepts generic start/end ranges) or document why a distinct name is needed. | SHOULD-FIX |
| F5 | ARCHITECTURE.md S14.7 | **Pagination strategy is under-specified**: The design says "fetch with limit=100 and follow cursor pagination until all entries are loaded." This is an unbounded client-side loop. For a farm with heavy diary usage (multiple entries per day for 12 months), this could be 500+ entries and 5+ sequential API calls on every Gantt mount. No loading state, error handling, or cancellation strategy is described. | SHOULD-FIX |
| F6 | ARCHITECTURE.md S14.6 | **"Mark done" UX is undefined on mobile**: S14.6 lists "long-press (mobile) or right-click (desktop)" but the mockup CSS says `.gantt__mark-done { display: none }` on mobile. S14.8 says "Tap icon button". The three sources contradict each other. Pick one approach and document it. | SHOULD-FIX |
| F7 | ARCHITECTURE.md S14.4 | **`buildEventDotMap` excludes `other` category but task breakdown says "all categories included"**: S14.4 line `if (entry.category === 'other') continue;` vs T9.5 "All categories included." Contradictory spec will lead to implementation ambiguity. | SHOULD-FIX |
| F8 | ADR-20260406 | **ADR does not mention forward compatibility with 1:N crops or seasons**: The ADR's "Consequences" section should acknowledge that `completed_at` on Bed is a temporary design that will need revisiting. This is a documentation gap, not a code gap. | SUGGESTION |
| F9 | ARCHITECTURE.md S14.11 | **`BedTimelineItem` defined in two places**: The interface is defined both in `CropTimeline.tsx` (existing) and in the architecture doc for `GanttChart.tsx`. These should be unified into a shared type in `domain.ts` or `diary-utils.ts` to avoid drift. | SUGGESTION |
| F10 | ARCHITECTURE.md S14.6 | **Optimistic update without rollback queue**: The design mentions "optimistic update: move the bed between panes immediately, revert on API error." For a simple PATCH this is fine, but no debounce or queue is mentioned. If a user rapidly clicks "mark done" on multiple beds, concurrent PATCHes could race. Low risk given max 25 beds, but worth noting. | SUGGESTION |

### Alignment Assessment

- **Addresses #297 requirements**: Yes. Multi-month view, diary dots, active/obsolete panes, cross-reference, responsive -- all covered.
- **Scope creep**: None detected. The design stays within #297 boundaries. No new API endpoints, no new DynamoDB tables.
- **Root cause vs. symptoms**: The design correctly identifies that the current system has no "done" concept and adds one. However, the chosen location (`completed_at` on Bed) addresses the symptom (Gantt needs an active/obsolete split) rather than the root cause (there is no crop lifecycle model).

### Quality Assessment

- **Architecture**: Clean. Option 2 (new component, keep existing) is the right call. Separation of concerns is well-motivated.
- **Mockup**: High quality. Desktop + mobile + dark mode + cross-reference flow. CSS uses design tokens consistently.
- **Task breakdown**: Well-structured with clear batches and dependencies. Sizes are realistic.
- **Cost impact**: Correctly assessed at $0.00. No new AWS resources.

### Risks

1. **Data fetch on mount**: Gantt view will trigger a wide-range diary fetch (up to 400 days). If the user switches between views rapidly, stale/concurrent fetches could cause flickering. Consider an abort controller.
2. **Sticky positioning**: `position: sticky` with horizontal scroll containers can behave inconsistently across mobile browsers. Needs testing on Safari iOS.
3. **25-bed assumption**: "No virtualization needed (max 25 beds)" is correct today, but if grid_rows/grid_cols limits increase, this assumption breaks. Acceptable for now.

---

## Part 2: Forward-Looking Analysis

### Concept A: "Mark Done" and Crops Page Cross-Reference

**Question**: If "mark done" on Gantt also affects the Crops page (FarmOverview bed tiles), what changes?

#### Current State
- Crops page (FarmOverview) shows bed tiles with crop_type, status, latest image
- No "done" or "archived" concept visible on Crops page
- All beds are always shown in the grid layout

#### Analysis

| Aspect | Pros | Cons |
|--------|------|------|
| Show "done" badge on Crops page tiles | Consistent cross-page experience; user sees completion state everywhere | Requires Crops page changes in Beta-9 scope (scope creep) |
| Gray out / dim "done" beds on Crops page | Visual consistency with Gantt's obsolete pane | Could confuse users: "is this bed broken?" |
| Separate "Completed" section on Crops page | Clean active/archive split; matches Gantt's two-pane model | Crops page layout disruption; grid becomes uneven |
| Hide "done" beds from Crops page | Simplest implementation; reduces visual clutter | Users lose visibility; must go to Gantt to see completed beds |
| No Crops page change (current plan) | Zero scope creep; Gantt is self-contained | Inconsistent: bed appears active on Crops page but obsolete on Gantt |

#### Key Question: What Does "Done" Mean?

This is the fundamental ambiguity (F1 above). Two interpretations:

1. **"This crop cycle is done"** (crop-centric): The tomatoes in bed A1 have been harvested. The bed itself is fine -- you could plant lettuce next week. In this interpretation, the Crops page should show the bed as "available for replanting" or "between crops."

2. **"This bed is retired"** (bed-centric): Bed A1 is no longer in active use this season. In this interpretation, the Crops page should gray out or hide the bed.

**The design implicitly assumes interpretation 2** (bed-centric) because `completed_at` is on the Bed entity and moves the entire bed to the "obsolete" pane. But the UI text says "Mark as completed" which reads as crop-centric.

#### Recommendation for Concept A
- For Beta-9: Do NOT change the Crops page. Gantt is a self-contained diary view.
- Document that `completed_at` means "this bed's current crop cycle is done" (interpretation 1).
- In Beta-10 when 1:N lands, `completed_at` naturally moves to the crop assignment level.
- The Crops page cross-reference becomes a Beta-10 concern.

---

### Concept B: 1:N Bed:Crop (#279, Beta-10)

**Question**: If a bed can have multiple crops over time (rotation/succession), how does the #297 design hold up?

#### Current State
- 1 bed = 1 crop: `crop_type`, `planted_at`, `expected_harvest` are flat fields on Bed
- Gantt shows one reserved bar + one actual bar per bed
- `completed_at` is proposed as a flat field on Bed

#### Impact on Gantt Design

| Gantt Aspect | 1:1 (current) | 1:N (Beta-10) | Migration Difficulty |
|-------------|---------------|----------------|---------------------|
| Bar rendering | 1 reserved + 1 actual per bed | N reserved + N actual per bed; need multiple bars per row or one row per crop assignment | Medium -- rendering logic changes |
| Row identity | 1 row = 1 bed | 1 row = 1 bed (stacked bars) OR 1 row = 1 crop assignment (expanded rows) | Medium -- data mapping changes |
| "Mark done" | Per bed | Per crop assignment -- "mark this tomato cycle done, start lettuce" | **High** -- `completed_at` moves from Bed to CropAssignment |
| Active/Obsolete split | Beds with/without `completed_at` | Beds with all crop assignments completed vs. beds with at least one active | Medium -- filter logic changes |
| Event dots | Dots on bed row, any category | Dots need association to specific crop assignment (which crop was the "watering" for?) | **High** -- diary entry needs crop assignment link |

#### The `completed_at` Migration Problem

If `completed_at` is added to Bed now, Beta-10 must:
1. Create a `CropAssignment` entity with its own `completed_at`
2. Migrate existing `completed_at` from Bed to the first/only CropAssignment
3. Update all Gantt logic to read from CropAssignment instead of Bed
4. Keep Bed-level `completed_at` as a computed property (all assignments done?) or remove it

This is manageable but represents known technical debt.

#### Recommendation for Concept B

Two options:

**Option B1: Accept the rework (recommended)**
- Add `completed_at` to Bed now as designed
- In Beta-10, introduce CropAssignment and migrate `completed_at`
- Rationale: The rework is small (one field migration). Delaying #297 to design a full CropAssignment model is over-engineering for the current 1:1 reality.

**Option B2: Future-proof by adding a thin CropAssignment now**
- Instead of `completed_at` on Bed, create a `CropAssignment` type now that wraps `crop_type`, `planted_at`, `expected_harvest`, `completed_at`
- Bed gets `current_crop: CropAssignment | null` (1:1 for now)
- In Beta-10, change to `crops: CropAssignment[]` (1:N)
- Rationale: Avoids field migration. But this is a significant structural change (every bed read/write path must change) for a feature that may never ship.

**Verdict**: Option B1. The field migration in Beta-10 is a 30-minute task. The structural change in B2 would triple the scope of #297.

---

### Concept C: Season Concept

**Question**: What if all beds have a cycle/season concept (e.g., Spring 2026, Summer 2026)?

#### Analysis

| Design Question | Answer |
|----------------|--------|
| Is a season a first-class entity? | Not recommended for this project's scale. A season is effectively a date range label. Adding a `Season` table/entity adds complexity for minimal value. |
| How do seasons interact with Gantt? | Seasons would be rendered as background bands (shaded vertical stripes) behind the month columns. Visual-only, no data model impact. |
| How do seasons interact with "mark done"? | "Mark done" could mean "done for this season." This aligns with interpretation 1 (crop-cycle done). If seasons are just date ranges, `completed_at` naturally falls within a season. |
| How do seasons interact with 1:N? | Each CropAssignment could have an optional `season: string` tag. This is a label, not a foreign key. |
| Does #297 need to change for seasons? | No. The Gantt date range already implicitly represents a season window. Adding visual season bands later is additive CSS, not a structural change. |

#### Season Implementation Options

| Approach | Complexity | Value |
|----------|-----------|-------|
| No season concept (status quo) | None | Users mentally track seasons |
| Season as a label on CropAssignment | Low | Filtering and grouping by season |
| Season as a first-class entity with start/end dates | Medium | Season-level reporting, comparison |
| Season as a Farm-level setting (define your seasons) | High | Customizable, but over-engineered |

#### Recommendation for Concept C
- Seasons are **not needed for #297** and do not require design changes now.
- If seasons are desired later, they work as a label on CropAssignment (Concept B).
- The Gantt view's date range is already a de facto season view. Adding visual season bands is a cosmetic enhancement that can be layered on without structural changes.

---

## Part 3: Consolidated Recommendations

### MUST-FIX Before Implementation

1. **Clarify `completed_at` semantics** (F1): Add a one-paragraph definition to the ADR stating that `completed_at` means "this bed's current crop cycle is marked as finished." It does NOT mean the bed is permanently retired. A bed with `completed_at` set can have it cleared (reactivated) for a new crop cycle. This is intentionally a Bed-level field for the 1:1 model; it will migrate to CropAssignment when 1:N lands in Beta-10.

2. **Acknowledge Beta-10 migration in the ADR** (F2): Add a "Future Migration" subsection under Consequences: "When #279 (1:N bed:crop) is implemented, `completed_at` will move from Bed to a new CropAssignment entity. This is a single-field migration affecting existing bed items in DynamoDB. The migration script will copy `completed_at` to the first CropAssignment for each bed."

### SHOULD-FIX Before Implementation

3. **Remove `computeRangePosition` alias** (F4): Use `computeBarPosition` directly. It already accepts generic date ranges.

4. **Resolve mobile "mark done" UX** (F6): Recommend the icon button approach for both mobile and desktop (consistent, accessible, no long-press discovery problem). Remove the long-press and right-click mentions.

5. **Resolve category filter contradiction** (F7): Decide whether `other` category shows as dots. Recommend including all categories (simpler, no special cases).

6. **Add `completed_at` to `FarmBed` and `FarmBedItem` types** (F3): Explicitly list this in the modified files table.

7. **Add abort controller for Gantt data fetch** (F5): Document that the paginated diary fetch should use `AbortController` to cancel in-flight requests when the user switches away from Gantt view.

### Proceed As-Is (No Change Needed)

- The overall architecture (new GanttChart component, keep CropTimeline) is sound.
- The task breakdown is well-structured and correctly sized.
- The mockup quality is high and covers key scenarios.
- No Crops page changes are needed for Beta-9.
- No season concept is needed for #297.
- `completed_at` on Bed is acceptable for Beta-9 with the understanding that it migrates to CropAssignment in Beta-10.

### Verdict

**Conditional approval.** Address the two MUST-FIX items (semantics clarification and migration acknowledgment in the ADR) before starting implementation. The SHOULD-FIX items can be addressed during implementation. The forward-looking analysis confirms that the current design does not paint the project into a corner -- the known rework for Beta-10 is minimal and well-understood.

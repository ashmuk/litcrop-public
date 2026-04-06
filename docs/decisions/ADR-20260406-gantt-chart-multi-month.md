# ADR-20260406: Multi-Month Gantt Chart with Diary Event Dots

## Status
Proposed

## Context

Issue #297 requires enhancing the Gantt chart from a single-month embedded component (`CropTimeline.tsx`, 175 lines) to a multi-month interactive view with diary event dots and active/obsolete bed panes.

The existing `CropTimeline` is rendered inline below the calendar in the diary's calendar view. It receives a single `year`/`month` and computes bar positions within that month. The requirements call for:

1. Multi-month view (6 months mobile, 12 months desktop) with horizontal scroll
2. Diary event dots overlaid on timeline bars
3. Cross-reference: clicking a dot navigates to the corresponding calendar day
4. Active/obsolete bed panes with "Mark done" action
5. Responsive design for mobile and desktop

### Forces at Play
- `CropTimeline` is embedded in calendar view and useful there as a single-month summary
- No "done" concept exists on beds today; completion is inferred from harvesting diary entries
- Diary API supports `from`/`to` date range (max 400 days) with cursor pagination (limit 50)
- Budget constraint: monthly AWS cost must remain under $5
- App is Preact (not React); no external UI library for charts

### Constraints
- No new npm dependencies without discussion (RULES.md)
- Smallest diff that achieves the goal
- DynamoDB single-table design; bed entity lives under `FARM#` partition

## Options Considered

### Option 1: Rewrite CropTimeline in-place
- **Description**: Extend the existing `CropTimeline.tsx` to support both single-month (calendar embed) and multi-month (standalone) modes via a `mode` prop.
- **Pros**: Single component, no code duplication, familiar code
- **Cons**: Component grows from 175 to ~400+ lines; mixing two distinct UX modes creates prop sprawl and conditional complexity; testing becomes harder; single-month mode doesn't need scroll containers or event dots
- **Effort**: Medium

### Option 2: New GanttChart component, keep CropTimeline
- **Description**: Create a new `GanttChart.tsx` for the multi-month view as a third diary view mode (`'list' | 'calendar' | 'gantt'`). Keep `CropTimeline` unchanged for the calendar embed.
- **Pros**: Clean separation of concerns; CropTimeline stays simple; GanttChart is purpose-built for multi-month + dots + panes; each component is independently testable; reversible (can remove GanttChart without touching calendar)
- **Cons**: Minor code duplication in bar position math (mitigated by extracting shared `computeBarPosition` already in `diary-utils.ts`)
- **Effort**: Medium

### Option 3: Third-party Gantt library
- **Description**: Use a library like `frappe-gantt` or `gantt-task-react` for the multi-month view.
- **Pros**: Rich features out of the box (drag, zoom, dependencies)
- **Cons**: New dependency (violates RULES.md discussion requirement); React-focused libraries need Preact compat wrappers; bundle size impact; styling integration with existing design system; overkill for the use case (no drag-and-drop or dependency arrows needed)
- **Effort**: Low implementation, high integration

## Decision

**Option 2: New GanttChart component, keep CropTimeline.**

Add `'gantt'` as a third view mode in DiaryPage alongside list and calendar. The GanttChart component handles multi-month rendering, event dots, active/obsolete panes, and scroll. CropTimeline remains the compact single-month summary for the calendar view.

### Semantic Definition: `completed_at`

`completed_at` on a Bed means **"the current crop cycle is finished"** — not "the bed is retired." The bed remains available for replanting. When a new crop is planted (new `planted_at` set), `completed_at` should be cleared to reactivate the bed.

- **Gantt**: Beds with `completed_at` set move to the grayed-out "Done" pane
- **Crops page**: No changes in Beta-9 — `completed_at` is Gantt-only for now
- **Reactivation**: Setting new `planted_at` or clearing `completed_at` via PATCH moves the bed back to active

## Rationale

- **Separation of concerns**: Two distinct UX patterns (single-month inline summary vs. multi-month scrollable interactive chart) should not share a component. The prop surface and rendering logic diverge significantly.
- **Reversibility**: GanttChart can be removed or replaced without affecting the working calendar view.
- **Shared utilities**: The existing `computeBarPosition` in `diary-utils.ts` already provides the core math. The new component reuses it with a different time range (multi-month instead of single-month).
- **No new dependencies**: Pure Preact component using positioned divs (same technique as CropTimeline), extended with scroll containers and dot overlays.
- **Testability**: `diary-utils.ts` gains new pure functions (`computeMultiMonthPosition`, `buildEventDotMap`) that are independently unit-testable.

## Consequences

### Positive
- Calendar view remains untouched and stable
- GanttChart can evolve independently (future: drag to reschedule, zoom levels)
- Shared utility functions grow the tested diary-utils module
- Bed `completed_at` field enables future features (archiving, reporting)

### Negative
- Three view modes in DiaryPage increases the header toggle complexity (3 buttons instead of 2)
- Diary API must be called with wider date ranges for the Gantt view (up to 400 days), which returns more data per request
- Bed domain model gains a new optional field (`completed_at`), requiring schema and API changes

### Beta-10 Migration Path (#279: 1:N bed:crop)
When 1:N bed-to-crop (#279) is introduced, `completed_at` migrates from the `Bed` entity to a new `CropAssignment` entity. Migration steps:
1. Create `CropAssignment` entity with `bed_id`, `crop_type`, `planted_at`, `expected_harvest`, `completed_at`
2. Migrate existing Bed crop fields → first CropAssignment per bed
3. Update GanttChart to render one row per CropAssignment (or stacked bars per bed)
4. Remove `completed_at`, `crop_type`, `planted_at`, `expected_harvest` from Bed

This is estimated at ~30 minutes of migration work. Designing CropAssignment now would triple #297's scope for a feature 2+ sprints away.

## Implementation Notes

See the architecture section (ARCHITECTURE.md S14) for detailed component design, data model changes, positioning algorithm, and API modifications.

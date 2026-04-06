# ADR-20260406: 1:N Bed-to-Crop Assignment — Impact Analysis & Build/Defer/Drop

## Status
Proposed

## Context

Issue #279 proposes changing the data model from 1:1 (one crop per bed at a time) to 1:N (multiple crop assignments per bed, with history). Currently, crop lifecycle fields live directly on the `Bed` entity:

```
Bed { crop_type, crop_variety, planted_at, expected_harvest, completed_at }
```

The proposed model introduces a separate `CropAssignment` entity:

```
CropAssignment { id, bed_id, crop_type, planted_at, expected_harvest, completed_at, status }
```

This ADR documents the full impact analysis to support a BUILD / DEFER / DROP decision.

---

## 1. File Impact Analysis

### Summary

| Layer | Files Affected | Test Files Affected |
|-------|---------------|-------------------|
| Shared types/schemas | 3 | 1 |
| API routes | 4 | 5 |
| API services | 1 | 1 |
| Frontend components | 8 | 0 |
| Frontend utilities | 2 | 0 |
| i18n | 2 | 0 |
| **Total source files** | **20** | **7** |
| **Total all files** | **27** | |

### Detailed File List

#### Shared Package (3 source + 1 test)
| File | What Changes | Severity |
|------|-------------|----------|
| `packages/shared/src/types/domain.ts` | Remove crop fields from `Bed`, add `CropAssignment` interface | BREAKING |
| `packages/shared/src/types/api.ts` | `FarmBed`, `FarmBedItem`, `BedDetailResponse` lose crop fields; new `CropAssignment` response type | BREAKING |
| `packages/shared/src/types/requests.ts` | `UpdateBedRequest` loses crop fields; new `CreateCropAssignmentRequest` | BREAKING |
| `packages/shared/src/schemas/index.ts` | `FarmBedSchema`, `FarmBedItemSchema`, `BedDetailResponseSchema`, `UpdateBedRequestSchema` all change; new `CropAssignmentSchema` | BREAKING |
| `packages/shared/src/__tests__/schemas.test.ts` | 18 occurrences across bed schema tests | HIGH |

#### API Routes (4 source + 5 tests)
| File | What Changes | Severity |
|------|-------------|----------|
| `src/api/src/routes/beds.ts` | GET/PATCH response shapes lose crop fields; new CRUD routes for `/beds/:bedId/crops` | BREAKING |
| `src/api/src/routes/farms.ts` | Farm response bed serialization changes | BREAKING |
| `src/api/src/routes/diary.ts` | `syncBedDatesFromDiary()` must target `CropAssignment` instead of `Bed`; needs to find "active" assignment | MEDIUM |
| `src/api/src/routes/weather.ts` | `croppedBeds` filter + `getCropTolerance()` must read from assignments | MEDIUM |
| `src/api/src/routes/chat.ts` | AI context prompt reads `bed.crop_type` and `bed.planted_at` | MEDIUM |
| `src/api/src/__tests__/routes/beds.test.ts` | 32 occurrences | HIGH |
| `src/api/src/__tests__/routes/diary.test.ts` | 23 occurrences | HIGH |
| `src/api/src/__tests__/routes/farms.test.ts` | 5 occurrences | MEDIUM |
| `src/api/src/__tests__/routes/weather.test.ts` | 9 occurrences | MEDIUM |
| `src/api/src/__tests__/contracts.test.ts` | 6 occurrences | MEDIUM |

#### API Services (1 source + 1 test)
| File | What Changes | Severity |
|------|-------------|----------|
| `src/api/src/services/dynamodb.ts` | `itemToBed()` loses crop fields; new CRUD methods for `CropAssignment` entity; new PK/SK pattern | HIGH |
| `src/api/src/__tests__/services/dynamodb.test.ts` | 1 occurrence (fixture data) | LOW |

#### Frontend Components (8 files)
| File | What Changes | Severity |
|------|-------------|----------|
| `src/frontend/src/components/BedDetail.tsx` | Crop form becomes "new planting" flow; reads from assignments not bed | HIGH |
| `src/frontend/src/components/GanttChart.tsx` | `GanttBed` interface loses crop fields; multiple bars per bed or one row per assignment | HIGH |
| `src/frontend/src/components/CropTimeline.tsx` | `BedTimelineItem` interface loses crop fields; bar rendering changes | HIGH |
| `src/frontend/src/components/DiaryPage.tsx` | `handleMarkDone`/`handleUndoDone` target assignment, not bed | MEDIUM |
| `src/frontend/src/components/DiaryEntryForm.tsx` | Harvest estimate reads crop_type from assignment | LOW |
| `src/frontend/src/components/FarmOverview.tsx` | Grid cell crop display reads from active assignment | MEDIUM |
| `src/frontend/src/components/FarmLayoutView.tsx` | Grid cell crop display reads from active assignment | MEDIUM |
| `src/frontend/src/components/WeatherView.tsx` | Crop impact cards reference crop_type from response | LOW |

#### Frontend Utilities (2 files)
| File | What Changes | Severity |
|------|-------------|----------|
| `src/frontend/src/lib/diary-utils.ts` | `buildActualDatesMap` operates on bed_id; may need assignment_id key | MEDIUM |
| `src/frontend/src/lib/crops.ts` | `getCropEmoji`/`getCropName` signatures unchanged (take string) | NONE |

#### i18n (2 files)
| File | What Changes | Severity |
|------|-------------|----------|
| `src/frontend/src/i18n/en.json` | New keys for assignment UI | LOW |
| `src/frontend/src/i18n/ja.json` | Same | LOW |

### Test Impact

**99 total occurrences** of crop fields across 11 test files. The most affected:
- `beds.test.ts`: 32 occurrences (fixture data + assertions)
- `diary.test.ts`: 23 occurrences (bridge sync tests)
- `schemas.test.ts`: 18 occurrences (contract shape tests)
- `weather.test.ts`: 9 occurrences (crop impact tests)

---

## 2. DynamoDB Impact

### Current PK/SK Pattern
```
Bed:
  PK = FARM#{farmId}
  SK = BED#{row}#{col}#{bedId}
  GSI1PK = BED#{bedId}
  GSI1SK = META
  Fields: crop_type, crop_variety, planted_at, expected_harvest, completed_at, ...
```

### Proposed PK/SK Pattern for CropAssignment
```
CropAssignment:
  PK = FARM#{farmId}
  SK = CROP#{bedId}#{assignmentId}
  GSI1PK = BED#{bedId}
  GSI1SK = CROP#{assignmentId}
  Fields: crop_type, crop_variety, planted_at, expected_harvest, completed_at, status
```

### GSI Needs
- **GSI1** (existing): query all assignments for a bed via `GSI1PK = BED#{bedId}, begins_with(GSI1SK, 'CROP#')`
- No new GSI required -- the existing GSI1 is sufficient with SK prefix differentiation

### Migration Script
- Read all beds with non-null `crop_type`
- For each, create a `CropAssignment` item with current crop data
- Remove crop fields from bed items
- **Risk**: Must be idempotent; beds with `completed_at` become historical assignments with `status: 'completed'`

---

## 3. API Breaking Changes

### Breaking (response shape changes)

| Endpoint | Change | Backward-Compatible? |
|----------|--------|---------------------|
| `GET /farms/:farmId` | `beds[].crop_type`, `planted_at`, `expected_harvest`, `completed_at` removed | NO |
| `GET /farms/:farmId/beds` | Same fields removed from each bed item | NO |
| `GET /beds/:bedId` | Same fields removed; new `assignments` array or separate endpoint | NO |
| `PATCH /beds/:bedId` | `crop_type`, `planted_at`, `expected_harvest`, `completed_at` no longer accepted | NO |

### New Endpoints Required
| Endpoint | Purpose |
|----------|---------|
| `POST /beds/:bedId/crops` | Create new crop assignment |
| `GET /beds/:bedId/crops` | List assignments (active + historical) |
| `PATCH /crops/:assignmentId` | Update assignment |
| `DELETE /crops/:assignmentId` | Remove assignment |

### Backward Compatibility Option
A compatibility shim could inline the "active" assignment's fields into the `FarmBed` response, so existing clients see the same shape. This adds complexity but avoids a hard break.

---

## 4. Diary-to-Bed Bridge Complexity

The `syncBedDatesFromDiary()` function currently:
1. Reads `bed.crop_type` to call `estimateHarvestDate()`
2. Writes `planted_at` / `expected_harvest` directly to the bed

With 1:N, it must:
1. Find the "active" assignment for the bed (query GSI1, filter by status)
2. If planting: create a new assignment (or update existing active one)
3. If harvesting: update the active assignment's `expected_harvest`
4. Handle edge cases: what if no active assignment exists? What if multiple?

**Complexity: MEDIUM-HIGH.** The bridge logic doubles in size and gains new failure modes.

---

## 5. Gantt Chart Impact

### Current: One row per bed, one bar per bed
- Reserved bar: `bed.planted_at` to `bed.expected_harvest`
- Actual bar: from diary entries

### With 1:N, two design options:

**Option A: One row per bed, multiple bars stacked**
- Each assignment renders its own reserved bar
- Visual clutter risk with overlapping bars
- Simpler conceptual model (beds are the anchor)

**Option B: One row per assignment**
- Each assignment is its own row, labeled "A1 - Tomato (2026)", "A1 - Lettuce (2025)"
- Cleaner visualization but row count explodes
- Breaks the current bed-centric mental model

**Recommendation**: Option A for active assignments, Option B for historical view (collapsible).

---

## 6. Frontend Form Impact

### Current Flow
`BedDetail.tsx` has an inline crop form:
- Select crop_type (from crop library)
- Set planted_at, expected_harvest
- PATCH `/beds/:bedId`

### With 1:N
- "New Planting" button opens a form that POSTs to `/beds/:bedId/crops`
- Existing active assignment shown as read-only or editable inline
- "Complete Cycle" marks the active assignment done
- History table/accordion showing past assignments
- **Significant UX redesign** of BedDetail page

---

## 7. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| API breaking change breaks frontend | Certain | High | Coordinated release; compatibility shim |
| Migration corrupts existing crop data | Low | High | Idempotent script; dry-run mode; backup |
| Diary bridge regressions | Medium | High | Existing 23 diary tests provide safety net |
| Gantt chart visual regression | Medium | Medium | Screenshot comparison before/after |
| Scope creep into crop rotation features | High | Medium | Strict scope: 1:N storage only, no rotation logic |
| `completed_at` not in `itemToBed()` | Low | Medium | Already broken -- `completed_at` is stored but not deserialized in `itemToBed()`. Must fix regardless. |

---

## Options Considered

### Option 1: BUILD Now (Beta-10)
- **Description**: Implement full 1:N in the next sprint
- **Pros**: Enables crop history, rotation tracking, multi-season data
- **Cons**: 27 files changed, 99 test occurrences updated, API breaking change, 2-3 sprint effort
- **Effort**: XL (cross-cutting, touches every layer)

### Option 2: DEFER with Prep (recommended)
- **Description**: Keep 1:1 for Beta-9/10; introduce naming conventions and abstractions now that minimize future rework
- **Pros**: Zero risk now; focused sprints on ROI/Gantt; reduces future 1:N effort by ~30%
- **Cons**: Delays 1:N value delivery; must track prep items
- **Effort**: S (prep only)

### Option 3: DROP
- **Description**: Cancel #279; keep 1:1 forever. Users "clear and replant" to cycle crops.
- **Pros**: No work; simpler model permanently
- **Cons**: Loses crop history; no rotation tracking; users lose data on replant
- **Effort**: None

---

## Decision
**DEFER with Prep.**

## Rationale

1. **Effort vs. value timing**: 1:N is an XL change (27 files, 99 test occurrences, API breaking change). The current roadmap has Beta-9 ROI and Beta-10 1:N already sequenced. There is no user demand pulling 1:N forward.

2. **Risk concentration**: Changing the core data model during active Gantt/diary stabilization (Beta-8 just shipped, PR #300 open) introduces compounding risk. The diary bridge alone has 23 test touchpoints.

3. **The 1:1 model is sufficient for MVP**: A single crop cycle per bed covers the primary use case. Users can clear and replant. Crop history is a "nice to have" for production scope.

4. **Prep work reduces future cost**: Small, targeted changes now (see Implementation Notes) can cut the eventual 1:N migration effort by approximately 30%.

5. **Bug found**: `itemToBed()` in `dynamodb.ts` (line 105-119) does not deserialize `completed_at` from DynamoDB, despite the field being stored via `updateBed()`. This must be fixed regardless of 1:N timing (separate bug fix).

### Advancement Criteria (DEFER -> BUILD)
- Beta-9 ROI feature is shipped and stable
- At least one real user has completed a full crop cycle (plant -> harvest -> replant)
- User feedback explicitly requests crop history or rotation tracking

---

## Consequences

### Positive
- Zero risk to current sprint delivery
- Gantt chart (#297) and ROI features proceed without data model disruption
- Prep work creates cleaner separation for future migration

### Negative
- Users who replant lose the previous crop's dates (mitigated by diary entries preserving history)
- 1:N value delivery delayed to Beta-10 or later

---

## Implementation Notes — Minimum Prep (to avoid rework)

### P1: Fix `itemToBed()` bug (do now, separate PR)
```typescript
// dynamodb.ts line 105-119: add completed_at
function itemToBed(item: Record<string, unknown>, farmId: string, bedId: string): Bed {
  return {
    ...existing fields,
    completed_at: item['completed_at'] as string | undefined,  // MISSING
  };
}
```
This is a standalone bug fix, not 1:N prep.

### P2: Naming conventions (do now, zero-cost)
When adding new fields to beds or diary entries, use names that will map cleanly to `CropAssignment`:
- Prefer `crop_` prefix for crop-lifecycle fields
- Avoid adding new crop fields directly to `Bed`; route through diary entries instead

### P3: Abstract crop access in frontend (do when convenient)
Create a helper function that resolves "active crop" for a bed:
```typescript
function getActiveCrop(bed: FarmBed): { crop_type: string | null; planted_at: string | null; ... }
```
Today this just reads bed fields. With 1:N, it reads the active assignment. ~8 frontend files call bed crop fields directly; centralizing reduces the future diff.

### P4: Compatibility shim design (document now, build later)
When 1:N ships, the `FarmBed` response should include an `active_crop` field with the same shape as current crop fields, plus a `crops` array with full history. This preserves backward compatibility for any external consumers.

```typescript
// Future FarmBed response shape
interface FarmBed {
  id: string;
  row: number; col: number; name: string;
  latest_status: BedStatus;
  // Backward-compat inline fields (from active assignment)
  crop_type: string | null;
  planted_at: string | null;
  expected_harvest: string | null;
  completed_at: string | null;
  // New: full assignment list
  crops?: CropAssignment[];
}
```

---

## Effort Estimate Summary

| Scope | Effort | Files | Tests |
|-------|--------|-------|-------|
| Full 1:N BUILD | XL | 27 | 99 occurrences across 11 files |
| DEFER prep (P1-P3) | S | 3-4 | 2-3 test updates |
| DROP | None | 0 | 0 |

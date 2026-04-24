# DESIGN-279: Bed-to-Crop 1:N — Architecture and Phased Plan

**Status**: Draft (Stream 2 kickoff, 2026-04-23)
**Issue**: [#279](https://github.com/ashmuk/litcrop/issues/279)
**Baseline ADR**: [`ADR-20260406-1n-bed-crop-impact-analysis.md`](../decisions/ADR-20260406-1n-bed-crop-impact-analysis.md)
**Scope memory**: `project_bed_crop_1n_scope.md` (locked 2026-04-20)

> This document is the implementation blueprint for Issue #279. The baseline
> ADR captured the deferral decision; this design captures the **build plan**
> now that the advancement criteria are met. Read the ADR for the trade-off
> analysis; read this for what to build and in what order.

---

## 1. Terminology lock-in

Two names have appeared in prior artefacts:

| Name | Source | Decision |
|------|--------|----------|
| `CropAssignment` | ADR-20260406 §Context | Discarded |
| `BedCrop` | scope memory 2026-04-20, user-facing discussions | **Canonical** |

**Rationale**: `BedCrop` reads as an association/junction entity (bed × crop) rather than an "assignment" event. The scope memory already uses it; aligning the ADR terminology to memory prevents drift. All code, tests, DDB keys, and user-facing copy use `BedCrop`.

---

## 2. Current state (as of v0.99.7.5)

See `docs/decisions/ADR-20260406-1n-bed-crop-impact-analysis.md §1` for the full original inventory. Re-counted post-v0.99.7.5:

- **~208 crop-field occurrences** across ~27 source files + 7 test files (down slightly from the ADR's 228 estimate — the codebase has not grown the crop-field footprint since).
- **Bed domain type** at `packages/shared/src/types/domain.ts:72-85` carries 5 crop fields inline (`crop_type`, `crop_variety`, `planted_at`, `expected_harvest`, `completed_at`, plus `notes`, `latest_status`).
- **DiaryEntry** at `packages/shared/src/types/domain.ts:272-291` has `bed_id: string | null` FK but **no** `bed_crop_id` today.
- **DDB key scheme**: Bed = `PK=FARM#<farmId>, SK=BED#<rr>#<cc>#<bedId>`, GSI1 `PK=BED#<bedId>, SK=#META`. Single GSI.
- **`itemToBed` `completed_at` bug (ADR P1)**: ✅ **already fixed** at `src/api/src/services/repositories/_mappers.ts:40`. No prep needed.
- **`getActiveCrop(bed)` helper (ADR P3)**: ❌ never landed. ~6 inline truthy checks on `bed.crop_type` scattered across weather.ts, chat.ts, diary.ts. Stream 2 prep will add this helper.

## 3. Target data model

### 3.1 `BedCrop` entity

```typescript
// packages/shared/src/types/domain.ts (new export)
export type BedCropStatus = 'planned' | 'active' | 'harvested' | 'failed';

export interface BedCrop {
  id: string;                    // uuid
  bed_id: string;                // FK → Bed.id
  farm_id: string;               // FK → Farm.id (denormalized for auth + query)
  crop_type: string;             // canonical id from CROP_LIBRARY
  crop_variety?: string;
  planted_at?: string;           // ISO 8601 date
  expected_harvest?: string;     // ISO 8601 date
  completed_at?: string;         // ISO 8601 date — when status became harvested/failed
  status: BedCropStatus;
  notes?: string;                // crop-cycle-specific notes (separate from Bed.notes)
  created_by: string;
  created_at: string;
  updated_at: string;
}
```

**Design notes**:
- `farm_id` is denormalized from the bed to avoid a join on every read — matches the pattern already used for `DiaryEntry.farm_id` (`domain.ts:274`).
- `status` is the single source of truth for "is this crop cycle live?". Intercropping and succession both use this type — see scope memory D1.
- `notes` is separate from `Bed.notes` so bed-level notes (e.g., "south bed, partial shade") stay on the bed and cycle-specific notes (e.g., "Brandywine seedlings from Burpee") travel with the crop cycle.

### 3.2 `Bed` — crop fields removed

```typescript
// After Wave B — packages/shared/src/types/domain.ts
export interface Bed {
  id: string;
  farm_id: string;
  row: number;
  col: number;
  name: string;
  notes?: string;                // bed-level notes only
  latest_status: BedStatus;
  // Removed: crop_type, crop_variety, planted_at, expected_harvest, completed_at
}
```

### 3.3 `DiaryEntry` — per-crop attribution

```typescript
// Wave D — packages/shared/src/types/domain.ts
export interface DiaryEntry {
  // ... existing fields unchanged
  bed_id: string | null;
  bed_crop_id: string | null;    // NEW — nullable FK to BedCrop.id
  // ...
}
```

Legacy entries (pre-Wave D) stay with `bed_crop_id: null`. Per `project_462_phase2_skipped.md` precedent, **no backfill migration** — leave-null policy.

### 3.4 DynamoDB keys

Mirrors the ADR's §2 proposal with the `CropAssignment` → `BedCrop` rename:

```
BedCrop:
  PK     = FARM#<farmId>
  SK     = CROP#<bedId>#<bedCropId>
  GSI1PK = BED#<bedId>
  GSI1SK = CROP#<bedCropId>
  Stored: id, bed_id, farm_id, crop_type, crop_variety, planted_at,
          expected_harvest, completed_at, status, notes, created_by,
          created_at, updated_at
```

**Rationale**:
- Primary key `(FARM#<f>, CROP#<b>#<c>)` keeps crops co-located with the farm for per-farm list-all-crops scans if needed.
- GSI1 pattern `(BED#<b>, CROP#<c>)` is the primary access path: `query GSI1 where PK=BED#<b> and begins_with(SK, 'CROP#')` returns all crops for a bed in one round-trip.
- Constant `'CROP#'` added to `packages/shared/src/constants.ts` alongside existing `BED#`, `IMG#`, etc.
- **No new GSI required** — GSI1 is shared across entities via prefix differentiation, matching the existing pattern.
- **Mandatory GSI filter**: every BedCrop query against GSI1 MUST include `begins_with(GSI1SK, 'CROP#')`. The bed's own `#META` row shares `GSI1PK=BED#<bedId>` (disambiguation is by SK prefix only). A query that omits the prefix filter will return the `#META` row mixed with BedCrop rows. Enforce via a single shared helper `queryByBedCrops(bedId)` in `src/api/src/services/repositories/bed-crops.ts`; never expose a raw `queryByGSI1` call with `PK=BED#<b>` alone to Wave B callers.

### 3.5 5-crop cap (scope memory constraint 2)

Enforced in the API at `POST /beds/:bedId/crops`:
- Query GSI1: `PK=BED#<bedId>, begins_with(SK, 'CROP#')`.
- Filter returned items where `status ∈ {planned, active}`.
- Reject with HTTP 422 if the count is already ≥ 5.
- Implement as exported constant `MAX_ACTIVE_CROPS_PER_BED = 5` in `packages/shared/src/constants.ts` so a future tier flag is a one-line swap.

## 4. API surface

### 4.1 New endpoints (Wave B)

| Verb + Path | Purpose | Response |
|-------------|---------|----------|
| `POST /beds/:bedId/crops` | Create a new BedCrop. Enforces 5-cap. | `201 BedCrop` |
| `GET /beds/:bedId/crops?status=active\|planned\|harvested\|failed\|all` | List BedCrops for a bed, optionally filtered. Defaults to `all`. | `200 { items: BedCrop[] }` |
| `PATCH /beds/:bedId/crops/:bedCropId` | Update a BedCrop (dates, status, notes). | `200 BedCrop` |
| `DELETE /beds/:bedId/crops/:bedCropId` | Soft-delete by setting `status='failed'` + `completed_at`. Hard delete only if `status='planned'`. | `204` |

All four paths are nested under `/beds/:bedId` so that (a) ownership can be checked via the parent bed with a single `dynamoRepo.getBedById(bedId)` call, and (b) every BedCrop query routes through the repo's single `GSI1PK=BED#<b>` entrypoint — no need for a secondary GSI keyed on `bedCropId` alone.

Ownership is checked by looking up the parent bed → farm membership (mirrors the pattern at `src/api/src/middleware/ownership.ts`).

### 4.2 Modified endpoints (Wave B)

| Endpoint | Change | Breaking? |
|----------|--------|-----------|
| `GET /farms/:farmId` | Adds `beds[].active_crop: BedCrop \| null`. Existing inline fields (`crop_type`, `crop_variety`, `planted_at`, `expected_harvest`, `completed_at`) stay populated from the active crop **during the shim window (Wave B → D)** and are removed in Wave E. | **Backward-compatible during the shim window**; breaking at Wave E (coordinated with a frontend that has migrated to `bed.active_crop`). |
| `GET /beds/:bedId` | Same additive change: inline fields preserved during the shim window; `active_crop` + `crops: BedCrop[]` added. | **Backward-compatible during the shim window**; breaking at Wave E. |
| `PATCH /beds/:bedId` | `UpdateBedRequest` loses the 5 crop fields. Bed-level notes + `latest_status` stay. | **Breaking** for any caller that sent crop updates — but the only caller today is BedDetail.tsx which moves to the new endpoints in Wave C. |
| `POST /diary` | Accepts `bed_crop_id: string \| null` in Wave D. Legacy entries default to `null`. | Non-breaking (additive nullable field). |

### 4.3 Backward-compat shim

Per ADR §3, the `FarmBed` response adds an **`active_crop`** field while keeping the legacy inline fields populated throughout the shim window (Wave B → D). This avoids any frontend breakage during the phased rollout; a hard break only happens at Wave E, by which time all internal consumers have moved to `active_crop`:

```typescript
interface FarmBed {
  id: string;
  row: number; col: number; name: string;
  notes?: string;
  latest_status: BedStatus;

  // Wave B → D: legacy inline fields stay populated from the active crop for
  // backward compat. Removed in Wave E after all consumers migrate to active_crop.
  /** @deprecated Use `active_crop.crop_type`. Removed in Wave E. */
  crop_type?: string;
  /** @deprecated Use `active_crop.crop_variety`. Removed in Wave E. */
  crop_variety?: string;
  /** @deprecated Use `active_crop.planted_at`. Removed in Wave E. */
  planted_at?: string;
  /** @deprecated Use `active_crop.expected_harvest`. Removed in Wave E. */
  expected_harvest?: string;
  /** @deprecated Null while active; set when the active crop completes. Removed in Wave E. */
  completed_at?: string;

  // Wave B: canonical reference to the bed's active crop cycle.
  active_crop: {
    id: string;
    crop_type: string;
    crop_variety?: string;
    planted_at?: string;
    expected_harvest?: string;
  } | null;                       // null when no active/planned crop exists
}
```

Separate `crops: BedCrop[]` is served from `GET /beds/:bedId` only (not in the list response), to keep the hot-path farm payload small.

## 5. Frontend UX impact

| Component | Change | Wave |
|-----------|--------|------|
| `BedDetail.tsx` | Inline crop form → "Add new planting" button opens a modal posting to `POST /beds/:bedId/crops`. Active crop shown as an editable card; "Complete cycle" marks status=harvested. History accordion below shows past cycles. | C |
| `GanttChart.tsx` | `GanttBed` → `GanttBedWithCrops` carrying `crops: BedCrop[]`. Each active/planned crop renders as its own reserved bar on the same bed row (Option A from ADR §5). Completed crops become a separate dimmed "history" strip above/below. | C |
| `CropTimeline.tsx` | `BedTimelineItem` → per-crop rows. Each active crop is a row: `A1 — Tomato (2026-03-01 → 2026-06-15)`. | C |
| `DiaryPage.tsx` | `handleMarkDone`/`handleUndoDone` target the active BedCrop's `completed_at`, not the bed's. | C |
| `DiaryEntryForm.tsx` | When the user selects a bed + category=harvest, auto-default `bed_crop_id` to the bed's active crop. Allow override from a dropdown of the bed's active+planned crops. | D |
| `FarmOverview.tsx`, `FarmLayoutView.tsx` | Read `bed.active_crop.crop_type` (via compat shim); minimal visual change. | C |
| `WeatherView.tsx` | Crop-impact cards keep using `affected_beds[].crop_type` served from the API (shim-provided). | C |

## 6. Migration strategy

**Leave-null policy** — same as `project_462_phase2_skipped.md`'s decision for the `/me/activity` attribution fields. Reasons:

1. **No data to migrate that matters**. Beds with `crop_type` set and no `completed_at` will be interpreted as having one legacy "virtual" crop — Wave B's `getActiveCrop(bedId)` helper will materialize a `BedCrop` on first read (lazy migration).
2. **Zero script risk**. #462 validated that leave-null + lazy-materialize is simpler and safer than a backfill script for non-critical data.
3. **Rollback is free**. If Wave B ships and we need to revert, the old `bed.crop_type` fields are still in DDB (Wave B reads but does not remove them until **Wave E** tail cleanup).

### Lazy-materialize on first access

```typescript
// src/api/src/services/repositories/bed-crops.ts (Wave B)
async function getActiveCropForBed(bedId: string): Promise<BedCrop | null> {
  // 1. Query GSI1 for CROP# items on this bed.
  const crops = await queryByGSI1('BED#' + bedId, 'CROP#');
  const active = crops.find(c => c.status === 'active' || c.status === 'planned');
  if (active) return active;

  // 2. Fallback: read the bed itself; if it has legacy crop_type set, synthesize a virtual BedCrop.
  const bed = await getBedById(bedId);
  if (bed?.crop_type && !bed.completed_at) {
    return synthesizeVirtualBedCrop(bed);  // id derived from bed.id; in-memory only, not persisted
  }
  return null;
}
```

Wave E (post-Wave D stabilization) executes in a **fixed order** — do not reverse:

1. **Promote first**: run a persist-virtual-crops maintenance job that scans all beds with non-null inline `crop_type` and creates a real `BedCrop` item for each. The job MUST be idempotent — every persisted row carries a `created_from_legacy: true` marker so re-running is a no-op. Verify via dry-run mode before the live run.
2. **Verify coverage**: confirm the lazy-materialize fallback branch is never hit in production logs for ≥ 2 weeks (per the Wave D → E gate) — this is the "all live beds have real BedCrop items" check.
3. **Remove fallback branch** from `getActiveCropForBed` only after step 2 is clean.
4. **Remove inline crop fields** from the `Bed` DDB items (via a second maintenance job) and from the `Bed` domain type (breaking release — coordinated with a frontend that has already migrated).

Reversing steps 1 and 3 opens a window where live traffic sees `null` for beds whose crops haven't been promoted yet. Reversing steps 3 and 4 leaves the API reading stale inline fields after the fallback is gone. The order above is the only safe sequence.

## 7. Phased plan

| Wave | Scope | Exit criteria | Tag |
|------|-------|---------------|-----|
| **A (prep)** | `hasActiveCrop` type guard in shared; refactor ~6 API call sites; delete `b.crop_type!` non-null assertions. **Zero user-visible change.** | 1135+ tests green; type guard exported; assertions deleted. | v0.99.7.6 |
| **B** | BedCrop type + Zod schema + DDB repository + new API routes + compat shim on FarmBed response. No UI yet. | New endpoints round-trip; legacy reads still work via lazy-materialize; integration tests cover 5-cap + ownership. | v0.99.8.0 |
| **C** | BedDetail / GanttChart / CropTimeline / DiaryPage UI rewrite for multi-crop. | Real user plants + completes a cycle from UI; Gantt renders 2+ crops on one bed correctly. | v0.99.8.1 |
| **D** | `DiaryEntry.bed_crop_id` FK + harvest-category auto-default + per-crop ROI. | Harvest entry attributes to a specific crop; revenue per crop is queryable. | v0.99.8.2 |
| **E (cleanup)** | Promote all virtual crops to persisted items; remove inline crop fields from `Bed` DDB items + types. | `bed.crop_type` field removed from domain; lazy-materialize branch deleted. | v0.99.8.3 |

**Gate from Wave B → C**: real end-to-end smoke test of POST/GET/PATCH crops from a dev environment; no open regressions.
**Gate from Wave D → E**: at least 2 weeks of prod usage with no lazy-materialize path hit in logs (indicates all live beds have real BedCrop items).

## 8. Out of scope

- **Crop rotation recommendations** (next-crop suggestions based on history). Scope envelope says 1:N storage only; rotation logic is a separate issue.
- **Multi-crop image attribution** (per-crop image FK). Per scope memory C1: Image stays `bed_id` only; per-crop attribution is derived from `capture_at` vs BedCrop active range.
- **Per-crop notification routing**. Notifications continue to target beds, not crops.
- **Tiered 5-cap policy**. Ship as a constant; tier flag is a future one-liner.
- **Changing `Farm.stats`**. If farm-level crop counts matter later, add a derived aggregation; do not denormalize into `Farm`.

## 9. Risks and mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Gantt visual regression with 2+ crops | Medium | Medium | Screenshot compare + Playwright test in Wave C. |
| Diary bridge (`syncBedDatesFromDiary`) double-writes | Medium | High | Wave B: bridge reads active BedCrop, writes only if found; null-path preserved. 23 existing diary tests catch regressions. |
| 5-cap enforcement race condition | Low | Low | Read-count-then-write is not transactional; cap may briefly allow 6 under concurrent posts. Acceptable — users rarely hit the ceiling anyway. Revisit in Wave E. |
| Virtual-crop id collision | Low | Low | Synthesize with deterministic prefix `bed-legacy-<bedId>` so it never clashes with uuid-generated real crops. |
| Cost field on BedCrop explodes per-bed payload | Low | Low | Keep costs on DiaryEntry only (no duplication on BedCrop). Per-crop cost aggregation is derived at query time. |

## 10. Test strategy

### Wave A (prep)
- Unit test for `hasActiveCrop` type guard: truthy with crop_type set, falsy with null/undefined/empty-string.
- No behavior change expected — existing weather/chat/diary tests stay green.

### Wave B
- Shared: `BedCropSchema` contract tests matching the pattern at `packages/shared/src/__tests__/schemas.test.ts`.
- API: new `bed-crops.test.ts` covering POST (happy path + 5-cap rejection + ownership), GET (status filter), PATCH (status transitions), DELETE (soft vs hard).
- Integration: migration-neutrality — existing beds with `crop_type` still serialize the same `active_crop` shape on `GET /farms`.

### Wave C
- Playwright: real user plants two crops on one bed; Gantt renders both; CropTimeline shows both rows.
- Component: `BedDetail` modal → POST → refreshes active crop; "Complete cycle" → PATCH status.

### Wave D
- API: `POST /diary` with `bed_crop_id` set; harvest auto-defaults to active crop.
- Frontend: DiaryEntryForm harvest flow preserves `bed_crop_id` on submit.

### Wave E
- Migration maintenance job: idempotent (run twice, no-op on second run). Dry-run mode.

## 11. Related

- Issue: https://github.com/ashmuk/litcrop/issues/279 — bed-to-crop 1:N
- ADR: `docs/decisions/ADR-20260406-1n-bed-crop-impact-analysis.md` — impact baseline + DEFER decision
- Memory: `project_bed_crop_1n_scope.md` — scope envelope + D1-D4 decisions
- #462 precedent: leave-null migration (see `project_462_phase2_skipped.md`)

---

**Authoring note**: This design implements the scope already locked in `project_bed_crop_1n_scope.md` (2026-04-20). Do NOT re-debate entity name, 5-cap, camera-per-bed, or version sequencing. Those are settled.

# ADR-20260420: 1:N Bed-to-Crop (#279) — BUILD in Waves

## Status
Accepted — **supersedes ADR-20260406** (`ADR-20260406-1n-bed-crop-impact-analysis.md`).

## Context

Issue #279 proposes replacing the 1:1 bed-crop data model with a 1:N `BedCrop` model supporting crop history, rotation, succession, and intercropping. ADR-20260406 did the impact analysis and decided **DEFER with Prep**, gated on three advancement criteria:

1. Beta-9 ROI feature shipped and stable
2. At least one real user completes a full crop cycle (plant → harvest → replant)
3. User feedback explicitly requests crop history or rotation tracking

As of 2026-04-20 **all three criteria are met**:
- Beta-9 ROI was delivered and is stable in production usage.
- The product owner, using litcrop for real-world farming, completed crop cycles in multiple beds.
- The product owner hit the multi-crop-per-bed need in field usage and explicitly escalated #279 to essential scope.

This ADR records the scope-in decision and the design constraints that were resolved in the same 2026-04-20 planning session.

---

## Constraints (from product owner, 2026-04-20)

These constraints are load-bearing — each one cuts a whole branch off the implementation cost that ADR-20260406 had to price in.

### C1 — Camera is per-bed, not per-crop
`Device.bed_id` already anchors devices to beds. No `Device.crop_id`. No per-crop capture routing. `Image.bed_id` remains the only FK on images — per-crop image attribution is DERIVED from capture-time vs `BedCrop` active range, not stored.

**Implication:** Zero device-layer migration. Image model unchanged. Eliminates ~3 files from the ADR-20260406 diff.

### C2 — Max 5 active+planned crops per bed (free tier)
`MAX_ACTIVE_CROPS_PER_BED = 5` enforced on `POST /beds/:bedId/crops`. Applies only to crops with status ∈ {`planned`, `active`}. History (`harvested`, `failed`) is unbounded. Implemented as a constant; a future paid tier can swap to `{ free: 5, paid: N }` with no schema change.

**Implication:** No pagination, no virtualization, GSI queries bounded at ≤5 items + META.

---

## Decisions

### D1 — Concurrent AND sequential multi-crop both in scope
Intercropping (overlapping dates in the same bed) and succession (sequential rotation) share the same `BedCrop` model. The "active at time T" set is derived via date-range overlap. No `BedCrop.mode`, no separate entity variants.

### D2 — 5-crop cap is active-only
Enforcement WHERE `status IN ('planned', 'active')`. History unbounded — no archival semantics needed.

### D3 — Per-crop ROI in scope
`DiaryEntry.bed_crop_id: string | null` added in Wave B. Legacy diary entries stay null. Harvest-category forms in Wave C default to the bed's active crop. One schema change, both data and UX surfaces benefit.

### D4 — Versioning: v0.99.7.x stays audit-scoped; #279 is v0.99.8.x
- **v0.99.7.x** Wave 2 = audit findings + UX polish only (R-007/008/010/012/013/014 and UX #461–464).
- **v0.99.7.x tail** may carry small #279 prep: P1 (fix `itemToBed` `completed_at` deserialization) + P3 (add `getActiveCrop(bed)` helper, refactor ~8 frontend call sites). Zero user-visible behavior change.
- **v0.99.8.0** introduces `BedCrop` data model + API + compat shim.
- **v0.99.8.x** lands the UI swap and removes the shim.
- **v1.0 GA** comes AFTER #279 is proven.

---

## Wave Plan

```
Version      Wave  Scope                                                 Breaking?
─────────────────────────────────────────────────────────────────────────────────
v0.99.7.x    —     Audit hardening + UX polish (not #279)                No
v0.99.7.x+   A     #279 prep: itemToBed bug fix (P1), getActiveCrop      No
             (tail)  helper + 8-site refactor (P3)
──────────── cut v0.99.8.0 ──────────────────────────────────────────────────────
v0.99.8.0    B     BedCrop entity (shared types, schemas, DynamoDB       API only
                   repo), migration script, /beds/:bedId/crops CRUD,
                   DiaryEntry.bed_crop_id FK, 5-crop cap enforcement,
                   double-write compat shim: PATCH /beds/:bedId crop
                   fields still accepted and mirrored to BedCrop.
                   FarmBed response carries BOTH flat crop fields AND
                   crops[] array.
v0.99.8.x    C     BedDetail crop list (≤5 inline, no pagination),       UI + API
                   Gantt Option A (stacked bars per bed row),
                   harvest-entry form defaults bed_crop_id to active
                   crop, legacy PATCH crop fields become read-only
                   (soft deprecation → 410 Gone), drop double-write.
v0.99.8.y    D     Per-crop ROI surfaced, crop history filter,           No
                   AI rotation recs (requires historical data)
──────────── cut v1.0 GA after #279 stable ─────────────────────────────────────
v1.0.0       —     GA milestone: all R-items resolved, #279 proven
```

### Wave acceptance criteria

**Wave A (prep, v0.99.7.x tail):**
- `itemToBed()` in `src/api/src/services/dynamodb.ts` correctly deserializes `completed_at`.
- `getActiveCrop(bed)` helper exists in `src/frontend/src/lib/crops.ts` (or similar) and is used by BedDetail, GanttChart, CropTimeline, FarmOverview, FarmLayoutView, DiaryEntryForm, DiaryPage, WeatherView.
- No user-visible behavior change. No new API endpoints. No schema change.

**Wave B (v0.99.8.0):**
- `BedCrop` interface + Zod schema in `packages/shared`.
- `DiaryEntry.bed_crop_id` field (nullable, optional on existing records).
- DynamoDB PK/SK per ADR-20260406 §2: `PK=FARM#{farmId}`, `SK=CROP#{bedId}#{assignmentId}`, `GSI1PK=BED#{bedId}`.
- Migration script: idempotent, dry-run mode, for every bed with non-null `crop_type` create one `BedCrop` record seeded with current crop fields; beds with `completed_at` set become `BedCrop{status: 'harvested'}`.
- CRUD endpoints: `POST/GET /beds/:bedId/crops`, `PATCH/DELETE /crops/:bedCropId`.
- 5-crop cap enforced at POST (`409` on ≥5 active+planned).
- Compat shim: `FarmBed` response includes BOTH legacy `crop_type`/`planted_at`/`expected_harvest`/`completed_at` AND new `crops: BedCrop[]`.
- PATCH `/beds/:bedId` with crop fields still works and mirrors the update into the active `BedCrop`.
- All existing tests pass unchanged (the shim is the contract that guarantees this).

**Wave C (v0.99.8.x):**
- BedDetail renders crop list inline (≤5); "Add crop" button; "Mark complete" per crop; history accordion.
- GanttChart: Option A — multiple stacked bars per bed row, color-coded by `BedCrop.id` or `crop_type`.
- DiaryEntryForm harvest category defaults `bed_crop_id` to the bed's active `BedCrop`.
- PATCH `/beds/:bedId` crop fields return `410 Gone` (soft deprecation with breaking-change note in release notes).
- Double-write removed from API layer.

**Wave D (v0.99.8.y):**
- ROI dashboard exposes per-crop cycle breakdown.
- BedDetail exposes crop history filter (by year, by status).
- AI chat prompt reads `BedCrop` history for rotation recommendations (depends on D1 completion).

---

## Revised Impact vs. ADR-20260406

| Dimension | ADR-20260406 (Apr) | This ADR (Apr 20) |
|---|---|---|
| Occurrences of crop fields | 99 in 11 files | **228 in 30 files** (code has grown) |
| Device-layer changes | Implicit possibility | Zero (C1) |
| Image-layer changes | Open question | Zero (C1) |
| Pagination / virtualization | Design needed | Not required (C2) |
| Tier-gated caps | Deferred discussion | Single-constant, tier-ready |
| API breaking change | Single coordinated break | **Split across Waves B→C** via double-write shim |
| Diary bridge | MEDIUM-HIGH, 23 test touchpoints | Unchanged — still MEDIUM-HIGH |
| Gantt redesign | MEDIUM, two options | Option A selected (stacked bars) |
| Overall effort | XL, 2–3 sprints | XL, spread across v0.99.8.x series |

The scope grew in raw line count but **shrank in risk** — the hairiest subsystem (image attribution during transition) is out of play, and the breaking-change blast radius is split across two waves instead of one.

---

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Migration corrupts existing crop data | Low | High | Idempotent script keyed on `(bed_id, planted_at)`; dry-run mode; DynamoDB backup pre-run |
| Diary bridge (`syncBedDatesFromDiary`) regression | Medium | High | Wave B keeps existing diary tests green via compat shim; Wave C updates diary logic with new tests added first (TDD) |
| Gantt visual regression | Medium | Medium | Screenshot-diff snapshot tests pre/post Wave C |
| 5-crop cap lacks UX affordance (users hit the wall silently) | Medium | Low | POST returns explicit `409` with remaining-slots count; UI disables "Add crop" at 5 with tooltip |
| Scope creep from per-crop ROI into crop rotation logic | High | Medium | Wave D explicitly excludes rotation recommendations beyond "last N crops in this bed"; rotation AI is post-v1.0 |
| Double-write drift between Waves B and C | Medium | Medium | Integration test asserting PATCH `/beds/:bedId` crop fields produce identical state in both the Bed item and the active BedCrop |

---

## Consequences

### Positive
- User's real-world need met; litcrop can track succession and intercropping from v0.99.8.0 onward.
- v0.99.7.x ships clean — audit hardening is not mixed with a breaking feature.
- Wave B lands without any UI change; frontend work is isolated to Wave C.
- Per-crop ROI (D3) arrives as a first-class capability, not a retrofit.
- Future paid-tier quota is a one-line swap (C2).

### Negative
- Two-wave API break (soft deprecation → removal) requires coordinated release notes.
- v1.0 GA is pushed further out — more wave landings before the GA cut.
- Double-write phase (between Wave B ship and Wave C ship) has a small dual-source-of-truth risk; the integration test above is mandatory.

---

## Supersedes
- `ADR-20260406-1n-bed-crop-impact-analysis.md` (DEFER decision is now historical; advancement criteria all met; impact numbers revised).

## Related
- Issue: https://github.com/ashmuk/litcrop/issues/279
- ADR-20260322 (Phase D bed grid data model — introduces current `Bed` entity)
- ADR-20260406 (gantt-chart-multi-month — sibling chart redesign)
- ADR-20260406 (roi-dashboard — #248 ROI baseline)

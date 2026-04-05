# Beta-8 Session Report

**Sprint:** Beta-8 — Crop Intelligence M1-M3 + UX
**Date:** 2026-04-05 → 2026-04-06
**Branch:** develop (15 commits, 79136a4 → e5dd4c3)
**Stats:** 64 files changed, +6,270 / -336 lines

---

## Executive Summary

Beta-8 delivered a complete **crop intelligence platform** — from data foundation to planning UX — in a single session. The sprint started with 605 tests and 0 crop metadata; it ended with 677 tests, a 100-crop shared library with growing data, automated harvest date calculation, dual-bar Gantt visualization, and a diary-based crop planning workflow.

The `/cc-define → /cc-design → /cc-implement → /simplify → /cc-test → /cc-review → /cc-remediate` pipeline was applied to every issue, catching **20+ bugs** before they could reach production — including data corruption paths, timezone errors, accessibility violations, and silent error masking.

---

## Issues Completed (9)

| # | Title | Size | Type |
|---|-------|------|------|
| **#277** | Make geo location optional with city dropdown | S+ | fix |
| **#273** | M1: Bridge diary planting/harvesting to bed crop dates | S | feat |
| **#274** | M2: Integrate shared crop library with growing metadata | L | feat |
| **#275** | M3: Smart defaults — auto-suggest harvest date | M | feat |
| **#276** | Reserved vs actual dual-bar Gantt chart | L | feat |
| **#287** | Diary reserved/actual radio toggle + tabs + Gantt markers | L | feat |
| **#285** | Enforce display name during account registration | S | fix |
| **#286** | Disable drag on read-only maps — zoom only | S | fix |
| **#282** | Admin user management — delete users | M | feat |

## Issues Created (4)

| # | Title | Scope |
|---|-------|-------|
| **#284** | Dynamic crop API integration (OpenFarm/USDA runtime) | Pre-Production |
| **#285** | Enforce display name during registration | Beta-8 (completed) |
| **#286** | Disable drag on read-only maps | Beta-8 (completed) |
| **#287** | Diary reserved/actual radio toggle | Beta-8 (completed) |

---

## Commits (15)

```
b219c1a  feat(farm): make geo location optional with city dropdown (#277)
4617581  feat(diary): bridge planting/harvesting entries to bed crop dates (#273)
a0de680  feat(crops): integrate shared crop library with growing metadata (#274)
04ad2b6  chore: add #285 and #286 to Beta-8 sprint scope
ecde1ef  feat(crops): smart defaults — auto-suggest harvest date (#275)
f6dc3fd  refactor(crops): extract estimateHarvestDate + fix stale date on delete
b447d0b  feat(diary): reserved vs actual dual-bar Gantt chart (#276)
025510b  chore: add #287 diary reserved/actual toggle to Beta-8 scope
ea03c75  feat(diary): add entry_type (reserved/actual) to diary data model (#287)
9b4522f  feat(diary): reserved/actual radio toggle, tabs, and Gantt markers (#287)
9bfa38e  fix(auth,frontend): enforce display name + disable map drag (#285, #286)
e49f1e0  feat(admin): user management controls — delete users (#282)
bcbf328  refactor(admin): simplify requireAdmin return + consolidate imports
8de50fc  fix(wizard): add guidance text for geo location benefits
e5dd4c3  chore: sync TASKS.md — close Beta-8 issues, update sprint board
```

---

## Test Coverage

| Metric | Before | After | Delta |
|--------|--------|-------|-------|
| Test files | 32 | 35 | +3 |
| Tests | 605 | 677 | +72 |
| Pass rate | 100% | 100% | — |

### New test files
- `packages/shared/src/__tests__/crop-library.test.ts` — crop library data + lookup tests
- `src/api/src/__tests__/routes/crop-library.test.ts` — API endpoint tests
- `src/frontend/src/__tests__/cities.test.ts` — city search + normalization tests

### New test coverage areas
- Optional geo: POST without coordinates, PATCH with coordinates, weather 400 guard, chat null-coordinates
- Diary bridge: planting/harvesting → bed date sync, non-blocking failure, delete clears both dates
- Smart defaults: exact harvest date calculation, unknown crop fallback, no crop_type fallback
- Reserved/actual: entry_type POST/PATCH, bridge suppression for reserved entries, default to actual
- Admin delete: happy path, 403, 400 self-delete, 401 unauth, 404 not found
- Crop library: 100 entries validation, metadata ranges, companion refs, API 200/404
- Cities: bilingual search, region matching, normalization, coverage verification
- Diary utils: buildActualDatesMap extraction, deduplication, same-day bar rendering

---

## Architecture Decisions

### ADR-20260405: Static-First Crop Library
- **Decision:** Curate crop growing metadata from USDA/OpenFarm at build time, not runtime
- **Rationale:** $0 cost, zero external dependencies, offline-capable, CC0 licensed data
- **Future:** Dynamic API fallback tracked as #284 (Pre-Production)

### Data Model Changes

| Entity | Field | Change |
|--------|-------|--------|
| Farm | `location_text` | **Added** — required, 1-200 chars |
| Farm | `latitude`, `longitude` | **Changed** — now optional |
| DiaryEntry | `entry_type` | **Added** — `'reserved' \| 'actual'`, default `'actual'` |
| CropEntry | `days_to_harvest_min/max` | **Added** — growing metadata |
| CropEntry | `season`, `companions` | **Added** — planting season + companion crops |

### New API Endpoints

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/v1/crop-library` | Public | Full crop library (cached 24h) |
| GET | `/api/v1/crop-library/:cropId` | Public | Single crop metadata |
| DELETE | `/api/v1/admin/users/:userId` | Admin | Admin-initiated account deletion |

---

## New Assets

### Static Data
- `packages/shared/src/data/crop-library.json` — 100 crops, 98 with growing metadata (~25KB)
- `src/frontend/src/data/cities.json` — 142 cities (114 JP + 28 world, ~20KB)

### Shared Modules
- `packages/shared/src/crop-library.ts` — CropEntry type, CROP_MAP, getCropMeta(), estimateHarvestDate()

### Components
- `src/frontend/src/components/LocationAutocomplete.tsx` — searchable city dropdown with map sync
- `src/frontend/src/lib/cities.ts` — city lookup, search, display helpers

### Design Artifacts
- `docs/beta-8/277-REQUIREMENTS.md` + `277-DESIGN.md`
- `docs/beta-8/273-REQUIREMENTS.md`
- `docs/beta-8/274-REQUIREMENTS.md`
- `docs/beta-8/276-REQUIREMENTS.md`
- `docs/beta-8/282-REQUIREMENTS.md`
- `docs/beta-8/287-DESIGN.md`
- `docs/decisions/ADR-20260405-static-first-crop-library.md`
- `docs/mockups/diary-reserved-actual.html` — 5-screen mockup (mobile + desktop)

---

## Bugs Caught by Pipeline (20+)

The `/simplify → /cc-review → /cc-remediate` pipeline caught these bugs before production:

| # | Issue | Bug | Severity |
|---|-------|-----|----------|
| 1 | #277 | Weather cache serves stale data after coordinates removed | Critical |
| 2 | #277 | `NaN` elevation passes API validation (`typeof NaN === 'number'`) | High |
| 3 | #277 | `chat.ts:249` crashes on `.toString()` of null coordinates | Critical |
| 4 | #277 | 5 missing files in requirements (SetupForm, api.ts, requests.ts, admin.ts, schemas.test) | High |
| 5 | #277 | `normalizeCityInput` dead-code first branch | Low |
| 6 | #275 | Stale `expected_harvest` left when planting entry deleted | High |
| 7 | #276 | UTC date causes off-by-one for UTC+9 users (Japan) | High |
| 8 | #276 | Same-day planting bar silently dropped (`barStart >= barEnd`) | Medium |
| 9 | #276 | Today marker z-index blocks overlay click | Medium |
| 10 | #276 | Week marker labels off-by-one (`d+1` instead of `d`) | Low |
| 11 | #287 | Reserved planting entries corrupt bed dates via M1 bridge | Critical |
| 12 | #287 | `entry_type` missing from `updateDiaryEntry` — PATCH silently drops it | Critical |
| 13 | #287 | `todayIso()` uses UTC — auto-selects wrong radio for JST users before 09:00 | High |
| 14 | #287 | `entry_type` missing from frontend `DiaryEntryResponse` type | High |
| 15 | #287 | Tab counts ignore active bed/category filters | Medium |
| 16 | #287 | `aria-pressed` wrong ARIA pattern for radio toggle | Medium |
| 17 | #287 | Dead `harvesting` branch in smart hint IIFE | Low |
| 18 | #285 | Profile sync guard `!p.created_at` always false — name never syncs | Critical |
| 19 | #286 | `doubleClickZoom: 'center'` not valid Leaflet option | Medium |
| 20 | #282 | `getUserProfile().catch(() => null)` masks DynamoDB failures as 404 | High |
| 21 | #282 | Delete button race condition — concurrent deletes possible | Medium |
| 22 | #275 | 3x duplicated harvest date calculation (extracted to shared) | Quality |

---

## Remaining Open Issues (15)

| Sprint | Issues | Status |
|--------|--------|--------|
| Beta-9: ROI Dashboard | #248, #245 | Queued |
| Beta-10: 1:N Bed-to-Crop | #279 | Queued |
| Beta-11: AI Strategy | #278, #183 | Deferred (ADR first) |
| Beta-12: Device Polish | #240, #242 | Queued/Deferred |
| Pre-Production | #256, #238, #239, #280, #281, #284, #287 | Queued |
| Backlog | #168 | Pending |

---

## Key Takeaways

1. **The M1-M2-M3 chain clicks together seamlessly.** A single planting diary entry now: sets `planted_at` (M1), looks up crop metadata (M2), auto-calculates `expected_harvest` (M3), and renders a complete Gantt bar — zero manual date entry required.

2. **The pipeline discipline paid for itself.** 22 bugs caught across 9 issues, including 5 critical data corruption/crash paths. The cost of running `/simplify` + `/cc-review` on every issue (~2 min each) is negligible compared to debugging these in production.

3. **User feedback drove the best UX decisions.** The city dropdown with map sync (#277), the reserved/actual radio toggle with smart date detection (#287), and the month-aligned split-pane view — all originated from conversation with the user during design reviews.

4. **Static-first was the right call.** The 100-crop library with growing metadata adds ~25KB to the bundle, costs $0/month, works offline, and has zero external dependencies. The dynamic API fallback is tracked for Pre-Production but may never be needed.

# Phase D Review Findings

> Reviewed: 2026-03-22
> Scope: Phase D (UX Restructure) — 4 batches, Farm->Bed flattening
> Reviewer: my-reviewer (cc-review)
> Test suite: 271 tests pass (17 test files)

## Summary

- MUST-FIX: 3
- SHOULD-FIX: 4
- SUGGESTION: 3
- Status: **needs-remediation** (3 MUST-FIX items block acceptance)

---

## Findings

### M1 MUST-FIX — GET /beds/:bedId response missing `url` and `tags` on `latest_image`

- **File**: `src/api/src/routes/beds.ts:91` via `src/api/src/routes/_helpers.ts:39-49`
- **Issue**: The `GET /beds/:bedId` route uses `makeLatestImage()` which returns only `{ id, thumbnail_url, captured_at, trigger }`. The TypeScript type `BedDetailResponse.latest_image` (at `packages/shared/src/types/api.ts:77-84`) declares `url: string` and `tags: Tag[]` as required fields. The Zod schema `BedDetailResponseSchema` (at `packages/shared/src/schemas/index.ts:124-130`) also omits these fields, creating a type/contract/implementation three-way mismatch.
- **Risk**: The frontend `BedDetail.tsx:192` renders `<img src={bed.latest_image.url}>` which resolves to `src="undefined"`, producing a broken hero image on every bed detail page. Additionally, `BedDetail.tsx:65` reads `bedData.latest_image.tags` to populate the active tag state -- the optional chaining prevents a crash, but the tag buttons will never show the pre-existing tag as active on page load.
- **Fix**: Either (a) expand `makeLatestImage()` to include a signed `url` and `tags` array (fetched via `getSignedImageUrl()` and `dynamoRepo.getTagsForImage()`), and update `BedDetailResponseSchema` to match; or (b) create a dedicated `makeBedDetailImage()` helper in `_helpers.ts` that returns the full shape, and keep `makeLatestImage()` as the lightweight thumbnail-only version for list endpoints.

---

### M2 MUST-FIX — PATCH /beds/:bedId cannot clear fields (null -> undefined -> silently dropped)

- **File**: `src/api/src/routes/beds.ts:118-124` and `src/api/src/services/dynamodb.ts:256-263`
- **Issue**: When a user sends `{ "crop_type": null }` to clear a crop assignment, the route at line 122 converts `null` to `undefined`. Then `updateBed()` at line 257 checks `if (value !== undefined)` and skips it. The DynamoDB `removeUndefinedValues: true` marshalling option would also discard it. Net result: the clear operation is silently dropped — the field retains its old value.
- **Risk**: Users cannot unassign a crop from a bed via the API. The design spec (PHASE-D-ARCHITECTURE.md line 275-279) explicitly states `null to clear` for all nullable fields in `UpdateBedRequest`. This is a functional regression from the API contract.
- **Fix**: In `updateBed()`, handle `null` values with a DynamoDB `REMOVE` expression instead of `SET`. Specifically: accumulate `REMOVE` clauses for keys whose value is `null`, and `SET` clauses for non-null values. Alternatively, pass `null` through to DynamoDB (set the attribute to `null` rather than removing it) — but `REMOVE` is cleaner since the schema expects `string | null` at the API level.

---

### M3 MUST-FIX — No route-level tests for beds endpoints

- **File**: (missing) `src/api/src/__tests__/routes/beds.test.ts`
- **Issue**: The execution plan (D-T09) specifies creation of `beds.test.ts` with tests for: GET bed (happy path), PATCH crop assignment (admin/manager), 403 for observer, 404 for unknown bed, GET images for bed, POST image to bed. This file does not exist. The test count is 271, down from the 303 baseline target stated in the execution plan.
- **Risk**: The beds routes are the core new API surface of Phase D. Without tests, the M1 and M2 bugs above would have been caught. The PATCH role check (admin/manager only) and cursor pagination for bed images are untested. Regressions in future phases will be undetected.
- **Fix**: Create `src/api/src/__tests__/routes/beds.test.ts` covering: (1) GET /beds/:bedId — happy path and 404, (2) PATCH /beds/:bedId — admin succeeds, observer gets 404, field clearing with null, (3) GET /beds/:bedId/images — pagination and empty result, (4) POST /beds/:bedId/images — happy path and validation errors.

---

### S1 SHOULD-FIX — BedStatus type diverges from task breakdown specification

- **File**: `packages/shared/src/types/domain.ts:10`
- **Issue**: The task breakdown D-01 specifies `BedStatus = 'healthy' | 'issue' | 'critical' | 'no_data'` (4 values, with `'critical'` replacing `'animal_intrusion'`). The implementation keeps the original 5 values: `'healthy' | 'slow_growth' | 'issue' | 'animal_intrusion' | 'no_data'`. This means the designed simplification from 5 to 4 status values was not applied.
- **Risk**: Low immediate risk since the existing status values still work. However, this is scope drift from the design spec. The frontend, seed data, and Zod schemas all reference the original 5 values consistently, so the drift is at least internally consistent. The question is whether the design intent (simplification to 4 values) should be honored.
- **Fix**: Confirm with the design owner whether the 5-value set is acceptable for MVP+, or if the reduction to 4 values should be applied. If keeping 5 values, update the task breakdown to reflect the decision. If reducing to 4, do a coordinated rename of `animal_intrusion` to `critical` and `slow_growth` removal across types, schemas, constants, i18n, and frontend status maps.

---

### S2 SHOULD-FIX — `createBedsForFarm` does not check BatchWriteCommand `UnprocessedItems`

- **File**: `src/api/src/services/dynamodb.ts:312-322`
- **Issue**: `BatchWriteCommand` can return `UnprocessedItems` if DynamoDB throttles or experiences a transient error. The implementation does not check the response for unprocessed items or retry them.
- **Risk**: At MVP scale (max 25 beds per farm) this is very unlikely to cause issues. However, if provisioned throughput is low or there is a burst of farm creation, some bed items could silently fail to be written, leaving the bed grid incomplete with no error surfaced to the user.
- **Fix**: After each `BatchWriteCommand`, check `result.UnprocessedItems` — if non-empty, retry with exponential backoff (max 3 attempts). Alternatively, log a warning and accept the risk for MVP+, but add a comment documenting the gap.

---

### S3 SHOULD-FIX — `farms.ts` PATCH does not create new beds when grid is expanded

- **File**: `src/api/src/routes/farms.ts:280-310`
- **Issue**: The design spec (PHASE-D-ARCHITECTURE.md lines 183-188) states that grid resize via PATCH should expand (create new bed items) or shrink (soft-delete beds outside bounds). The current PATCH handler updates `grid_rows`/`grid_cols` metadata but does not create new bed items or soft-delete excess ones. After a grid expansion, the new cells will be empty in the grid but have no bed records to populate them.
- **Risk**: The `FarmLayoutView.tsx` handles missing bed records gracefully (renders a `—` placeholder), so no crash. But users will see empty grid cells they cannot interact with — tapping an empty expanded cell has no bed to assign a crop to. The design intent of grid resize is unfulfilled.
- **Fix**: In the farms PATCH handler, when `grid_rows` or `grid_cols` is being updated, call `createBedsForFarm()` for any new (row, col) positions that exceed the previous dimensions. For shrinking, either soft-delete or mark beds as inactive. This is a medium-effort change but fulfills the spec.

---

### S4 SHOULD-FIX — 410 Gone responses use error code `NOT_FOUND` instead of `GONE`

- **File**: `src/api/src/routes/plots.ts:16` and `src/api/src/routes/farms.ts:224-226`
- **Issue**: The 410 Gone responses for deprecated plot endpoints use `{ error: { code: 'NOT_FOUND' } }` with HTTP status 410. The error code should be `GONE` to match the HTTP semantics and distinguish from actual 404s in client-side error handling.
- **Risk**: Frontend or external clients checking `error.code` will see `NOT_FOUND` and may confuse a deprecated endpoint with a genuinely missing resource.
- **Fix**: Change `code: 'NOT_FOUND'` to `code: 'GONE'` in all 410 response bodies. Add `'GONE'` to the `ErrorCode` union type in `packages/shared/src/types/api.ts`.

---

### SG1 SUGGESTION — MapPicker loads Leaflet CSS from CDN (unpkg.com)

- **File**: `src/frontend/src/components/MapPicker.tsx:82`
- **Issue**: Leaflet CSS is loaded at runtime from `https://unpkg.com/leaflet@1.9.4/dist/leaflet.css`. This creates an external dependency on unpkg.com availability and introduces a potential supply-chain concern (if unpkg serves modified CSS).
- **Fix**: Bundle the Leaflet CSS as a local asset (copy to `public/` or import via the build pipeline). Pin the integrity hash if continuing to use CDN.

---

### SG2 SUGGESTION — i18n keys still reference "plot" terminology

- **File**: `src/frontend/src/i18n/en.json:27,44,52,202,205`
- **Issue**: Several i18n keys retain "plot" terminology: `screens.plot_detail`, `farm.no_plots`, `farm.no_plots_body`, `plot.*` namespace (used by BedDetail.tsx for labels like `plot.crop_type`, `plot.planted`, etc.), `add_plot.add_plot`. While BedDetail.tsx uses these keys and they still render correct UI text, the terminology inconsistency creates maintenance confusion.
- **Fix**: Rename the `plot` namespace to `bed` in both `en.json` and `ja.json`, and update all `t('plot.*')` calls in frontend components to `t('bed.*')`. This is cosmetic but improves codebase consistency.

---

### SG3 SUGGESTION — FarmWizard shows success toast on 409 Conflict

- **File**: `src/frontend/src/components/FarmWizard.tsx:62-64`
- **Issue**: When `createFarm` returns 409 (farm ID already exists), the catch block shows a success toast (`t('wizard.success')`) and returns silently. While a UUID collision is astronomically unlikely, treating a conflict as success is misleading.
- **Fix**: Show an error toast or a "Please try again" message on 409, since the farm was not actually created from the user's perspective.

---

## Alignment Assessment

### Plan Coverage

The 17 tasks in TASK_BREAKDOWN_PHASE_D.md are substantially addressed:
- **D-01 through D-08, D-10 through D-16**: Implemented.
- **D-09 (beds.test.ts)**: Missing -- see M3.
- **D-17 (integration smoke)**: 271 tests pass, but below the 303 baseline target. The test count regression suggests some existing tests may have been removed without replacement.

### ADR Compliance

Option B (flatten Farm->Bed) is correctly implemented. The hierarchy is now 2-level. Field and Plot interfaces are fully removed from production code (`packages/shared/` has no `Field` or `Plot` exports). The `PlotStatus` type alias and `PLOT_STATUS` constant are correctly kept as deprecated aliases for backward compatibility.

### Security

- All `/api/v1/beds/*` endpoints are auth-protected (confirmed in `app.ts:112-113`).
- PATCH /beds/:bedId correctly requires `admin` or `manager` role via `assertBedWriteAccess()`.
- POST /beds/:bedId/images correctly requires write access.
- MapPicker calls Open-Meteo Elevation API (free, public, no API key) -- acceptable per design.
- FarmWizard validates name is non-empty and location is set before calling `createFarm`.
- Deterministic UUIDs in seed data are safe (demo-only, not used for auth).
- 410 Gone routes do not leak internal data model details beyond "use /beds/ instead".
- No XSS vectors: all user input flows through React/Preact JSX (auto-escaped) or via Zod-validated API bodies.

### Data Integrity

- `createFarm` correctly auto-generates the bed grid via `createBedsForFarm()` after the transactional farm write.
- `createTag` correctly updates bed status on the `FARM#` partition using the bed's row/col/id for the SK.
- Seed data matches the expected DynamoDB key format (`BED#01#01#<id>` for row 1, col 1).
- Backward compatibility: `itemToFarm()` at line 92-93 applies defaults `grid_rows: 1, grid_cols: 1` for legacy records.

---

## Verification Needed

- [ ] After M1 fix: verify BedDetail hero image loads correctly (src has a signed S3 URL)
- [ ] After M1 fix: verify tag state is pre-populated from latest_image.tags on page load
- [ ] After M2 fix: verify `PATCH /beds/:bedId { "crop_type": null }` clears the field in DynamoDB
- [ ] After M3 fix: run full test suite — target 303+ tests passing
- [ ] Manual: create a new farm via FarmWizard, verify beds are auto-generated
- [ ] Manual: expand grid via PATCH /farms/:farmId, verify new cells have bed records (after S3 fix)
- [ ] Manual: verify `/plots/view?id=X` returns 410 with helpful message

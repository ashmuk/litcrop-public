# Phase D Remediation Report

> Date: 2026-03-22
> Scope: Fix all MUST-FIX and SHOULD-FIX items from REVIEW_FINDINGS_PHASE_D.md
> Test baseline: 271 tests (pre-remediation) -> 287 tests (post-remediation)

## Status: COMPLETE

---

## MUST-FIX Items

### M1: GET /beds/:bedId missing `url` + `tags` on latest_image -- FIXED

**Root cause**: `makeLatestImage()` returns only thumbnail-level data (`id`, `thumbnail_url`, `captured_at`, `trigger`). The `BedDetailResponse` TypeScript type requires `url` (signed full image URL) and `tags` array, but the schema and implementation were both missing them.

**Fix applied**:
- Created `makeBedDetailImage()` in `src/api/src/routes/_helpers.ts` that fetches the signed full URL via `getSignedImageUrl()` and tags via `dynamoRepo.getTagsForImage()` in parallel. Returns the full shape: `{ id, thumbnail_url, url, captured_at, trigger, tags }`.
- Updated `GET /:bedId` handler in `src/api/src/routes/beds.ts` to use `makeBedDetailImage()` instead of `makeLatestImage()`.
- Updated `BedDetailResponseSchema` in `packages/shared/src/schemas/index.ts` to use a new `BedDetailImageSchema` that includes `url` (string) and `tags` (array of `TagInImageSchema`).
- Moved `TagInImageSchema` earlier in the file so it can be referenced by both `BedDetailImageSchema` and `ImageDetailResponseSchema`.

**Files changed**: `src/api/src/routes/_helpers.ts`, `src/api/src/routes/beds.ts`, `packages/shared/src/schemas/index.ts`

### M2: PATCH /beds/:bedId can't clear fields with null -- FIXED

**Root cause**: The PATCH handler converted `null` to `undefined`, and `updateBed()` skipped `undefined` values. DynamoDB's `removeUndefinedValues: true` marshalling also discarded them. Net result: clear operations were silently dropped.

**Fix applied**:
- Updated `updateBed()` in `src/api/src/services/dynamodb.ts` to split updates into `SET` clauses (for non-null values) and `REMOVE` clauses (for null values). Builds the UpdateExpression as `SET a=:a, b=:b REMOVE c, d`.
- Changed the parameter type from `Partial<Pick<Bed, ...>>` to `Record<string, unknown>` to accept null values.
- Updated the PATCH handler in `src/api/src/routes/beds.ts` to pass null values through to `updateBed()` instead of converting them to undefined.

**Files changed**: `src/api/src/services/dynamodb.ts`, `src/api/src/routes/beds.ts`

### M3: Missing beds.test.ts -- FIXED

**Fix applied**: Created `src/api/src/__tests__/routes/beds.test.ts` with 16 tests covering:
1. GET /beds/:bedId -- happy path (with url + tags), null latest_image, 404, 401
2. PATCH /beds/:bedId -- admin updates, observer gets 404, null clears field (M2 regression test), 404 for unknown bed, 400 for invalid body
3. GET /beds/:bedId/images -- paginated list, empty list, 404, invalid limit
4. POST /beds/:bedId/images -- happy path 201, missing image field 400, 404 for unknown bed

**Files created**: `src/api/src/__tests__/routes/beds.test.ts`

---

## SHOULD-FIX Items

### S1: BedStatus keeps 5 values -- DEFERRED (intentional)

**Decision**: Keep 5 values (`healthy`, `slow_growth`, `issue`, `animal_intrusion`, `no_data`) for backward compatibility. The `TagValue` type is `Exclude<BedStatus, 'no_data'>` -- changing status values would break the tagging system. All 5 values are used consistently across types, schemas, constants, i18n, and frontend status maps.

**Fix applied**: Added a documentation comment in `packages/shared/src/types/domain.ts` explaining the intentional decision to keep 5 values.

**Files changed**: `packages/shared/src/types/domain.ts`

### S2: createBedsForFarm doesn't check UnprocessedItems -- FIXED

**Fix applied**: After each `BatchWriteCommand` in `createBedsForFarm()`, check `result.UnprocessedItems`. If non-empty, retry once. If still unprocessed after retry, log a warning.

**Files changed**: `src/api/src/services/dynamodb.ts`

### S3: PATCH farms doesn't create new beds on grid expand -- FIXED

**Fix applied**:
- Added `createBedsForPositions()` method to `DynamoRepository` that creates beds for specific (row, col) positions (with the same UnprocessedItems retry logic as S2).
- Updated the PATCH handler in `src/api/src/routes/farms.ts` to compare old grid dimensions with new dimensions after update. If either `grid_rows` or `grid_cols` increased, computes the new positions that didn't exist before and calls `createBedsForPositions()`.

**Files changed**: `src/api/src/services/dynamodb.ts`, `src/api/src/routes/farms.ts`

### S4: 410 Gone uses NOT_FOUND error code -- FIXED

**Fix applied**:
- Added `'GONE'` to the `ErrorCode` union in `packages/shared/src/types/api.ts`.
- Changed `code: 'NOT_FOUND'` to `code: 'GONE'` in all 410 responses across `src/api/src/routes/plots.ts` (3 routes) and `src/api/src/routes/farms.ts` (2 routes).

**Files changed**: `packages/shared/src/types/api.ts`, `src/api/src/routes/plots.ts`, `src/api/src/routes/farms.ts`

---

## SUGGESTIONS (deferred)

### SG1: MapPicker loads Leaflet CSS from CDN
**Status**: Deferred. Low risk at MVP scale. Consider bundling locally in a future phase.

### SG2: i18n keys still reference "plot" terminology
**Status**: Deferred. Cosmetic inconsistency; all keys render correct UI text. Rename `plot` namespace to `bed` in a future cleanup pass.

### SG3: FarmWizard shows success toast on 409 Conflict
**Status**: Deferred. UUID collision is astronomically unlikely. Fix in a future UX polish pass.

---

## Verification

- TypeScript: `npx tsc --noEmit` passes (both `src/api` and `packages/shared`)
- Tests: 287 tests pass across 18 test files (16 new tests added)
- All MUST-FIX items resolved
- All SHOULD-FIX items resolved (S1 deferred by design decision)

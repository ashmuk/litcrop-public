# TEST_PLAN.md

Aggregated test plans and coverage gap analyses for the LitCrop codebase.
Section-per-wave; append new sections, do not overwrite.

## Wave D D5 — Coverage Gap Analysis

Target artifacts (from the review brief):
- `src/frontend/src/lib/roi-utils.ts` — `computeRoiByBedCrop` + `BedCropRoiSummary` / `RoiScope`
- `src/frontend/src/components/roi/RoiByBedCropTable.tsx`
- `src/frontend/src/components/RoiDashboard.tsx` (fan-out + useMemo wiring)
- `src/frontend/src/lib/api.ts` — `DiaryEntryResponse.bed_crop_id` addition
- `src/frontend/src/i18n/{en,ja}.json` — `roi.roi_by_crop`, `roi.bed_crop_column`, `roi.farm_wide`
- test-helper default: `makeEntry` now defaults `bed_crop_id: null` + `entry_type: 'actual'`

Existing coverage reviewed:
- 13 unit tests in `src/frontend/src/__tests__/roi-utils.test.ts` covering `computeRoiByBedCrop` (including the two R-D5-003 additions: crop.bed_id divergence, bed-missing fallback).
- API contract tests in `src/api/src/__tests__/contracts.test.ts` — `baseEntryResponse` now includes `bed_crop_id: null` in its fixture; `DiaryEntryResponseSchema` exercise happens via Wave-D D1 schema change.
- Route-level mocks in `src/api/src/__tests__/routes/diary.test.ts` carry `bed_crop_id: null` on the `entryFixture`.
- No component-level tests for `RoiByBedTable` or `RoiByBedCropTable` (project convention — `src/frontend/src/components/` has zero `*.test.*` files).
- No `DiaryEntryForm` unit tests exist either — fan-out pattern is not test-covered on the source component.

### MUST-ADD
- None. Existing 13 unit tests cover contract shape, scope bucketing, currency per-bucket filtering, sort order, crop-vs-bed FK divergence, and the unresolved-bed_crop_id fallback. The one user-visible branch that is currently unguarded (R-D5-002 "(All)" label parity) is captured as T-D5-01 in SHOULD-ADD because the regression would be a label-text change only (no data loss, no calculation error, no crash), and the downstream `RoiByBedCropTable` label code would still render; the Wave-D close-out can proceed without it.

### SHOULD-ADD
- id: T-D5-01
  target: `computeRoiByBedCrop` — "(All)" bed-scope label-parity branch (R-D5-002)
  gap: No test exercises the path where `entry.bed_crop_id` is null, `entry.bed_id` maps to a bed that HAS `active`/`planned` BedCrops in `bedCropsMap`, AND the bed has a legacy `bed.crop_type`. All three current bed-scope tests pass an empty `bedCropsMap` for the relevant bed, so `hasActiveCrops` is always `false` and the `legacyCropType = null` branch is never taken. Reverting the `bedCropsMap[entry.bed_id]?.some(...)` guard would leave every existing test green. Two assertions needed: (a) bed with `active` crop + legacy `crop_type` → summary.crop_type is `null` (D4 parity); (b) bed with only `harvested`/`failed` crops + legacy `crop_type` → summary.crop_type stays as `bed.crop_type` (true-legacy path preserved).
  rationale: Protects the D4/D5 label-parity invariant ("(All)" everywhere, or nowhere). Without this test, a future refactor that drops the status filter or flips the polarity will silently diverge from `DiaryEntryForm`'s dropdown labels — the exact regression R-D5-002 was introduced to fix.
  effort: S

- id: T-D5-02
  target: `computeRoiByBedCrop` — multiple BedCrops in one bed produce distinct rows
  gap: The "mixed scopes" test (line 676) has cropA + cropB on bed-1 but each crop has only one entry. A test that fires multiple entries into each of two distinct bed_crop_ids on the same bed would confirm (i) grouping key `crop:<id>` stays unique per BedCrop, (ii) cost totals don't cross-contaminate between sibling crops, and (iii) sort order still applies within a single bed's crop rows. This is the single most common production shape for multi-crop beds (the feature this whole wave ships for).
  rationale: Wave D's headline capability is "more than one crop per bed." A silent cross-contamination between sibling BedCrops on the same bed would misattribute cost/revenue in the primary dashboard the user will open.
  effort: S

- id: T-D5-03
  target: roi-utils test helper — `hasNonMatchingCurrency` inside a per-crop bucket
  gap: The "currency filtering per bucket" test (line 780) has ONE entry with mixed JPY+USD costs on one bed_crop_id. No test verifies that two DIFFERENT entries (one pure-JPY on crop-A, one pure-USD on crop-B) bucketed into two different crops each compute their own `excluded_entry_count` independently (should be 0 for each when queried in its native currency, 1 for each in the other currency).
  rationale: Low-risk correctness check for the `excluded_entry_count` field which drives the `roi-excluded-notice` banner in `RoiDashboard`. If a future refactor leaks the across-bucket accumulator, the banner count doubles. Cheap to add alongside T-D5-02.
  effort: S

### NO-TEST-NEEDED (with reason)
- target: `RoiByBedCropTable.tsx` (presentational component — sort, `rowLabel`, mobile/desktop render branches)
  reason: Project convention. `RoiByBedTable`, `RoiSummaryCards`, `CostByCategoryChart`, `MonthlyTrendChart` have no unit tests either. Wave B and Wave C close-outs shipped on the same convention. `rowLabel` is thin composition of already-tested aggregator fields + already-tested `getCropName` + already-tested i18n keys. Sort-key state is the standard React controlled-list pattern; any regression surfaces visually in Playwright or on first manual open of the dashboard.

- target: `RoiDashboard.tsx` fan-out pattern (`useEffect` → `Promise.all(beds.map(listBedCrops))`)
  reason: Covered by similarity to `DiaryEntryForm`'s identical fan-out (same imports, same per-bed error isolation, same `cancelled` guard). `DiaryEntryForm` itself has no unit test either — the pattern is trusted by inspection. Individual per-bed failure degrades to `[]` which is exactly the unresolved-bed_crop_id case covered by the existing "unresolved bed_crop_id degrades to bed-scope" test. No integration test exists for `RoiDashboard` (0 such tests in `src/frontend/src/__tests__/`).

- target: i18n key presence for `roi.roi_by_crop`, `roi.bed_crop_column`, `roi.farm_wide` (+ JA rename `農場全体 → 農園全体`)
  reason: No project-wide i18n-presence test exists. `profile-tabs-i18n.test.ts` is scoped to profile-tab keys only. Missing-key failures surface at render time as visible `{{key}}` placeholders — caught on first dashboard open. Risk is bounded: the three keys are referenced from exactly one component file, and the component already shipped on develop with both locales populated (grep confirms presence in both `en.json` L952–955 and `ja.json` L952–955). Adding a focused presence test for three keys would set a precedent for every new key wave-by-wave that the project has explicitly chosen not to take on.

- target: `DiaryEntryResponse.bed_crop_id` contract addition in `src/frontend/src/lib/api.ts`
  reason: Contract is guarded upstream in `packages/shared/src/schemas/index.ts` L684 (`DiaryEntryResponseSchema`) and exercised by `src/api/src/__tests__/contracts.test.ts` L650 (`baseEntryResponse.bed_crop_id: null` present in every valid-shape assertion) and `src/api/src/__tests__/routes/diary.test.ts` L87 (`entryFixture.bed_crop_id: null`). Dropping the field from the shared schema would fail both suites. The frontend TypeScript definition mirrors the shared type and is compile-time checked by every `*.ts` file that reads the field (including `roi-utils.ts`, which would fail `tsc` if the field disappeared).

- target: `makeEntry` test-helper default (`bed_crop_id: null`, `entry_type: 'actual'`)
  reason: The default itself is validated by every existing `computeRoi*` test that omits an override — 30+ assertions collectively prove the default is benign. A dedicated test for the default would be tautological.

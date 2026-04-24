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

## Wave D D6 — Coverage Gap Analysis

Target artifacts:
- `src/frontend/src/lib/diary-utils.ts` — `buildActualDatesMap`, `buildEventDotMap` re-keyed on `bed_crop_id ?? bed_id`
- `src/frontend/src/components/GanttChart.tsx:136-143` — `diaryKey = row.cropId ?? row.bedId`
- `src/frontend/src/components/CropTimeline.tsx:41,76` — same cascade
- `src/frontend/src/__tests__/diary-utils.test.ts` — 6 new D6-tagged tests (3 × `buildActualDatesMap`, 3 × `buildEventDotMap`)

Existing coverage reviewed:
- Producer: 3 D6 tests per function lock down the cascade (cropId keying, sibling-crop separation, legacy+crop coexistence on one bed).
- Producer: pre-D6 tests exercise reserved-exclusion, unknown-category fallback, empty input, missing `bed_id` exclusion — all still valid but use `bed_crop_id=null`.
- Consumer: zero unit tests for `GanttChart.tsx` / `CropTimeline.tsx` (project convention — `components/` has no `*.test.*` files).
- e2e: `/workspace/e2e/tests/diary-entry.spec.ts` (164 lines) makes zero reference to Gantt, Timeline, or `bed_crop_id`.
- `cropId` domain: confirmed strictly uuid-or-null in `DiaryPage.tsx:505-534`. The `'legacy'` sentinel is baked only into `row.id` (`${bedId}:legacy`), never into `row.cropId`. No risk of a sentinel string becoming a Map key.

### MUST-ADD
- None. The three D6 additions per function cover the keying cascade, sibling-crop separation, and the legacy/crop coexistence invariant. Remaining gaps are either cross-exercised by pre-D6 branch tests (reserved exclusion, non-planting/harvesting skip) or are consumer-cascade concerns deferred to project convention. **Pass signal: Wave D can ship to main on the producer-side coverage as is.**

### SHOULD-ADD
- id: T-D6-01
  target: `buildActualDatesMap` — reserved-entry exclusion still holds when `bed_crop_id` is set
  gap: The existing "excludes reserved entries" test (line 401) and its mixed-input sibling (line 408) both use `bed_crop_id=null`. The D6 keying line now sits below the `entry_type === 'reserved'` guard — correct today, but no test pins down that a crop-attributed reserved entry (`bed_crop_id='crop-A', entry_type='reserved'`) is excluded. A future refactor that reorders guards ("key first, filter later") would pass the current suite.
  rationale: The reserved-exclusion invariant is the difference between the `gantt__bar--reserved` amber band and the `gantt__bar--actual` green band. Silently bucketing a reserved entry into an `actualMap` key would paint a fake "in-progress" bar for a crop the user only planned.
  effort: S

- id: T-D6-02
  target: `buildActualDatesMap` — latest-date logic holds per-crop bucket, no cross-bucket leak
  gap: The "uses latest date when multiple planting entries exist" test (line 361) is bed-scoped. No test verifies that two planting entries on the SAME `bed_crop_id` resolve to the latest date in the cropId bucket, and no test verifies that latest-date on crop-A does NOT leak into crop-B's bucket on the same bed. Covered inferentially by the "sibling crops" test but not pinned down.
  rationale: Cheap insurance — one fixture with two planting entries each on crop-A and crop-B, asserting each resolves to its own latest. Protects against a hypothetical accumulator leak across buckets.
  effort: S

- id: T-D6-03
  target: `buildEventDotMap` — dot sort order holds per-crop bucket
  gap: The "sorts dots by date within each bed" test (line 525) is bed-scoped with `bed_crop_id=null`. No test verifies that per-crop buckets ALSO sort independently. Sort is structurally guaranteed by `for (const dots of map.values())` but it's a one-line locality a refactor could move outside the loop.
  rationale: Cheap to add alongside T-D6-02 with the same fixture shape. Dot order drives visual left-to-right placement on the Gantt track; an unsorted bucket shows events in ingestion order — random-looking scatter for crop-A/crop-B on one bed.
  effort: S

### NO-TEST-NEEDED (with reason)
- target: `GanttChart.tsx` / `CropTimeline.tsx` — consumer cascade `row.cropId ?? row.bedId` regression protection
  reason: Project convention. `components/` has zero unit tests. `RoiByBedTable`, `RoiByBedCropTable`, `RoiSummaryCards`, `CostByCategoryChart`, `MonthlyTrendChart`, `DiaryEntryForm`, `DiaryCalendar` are all uncovered at the component level and Wave A/B/C shipped on the same convention. The cascade is two characters (`??`) repeated in three call sites; an inverted expression (`row.bedId ?? row.cropId`) would collapse sibling crops into one bucket and be immediately visible on the dashboard — a visual-first regression surface. Adding unit tests for this one wave would set a per-wave-per-component precedent the project has declined.

- target: Gantt / Timeline e2e coverage for sibling-crop rendering
  reason: No Gantt/Timeline e2e exists (`/workspace/e2e/tests/diary-entry.spec.ts` makes zero reference to either component or `bed_crop_id`). Adding one as part of D6 would be a scope expansion into e2e infrastructure Wave D has not committed to, and would duplicate the producer-level coverage the six existing D6 unit tests already provide. If Wave D close-out later decides to add a Gantt e2e, it belongs in a separate ticket — not a D6 blocker.

- target: Collision safety between `bed_id` and `bed_crop_id` UUIDs
  reason: Both are v4 UUIDs; collision probability is cryptographic-negligible. The backend contract generates `bed_crop_id` fresh per BedCrop row, and the frontend never synthesizes either id locally. A frontend-enforced collision check would be a defensive test against a condition that cannot arise without a deliberate backend bug.

- target: R-D6-002 "orphaned legacy entry" trade-off (pre-Wave-D entries with `bed_crop_id=null` on a bed that now has real BedCrops)
  reason: Documented in the `buildActualDatesMap` JSDoc (lines 117-126) and mechanically proven by D6 test #3 ("legacy bed-level and crop-level stay in separate buckets"). The orphaning behavior — entry keys under `bed_id`, but `DiaryPage.ganttRows` only emits a virtual-legacy row (`cropId=null`) when the bed has zero real BedCrops — means the bucket exists but no row consumes it. A dedicated "orphan stays unrendered" test would require spinning up `GanttChart` or `DiaryPage` against a `ganttRows` fixture, which is component-level territory the project declines.

- target: `GanttRow.cropId` sentinel-string safety (`'legacy'` as a Map key)
  reason: Confirmed by direct inspection: `DiaryPage.tsx:505-534` sets `cropId: crop.id` (uuid) or `cropId: null` exclusively. The `'legacy'` sentinel is concatenated into `row.id` only (`${bed.id}:legacy` at line 526). `row.cropId` is never `'legacy'`; a sentinel string can never reach `actualMap.get()` as a key. TypeScript's `string | null` typing enforces the shape at compile time.

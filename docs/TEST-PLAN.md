# TEST-PLAN.md

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

## Wave D D3 — Coverage Gap Analysis

Target artifact:
- `src/api/src/routes/diary.ts:256-270` — POST harvest auto-default block between bed_crop_id validation and `createDiaryEntry`.

Existing coverage reviewed:
- 8 Wave D D3 tests in `src/api/src/__tests__/routes/diary.test.ts:407-619` covering: active-crop attribution, virtual-legacy skip, planned-crop skip (R-D3-001), non-harvest no-fire, explicit-value preservation, no-bed no-fire, DDB-failure tolerance (R-D3-002), PATCH no-auto-default (R-D3-003).
- Call-not-made guards on tests #4/#5/#6 pin down the three early-exit branches.
- Default mock `getActiveCropForBed.mockResolvedValue(null)` + `getBedCrop.mockRejectedValue(NotFoundError)` reset per test.
- Bridge interaction: `syncBedDatesFromDiary` (diary.ts:159-203) does not read `bed_crop_id`; D3 is orthogonal to the #273 bed-date sync path. No interaction test needed.

### MUST-ADD
- None. All five D3-block branches are exercised (explicit-skip, category-skip, no-bed-skip, active-crop-attribute, status-narrowing), plus the failure-tolerance and PATCH-regression guards. **Pass signal: Wave D D3 can ship to main on current coverage.**

### SHOULD-ADD
- id: T-D3-01
  target: `diaryRouter.post` D3 block — `getActiveCropForBed` called and returns `null` (no active or planned crop on the bed)
  gap: All six "no-fire" cases today take branches BEFORE `getActiveCropForBed` is invoked (non-harvest, no bed_id, explicit bed_crop_id) or the function rejects (test #7). No test exercises the path where the function IS called, resolves `null`, and the `if (active && ...)` guard short-circuits on the first conjunct. A future refactor that replaces `active && active.status === 'active'` with `active.status === 'active'` (optional-chaining drop) would throw only on this untested path.
  rationale: One-line fixture addition (`mockResolvedValue(null)` is already the default; just need a harvest POST with bed_id that asserts `bed_crop_id: null` AND `getActiveCropForBed` was called exactly once). Locks the null-guard down as an explicit contract.
  effort: S

- id: T-D3-02
  target: `diaryRouter.post` D3 block — response shape reflects auto-defaulted `bed_crop_id` end-to-end
  gap: Test #1 asserts `createDiaryEntry` receives the correct `bed_crop_id` argument, but does not read the HTTP response body to confirm the field round-trips through `buildEntryResponse` to the client. Current `createDiaryEntry` mock returns a fixture with `bed_crop_id: ACTIVE_CROP_ID` pre-set, so the wire-level contract that the client sees the auto-defaulted id is not directly asserted. Note: `buildEntryResponse` (diary.ts:83-112) does NOT currently emit `bed_crop_id` in the response object — grep confirms no `bed_crop_id:` in the return literal. This is a real response-shape gap worth verifying before shipping.
  rationale: Consumers of the POST response (frontend `DiaryEntryForm` optimistic update, potential mobile clients) may rely on the auto-defaulted id echoing back. If `buildEntryResponse` omits the field, the client cannot distinguish "server auto-attributed" from "no attribution" without a follow-up GET. Either add the field to `buildEntryResponse` (and test it) or deliberately document the omission.
  effort: S

### NO-TEST-NEEDED (with reason)
- target: D3 interaction with `syncBedDatesFromDiary` bridge
  reason: `syncBedDatesFromDiary` (diary.ts:159-203) reads only `category`, `bed_id`, `date`, `entry_type` — grep confirms no `bed_crop_id` reference in its body. The bridge operates on bed-level inline fields or on `listBedCropsByBed` lookups, both orthogonal to the POST handler's `effectiveBedCropId` resolution. A dedicated interaction test would exercise code paths already covered separately by #273 bridge tests (diary.test.ts:1038-1168) and D3 tests above.

- target: D3 × D5 cross-wave aggregation (harvest auto-defaulted by D3 surfaces in `computeRoiByBedCrop`)
  reason: Wave boundary. D5's `computeRoiByBedCrop` unit tests read `entry.bed_crop_id` directly from fixtures; whether the value arrived via user input or D3 server-side default is transparent to the aggregator. D3's contract is "POST writes the correct `bed_crop_id` to DDB"; D5's contract is "aggregator groups by whatever `bed_crop_id` is stored." Both sides are independently tested. An integration test crossing the boundary would require spinning up DDB Local + frontend fetch — infrastructure the project has declined for Wave D.

- target: Concurrency — two simultaneous harvest POSTs on the same bed auto-default to the same BedCrop
  reason: DDB last-writer-wins semantics; both POSTs read the same `getActiveCropForBed` result (or read it at slightly different times — still the same active crop id while it remains active). The two writes produce two diary entries both pointing at the same `bed_crop_id`, which is the intended behavior. No race condition exists because `effectiveBedCropId` is a request-scoped local and `createDiaryEntry` writes a fresh row keyed by `entryId = randomUUID()`. A concurrency test would validate DDB semantics, not D3 logic.

- target: `active.status === 'harvested'` / `'failed'` skip branch
  reason: `getActiveCropForBed`'s GSI1 query (per repo contract) surfaces only `status ∈ {active, planned}` crops; harvested/failed crops never reach the D3 block. The `active.status === 'active'` narrow is defensive against the planned case (tested in #3), not against harvested/failed which cannot arrive here. A test asserting "harvested crop is skipped" would require forcing the mock to violate the repo contract — exercising a condition the production code cannot observe.

## Wave E step 1 — Coverage Gap Analysis

Target artifacts:
- `src/api/src/services/migrations/wave-e-promote-legacy.ts` — `promotedCropId`, `shouldPromoteBed`, `buildPromotedCrop`, `promoteLegacyCropForBed`
- `scripts/migrate-wave-e-promote-legacy-crops.ts` — operational CLI wrapper (scan + orchestrate + aggregate counts)

Existing coverage reviewed:
- 17 Wave E1 unit tests in `src/api/src/__tests__/services/migrations/wave-e-promote-legacy.test.ts`: 7 × `shouldPromoteBed`, 2 × `buildPromotedCrop`, 8 × `promoteLegacyCropForBed`.
- `shouldPromoteBed` branches exercised: needed-path, `crop_type` absent (undefined + empty string), `completed_at` set, `already-has-legacy` idempotency marker, `has-real-bedcrops`, marker-before-real precedence. Every early-exit reason has at least one test.
- `buildPromotedCrop` branches exercised: full-field copy + marker stamping, optional-field absence (crop_variety/planted_at/expected_harvest undefined).
- `promoteLegacyCropForBed` branches exercised: live-mode write + `created_by: 'system'` sentinel, dry-run no-write, idempotent already-has-legacy, skip real-bedcrops, skip no-crop, skip completed_at, deterministic default-id (concurrent-runs safety), D3 prefix-compat assertion (`promoted-*` is not `bed-legacy-*`).
- Migration-script test convention: zero dedicated tests on `scripts/migrate-roles.ts`, `scripts/migrate-device-resolution.ts`; `grep '*.test.ts'` under `scripts/` returns empty. This script follows the same convention.
- Repository contract: `listBedCropsByBed` and `createBedCrop` mocks are hoisted at file top; `resetAllMocks` + defaults re-applied in `beforeEach`. Both functions throw on DDB failure — bubble-up is the orchestrator's intentional contract (CLI `.catch` at line 85-88 logs + `return null` → continue to next bed).

### MUST-ADD
- None. All three pure-function units (`shouldPromoteBed`, `buildPromotedCrop`, `promotedCropId`) are fully branch-covered; the orchestrator covers the three layers that matter most for a one-shot production data migration: (a) predicate gatekeeping, (b) live vs dry-run write split, (c) idempotency-marker re-run safety. The two biggest production risks — double-promoting a bed on re-run, and clobbering a user-created BedCrop — are each locked down by dedicated tests (#5 `already-has-legacy`, #6 `has-real-bedcrops`). **Pass signal: Wave E1 can run against production on current coverage.**

### SHOULD-ADD
- id: T-E1-01
  target: `promoteLegacyCropForBed` — `listBedCropsByBed` rejection bubbles out of the orchestrator
  gap: No test asserts that a DDB failure in the repo read propagates up (where the CLI wrapper's `.catch` then logs + skips the bed). Today the orchestrator has no `try/catch` around `listBedCropsByBed`, so the rejection propagates naturally — but that is an undocumented behavior invariant. A future refactor that adds a blanket `try/catch` returning `{ action: 'skipped', reason: 'error' }` would pass every existing test while silently changing the CLI's per-bed failure semantics (count bucket attribution + operator log message shape). One `mockRejectedValueOnce(new Error('DDB throttle'))` + `await expect(...).rejects.toThrow('DDB throttle')` pins the contract.
  rationale: The CLI's per-bed failure loop (`scripts/migrate-wave-e-promote-legacy-crops.ts:85-88`) depends on this bubble-up to decide "log + continue to next bed." If the orchestrator ever starts swallowing errors internally, the CLI would count failed beds into a `SkipReason` bucket instead of into stderr, and operators running dry-run before live would see a falsely clean summary. Low-cost invariant lock.
  effort: S

- id: T-E1-02
  target: `promoteLegacyCropForBed` — `createBedCrop` rejection bubbles out (live mode only)
  gap: Symmetric to T-E1-01 for the write side. No test asserts the write-failure propagation contract. Today: live mode calls `createBedCrop(buildPromotedCrop(...))`; if DDB rejects, the error bubbles to the CLI loop. Dry-run never calls `createBedCrop` so this path is only live-mode relevant.
  rationale: Protects the same CLI "log + continue" semantics on the write leg. Also pins down the order-of-operations invariant that `createBedCrop` is NOT retried inside the orchestrator (operator-visible retries are the CLI's problem, not the service layer's). Adds alongside T-E1-01 with one shared fixture.
  effort: S

### NO-TEST-NEEDED (with reason)
- target: `scripts/migrate-wave-e-promote-legacy-crops.ts` operational wrapper (ScanCommand pagination, heartbeat every 50, `farm_id`/`id` malformed-row guard, per-bed `.catch` continue, `SkipReason` counts tally, fatal top-level catch)
  reason: Project convention — `scripts/migrate-roles.ts` and `scripts/migrate-device-resolution.ts` ship with zero dedicated unit tests, and the repo has no `scripts/*.test.ts` files at all. Each behavior in the wrapper is either (a) a thin pass-through to an already-tested unit (the per-bed orchestration call), (b) a DDB SDK surface that is implicitly covered by local dry-run verification against a test farm before production, or (c) operator-visible aggregate logging (heartbeat + summary) where a divergence from intent surfaces in the first dry-run's stdout. Operators will run `DRY_RUN=1 npx tsx ...` against production once before the live pass — any wrapper bug (bad filter expression missing rows, heartbeat frequency off, count bucket mis-keyed) surfaces there at zero customer impact. Crucially: the script's read path (`ScanCommand` + `itemToBed`) already round-trips through the BedCrop repo's writer path for every `promoted: true` bed during the live run, so a read-side deserialization bug becomes a write-side failure that T-E1-02 contract + CLI `.catch` contain. Adding a script-level test harness for one wave would (i) invert the project's migration-script convention and (ii) duplicate logic already covered by the unit tests the wrapper delegates to.

- target: `shouldPromoteBed` — `crop_type: null` distinct from `undefined` / `''`
  reason: The guard `if (!bed.crop_type)` is falsy-sensitive, so `null`, `undefined`, `''`, and `0` all take the same branch. TypeScript (`Bed.crop_type?: string`) prevents `null` at the compile boundary — the DDB mapper `itemToBed` returns `string | undefined`, never `string | null`. The current `undefined` + `''` tests cover the real shapes; a `null` test would exercise a type-impossible value and inflate fixture complexity without adding a reachable branch.

- target: `shouldPromoteBed` — defensive `existingRealCrops: non-array` guard
  reason: Parameter is typed `BedCrop[]`; every caller is either the orchestrator (which passes the repo's typed return) or a unit test (which controls the fixture). No production path delivers a non-array. A defensive test would encode a contract that does not exist in the type system and would lock down JavaScript coercion behavior rather than domain behavior.

- target: `buildPromotedCrop` — bed with stray `notes` / `status` / `created_by` fields does not leak through
  reason: The builder is pure and explicit — it destructures only the fields it needs (`id`, `bed_id`, `farm_id`, `crop_type`, `crop_variety`, `planted_at`, `expected_harvest`) and assigns `status`, `created_by`, `created_at`, `updated_at`, `created_from_legacy` from its own constants or arguments. `Bed` type has no `notes` / `status` / `created_by` fields, so the TypeScript compiler rejects a caller that tries to pass them. A "contamination" test would exercise a path the type system already makes unreachable.

- target: Concurrency — two CLI processes running against the same table simultaneously
  reason: Locked down by the `promotedCropId(bedId) = 'promoted-<bedId>'` deterministic id design (documented in source JSDoc R-E1-001) + the already-has-legacy predicate. Test #2 pins the determinism invariant; DDB last-writer-wins on identical PK+SK+content is safe by SDK contract. An operational-concurrency test would require a real DDB table — infrastructure out of scope for the project's unit-heavy pyramid.

- target: Integration — 5-cap check at `POST /beds/:id/crops` vs migration-created rows
  reason: Wave boundary. The 5-cap is enforced at route level against ALL BedCrops for a bed (persisted rows only). A migration-created BedCrop counts toward the cap the same as a user-created one — which is the intended behavior (the cap protects the free-tier economics, regardless of who created the row). Because each bed with a legacy `crop_type` produces at most one promoted BedCrop, and `shouldPromoteBed` already skips beds with any existing real BedCrop, no bed can exceed 1 after migration. An integration test crossing the migration/route boundary would exercise the cap logic (already unit-tested in Wave B) against a row shape (already unit-tested here) with no new combined risk.

- target: Integration — migration running while live traffic writes to the same beds
  reason: The `shouldPromoteBed` read happens inside `promoteLegacyCropForBed` (orchestrator) immediately before the write. If a user creates a BedCrop for bed X between the scan and the per-bed promote, the orchestrator's `listBedCropsByBed` read picks it up and returns `has-real-bedcrops` (test #6). If two migration processes both pass the predicate on the same bed, the deterministic id collapses to a last-writer-wins PutItem with identical content (test #2). The only unprotected window is: user creates a real BedCrop AFTER `listBedCropsByBed` returns empty but BEFORE `createBedCrop` writes — in that case, the bed ends with one user-created BedCrop + one `created_from_legacy: true` BedCrop, both valid, both rendered. This is a documented acceptable outcome (DESIGN-279 §6 — operator runs migration during a maintenance window or live, both supported). Asserting it under test would require DDB transaction infrastructure the project does not maintain.

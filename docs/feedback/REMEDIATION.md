# Remediation Report — Wave E step 1 (2026-04-24)

## Summary
- Review source: `docs/feedback/REVIEW-FINDINGS.md` Session 9 (Wave E step 1)
- Iterations: 1 of 3 max
- Status: RESOLVED — 2/2 SHOULD-FIX + 2/3 SUGGESTION addressed; 0 MUST-FIX

## Findings Resolution

| # | Finding | Severity | Status | Notes |
|---|---------|----------|--------|-------|
| R-E1-001 | Concurrent-run race window — two CLI processes could both PUT with different uuids → duplicate legacy rows + silent 5-cap breach | SHOULD-FIX | FIXED | Replaced `randomUUID()` default with deterministic `promoted-<bedId>` (new exported `promotedCropId()` helper). A concurrent race now collapses to an idempotent overwrite with identical content. Chose deterministic id over `ConditionExpression` because different uuids would bypass `attribute_not_exists(PK)` anyway; deterministic is structurally safe. Chose `promoted-` prefix (not `bed-legacy-`) because D3's auto-default skips ids starting with `bed-legacy-` as the virtual-projection sentinel — promoted rows must be treated as REAL crops by D3. Added 2 tests: concurrent-safety (two back-to-back calls yield identical ids) + D3-compat (id does NOT match `bed-legacy-` prefix). |
| R-E1-002 | No progress heartbeat — 10k-bed migration runs silently for ~40 min | SHOULD-FIX | FIXED | Added per-50-beds heartbeat `[wave-e-promote] progress: N/M processed (promoted=X)`. Converted the `for (const bed of beds)` loop to `for (let i = 0; …)` to track index. |
| R-E1-004 | Trust of `farm_id`/`id` columns on scanned bed rows — a hand-patched row with missing `farm_id` would produce a malformed `FARM#undefined` PK | SUGGESTION | FIXED | Added `if (!farmId || !bedId)` guard in `scanBeds()`: logs `console.error` with the offending PK+SK and continues. Prevents data corruption from malformed rows. |
| R-E1-005 | Test coverage gaps: `created_by: 'system'` sentinel not pinned, default `randomUUID()` branch untested | SUGGESTION | FIXED (partial) | Added `created_by: 'system'` assertion to the `toHaveBeenCalledWith` in the live-mode test. The default-id branch is now covered by the R-E1-001 concurrent-safety test. Empty-string `completed_at` deferred (shouldPromoteBed treats any truthy completed_at as "skip"; empty-string is falsy, so behavior matches `no-completed_at` already-tested path). |
| R-E1-003 | `idFactory` default is inline rather than module-level constant | SUGGESTION | DEFERRED | Superseded by R-E1-001 — the default is now `promotedCropId(bed.id)`, an exported helper. Separate module-level factory constant would be over-abstraction. |

## Iteration Log

### Iteration 1
- Findings addressed: R-E1-001 (deterministic id), R-E1-002 (heartbeat), R-E1-004 (farm_id guard), R-E1-005 (test hardening)
- Builder: inline application — four surgical edits (one id-scheme change, one `console.log` line, one guard clause, one test assertion + 2 new tests). Full my-builder dispatch would have added orchestration overhead without risk reduction.
- Outcome: All SHOULD-FIX resolved. Vitest 1245 → 1247 (+2 race-safety/D3-compat tests). Typecheck clean after shared rebuild.

## Verification

```
Test Files  55 passed (55)
     Tests  1247 passed (1247)   ← baseline 1245 + 2 new
  Duration  5.86s

npm run typecheck: shared + api clean
```

Files changed:
- `src/api/src/services/migrations/wave-e-promote-legacy.ts` — R-E1-001 (promotedCropId helper + deterministic default)
- `scripts/migrate-wave-e-promote-legacy-crops.ts` — R-E1-002 (heartbeat) + R-E1-004 (farm_id guard)
- `src/api/src/__tests__/services/migrations/wave-e-promote-legacy.test.ts` — R-E1-001 tests + R-E1-005 sentinel assertion

LOC delta: +48 / -9.

## Escalations
None. 0 MUST-FIX; both SHOULD-FIX resolved; 2/3 SUGGESTION resolved; R-E1-003 deferred with rationale (superseded by R-E1-001's structural fix).

*Remediation completed: 2026-04-24 | Status: RESOLVED*

---

# Remediation Report — Wave D D3 (2026-04-24)

## Summary
- Review source: `docs/feedback/REVIEW-FINDINGS.md` Session 8 (Wave D D3)
- Iterations: 1 of 3 max
- Status: RESOLVED — 2/2 SHOULD-FIX + 2/2 SUGGESTION addressed; 0 MUST-FIX

## Findings Resolution

| # | Finding | Severity | Status | Notes |
|---|---------|----------|--------|-------|
| R-D3-001 | `getActiveCropForBed` returns status ∈ {active, planned}; D3 was mis-attributing harvests to planned-but-not-planted crops | SHOULD-FIX | FIXED | Narrowed condition in `diary.ts` to `active.status === 'active' && !active.id.startsWith('bed-legacy-')`. Added test: "does NOT auto-attribute to a planned (not-yet-planted) BedCrop". |
| R-D3-002 | Bare `catch {}` swallowed all errors silently — no observability on outage-time degradation | SHOULD-FIX | FIXED | Added `console.warn('[D3 auto-default] getActiveCropForBed failed for bed ${bed_id}:', err)` mirroring `syncBedDatesFromDiary` pattern. Existing lookup-failure test upgraded with `vi.spyOn(console, 'warn')` + assertion that the warn fires. |
| R-D3-003 | No PATCH regression guard — a future copy-paste of D3 into PATCH would pass all 6 POST tests | SUGGESTION | FIXED | Added PATCH-specific test asserting `getActiveCropForBed` is NOT called during `PATCH /diary/:entryId`. |
| R-D3-004 | Auto-defaulted id skips `getBedCrop` re-validation; safe but undocumented | SUGGESTION | FIXED | Added a sentence to the D3 JSDoc explaining the skip is safe because `getActiveCropForBed`'s GSI1 query is already scoped to `bed_id`. |

## Iteration Log

### Iteration 1
- Findings addressed: R-D3-001 (correctness narrowing), R-D3-002 (observability), R-D3-003 (regression guard), R-D3-004 (doc comment)
- Builder: inline application — all four are proportionate to scope (1 conditional clause, 1 log line, 1 doc comment, 2 tests). Full my-builder dispatch would have added orchestration overhead without risk reduction.
- Outcome: All SHOULD-FIX + SUGGESTION resolved. Vitest 1226 → 1228 (+2 new regression tests). Typecheck clean (shared + api).

### Iteration 2 (discovered via /cc-test)
- my-analyst's D3 coverage gap analysis (`docs/TEST_PLAN.md` § Wave D D3) surfaced T-D3-02 as a test-shaped gap that on inspection was a **source-code contract bug**: `buildEntryResponse` (diary.ts:83-112) omitted `bed_crop_id` from the returned object, so D1/D2/D3 persistence was invisible to clients. Pre-dated D3 — D1 added the domain + schema + DDB mapper fields but never updated the outgoing response shape.
- Fix: added `bed_crop_id: entry.bed_crop_id` to `buildEntryResponse` return literal.
- Plus added T-D3-01 (null-return short-circuit) + T-D3-02 (response-echo assertion) from the /cc-test strategy.
- Outcome: vitest 1228 → 1230 (+2 new tests). Contract now consistent with the Zod `DiaryEntryResponseSchema` (requires `bed_crop_id`) and the frontend local type (updated in D5 commit `72c77aa`).

## Verification

```
Test Files  54 passed (54)
     Tests  1228 passed (1228)   ← baseline 1226 + 2 new
  Duration  5.80s
```

Files changed:
- `src/api/src/routes/diary.ts` — R-D3-001 + R-D3-002 + R-D3-004 + buildEntryResponse contract fix (T-D3-02)
- `src/api/src/__tests__/routes/diary.test.ts` — R-D3-001 test + R-D3-002 assertion + R-D3-003 test + T-D3-01 test + T-D3-02 test

LOC delta: +94 / -4.

## Escalations
None. 0 MUST-FIX; all 2 SHOULD-FIX resolved; both SUGGESTIONS folded in since they were trivial.

*Remediation completed: 2026-04-24 | Status: RESOLVED*

---

# Remediation Report — Wave D D6 (2026-04-24)

## Summary
- Review source: `docs/feedback/REVIEW-FINDINGS.md` Session 7 (Wave D D6)
- Iterations: 1 of 3 max
- Status: RESOLVED — 1/1 SHOULD-FIX addressed + 1/2 SUGGESTION addressed; 0 MUST-FIX

## Findings Resolution

| # | Finding | Severity | Status | Notes |
|---|---------|----------|--------|-------|
| R-D6-001 | Stale "bed-level" phrase in `CropTimeline.tsx:74` comment — inconsistent with the corresponding Gantt cascade comment | SHOULD-FIX | FIXED | Replaced with the mirror comment used in `GanttChart.tsx` — cascade explanation with producer reference. |
| R-D6-002 | Orphaned legacy entries (pre-Wave-D, `bed_crop_id=null` on a bed that now has real BedCrops) not documented in the affected source file | SUGGESTION | FIXED | Added a JSDoc paragraph to `buildActualDatesMap` in `diary-utils.ts` noting the intentional orphan behavior (per DESIGN-279 §3.3 "no data migration") and the user-backfill escape hatch. |
| R-D6-003 | Two additional edge cases undertested (orphaned-legacy path, empty-string `bed_crop_id`) | SUGGESTION | DEFERRED | Orphaned-legacy is now documented (R-D6-002) rather than tested; empty-string `bed_crop_id` is a server-contract concern (Zod rejects it) not a frontend invariant. |

## Iteration Log

### Iteration 1
- Findings addressed: R-D6-001 (comment polish), R-D6-002 (orphan-behavior doc)
- Builder: inline application — both are comment-only edits, proportionate to scope; full my-builder dispatch would have added orchestration overhead without risk reduction.
- Outcome: All SHOULD-FIX resolved. Vitest 1217/1217 still passing. Typecheck ceiling unchanged (20 pre-existing).

## Verification

```
Test Files  54 passed (54)
     Tests  1217 passed (1217)
```

Files changed:
- `src/frontend/src/components/CropTimeline.tsx` — R-D6-001
- `src/frontend/src/lib/diary-utils.ts` — R-D6-002

LOC delta: +6 / -2 (comment-only).

## Escalations
None. 0 MUST-FIX; 1 SHOULD-FIX resolved; 1 SUGGESTION resolved; 1 SUGGESTION deferred with rationale.

*Remediation completed: 2026-04-24 | Status: RESOLVED*

---

# Remediation Report — Wave D D5 (2026-04-24)

## Summary
- Review source: `docs/feedback/REVIEW-FINDINGS.md` (Wave D D5 session)
- Iterations: 1 of 3 max
- Status: RESOLVED — 3/3 SHOULD-FIX addressed; 0 MUST-FIX; 3 SUGGESTION items deferred per scope directive

## Findings Resolution

| # | Finding | Severity | Status | Notes |
|---|---------|----------|--------|-------|
| R-D5-001 | `SortHeader` declared inside `RoiByBedCropTable` body — fresh component type each render loses keyboard focus and aria-sort on sort click | SHOULD-FIX | FIXED | Hoisted `SortHeader` to module scope with explicit `SortHeaderProps` (`sortBy`, `label`, `numeric`, `activeKey`, `activeDir`, `onSort`). `aria-sort` computed from props. Five call sites updated. |
| R-D5-002 | Bed-scope label drift: D4 shows `"D1 (All)"` when bed has active BedCrops; D5 showed `"D1 — Tomato"` for same bed — user sees two names for one bucket | SHOULD-FIX | FIXED | In `computeRoiByBedCrop` bed-scope branch, check `bedCropsMap[entry.bed_id]` for any `active\|planned` crop; if found, set `crop_type = null` (renders "(All)"). Legacy `bed.crop_type` fallback only when no active/planned crops exist. |
| R-D5-003 | Missing test coverage for (a) `crop.bed_id` vs `entry.bed_id` divergence and (b) BedCrop with unknown bed_id fallback | SHOULD-FIX | FIXED | Added 2 new vitest cases to `roi-utils.test.ts` `computeRoiByBedCrop` describe block documenting both contracts. |
| R-D5-004 | Abort controller on `listBedCrops` fan-out | SUGGESTION | DEFERRED | Out of D5 scope per user directive |
| R-D5-005 | `cropMap` dev-mode collision warning | SUGGESTION | DEFERRED | Out of D5 scope per user directive |
| R-D5-006 | `農園全体` QA note | SUGGESTION | DEFERRED | Documentation only, no code change needed |

## Iteration Log

### Iteration 1
- Findings addressed: R-D5-001 (component identity), R-D5-002 (label parity), R-D5-003 (test coverage)
- Outcome: All 3 SHOULD-FIX resolved. Vitest 1207/1207 passing (+2 new tests). Typecheck 20 errors (pre-existing ceiling, no new errors).

## Verification

```
Test Files  54 passed (54)
     Tests  1207 passed (1207)  ← baseline 1205 + 2 new
  Duration  7.01s

tsc --noEmit src/ error count: 20  ← pre-existing ceiling, no regressions
```

Files changed:
- `src/frontend/src/components/roi/RoiByBedCropTable.tsx` — R-D5-001
- `src/frontend/src/lib/roi-utils.ts` — R-D5-002
- `src/frontend/src/__tests__/roi-utils.test.ts` — R-D5-003

LOC delta: +38 net (+28 in tsx/ts, +10 in test)

## Escalations
None. No MUST-FIX findings; 3 SHOULD-FIX resolved in one iteration. Suggestions deferred by scope directive.

*Remediation completed: 2026-04-24 | Status: RESOLVED*

---

# Remediation Report — Wave B Close (2026-04-24)

## Summary
- Review source: `docs/feedback/REVIEW-FINDINGS.md` Session 5
- Iterations: 1 of 3 max
- Status: RESOLVED — 4/4 SHOULD-FIX addressed; 0 MUST-FIX to begin with

## Findings Resolution

| # | Finding | Severity | Status | Notes |
|---|---------|----------|--------|-------|
| S5-1 | `routes/bed-crops.ts` PATCH — `status` transitions and `completed_at` decoupled. `harvested` settable without a date; rollback `harvested → planned` leaves stale `completed_at`. | SHOULD-FIX | FIXED | PATCH handler now auto-manages `completed_at` when the caller doesn't set it explicitly: non-terminal → terminal sets `now()`; terminal → non-terminal clears to `null`. Explicit caller values still win. `TERMINAL_STATUSES` constant + `isTerminal()` helper centralize the definition. |
| S5-2 | `routes/bed-crops.ts` DELETE — soft-deleting a `harvested` crop rewrites it to `failed` and overwrites the historical harvest date with `now()`, destroying real data. | SHOULD-FIX | FIXED | DELETE short-circuits with `204` (idempotent no-op) when `crop.status` is already terminal. Neither `deleteBedCrop` nor `updateBedCrop` fires on that path — the historical `completed_at` is preserved. |
| S5-3 | `routes/beds.ts:73` + `routes/farms.ts:67` compat shim — response can carry `active_crop: {...}` AND `bed.completed_at` set simultaneously during the shim window; contradicts DESIGN-279 §4.3 shim contract. | SHOULD-FIX | FIXED | `bedToSummary` (farms) and `GET /beds/:bedId` (beds) now emit `completed_at: null` whenever `active_crop` is non-null. Legacy `bed.completed_at` only surfaces when no active crop exists — consistent with the shim contract. |
| S5-4 | `routes/bed-crops.ts` POST — 5-cap counts only persisted rows; a legacy bed can carry 1 virtual (inline `crop_type`) + 5 real = 6 effective active crops. | SHOULD-FIX | FIXED | POST handler counts real active/planned rows + 1 if the bed has legacy inline `crop_type` without `completed_at`. Documented in code comment; covered by new test case (`counts a legacy inline crop toward the 5-cap`). |

## New test coverage

| File | New cases |
|------|-----------|
| `src/api/src/__tests__/routes/bed-crops.test.ts` | 4 cases — PATCH auto-set / auto-clear `completed_at`, DELETE no-op on terminal, POST 5-cap with legacy count |

Suite 1172 → 1176 (+4). Typecheck clean across shared + api. Zero regressions on existing 1172 cases.

## Pipeline Status
- Pre-review code (998986d Wave B full diff): 4 SHOULD-FIX surfaced.
- Remediated files: `bed-crops.ts` (route), `beds.ts` (route), `farms.ts` (route), `bed-crops.test.ts` (tests), this ledger.
- Next step: `/cc-test` produces the Wave B coverage note + confirms the 1176-green baseline for Wave B tag cut (v0.99.8.0).

---

# Remediation Report — Stream 2 Kickoff (2026-04-23)

## Summary
- Review source: `docs/feedback/REVIEW-FINDINGS.md` Session 4
- Iterations: 1 of 3 max
- Status: RESOLVED — 3/3 SHOULD-FIX addressed; 0 MUST-FIX to begin with

## Findings Resolution

| # | Finding | Severity | Status | Notes |
|---|---------|----------|--------|-------|
| S4-1 | `DESIGN-279-bed-crop-1n.md` §4.2 + §4.3 — compat-shim contradiction. The design claimed backward-compat via a shim but the §4.3 `FarmBed` type block removed the inline legacy fields, forcing any caller reading `bed.crop_type` directly to break on Wave B. | SHOULD-FIX | FIXED | §4.3 now keeps `crop_type`/`crop_variety`/`planted_at`/`expected_harvest`/`completed_at` populated during Wave B → D with `@deprecated` JSDoc tags; removal deferred to Wave E. §4.2 rewords the two affected rows to "Backward-compatible during the shim window; breaking at Wave E (coordinated with a frontend that has migrated)". |
| S4-2 | `DESIGN-279-bed-crop-1n.md` §3.4 — missing mandatory GSI filter. BedCrop queries against `GSI1PK=BED#<bedId>` would collide with the bed's own `#META` row if a Wave B developer omitted the `begins_with(SK, 'CROP#')` predicate. | SHOULD-FIX | FIXED | Added an explicit mandate: every BedCrop query MUST include `begins_with(GSI1SK, 'CROP#')`. Prescribed enforcement via a shared `queryByBedCrops(bedId)` helper in `bed-crops.ts`; raw `queryByGSI1` with `PK=BED#<b>` alone must not be exposed to Wave B callers. |
| S4-3 | `DESIGN-279-bed-crop-1n.md` §6 — Wave E ordering hazard. The old text listed three Wave E bullets without specifying order; reversing migrate-first vs remove-fallback would leave live traffic returning `null` for un-promoted beds. | SHOULD-FIX | FIXED | §6 now prescribes a fixed 4-step order (promote → verify ≥ 2 weeks → remove fallback → remove inline fields), mandates a `created_from_legacy: true` idempotency marker on promoted rows, and states the failure mode of reversing any adjacent step pair. |

## Pipeline Status
- Pre-review code (`a4329f1` Wave A refactor): no changes — review was already ACCEPT for the shipped code.
- Remediated files: `docs/design/DESIGN-279-bed-crop-1n.md` only.
- Next step: `/cc-test` — no code delta means the coverage note simply verifies the 1135+ baseline is still green post-Wave-A refactor.

---

# Remediation Report — Beta-6

## Summary
- Review source: docs/feedback/REVIEW-FINDINGS.md
- Iterations: 1 of 3 max
- Status: RESOLVED

## Findings Resolution

| # | Finding | Severity | Status | Notes |
|---|---------|----------|--------|-------|
| F2 | .env source injection (arbitrary code execution) | MUST-FIX | FIXED | Restored safe key=value parser with whitelist |
| F7 | Promotion endpoint has zero test coverage | MUST-FIX | FIXED | Added 5 tests (516 total passing) |
| F10 | AccessToken vs IdToken mismatch in token refresh | MUST-FIX | FIXED | Changed to IdToken extraction; added comment citing auth.ts:221 |
| F1 | Hardcoded promo code in client bundle | SHOULD-FIX | DEFERRED | Intentional soft barrier for beta — documented in memory |
| F3 | sed delimiter collision with JWT tokens | SHOULD-FIX | FIXED | Replaced sed with awk for .env token write |
| F4/F13/F14 | Auth tokens exposed in process list | SHOULD-FIX | FIXED | All curl calls now use -K config files or --data-binary @- |
| F5 | Heartbeat JSON via unsafe string interpolation | SHOULD-FIX | FIXED | Added numeric validation for wifi_dbm and battery |
| F12 | Empty target_name in role_changed activity | SHOULD-FIX | FIXED | Lookup target user profile; added target_user_name to event payload |
| F6 | Temp file missing chmod 600 | SUGGESTION | FIXED | Added chmod 600 to mktemp calls |
| F8 | No self-promotion guard | SUGGESTION | DEFERRED | Cosmetic only; auth prevents abuse |
| F9 | Misleading soleMemberFarms variable name | SUGGESTION | DEFERRED | Low impact |
| F11 | Fragile SCRIPT_DIR fallback in install.sh | SUGGESTION | DEFERRED | Acceptable for curl-pipe use case |
| F15 | Migration script scan cost warning | SUGGESTION | DEFERRED | One-time use, DRY_RUN available |
| F16 | Promo timer not cleared on unmount | SUGGESTION | FIXED | Added useRef + clearTimeout in simplify pass |

## Iteration Log
### Iteration 1
- Findings addressed: F2, F3, F4, F5, F7, F10, F12, F13, F14 (9 findings)
- Outcome: All 3 MUST-FIX resolved. 5/6 SHOULD-FIX resolved (F1 deferred by user decision). 2/7 SUGGESTIONS addressed.

## Escalations
None — all MUST-FIX findings resolved in iteration 1.

*Remediation completed: 2026-04-03 | Status: RESOLVED*

---

# Remediation Report — Stream 1 Hardening (2026-04-23)

## Summary
- Review source: `docs/feedback/REVIEW-FINDINGS.md` (Stream 1 session, 2026-04-23)
- Iterations: 1 of 3 max
- Status: **RESOLVED**
- User directive: apply SHOULD-FIX #1 only; suggestions S1–S3 explicitly deferred

## Findings Resolution

| # | Finding | Severity | Status | Notes |
|---|---------|----------|--------|-------|
| SF1 | `<kbd>` tags in `device-setup.astro:434,463` render browser-default monospace — disjoint from adjacent `.help-section code` styling | SHOULD-FIX | **FIXED** | Added `.help-section kbd` rule as direct sibling of `.help-section code`. Matches code palette (`--color-gray-100` bg, `--radius-sm`, mono font) plus `border` + `box-shadow` for key-cap cue. Nine-line addition, same CSS tokens — no new deps. |
| S1 | `usePendingRegistration.ts:52` asymmetric admin-flag write | SUGGESTION | DEFERRED | User scope: SHOULD-FIX only. Not reachable as a bug today (mount-once hook). |
| S2 | `INCIDENT-DRILLS.md` references `docs/ops/drill-logs/` directory that doesn't exist | SUGGESTION | DEFERRED | User scope: SHOULD-FIX only. First drill author will `mkdir` before commit. |
| S3 | `useProfileSettings.ts:111` logs full error object to console | SUGGESTION | DEFERRED | User scope: SHOULD-FIX only. Pre-existing from refactor, not a regression. |

## Iteration Log

### Iteration 1

- **Findings addressed**: SF1 (1 SHOULD-FIX)
- **Builder**: inline application (CSS rule insertion in a single file, no logic changes, no new imports). Direct edit was proportionate to scope; full my-builder dispatch would have added orchestration overhead without risk reduction.
- **Reviewer re-validation**:
  - Structural: `.help-section kbd` rule is placed at lines 674-683, immediately after `.help-section code` (666-673), honoring the "discoverable relationship" constraint from the review.
  - Behavioral: vitest re-run → **1135/1135 passing** in 6.49s. No regressions.
  - Spec conformance: diff matches REVIEW-FINDINGS.md §S6 Option A exactly — all 8 declarations present, all tokens used where specified, key-cap cue (`border` + `box-shadow`) included.
- **Outcome**: SHOULD-FIX #1 resolved; suggestions S1–S3 deferred per user directive. No new concerns surfaced during re-validation.

## Escalations

None. One iteration; no systemic issue criteria triggered. Ready for `/cc-test` (pipeline step 4).

## Verification evidence

```
Test Files  51 passed (51)
     Tests  1135 passed (1135)
  Duration  6.49s
```

Diff applied (file: `src/frontend/src/pages/help/device-setup.astro`):

```diff
   .help-section code {
     font-family: var(--font-family-mono, ui-monospace, Menlo, monospace);
     font-size: 0.92em;
     padding: 1px 6px;
     border-radius: var(--radius-sm);
     background: var(--color-gray-100);
     color: var(--color-gray-900);
   }
+  .help-section kbd {
+    font-family: var(--font-family-mono, ui-monospace, Menlo, monospace);
+    font-size: 0.92em;
+    padding: 1px 6px;
+    border-radius: var(--radius-sm);
+    background: var(--color-gray-100);
+    color: var(--color-gray-900);
+    border: 1px solid var(--color-gray-200);
+    box-shadow: 0 1px 0 var(--color-gray-300);
+  }

   .help-list {
```

*Remediation completed: 2026-04-23 | Status: RESOLVED*

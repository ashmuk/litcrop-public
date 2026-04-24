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

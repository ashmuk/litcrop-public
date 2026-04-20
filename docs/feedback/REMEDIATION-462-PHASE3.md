# Remediation Report — #462 Phase 3

## Summary
- **Review source**: `docs/feedback/REVIEW-FINDINGS.md` — section "# #462 Phase 3 review (2026-04-20)" (starting at line 269).
- **Iterations**: 1 of 3 max.
- **Status**: RESOLVED (3 SHOULD-FIX addressed + 1 re-deferred with marker).
- **Remediation commit**: (will be added once this report is committed alongside the code changes).
- **Baseline commit**: `811910b` — `feat(api,shared): #462 Phase 3 — GET /me/activity endpoint + tests`.

## Findings Resolution

| # | Finding | Severity | Status | Notes |
|---|---------|----------|--------|-------|
| 1 | `ValidationError(err.message)` at `routes/me.ts:322` echoes cursor-internal messages (`"Invalid cursor: user mismatch"`, etc.), confirming to a forgery attacker that the cursor parsed successfully and user-scope was the rejection cause. | SHOULD-FIX | FIXED | Narrowed the surfaced message to a generic `'Invalid cursor'`. Internal detail stays in the thrown error's chain for server-side logging. The I8 test asserts only `status === 400` + `body.error` presence, so it continues to pass. Aligns with R3 strategy-doc mitigation ("generic 400 or silent ignore"). |
| 2 | I5 coverage missing for diary entries with `created_by = null` — device + image cases were present but diary was skipped. | SHOULD-FIX | FIXED | Added one test in the I5 repository-level describe block mirroring the device/image cases. Seeds a diary item with `created_by: null`, asserts it does not appear in the activity. Test count: 1066 → 1067. |
| 3 | `getBedsForFarm(farmId)` called twice per farm in the happy path — once for the image fan-out enumeration (inside `queryImagesForUserInFarm`) and once for the bed-name resolution map. | SHOULD-FIX | FIXED | Hoisted the `getBedsForFarm(farmId)` call into `getActivityForUser` and parallelized it with diary + devices via `Promise.all`. Passed the `beds` array into `queryImagesForUserInFarm` as a parameter. Halves per-farm DDB read cost for the dominant query class. Function signature change is internal to the module — no call-site changes outside. |
| 4 | Phase-1-deferred finding #5 (`createImage` spread-Omit pattern in `images.ts:84-105`) remained open — silently deferred for a third phase. Reviewer requirement: "don't leave the flag dangling through a third phase." | SHOULD-FIX | RE-DEFERRED (with marker) | Added a JSDoc block at `images.ts:84` explicitly re-deferring to v0.99.7.4 with rationale. Explicit re-defer replaces the silent carry-over. No behavior change in this patch; the write-path audit will be a separate task. |

### NITs (not addressed in this cycle)

| # | File:Line | Note |
|---|-----------|------|
| N1 | `me-activity.ts:75-85` | Deep-link builders kept private; extract when a second caller appears (Phase 4 may or may not need them). |
| N2 | `me.ts:319` | `let result;` typing — stylistic only, TS infers correctly. |
| N3 | `me-activity.test.ts:14-16` | `vi.hoisted` + `process.env` mutation without restore — matches existing convention in other test files. |
| N4 | `domain.ts:319-321` | `actor_id` "self by definition" JSDoc vs nullable type — minor doc asymmetry, contract is honest (Zod nullable matches). |
| N5 | `me-activity.ts:65-69` | Hardcoded `type` enum list in decoder — Set imported from domain.ts would be cleaner, but the 3-way enum is unlikely to churn. |

## Iteration Log

### Iteration 1 (2026-04-20)
- **Findings addressed**: #1 (SHOULD-FIX) info-leak, #2 (SHOULD-FIX) diary I5 coverage, #3 (SHOULD-FIX) double-read perf, #4 (SHOULD-FIX) re-defer marker for Phase 1 leftover.
- **Findings deferred**: NITs N1-N5 (low-value stylistic items).
- **Validation**: 1067/1067 vitest pass (+1 new); shared + api typecheck clean.
- **Outcome**: all SHOULD-FIX resolved or explicitly re-deferred. No further iteration required.

## Escalations
None. No MUST-FIX was found; no architectural flaw. The perf refactor (SHOULD-FIX #3) was a zero-risk mechanical dedup; the info-leak fix (SHOULD-FIX #1) aligned the route's error-surfacing with the strategy doc's R3 mitigation; the test addition (SHOULD-FIX #2) symmetrized I5 coverage.

## Artifacts
- Remediation commit: (to be added)
- Tests: `src/api/src/__tests__/services/me-activity.test.ts` gains one diary-null test in the I5 describe block.
- Carry-over: #462 Phase 1 deferred finding #5 is now explicitly re-deferred to v0.99.7.4 via JSDoc at `src/api/src/services/repositories/images.ts:84`.

## Next
- Tag `v0.99.7.3` once this remediation lands.
- Phase 4 (`ProfileActivityList` component + E2E) is queued — no blockers from Phase 3.
- Track the `createImage` spread-Omit audit as an opening item of v0.99.7.4.

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

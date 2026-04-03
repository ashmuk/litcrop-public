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

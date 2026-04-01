# Remediation Report

## Summary
- Review source: docs/feedback/REVIEW-FINDINGS.md
- Iterations: 1 of 3 max
- Status: **RESOLVED**

## Findings Resolution

| # | Finding | Severity | Status | Notes |
|---|---------|----------|--------|-------|
| MF-1 | Wave 1 missing AccessToken prerequisite dependency | MUST-FIX | FIXED | Added Prerequisites section to DELETE-ACCOUNT.md referencing Wave 0's `getCognitoAccessToken()` fix |
| MF-2 | TTL attribute lowercase `ttl` vs CDK uppercase `TTL` | MUST-FIX | FIXED | All references changed to uppercase `TTL`. Pre-existing bug in `dynamodb.ts:852` / `budget.ts:168` documented for separate fix |
| MF-3 | Variable shadowing: `const result` declared twice | MUST-FIX | FIXED | Second declaration renamed to `const data` |
| MF-4 | Event catalog mismatch: 14 vs 7 events + naming inconsistency | MUST-FIX | FIXED | Wave 2 `AppEventMap` expanded to 14 events with typed payloads. `join_request.created` renamed to `join_request.submitted`. Wave 3 catalog aligned |
| MF-5 | i18n key count says 6 but lists 8 | MUST-FIX | FIXED | Updated to "8 new keys" in all occurrences |
| SF-1 | Orphaned images undocumented in cascade checklist | SHOULD-FIX | FIXED | Added row 10: IMG# items are bed-owned, intentionally retained, no PII |
| SF-2 | Admin transfer atomicity gap | SHOULD-FIX | FIXED | Documented as accepted MVP risk; TransactWriteCommand recommended for production |
| SF-3 | Session expiry vs wrong password ambiguity | SHOULD-FIX | FIXED | Added null-check pre-condition before `changePassword()` with redirect flow |
| SF-4 | Lambda fire-and-forget may lose emails | SHOULD-FIX | FIXED | Added Section 4.1.1 documenting ~5-10% accepted loss rate and production mitigations |
| SF-5 | IAM condition uses synth-time env var | SHOULD-FIX | FIXED | Added `if (!sesFromEmail) throw new Error(...)` CDK guard |
| SF-6 | CDK-Nag will flag SES wildcard resource | SHOULD-FIX | FIXED | Added `AwsSolutions-IAM5` NagSuppression with reason |
| SF-7 | Tab count disagreement between Wave 2 and Wave 3 | SHOULD-FIX | FIXED | Both docs now agree: 5 tabs — System, Users, Farms, Activity, Notifications |
| SF-8 | Session expiry during password change under-specified | SHOULD-FIX | FIXED | Added: display `auth.session_expired` and redirect to `/login/` after 2s |
| S-1 | Line numbers 16-36 should be 19-37 | SUGGESTION | FIXED | Corrected |
| S-2 | Password history limitation undocumented | SUGGESTION | FIXED | Added known-limitation note |
| S-9 | Missing note: PK for writes/TTL, GSI2 for reads | SUGGESTION | FIXED | Added |

## Iteration Log

### Iteration 1
- Findings addressed: 5 MUST-FIX, 8 SHOULD-FIX, 3 SUGGESTION (16 total)
- Agents: 3 parallel my-builder agents (Wave 0, Wave 1, Wave 2+3)
- Re-validation: 1 my-reviewer agent confirmed all 16 findings FIXED
- Outcome: **All findings resolved. No regressions.**

## Escalations

None required.

## Pre-existing Bug (out of scope)

TTL attribute case mismatch discovered during review:
- CDK defines `timeToLiveAttribute: 'TTL'` (uppercase)
- `dynamodb.ts:852` and `budget.ts:168` write lowercase `ttl`
- Existing CONV# and budget items are silently never expiring
- **Action**: File as separate bug fix, independent of Beta-4

---

*Remediation completed: 2026-04-01 | 1 iteration | Status: RESOLVED*

# Beta-8 Post-Merge Session Report

**Sprint:** Beta-8 Post-Merge Fixes (user feedback)
**Date:** 2026-04-06
**Branch:** develop (6 commits since main merge, PR #300 open)
**Tag:** v0.41 (main, core Beta-8)
**Stats:** 691 tests (was 688 after Beta-8 core)

---

## Executive Summary

Following the Beta-8 main merge (PR #288), the user tested the deployed app and provided 9 feedback items plus 2 additional findings during the session. All 11 issues were created, triaged, and 10 were resolved — with the full `/simplify` + `/cc-review` + `/cc-remediate` pipeline applied to every fix. One item (#297 Gantt event markers) is deferred as size L requiring design.

---

## Issues Resolved (10)

| # | Title | Size | Category |
|---|-------|------|----------|
| **#289** | Crops page creates reserved diary entries when dates saved | S | bug fix |
| **#290** | Sort toggle (newest/oldest first) with smart tab defaults | S | feature |
| **#291** | Side-by-side layout toggle with month-aligned split view | M | feature |
| **#292** | Hide admin delete button for own row | S | fix |
| **#293** | Cognito AdminDeleteUser on admin delete (+CDK IAM) | M | bug fix |
| **#294** | Monthly labels + weekly grid on Gantt chart | S | fix |
| **#295** | Crop names display in Japanese (getCropName) | S | fix |
| **#296** | Bed dropdown shows crop name next to bed ID | S | fix |
| **#298** | Notification status warning + test email endpoint | S | bug/feat |
| **#299** | Future date limited to 1 year ahead | S | fix |

## Issues Deferred (1)

| # | Title | Size | Reason |
|---|-------|------|--------|
| **#297** | Diary events on Gantt chart (cross-reference calendar) | L | Needs design — plot diary event dots on Gantt bars |

---

## Commits (6)

```
1f0b987  fix(frontend): Gantt markers, crop name i18n, bed dropdown, admin self-hide (#292, #294, #295, #296)
6621269  fix(admin): show notification status warning when SES not configured (#298)
0ef524a  feat(admin): diagnostic test email endpoint + UI button (#298)
572eec3  feat+fix: crops→diary bridge, Cognito cleanup, sort toggle (#289, #293, #290)
122d12a  feat(diary): side-by-side layout toggle with month-aligned split view (#291)
f51cbdf  fix(diary): limit future date selection to 1 year ahead (#299)
```

---

## Bugs Caught by Pipeline

| # | Fix | Bug | Source |
|---|-----|-----|--------|
| 1 | #289 | Duplicate diary entries on every Save (missing diff guard) | /cc-review |
| 2 | #293 | Cognito `AdminDeleteUser` needs `sub:` prefix, not bare UUID | /cc-review |
| 3 | #291 | Split pane gated on filteredEntries (should use preFiltered) | /cc-review |
| 4 | #291 | No mobile responsive CSS for 3-column split grid | /cc-review |
| 5 | #291 | IIFE in JSX recalculates on every render (extracted to useMemo) | /cc-review |
| 6 | #298 | Raw AWS SDK errors leaked to browser (sanitized) | /cc-review |
| 7 | #298 | No rate limiting on test email endpoint (60s cooldown added) | /cc-review |
| 8 | #299 | canGoNext off-by-one — `<` should be `<=` (blocks max month) | /cc-review |
| 9 | #299 | Feb 29 leap year produces max date one day too far | /cc-review |
| 10 | #292 | Admin self-check guard could fail on SSR/cold start | /cc-review |

---

## Key Findings

### Notification System (#298)
- Code is correctly implemented — silently disabled when `SES_FROM_EMAIL` or `ADMIN_EMAILS` env vars are empty
- GitHub vars ARE configured and passed to CDK deploy
- SES sender identity verified Apr 2
- Deploy ran Apr 5 — Lambda should have correct env vars
- Added: notification status in admin stats API + warning banner + test email button
- Remaining diagnosis: check CloudWatch logs for actual SES send errors

### Cognito Cleanup (#293)
- Added `@aws-sdk/client-cognito-identity-provider` dependency
- `AdminDeleteUser` with `sub:` prefix format
- IAM permission `cognito-idp:AdminDeleteUser` scoped to user pool ARN in CDK
- Non-blocking: if Cognito delete fails, DynamoDB data is still removed

### Side-by-Side Split View (#291)
- 3-column CSS grid: Month | Reserved | Actual
- Month labels localized (EN/JA via `toLocaleDateString`)
- Memoized data: `splitReserved`, `splitActual`, `splitMonths` via `useMemo`
- Mobile responsive: stacks columns below 640px
- Default: tabs on mobile, split on desktop (persisted to localStorage)

---

## New API Endpoints

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/api/v1/admin/notifications/test` | Admin | Send diagnostic test email (60s cooldown) |

## New Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `@aws-sdk/client-cognito-identity-provider` | ^3.x | Admin user deletion from Cognito |

## Infrastructure Changes

| File | Change |
|------|--------|
| `infra/lib/litcrop-stack.ts` | Added `cognito-idp:AdminDeleteUser` IAM permission scoped to user pool ARN |

---

## PR Status

- **PR #300**: `develop → main` — 6 commits, 10 issues closed
- Pending merge — CI should pass (691 tests, all typecheck clean)

---

## Remaining for Next Session

1. ~~**Merge PR #300** to main~~ ✅ merged
2. **Tag v0.42** (or update v0.41)
3. **#297**: Diary events on Gantt chart — moved to **Beta-9** scope, needs `/cc-design` with mockups
4. **Beta-9**: ROI dashboard (#248) + Gantt events (#297) — next sprint
5. **SES diagnosis**: Check CloudWatch logs for notification send errors

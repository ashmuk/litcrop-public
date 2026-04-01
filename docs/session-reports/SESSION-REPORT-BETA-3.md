# Session Report: Beta-3 Infrastructure Hardening + Post-Deploy

> **Sessions**: beta3 → beta3-post (continuous)
> **Date**: 2026-04-01
> **Baseline**: v0.29 (354 tests, 8 open issues, Ops grade D)
> **Final**: v0.31 (356 tests, 9 open issues, Ops grade B-)
> **Context used**: 232k / 1000k (23%)

---

## Summary

Two-phase session delivering Beta-3 infrastructure hardening (5 waves: CDK critical fixes, security headers, monitoring, code quality, CI/docs) followed by 4 post-deploy hotfixes from live-site testing. The sprint elevated the Operations audit grade from D to B- and Security from C+ to B+. Review process caught 2 MUST-FIX CSP issues before deploy, and live testing surfaced 4 additional bugs fixed in the same session.

---

## Metrics

| Metric | Beta-3 | Post-Deploy | Total |
|--------|--------|-------------|-------|
| Commits | 2 | 6 | 8 |
| PRs merged | 1 (#211) | 4 (#212–#215) | 5 |
| Files changed | 13 | 5 | 16 |
| Lines added | +1,946 | — | +1,946 |
| Lines removed | -847 | — | -847 |
| Tests added | +2 | 0 | +2 |
| Issues created | 0 | 1 (#216) | 1 |
| Tags created | 2 (v0.30, v0.31) | — | 2 |
| MUST-FIX found | 2 | 0 | 2 |
| Review iterations | 1 | 0 | 1 |

---

## Phase 1: Beta-3 Infrastructure Hardening (v0.30)

### Scope
Address critical gaps from v0.29 executive audit — Operations grade D, Security grade C+. No new user-facing features; all infrastructure and quality improvements.

### Waves Completed

| Wave | Theme | Items | Key Changes |
|------|-------|-------|-------------|
| 0 | CDK Critical | H-01, H-02, H-06 | DynamoDB PITR, Cognito RETAIN, PriceClass_200 |
| 1 | Security | H-03, H-04 | CSP/HSTS/X-Frame-Options headers, API Gateway throttling (200 burst / 100 rps) |
| 2 | Monitoring | H-05 | 3 CloudWatch alarms (Lambda errors, 5xx, DynamoDB throttle) + SNS topic |
| 3 | Bug + Quality | F-03, G1-G4 | Admin delete test (+negative path), Plot→Bed i18n (EN+JA), timezone cleanup, chat.ts type-narrow |
| 4 | CI + Docs | H-07, H-08 | ESLint flat config + CI lint job, API-CONTRACTS.md expanded (11→35 endpoints) |

### Execution Approach
- **Parallel agents**: Wave 0 (main) + Wave 3 (background agent) + Wave 4 docs (background agent) ran concurrently
- **Code simplifier agent**: Post-implementation cleanup — DRY alarm actions, `.map()` error responses, `Duration.days(730)`
- **Review agent**: Found 2 MUST-FIX (CSP connect-src/style-src missing origins), 4 SHOULD-FIX
- **Remediation**: All 6 findings resolved in 1 iteration

### CDK Changes (infra/lib/litcrop-stack.ts)
```
+5 new resources:  ResponseHeadersPolicy, SNS Topic, 3 CloudWatch Alarms
~4 modified:       Cognito (RETAIN), DynamoDB (PITR), CloudFront (PriceClass + CSP), API Gateway (throttling)
```

### AWS Cost Impact
~$0.00–$0.20/month — all within free tier. No budget increase required.

---

## Phase 2: Post-Deploy Hotfixes (v0.31)

Live-site testing after deploy surfaced 4 bugs, all fixed in the same session.

### PR #212: CSP connect-src blocking Cognito login
- **Root cause**: CSP wildcards only work as the leftmost subdomain label. `cognito-idp.*.amazonaws.com` is invalid CSP — silently rejected by browsers.
- **Fix**: Use CDK `this.region` for explicit endpoints: `cognito-idp.ap-northeast-1.amazonaws.com`
- **Impact**: Auth was completely broken in production until this fix.

### PR #213: New Farm button hidden for manager users
- **Root cause**: Race condition — `setPreferredRole('observer')` from API fallback ran before async pending role sync completed. Also, users with zero farms had no way to create a farm if their profile had stale `observer` role.
- **Fix**: Pending role from localStorage takes precedence during first sync; zero-farm users always see the button.

### PR #214: Inconsistent role labels in Profile page
- **Root cause**: Farm card badges showed raw API values (`admin`, `manager`); member list used hardcoded English strings; Observer role was never displayed.
- **Fix**: Added i18n keys `profile.role_admin/manager/observer` (EN + JA). All role displays now use `t('profile.role_' + role)`.

### PR #215: Admin stats user count inflated (9 vs 3)
- **Root cause**: `getStats()` counted all `USER#` rows in DynamoDB (profiles + memberships), not unique users. `getAllUserProfiles()` correctly filtered to `SK = '#PROFILE'` only.
- **Fix**: Added `AND SK = :s` filter to stats query to match profile records only.

---

## Audit Grade Progress

| Area | v0.29 | v0.30/v0.31 | Delta |
|------|-------|-------------|-------|
| Architecture | B+ | B+ | — |
| API Design | B | B | — |
| Frontend UX | B | B | — |
| Security | C+ | **B+** | ▲▲ |
| Operations | **D** | **B-** | ▲▲▲ |
| Testing | C+ | C+ | — |
| Documentation | B- | **B** | ▲ |

---

## Key Learnings

### CSP Wildcard Positioning (saved to memory)
CSP host-source wildcards are only valid as the **first (leftmost) label**. Middle-wildcards like `cognito-idp.*.amazonaws.com` are silently rejected. Always use explicit region endpoints for AWS services.

### State Sync Race Conditions
When syncing state between localStorage, API, and component state, the API fallback can override localStorage values if the component sets state from the API response before the async sync completes. Solution: check localStorage first, set state optimistically, then sync to server.

### DynamoDB Single-Table Count Queries
`begins_with(PK, 'USER#')` matches ALL record types under that prefix (profiles, memberships, settings). Always include the SK filter when counting a specific entity type.

---

## Open Items

| # | Title | Status | Target |
|---|-------|--------|--------|
| #204 | Change password | OPEN | Beta-4 |
| #205 | Delete own account | OPEN | Beta-4 |
| #187 | Admin email notifications | OPEN | Beta-4 |
| #207 | Admin activity log | OPEN | Beta-4 |
| #160 | Profile picture support | OPEN | Beta-5 |
| #210 | Device config UI + API | OPEN | Beta-5 |
| #216 | Searchable crop library | OPEN | Beta-5 |
| #168 | Soft delete pattern | OPEN | PENDING |
| #183 | AI chat on all pages | OPEN | PENDING |

---

## Files Changed (16)

| File | Purpose |
|------|---------|
| `infra/lib/litcrop-stack.ts` | PITR, RETAIN, CSP, throttling, alarms, SNS |
| `docs/API-CONTRACTS.md` | Expanded 11 → 35 endpoints |
| `docs/feedback/REVIEW-FINDINGS-BETA-3.md` | Review findings (2 MUST-FIX, 4 SHOULD-FIX) |
| `docs/feedback/REMEDIATION-BETA-3.md` | Remediation report |
| `docs/planning/BETA3-READINESS.md` | Sprint plan status → COMPLETE |
| `docs/planning/BETA5-READINESS.md` | Added #216 crop library |
| `.github/workflows/pr-checks.yml` | Added ESLint lint CI job |
| `eslint.config.js` | New ESLint flat config |
| `package.json` | lint script + ESLint deps |
| `src/api/src/routes/chat.ts` | Type-narrow Anthropic SDK error |
| `src/api/src/services/dynamodb.ts` | Fix admin stats user count |
| `src/api/src/__tests__/routes/farms.test.ts` | Admin delete + negative path tests |
| `src/frontend/src/components/ProfilePage.tsx` | Role sync fix, zero-farm fix, i18n labels |
| `src/frontend/src/i18n/en.json` | Plot→Bed, role labels |
| `src/frontend/src/i18n/ja.json` | Plot→Bed, role labels |
| `packages/shared/src/timezone.ts` | Removed unused `_lat` param |

---

## Next Session: Beta-4

**Theme**: Account lifecycle + Admin experience
**Scope**: #204 (change password), #205 (delete account), #187 (email notifications), #207 (activity log)
**Estimated effort**: ~22 hours
**Prerequisite**: v0.31 deployed (current state)

---

*Session ended: 2026-04-01 | Tags: v0.30, v0.31 | Working tree: clean*

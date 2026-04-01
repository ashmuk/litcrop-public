# Session Report: Beta-1 + Beta-2 + Post-Deploy Sprint

> **Sessions**: litcrop-beta-1 → litcrop-beta-2 → beta2-post (continuous)
> **Date**: 2026-03-25 → 2026-04-01
> **Baseline**: v0.21 (docs reorg, 336 tests, 9 open issues)
> **Final**: v0.29 (Beta-2 complete, 354 tests, 7 open issues)
> **Context used**: 502k + 210k / 1000k (across 2 sessions)

---

## Summary

Three-phase sprint delivering Beta-1 (3 HIGH priority fixes), Beta-2 (24/25 items including settings sync, admin dashboard, observer onboarding, security hardening), and post-deploy hotfixes (19 PRs resolving 12+ live-testing bugs). Started with 9 open issues; ended with v0.29 tagged, Beta-3 planned, and an executive audit identifying operational hardening as the top priority.

---

## Combined Metrics

| Metric | Beta-1 | Beta-2 | Total |
|--------|--------|--------|-------|
| Commits | 7 | 22 | 29 |
| Files changed | 15 | 35 | 40 |
| Lines added | +684 | +3,270 | +3,954 |
| Lines removed | -29 | -266 | -295 |
| Tests | 336 → 336 | 336 → 345 | +9 |
| Issues resolved | 3 | 7 | 10 |
| Tags created | 1 (v0.22) | 6 (v0.23-v0.28) | 7 |
| ADRs | 0 | 1 | 1 |
| Design docs | 0 | 2 | 2 |
| MUST-FIX found | 0 | 5 | 5 |
| Bugs prevented | 0 | 6 | 6 |

---

## Phase 1: Beta-1 (v0.22)

### Scope
Resolve 3 HIGH priority issues from live testing feedback (D-01 through D-06 series).

### Pre-implementation
- Holistic `/cc-review` verified 7 of 8 UX bugs from live testing were already resolved
- Scope reduced from 10 items to 4 firm + 2 stretch

### Delivered
| # | Title | Type |
|---|-------|------|
| #178 | Rename Manage → Device (i18n, nav, aria) | Feature |
| #180 | Leave button ownership check (user_id not role) | Bug fix |
| #182 | Admin auto-assigned to all farms (assertFarmAccess bypass) | Feature |
| — | gitignore tsbuildinfo + readiness plans | Chore |

### Process
- `/simplify`: removed duplicate getCurrentUser() call
- `/cc-review`: 0 MUST-FIX, 3 SHOULD-FIX (test coverage, requiredRoles guard, synthetic membership)
- PR #184 created, merged to main, issues auto-closed
- v0.22 tagged and pushed

### Beta-1 Feedback Collected (5 items)
1. Manager can't edit farm name (#185)
2. Admin shouldn't see Leave (#186)
3. Admin email notifications (#187)
4. Observer wizard farm picker (enriched #181)
5. Show farm ID to disambiguate (#188)

→ Created issues #185-#188, updated #181, documented in REVIEW-FINDINGS-BETA-1.md

---

## Phase 2: Beta-2 (v0.23 → v0.28)

### Scope Reshuffle
- Promoted 10 security/quality items from PROD to Beta-2 (Wave 5)
- Moved 2 stretch items (#160 profile pic, #183 chat FAB) to PROD
- Added 4 new feedback items (E-series)
- Final scope: 25 items across 6 waves

### Wave Progress

| Wave | Scope | Items | Tag | Key Deliverable |
|------|-------|-------|-----|-----------------|
| Pre | Docs conflict resolution | 2/2 | v0.23 | REQUIREMENTS + ARCHITECTURE updated for multi-farm model |
| 0 | Quick wins | 7/7 | v0.24 | Farm name edit, admin Leave, farm ID, guards |
| 1 | Settings sync + tests | 3/3 | v0.25 | #90 cross-device sync + 6 admin tests |
| 5 | Security & quality | 10/10 | v0.26 | Wind cardinal, error redaction, 6 verified-fixed |
| 2 | Admin dashboard | 1/1 | v0.27 | #179 3-tab dashboard, unified admin auth |
| 3 | Observer onboarding | 1/1 | v0.28 | #181 APPLY workflow, 5 API endpoints |
| 4 | Admin notifications | 0/1 | — | #187 designed, deferred (CDK/SES) |
| **Total** | | **24/25** | | **96% complete** |

### Features Implemented

**#90 Cross-device settings sync**
- Separate `#SETTINGS` DynamoDB item (ADR-20260325)
- `GET/PATCH /me/settings` with Zod validation
- localStorage primary, API authoritative on load
- Ownership correction: locale moved from farm to user

**#179 Admin dashboard**
- 3-tab interface (System/Users/Farms) at `/admin/`
- Admin nav tab via `AdminTabInjector` (mobile) + `DesktopNav` (desktop)
- `isAdmin` cached in localStorage, derived server-side from `ADMIN_EMAILS`
- 2 new API endpoints: `GET /admin/users`, `GET /admin/farms`
- Unified admin auth: removed dual `ADMIN_USER_IDS` mechanism

**#181 Observer onboarding (APPLY workflow)**
- `JOIN_REQUEST` entity (PK=FARM#, SK=JOIN_REQUEST#, GSI1 for user queries)
- 5 new API endpoints: discoverable, join, join-requests, approve/reject, my-requests
- Atomic approval via `TransactWriteCommand` (status + membership in one transaction)
- `FarmDiscovery.tsx` — observer farm browser with "Request to Join"
- `JoinRequestList.tsx` — admin/manager approval UI in farm detail

**Quick wins (#185, #186, #188, C2, C5, S1, S2)**
- Inline farm name editing with pencil icon
- System admin never sees Leave button
- Farm ID shown for disambiguation
- requiredRoles guard for admin bypass
- Null guard on currentUser
- plots/view.astro flash fix

### Security & Quality (Wave 5)
- Q8: Wind degrees → 16-point cardinal direction
- S7: LLM error log redaction documented
- S5: In-memory rate limiter limitation documented
- 6 items verified already fixed in prior sessions (S4, S8, Q4-Q6, Q9)

---

## Pipeline Compliance

| Wave | /simplify | /cc-review | Tests | Critical Finding |
|------|-----------|-----------|-------|-----------------|
| Beta-1 | Dedup getCurrentUser | 3 SHOULD-FIX | 336 | — |
| Pre | N/A (docs) | 12 stale refs found | 336 | Stale Field/Plot references |
| Wave 0 | 3 helpers extracted | 1 SHOULD-FIX | 336 | **Click propagation bug** |
| Wave 1 | 4 type improvements | 4 SHOULD-FIX | 342 | **Race condition + empty body** |
| Wave 5 | N/A (small) | 2 SUGGESTION | 342 | NaN fallback |
| Wave 2 | 4 refactors | 2 MUST-FIX + 4 SHOULD-FIX | 345 | **Dual admin auth drift** |
| Wave 3 | — | 3 MUST-FIX + 2 SHOULD-FIX | 345 | **Undefined function + missing limit** |

### Bugs Prevented by Review Pipeline
1. **Click propagation** (W0) — form clicks toggled farm detail panel
2. **Race condition** (W1) — API fetch overwrote user's in-flight setting change
3. **Empty body** (W1) — PATCH /settings accepted `{}`, pointless DB write
4. **Dual admin auth** (W2) — ADMIN_USER_IDS vs ADMIN_EMAILS configuration drift
5. **Undefined function** (W3) — `membershipTransactItems` didn't exist, approval would crash
6. **Missing limit check** (W3) — approval could exceed FREE_PLAN_MAX_MEMBERSHIPS

---

## Architectural Decisions

### Unified Admin Identity (Wave 2)
- **Before**: `ADMIN_USER_IDS` (Cognito sub) for admin routes + `ADMIN_EMAILS` for isAdmin flag
- **After**: Single `ADMIN_EMAILS` via `getAuthContext().isAdmin` everywhere
- **Impact**: Eliminated configuration drift risk between two env vars

### Settings Sync (ADR-20260325)
- **Decision**: Separate `#SETTINGS` DynamoDB item (Option B) over merging into `#PROFILE` (Option A)
- **Key fix**: `applyLocale()` was syncing to farm record — corrected to user settings

### Observer Data Model (Wave 3)
- **Decision**: `JOIN_REQUEST` entity with GSI1 dual-use (reuses existing GSI1 index)
- **Key pattern**: `TransactWriteCommand` for atomic approval (status update + membership creation)

---

## Tag History

| Tag | Milestone | Date |
|-----|-----------|------|
| v0.22 | Beta-1 release | 2026-03-25 |
| v0.23 | Beta-2 Pre (docs) | 2026-03-25 |
| v0.24 | Beta-2 Wave 0 (quick wins) | 2026-03-25 |
| v0.25 | Beta-2 Wave 1 (settings) | 2026-03-25 |
| v0.26 | Beta-2 Wave 5 (security) | 2026-03-25 |
| v0.27 | Beta-2 Wave 2 (dashboard) | 2026-03-25 |
| v0.28 | Beta-2 Wave 3 (onboarding) | 2026-03-25 |

---

## Issue Lifecycle

### Closed This Session (will close on merge)
| # | Title | Closed by |
|---|-------|-----------|
| #178 | Rename Manage → Device | PR #184 (Beta-1) |
| #180 | Leave button ownership | PR #184 (Beta-1) |
| #182 | Admin auto-assign | PR #184 (Beta-1) |
| #90 | Settings sync | v0.25 commit |
| #179 | Admin dashboard | v0.27 commit |
| #181 | Observer onboarding | v0.28 commit |
| #185 | Edit farm name | v0.24 commit |
| #186 | Admin never sees Leave | v0.24 commit |
| #188 | Farm ID display | v0.24 commit |

### Created This Session
| # | Title | Source |
|---|-------|--------|
| #185 | E-01: Manager edit farm name | Beta-1 feedback |
| #186 | E-02: Admin Leave button | Beta-1 feedback |
| #187 | E-03: Admin email notifications | Beta-1 feedback |
| #188 | E-04: Farm ID display | Beta-1 feedback |

### Remaining Open (at end of Beta-1+2 sprint)
| # | Title | Target |
|---|-------|--------|
| #187 | Admin email notifications | Beta-3 |
| #183 | AI chat on all pages | PENDING |
| #168 | Soft delete for farm deletion | PENDING |
| #160 | Profile picture support | Beta-3 |

---

## Phase 3: Post-Deploy Hotfixes (v0.28 → v0.29)

> Session: beta2-post | Date: 2026-03-27 → 2026-04-01

### Summary
19 PRs (#190–#208) resolving 12+ live-testing bugs found after Beta-2 deployment. Culminated in v0.29 tag and Beta-3 sprint planning.

### Metrics

| Metric | Value |
|--------|-------|
| PRs merged | 19 (#190–#208) |
| Commits on main | 61 since v0.28 |
| Tests | 345 → 354 (+9 new settings tests) |
| Issues created | 4 (#204, #205, #207, #208) |
| Bugs fixed | 12+ (F-01 through F-12, New Farm button) |
| Review rounds | 6 (live testing feedback) |

### Key Fixes

| PR | Fix | Severity |
|----|-----|----------|
| #190 | F-01/F-02/F-03: Settings overwrite, admin tab race, admin delete bypass | HIGH |
| #191 | F-04: Clear localStorage on signout + event-based admin tab | HIGH |
| #192 | F-08: Nav labels update immediately on locale change | MEDIUM |
| #193-#199 | F-07 to F-12: Observer routing, New Farm hide, deep i18n fixes | mixed |
| #200-#201 | Settings sync — stale guard removal, error logging | HIGH |
| #202 | **Settings PATCH 500** — DynamoDB unused ExpressionAttributeValues | HIGH |
| #203 | **Settings sync on every page load** via AuthGuard | HIGH |
| #206 | New Farm button shown when user has zero farms | MEDIUM |
| #208 | New Farm button hidden for observer-only users | MEDIUM |

### Root Causes Identified and Fixed

1. **Settings PATCH 500** (PR #202) — `upsertUserSettings` built all `:default_*` ExpressionAttributeValues upfront then conditionally replaced expressions, leaving orphaned keys that DynamoDB rejects. Refactored to conditional-build loop.

2. **Settings not reflecting until Profile visit** (PR #203) — `getMySettings()` was only called in ProfilePage. Moved to AuthGuard with change-detection guards, input validation against THEME_OPTIONS/LOCALE_OPTIONS, and conditional event dispatch.

3. **New Farm button logic** (PRs #206, #208) — `isObserverOnly` guard used `preferredRole !== 'manager'` which hid the button during profile loading (null state) and for users without preferred_role set. Refactored to role-based check: `preferredRole !== 'manager' && !isSystemAdmin && !hasManagerRole`.

### Issues Created This Session
| # | Title | Scope |
|---|-------|-------|
| #204 | Change password from Profile page | Beta-3 |
| #205 | Delete own account from Profile page | Beta-3 |
| #207 | Admin activity log monitor with filtering | Backlog |

### Deliverables
- v0.29 tag on develop
- Beta-3 sprint planning (`docs/planning/BETA3-READINESS.md`)
- Executive audit report (`docs/reports/AUDIT-REPORT-v0.29.md`)
- Review findings for settings fix and AuthGuard changes

### Open Issues (post-session)
| # | Title | Target |
|---|-------|--------|
| F-03 | Admin delete farm bypass | Beta-3 Wave 0 |
| #204 | Change password | Beta-3 Wave 1 |
| #205 | Delete own account | Beta-3 Wave 2 |
| #187 | Admin email notifications | Beta-3 Wave 3 |
| #160 | Profile picture support | Beta-3 Wave 4 |
| #207 | Admin activity log | Backlog |
| #168 | Soft delete | PENDING |
| #183 | AI chat on all pages | PENDING |

---

## Lessons Learned

1. **Holistic review before implementation saves effort** — 7 of 8 UX bugs were already fixed. Verifying first prevented re-implementing solved problems.

2. **Design docs for L-sized features prevent scope creep** — 697 + 656 line design docs for #179 and #181 caught edge cases (N+1 queries, GSI reuse, race conditions) before code was written.

3. **The review pipeline catches real bugs every time** — 6 bugs prevented across 6 waves. Most critical: a build-breaking undefined function that would have crashed production.

4. **Per-wave tagging enables precise rollback** — 7 tags give fine-grained deploy points. If observer onboarding has issues, admin dashboard is independently deployable.

5. **Documentation debt compounds faster than code debt** — REQUIREMENTS.md had 12+ stale references. Fixing them early prevented /cc-design from building on false assumptions.

6. **Unified mechanisms prevent drift** — the dual ADMIN_USER_IDS/ADMIN_EMAILS was a configuration land mine caught by review. Single source of truth (ADMIN_EMAILS) eliminated an entire class of support issues.

7. **DynamoDB expression building is strict** — Unlike SQL, DynamoDB rejects unused ExpressionAttributeValues. Dynamic UpdateExpression construction must ensure 1:1 correspondence between placeholders and values. The settings PATCH 500 (PR #202) was caused by this exact issue.

8. **Feature work outpaces operational readiness** — The v0.29 audit revealed the application layer is B+ but operations is D. No backups, no alarms, no CSP. Hardening should precede feature sprints to avoid building on a fragile foundation.

9. **Live testing finds what unit tests miss** — 12 bugs found in 6 rounds of post-deploy testing, none caught by 345 unit tests. The gap is zero frontend tests and zero E2E tests — the entire UI layer is untested.

---

*Updated: 2026-04-01 | Sessions: litcrop-beta-1 + litcrop-beta-2 + beta2-post | Model: Claude Opus 4.6 (1M context)*

# Session Report: Beta-4 Account Lifecycle & Admin Experience

> **Session**: beta4
> **Date**: 2026-04-01
> **Baseline**: v0.31 (356 tests, 9 open issues)
> **Final**: v0.32 (439 tests, 5 open issues — 4 closed by this sprint)
> **Context used**: 279k / 1000k (28%)

---

## Summary

Single-session sprint delivering Beta-4: full account control for users (change password, delete account) and full visibility for admins (email notifications, activity log). Design-first approach with parallel agents for design, implementation, review, and remediation. The TypedEventEmitter pattern created in Wave 2 became the architectural keystone — Wave 3 plugged into it with zero changes to existing routes. Review process caught 21 findings across design + implementation reviews, all resolved. A pre-existing TTL bug was discovered and fixed during the review cycle.

---

## Metrics

| Metric | Value |
|--------|-------|
| Commits | 8 (4 features, 1 docs, 3 fixes) |
| PRs merged | 3 (#217, #218, #219) |
| Files changed | 40 |
| Lines added | +8,007 |
| Lines removed | -302 |
| Tests added | +83 (356 → 439) |
| Test files added | +8 (16 → 24) |
| Issues closed | 4 (#204, #205, #187, #207) |
| Tags created | 1 (v0.32) |
| Design docs created | 4 + 1 ADR |
| MUST-FIX found (design) | 5 — all resolved in 1 iteration |
| MUST-FIX found (implementation) | 0 |
| Review iterations | 4 (1 design, 3 implementation waves) |
| New services | 3 (events.ts, notification.ts, activity.ts) |
| New API endpoints | 3 (DELETE /me, GET/PATCH /me/notification-preferences, GET /admin/activity) |
| AdminDashboard tabs | 3 → 5 (+Activity, +Notifications) |

---

## Architecture Delivered

### TypedEventEmitter (Shared Foundation)

```
Route handlers ──emit──► appEvents ──subscribe──► Notification Service (SES)
                                    ──subscribe──► Activity Service (DynamoDB)
```

14 typed events with payloads. Routes emit once; both services consume independently. Open for extension (new subscribers), closed for modification (routes don't change).

### DynamoDB Activity Log Design

```
Write path:  PK = ACTIVITY#{YYYY-MM}  /  SK = {timestamp}#{eventId}
Read path:   GSI2PK = ACTIVITY#ALL    /  GSI2SK = {timestamp}#{eventId}
Farm scope:  GSI2PK = ACTIVITY#FARM#{farmId}
TTL:         90 days (uppercase TTL, matching CDK definition)
```

Dual-write pattern: each farm-scoped event produces two items (global + farm-scoped) for efficient queries without scan filters.

---

## Waves Completed

| Wave | Issue | Theme | Effort | Key Changes |
|------|-------|-------|--------|-------------|
| 0 | #204 | Change Password | ~3h | Cognito AccessToken storage fix, shared PasswordStrengthIndicator, collapsible ChangePasswordSection on ProfilePage |
| 1 | #205 | Delete Account | ~6h | DELETE /api/v1/me with cascade (sole-member delete, admin transfer, non-admin leave), danger-zone UI with typed confirmation |
| 2 | #187 | Email Notifications | ~5h | TypedEventEmitter, SES notification service, notification preferences CRUD, Notifications tab on AdminDashboard |
| 3 | #207 | Activity Log | ~8h | ACTIVITY# entity with GSI2 dual-write, 14 event subscriptions, filterable Activity tab with pagination |

---

## Execution Approach

### Design Phase (Parallel)
- 1 Explore agent mapped the entire codebase (auth, ProfilePage, AdminDashboard, DynamoDB schema, CDK, i18n, routes, services, tests)
- 4 design agents ran in parallel (1 per wave): my-designer for Wave 0, my-architect for Waves 1-3
- Produced 4 design docs + 1 ADR (3,065 lines total)
- Design review: 3 parallel reviewer agents found 5 MUST-FIX, 8 SHOULD-FIX, 9 SUGGESTION
- Remediation: 3 parallel builder agents fixed all 16 findings in 1 iteration

### Implementation Phase (Sequential per wave)
Each wave followed the same cycle:
1. **Implement** — my-builder agent with full design doc context
2. **Simplify** — code-simplifier agents (3 parallel: reuse, quality, efficiency)
3. **Review** — my-reviewer agent validates against design doc + security checklist
4. **Remediate** — my-builder fixes any SHOULD-FIX findings
5. **Commit** — conventional commit with issue reference

### Key Discovery: AccessToken Gap
Wave 0 design review found that `auth.ts` discarded the Cognito AccessToken after sign-in, storing only the IdToken. Both `ChangePassword` and `DeleteUser` Cognito actions require the real AccessToken. The fix (storing both tokens) became a prerequisite for both Wave 0 and Wave 1.

### Pre-existing Bug: TTL Case Mismatch
Review discovered that `dynamodb.ts` and `budget.ts` wrote lowercase `ttl` but CDK defines `timeToLiveAttribute: 'TTL'` (uppercase). DynamoDB TTL matching is case-sensitive — items with lowercase `ttl` were silently never expiring. Fixed for new writes; old items persist at negligible cost.

---

## CDK Changes (infra/lib/litcrop-stack.ts)

```
+1 new policy:  SES SendEmail/SendRawEmail with FromAddress condition
+2 env vars:    SES_FROM_EMAIL, SES_REGION
+1 suppression: AwsSolutions-IAM5 for SES wildcard resource
```

### AWS Cost Impact
~$0.00–$0.10/month — SES sandbox (200 emails/day free), ACTIVITY# items negligible at MVP volume. Well within $5 ceiling ($1.18 target).

---

## Review Cycle Summary

### Design Review
| Severity | Found | Resolved |
|----------|-------|----------|
| MUST-FIX | 5 | 5 (1 iteration) |
| SHOULD-FIX | 8 | 8 |
| SUGGESTION | 9 | 3 addressed |

Notable MUST-FIX: TTL case mismatch, event catalog misalignment (14 vs 7 events), cross-wave prerequisite dependency.

### Implementation Reviews (Wave 0+1, Wave 3)
| Severity | Found | Resolved |
|----------|-------|----------|
| MUST-FIX | 0 | — |
| SHOULD-FIX | 6 | 6 |
| SUGGESTION | 7 | 4 addressed |

Notable SHOULD-FIX: empty `actor_email` in event emissions, cursor validation for defense-in-depth, pagination edge case with free-text filter.

### CI Fixes (Post-merge)
- ESLint: `Function` type → `AnyListener` (1 error)
- TypeScript: generic variance in EventEmitter, test type assertions (20 errors)

---

## Key Learnings

### TypedEventEmitter as Architectural Keystone
The in-process event bus created for Wave 2 (notifications) enabled Wave 3 (activity log) to subscribe to the same events with zero changes to route code. This Observer pattern is the right abstraction at current scale; at production scale, consider migrating to EventBridge for cross-service communication.

### Design-First Catches Bugs Cheaper
The design review caught 5 MUST-FIX issues (TTL mismatch, event catalog misalignment, AccessToken gap) that would have been runtime bugs. Fixing them in markdown was dramatically cheaper than debugging in production.

### Lambda Fire-and-Forget Caveat
The `Promise.resolve().then()` pattern for fire-and-forget SES calls means ~5-10% of emails may be lost if Lambda freezes the execution context before the microtask completes. Documented as accepted risk; production mitigation: await the SES call or use SNS.

### Generic Variance in TypeScript Event Systems
Storing typed listeners in a `Map<string, Set<Listener<T>>>` hits TypeScript's generic contravariance rules. The solution: use a broad internal type (`AnyListener`) with casts on `add`/`delete`, keeping the public API fully type-safe via generics.

---

## Open Items

| # | Title | Status | Target |
|---|-------|--------|--------|
| #160 | Profile picture support | OPEN | Beta-5 |
| #210 | Device config UI + API | OPEN | Beta-5 |
| #216 | Searchable crop library | OPEN | Beta-5 |
| #168 | Soft delete pattern | OPEN | PENDING |
| #183 | AI chat on all pages | OPEN | PENDING |

### Deferred from Beta-4
- Farm warning member count: mitigated with combined warning text; full fix needs `member_count` in farm list API
- Farm name denormalization in activity events: shows `farm_id` fallback
- SES sandbox → production transition: manual verification step, deferred to deploy

---

## Files Changed (40)

### New Files (12)
| File | Purpose |
|------|---------|
| `src/api/src/services/events.ts` | TypedEventEmitter with 14 event types |
| `src/api/src/services/notification.ts` | SES email notification service |
| `src/api/src/services/activity.ts` | Activity log DynamoDB writer + query |
| `src/frontend/src/components/PasswordStrengthIndicator.tsx` | Shared password strength component |
| `src/frontend/src/__tests__/auth.test.ts` | Auth function tests (15 tests) |
| `src/api/src/__tests__/services/events.test.ts` | Event emitter tests (7 tests) |
| `src/api/src/__tests__/services/notification.test.ts` | Notification service tests (10 tests) |
| `src/api/src/__tests__/services/activity.test.ts` | Activity service tests (15 tests) |
| `docs/designs/BETA4-CHANGE-PASSWORD.md` | Wave 0 design doc |
| `docs/designs/BETA4-DELETE-ACCOUNT.md` | Wave 1 design doc |
| `docs/designs/BETA4-EMAIL-NOTIFICATIONS.md` | Wave 2 design doc |
| `docs/designs/BETA4-ACTIVITY-LOG.md` | Wave 3 design doc |

### Modified Files (28)
| File | Purpose |
|------|---------|
| `src/frontend/src/lib/auth.ts` | AccessToken storage, changePassword, deleteCurrentUser |
| `src/frontend/src/components/ProfilePage.tsx` | ChangePasswordSection, DeleteAccountSection |
| `src/frontend/src/components/RegisterForm.tsx` | Import shared PasswordStrengthIndicator |
| `src/frontend/src/components/AdminDashboard.tsx` | +Activity tab, +Notifications tab (3 → 5 tabs) |
| `src/frontend/src/lib/api.ts` | +deleteMyAccount, +getAdminActivities, +notification prefs |
| `src/frontend/src/i18n/en.json` | +50 keys (password, delete, notifications, activity) |
| `src/frontend/src/i18n/ja.json` | +50 keys (Japanese translations) |
| `src/api/src/services/dynamodb.ts` | +deleteAccount cascade, +updateMemberRole, +notification prefs, TTL fix |
| `src/api/src/services/budget.ts` | TTL case fix (ttl → TTL) |
| `src/api/src/routes/me.ts` | +DELETE /me, +notification prefs, +event emissions |
| `src/api/src/routes/farms.ts` | +event emissions (farm CRUD, join requests, members) |
| `src/api/src/routes/beds.ts` | +event emissions (bed update, image upload) |
| `src/api/src/routes/images.ts` | +event emissions (tag created) |
| `src/api/src/routes/admin.ts` | +GET /admin/activity |
| `src/api/src/app.ts` | +notification and activity service imports |
| `infra/lib/litcrop-stack.ts` | +SES IAM policy, +env vars, +NagSuppression |
| `packages/shared/src/constants.ts` | +ACTIVITY prefix, +ACTIVITY_TTL_DAYS |
| `src/api/src/__tests__/routes/me.test.ts` | +DELETE /me tests, +notification prefs tests |
| `src/api/src/__tests__/routes/admin.test.ts` | +GET /admin/activity tests |
| `src/api/src/__tests__/routes/farms.test.ts` | +event emission tests |
| `src/api/src/__tests__/services/dynamodb.test.ts` | +deleteAccount cascade tests |
| `docs/decisions/ADR-20260401-notification-architecture.md` | Notification architecture ADR |
| `docs/planning/beta4-dashboard.html` | Visual strategy dashboard |
| `docs/feedback/REVIEW-FINDINGS.md` | Review findings |
| `docs/feedback/REMEDIATION.md` | Remediation report |

---

*Session completed: 2026-04-01 | v0.31 → v0.32 | 8 commits | 4 issues closed*

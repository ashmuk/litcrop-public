# BETA4-READINESS.md — Beta-4 Sprint Planning (Account Lifecycle + Admin)

> Date: 2026-04-01 | Status: **PLANNED** (blocked on Beta-3 completion)
> Prerequisite: v0.30 (Beta-3 — infrastructure hardening complete)
> Target: v0.31 (Beta-4 release)
> Theme: **Account lifecycle and admin experience completion**

---

## Purpose

Beta-4 delivers **full account control for users and full visibility for admins**. Users can change passwords, delete accounts, and manage their identity. Admins get email notifications and a complete activity log of platform operations.

---

## 1. Prerequisite State (Beta-3 complete)

| Item | Value |
|------|-------|
| Tag | v0.30 (Beta-3) on develop |
| Infra | PITR on, Cognito RETAIN, CSP active, rate limiting, alarms |
| Audit Grade | Arch B+, Security B+, Ops B-, Docs B |
| Open Feature Issues | #204, #205, #187, #207, #160, #210 |

---

## 2. Beta-4 Scope (4 items)

### Account Lifecycle

| # | Title | Size | Area | Rationale |
|---|-------|------|------|-----------|
| #204 | Change password from Profile page | S | frontend | Basic auth UX — users expect this |
| #205 | Delete own account from Profile page | L | full-stack | Privacy/compliance, user autonomy |

### Admin Experience

| # | Title | Size | Area | Rationale |
|---|-------|------|------|-----------|
| #187 | Admin email notifications (SES/SNS) | L | api/infra | Awareness of platform activity |
| #207 | Admin activity log with filtering | L | full-stack | Full visibility into all user operations |

### Deferred to Beta-5

| # | Title | Target |
|---|-------|--------|
| #160 | Profile picture support | Beta-5 |
| #210 | Device configuration UI and API | Beta-5 |
| R-01 | DELETE /beds/:bedId endpoint | Beta-5 |
| R-02 | DELETE /images/:imageId endpoint | Beta-5 |

### PENDING (not scoped)

| # | Title |
|---|-------|
| #168 | Soft delete for farm deletion |
| #183 | AI chat on all pages |

---

## 3. Implementation Waves

### Wave 0 — Change Password (~3 hrs)

No backend needed — direct Cognito call from frontend.

| Step | What to Do |
|------|------------|
| 0.1 | **Frontend (auth.ts)**: Add `changePassword(oldPassword, newPassword)` using Cognito `ChangePassword` action |
| 0.2 | **Frontend (ProfilePage)**: Add collapsible "Change Password" section with current/new/confirm fields |
| 0.3 | **Frontend**: Extract password strength indicator from RegisterForm into shared component |
| 0.4 | **i18n**: Add EN/JA translations for change password UI |
| 0.5 | **Tests**: Validation and error state tests |

### Wave 1 — Delete Own Account (~6 hrs)

| Step | What to Do |
|------|------------|
| 1.1 | **API**: Add `DELETE /api/v1/me` endpoint |
| 1.2 | **API**: Remove all USER# items (profile, settings, join requests) |
| 1.3 | **API**: Remove FARM_MEMBER# / MEMBER# records from all farms user belongs to |
| 1.4 | **API**: Handle owned farms — transfer to next admin/manager, or delete if sole member |
| 1.5 | **Frontend (auth.ts)**: Add `deleteMyAccount()` — call API cleanup then Cognito `DeleteUser` |
| 1.6 | **Frontend (ProfilePage)**: Danger-zone "Delete Account" section with typed confirmation |
| 1.7 | **i18n**: EN/JA translations for warnings, owned-farms notice, confirmation |
| 1.8 | **Tests**: API tests for cascade cleanup + frontend validation tests |

### Wave 2 — Admin Email Notifications (~5 hrs)

| Step | What to Do |
|------|------------|
| 2.1 | **CDK**: Add SES verified identity + SNS topic for admin notifications |
| 2.2 | **API**: Add `services/notification.ts` — send emails on key events |
| 2.3 | **Events**: New user signup, farm creation/deletion, join request submitted/approved, account deletion |
| 2.4 | **API**: Admin notification preferences — opt-in/out per event type in DynamoDB |
| 2.5 | **Frontend (AdminDashboard)**: Notification preferences UI in Settings tab |
| 2.6 | **Tests**: Notification service unit tests (mock SES) |

### Wave 3 — Activity Log (~8 hrs)

Depends on Wave 2 notification service (reuses the event-capture layer).

| Step | What to Do |
|------|------------|
| 3.1 | **Design decision (ADR)**: Event storage — DynamoDB `ACTIVITY#` entity vs CloudWatch Logs vs hybrid |
| 3.2 | **API**: Add `services/activity.ts` — record events on every mutating operation |
| 3.3 | **API**: Add `GET /api/v1/admin/activity` — paginated, filterable (date range, event type, user, farm) |
| 3.4 | **DynamoDB**: `ACTIVITY#` entity with GSI for time-range queries |
| 3.5 | **Frontend (AdminDashboard)**: New "Activity" tab with filter controls and log table |
| 3.6 | **Filters**: Date range picker, event type dropdown, user search, farm search, free-text |
| 3.7 | **i18n**: EN/JA translations for event descriptions and filter labels |
| 3.8 | **Tests**: Activity service + API endpoint tests |

---

## 4. Dependency Graph

```
#204 (change password) ───────────────────────► standalone
#205 (delete account) ────────────────────────► standalone
#187 (email notifications) ───────────────────► foundation for #207
#207 (activity log) ───── depends on ─────────► #187 event-capture layer
```

Wave 0 and Wave 1 are independent. Wave 3 depends on Wave 2.

---

## 5. Estimated Effort

| Wave | Items | Estimate |
|------|-------|----------|
| Wave 0 | #204 (change password) | ~3 hrs |
| Wave 1 | #205 (delete account) | ~6 hrs |
| Wave 2 | #187 (email notifications) | ~5 hrs |
| Wave 3 | #207 (activity log) | ~8 hrs |
| **Total** | | **~22 hrs** |

---

## 6. AWS Cost Impact Analysis

**Constraint**: Monthly cost must not exceed ~$1.18/month ($5/month ceiling). Hard-stop review required for any increase.

| Item | Service | Cost Impact | Notes |
|------|---------|-------------|-------|
| #204 Change password | Cognito | $0.00 | Client-side Cognito call, no infra change |
| #205 Delete account | Cognito + DynamoDB | $0.00 | Delete operations, no storage increase |
| #187 SES identity | SES | $0.00 sandbox / $0.10 per 1000 emails (production) | Sandbox: 200 emails/day free. **Review needed if moving to production SES.** |
| #187 SNS topic | SNS | $0.00 | Reuses Beta-3 SNS topic if created, or new (free tier) |
| #207 Activity log | DynamoDB | +$0.00–$0.05/month | ACTIVITY# items are small (~200 bytes). At 1000 events/month ≈ 200KB. Negligible write/storage cost. |
| #207 Activity GSI | DynamoDB | $0.00 | PAY_PER_REQUEST — no cost for provisioned capacity. GSI storage cost negligible at this scale. |
| **Total** | | **~$0.00–$0.10/month** | Within $5 ceiling |

**Watch item**: SES production access requires AWS support request and moves from sandbox (200/day free) to production pricing ($0.10/1000). At expected volume (<50 emails/month), cost is negligible but the transition needs a review checkpoint.

---

## 7. Design Documentation (required before implementation)

Each wave must have design artifacts reviewed before coding begins:

### Wave 0 — Change Password
- [ ] **UX wireframe**: ProfilePage change password section layout (collapsible, fields, strength indicator)
- [ ] No API or data model changes

### Wave 1 — Delete Account
- [ ] **ADR**: Account deletion strategy — hard delete vs soft delete, owned-farm handling policy
- [ ] **Sequence diagram**: Delete account flow (frontend → API → DynamoDB cascade → Cognito delete → signout)
- [ ] **Data model**: List all DynamoDB items to delete per user (USER#/PROFILE, USER#/SETTINGS, FARM_MEMBER#, MEMBER#, JOIN_REQUEST#)
- [ ] **API contract**: `DELETE /api/v1/me` request/response spec

### Wave 2 — Email Notifications
- [ ] **ADR**: Notification architecture — SES direct vs SNS fan-out vs EventBridge
- [ ] **Event catalog**: All events that trigger notifications (signup, farm CRUD, join requests, account deletion)
- [ ] **CDK diagram**: SES identity + SNS topic + Lambda integration
- [ ] **API contract**: Notification preferences endpoint spec

### Wave 3 — Activity Log
- [ ] **ADR**: Activity storage — DynamoDB ACTIVITY# entity vs CloudWatch Logs Insights
- [ ] **Data model**: ACTIVITY# entity schema (PK, SK, GSI, attributes, TTL for retention)
- [ ] **API contract**: `GET /api/v1/admin/activity` with filter params
- [ ] **UX wireframe**: Activity tab layout (filter bar, log table, pagination)

All design docs stored under `docs/designs/` with sprint prefix (e.g., `BETA4-DELETE-ACCOUNT.md`).

---

## 8. Exit Criteria

- [ ] Users can change their own password from Profile
- [ ] Users can delete their own account (with owned-farm handling)
- [ ] Admin receives email notifications for key platform events
- [ ] Admin can view and filter activity log on dashboard
- [ ] No MUST-FIX findings from cc-review
- [ ] All existing tests pass + new test coverage (target: 400+)
- [ ] Deployed and manually verified
- [ ] Tagged as v0.31 on develop

---

*Created: 2026-04-01 | Prerequisite: Beta-3 (v0.30) infrastructure hardening*

# BETA3-READINESS.md — Beta-3 Sprint Planning

> Date: 2026-04-01 | Status: **PLANNED**
> Prerequisite: Beta-2 (v0.28) merged + post-deploy hotfixes (v0.29 pending)
> Target: v0.3x (Beta-3 release)

---

## Purpose

Beta-3 delivers **account lifecycle management, admin workflow completion, and user personalization** — the features that transform LitCrop from a demo into a product users control.

---

## 1. Prerequisite State (Beta-2 complete)

| Item | Value |
|------|-------|
| Tag | v0.28 (Beta-2) → v0.29 (hotfixes) pending |
| Tests | 354 passing (20 files) |
| Open Issues | 7 (5 Beta-3 scope, 2 PENDING) |
| Post-deploy hotfixes | 19 PRs (#190–#208), 61 commits since v0.28 |
| Resolved in hotfixes | F-01 settings sync, F-02 admin tab, F-04–F-12 i18n/observer/UX |

---

## 2. Beta-3 Scope (6 items)

### From Beta-2 carry-over

| # | Title | Size | Area |
|---|-------|------|------|
| F-03 | Admin delete farm bypass (isAdmin on DELETE route) | S | api |

### New features

| # | Title | Size | Area |
|---|-------|------|------|
| #204 | Change password from Profile page | S | frontend |
| #205 | Delete own account from Profile page | L | full-stack |
| #187 | Admin email notifications (SES/SNS) | L | api/infra |
| #160 | Profile picture support | M | full-stack |

### Code quality / debt

| ID | Title | Size | Area |
|----|-------|------|------|
| G1-G2 | i18n "Plot" → "Bed" terminology cleanup | S | frontend |

### Deferred to PENDING (not in Beta-3)

| # | Title | Reason |
|---|-------|--------|
| #168 | Soft delete for farm deletion | PENDING — user decision, not scoped to any milestone |
| #183 | AI chat on all pages | PENDING — user decision, not scoped to any milestone |
| #207 | Admin activity log monitor | Deferred to Prod — significant feature, not blocking |

---

## 3. Implementation Waves

### Wave 0 — Quick Wins (~1 hr)

| Order | Item | What to Do |
|-------|------|------------|
| 0.1 | F-03 | Pass `isAdmin` to `assertFarmAccess` in DELETE /farms/:farmId route |
| 0.2 | G1-G2 | Rename `add_plot.*` and `plot_detail` i18n keys to Bed terminology (en.json + ja.json) |

### Wave 1 — Change Password (~3 hrs)

| Step | What to Do |
|------|------------|
| 1.1 | **Frontend (auth.ts)**: Add `changePassword(oldPassword, newPassword)` using Cognito `ChangePassword` action |
| 1.2 | **Frontend (ProfilePage)**: Add collapsible "Change Password" section with current/new/confirm fields |
| 1.3 | **Frontend**: Reuse existing password strength indicator from RegisterForm |
| 1.4 | **i18n**: Add EN/JA translations for change password UI |
| 1.5 | **Tests**: Frontend component tests for validation and error states |

### Wave 2 — Delete Own Account (~6 hrs)

| Step | What to Do |
|------|------------|
| 2.1 | **API**: Add `DELETE /api/v1/me` endpoint — remove USER# items (profile, settings, join requests) |
| 2.2 | **API**: Remove FARM_MEMBER# / MEMBER# records from all farms user belongs to |
| 2.3 | **API**: Handle owned farms — transfer to next admin/manager or delete if sole member |
| 2.4 | **Frontend (auth.ts)**: Add `deleteMyAccount()` calling Cognito `DeleteUser` after API cleanup |
| 2.5 | **Frontend (ProfilePage)**: Add danger-zone "Delete Account" section with confirmation |
| 2.6 | **i18n**: Add EN/JA translations for warnings and confirmation |
| 2.7 | **Tests**: API + frontend tests for account deletion flow |

### Wave 3 — Admin Email Notifications (~5 hrs)

| Step | What to Do |
|------|------------|
| 3.1 | **CDK**: Add SES identity + SNS topic for admin notifications |
| 3.2 | **API**: Add notification service — send emails on: new user signup, farm creation/deletion, join request |
| 3.3 | **API**: Add admin notification preferences (opt-in/out per event type) |
| 3.4 | **Tests**: Notification service unit tests |

### Wave 4 — Profile Picture (~4 hrs)

| Step | What to Do |
|------|------------|
| 4.1 | **API**: Add `POST /api/v1/me/avatar` — upload to S3 with user-scoped key |
| 4.2 | **API**: Add `avatar_url` to profile response |
| 4.3 | **Frontend**: Add avatar upload/display to ProfilePage |
| 4.4 | **Frontend**: Show avatars in farm member lists and admin dashboard |
| 4.5 | **Tests**: Upload validation, signed URL generation |

---

## 4. Dependency Graph

```
F-03 ──────────────────────────► standalone (Wave 0)
#204 (change password) ────────► standalone (Wave 1)
#205 (delete account) ─────────► standalone (Wave 2)
#187 (email notifications) ────► standalone (Wave 3)
#160 (profile picture) ────────► standalone (Wave 4)
G1-G2 (i18n cleanup) ─────────► standalone (Wave 0)
```

No inter-wave dependencies — waves can be reordered if needed.

---

## 5. Estimated Effort

| Wave | Items | Estimate |
|------|-------|----------|
| Wave 0 | F-03, G1-G2 | ~1 hr |
| Wave 1 | #204 | ~3 hrs |
| Wave 2 | #205 | ~6 hrs |
| Wave 3 | #187 | ~5 hrs |
| Wave 4 | #160 | ~4 hrs |
| **Total** | | **~19 hrs** |

---

## 6. Exit Criteria

- [ ] All 6 items implemented and tested
- [ ] No MUST-FIX findings from cc-review
- [ ] All existing tests pass + new test coverage
- [ ] Deployed to staging and manually verified
- [ ] Tagged as v0.3x on main

---

*Created: 2026-04-01 | Based on Beta-2 post-deploy analysis*

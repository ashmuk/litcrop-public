# Requirements: #282 — Admin User Management Controls

**Issue:** [#282](https://github.com/ashmuk/litcrop/issues/282)
**Sprint:** Beta-8 | **Size:** M
**Step:** 1 — Requirements (cc-define)
**Date:** 2026-04-06

---

## 1. Problem Statement

The admin dashboard (Users tab) is read-only — admins can see users but cannot take action. There is no way for an admin to remove a problematic user or manage accounts without direct database access.

## 2. Current State

| Capability | Status |
|-----------|--------|
| View user list | Yes — `GET /admin/users` |
| View user activity | Yes — `GET /admin/activity` |
| Delete own account | Yes — `DELETE /me` with cascade |
| Admin delete user | **No** |
| Admin disable user | **No** |
| Cognito admin SDK | **Not imported** |

The self-delete cascade (`deleteAccount()` in dynamodb.ts) handles farm transfers, membership cleanup, join request deletion, and profile/settings removal. This logic can be reused for admin-initiated deletion.

## 3. Functional Requirements

### FR-1: Admin delete user endpoint
- `DELETE /api/v1/admin/users/:userId`
- Requires admin auth (existing `requireAdmin()` middleware)
- Reuses `dynamoRepo.deleteAccount(userId)` — same cascade logic as self-delete
- Returns deletion summary (farms_deleted, farms_transferred, etc.)
- Emits `account.deleted` event with `actor_id` = admin (not the deleted user)
- **Cannot delete self** — admin must use self-delete for their own account

### FR-2: Admin delete user UI
- Add "Delete" button to each user row in AdminDashboard Users tab
- Confirmation dialog: "Delete user {name}? This will remove their profile, settings, and farm memberships. Farms where they are the sole member will be deleted."
- Show deletion summary after success
- Remove deleted user from the list (optimistic or refetch)

### FR-3: Activity log entry
- Admin-initiated deletion logged as `account.deleted` with `actor_id` = admin user
- Distinguishable from self-deletion in the activity log

### FR-4: Guard against deleting the last admin
- If the target user's email is in `ADMIN_EMAILS`, warn: "This user is an admin"
- Allow deletion but show prominent warning

---

## 4. Non-Functional Requirements

### NFR-1: No new AWS dependencies
- Reuse existing `deleteAccount()` — no Cognito SDK needed
- Cognito user becomes orphaned (cannot access app with DynamoDB data deleted)
- Cognito cleanup deferred to Pre-Production

### NFR-2: Test coverage
- API test: admin can delete user → 200 with summary
- API test: non-admin cannot delete user → 403
- API test: admin cannot delete self → 400
- API test: delete non-existent user → 404

---

## 5. Constraints

| Constraint | Detail |
|-----------|--------|
| Size M | ~3-4 hours |
| No Cognito SDK | Reuse DynamoDB cascade only |
| Budget | $0 additional |
| Existing cascade | Reuse `deleteAccount()` as-is |

---

## 6. Out of Scope

- Cognito user cleanup (`AdminDeleteUser`) — Pre-Production
- User suspension/deactivation — future feature
- Bulk user actions — not needed at MVP scale
- User ban/blocklist — not needed yet

---

## 7. Acceptance Criteria

- [ ] `DELETE /api/v1/admin/users/:userId` works for admin users
- [ ] Returns deletion summary (same shape as self-delete)
- [ ] Non-admin gets 403
- [ ] Admin cannot delete self (400)
- [ ] Delete non-existent user returns 404
- [ ] Activity log shows admin-initiated deletion
- [ ] UI: Delete button on each user row in Users tab
- [ ] UI: Confirmation dialog before deletion
- [ ] UI: User removed from list after deletion
- [ ] All existing tests pass + new tests

---

## 8. Files to Modify

| Layer | File | Change |
|-------|------|--------|
| **API** | `src/api/src/routes/admin.ts` | Add DELETE /admin/users/:userId |
| **Frontend** | `src/frontend/src/components/AdminDashboard.tsx` | Delete button + confirmation dialog in Users tab |
| **Frontend** | `src/frontend/src/lib/api.ts` | Add `adminDeleteUser()` function |
| **i18n** | `src/frontend/src/i18n/en.json` | Admin delete confirmation text |
| **i18n** | `src/frontend/src/i18n/ja.json` | Same in Japanese |
| **Tests** | `src/api/src/__tests__/routes/admin.test.ts` | New tests for DELETE endpoint |

---

## 9. Next Step

Step 1 complete. Run `/cc-design` to proceed — or given size M and clear scope, proceed directly to implement.

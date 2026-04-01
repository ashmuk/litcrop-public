# Review Findings — Beta-4 Wave 0+1 Implementation

> Reviewed: 2026-04-01 | Reviewer: cc-review (my-reviewer agent)
> Scope: Wave 0 (Change Password, #204) + Wave 1 (Delete Account, #205) implementation code

---

## Summary

| Severity | Count |
|----------|-------|
| **MUST-FIX** | 0 |
| **SHOULD-FIX** | 2 |
| **SUGGESTION** | 3 |

**Status: accepted** (no MUST-FIX findings)

---

## SHOULD-FIX

### S-1. Farm warning conflates sole-member and admin-with-others scenarios

**File**: `src/frontend/src/components/ProfilePage.tsx:227-232`
**Issue**: `soleMemberFarms` filters by `f.role === 'admin'` but the frontend has no member count data. Shows "admin transfer" warning for all admin farms, even sole-member ones that will actually be deleted.
**Fix**: Either (a) fetch member counts when danger zone is expanded, or (b) add `member_count` to the farm list endpoint. Then render correct warning per case.

### S-2. `deleteCurrentUser()` has no unit test

**File**: `src/frontend/src/__tests__/auth.test.ts`
**Issue**: The `deleteCurrentUser()` function in auth.ts has no test coverage. It follows the same pattern as `changePassword()` but regressions would go undetected.
**Fix**: Add tests: throws `CognitoError('NotAuthenticated')` with no session, resolves on success after sign-in.

---

## SUGGESTION

### G-1. `deleteJoinRequest` uses BatchWriteCommand for single item

**File**: `src/api/src/services/dynamodb.ts:1264-1274`
**Issue**: `DeleteCommand` would be simpler and has better error reporting for single items.

### G-2. Swallowed error in handleDelete catch block

**File**: `src/frontend/src/components/ProfilePage.tsx:252`
**Issue**: `catch {}` with no logging. Add `console.error` before setting user-facing error.

### G-3. DeleteAccountSection missing aria-expanded on expand button

**File**: `src/frontend/src/components/ProfilePage.tsx:277-284`
**Issue**: Expand button lacks `aria-expanded` and `aria-controls` attributes, unlike `ChangePasswordSection` which has them.

---

## Positive Notes

- **Security**: No cross-user deletion path. userId from JWT only. AccessToken in-memory only.
- **Cascade logic**: Correctly implements sole-member delete, admin transfer, non-admin leave.
- **TransactWriteCommand** used for `updateMemberRole` (atomic both-direction update).
- **Test coverage**: 13 new tests covering cascade scenarios, route success/error/auth.
- **Design alignment**: Implementation closely follows both design docs.
- **Safety**: Typed confirmation adequate. Retry-safe. Non-atomic cascade documented.

---

*Review completed: 2026-04-01 | Status: accepted*

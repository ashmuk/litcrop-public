# BETA4-DELETE-ACCOUNT -- Delete Account (Issue #205)

> **Wave 1 Design Document**
> Status: Proposed | Sprint: Beta-4 | Scope: MVP
> Date: 2026-04-01

---

## Table of Contents

1. [ADR: Account Deletion Strategy](#1-adr-account-deletion-strategy)
2. [Sequence Diagram](#2-sequence-diagram)
3. [Data Model -- Cascade Checklist](#3-data-model--cascade-checklist)
4. [API Contract](#4-api-contract)
5. [Frontend Spec](#5-frontend-spec)
6. [i18n Keys](#6-i18n-keys)
7. [Test Plan](#7-test-plan)

---

## 1. ADR: Account Deletion Strategy

### Status

Proposed

### Context

Users need the ability to permanently delete their accounts. This is a basic user
expectation, a GDPR requirement (right to erasure), and was requested as Issue #205.

Key forces at play:

- **Issue #168 (soft delete for farms) is PENDING and unscoped.** We cannot depend
  on soft-delete infrastructure that does not exist.
- **DynamoDB single-table design** means user data is spread across multiple PK/SK
  patterns. Deletion must cascade across all of them.
- **Farm ownership transfer** is needed when a departing user is the sole admin of
  a farm that has other members.
- **Cognito user pool** stores the authentication identity separately from DynamoDB.
  Both must be cleaned up.
- **Monthly AWS budget is ~$1.18 (ceiling $5).** The solution must not add recurring
  cost (no new Lambda, no scheduled jobs).

### Options Considered

#### Option 1: Hard Delete (immediate, permanent erasure)

- **Description**: Delete all DynamoDB items for the user, then delete the Cognito
  identity. No tombstone, no recovery period.
- **Pros**: Simplest implementation. True GDPR erasure. No storage cost for deleted
  accounts. No new infrastructure needed.
- **Cons**: Irreversible. No grace period for accidental deletion.
- **Effort**: Low

#### Option 2: Soft Delete (mark as deleted, purge later)

- **Description**: Set a `deleted_at` timestamp on user items. Filter them from queries.
  Run a scheduled purge after 30 days.
- **Pros**: Grace period for recovery. Aligns with future #168 soft-delete pattern.
- **Cons**: Requires query-level filtering everywhere (high risk of leaks). Needs a
  scheduled Lambda for purge (adds cost and complexity). #168 is unscoped -- building
  soft-delete infra now creates throwaway work if #168 changes the design.
- **Effort**: High

#### Option 3: Do Nothing

- **Description**: Users cannot delete their accounts. They can log out.
- **Pros**: Zero effort.
- **Cons**: Fails GDPR. Poor user experience. Blocks Beta-4 exit criteria.
- **Effort**: None

### Decision

**Option 1: Hard Delete.** Immediate, permanent erasure of all user data from
DynamoDB followed by Cognito identity deletion.

### Rationale

- Hard delete is the simplest, most reversible *decision* (we can always add soft
  delete later; we cannot easily undo building soft-delete infra prematurely).
- #168 soft delete is unscoped -- building its infrastructure now risks throwaway work.
- True erasure satisfies GDPR without a deferred purge job.
- Typed confirmation in the UI ("DELETE MY ACCOUNT") provides the human safeguard
  against accidental deletion.
- Zero additional AWS cost.

### Owned-Farm Policy

When a user deletes their account, each farm they belong to is handled as follows:

| Scenario | Action |
|----------|--------|
| User is **sole member** of the farm | Delete the entire farm (cascade beds, memberships, join requests via existing `deleteFarm()`) |
| User is **admin** but other members exist | Transfer admin role to the longest-tenured manager; if no managers, to the longest-tenured member. Then remove user's membership. |
| User is **non-admin** member | Remove user's membership only |

### Consequences

#### Positive
- Simple, auditable deletion path
- True GDPR compliance (no residual PII)
- Zero infrastructure additions

#### Negative
- No recovery window -- accidental deletion is permanent
- Admin transfer logic adds moderate complexity to the API handler
- Conversation history (CONV# items) with 24h TTL will self-expire; we do not
  actively query/delete them (see Cascade Checklist for rationale)

---

## 2. Sequence Diagram

```
Frontend (ProfilePage)                API (DELETE /api/v1/me)                  DynamoDB                        Cognito
  |                                     |                                       |                               |
  |  User clicks "Delete My Account"    |                                       |                               |
  |  User types "DELETE MY ACCOUNT"     |                                       |                               |
  |  User clicks confirm button         |                                       |                               |
  |                                     |                                       |                               |
  |-- DELETE /api/v1/me --------------->|                                       |                               |
  |   (Authorization: Bearer <jwt>)     |                                       |                               |
  |                                     |-- getFarmsForUser(userId) ----------->|                               |
  |                                     |<-- [{farm_id, role}, ...] ------------|                               |
  |                                     |                                       |                               |
  |                                     |  FOR EACH farm:                       |                               |
  |                                     |    IF sole member:                    |                               |
  |                                     |-- deleteFarm(farmId) ---------------->|  (cascade: beds, members,     |
  |                                     |<-- OK --------------------------------|   join reqs, meta)            |
  |                                     |    ELIF admin + others exist:         |                               |
  |                                     |-- getFarmMembers(farmId) ------------>|                               |
  |                                     |<-- [members sorted by joined_at] ----|                               |
  |                                     |-- updateMemberRole(successor,admin)-->|                               |
  |                                     |<-- OK --------------------------------|                               |
  |                                     |-- removeFarmMember(userId,farmId) --->|                               |
  |                                     |<-- OK --------------------------------|                               |
  |                                     |    ELSE (non-admin):                  |                               |
  |                                     |-- removeFarmMember(userId,farmId) --->|                               |
  |                                     |<-- OK --------------------------------|                               |
  |                                     |                                       |                               |
  |                                     |-- deleteUserJoinRequests(userId) ---->|  (GSI1 query + batch delete)  |
  |                                     |<-- OK --------------------------------|                               |
  |                                     |                                       |                               |
  |                                     |-- deleteItem(USER#/PROFILE) --------->|                               |
  |                                     |-- deleteItem(USER#/SETTINGS) -------->|                               |
  |                                     |<-- OK --------------------------------|                               |
  |                                     |                                       |                               |
  |<-- 200 { deleted_farms, left_farms, |                                       |                               |
  |         transferred_farms }         |                                       |                               |
  |                                     |                                       |                               |
  |  Frontend receives 200              |                                       |                               |
  |-- cognitoRequest('DeleteUser',      |                                       |                               |
  |     { AccessToken }) --------------------------------------------------------|------------------------------>|
  |<-- OK (Cognito user deleted) --------|--------------------------------------------------------------|--------|
  |                                     |                                       |                               |
  |  signOut()                          |                                       |                               |
  |  redirect to /login                 |                                       |                               |
```

### Prerequisites

This section depends on **Wave 0's AccessToken storage fix** in `auth.ts`. The
`getCognitoAccessToken()` export must be available before the Cognito `DeleteUser`
step can function. If Wave 0 has not landed, the frontend will not be able to obtain
the AccessToken required by Cognito's `DeleteUser` API.

See **BETA4-CHANGE-PASSWORD.md section 4.1** for the `getCognitoAccessToken()`
export specification and implementation details.

### Why Cognito deletion happens on the frontend

The Cognito `DeleteUser` action requires the user's **AccessToken**, which is held
only by the frontend (stored in memory/localStorage). The backend JWT authorizer
receives the IdToken, not the AccessToken. Calling `DeleteUser` from the backend
would require either:

- Passing the AccessToken to the backend (leaks a credential over the wire), or
- Using `AdminDeleteUser` with IAM credentials (requires admin-level Cognito
  permissions on the Lambda, violating least-privilege per ADR-20260317-iam-least-privilege).

The chosen flow is: backend deletes DynamoDB data first (the critical step), then
frontend deletes the Cognito identity. If the Cognito call fails, the user has a
dangling Cognito account with no application data -- this is safe (they can log in
to an empty state and re-trigger deletion, or the account is effectively inert).

---

## 3. Data Model -- Cascade Checklist

All DynamoDB item types associated with a user, and the deletion strategy for each.

| # | Item Type | PK | SK | Query Strategy | Action |
|---|-----------|----|----|----------------|--------|
| 1 | User Profile | `USER#{userId}` | `#PROFILE` | Direct GetItem | **DELETE** |
| 2 | User Settings | `USER#{userId}` | `#SETTINGS` | Direct GetItem | **DELETE** |
| 3 | Farm Membership (forward) | `USER#{userId}` | `FARM_MEMBER#{farmId}` | Query PK=USER#{userId}, SK begins_with FARM_MEMBER# | **DELETE** (via removeFarmMember or deleteFarm) |
| 4 | Farm Membership (reverse) | `FARM#{farmId}` | `MEMBER#{userId}` | Derived from #3 (farmId known) | **DELETE** (via removeFarmMember or deleteFarm) |
| 5 | Join Request (farm-indexed) | `FARM#{farmId}` | `JOIN_REQUEST#{userId}` | Query GSI1 where GSI1PK=USER#{userId}, begins_with JOIN_REQUEST# | **DELETE** |
| 6 | Join Request (GSI1 user-indexed) | (same item as #5, GSI1PK=`USER#{userId}`) | GSI1SK=`JOIN_REQUEST#{farmId}` | (same physical item as #5) | (deleted with #5) |
| 7 | Conversation History | `CONV#{conversationId}` | `#HISTORY` | Has `user_id` field but no secondary index on it | **SKIP** -- TTL auto-expires in 24h. No efficient query path without a table scan. Cost of scan exceeds value. |
| 8 | Owned Farm (sole member) | `FARM#{farmId}` | `#META` + children | Identified from #3 where user is sole member | **DELETE** via existing `deleteFarm()` cascade |
| 9 | Owned Farm (admin, others exist) | `FARM#{farmId}` | `#META` | Identified from #3 + getFarmMembers | **UPDATE** -- transfer admin role, then remove membership |
| 10 | Images (bed-owned) | `IMG#{imageId}` | (under `BED#` partitions) | Bed-owned, not user-owned. Intentionally retained on farm deletion (no PII). Images become orphaned when a sole-member farm is deleted via cascade. S3 objects are also retained. | **SKIP** (no PII, no user-linked index) |

### Notes on Conversation History (#7)

Conversation items use PK=`CONV#{conversationId}` with a `user_id` attribute but no
GSI on `user_id`. Finding all conversations for a user would require a full table
scan, which is disproportionate for items that auto-expire via TTL within 24 hours.
The trade-off: a deleted user's conversation history may persist for up to 24 hours
after account deletion. This is acceptable because:

- The data is inaccessible (Cognito identity is deleted, JWT cannot be issued)
- TTL guarantees automatic cleanup
- No PII beyond what was in the chat messages (which are already ephemeral by design)

> **Implementation note (S-6)**: The 24h TTL value should be verified during
> implementation. Check the actual write path in `src/api/src/services/dynamodb.ts`
> around line 850 to confirm the TTL attribute is set to `now + 24h` and that no
> longer-lived CONV# items are written elsewhere.

---

## 4. API Contract

### `DELETE /api/v1/me`

**Route file**: `src/api/src/routes/me.ts`

#### Request

```
DELETE /api/v1/me
Authorization: Bearer <IdToken JWT>
Content-Type: (none -- no request body)
```

No request body. Authentication is via the existing JWT authorizer which extracts
`userId` from claims.

#### Response -- 200 OK

```json
{
  "deleted": true,
  "summary": {
    "farms_deleted": ["farm-uuid-1"],
    "farms_left": ["farm-uuid-2"],
    "farms_transferred": [
      {
        "farm_id": "farm-uuid-3",
        "new_admin": "user-uuid-successor"
      }
    ],
    "join_requests_deleted": 2,
    "profile_deleted": true,
    "settings_deleted": true
  }
}
```

#### Error Responses

| Status | Condition | Body |
|--------|-----------|------|
| 401 | Missing or invalid JWT | `{ "error": "Unauthorized" }` |
| 500 | DynamoDB or internal error | `{ "error": "Account deletion failed. Please try again." }` |

No 404 -- a user deleting themselves is always authenticated, so the user always
exists. If profile/settings items do not exist in DynamoDB (user never saved them),
the delete is a no-op for those items and still returns 200.

#### Cascade Logic Pseudocode

```
async function deleteAccount(userId: string):
  summary = { farms_deleted: [], farms_left: [], farms_transferred: [], ... }

  // 1. Get all farm memberships
  memberships = await getFarmsForUser(userId)

  // 2. Process each farm
  for each { farm_id, role } in memberships:
    members = await getFarmMembers(farm_id)

    if members.length == 1:
      // Sole member -- delete entire farm
      await deleteFarm(farm_id)
      summary.farms_deleted.push(farm_id)

    else if role == 'admin':
      // Admin with other members -- transfer admin role
      otherMembers = members
        .filter(m => m.user_id != userId)
        .sort(by joined_at ascending)

      // Prefer managers over regular members
      successor = otherMembers.find(m => m.role == 'manager')
                  ?? otherMembers[0]

      await updateMemberRole(farm_id, successor.user_id, 'admin')
      // NOTE: updateMemberRole() + removeFarmMember() are two separate operations.
      // At MVP scale, the brief window of dual-admin or missing-admin is an accepted
      // risk. For production, consider wrapping both in a TransactWriteCommand.
      await removeFarmMember(userId, farm_id)
      summary.farms_transferred.push({ farm_id, new_admin: successor.user_id })

    else:
      // Non-admin -- just leave
      await removeFarmMember(userId, farm_id)
      summary.farms_left.push(farm_id)

  // 3. Delete user's outgoing join requests
  joinRequests = await getMyJoinRequests(userId)  // via GSI1
  for each { farm_id } in joinRequests:
    await deleteJoinRequest(farm_id, userId)       // new helper
  summary.join_requests_deleted = joinRequests.length

  // 4. Delete user profile and settings
  await deleteItem(PK=USER#{userId}, SK=#PROFILE)  // no-op if not exists
  await deleteItem(PK=USER#{userId}, SK=#SETTINGS)  // no-op if not exists
  summary.profile_deleted = true
  summary.settings_deleted = true

  return summary
```

#### New DynamoDB Repository Methods Needed

| Method | Signature | Description |
|--------|-----------|-------------|
| `updateMemberRole` | `(farmId: string, userId: string, role: FarmRole) => Promise<void>` | Update role on both forward (`USER#/FARM_MEMBER#`) and reverse (`FARM#/MEMBER#`) records |
| `deleteJoinRequest` | `(farmId: string, userId: string) => Promise<void>` | Delete a single join request item by PK=FARM#{farmId}, SK=JOIN_REQUEST#{userId} |
| `deleteUserItems` | `(userId: string) => Promise<void>` | Batch delete USER#{userId}/#PROFILE and USER#{userId}/#SETTINGS |
| `deleteAccount` | `(userId: string) => Promise<DeleteAccountSummary>` | Orchestrator that runs the full cascade (calls the above) |

---

## 5. Frontend Spec

### Location

Add a **Danger Zone** section to `ProfilePage.tsx`, inside the "You" section
(`<section>` at line 569), below the existing logout button (line 655-664).
*(Line numbers approximate — verify before implementation.)*

### Danger Zone UI

```
+----------------------------------------------------------+
|  border: 2px solid var(--color-danger)                   |
|  border-radius: var(--radius-md)                         |
|  padding: var(--space-4)                                 |
|  margin-top: var(--space-6)                              |
|                                                          |
|  [!] Delete Account                                      |
|                                                          |
|  This will permanently delete your account, remove you   |
|  from all farms, and delete any farms where you are the  |
|  only member. This action cannot be undone.              |
|                                                          |
|  [Owned farms warning -- conditional]                    |
|  WARNING: You are the sole member of:                    |
|    - "Tanaka Farm" -- will be deleted                    |
|    - "Test Farm" -- will be deleted                      |
|                                                          |
|  [Admin transfer warning -- conditional]                 |
|  The following farms will have a new admin assigned:     |
|    - "Community Farm" -- admin will transfer to Sato     |
|                                                          |
|  To confirm, type DELETE MY ACCOUNT below:               |
|                                                          |
|  [ text input                                     ]      |
|                                                          |
|  [ Delete My Account ]  (btn-danger, disabled until      |
|                          input matches exactly)           |
+----------------------------------------------------------+
```

### Interaction Flow

1. **Initial state**: Danger zone is collapsed. A red-outlined "Delete Account"
   button expands it.
2. **Expanded state**: Shows warning text. On expand, fetches farm membership data
   via existing `GET /api/v1/me/join-requests` and farm list to show the impact
   summary (which farms will be deleted vs transferred).
3. **Confirmation input**: Text input that must exactly match `DELETE MY ACCOUNT`
   (case-sensitive). The delete button is disabled until the input matches.
4. **Submitting**: Button shows loading state. Calls `DELETE /api/v1/me`.
5. **On 200 response**: Calls `cognitoRequest('DeleteUser', { AccessToken })` to
   delete the Cognito identity.
6. **On Cognito success**: Calls `signOut()`, then `window.location.href = '/login'`.
7. **On API error**: Shows inline error message. Does NOT call Cognito delete.
8. **On Cognito error**: Shows warning that account data was deleted but sign-in
   may still work temporarily. Calls `signOut()` and redirects to `/login`.

### Farm Impact Preview

Before showing the danger zone content, the frontend should call the existing
endpoints to build the impact preview:

- `GET /api/v1/me/profile` -- already loaded (has user farms via page state)
- Farm list is already available in ProfilePage state (`farms` array with roles)

No new API endpoint is needed for the preview. The frontend already has the farm
list with roles and member counts from the profile page data.

### Accessibility

- Danger zone uses `role="alert"` for the warning text
- Confirmation input has `aria-label="Type DELETE MY ACCOUNT to confirm"`
- Delete button has `aria-disabled="true"` until confirmation matches
- Focus is moved to the confirmation input when the danger zone expands

---

## 6. i18n Keys

### English (`en.json`)

```json
{
  "profile": {
    "delete_account": {
      "title": "Delete Account",
      "description": "This will permanently delete your account, remove you from all farms, and delete any farms where you are the only member. This action cannot be undone.",
      "sole_member_warning": "You are the sole member of the following farms. They will be permanently deleted:",
      "admin_transfer_warning": "The following farms will have a new admin assigned:",
      "admin_transfer_to": "admin will transfer to {{name}}",
      "confirm_prompt": "To confirm, type DELETE MY ACCOUNT below:",
      "confirm_placeholder": "DELETE MY ACCOUNT",
      "confirm_button": "Delete My Account",
      "deleting": "Deleting account...",
      "success": "Your account has been deleted.",
      "error": "Could not delete account. Please try again.",
      "cognito_warning": "Account data deleted, but sign-in cleanup failed. You have been logged out.",
      "expand_button": "Delete Account"
    }
  }
}
```

### Japanese (`ja.json`)

```json
{
  "profile": {
    "delete_account": {
      "title": "アカウント削除",
      "description": "アカウントを完全に削除し、すべての農場から退会します。唯一のメンバーである農場は削除されます。この操作は元に戻せません。",
      "sole_member_warning": "以下の農場の唯一のメンバーです。農場は完全に削除されます：",
      "admin_transfer_warning": "以下の農場には新しい管理者が割り当てられます：",
      "admin_transfer_to": "管理者は{{name}}に移行されます",
      "confirm_prompt": "確認のため、以下に DELETE MY ACCOUNT と入力してください：",
      "confirm_placeholder": "DELETE MY ACCOUNT",
      "confirm_button": "アカウントを削除",
      "deleting": "アカウントを削除中...",
      "success": "アカウントが削除されました。",
      "error": "アカウントを削除できませんでした。もう一度お試しください。",
      "cognito_warning": "アカウントデータは削除されましたが、サインインの処理に失敗しました。ログアウトしました。",
      "expand_button": "アカウント削除"
    }
  }
}
```

Note: The confirmation string `DELETE MY ACCOUNT` is intentionally kept in English
for both locales. This is a deliberate UX pattern -- the typed confirmation acts as
a friction mechanism, and keeping it consistent avoids localization bugs in the
matching logic.

---

## 7. Test Plan

### API Tests (cascade correctness)

| # | Test Case | Setup | Expected Outcome |
|---|-----------|-------|------------------|
| A1 | Delete user who is sole member of 1 farm | Create user + farm with 1 member | Farm deleted (all beds, meta, memberships gone). User profile + settings deleted. Response lists farm in `farms_deleted`. |
| A2 | Delete user who is admin of farm with other members | Create farm with admin (target) + 1 manager + 1 member | Admin role transferred to manager (longest-tenured). User removed from farm. Farm and other members intact. Response lists farm in `farms_transferred`. |
| A3 | Delete user who is admin, no managers exist | Create farm with admin (target) + 1 regular member | Admin role transferred to longest-tenured regular member. |
| A4 | Delete user who is non-admin member | Create farm with admin + target as member | Target removed from farm. Farm and admin intact. Response lists farm in `farms_left`. |
| A5 | Delete user with multiple farms (mixed scenarios) | User is sole member of Farm A, admin of Farm B (with others), member of Farm C | Farm A deleted, Farm B transferred, Farm C left. All reflected in response summary. |
| A6 | Delete user with pending join requests | Create user + 2 pending join requests | Join requests deleted. `join_requests_deleted: 2` in response. |
| A7 | Delete user with no profile/settings | Create user via Cognito only (never saved profile) | Returns 200. `profile_deleted: true`, `settings_deleted: true` (no-op deletes succeed). |
| A8 | Delete user with no farms | Create user with profile but no farm memberships | Profile + settings deleted. `farms_deleted: [], farms_left: [], farms_transferred: []`. |
| A9 | Unauthenticated request | No JWT | 401 Unauthorized |
| A10 | Verify no orphaned reverse memberships | After A1 | Query FARM#{farmId}/MEMBER# returns empty |
| A11 | Verify no orphaned forward memberships | After A4 | Query USER#{userId}/FARM_MEMBER# returns empty |

### Frontend Tests (validation and flow)

| # | Test Case | Expected Outcome |
|---|-----------|------------------|
| F1 | Confirm button disabled until exact match | Button has `aria-disabled` until input is exactly "DELETE MY ACCOUNT" |
| F2 | Partial match does not enable button | "DELETE MY ACCOUN" (missing T) keeps button disabled |
| F3 | Case sensitivity enforced | "delete my account" (lowercase) keeps button disabled |
| F4 | Successful deletion flow | API returns 200, Cognito DeleteUser called, signOut() called, redirected to /login |
| F5 | API error does not trigger Cognito delete | API returns 500, error message shown, Cognito DeleteUser NOT called |
| F6 | Cognito error after successful API delete | API returns 200, Cognito fails, warning shown, signOut + redirect still happen |
| F7 | Sole-member farm warning displayed | User with sole-member farm sees farm name in warning |
| F8 | Admin transfer warning displayed | User who is admin of multi-member farm sees transfer info |
| F9 | Danger zone expand/collapse | Initial state collapsed, click expands, shows confirmation UI |

### Edge Cases

| # | Edge Case | Expected Behavior |
|---|-----------|-------------------|
| E1 | User deletes account while another user is requesting to join their farm | Join requests under the farm are deleted as part of `deleteFarm()` cascade (sole member) or remain valid (farm transferred to new admin). |
| E2 | Concurrent deletion -- two requests arrive simultaneously | DynamoDB operations are idempotent for deletes. Second request may get 200 with empty summary (items already gone). No data corruption. |
| E3 | Admin transfer when multiple managers exist | Longest-tenured manager (earliest `joined_at`) is selected. Deterministic. |
| E4 | User is admin of 5+ farms | All farms processed sequentially. Response summary includes all. No timeout concern at MVP scale. |
| E5 | Network failure mid-cascade | Partial deletion state. User can retry (endpoint is idempotent for delete operations). Already-deleted items are no-ops on retry. |
| E6 | Browser closed after API 200 but before Cognito `DeleteUser` | A dangling Cognito identity persists with no application data. The user can log in to an empty state and re-trigger deletion, or the account is effectively inert. Accepted tech debt at MVP scale. |

---

## Appendix: Files to Modify

| File | Change |
|------|--------|
| `src/api/src/routes/me.ts` | Add `DELETE /` route handler |
| `src/api/src/services/dynamodb.ts` | Add `updateMemberRole()`, `deleteJoinRequest()`, `deleteUserItems()`, `deleteAccount()` |
| `src/frontend/src/components/ProfilePage.tsx` | Add Danger Zone section below logout button |
| `src/frontend/src/lib/auth.ts` | Export `cognitoRequest` (currently private) or add `deleteUser(accessToken)` wrapper |
| `src/frontend/src/i18n/en.json` | Add `profile.delete_account.*` keys |
| `src/frontend/src/i18n/ja.json` | Add `profile.delete_account.*` keys |
| `packages/shared/src/index.ts` | Add `DeleteAccountResponse` type (optional, for contract testing) |

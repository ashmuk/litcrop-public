# Beta-1 Review Findings

> Reviewed: 2026-03-25
> Scope: Beta-1 (v0.22) — post-merge live feedback + cc-review findings
> Source: User feedback (5 items) + cc-review automated scan (3 SHOULD-FIX)
> Tests: 336/336 pass

## Summary

- MUST-FIX: 0
- SHOULD-FIX: 5 (3 code review + 2 user feedback)
- SUGGESTION: 6 (4 code review + 2 user feedback)
- Status: **accepted for Beta-1** — SHOULD-FIX items tracked for Beta-2

---

## User Feedback (post-merge, 2026-03-25)

### F1 SHOULD-FIX — Manager cannot edit farm name after initial setup

- **Page**: Profile → farm card
- **Issue**: Farm name is set during the wizard and cannot be changed afterward. Managers and admins need to rename farms (e.g., seasonal rename, correcting typos).
- **Impact**: Users are stuck with initial farm names unless they delete and recreate the farm.
- **Fix**: Add inline edit (pencil icon) on the farm name in ProfilePage. The API already supports `PATCH /farms/:farmId` with `name` field — this is frontend-only.
- **Size**: S
- **Target**: Beta-2
- **Maps to**: NEW issue needed

---

### F2 SHOULD-FIX — System admin should never see Leave button

- **Page**: Profile → farm card
- **Issue**: The #180 fix hides Leave for farm *owners* (`farm.user_id === currentUser.sub`), but a system admin (from `ADMIN_EMAILS`) who is not the owner still sees "Leave". Per feedback, admin accounts should control all farms and never leave them.
- **Impact**: Admin accidentally leaving a farm loses visibility until re-added.
- **Fix**: In `ProfilePage.tsx`, also check `isAdmin` flag. Source: either (a) add `is_admin` to the `GET /me/profile` response, or (b) check against `ADMIN_EMAILS` list stored in localStorage during login.
- **Size**: S
- **Target**: Beta-2
- **Maps to**: Refine #180 (reopen or new issue)

---

### F3 SUGGESTION — Admin email notifications for account and farm events

- **Events to notify**:
  1. New account creation (user signs up)
  2. Farm creation
  3. Farm deletion
  4. Member join (added to farm)
  5. Member leave (removed from farm)
- **Issue**: Admin has no awareness of platform activity unless they check the admin dashboard. Email notifications provide push-based awareness.
- **Fix**: Add SNS topic or SES direct send from the API Lambda on each event. Recipients: all emails in `ADMIN_EMAILS` env var.
- **Size**: M-L (new infrastructure: SNS/SES, IAM permissions, email templates)
- **Target**: Beta-2 (alongside #179 admin dashboard)
- **Maps to**: NEW issue needed

---

### F4 SUGGESTION — Observer wizard: pick farm to join on signup

- **Page**: Post-registration wizard flow
- **Issue**: When an observer creates an account, they land on an empty profile with no farms. They should immediately be shown a list of discoverable farms and be able to request to join one.
- **Impact**: First-use experience is confusing — observer sees nothing and has no clear next step.
- **Fix**: Integrate into the registration wizard as a final step: "Which farm would you like to join?" showing discoverable farms with "Request to Join" buttons.
- **Size**: Included in #181 scope
- **Target**: Beta-2
- **Maps to**: Enriches existing #181 (observer onboarding APPLY workflow)

---

### F5 SHOULD-FIX — Show farm ID in Profile to disambiguate overlapping names

- **Page**: Profile → farm card list
- **Issue**: When admin sees all farms, multiple farms could have the same name (e.g., two users both create "My Farm"). There is no unique label to distinguish them.
- **Impact**: Admin cannot tell which farm is which when names overlap.
- **Fix**: Show truncated farm ID (e.g., `abc12ef...`) as a subtitle or secondary label on each farm card in ProfilePage. Consider also showing owner name/email.
- **Size**: S
- **Target**: Beta-2
- **Maps to**: NEW issue needed

---

## Code Review Findings (cc-review, 2026-03-25)

### C1 SHOULD-FIX — No tests for admin bypass in assertFarmAccess

- **File**: `src/api/src/routes/_helpers.ts:12-37`
- **Issue**: The admin bypass is a security-sensitive authorization change with no test coverage. Existing 336 tests pass because none exercise admin paths.
- **Fix**: Add tests: (a) assertFarmAccess with isAdmin returns synthetic membership, (b) GET /farms with admin returns all farms, (c) write routes reject admin without membership.
- **Target**: Beta-2

---

### C2 SHOULD-FIX — requiredRoles silently ignored when isAdmin=true

- **File**: `src/api/src/routes/_helpers.ts:27-32`
- **Issue**: If `isAdmin` is true, the function returns immediately without checking `requiredRoles`. Currently safe (no write route passes `isAdmin`), but a footgun.
- **Fix**: Check the synthetic `'admin'` role against `requiredRoles` before returning:
  ```typescript
  if (isAdmin) {
    const syntheticRole: FarmRole = 'admin';
    if (requiredRoles && !requiredRoles.includes(syntheticRole)) {
      throw new NotFoundError(`Farm not found: ${farmId}`);
    }
    return { farm, membership: { ... } };
  }
  ```
- **Target**: Beta-2

---

### C3 SHOULD-FIX — Synthetic membership overloads 'admin' role semantically

- **File**: `src/api/src/routes/_helpers.ts:30`
- **Issue**: The synthetic membership uses `role: 'admin'` (farm-level role), but it represents a system-level admin. If downstream code uses `membership.role === 'admin'` to authorize farm write operations, the system admin would incorrectly gain write access.
- **Fix**: Document the limitation. Consider adding a `synthetic: true` marker on the membership object for downstream detection.
- **Target**: Beta-2

---

### C4 SUGGESTION — getAllFarms() uses full table Scan

- **File**: `src/api/src/services/dynamodb.ts:217-237`
- **Issue**: Scans the entire DynamoDB table with `FilterExpression`. Reads every item, paying for RCU on non-farm items. Acceptable for beta scale but won't scale.
- **Fix**: For PROD, add a GSI (e.g., `GSI2PK=ENTITY#FARM`) for efficient farm listing without scan.

---

### C5 SUGGESTION — Defensive null guard on currentUser

- **File**: `src/frontend/src/components/ProfilePage.tsx:309`
- **Issue**: If `currentUser` is null, `farm.user_id !== currentUser?.sub` evaluates to `farm.user_id !== undefined` (always true) — Leave button appears for all farms including owned ones. Safe in practice (page is behind auth), but fragile.
- **Fix**: `{!isDemoFarm && currentUser && farm.user_id !== currentUser.sub && (`

---

### C6 SUGGESTION — i18n key mismatch after Manage → Device rename

- **File**: `src/frontend/src/i18n/en.json:6`, `ja.json:6`
- **Issue**: Key is `"manage": "Device"`. The key name no longer matches the value. Internal-only concern, but creates maintenance confusion.
- **Fix**: Rename key to `"device"` across all references when convenient. Low priority.

---

### C7 SUGGESTION — Chat tool admin bypass undocumented

- **File**: `src/api/src/routes/chat.ts:216`
- **Issue**: Admin bypass passes into the chat tool executor, meaning admin can query any farm's data via AI chat. This is read-only and intentional, but undocumented. Future chat tools could include write operations.
- **Fix**: Add JSDoc comment noting admin bypass scope. Review before adding write-capable chat tools.

---

## Issue Actions

| Action | Item | Details |
|--------|------|---------|
| CREATE | F1 | Manager edit farm name (S, frontend) |
| CREATE | F3 | Admin email notifications (M-L, infra) |
| CREATE | F5 | Show farm ID in Profile (S, frontend) |
| REOPEN/CREATE | F2 | Admin never sees Leave (S, frontend) — refine #180 |
| UPDATE | #181 | Add F4 scope: observer wizard farm picker on signup |
| TRACK | C1-C3 | Code review SHOULD-FIX items for Beta-2 |

---

*Generated: 2026-03-25 | Session: litcrop-beta-1 | v0.22*

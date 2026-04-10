# Requirements: Auth Matrix Review (#313)

> Step 1 — Requirements (cc-define)
> Date: 2026-04-08

## 1. Problem Statement

The platform has three farm-level roles (`admin`, `owner`, `staff`) plus a system-level `isAdmin` flag. An audit of every API endpoint and frontend component reveals 7 gaps — mostly around role clarity and dead code rather than security vulnerabilities. This document defines what needs to be reviewed, clarified, and fixed.

## 2. Current State

### Role Model

| Role | Scope | How assigned |
|------|-------|-------------|
| **isAdmin** (system) | Platform-wide | `ADMIN_EMAILS` env var — email match |
| **admin** (farm) | Per-farm | Exists in FarmRole type but unreachable in normal flows |
| **owner** (farm) | Per-farm | Farm creation (hardcoded), or promotion by admin/owner |
| **staff** (farm) | Per-farm | Join request approval (hardcoded), or demotion |

### Current Permission Matrix (from audit)

| Capability | System Admin | Farm admin | Farm owner | Staff |
|---|---|---|---|---|
| View farm/beds/diary/images | ✅ | ✅ | ✅ | ✅ |
| Create diary entries | ✅ | ✅ | ✅ | ✅ |
| Edit/delete OWN diary entries | ✅ | ✅ | ✅ | ✅ |
| Edit/delete OTHERS' diary entries | ✅ | ✅ | ✅ | ❌ |
| Edit bed (assign crop, tag) | ✅ | ✅ | ✅ | ❌ |
| Upload images | ✅ | ✅ | ✅ | ❌ |
| Manage farm settings | ✅ | ✅ | ✅ | ❌ |
| Manage members (add/remove/promote) | ✅ | ✅ | ✅ | ❌ |
| Approve/reject join requests | ✅ | ✅ | ✅ | ❌ |
| Register/manage devices | ✅ | ✅ | ✅ | ❌ |
| Delete farm | ✅ | ✅ | ✅ | ❌ |
| Admin dashboard | ✅ | ❌ | ❌ | ❌ |
| Delete any user | ✅ | ❌ | ❌ | ❌ |
| View all farms | ✅ | ❌ | ❌ | ❌ |

**Key observation:** Farm `admin` and `owner` have identical permissions. The `admin` role adds no capability.

## 3. Identified Gaps

### GAP 1: Farm 'admin' Role — Permissions Not Differentiated (CRITICAL)

**Problem:** `FarmRole = 'admin' | 'owner' | 'staff'` includes `admin`, but:
- API route guards treat `admin` and `owner` identically (`['admin', 'owner']`)
- The `admin` role is assigned synthetically by `assertFarmAccess` for `isAdmin` users
- Admin SHOULD have distinct permissions: Admin dashboard, cross-farm visibility, all-farm control
- These permissions exist via `isAdmin` check but are NOT reflected in the farm role model

**Decision (user confirmed):** KEEP `admin` role. It represents the system administrator's farm-level identity. Align all existing behavior so `admin` distinctly includes Admin dashboard + cross-farm control, while `owner` is farm-scoped only.

**Action:** Audit and fix any places where `admin` and `owner` are incorrectly treated as identical when they should differ.

### GAP 2: preferred_role — Dead Field (MAJOR)

**Problem:** `UserProfile.preferred_role: 'owner' | 'staff'` is stored in DynamoDB but never read for any logic. It was likely intended for the promo-code registration flow.

**Decision needed:** Remove the field, OR implement the feature.

**Recommendation:** Keep for now — it will be useful when #281 (pricing tiers) is implemented. Add a `@deprecated` or `@todo` comment.

### GAP 3: POST /members Can Assign 'admin' (MODERATE)

**Problem:** POST `/farms/:farmId/members` uses `FarmRoleSchema.safeParse(role)` which accepts `'admin'`. An owner could theoretically add a member with `admin` role via API. The `admin` role should only be system-assigned via `isAdmin` env var.

**Fix required:** Restrict POST endpoint to accept only `'owner' | 'staff'`.

### GAP 4: Stale Role Cache in Frontend (FIXED)

**Problem:** `getLocalFarmRole()` defaulted to `'staff'` from stale localStorage.
**Status:** Fixed in commit `a19f22c` — BedDetail now refreshes cache on mount.

**Remaining concern:** Other pages (DiaryPage, DeviceListPage) use the same pattern. Consider applying the same fix.

### GAP 5: Staff Cannot Upload Images Manually (DESIGN DECISION)

**Problem:** Staff can view images but cannot upload via UI. Device uploads bypass this (separate auth).

**Decision (user confirmed):** Allow staff to upload images. Staff in the field should be able to document with photos. The image is attributed to the uploader, so accountability is maintained.

### GAP 6: Diary Staff Permissions — Inconsistent with Bed Permissions

**Problem:** Staff CAN create diary entries but CANNOT edit beds. A staff member logging a planting entry triggers the bed update bridge (planted_at), which succeeds because the API diary route calls `updateBed` internally without role check.

**Concern:** Staff diary entry → automatic bed update bypasses the bed write restriction.

**Recommendation:** This is acceptable — the diary bridge is an internal system action, not a direct bed edit by the user. Document this as intentional.

### GAP 7: No Role Displayed on BedDetail / Diary Pages

**UX issue:** Users don't know they're in read-only mode until they look for missing buttons. No visual indicator explains why actions are hidden.

**Recommendation:** Show a subtle "Read-only (staff)" badge when `isReadOnly === true`.

## 4. Functional Requirements

### FR-1: Clarify Admin vs Owner Permissions
Keep `admin` in FarmRole. Ensure admin has distinct capabilities beyond owner:
- Admin dashboard access (already works via `isAdmin`)
- Cross-farm visibility (already works)
- All-farm member management (already works)
- Document these distinctions clearly in the auth matrix
- Fix any route guards that incorrectly equate admin and owner
- Ensure POST `/farms/:farmId/members` does NOT allow assigning `admin` role (admin is system-assigned only)
- Priority: **HIGH**

### FR-2: Restrict Role Assignment on POST /members
POST `/farms/:farmId/members` must only accept `'owner' | 'staff'` as role values. The `admin` role is assigned only via `isAdmin` system check, never manually.
- Priority: **HIGH**

### FR-3: Allow Staff Image Upload and Tagging
Open image upload and tagging to all farm members (was `['admin', 'owner']` only):
- `POST /beds/:bedId/images` — modify `assertBedWriteAccess()` in `beds.ts:50` or create a separate access check for image operations
- `POST /images/:imageId/tags` — modify `assertImageWriteAccess()` in `images.ts:37`
- Frontend: remove `isReadOnly` guard on upload button and tag buttons in `BedDetail.tsx`
Staff in the field need to document crops with photos and tag status. Images/tags are attributed to uploader.
- Priority: **HIGH**

### FR-4: Allow Staff Diary Entry Creation (Verify)
Staff CAN already create diary entries (confirmed in audit). Verify this is consistent across all diary operations:
- Create: ✅ all members (confirmed)
- Edit own: ✅ creator check (confirmed)
- Delete own: ✅ creator check (confirmed)
- Edit/delete others: ❌ admin/owner only (confirmed)
- Priority: **MEDIUM** (verification only)

### FR-5: Extend Role Cache Refresh to All Pages
Apply the same `getMyFarms()` refresh pattern from BedDetail to DiaryPage, DeviceListPage.
- Priority: **MEDIUM**

### FR-6: Document Diary-to-Bed Bridge Authorization
Add code comment explaining that the diary bridge updates beds as a system action, bypassing staff bed-write restriction intentionally.
- Priority: **LOW**

### FR-7: Read-Only Indicator for Staff
Show a visible badge/indicator when a user is in staff (read-only) mode on restricted pages.
- Priority: **LOW**

## 5. Non-Functional Requirements

### NFR-1: No Breaking Changes to Existing Users
Role simplification must not lock out any existing user. Migration script required.

### NFR-2: Conservative Default Preserved
The `'staff'` default in `getLocalFarmRole()` must remain — it's the secure fallback.

### NFR-3: 404 Leakage Prevention Maintained
`assertFarmAccess` must continue returning 404 for both missing farm AND insufficient role.

### NFR-4: Synthetic Admin Write Constraint Preserved
`assertFarmAccess` creates a synthetic `admin` membership for isAdmin users (see `_helpers.ts:27`). Callers must NOT use this synthetic membership for direct write authorization — admin write access works because route guards explicitly include `'admin'` in their allowed roles array, not because of the synthetic membership.

## 6. Constraints

- **Budget:** No infrastructure changes — this is code + data only
- **Scope:** Farm role simplification only. System `isAdmin` is out of scope.
- **Migration:** No DynamoDB data migration needed — changes are to API guards and frontend checks only
- **Backward compat:** Frontend must handle both old and new role values during rollout

## 7. Authorization Matrix (Target State)

### Legend
- ✅ Allowed
- ❌ Denied
- 🔧 Needs fix (current behavior differs from target)

### Read Operations (all roles can read)

| Capability | Admin | Owner | Staff | Current | Action |
|---|---|---|---|---|---|
| View own farms | ✅ | ✅ | ✅ | ✅ | — |
| View all farms (cross-farm) | ✅ | ❌ | ❌ | ✅ | — |
| View discoverable farms | ✅ | ✅ | ✅ | ✅ | — |
| View beds | ✅ | ✅ | ✅ | ✅ | — |
| View images | ✅ | ✅ | ✅ | ✅ | — |
| View diary entries | ✅ | ✅ | ✅ | ✅ | — |
| View farm members | ✅ | ✅ | ✅ | ✅ | — |
| View devices | ✅ | ✅ | ✅ | ✅ | — |
| View weather | ✅ | ✅ | ✅ | ✅ | — |
| View crop library | ✅ | ✅ | ✅ | ✅ | — |
| View usage stats | ✅ | ✅ | ✅ | ✅ | — |

### Write Operations — Staff Allowed

| Capability | Admin | Owner | Staff | Current | Action |
|---|---|---|---|---|---|
| Create diary entry | ✅ | ✅ | ✅ | ✅ | — |
| Edit OWN diary entry | ✅ | ✅ | ✅ | ✅ | — |
| Delete OWN diary entry | ✅ | ✅ | ✅ | ✅ | — |
| Upload image (manual) | ✅ | ✅ | ✅ | ❌ staff | 🔧 FR-3 |
| Tag image | ✅ | ✅ | ✅ | ❌ staff | 🔧 FR-3 |
| AI chat | ✅ | ✅ | ✅ | ✅ | — |
| Submit join request | ✅ | ✅ | ✅ | ✅ | — |

### Write Operations — Owner+ Only

| Capability | Admin | Owner | Staff | Current | Action |
|---|---|---|---|---|---|
| Edit/delete OTHERS' diary | ✅ | ✅ | ❌ | ✅ | — |
| Edit bed (assign crop, status) | ✅ | ✅ | ❌ | ✅ | — |
| Manage farm settings | ✅ | ✅ | ❌ | ✅ | — |
| Add farm members | ✅ | ✅ | ❌ | ✅ | — |
| Promote/demote members | ✅ | ✅ | ❌ | ✅ | — |
| Approve/reject join requests | ✅ | ✅ | ❌ | ✅ | — |
| Register/manage devices | ✅ | ✅ | ❌ | ✅ | — |
| Delete farm | ✅ | ✅ | ❌ | ✅ | — |
| Self-leave farm | ✅ | ✅ | ✅ | ✅ | — |

> **Note:** No `DELETE /members/:userId` endpoint exists — only self-leave (`DELETE /members/me`).
> Admin/owner member removal is not yet implemented. Track as separate issue if needed.

### User-Scoped Operations (no farm role — personal data)

| Capability | Auth required | Current | Action |
|---|---|---|---|
| View/edit own profile | Yes (any user) | ✅ | — |
| Upload/delete profile picture | Yes (any user) | ✅ | — |
| Delete own account | Yes (any user) | ✅ | — |
| View own join requests | Yes (any user) | ✅ | — |
| View/edit notification prefs | isAdmin only | ✅ | — |
| View activity log | isAdmin only | ✅ | — |

### Admin-Only Operations

| Capability | Admin | Owner | Staff | Current | Action |
|---|---|---|---|---|---|
| Admin dashboard | ✅ | ❌ | ❌ | ✅ | — |
| Delete any user account | ✅ | ❌ | ❌ | ✅ | — |
| View all farms (cross-farm) | ✅ | ❌ | ❌ | ✅ | — |
| Send test emails | ✅ | ❌ | ❌ | ✅ | — |

### Role Assignment Rules

| Action | Who can do it | Target roles | Current | Action |
|---|---|---|---|---|
| Farm creation | Any user | Creator → owner | ✅ | — |
| Join request approval | Admin, Owner | Approved → staff | ✅ | — |
| Promote member | Admin, Owner | staff → owner | ✅ | — |
| Demote member | Admin, Owner | owner → staff | ✅ | — |
| Assign admin role | System only | via `ADMIN_EMAILS` env var → `isAdmin` flag | ⚠️ POST may allow | 🔧 FR-2 |
| Self-leave farm | Any member | (sole owner blocked) | ✅ | — |

## 8. Out of Scope

- System admin (`isAdmin`) changes — works correctly today
- Cognito auth flow changes
- New roles (e.g., 'viewer' tier for #281 pricing)
- Device-to-device auth (JWT-based, separate system)

## 9. Next Steps

Run `/cc-design` to proceed to Step 2: Architecture — plan the implementation approach for the role simplification, migration strategy, and permission fixes.

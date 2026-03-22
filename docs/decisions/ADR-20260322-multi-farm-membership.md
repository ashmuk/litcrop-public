# ADR-20260322: Multi-Farm Membership Model

## Status
Accepted (2026-03-22)

## Context
The MVP+ evaluation scenario requires three users across two farms with role-based access control. The PoC used a simple single-owner model (`farm.user_id === userId`) that cannot express shared access or differentiated permissions.

### Current State
- Every farm has a `user_id` field pointing to the sole owner
- All route handlers check `farm.user_id === userId` directly or via a per-route `getOwnedFarm()` helper
- No concept of roles: any authenticated user either owns a farm entirely or has no access at all
- This model blocks the evaluation scenario (3 users, 2 farms, one user with observer-only access to a farm they do not own)

### Requirements
- A user can be a member of multiple farms
- A farm can have multiple members
- Each membership carries a role: `admin`, `manager`, or `observer`
- Observer role is read-only: cannot upload images or create tags
- Admin and manager roles can write (upload images, add tags, add members, edit farm)
- Access checks must be centralised — not duplicated across every route handler
- The original `farm.user_id` field must remain (backward compatibility with existing records and CDK schema)

### Decision Drivers
- Evaluation scenario requires shared-farm access within the MVP+ timeframe
- Middleware migration risk: many route handlers must change from per-field checks to a shared helper
- Test coverage: all role variants must be exercised
- Cost and complexity: solution must stay within the DynamoDB single-table design already in place

## Options Considered

### Option A: Relax GET ownership only (original Option D from Phase B design)
- **Description**: Keep `farm.user_id` as the sole owner. Add a `shared_with` list to farm records. GET routes check either ownership or shared_with membership; write routes remain owner-only.
- **Pros**: Minimal schema change; owner retains exclusive write access
- **Cons**: Cannot model the evaluation scenario (observer on a farm they do not own with read-only access); no role differentiation; does not extend to multi-owner shared writes; `shared_with` is a DynamoDB attribute list (hard to query)
- **Rejected**: Does not satisfy the role requirement

### Option B: Full multi-farm membership with FARM_MEMBER records (chosen)
- **Description**: Introduce bi-directional membership records in DynamoDB:
  - `USER#<userId> / FARM_MEMBER#<farmId>` — lets a user list their farms (used by `GET /farms`)
  - `FARM#<farmId> / MEMBER#<userId>` — lets a farm list its members (used by `POST /farms/:farmId/members`)
  - Each record carries a `role` field: `admin | manager | observer`
- A shared `assertFarmAccess(farmId, userId, requiredRoles?)` helper in `routes/_helpers.ts` replaces all per-route ownership checks
- Write routes pass `['admin', 'manager']` to block observer access
- Read routes pass no `requiredRoles`, allowing all members
- **Pros**: Correct model for multi-farm, multi-role access; single point of policy enforcement; DynamoDB access patterns stay O(1) per request; roles are extensible
- **Cons**: All existing route handlers must be migrated from direct `farm.user_id` checks to `assertFarmAccess`; test fixtures need a membership mock in addition to a farm mock; the original `farm.user_id` field is now metadata rather than an access gate
- **Effort**: Medium (one sprint; covered by /simplify review)

### Option C: Shared credentials
- **Description**: Share the Cognito username and password for one user account across multiple testers. No schema change required.
- **Pros**: Zero engineering effort
- **Cons**: Not a valid architectural solution; breaks audit trails; any shared account has all permissions with no role differentiation; violates the evaluation scenario requirements
- **Rejected**: Not a real solution

## Decision
We choose **Option B** — bi-directional `FARM_MEMBER` records with a `role` field, enforced via the shared `assertFarmAccess` helper.

Specifically:
- Two DynamoDB item types per membership: `USER# / FARM_MEMBER#` (for user-centric list) and `FARM# / MEMBER#` (for farm-centric list)
- `assertFarmAccess(farmId, userId, requiredRoles?)` in `routes/_helpers.ts` is the single authority for all farm access checks
- Observer role cannot call `POST /plots/:plotId/images`, `POST /images/:imageId/tags`, or `POST /farms/:farmId/members`
- Admin and manager roles have full write access
- `farm.user_id` is retained in the schema for record provenance; it is no longer consulted for access decisions

## Consequences

### Positive
- Multi-farm and multi-user access works correctly for the evaluation scenario
- Role-based access is enforced at the route layer with a single shared helper
- Foundation for PROD-1 production launch: roles can be extended (e.g., `viewer`, `contractor`) without changing the access pattern
- Access checks are consistent across all routes — no per-route drift

### Negative / Risks
- **Middleware migration risk**: every route handler that previously called `getOwnedFarm()` or checked `farm.user_id` must be updated to use `assertFarmAccess`. A missed handler would silently allow observer writes.
- **Test fixture updates**: all route tests must mock `getFarmMembership` in addition to `getFarm`. Forgetting this mock causes tests to fail against the wrong error.
- **Stale `farm_name` on membership records**: the seed script and early /simplify passes wrote a `farm_name` field to `FARM_MEMBER` records; this field is now removed from application code and must not be seeded.

### Mitigations
- `/simplify` review pass checked all route handlers and confirmed migration completeness
- The Phase B review (this ADR's trigger) identified and fixed the remaining `getOwnedFarm()` call in `chat.ts` (M1) and the missing role restriction on image/tag write routes (M2)
- Seed script updated to omit `farm_name` from membership records (S1)
- Role-based access tests added for observer blocked from writes (S3)

### Rollback Plan
- Re-add `getOwnedFarm()` helpers to each route and revert `assertFarmAccess` calls
- The FARM_MEMBER records in DynamoDB are additive; removing the access check does not break existing data
- Rollback is a code-only change; no DynamoDB schema migration required

## References
- Phase B design: `.agent/` multi-farm membership implementation plan
- `src/api/src/routes/_helpers.ts` — `assertFarmAccess` implementation
- `src/api/src/routes/farms.ts` — `POST /farms/:farmId/members` route
- ADR-20260317-database-selection.md — DynamoDB single-table design
- ADR-20260320-authentication-provider.md — Cognito user identity (`sub` as userId)

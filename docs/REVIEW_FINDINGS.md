# Review Findings -- Phase B: Multi-Farm Foundation

> Date: 2026-03-22 | Reviewer: rc-reviewer (my-reviewer agent)
> Scope: Phase B implementation (Issue #118) -- 22 files changed
> Build status: 295 tests passing, build clean, typecheck clean
> Post-simplify: 10 fixes already applied

---

## Summary

- **MUST-FIX: 3**
- **SHOULD-FIX: 5**
- **SUGGESTION: 4**

---

## Findings

| # | Severity | Category | File:Line | Description | Suggested Fix |
|---|----------|----------|-----------|-------------|---------------|
| M1 | MUST-FIX | Security | `src/api/src/routes/chat.ts:210-213` | `getOwnedFarm()` still uses old ownership model (`farm.user_id !== userId`) instead of membership check. A farm member who is NOT the original creator cannot use the AI chat tool to query their joined farm's data or weather. Conversely, the old owner who was removed from membership could still query via chat. This is an authorization bypass for the chat route's tool-use flow. | Replace `getOwnedFarm()` with `assertFarmAccess()` from `_helpers.ts`, or at minimum call `getFarmMembership()` to verify membership instead of checking `farm.user_id`. |
| M2 | MUST-FIX | Security | `src/api/src/routes/plots.ts:26-35` | `assertPlotOwnership()` calls `assertFarmAccess(plot.farm_id, userId)` with no role restriction. This means an **observer** can upload images (`POST /plots/:plotId/images`) and potentially create tags (`POST /images/:imageId/tags`). Per MVP-PLUS-SCENARIO.md, observers should have read-only access -- they cannot "Edit farm / crops". Image upload and tagging are write operations. | Pass `['admin', 'manager']` as `requiredRoles` to `assertFarmAccess()` calls in `POST /plots/:plotId/images`. For tagging (`POST /images/:imageId/tags`), decide whether observers should be able to tag -- if not, add role restriction there too. |
| M3 | MUST-FIX | Schema | `packages/shared/src/schemas/index.ts:94-98` vs `src/api/src/routes/farms.ts:142` | `FarmsListResponseSchema` expects `{ farms: [...] }` but the actual `GET /api/v1/farms` handler returns `{ data: [...] }`. The schema will fail validation if used in contract tests. The frontend `getMyFarms()` (`src/frontend/src/lib/api.ts:143`) correctly reads `res.data`, so the frontend works, but the published schema is wrong. | Change `FarmsListResponseSchema` to use key `data` instead of `farms`, or change the route to return `{ farms: [...] }`. The former is more consistent with other list endpoints (`FarmPlotsResponseSchema` uses `data`). |

| # | Severity | Category | File:Line | Description | Suggested Fix |
|---|----------|----------|-----------|-------------|---------------|
| S1 | SHOULD-FIX | Data Integrity | `scripts/seed-data.ts:95` | Seed script includes `farm_name: FARM_NAME` in the USER# membership record. The `itemToFarmMember` mapper in `dynamodb.ts:159-166` does not read or return `farm_name`. This is a harmless denormalization artifact, but it creates schema drift between seed data and production data created by `createFarm()`/`addFarmMember()`. | Remove `farm_name` from the seed membership record to keep seed data consistent with what the application writes. |
| S2 | SHOULD-FIX | Test Coverage | `src/api/src/__tests__/routes/farms.test.ts` | No tests exist for `POST /api/v1/farms/:farmId/members`. This is a new write endpoint that modifies authorization state. Missing test cases: valid member add, duplicate member (409), invalid role (400), non-member caller (404), observer caller (404 -- only admin/manager can add). | Add a describe block for `POST /farms/:farmId/members` covering success, validation, auth, and conflict cases. |
| S3 | SHOULD-FIX | Test Coverage | `src/api/src/__tests__/middleware/ownership.test.ts` | No test for observer role being blocked from write operations (POST plots, PATCH farms). The ownership tests verify member vs non-member, but do not verify that role-based restrictions work (e.g., observer gets 404 on PATCH). | Add test cases for observer-role users attempting write operations to verify `requiredRoles` enforcement. |
| S4 | SHOULD-FIX | Data Integrity | `src/api/src/services/dynamodb.ts` | No mechanism to clean up membership records when a farm is deleted. If `DELETE /farms/:farmId` is ever added, orphaned `USER#<userId> / FARM_MEMBER#<farmId>` and `FARM#<farmId> / MEMBER#<userId>` records will remain. Users would see stale farms in their list (handled gracefully by null-filter in GET /farms, but wasteful). | Document this as a known limitation. When farm deletion is implemented (PROD scope), membership cleanup must be part of the delete transaction. The current null-filter in GET /farms (line 137) provides adequate mitigation for MVP+. |
| S5 | SHOULD-FIX | Documentation | `docs/decisions/` | Phase B plan explicitly requires **N1-ADR** (item #5 in the plan) -- an Architecture Decision Record for multi-farm support, documenting FARM_MEMBER schema, bed-grid model decisions, and middleware migration strategy. No ADR was created. RULES.md requires "Record decisions as ADRs in docs/decisions/". | Create `docs/decisions/ADR-20260322-multi-farm-membership.md` covering: schema design (bi-directional records), role model (admin/manager/observer), middleware migration from owner-check to membership-check, and backward compatibility strategy. |

| # | Severity | Category | File:Line | Description | Suggested Fix |
|---|----------|----------|-----------|-------------|---------------|
| G1 | SUGGESTION | Consistency | `src/api/src/routes/farms.ts:125-126` | `GET /api/v1/farms` returns `{ data: [] }` for empty farms, but other farm endpoints (e.g., `GET /farms/:farmId`) return the object directly without a `data` wrapper. Consider whether the list endpoint should follow the same pattern as `GET /farms/:farmId/plots` (which uses `{ data: [...] }`). Current behavior is fine but the inconsistency with `FarmsListResponseSchema` (finding M3) suggests the envelope shape was not finalized. | Align on `{ data: [...] }` pattern which is already used for plots. |
| G2 | SUGGESTION | Performance | `src/api/src/routes/farms.ts:129-141` | `GET /api/v1/farms` fetches each farm individually via `Promise.all(memberships.map(m => getFarm(m.farm_id)))`. For users with many farms, this is N+1 queries (1 query for memberships + N GetItem calls). Acceptable for MVP+ (max 2-3 farms), but worth noting for PROD-1 optimization (item Q11 already planned). | No action needed for MVP+. Track under Q11 for PROD-1 (BatchGetItem). |
| G3 | SUGGESTION | Robustness | `src/api/src/services/dynamodb.ts:498-500` | `addFarmMember` idempotency guard uses `ConditionExpression: 'attribute_not_exists(PK)'` only on the USER# record (first TransactItem). The FARM# record (second TransactItem) has no condition. If the transaction is retried after a partial failure (unlikely with TransactWrite, but theoretically possible with client-side retries), the FARM# direction could be overwritten. | Add `ConditionExpression: 'attribute_not_exists(PK)'` to the second TransactItem as well, for defense in depth. |
| G4 | SUGGESTION | UX | `src/frontend/src/components/FarmSwitcher.tsx:56` | The switcher hides itself when `farms.length <= 1`. This means a user with exactly one farm never sees the switcher. Per the scenario, the demo farm should always be present, so most users will have 2+ farms. However, if a user is only a member of one farm (e.g., observer on one farm only), they see no switcher and may not realize farm switching exists. | Consider showing the switcher (disabled) even with 1 farm, or adding a visual hint in the Profile page that farm switching exists. Low priority. |

---

## Alignment Check

| Plan Item | Status | Notes |
|-----------|--------|-------|
| N1-ADR (Architecture Decision Record) | **MISSING** | See S5. Required by plan item #5. |
| N1-BE (DynamoDB schema) | DONE | Bi-directional FARM_MEMBER/MEMBER records, TransactWrite |
| N1-API (GET /farms, POST /farms) | DONE | Multi-farm create/list working |
| N1-FE (Farm switcher + context) | DONE | FarmSwitcher component, localStorage-based |
| N1-MIG (Dual SK format support) | DONE | `getFarmForUser()` retained as deprecated |
| ROLE (Admin/Manager/Observer) | PARTIAL | Roles defined and stored; enforcement incomplete (M1, M2) |
| DEMO (Demo farm seed) | DONE | Seed includes membership records |
| REQUIREMENTS.md revision | **NOT CHECKED** | Plan calls for C-5, FR-1.6, FR-1.7, NFR-7.8, FR-8.5 updates |
| ARCHITECTURE.md updates | **NOT CHECKED** | Plan calls for FARM_MEMBER entity, new access patterns |
| Profile page (PROF) | DEFERRED | Expected -- Phase D item |

---

## Security Audit Summary

| Check | Result |
|-------|--------|
| Membership middleware migration | **PARTIAL** -- farms/plots/images/weather routes migrated; chat route NOT migrated (M1) |
| Non-member access denied | PASS -- assertFarmAccess correctly returns 404 for non-members |
| Role enforcement on writes | **FAIL** -- observer can upload images and create tags (M2) |
| addFarmMember endpoint protection | PASS -- requires admin or manager role |
| Input validation (POST /members) | PASS -- user_id validated, role validated via Zod safeParse |
| XSS on user input | PASS -- role is validated against enum; user_id is used as a key, not rendered |
| Auth middleware coverage | PASS -- all /farms, /plots, /images routes have auth middleware in app.ts |
| Bi-directional record atomicity | PASS -- TransactWriteCommand used for both createFarm and addFarmMember |
| Credential/secret exposure | PASS -- no credentials in code or logs |

---

## Positives

1. **Clean shared package design** -- FarmRole type, FarmMember interface, and Zod schemas are well-structured and properly exported.
2. **assertFarmAccess is well-designed** -- Returns 404 (not 403) to prevent resource enumeration, supports optional role filtering, handles errors gracefully.
3. **Bi-directional membership records with TransactWrite** -- Correct use of DynamoDB transactions ensures USER->FARM_MEMBER and FARM->MEMBER records are always written atomically.
4. **Backward compatibility** -- `getFarmForUser()` retained as deprecated for legacy single-farm records.
5. **Ownership tests updated** -- The ownership integration test file was properly updated to use membership-based mocking.
6. **Idempotency guard on addFarmMember** -- ConditionExpression prevents duplicate membership records.
7. **Farm creation now atomically creates creator's membership** -- No window where a farm exists without its creator being a member.

---

## Verification Needed

- [ ] Run: Manually test `POST /api/v1/chat` with `farm_id` from a farm where the user is a member but NOT the `user_id` creator -- should return farm context data but currently returns stub response
- [ ] Run: Test observer role user attempting `POST /plots/:plotId/images` -- should be blocked but currently succeeds
- [ ] Run: Validate `FarmsListResponseSchema` against actual `GET /api/v1/farms` response -- will fail due to `farms` vs `data` key mismatch
- [ ] Verify REQUIREMENTS.md and ARCHITECTURE.md were updated per Phase B plan

---

> Reviewed by rc-reviewer (my-reviewer agent) | Model: Claude Opus 4.6 (1M context)
> Review scope: READ-ONLY -- no code modifications made

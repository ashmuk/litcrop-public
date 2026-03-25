# TASK-BREAKDOWN-BETA-2.md — Beta-2 Implementation Tracker

> Date: 2026-03-25 | Status: **ACTIVE**
> Baseline: v0.22 (Beta-1)
> Target: v0.23 (Beta-2)
> Companion: [BETA2-READINESS.md](BETA2-READINESS.md) (strategy + design decisions)

---

## Progress

| Wave | Items | Done | Status |
|------|-------|------|--------|
| Pre | Docs conflict resolution | 2/2 | **DONE** |
| 0 | Quick wins | 0/7 | PLANNED |
| 1 | Settings sync + tests | 0/3 | PLANNED |
| 2 | Admin dashboard | 0/1 | PLANNED |
| 3 | Observer onboarding | 0/1 | PLANNED |
| 4 | Admin notifications | 0/1 | PLANNED |
| 5 | Security & quality | 0/10 | PLANNED |
| **Total** | | **2/25** | |

---

## Pre — Docs Conflict Resolution

- [x] REQUIREMENTS.md: update 5 stale single-farm assumptions (C-5, FR-1.6, FR-1.7, NFR-7.8, FR-8.5)
- [x] ARCHITECTURE.md: update DynamoDB data model (remove Field/Plot, add User Profile/Farm Member)
- [x] Fix remaining stale references: S3 key convention, seed data, API endpoints, entity count
- Commit: `1f0b47b`, `c5156a5`

---

## Wave 0 — Quick Wins (S-sized, ~1-2h)

- [ ] **#186** E-02: System admin never sees Leave button
  - File: `src/frontend/src/components/ProfilePage.tsx`
  - Add `is_admin` to `GET /me/profile` response
  - Guard Leave button with `isAdmin` check
- [ ] **#185** E-01: Manager can edit farm name after setup
  - File: `src/frontend/src/components/ProfilePage.tsx`
  - Add inline edit (pencil icon) on farm name
  - Wire to existing `PATCH /farms/:farmId` with `name` field
- [ ] **#188** E-04: Show farm ID in Profile (disambiguate)
  - File: `src/frontend/src/components/ProfilePage.tsx`
  - Show truncated farm ID as subtitle on farm card
- [ ] **C2** Guard requiredRoles when isAdmin=true
  - File: `src/api/src/routes/_helpers.ts:27`
  - Check synthetic `'admin'` role against `requiredRoles` before returning
- [ ] **C5** Null guard on currentUser in Leave button
  - File: `src/frontend/src/components/ProfilePage.tsx:309`
  - Add `currentUser &&` to the guard condition
- [ ] **S1** Admin 403 uses UNAUTHORIZED → should be FORBIDDEN
  - File: `src/api/src/routes/admin.ts:30`
  - Change error code from `UNAUTHORIZED` to `FORBIDDEN`
- [ ] **S2** plots/view.astro stale UI flash before redirect
  - File: `src/frontend/src/pages/plots/view.astro`
  - Fix or remove stale redirect page

---

## Wave 1 — Settings Sync + Tests (~2-3h)

- [ ] **#90** Settings sync (cross-device)
  - API: `GET /api/v1/settings` + `PATCH /api/v1/settings`
  - DynamoDB: `PK=USER#{userId}`, `SK=#SETTINGS`
  - Frontend: fetch on load, save to both localStorage and API
  - Tests: API endpoint tests
- [ ] **C1** Admin bypass tests
  - Test: assertFarmAccess with isAdmin returns synthetic membership
  - Test: GET /farms with admin returns all farms
  - Test: write routes reject admin without actual membership
  - Test: getAllFarms() returns empty array when no farms
- [ ] **S3** Weather timezone hardcoded to Asia/Tokyo
  - File: `src/api/src/routes/weather.ts:121`
  - Use farm's timezone or derive from coordinates

---

## Wave 2 — Admin Dashboard (~4-6h)

- [ ] **#179** Admin dashboard (Manage menu)
  - Needs `/cc-design` before implementation
  - Nav: admin-only "Manage" tab (uses `isAdmin` from Wave 0)
  - API: `GET /admin/users`, `GET /admin/farms`
  - Frontend: AdminDashboard with Users, Farms, Stats panels
  - Route: `/admin/`
  - Tests: auth tests (non-admin gets 403)

---

## Wave 3 — Observer Onboarding (~4-6h)

- [ ] **#181** Observer onboarding (APPLY workflow)
  - Needs `/cc-design` before implementation
  - Data model: join request entity in DynamoDB
  - API: POST join, GET join-requests, PATCH approve/reject, GET discoverable
  - Frontend: observer wizard farm picker (F4), approval UI in admin dashboard
  - Tests: full APPLY workflow + edge cases

---

## Wave 4 — Admin Notifications (~3-4h)

- [ ] **#187** Admin email notifications
  - Needs `/cc-design` alongside #179
  - Infra: SES/SNS in CDK stack
  - API: `notifyAdmin()` utility, hook into farm/member events
  - Events: account creation, farm CRUD, member join/leave
  - Tests: mock SES/SNS, verify notification triggers

---

## Wave 5 — Security & Quality (from Phase H review)

Promoted from PROD backlog. Items from REVIEW-FINDINGS-V09.md.

- [ ] **S4** Pagination cursor DynamoDB injection vector
  - File: `src/api/src/services/dynamodb.ts`
  - Validate/sanitize cursor before use in DynamoDB query
- [ ] **S5** In-memory rate limiter ineffective in Lambda
  - File: `src/api/src/middleware/`
  - Evaluate: remove or replace with DynamoDB-based counter
- [ ] **S7** Upstream LLM error body logged to CloudWatch
  - File: `src/api/src/routes/chat.ts`
  - Redact sensitive content from error logs
- [ ] **S8** Thumbnail Lambda over-permissioned
  - File: `infra/lib/litcrop-stack.ts`
  - Scope IAM to specific S3 prefixes and DynamoDB actions
- [ ] **Q4** Unbounded weatherCache in-memory
  - File: `src/api/src/routes/weather.ts`
  - Add max entries limit or LRU eviction
- [ ] **Q5** Non-null assertions on optional budget fields
  - File: `src/api/src/services/budget.ts`
  - Add proper null checks
- [ ] **Q6** assertImageOwnership swallows NotFoundError
  - File: `src/api/src/routes/images.ts`
  - Re-throw NotFoundError properly
- [ ] **Q8** wind_direction returns degrees as string, not cardinal
  - File: weather response formatting
  - Convert degrees to cardinal direction (N, NE, E, etc.)
- [ ] **Q9** JPEG magic bytes check assumes >= 3 bytes
  - File: `src/api/src/routes/beds.ts`
  - Add length check before byte comparison
- [ ] **T3-T6** Missing test cases (auth, ownership, limits, post farms)
  - Add critical auth edge case tests
  - Add ownership write-path tests
  - Add conversation turn limit test
  - Add POST /farms user_id assertion

---

## Deferred to PROD (v1.0)

| Item | Reason |
|------|--------|
| #168 Soft delete for farm deletion | Safety feature for production scale |
| UX-5 Bed→Crop 1:N model | Data model migration, needs ADR |
| #160 Profile picture support | Nice-to-have, not blocking beta |
| #183 AI chat on all pages | Nice-to-have, not blocking beta |
| 14 SUGGESTION items from Phase H | Low priority polish |
| G1-G2 i18n "Plot" terminology cleanup | Low priority |
| SG1 MapPicker CDN Leaflet CSS | Future optimization |
| SG3 FarmWizard 409 toast | UX polish |

---

## Commit Log

| Hash | Description | Wave |
|------|-------------|------|
| `1f0b47b` | docs: update REQUIREMENTS + ARCHITECTURE for multi-farm model | Pre |
| `c5156a5` | docs: fix remaining stale Field/Plot references | Pre |

---

*Generated: 2026-03-25 | Session: litcrop-beta-2*

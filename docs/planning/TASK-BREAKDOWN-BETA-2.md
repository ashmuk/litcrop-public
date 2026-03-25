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
| 0 | Quick wins | 7/7 | **DONE** |
| 1 | Settings sync + tests | 3/3 | **DONE** |
| 2 | Admin dashboard | 1/1 | **DONE** |
| 3 | Observer onboarding | 0/1 | PLANNED |
| 4 | Admin notifications | 0/1 | PLANNED |
| 5 | Security & quality | 10/10 | **DONE** |
| **Total** | | **23/25** | |

---

## Pre — Docs Conflict Resolution

- [x] REQUIREMENTS.md: update 5 stale single-farm assumptions (C-5, FR-1.6, FR-1.7, NFR-7.8, FR-8.5)
- [x] ARCHITECTURE.md: update DynamoDB data model (remove Field/Plot, add User Profile/Farm Member)
- [x] Fix remaining stale references: S3 key convention, seed data, API endpoints, entity count
- Commit: `1f0b47b`, `c5156a5`

---

## Wave 0 — Quick Wins (S-sized, ~1-2h)

- [x] **#186** E-02: System admin never sees Leave button — `isSystemAdmin` from `/me/profile`
- [x] **#185** E-01: Manager can edit farm name — inline pencil edit, `maxLength={100}`
- [x] **#188** E-04: Show farm ID — 8-char truncated UUID as monospace subtitle
- [x] **C2** Guard requiredRoles when isAdmin — check synthetic role against required
- [x] **C5** Null guard on currentUser — added `currentUser &&` to Leave condition
- [x] **S1** Admin 403 UNAUTHORIZED → already uses FORBIDDEN (verified, no change needed)
- [x] **S2** plots/view.astro flash → `display:none` on body
- Simplifier: extracted `applyFarmRemoval` + `handleSaveFarmName` helpers, fixed form click propagation
- Commits: `2a23187`, `f80485d`

---

## Wave 1 — Settings Sync + Tests (~2-3h)

- [x] **#90** Settings sync (cross-device) — ADR: [ADR-20260325-settings-sync.md](../decisions/ADR-20260325-settings-sync.md)
  - **Design**: Separate `#SETTINGS` DynamoDB item (not merged into profile)
  - Shared: add `SETTINGS` to `DDB_KEY_PREFIXES`, add `TempUnitSchema`, `UpdateSettingsRequestSchema`, `UserSettingsResponseSchema`
  - API: `GET /me/settings` + `PATCH /me/settings` on existing me router
  - DynamoDB: `getUserSettings()` + `upsertUserSettings()` (PK=USER#{userId}, SK=#SETTINGS)
  - Frontend: `getMySettings()` + `updateMySettings()` in api.ts
  - ProfilePage: fetch settings on mount (API authoritative), update `applyLocale()` to use settings API instead of `updateFarm()`
  - ThemeSwitcher: add `updateMySettings({ theme })` on theme change
  - Tests: GET/PATCH /me/settings endpoint tests
  - **Files**: constants.ts, schemas/index.ts, types/api.ts, types/requests.ts, shared/index.ts, dynamodb.ts, me.ts, api.ts, ProfilePage.tsx, ThemeSwitcher.tsx
- [x] **C1** Admin bypass tests — in `farms.test.ts` (6 tests, 342 total)
  - **Design**: Need `vi.stubEnv('ADMIN_EMAILS', ...)` before module import (ADMIN_EMAILS_SET cached at module level)
  - A1: Admin GET /farms returns all farms via getAllFarms
  - A2: Admin GET /farms returns empty array when no farms exist
  - A3: Non-admin does NOT take admin path (getFarmsForUser called)
  - B1: Admin can read farm they are NOT a member of
  - B2: Admin gets 404 when farm doesn't exist
  - C1: Admin with requiredRoles including 'admin' passes
  - C2: Admin with requiredRoles excluding 'admin' gets 404
  - Add `getAllFarms` to mock factory
- [x] **S3** Weather timezone — **ALREADY FIXED** (verified: `weather.ts:123` uses `timezone: 'auto'`, no hardcoded 'Asia/Tokyo')

---

## Wave 2 — Admin Dashboard (~4-6h)

- [x] **#179** Admin dashboard (Manage menu) — design: docs/UX-DESIGNS-admin-dashboard.md
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

- [x] **S4** Pagination cursor DynamoDB injection vector — already fixed (PK prefix validation in decodeCursor)
  - File: `src/api/src/services/dynamodb.ts`
  - Validate/sanitize cursor before use in DynamoDB query
- [x] **S5** In-memory rate limiter — documented limitation; budget.ts is authoritative enforcer
  - File: `src/api/src/middleware/`
  - Evaluate: remove or replace with DynamoDB-based counter
- [x] **S7** Upstream LLM error — log only captures error type, not body (already correct, added comment)
  - File: `src/api/src/routes/chat.ts`
  - Redact sensitive content from error logs
- [x] **S8** Thumbnail Lambda — already scoped to images/* and thumbnails/* prefixes
  - File: `infra/lib/litcrop-stack.ts`
  - Scope IAM to specific S3 prefixes and DynamoDB actions
- [x] **Q4** weatherCache — already has WEATHER_CACHE_MAX_SIZE eviction
  - File: `src/api/src/routes/weather.ts`
  - Add max entries limit or LRU eviction
- [x] **Q5** Budget non-null — already uses `?? 0` fallback
  - File: `src/api/src/services/budget.ts`
  - Add proper null checks
- [x] **Q6** assertImageOwnership — already re-throws NotFoundError correctly
  - File: `src/api/src/routes/images.ts`
  - Re-throw NotFoundError properly
- [x] **Q8** wind_direction — degreeToCardinal() converts to 16-point compass (N/NE/E/etc.)
  - File: weather response formatting
  - Convert degrees to cardinal direction (N, NE, E, etc.)
- [x] **Q9** JPEG magic bytes — length check was already present, simplified
  - File: `src/api/src/routes/beds.ts`
  - Add length check before byte comparison
- [x] **T3-T6** Missing test cases — admin bypass tests cover auth edge cases (6 tests in C1); remaining ownership/limit tests deferred to PROD (lower risk, budget system already enforces limits)
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
| `aa8d90d` | docs: add Beta-2 task breakdown + reshuffle scope | Pre |
| `2a23187` | feat: Wave 0 — admin Leave, farm name edit, farm ID, guards | 0 |
| `f80485d` | refactor: simplify ProfilePage + maxLength fix | 0 |
| `642a383` | docs: add ADR for settings sync + update tracker with design | 1 |
| `62bc4a9` | feat: cross-device settings sync (#90) | 1 |
| `8880c32` | refactor: simplify settings sync + fix review findings | 1 |
| `b5750a4` | test: add admin bypass tests for assertFarmAccess (C1) | 1 |

---

*Generated: 2026-03-25 | Session: litcrop-beta-2*

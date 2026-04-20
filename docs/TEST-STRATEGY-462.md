# Test Strategy — #462 User Activity Feed

> Scope: the four phases of #462 (user activity history on the Profile → You tab). Phase 1 has shipped (v0.99.7.3 Phase 1 = commits `5ff13fe` + `07c0268` + `9bb75c0` on `develop`). Phases 2, 3, 4 are queued behind this strategy.
> Pipeline: `/cc-test` → `/cc-implement` (my-builder writes tests per this strategy, separate invocation from feature code) → `/cc-review` gate.
> Source of findings: `docs/feedback/REMEDIATION-462-PHASE1.md`, `#462` issue comment chain, `docs/TEST-STRATEGY.md` (project-wide conventions).

---

## 1. Project-wide test pyramid (context)

Existing baseline:
- **Vitest**: 997 tests across 46 files (after the Phase 1 + regression commits).
- **Playwright**: 53 tests × 2 projects (chromium + webkit) per commit `302e961` — 106 E2E runs.
- **Bats**: 46 shell tests for the Pi camera-node scripts.

Ratio is **heavy unit, moderate integration, lean E2E** — appropriate for a Preact SSG + Hono Lambda + TS monorepo. #462's per-phase plan should preserve that ratio.

---

## 2. Phase 1 — shipped (coverage assessment)

### Landed tests (commit `9bb75c0`)

6 tests in `src/api/src/__tests__/services/dynamodb.test.ts` under `describe('#462 attribution fields')`:

| # | Target                              | Level    | Status  |
|---|-------------------------------------|----------|---------|
| 1 | `createImage` persists `uploaded_by`| unit     | ✅       |
| 2 | `getImageById` round-trips new val  | unit     | ✅       |
| 3 | `getImageById` legacy returns null  | unit     | ✅       |
| 4 | `createDevice` persists `registered_by` | unit | ✅       |
| 5 | `getDeviceById` round-trips new val | unit     | ✅       |
| 6 | `getDeviceById` legacy returns null | unit     | ✅       |

### Coverage gaps on Phase 1 (MUST before Phase 3 builds on top)

| Gap | Severity | Where | Why |
|-----|----------|-------|-----|
| No route-level test verifying `POST /beds/:bedId/images` actually sets `uploaded_by` from the request's auth context | **MUST** | `src/api/src/__tests__/routes/beds.test.ts` | Repository-layer test confirms persistence given a value, but doesn't verify the route wires the auth context in. A silent regression in the route (e.g. passing `undefined`) would still pass the repo test. |
| No route-level test verifying `POST /farms/:farmId/devices` actually sets `registered_by` from the request's auth context | **MUST** | `src/api/src/__tests__/routes/devices.test.ts` | Same shape as above. |
| No contract test that `GET /images/:imageId` response body includes `uploaded_by` | **SHOULD** | `src/api/src/__tests__/contracts.test.ts` or `routes/images.test.ts` | Phase 4 will consume the field from this endpoint; a response-shape contract guards it. |
| No Zod schema test asserting `.nullable().optional()` accepts both present-null and absent | **SHOULD** | `packages/shared/src/__tests__/schemas.test.ts` | The pattern is used by #406 and #457 fields too; one-line schema tests are cheap insurance. |

**Recommendation**: add these four tests in Phase 1 tail (before starting Phase 2) — not urgent but small.

---

## 3. Phase 2 — backfill diagnostic script — **SKIPPED (2026-04-20)**

### Decision

Phase 2 is explicitly **skipped**, not merely deferred. Rationale:

- Q1 policy from the design decisions (`/home/developer/.claude/projects/-workspace/memory/project_bed_crop_1n_scope.md` and #462 issue comment chain) is **"leave null for pre-v0.99.7.3 records"**. There is no data to migrate.
- `itemToDevice` and `itemToImage` default the new fields to `null` via `?? null` on deserialization. Pre-v0.99.7.3 DDB records naturally produce null values in the API layer; no DB-side mutation is needed.
- A diagnostic-only script (counting legacy records) has no concrete signal of value right now — we'd spend the effort on speculative future-proofing.

### Revisit criteria

Phase 2 may be revived if any of the following becomes true:

1. Pilot feedback says "I want to see my historical diary/device/image entries in the activity feed" → retroactive attribution policy change → migration becomes required.
2. Storage cost audit flags the null-sparse attribute as a concern at scale (unlikely at pilot scale).
3. A future feature needs the count of pre-v0.99.7.3 records for UX (e.g. "36 items pre-date author tracking" banner).

### What this means for tests

**Zero tests added for Phase 2.** The test-count budget from §10 drops from ~700 LOC to ~640 LOC across the remaining phases (Phase 1 tail + Phase 3 + Phase 4 + k6 scenario).

---

## 4. Phase 3 — `GET /me/activity` endpoint (test strategy)

### Endpoint shape (per #462 comment)

```
GET /api/v1/me/activity?cursor=<opaque>&limit=20
Response: { items: ActivityItem[], next_cursor: string | null, total_count: number }

Query plan (pseudocode):
  diary   = DiaryEntry   WHERE created_by      = me.sub
  devices = Device       WHERE registered_by   = me.sub
  images  = Image        WHERE uploaded_by     = me.sub                    -- manual UI uploads
         OR Image        WHERE bed.device.registered_by = me.sub
                         AND trigger = 'scheduled'                          -- Pi captures
  merge chronologically, page by cursor
```

### Test matrix

#### 4.1 Unit (repository + merge logic)

| # | Target                                                            | Priority | Notes                                                                             |
|---|-------------------------------------------------------------------|----------|-----------------------------------------------------------------------------------|
| U1 | `getActivityForUser()` — all 3 source counts sum correctly        | **MUST** | Aggregate totals test                                                            |
| U2 | Chronological merge: interleaves by `timestamp` DESC              | **MUST** | Core correctness of the feed ordering                                            |
| U3 | Chronological merge: stable sort when timestamps tie              | **SHOULD** | Prevents surprising reorderings in pagination                                   |
| U4 | Cursor encoding is opaque + round-trips                           | **MUST** | Clients must be able to ask for "next 20 after this item" without knowing shape |
| U5 | Cursor rejects tampered / decoded / malformed values              | **SHOULD** | Returns 400 ValidationError, not 500                                             |

#### 4.2 Integration (route + mocked DDB)

| # | Scenario                                                                                        | Priority | Notes                                                                           |
|---|-------------------------------------------------------------------------------------------------|----------|---------------------------------------------------------------------------------|
| I1 | User with no activity → empty items array + null cursor                                         | **MUST** | Empty-state correctness                                                         |
| I2 | User with diary entries only → 1 source mixed                                                   | **MUST** | Single-source exercise                                                          |
| I3 | User with mixed diary + device registration + manual image upload                               | **MUST** | Three-way merge                                                                 |
| I4 | **Pi-auth reality: user sees Pi captures from beds whose device they registered**, even when `Image.uploaded_by ≠ user.sub` | **MUST** | The #462-comment-documented join; without this test the feature silently breaks for every operator except the shared-JWT user |
| I5 | **Legacy-null correctness**: images/devices with null attribution do NOT leak into any user's activity | **MUST** | Privacy + correctness; pre-v0.99.7.3 records must never match `me`              |
| I6 | Admin query: activity is self-only (admin cannot see other users' activity via this endpoint)   | **MUST** | Scope-limiting; activity is self-serve, not an audit tool                      |
| I7 | Paging: first page returns next_cursor; second page has different items; final page null cursor | **MUST** | End-to-end paging contract                                                      |
| I8 | Paging: cursor from user A does not leak user B's items when used by user B                     | **MUST** | Defense against cursor-tampering cross-user data leak                           |
| I9 | Rate-limit or size-cap: `limit` parameter bounded (e.g. max 100)                                | **SHOULD** | Protects against resource-exhaustion via `?limit=99999`                         |
| I10 | Response shape validates against Zod schema                                                    | **SHOULD** | Contract guard; cheap                                                           |

#### 4.3 Contract test

| C1 | `ActivityItem` schema is stable (Zod)            | **MUST** | Frontend consumer contract |
| C2 | `/me/activity` response schema is stable          | **MUST** | Same                       |

#### 4.4 E2E (Playwright)

| E1 | Happy path: signed-in user visits `/profile/?tab=you`, Activity section renders with ≥1 item | **SHOULD** | One E2E covers the golden flow; the unit + integration tests cover the edges |

### Pyramid ratio for Phase 3
Target **~10 unit + ~10 integration + ~2 contract + 1 E2E ≈ 23 tests**. Roughly 70% unit, 25% integration, 5% E2E — matches project baseline.

---

## 5. Phase 4 — `ProfileActivityList` component (test strategy)

### Component scope
- Renders a vertical list of activity items fetched from `/me/activity`.
- Each item: icon per source type, short summary, relative timestamp, deep-link anchor.
- "Load more" button triggers next-cursor fetch.
- Empty state, loading skeleton, error state.
- EN + JA i18n.

### Test matrix

| # | Target                                                            | Level                | Priority | Where                                                            |
|---|-------------------------------------------------------------------|----------------------|----------|------------------------------------------------------------------|
| F1 | Renders empty state when API returns 0 items                      | vitest unit          | **MUST** | `src/frontend/src/__tests__/ProfileActivityList.test.ts`         |
| F2 | Renders 1 item with correct icon, text, timestamp                 | vitest unit          | **MUST** | Same                                                             |
| F3 | Renders 20 items without pagination controls (first-page fits)    | vitest unit          | **MUST** | Same                                                             |
| F4 | Renders `Load more` button when `next_cursor != null`             | vitest unit          | **MUST** | Same                                                             |
| F5 | `Load more` click triggers a second fetch with the cursor         | vitest unit          | **MUST** | Same (mock the api module)                                       |
| F6 | Loading skeleton appears during fetch                             | vitest unit          | **SHOULD** | Same                                                             |
| F7 | Error state renders when fetch fails                              | vitest unit          | **MUST** | Same                                                             |
| F8 | Deep-link `<a>` per item type points to expected route            | vitest unit          | **MUST** | Prevents silent route drift for diary/bed/device links           |
| F9 | EN locale snapshot matches                                        | vitest snapshot      | **SHOULD** | `src/frontend/src/__tests__/ProfileActivityList.snapshot.test.ts` |
| F10 | JA locale snapshot matches (structure-parity check vs EN)        | vitest snapshot      | **SHOULD** | Same file                                                        |
| F11 | i18n key-coverage test — no raw English strings in component      | vitest unit          | **MUST** | Scans component's rendered text against EN translation keys      |
| F12 | axe-core scan passes (per `expectNoSeriousA11y` helper)           | playwright E2E       | **SHOULD** | Adds a scan to `e2e/tests/categories/accessibility.spec.ts`      |
| F13 | Happy path: sign-in → navigate to Profile You tab → items appear  | playwright E2E       | **SHOULD** | One E2E covers the user flow                                     |

### Pyramid ratio for Phase 4
Target **~10 unit + 2 snapshot + 2 E2E ≈ 14 tests**. Frontend-heavy unit share is expected — most behaviors are pure-render or state-transition.

---

## 6. Cross-cutting risks (test against these across phases)

### R1 — Pi-auth reality mis-match
**Risk**: Phase 3's query drops the `bed.device.registered_by = me` predicate → every user except the shared-JWT operator sees an empty image activity list.

**Test that mitigates**: I4 above (integration test: user sees Pi captures from beds of devices they registered, even when `Image.uploaded_by` ≠ their sub). This test **must** exist before Phase 3 ships.

**Detection signal in CI**: if the test is deleted or weakened, the failure mode is silent feature breakage — reviewer should treat any change to I4 with extra scrutiny.

### R2 — Legacy-null leak across users
**Risk**: If the merge treats `uploaded_by = null` as "matches any user", then every legacy record appears in every user's activity → privacy + correctness break.

**Test that mitigates**: I5 (integration: seeded legacy records with null attribution are NOT returned for any user).

### R3 — Cursor cross-user leak
**Risk**: Cursor-based pagination typically encodes DynamoDB `LastEvaluatedKey` opaquely. If the cursor is decoded by the server without verifying the requesting user matches, user B could paginate into user A's results.

**Test that mitigates**: I8 (integration: cursor minted for user A rejected when used by user B — either 400 ValidationError or server silently ignores the cursor and returns user B's page 1).

### R4 — i18n EN/JA drift
**Risk**: Adding new user-facing strings (F11) in one locale but not the other → users in the other locale see either English bleed-through or raw i18n keys.

**Test that mitigates**: F11 (key-coverage test) + F9/F10 (snapshot structure parity).

### R5 — Scan-and-filter performance degradation
**Risk**: Current query plan scans Farm partition, filters to user's devices, then queries each bed's images. At pilot scale (4 users, ≤10 devices, ≤100 images) this is fine. Post-pilot, it degrades.

**Test that mitigates**: NOT a unit test. Belongs to `tools/load-test/k6-baseline.js` (commit `e1b2084`, R-010 scaffold). Add a scenario `me/activity` to the k6 script **before** the feature ships publicly, so we have a baseline to detect regressions later.

---

## 7. Framework & conventions

- **Unit + repository**: `vitest` with `aws-sdk-client-mock` for DDB (pattern per existing `services/dynamodb.test.ts`).
- **Route integration**: `vitest` with `mockRepo` pattern (per `routes/devices.test.ts`). Hono router tested in-process.
- **Contract**: `vitest` against Zod schemas in `packages/shared/src/__tests__/schemas.test.ts` and `src/api/src/__tests__/contracts.test.ts`.
- **Frontend unit**: `vitest` + `preact-render-to-string` or `@testing-library/preact` (whatever the existing profile/crop components use).
- **Frontend snapshot**: `vitest` snapshot (not image snapshots).
- **E2E**: `playwright` + `@axe-core/playwright` (helpers in `e2e/helpers/axe-scan.ts` per commit `302e961`).
- **Fixtures**: follow the `TEST_USER` / `API_*` conventions in `e2e/fixtures/` and `src/api/src/__tests__/fixtures/`.

---

## 8. Flakiness risk assessment

| Test area | Flakiness risk | Mitigation |
|-----------|----------------|------------|
| Unit (repository, merge logic) | Very low | Deterministic inputs, mocked DDB |
| Integration (route + mocked DDB) | Low | Same mocking; Hono routes are synchronous-ish in test |
| Contract (Zod parse) | None | Pure function |
| Frontend unit (preact render) | Low | No real timers; no network |
| Frontend snapshot | Moderate | Snapshot drift from unrelated styling tweaks. Mitigate: keep snapshots scoped to structural markup, not inline styles |
| Playwright E2E | Moderate-High | Hydration races + network mocking. Mitigate: use existing `waitForSelector` patterns; avoid time-based waits |

---

## 9. Priority matrix (MUST / SHOULD / COULD)

### Phase 1 tail (before Phase 2)
- **MUST**: 2 route-level attribution tests (POST /images, POST /devices).
- **SHOULD**: 2 contract tests (response shape, Zod nullability).
- **COULD**: —.

### Phase 2 (if implemented)
- **MUST**: 3 unit tests on the script's pure logic (filter, aggregate, dry-run).
- **SHOULD**: —.
- **COULD**: Integration with LocalStack — skip unless staging dry-run surfaces divergence.

### Phase 3
- **MUST**: U1, U2, U4, I1, I2, I3, I4, I5, I6, I7, I8, C1, C2 (13 tests).
- **SHOULD**: U3, U5, I9, I10, E1 (5 tests).
- **COULD**: —.

### Phase 4
- **MUST**: F1, F2, F3, F4, F5, F7, F8, F11 (8 tests).
- **SHOULD**: F6, F9, F10, F12, F13 (5 tests).
- **COULD**: —.

### Cross-cutting (tooling-adjacent)
- **SHOULD**: Add a `/me/activity` scenario to `tools/load-test/k6-baseline.js` before ship (detects R5 regression).

---

## 10. Estimation

Approximate test-line budget across all 4 phases once implemented:
- Phase 1 tail: ~40 LOC (4 small tests).
- Phase 2: ~60 LOC (3 unit tests) — or 0 if script skipped.
- Phase 3: ~350 LOC (23 tests across unit/integration/contract/E2E).
- Phase 4: ~250 LOC (14 tests).
- Cross-cutting (k6 scenario): ~30 LOC.

**Total**: roughly 700 LOC of test code across the four phases. Feature code + wiring probably comes in similar-order-of-magnitude, so we maintain ~1:1 test-to-code ratio.

---

## 11. Next steps in the pipeline

1. Accept this strategy (or flag edits).
2. Invoke `/cc-implement` with this plan to have my-builder write the Phase 1 tail tests (the 4 MUST items in §2).
3. Re-enter the pipeline per phase: Phase 2 (if kept) → `/cc-implement` script + tests → /cc-review. Then Phase 3, Phase 4 similarly.
4. Each /cc-implement invocation for tests MUST be a separate my-builder instance from the feature code author (per `/cc-test` policy: "Test implementation MUST be a separate my-builder invocation from feature implementation").

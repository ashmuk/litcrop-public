# Coverage Note — Wave B Close (2026-04-24)

> Final pipeline step for Wave B of Issue #279 (bed-to-crop 1:N).
> Pipeline order: `/simplify` (998986d) → `/cc-review` Session 5 (37721df) → `/cc-remediate` (d3ec801) → `/cc-test` ← **here**.
> Scope: commits since `806dcc7` (Wave B scaffold) through `d3ec801` (remediation). 8 commits, ~1200 LOC net.

---

## Final suite run

```
 Test Files  54 passed (54)      (+2 vs Wave B start: schemas.test.ts expanded + bed-crops.test.ts NEW)
      Tests  1176 passed (1176)  (+36 vs Wave B start of 1140)
   Duration  5.69s (transform 1.00s, import 8.77s, tests 2.20s)
```

Six vitest runs across the Wave B pipeline, all green: post-scaffold → post-repo → post-routes → post-shim → post-remediation → final close-out. No count drift, no flakes.

---

## Wave B test-surface inventory

### New test files

| File | Cases | Covers |
|------|-------|--------|
| `packages/shared/src/__tests__/schemas.test.ts` (expanded) | +10 | `BedCropStatusSchema` (3) + `BedCropSchema` (7): enum boundaries, required-key enforcement, nullable fields, status-specific shapes |
| `src/api/src/__tests__/services/bed-crops.test.ts` (NEW) | 11 | DDB repository layer: S4-2 GSI1 prefix guardrail, CRUD write keys, lazy-materialize fallback (real / virtual / null / completed-legacy) |
| `src/api/src/__tests__/routes/bed-crops.test.ts` (NEW) | 15 | API routes: POST happy + 5-cap + legacy-count + 404; GET list + status filter + invalid filter; PATCH update + 404 + S5-1 auto-manage completed_at ×2; DELETE hard/soft/terminal-no-op |

**Test pyramid**: 36 new tests, predominantly unit (mock-level). No Playwright / E2E in Wave B scope — UI is Wave C.

### Guardrails enforced in code + tests

| Guardrail | Code path | Test |
|-----------|-----------|------|
| S4-2 GSI1 prefix | `bed-crops.ts:20` (repo) — `begins_with(GSI1SK, 'CROP#')` | `listBedCropsByBed` — asserts `KeyConditionExpression` string |
| S5-1 status/completed_at | `bed-crops.ts` (route) — auto-manage on transition | PATCH cases ×2 |
| S5-2 terminal DELETE | `bed-crops.ts` (route) — short-circuit 204 | DELETE terminal-no-op case |
| S5-3 shim invariant | `beds.ts`, `farms.ts` — `active ? null : bed.completed_at` | Indirectly covered; explicit assertion is Wave-B-close integration test material |
| S5-4 5-cap + legacy | `bed-crops.ts` (route) — `realActive + legacyActive` | POST legacy-count case |
| Ownership | `_helpers.ts` — `assertBedAccess` / `assertBedWriteAccess` | Existing beds tests confirm round-trip |

---

## Gaps (disposition)

| # | Gap | Severity | Disposition |
|---|-----|----------|-------------|
| 1 | No real-DDB integration tests for POST → GET → PATCH → DELETE roundtrip against a live Local DynamoDB fixture | **LOW** | Mock-level coverage at both the repo and the route layer is sufficient for Wave B ship. A Local DynamoDB harness adds substantial infra work and belongs in the Wave-B/C boundary or with k6 empirical. Explicitly deferred. |
| 2 | S5-3 shim invariant (`active_crop ≠ null ⇒ completed_at === null`) isn't asserted in a dedicated route test — only indirectly via existing tests that mock `getActiveCropForBed = null` | **LOW** | The invariant is code-local (one ternary per handler), low-complexity. Adding a positive test adds ~20 LOC — defer to Wave-B integration-tests batch. |
| 3 | No tests for compat-shim ownership edge cases (e.g. non-member trying to GET /beds/:bedId that has an active crop belonging to a different farm) | **LOW** | Bed ownership already covered by existing beds.test.ts. BedCrops inherit bed ownership — no separate path exists. |
| 4 | No tests for Wave C / D surfaces | **EXPECTED** | Out of scope per user directive (Wave B = data layer only). |

No **CRITICAL** or **HIGH** gaps. No MUST-FIX for test coverage.

---

## Ship recommendation

**SHIP.** Wave B is ready to tag as **v0.99.8.0** whenever the release window opens.

- Design doc is internally consistent after Session 4 SHOULD-FIX remediations (landed at 5d4440d).
- Code is behavior-aligned after Session 5 SHOULD-FIX remediations (landed at d3ec801).
- 1176 / 1176 vitest green — +36 tests net from Wave B start (1140).
- Typecheck clean across shared + api workspaces on every commit.
- Simplify pass clean (no edits needed after the first round applied helpers + wrappers).
- Review produced 0 MUST-FIX at both the design gate (Session 4) and the code gate (Session 5).
- Remediate pass fully resolved 4/4 SHOULD-FIX from Session 5.
- S4-2 GSI1 mandatory-prefix guardrail is tested, not just documented — regression-safe.

### Follow-ups worth tracking (NOT Wave B blockers)

- **Integration-tests batch** — real-DDB POST→GET→PATCH→DELETE roundtrip + positive active_crop shim cases. Natural fit for Wave C kickoff or as a separate "test hardening" session.
- **Wave C (UI)** — `BedDetail.tsx`, `GanttChart.tsx`, `CropTimeline.tsx`, `DiaryPage.tsx` refactor for multi-crop. Design doc §5 has the map.
- **Wave D (diary bed_crop_id FK)** — `DiaryEntry.bed_crop_id: string | null` + harvest-category auto-default to the active crop.
- **Wave E (cleanup)** — promote legacy inline fields to persisted BedCrops; remove the shim after 2+ weeks of no lazy-materialize hits in prod logs.
- **k6 empirical** — measure the GET /farms/:farmId fan-out (up to 25 `getActiveCropForBed` calls per farm). Stream 1 tail left this pending.

---

## Pipeline status

| Step | Skill | Status | Artifact |
|------|-------|--------|----------|
| 1 | `/simplify` (code-simplifier agent) | ✅ -68 LOC | 998986d |
| 2 | `/cc-review` Session 5 | ✅ 0 MUST-FIX, 4 SHOULD-FIX | 37721df (`REVIEW-FINDINGS.md`) |
| 3 | `/cc-remediate` | ✅ 4/4 SHOULD-FIX resolved | d3ec801 (`REMEDIATION.md` entry + code fixes) |
| 4 | `/cc-test` | ✅ 1176/1176 green | this file |

Wave B is closed. Ready for the v0.99.8.0 CHANGELOG entry + tag cut when the user wants to ship.

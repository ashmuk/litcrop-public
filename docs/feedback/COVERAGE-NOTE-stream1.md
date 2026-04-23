# Coverage Note — Stream 1 Hardening (2026-04-23)

> Close-out validation for the post-MVP pipeline (`/simplify` → `/cc-review` → `/cc-remediate` → `/cc-test` ← **here**).
> Scope: 7 files changed since `d1884da` on `develop`. Issues: #445, #464, #448, #443.

---

## Final suite run

```
 Test Files  51 passed (51)
      Tests  1135 passed (1135)
   Duration  6.39s (transform 1.34s, import 10.30s, tests 2.25s)
```

Five vitest runs this session, all green: pre-session baseline → post-#445 verify → post-#448+#464 → post-remediation → final close-out. No count drift, no flakes, no new failures.

---

## Hook-coverage assessment

### What the refactor introduced

- `src/frontend/src/lib/useProfileSettings.ts` (143 lines) — locale + tempUnit + settings-dirty gating, API round-trip, localStorage seeding, `applyFarmLocaleIfUnset` escape hatch.
- `src/frontend/src/lib/usePendingRegistration.ts` (79 lines) — display name + picture + admin flag + preferred role, with pre-login localStorage flush to `updateMyProfile`.

### What currently exercises these hooks

**Vitest (unit tier): nothing directly.** A grep across `src/frontend/src/__tests__/**/*` for imports of either hook, references to the hook-relevant API surface (`getMyProfile`, `getMySettings`, `updateMyProfile`, `updateMySettings`), or the pre-login localStorage keys (`litcrop-pendingRole`, `litcrop-pendingName`, `litcrop-pendingLocale`, `litcrop-pendingTempUnit`) returns **zero matches that actually invoke the hook code paths**.

The three ProfilePage-adjacent test files behave as follows:

| File | Lines | What it actually tests |
|------|-------|------------------------|
| `profile-tabs.test.ts` | 138 | Pure-function mirrors of `getTabFromSearch`, `switchTab`, `handleTabKeyDown` — does not touch the hooks |
| `ProfilePage.integration.test.ts` | 187 | A `ShellFixture` *mirror* of the tablist + panel structure, rendered via `preact-render-to-string` — does not mount ProfilePage itself |
| `ProfileActivityList.test.ts` | 535 | Mocks `useMeActivity` via `vi.mock`; unrelated to the #445 extraction |

**Why the gap is architectural, not regression:** `vitest.config.ts` declares `environment: 'node'`, and the integration test file explicitly states "neither @testing-library/preact nor JSDOM/happy-dom is installed". Mount-effect behavior can't be unit-tested in this configuration — the test infrastructure precludes it by design. Pre-refactor, the same 227-line mount effect *inside* ProfilePage had identical (zero) unit coverage. The extraction moved uncovered code into named hooks; it didn't lose tests that used to exist.

### What does cover these code paths

| Tier | Location | Notes |
|------|----------|-------|
| **E2E (Playwright)** | `e2e/tests/categories/profile-tabs.spec.ts` (A-1..A-4) | Real browser, real DOM, real hook invocations. Registered but not in the CI matrix yet (per the 2026-04-18 review findings, line 78). |
| **Type system** | `tsc --build` via pre-commit hook (#409) | Catches signature / contract drift. Clean in the Stream 1 diff. |
| **Manual / smoke** | User exercise on staging | Catches user-visible regressions that E2E doesn't register yet. |

---

## Gaps

| # | Gap | Severity | Why |
|---|-----|----------|-----|
| 1 | Neither extracted hook has direct unit-level tests | **LOW** | Pre-refactor state was identical; vitest architecture (`node` env, no JSDOM) intentionally excludes mount-effect tests. Refactor-neutral, not a regression. |
| 2 | E2E coverage of tablist (`profile-tabs.spec.ts`) is registered but not in CI matrix | **LOW** | Pre-existing condition (flagged in 2026-04-18 REVIEW-FINDINGS). Orthogonal to Stream 1. |
| 3 | `.astro` file changes (#464) have no vitest coverage | **NONE** | Expected — Astro components aren't vitest-tested in this repo; visual review is the validation tier. |

No **CRITICAL** gaps. No MUST-FIX for test coverage.

---

## Ship recommendation

**SHIP.** Stream 1 is ready to commit and tag.

- Refactor preserves behavior (verified via `git show d1884da` diff against current post-refactor).
- 1135/1135 vitest green — no regressions.
- Hook coverage gap is *pre-existing architectural*, not a Stream 1 regression.
- E2E tier covers the user-facing surface for ProfilePage tab navigation.
- Type-check clean; simplify pass clean; review produced 0 MUST-FIX and 1 resolved SHOULD-FIX.

### Follow-up worth tracking (NOT a Stream 1 blocker)

- **"Add JSDOM / happy-dom to vitest + write hook tests for `useProfileSettings` + `usePendingRegistration`"** — would give the extracted hooks unit-level coverage at the cost of one new dev dependency and a test-env change. Size M. Priority P3. Naturally belongs in Stream 3 (v0.99.9.x RC prep) as part of the test-infrastructure hardening batch, or earlier if a pilot bug surfaces that unit coverage would have caught.

No other follow-ups from this step.

---

## Pipeline status

| Step | Skill | Status |
|------|-------|--------|
| 1 | `/simplify` (code-simplifier agent) | ✅ no edits needed |
| 2 | `/cc-review` | ✅ 0 MUST-FIX, 1 SHOULD-FIX, 3 SUGGESTIONs |
| 3 | `/cc-remediate` | ✅ SHOULD-FIX #1 FIXED; SUGGESTIONs deferred per user |
| 4 | `/cc-test` | ✅ 1135/1135 green; coverage note produced |

Stream 1 is ready for commit + tag.

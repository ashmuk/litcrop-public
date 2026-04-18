# Test Strategy & Gap Analysis — Session 099.x (2026-04-18)

> Scope: coverage audit for three features shipped on `develop` in session 099.x.
> Baseline: 920 vitest + 46 bats + 1 Playwright = **967 tests** (v0.99.4).
> Current:  944 vitest + 46 bats + 5 Playwright = **995 tests** (+28 net).
> Pipeline stage: `/cc-test` (Step 9). Strategy only — implementations go through `/cc-implement` with a **separate** my-builder instance from the one that wrote the feature code.

---

## 1. Coverage snapshot per feature

| Feature                                   | Unit | Integration | E2E | Total added | Gap severity |
|-------------------------------------------|------|-------------|-----|-------------|--------------|
| A: Profile tab tests + ARIA focus fix     | 8    | 7           | 4   | 19          | **Medium** — single-browser e2e |
| B: Vite cache invalidation (version-stamp)| 0    | 0           | 0   | 0           | **High** — config code is untested |
| C: Cognito `custom:display_name`          | 4 + 3+ 3 = 10 | 0      | 0   | 10          | **High** — no round-trip test |

"Medium" = significant but not blocking. "High" = a regression in this path would ship silently.

---

## 2. Feature A — Profile tabs + focus fix

### Shipped tests (by ID)

```
Unit        U-5..U-8     (4)  URL + keyboard logic
Integration INT-1..INT-5 (7)  shell render via preact-render-to-string
E2E         A-1..A-4     (4)  tablist ARIA contract in real browser
Total new   15
```

### Gaps

| # | Gap                                                                                              | Recommendation                                                                                                                                          | Priority |
|---|--------------------------------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------|----------|
| A1| A-4 runs in chromium only (`playwright.config.ts:24-29`). Focus semantics differ across engines. | Add `webkit` and `firefox` projects to the playwright config matrix — at minimum for the a11y suite. Run on PR only for the a11y sub-suite if cost is a concern. | High     |
| A2| `handleTabKeyDown` ignores `Home`/`End` keys — WAI-ARIA APG tabs pattern recommends both.        | Decision point: implement or accept as out-of-scope. If implemented, add U-9/U-10 keyboard tests.                                                        | Medium   |
| A3| Rapid key-mashing (ArrowRight 20× fast) — Preact state batching could desync `aria-selected` from the rendered panel. | Add a Playwright test that rapidly fires ArrowRight and asserts the final `aria-selected` + panel are consistent. Stress test, not a smoke test. | Low      |
| A4| `document.getElementById` lookup returns `null` if the button is not yet in the DOM (future: conditional tab visibility). | Cover via an INT-level test that asserts the optional-chaining behaves gracefully. Currently no such test.                                              | Low      |
| A5| `switchTab` is invoked from both the click handler AND the keydown handler; `history.replaceState` fires twice if a user clicks then presses Arrow before the re-render settles. | Add an INT test that verifies `replaceState` is called exactly once per discrete interaction. Minor (no functional impact; duplicate URL replace is harmless). | Suggestion |

---

## 3. Feature B — Vite cache invalidation

### Shipped tests

**None.** The `astro.config.mjs` side effect runs at config-load time — hard to test without isolating the module.

### Gaps

| # | Gap                                                                                     | Recommendation                                                                                                                                          | Priority |
|---|-----------------------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------|----------|
| B1| Version change does not demonstrably trigger `rmSync`.                                  | Write a node-env integration test that: mocks `fs` plus `child_process`, imports `astro.config.mjs` twice with different git-describe outputs, asserts `rmSync` called with `.astro`, `dist`, `node_modules/.vite`. | **Must**    |
| B2| First-ever build (no stamp file) must NOT clear caches.                                 | Same test harness as B1 — assert `rmSync` is NOT called when `stampFile` doesn't exist.                                                                  | **Must**    |
| B3| Same-version rebuild must NOT clear caches (preserve incremental).                      | Same harness — load config twice with same `appVersion`, assert zero `rmSync` calls.                                                                     | Should   |
| B4| Filesystem failures (EACCES, ENOENT on unrelated dir) must not crash the build.          | Harness that makes `readFileSync` throw — assert config still exports a valid object.                                                                    | Should   |
| B5| Concurrent builds race on the stamp file (user's explicit concern).                      | Acknowledge as accepted risk in code + this doc. Alternative: wrap the write in an atomic `rename` pattern. Low urgency since CI serializes. | Suggestion |
| B6| Stamp file with binary / corrupted content — `trim` produces garbage — triggers clear. | Safe by construction (wrong value triggers a harmless clear) but an explicit test would prevent regressions.                                             | Suggestion |

---

## 4. Feature C — Cognito `custom:display_name`

### Shipped tests

```
Frontend auth.ts     (4)  signUp with/without displayName, whitespace, trim
Backend middleware   (3)  Lambda claims, Bearer token, absent claim
Backend me.ts        (3)  auto-create with hint, without hint, existing profile ignores hint
Total new            10
```

### Gaps

| # | Gap                                                                                                                                                            | Recommendation                                                                                                                                                | Priority |
|---|----------------------------------------------------------------------------------------------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------|----------|
| C1| **No end-to-end round-trip test**: SignUp → Cognito → ID token → middleware → auto-create. Each layer is unit-tested; the *seams* between them are untested.    | Two options: (a) Add a Playwright + cognito-local (or moto) test env that exercises the full flow. (b) Gate prod deploy on a manual QA checklist item in the PR template. **Prefer (a) for durability; (b) as a stop-gap.** | **Must** |
| C2| Attribute value edge cases: 100-char boundary, Unicode (`田中太郎`), emoji (`🌾`), control chars (`\n`, `\x00`), SQL-like strings.                                  | Extend `signUp` unit tests with an `it.each` table of edge inputs — assert the Cognito request body receives the input unchanged (after trim).                  | High     |
| C3| Backend length validation missing: a 1000-char `custom:display_name` in a JWT would be written to DynamoDB unchecked. Cognito maxLen:100 only applies at attribute-write time, not at claim-read. | Add a middleware test: JWT with a 200-char `custom:display_name` claim → assert `displayNameHint` is clamped or `upsertUserProfile` rejects. Decision needed first (per SHOULD-FIX #2 in REVIEW-FINDINGS). | High     |
| C4| Type-coercion of claim: middleware casts `claims['custom:display_name'] ?? ''` to `string`. If it's an array / number / object, the cast produces garbage.     | Middleware test that supplies non-string claim (`{name: 'x'}`) → assert `displayNameHint` is `''` (defensive) rather than `"[object Object]"`.                   | Medium   |
| C5| RegisterForm integration: no test verifies the form actually calls signUp with `email, password, displayName.trim()`.                                           | Add a component test that mocks `signUp` and renders RegisterForm at Step 1 — asserts the signUp call shape. Requires happy-dom + @testing-library/preact.      | Medium   |
| C6| AuthGuard localStorage bridge behavior after Cognito attr ships — is it still invoked for legacy users?                                                        | Add a unit test proving AuthGuard's sync behaviour is unchanged; this is defensive against the SHOULD-FIX #3 removal path.                                       | Low      |
| C7| Concurrent first-GETs on the same user (two devices) — both see no profile, both upsert. Not a correctness bug (second write wins) but emits two `user.signup` events. | Architecture concern, not a test concern. Flag for `/cc-design` re-entry if telemetry later shows dup events.                                                    | Suggestion (design) |
| C8| CDK change is not unit-testable (CloudFormation is the contract). Deploy is the test.                                                                          | Require a staging deploy + live Cognito round-trip before promoting to main. Add a checklist item to the PR template.                                            | Must (process) |

---

## 5. Non-functional coverage

| Axis              | Status | Gap                                                                                                |
|-------------------|--------|----------------------------------------------------------------------------------------------------|
| Accessibility     | Partial | A-1..A-4 cover the tablist ARIA contract. No axe-core scan, no screen-reader announcement test.     |
| Performance       | None   | Focus shift + state update + re-render loop is lightweight; not expected to regress perf budgets.  |
| Security          | Unit-level | JWT claim handling has unit coverage. No fuzzing of JWT payload variants.                          |
| Internationalization | Unit-level | I-1..I-6 cover the new keys (EN + JA). No RTL support needed.                                      |
| Flakiness risk    | Low     | New tests are deterministic. The only concern is Playwright A-4 focus delivery timing — use `waitForSelector` before asserting `activeElement`. |

---

## 6. Test pyramid assessment

```
 Layer         New     Total    Health
──────────────────────────────────────────
 Unit          19      860+     OK   balanced
 Integration    7       70+     OK   grew with the work
 E2E            4        ~20    WARN single-browser, no Cognito round-trip
```

Pyramid shape is correct — the gaps are **depth** (per-feature round-trip) not **distribution**.

---

## 7. Prioritized remediation plan

**Before the next develop → main promotion:**

1. **B1 + B2 + B3** — add three integration tests for `astro.config.mjs` cache invalidation. One file, one fs-mock harness. ~30 min effort.
2. **C2** — extend `signUp custom:display_name` tests with edge-case `it.each`. 15 min.
3. **C8** — add a manual verification checkbox to the PR description template (one line): "`custom:display_name` round-trip verified against staging Cognito".

**Nice-to-have before v1.0:**

4. **A1** — expand Playwright project matrix to cover webkit + firefox for a11y suite.
5. **C1** — spin up cognito-local in a docker-compose test env for e2e auth round-trip.
6. **C3** — decide on backend length validation (revisit SHOULD-FIX #2), then add test.

**Can wait:**

7. **A2 / A3 / A4 / A5 / B4 / B5 / B6 / C4 / C5 / C6** — document but defer.

---

## 8. Framework choices (confirmed)

- **Unit / integration**: vitest + `preact-render-to-string` (node env, no JSDOM) — preserves fast CI.
- **E2E**: Playwright + auth fixture (`e2e/fixtures/auth.ts`) + `mockApi` stubs — correct tool for ARIA focus + browser-native key handling.
- **CDK**: no unit test framework; trust `aws-cdk-lib` types + staging deploy.

No framework change recommended.

---

## 9. Validation (my-reviewer checklist)

- [x] Pyramid ratios appropriate: unit-heavy, integration proportional, e2e focused on what other layers cannot cover
- [x] Gaps ranked by risk + blast radius
- [x] Mock boundaries are explicit (Cognito endpoint, DynamoDB repo, filesystem, `history.replaceState`)
- [x] No tests duplicate coverage across layers
- [x] Flakiness risk assessed
- [x] Strategy does not cross into implementation (no test code written)

---

## 10. Next step

Invoke `/cc-implement` with a **fresh** my-builder instance (per cc-test policy) to write the `Must` items from section 7. Do **not** reuse the same my-builder that implemented Features A/B/C this session — policy requires separation so the test-writer can catch assumption mismatches the feature-writer baked in.

Alternatively, if the user decides the `Must` items can wait until the next session, note that in the PR description and proceed to `/cc-push` + `/cc-pr-create`.

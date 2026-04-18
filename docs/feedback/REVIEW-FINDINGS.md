# Review Findings — Session 099.x (2026-04-18)

> Scope: Three features shipped this session on `develop`.
> Baseline: branch `main` at `d28d028` (v0.99.4 production).
> Reviewer policy: `.agent/subagents/my-reviewer.md` + `.agent/prompts/security/appsec_threat_model_prompt.md`.
> Pipeline stage: `/cc-review` → `/cc-remediate` (if MUST-FIX) → `/cc-test`.

---

## 1. Scope reviewed

### Feature A — Profile tab nice-to-have tests + WAI-ARIA focus fix
- `src/frontend/src/components/ProfilePage.tsx:81-96` — `handleTabKeyDown` now shifts focus
- `src/frontend/src/__tests__/profile-tabs.test.ts` — U-5..U-8
- `src/frontend/src/__tests__/ProfilePage.integration.test.ts` — INT-1..INT-5 (new file)
- `e2e/tests/categories/profile-tabs.spec.ts` — A-1..A-4 under `Profile tablist a11y`

### Feature B — Vite cache invalidation via version stamp
- `src/frontend/astro.config.mjs:12-39` — stamp-file read + conditional `rmSync`

### Feature C — Cognito `custom:display_name` attribute (cross-device bootstrap)
- `infra/lib/litcrop-stack.ts:82-89` — `customAttributes.display_name`
- `src/frontend/src/lib/auth.ts:249-277` — `signUp(email, password, displayName?)`
- `src/frontend/src/components/RegisterForm.tsx:234-238` — passes `displayName`
- `src/api/src/middleware/auth.ts:29-120` — `displayNameHint` in context, extracted from both paths
- `src/api/src/routes/me.ts:19-38` — auto-create seeds `display_name` from hint
- `src/api/src/__tests__/middleware/auth.test.ts` — three `displayNameHint` tests
- `src/api/src/__tests__/routes/me.test.ts` — three auto-create-with-hint tests
- `src/frontend/src/__tests__/auth.test.ts` — four `signUp` attribute tests

**Totals**: 944/944 vitest (from 920 baseline), 5 Playwright tests registered. Type-check clean on frontend, api, infra.

---

## 2. MUST-FIX findings

**None.**

After full audit against the my-reviewer checklist (alignment, security, quality, safety), no MUST-FIX-severity issues were found in this session's changes. Findings breakdown:

| Check                                          | Verdict |
|------------------------------------------------|---------|
| No injection vectors (SQLi/NoSQLi/command)     | ✅       |
| No path traversal (`rmSync` paths are literal) | ✅       |
| JWT claim handling follows existing pattern    | ✅       |
| No auth bypass or privilege escalation surface | ✅       |
| No credentials/secrets exposed                 | ✅       |
| Input validation at trust boundaries           | ✅ (Cognito `maxLen:100` + `UpdateProfileRequestSchema` on PATCH) |
| XSS surface unchanged                          | ✅ (display_name is Preact-escaped at render; new Cognito path uses same sink) |
| Tests cover new code paths                     | ✅       |
| Rollback path exists for all three features    | ✅ (feature flags unnecessary; each change is idempotent + additive) |

---

## 3. SHOULD-FIX findings

| # | File:Line                                          | Issue                                                                                                                                                                                                             | Severity   |
|---|----------------------------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|------------|
| 1 | `infra/lib/litcrop-stack.ts:96-116`                | `UserPoolClient` does not set `readAttributes`/`writeAttributes` explicitly. CDK/CloudFormation default is "all attributes readable" — the new `custom:display_name` IS included in ID tokens under that default, but relying on implicit behavior is fragile. Explicit attribute maps would make the token contract visible in code. | SHOULD-FIX |
| 2 | `src/api/src/routes/me.ts:33-38`                   | `displayNameHint` is written to DynamoDB without explicit length validation. Cognito enforces `maxLen:100` at the attribute layer, but defense-in-depth would clamp/validate at the backend too (match `UpdateProfileRequestSchema` rules). Low priority — the attribute is user-controlled and already trusted via the JWT signature check. | SHOULD-FIX |
| 3 | `src/frontend/src/components/AuthGuard.tsx:43-58`  | The localStorage bridge (`litcrop-pendingName` / `litcrop-pendingRole`) is now redundant for new users after the Cognito attribute ships. Keep it for one release for backward-compat, but schedule removal once all active users have a `custom:display_name` claim.                                                                  | SHOULD-FIX |
| 4 | `src/frontend/astro.config.mjs:27-39`              | Concurrent builds (two `astro build` processes racing the stamp file) could produce partial cache clears. Practically unlikely since builds are serialized in CI, but noting for awareness.                                                                                                                                          | SHOULD-FIX |

---

## 4. Suggestions (SUGGESTION)

- **S1** — `src/api/src/middleware/auth.ts:76,106` — the string cast on `claims['custom:display_name']` trusts the claim type. Dev path (Path 2) with a malicious test token could produce garbled data in DynamoDB. No security impact; cosmetic robustness.
- **S2** — `src/frontend/src/__tests__/profile-tabs.test.ts` / `ProfilePage.integration.test.ts` — the `switchTab`/`handleTabKeyDown` mirrors are duplicated across two files. Fine as documented, but if the real handler gains a third branch the drift cost doubles.
- **S3** — End-to-end: no test verifies the Cognito attribute actually round-trips through a real User Pool (signup → confirm → signin → claim appears). This is a live-infra concern; suggest a manual verification step in the PR description once CDK is deployed.

---

## 5. Verification needed before merge

- [ ] Deploy the CDK change to staging first; confirm `custom:display_name` appears in ID token claims on a fresh signup
- [ ] Verify a v0.99.4 → v0.99.5 tag bump triggers the `astro.config.mjs` invalidation locally (`rm -rf node_modules/.cache/astro-app-version && npx astro build` twice with different git tags)
- [ ] Run the Playwright suite `npx playwright test e2e/tests/categories/profile-tabs.spec.ts` against a live dev server (A-1..A-4 need a browser; not in CI matrix yet — confirm behavior manually)

---

## 6. Safety approval

- [x] Impact understood: additive CDK change (new custom attribute), additive frontend/backend plumbing, version-stamp auto-invalidation. No destructive operations.
- [x] Rollback verified: revert the three commits; CDK deploy re-removes the attribute (Cognito supports attribute removal only for UNUSED attributes — plan ahead if deploy happens in prod).
- [x] Approved for execution: **YES** — no MUST-FIX findings. Pipeline can proceed to `/cc-test`.

---

## 7. Decision

**Status**: ACCEPTED — proceed to `/cc-test`. `/cc-remediate` is not required (no MUST-FIX). The four SHOULD-FIX items are documented for the author's discretion and the next session's consideration.

---

# Review Findings — Session 099.x Addendum (2026-04-18, post-v0.99.5)

> Scope: B1/B2/B3 + C2 + C8 test-strengthening work from `docs/TEST-STRATEGY-099X-GAP-ANALYSIS.md`.
> Target tag: `v0.99.6` (next patch bump for test + doc polish).
> Baseline: 944 vitest → 970 (+26 tests), all green.

## A1. Scope reviewed

- `tools/invalidate-version-cache.mjs` — new DI-friendly helper extracted from `astro.config.mjs`
- `src/frontend/astro.config.mjs` — simplified to delegate to the helper
- `src/frontend/src/__tests__/invalidate-version-cache.test.ts` — 14 new tests (B1/B2/B3 + fs-failure + stamp edge cases)
- `src/frontend/src/__tests__/auth.test.ts` — +12 C2 edge-case tests via `it.each` (Unicode, emoji, boundary, quotes, whitespace)
- `.github/PULL_REQUEST_TEMPLATE.md` — new "Post-Deploy Verification" subsection under Deployment Notes

## A2. MUST-FIX findings

**None.**

| Check                                          | Verdict |
|------------------------------------------------|---------|
| DI seam sound; no fs references leak           | ✅       |
| All fs calls wrapped in try/catch              | ✅       |
| Defaults are hardcoded and safe (no traversal) | ✅       |
| Tests deterministic (no real filesystem touch) | ✅       |
| Edge cases cover realistic user names          | ✅       |
| JSON transport preserves all edge inputs       | ✅       |
| PR-template addition is actionable and scoped  | ✅       |

## A3. SHOULD-FIX findings

| # | File:Line                                                                 | Issue                                                                                                                                                                                    | Severity   |
|---|---------------------------------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|------------|
| 5 | `invalidate-version-cache.test.ts`                                        | Only `cacheDirs` override is exercised. `stampDir` and `stampFileName` overrides are part of the public API but untested. Add one test per override to complete the DI surface coverage. | SHOULD-FIX |
| 6 | `auth.test.ts` (C2 edge-case table)                                       | Missing null-byte (`'Alice\x00Bob'`) and RTL override mark (`'\u202EAlice'`) cases. Both are pass-through contracts (frontend doesn't strip; Cognito/backend rejects). Adding them documents the semantics explicitly. | SHOULD-FIX |

## A4. Suggestions

- **S4** — `PULL_REQUEST_TEMPLATE.md`: consider a one-line pointer near the top of the template ("🔒 Auth/Cognito changes? See Post-Deploy Verification below") so reviewers don't miss the section in long PRs. Low urgency; the current "when applicable" qualifier handles discoverability well enough.
- **S5** — `invalidate-version-cache.mjs`: `appVersion=''` (defensive) triggers the same "no clear" path as an absent stamp, but the semantics are subtle. Adding a tiny test that feeds `''` as the current version would prevent a future refactor from silently breaking this guard.
- **S6** — The helper could short-circuit the stamp write when `appVersion` matches the stamp (no-op write saves one syscall). Cosmetic.

## A5. Verification needed before merge

- [ ] Run `npx vitest run` once more after any remediation → confirm 970 (or 970+N) pass
- [ ] Run `npx astro build` in `src/frontend/` to confirm the refactored `astro.config.mjs` still produces a valid build (the helper now runs as a side-effect call at config-load; ensure no regression)
- [ ] Manual read of the new PR template section — does it trigger the right behavior for someone unfamiliar with the Cognito flow?

## A6. Decision

**Status**: ACCEPTED — proceed to commit + push + tag + PR for v0.99.6. `/cc-remediate` not required (no MUST-FIX). The two SHOULD-FIX items are low-effort (each is ~10 lines of test code) and could either be folded into v0.99.6 or deferred to a future session.

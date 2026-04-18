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

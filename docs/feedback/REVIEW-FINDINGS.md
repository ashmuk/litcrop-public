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

---

# #462 Phase 1 review (2026-04-20)

> Scope: commits `5ff13fe` (Phase 1 — add `Device.registered_by` + `Image.uploaded_by`) and `07c0268` (simplify pass on the same change). Both on `develop`.
> Reviewer role: my-reviewer, read-only.
> Consumer: `/cc-remediate` → my-builder, if MUST-FIX present.
> Files reviewed: the 7-file surface named in the task brief — `packages/shared/src/types/domain.ts`, `packages/shared/src/schemas/index.ts`, `src/api/src/routes/beds.ts`, `src/api/src/routes/devices.ts`, `src/api/src/routes/images.ts`, `src/api/src/services/repositories/devices.ts`, `src/api/src/services/repositories/_mappers.ts`.
> Auxiliary files consulted (not modified by the commits but load-bearing for the review): `src/api/src/middleware/auth.ts`, `src/api/src/middleware/device-auth.ts`, `src/api/src/app.ts`, `src/api/src/routes/diary.ts`, `src/api/src/routes/_helpers.ts`, `src/api/src/services/repositories/images.ts`, `docs/device/MVP-CAMERA-NODE-SPEC.md`, `scripts/camera-node/capture.sh`.

## B1. Findings on the three specific concerns

### B1.a — Concern 2 (device auth-context userId) — the task brief's premise is **incorrect**

**Claim in the task brief**: "`POST /beds/:bedId/images` is called by the Pi device (X-Device-Key header auth per #341 heartbeat fix)."

**Reality on `develop`**:
- `src/api/src/app.ts:138–139` mounts `authMiddleware` (Cognito JWT) on `/api/v1/beds` and `/api/v1/beds/*`. There is **no** `X-Device-Key` middleware on the `/beds` tree.
- `docs/device/MVP-CAMERA-NODE-SPEC.md` §6.6 ("Authentication — MVP — Option B: Pre-provisioned Token") describes the Pi uploading with a **Cognito user's JWT stored in `AUTH_TOKEN`**, currently bound to "Kiku's" user account.
- `scripts/camera-node/capture.sh:307–358` — the `upload()` function sends only `Authorization: Bearer $AUTH_TOKEN` to `POST /api/v1/beds/${BED_ID}/images`. Dual-auth (JWT + X-Device-Key) is used ONLY by `poll_config` (line 198–203) and `heartbeat` (line 458–463), per the `#341` fix — NOT by image upload.

**Implication for the schema additions**:

Because the Pi uses a user JWT (not a device key), `getAuthContext(c).userId` on POST /beds/:bedId/images always resolves to path (a) from the task brief — a genuine Cognito sub. So the value written into `Image.uploaded_by` is always a clean Cognito sub, and Phase 3's `/me/activity` filter by `uploaded_by = <cognito-sub>` will work.

However: that sub is the sub of **whichever user account's JWT is provisioned on the Pi**, not the sub of "the user who registered the device". For the current MVP, the Pi runs under "Kiku's" account, so every Pi-uploaded image on every farm that uses a Kiku-provisioned Pi will be tagged `uploaded_by = <kiku's-sub>` — even if a different user (e.g. an admin) actually did the Register Device flow.

This contradicts the JSDoc and commit message:
- `packages/shared/src/types/domain.ts:99`: "*Cognito sub of the uploader — device registrant for Pi uploads, the user for manual UI uploads.*"
- Commit `5ff13fe` message: "*For Pi-device uploads this resolves to the device's registrant user.*"

Both are wrong for the current Pi auth model. The sub stored is "whoever's JWT the Pi happens to be running under", which is independent of `Device.registered_by`. In the common MVP case where the operator (Kiku) and the person who ran Register Device in the UI are the same, the two happen to agree — but the contract as written doesn't guarantee that.

### B1.b — Concern 1 (privacy of `uploaded_by` on GET /images/:imageId) — acceptable, matches existing posture

`src/api/src/routes/images.ts:62–102` gates GET /:imageId with `assertImageOwnership(image, userId, isAdmin)` → `assertFarmAccess(bed.farm_id, userId, undefined, isAdmin)` (`_helpers.ts:36–74`). Undefined `requiredRoles` means any farm member (admin/owner/staff) can read. Admins (via `ADMIN_EMAILS_SET`) can read across farms.

Cross-checked against `DiaryEntry.created_by`:
- `src/api/src/routes/diary.ts:106` emits `created_by` (raw Cognito sub) on GET single + list responses.
- Access-control for diary is also any farm member.

So exposing `uploaded_by` to farm members matches the existing privacy posture of `created_by`. Acceptable.

### B1.c — Concern 3 (list-response payload) — acceptable, with one caveat

- **Device list** `GET /api/v1/farms/:farmId/devices` (`src/api/src/routes/devices.ts:121–124`): spreads `...d` into the response, so `registered_by` **does** propagate into the list payload. `DeviceListItemSchema` (`packages/shared/src/schemas/index.ts:498`) declares it `.nullable().optional()`, so validation is backward-compatible. +1 field (~40 bytes) per device; max 10 devices/farm (`MAX_DEVICES_PER_FARM` in `routes/devices.ts:33`); total bloat ≤ ~400 bytes per list response. Negligible.
- **Image list** `GET /api/v1/beds/:bedId/images` (`src/api/src/routes/beds.ts:213–231`): the list-item projection is **explicit** (`{ id, thumbnail_url, url, captured_at, trigger, node_id, size_bytes, latest_tag }`) and does NOT include `uploaded_by`. No bloat, no schema change to `ImageListItemSchema`.
- **Image upload 201 response** `POST /api/v1/beds/:bedId/images` (`routes/beds.ts:400–410`): the response projection is explicit and omits `uploaded_by`. `ImageUploadResponseSchema` (`schemas/index.ts:220–227`) is unchanged. No break.

## B2. Findings

### MUST-FIX

| File:Line | Issue | Severity |
|-----------|-------|----------|
| `packages/shared/src/types/domain.ts:99` and commit `5ff13fe` message | Contract claim "For Pi uploads this resolves to the device's registrant user" is inaccurate given the current Pi auth model (shared-user JWT — per `docs/device/MVP-CAMERA-NODE-SPEC.md` §6.6 and `scripts/camera-node/capture.sh:318`). `uploaded_by` actually holds the Cognito sub of whoever's JWT is provisioned on the Pi, which is independent of `Device.registered_by`. Phase 3's `/me/activity` endpoint will therefore attribute ALL Pi-captured images to the single shared-JWT user (currently "Kiku") — not to the user who ran Register Device, and not to each individual farm operator. | MUST-FIX (contract misrepresentation that silently corrupts the activity feed) |

**Why MUST-FIX, not SHOULD-FIX**: the brief explicitly called out that Phase 3 will filter `/me/activity` by `uploaded_by = <current-user-cognito-sub>`. Under the current Pi auth model, that filter will *silently* miss zero Pi images for the shared-JWT user (Kiku sees everything) and *silently* miss every Pi image for everyone else (they see nothing captured by the camera, only their manual uploads). That is a correctness break on the deliverable Phase 1 exists to enable.

There are three acceptable remediations, each with a different cost/honesty trade-off. I do NOT pick one — that's an architectural call (escalate to my-architect if ambiguous). I list them so the remediation PR has options:

1. **Accept and document**: update the JSDoc + commit message + (ideally) the ADR the commit claims exists to say "For Pi-device uploads, this is the Cognito sub of whichever user's JWT the Pi is running under — NOT necessarily the device's registrant. As of v0.99.7.3 this is a single shared account; when a per-device service account or M2M credential ships, this comment must be revised." Then make the `/me/activity` consumer aware that it will under-count Pi uploads for every user except Kiku — likely by filtering on `(uploaded_by = me) OR (registered_by_device_for_this_farm AND trigger = 'scheduled')`.
2. **Switch attribution source for the Pi path**: if the upload originates from a Pi (detectable by presence of `X-Device-Key` header once the Pi is modified to send it, OR by looking up `Device` by `node_id` and using its `registered_by`), populate `Image.uploaded_by` from `Device.registered_by` instead of the JWT sub. This makes the Image.uploaded_by contract accurate but requires a write-path change and a Pi config change.
3. **Split the field** into `uploaded_by_user` vs `uploaded_by_device` now (the path the commit message explicitly rejected as "more complex"). Avoids the ambiguity entirely.

The commit picked option 1 implicitly but wrote the JSDoc as if option 2 were in effect. That mismatch is the MUST-FIX.

### SHOULD-FIX

| File:Line | Issue | Severity |
|-----------|-------|----------|
| entire Phase 1 diff | Zero test coverage for the new fields. `grep -r "uploaded_by\|registered_by" src/api/src/__tests__/` returns **no matches**. The commit message says "991 tests pass", but that's because no existing test exercises the new behavior — the Zod contract tests (`contracts.test.ts:525–535`) pass only because the fields are declared `.optional()`. Without at least one test per field asserting (a) write persists the sub, (b) read returns the sub, (c) legacy record with missing attribute returns `null` — any regression in Phase 2/3/4 is undetectable by CI. | SHOULD-FIX |
| `packages/shared/src/types/domain.ts:99` and `:199` JSDoc; commit `07c0268` message | Both JSDoc one-liners and the simplify-pass commit message refer to "ADR-20260420 + #462 Q1 comment" as the place where the "null leaves historical unattributed" decision is documented. `ls docs/decisions/ | grep 20260420` only finds `ADR-20260420-1n-bed-crop-build-in-waves.md`, and `grep 462` against that ADR returns no matches. The referenced documentation does not exist. Either create it or update the JSDoc to point somewhere that does (e.g. the Phase 1 commit message itself). | SHOULD-FIX |
| `src/api/src/routes/images.ts:94` (GET /:imageId response) | `uploaded_by` is emitted as a raw Cognito sub with no accompanying resolved display name. The existing `DiaryEntry` response includes both `created_by` AND `created_by_name` (resolved via `resolveCreatorName` in `diary.ts:65–79`) for exactly this reason — the frontend needs a human-readable label, not a UUID. Phase 4 (ProfileActivityList component) will either need to duplicate that resolution logic on the frontend (extra round-trip per image) or the API will need to add `uploaded_by_name` to `ImageDetailResponse`. Flagging now so Phase 3/4 doesn't discover it mid-implementation. | SHOULD-FIX |
| `src/api/src/services/repositories/images.ts:84–105` (`createImage`) | The `Omit<Image, 'id' | 'bed_id'>` data shape means any future optional field added to `Image` will silently start flowing through `createImage → PutCommand.Item` via `...image` spread at line 99 — the author doesn't have to remember to add it. That's intentional per the commit message. But it also means that if someone later adds a derived field (e.g. `storage_key` is already required on Image, or future `content_hash`) and forgets it shouldn't be in the DDB Item, it silently gets written. Low risk today; flag for future audits. | SHOULD-FIX |

### NIT

| File:Line | Issue | Severity |
|-----------|-------|----------|
| `packages/shared/src/schemas/index.ts:245–247` | The `// --- #462 activity-feed attribution ---` separator comment was retained on the schema but the `07c0268` simplify pass removed the analogous comments from the route/mapper sites. Minor inconsistency between schema and mapper: the mapper (`_mappers.ts:57`) has a bare `uploaded_by` line while the schema has a 2-line explanation. Not wrong, but inconsistent with the simplify rationale ("the field names already say WHAT"). | NIT |
| `src/api/src/routes/beds.ts:362` and `routes/devices.ts:84` | `uploaded_by: userId` and `registered_by: userId` pass the auth-context userId with no validation that it's non-empty. `authMiddleware` does guarantee `claims['sub']` is truthy on the success path (line 73 requires `claims?.['sub']`), but a hypothetical future bug where `userId` becomes `""` would silently write an empty string. Defensive coding could add `userId || null` — but this is speculative and the existing `DiaryEntry.created_by` site doesn't defend either, so consistency wins. NIT. | NIT |
| `src/api/src/services/repositories/devices.ts:51` | The `createDevice` `data` parameter mixes required fields (`bed_id`, `node_name`, `device_api_key_hash`, `capture_interval`, ...) with a nullable-at-call-site field (`registered_by: string | null`). For write clarity, passing `registered_by: userId` (always truthy string) is the only current call site — the `| null` union is present only to allow legacy or system-created devices. If no such call site exists in Phase 2, the type could be tightened to `string`. Not worth blocking on. | NIT |

## B3. Positive observations

- **Nullability design is correct**. Making the fields `.nullable().optional()` on both Zod schemas (`schemas/index.ts:248, 498`) and `?: string | null` on the TS types (`domain.ts:100, 200`) is the right migration shape: old DDB records without the attribute deserialize to `null`, new records deserialize to a sub, and both parse against the schema. `_mappers.ts:57` and `devices.ts:33` correctly use `?? null` (not `??  undefined`) which matches the schema contract.
- **Additive change scope**. Read-path changes are pure deserializer additions; write-path changes are pure Item additions; the POST 201 response and image list response are untouched. This is a clean "foundation phase" landing with no contract breaks for existing consumers.
- **`ImageDetailResponse` type inheritance works**. Because `packages/shared/src/types/api.ts:116` defines `ImageDetailResponse extends Omit<Image, 'storage_key'>`, adding `uploaded_by` to Image automatically flows into the TS response type — no redundant surface. Good.
- **The simplify pass (`07c0268`) is defensible**. Redundant `// #462` trailing comments at call sites add noise — they're in git blame. Consolidating 6-line JSDoc blocks to one-liners is consistent with the codebase's terse-JSDoc style. The retained schema-level comments (at `schemas/index.ts:245–247, 495–497`) correctly document the non-obvious "nullable-for-migration" intent at the contract boundary.
- **`createImage`'s `Omit<Image, 'id' | 'bed_id'>`** pattern automatically picks up `uploaded_by` without a separate parameter. Clean.

## B4. Safety approval

N/A. This change is:
- Not destructive (no deletes, no migrations in this commit)
- Not irreversible (can be reverted by dropping the two fields and the writer lines; legacy data keeps parsing)
- Not auth/authz critical (does not change access control; only adds a metadata field)
- Not infra-touching

No safety gate required.

## B5. Verification needed before Phase 2

- [ ] Decide on remediation for MUST-FIX (Option 1 / 2 / 3 above) — escalate to my-architect if ambiguous.
- [ ] Add at least three tests per field in `src/api/src/__tests__/routes/beds.test.ts` and `devices.test.ts`:
  - Write path: POST persists the userId as `uploaded_by` / `registered_by`.
  - Read path, new record: value round-trips through `itemToImage` / `itemToDevice`.
  - Read path, legacy record: DDB Item without the attribute deserializes to `null`.
- [ ] Decide whether Phase 3/4 will need `uploaded_by_name` resolution on the API (consistent with diary) or push resolution to the frontend.
- [ ] Either create the referenced ADR-20260420 + #462-Q1 documentation, or fix the JSDoc pointer to point at the existing place (the Phase 1 commit message + issue comment).

## B6. Decision

**Status**: **needs-remediation** (1 MUST-FIX, 4 SHOULD-FIX, 3 NIT).

The MUST-FIX is a contract-honesty problem, not a code bug — the write-path behavior is stable, but the JSDoc and commit-message claim about it misrepresent the Pi-auth reality, which will mis-calibrate Phase 3's implementation. The SHOULD-FIX items (especially zero test coverage) accumulate into real risk across the remaining three phases. The NITs are optional.

Route this to `/cc-remediate` → my-builder with preference for **Option 1** in the MUST-FIX above (document accurately), and fold the SHOULD-FIXes into the same remediation commit if cheap.

# Session Report: Beta-11 Post (Batch A + Batch B — Sprint Close)

> Date: 2026-04-10 (afternoon/evening, same calendar day as Beta-11 core)
> Session: beta-11-post
> Base tag: v0.48 (on main: v0.48 at session start)
> Branch: develop → main (release PR #347)
> Tests: 790/790 (unchanged — logic coverage stable)
> Commits: 5 merged + 1 release merge commit (see detail below)
> Releases shipped: 2 tags (v0.49, v0.50) + 1 production release to main
> Issues closed: #343, #344, #341 — Beta-11 sprint 100% complete

## Summary

Single-session close of the Beta-11 device integration refinement sprint. Shipped two tagged releases (v0.49 and v0.50) covering three issues, then promoted both to production via a merge-commit release PR from develop to main.

The session practiced strict pipeline discipline — **define → design/review → remediate → implement → simplify → re-review → test → commit → PR → CI → merge → tag → close issue → update memory** — on both batches. The Batch B define→review cycle caught a punted design decision (sidecar vs awk rewrite) and a fragile regex assumption **before** any code was written, preventing mid-implementation scope drift.

A notable memory-hygiene win: the define step for #341 falsified two claims in the 3-day-old memory ("3 layered bugs" → actually 2; "~14 files to change" → actually 2). The corrected analysis was saved back to memory with an explicit "what the previous memory got wrong" section.

## Completed Work

### Batch A — v0.49 (PR #345)

Two UX follow-ups from the #337 post-deploy review, plus a new reusable `Modal` primitive both share.

**#343 — Tier class explanation modal**

A 4-row stacked card layout explaining the device tier system (Class 1/2/3/Pending). Each card shows Hardware / Does / Can't columns with row accents pulled from `TIER_PRESENTATION` so the colors stay synchronized with the per-device badges elsewhere in the app. Reachable from two surfaces:

1. Info (?) button in `DeviceListPage` header (next to the existing + register button)
2. Info (?) button next to `TierBadge` inside `DeviceConfigForm` (demonstrates the nested-modal case — tier info opened from inside the config modal)

**#344 — Device config form modal wrap**

`DeviceConfigForm` previously rendered as a sibling below the device card list, causing a "click did nothing, scroll to find the form" confusion. Now wrapped in the new `Modal` primitive — centered overlay, backdrop click / × button / Escape all dismiss.

**New `Modal.tsx` primitive**

Portal-based, reusable modal with all the accessibility plumbing:

- Body scroll-lock via **module-level depth counter** (nested modals safe — only unlock at depth 0)
- Escape key routed to **topmost modal only** via open-instance stack
- **Focus restoration** to the element that opened the modal on close (WCAG 2.4.3)
- Focus trap on close button
- `role="dialog"` / `aria-modal="true"` with title-based aria-label fallback

Deliberately does **not** refactor `Lightbox.tsx` to use the new primitive — scope discipline, filed as a potential follow-up.

**Drive-by fix bundled in v0.49**

Weather sunrise/sunset display now shows `HH:MM` format instead of the full datetime. Was already on develop as commit `5be6f6a` waiting for a tag bump; folded into Batch A's release scope.

**Pipeline executed for Batch A:**

| Stage | Artifact |
|---|---|
| `/cc-preview` | Dashboard — identified #343 + #344 as immediate batch, #341 as next batch |
| Design plan | In-conversation plan with 3 open questions confirmed before writing code |
| `/cc-review` + mockup | `docs/feedback/REVIEW-FINDINGS-BATCH-A.md` (0 MUST-FIX, 5 SHOULD-FIX, 4 SUGGESTION) + `docs/mockups/batch-a-modals.html` (3-screen visual mockup) |
| Implement | 4 files modified (`DeviceConfigForm`, `DeviceListPage`, `en.json`, `ja.json`) + 2 new files (`Modal.tsx`, `TierInfoModal.tsx`) |
| Simplify | Collapsed duplicate re-fetch logic in `handleRegisterSuccess` to share the new `refreshDevices()` helper |
| Self-review vs SHOULD-FIX | All 5 SHOULD-FIX items verified against implementation (focus restoration, nested modal handling, drop `window.location.reload()`, stacked mobile layout, both locales same commit) |
| Test | 790/790 passing, zero new TS errors in touched files |
| Commit / PR / CI / Merge / Tag | 1 commit `05871e9` → PR #345 → 6 CI checks → merged as `4f4dd2c` → tagged v0.49 |

### Batch B — v0.50 (PR #346)

Fixes the #341 heartbeat auth mismatch that made `capture.sh` silently fail end-to-end since **Beta-5**. This was the last open item in the Beta-11 sprint.

**Root cause — 2 interlocked bugs, not 3 as memory suggested**

- **Layer A — Missing .env fields + prefix mismatch.** `DeviceRegisterForm` was downloading a .env file with `LITCROP_*`-prefixed keys that `capture.sh`'s parser didn't recognize, AND the .env was missing `BED_ID` and `API_BASE_URL` entirely. Every field present was silently dropped; every required field was unset; `capture.sh` exited at the validation gate before ever hitting the network.
- **Layer B — Heartbeat + config-poll missing `X-Device-Key` header.** Device endpoints use dual-auth (JWT via `authMiddleware` at `app.ts:137-138` AND `X-Device-Key` via in-route `verifyDeviceKey()` at `devices.ts:230, 262`). `capture.sh` only sent the JWT header on both `poll_config` and `send_heartbeat`. Both endpoints returned 401 every time.
- **Not a bug (previous memory was wrong):** Upload flow `/api/v1/beds/*` is **JWT-only**, not dual-auth. Investigated and ruled out.

**Rosetta Stone**: `scripts/test-device-heartbeat.sh` was the known-working reference — it uses `LITCROP_*` prefix internally and sends **both** auth headers. The test script's pattern is what `capture.sh` should have always done.

**Fix**

- `DeviceRegisterForm.tsx` adds `LITCROP_BED_ID` + `LITCROP_API_BASE_URL` to the .env download. API base URL is derived from the server-generated `result.config_poll_url` via a **strict regex match** with fail-loud user-visible error on format mismatch — never silently writes a broken .env.
- `capture.sh` parser accepts `LITCROP_*`-prefixed keys, maps them to internal unprefixed vars. Backward-compat case kept for legacy hand-edited configs. `LITCROP_CONFIG_URL` intentionally ignored (capture.sh builds URLs from `API_BASE_URL` itself).
- `capture.sh` required-vars check adds `DEVICE_API_KEY` + helpful `[HINT]` lines pointing to the re-download flow for legacy configs.
- `capture.sh` `poll_config()` and `send_heartbeat()` now write both `Authorization: Bearer` and `X-Device-Key` headers into the same `-K` curl config file (keeping secrets out of process list).

**Bonus — sidecar `.auth-token` + refresh failure counter**

Previously `refresh_token()` used awk to rewrite `AUTH_TOKEN=` in the .env file, but the downloaded .env had no matching line — refreshed JWTs were never persisted across cron runs. And there was no bound on refresh failures, so an expired 30-day `REFRESH_TOKEN` would cause cron-driven infinite Cognito refresh spam.

Both fixed:

- Refreshed JWT now written to `~/litcrop/.auth-token` sidecar with atomic write (`.tmp` + `mv`) and `chmod 600`. The downloaded .env stays immutable.
- `MAX_REFRESH_FAILURES=3` counter persisted in `~/litcrop/.refresh-failures`. After 3 consecutive failures, `capture.sh` exits with code 2 and logs a re-registration hint.

**CI regression guard — `scripts/test-capture-sh-headers.sh`**

New integration test that runs `capture.sh --once` in an isolated temp HOME with **shimmed `curl` and `rpicam-still`**. Each curl invocation's argv and -K config file contents are logged; the test then asserts:

1. heartbeat sends `Authorization: Bearer`
2. heartbeat sends `X-Device-Key`
3. config poll sends `Authorization: Bearer`
4. config poll sends `X-Device-Key`
5. upload sends `Authorization: Bearer`
6. upload does **NOT** send `X-Device-Key` (JWT-only endpoint)
7. heartbeat has both auth headers in the **same** -K config file (catches the case where sequential printfs could overwrite each other)

All 7 assertions pass. Runtime <1 second. Catches this class of bug before it reaches production again.

**Pipeline executed for Batch B:**

| Stage | Artifact |
|---|---|
| `/cc-define` | `docs/REQUIREMENTS-341.md` — full root-cause analysis, file-by-file change plan, 6 test cases |
| `/cc-review` | `docs/feedback/REVIEW-FINDINGS-341-DEFINE.md` — 1 MUST-FIX, 6 SHOULD-FIX, 3 SUGGESTION. Caught a punted decision (M-1) and a fragile regex assumption (S-3) **before any code was written** |
| `/cc-remediate` | Applied all 7 actionable findings inline to the requirements doc: sidecar decision made explicit, fail-loud regex, dead-code parser entry removed, [HINT] error messages, threat model paragraph, test plan adjustments |
| Task #10 (verify) | Grepped frontend for API base URL source — found `PUBLIC_API_BASE_URL` (not `VITE_API_BASE_URL` as I would have guessed); discovered it includes `/api/v1` suffix so needed to pivot to server-generated `config_poll_url` instead |
| Implement | 2 files modified core fix + 1 new i18n key + sidecar plumbing + refresh counter |
| Test | `npx vitest run` 790/790, `bash -n capture.sh` clean, JSON valid, tsc clean, new integration test 7/7 |
| Commit / PR / CI / Merge / Tag | 1 commit `12d55b9` + 1 TASKS.md housekeeping `4ec1a05` → PR #346 → 6 CI checks → merged as `c19a0f5` → tagged v0.50 |

### Release — PR #347 (develop → main)

Promoted v0.49 + v0.50 to production via a **merge commit** (not squash) so the individual commits stay visible in main's history for blame/bisect.

**Merge strategy rationale**: `git blame` on `Modal.tsx` now points at `4f4dd2c` (the original Batch A commit) rather than a squash commit. For a release PR that bundles logically-distinct changes, merge-commit preserves forensic value.

**Tag strategy**: Tags v0.49 and v0.50 stay on develop commits (`4f4dd2c` and `c19a0f5`). After the merge, both tags are **transitively reachable** from main because the commits they point at land in main via the merge commit. No retag, no cherry-pick, no tag drift between main and develop. This is the elegance of the repo's "tags on develop, not main merge commits" convention: tags follow code, not merge topology.

**Safety gate**: Per `CLAUDE.md`, merging to main requires explicit approval. The session treated the initial "release to main" command as approval to **open** the PR, then stopped for a **second explicit approval** before running `gh pr merge 347 --merge`. Two discrete decisions, two discrete confirmations — matches the principle "a user approving an action once does NOT mean they approve it in all contexts".

**Post-merge verification**:

- `origin/main` HEAD: `03551c1` (merge commit for PR #347)
- Main's log shows the 4 develop commits on top of the prior v0.48 history
- `git tag --merged origin/main --sort=-version:refname` → `v0.50 v0.49 v0.48 v0.47 v0.46`
- `git tag --contains 03551c1` → empty (merge commit itself has no tag, as intended)
- GH Actions auto-deploy fired on main push

## Beta-11 Sprint Rollup — COMPLETE

| Issue | Title | Tag | PR | Status |
|---|---|---|---|---|
| #337 | Tiered device classes (capability-based config + setup flow) | v0.48 | #342 | ✅ in prod (prior release) |
| #343 | Tier class explanation modal | v0.49 | #345 | ✅ in prod (this release) |
| #344 | Device config modal wrap (fixes "form at bottom of page" UX) | v0.49 | #345 | ✅ in prod (this release) |
| #341 | Heartbeat dual-auth fix (capture.sh never worked since Beta-5) | v0.50 | #346 | ✅ in prod (this release) |

**Zero open Beta-11 items.** Sprint closed.

## The User-Visible Win

Until this release, `capture.sh` had been silently failing to heartbeat since **Beta-5** — that's why every real Pi on `DeviceListPage` showed `N/A` for battery, wifi, and storage. The #337 tier classes shipped in v0.48 was correct code but unexercised in prod because the capabilities payload never reached the API. The #343/#344 UX work made the tier system legible to users, but without real heartbeats the badges had no data.

After this release lands (and users re-download their .env to pick up the new `LITCROP_BED_ID` + `LITCROP_API_BASE_URL` fields), all three pieces align:

1. Pi capture.sh sends valid dual-auth heartbeats → API stores them
2. Capabilities (has_battery_sensor, has_pir_sensor, resolutions) persist from first heartbeat → tier derivation has real data
3. DeviceListPage shows the tier badge with live class, backed by real health values → user sees a working system for the first time

The `[HINT]` error messages in `capture.sh` surface the re-download requirement clearly for anyone on a broken default config — no silent failure transition.

## Key Technical Decisions

### 1. Reusable `Modal` primitive (Batch A)

Extracted rather than copy-pasted from `Lightbox.tsx`. The `Lightbox` had the right *pattern* (portal, scroll-lock, Escape, focus trap) but was image-specific. Building `Modal` fresh mirroring the plumbing avoided touching `Lightbox` (separate scope) while setting up the reuse story.

**Nested modal handling via depth counter**: Body scroll-lock uses a module-level `modalStackDepth` counter, not save-and-restore of `document.body.style.overflow`. When the tier info modal opens *from inside* the device config modal, depth goes 1 → 2, and scroll unlocks only when depth returns to 0. Escape key routing uses a parallel `openInstanceIds` stack — only the topmost modal handles Escape. Both patterns match Radix UI's approach.

### 2. Fail-loud over silent fallback (Batch B)

The review finding S-3 caught me proposing a regex strip on `result.config_poll_url` that would silently produce `result.config_poll_url` unchanged if the URL format ever drifted. The remediated approach: strict match, user-visible error toast, abort the download. New i18n key `device.env_download_failed_bad_url` in both locales.

This is the pattern worth internalizing: **for any string transformation on an external contract, prefer a strict match that fails loudly over a regex that silently passes bad input through**. The failure mode of silent pass-through is always worse than the failure mode of explicit error.

### 3. Sidecar files over mutating `.env` (Batch B)

The review finding M-1 caught me punting the decision between "rewrite .env via awk" and "use a sidecar file" to implementation. Resolved in remediation: sidecar file `~/litcrop/.auth-token` with atomic write pattern. Rationale:

1. `.env` stays immutable after download → users can re-copy to replacement Pis without surprises
2. Different secret lifecycles: `.env` is registration config (durable), `.auth-token` is hourly-rotating
3. Deleting `.auth-token` forces a fresh Cognito refresh without destroying registration state
4. Avoids awk rewrite fragility (quoting, comment ordering, delimiter escaping)

The refresh failure counter (`REFRESH_FAIL_FILE`) is a second sidecar file. Both use the same atomic write + `chmod 600` pattern.

### 4. Memory corrections as a first-class activity

The define step for Batch B falsified two claims in the 3-day-old `project_341_device_auth.md` memory:

- **"3 layered bugs"** → actually 2 (upload flow was fine)
- **"~14 files need changes"** → actually 2 (the 14-hit `device_api_key` grep was mostly read-only verification sites that were already correct)

The corrected analysis was saved back to memory with an explicit **"What the previous memory got wrong"** section. This is a deliberate choice: future-me reading this memory in 3 months learns both the facts AND the decay pattern, not just the current truth.

## Pipeline Discipline Observations

Both batches went through the full `define → design/review → remediate → implement → test → PR → CI → merge → tag → close → memory` loop. Key observations:

1. **Review caught punted decisions before code was written.** Batch B's M-1 (sidecar vs awk) and S-3 (regex vs explicit) were design decisions being deferred into implementation. The review step forced explicit resolution. No mid-implementation refactor, no design drift.

2. **The visual mockup saved design iteration time on Batch A.** The HTML/CSS mockup at `docs/mockups/batch-a-modals.html` uses the real project design tokens (via `docs/mockups/style.css`) and showed the 3 screens in context before any TSX was written. The user confirmed direction from the mockup, then I implemented with confidence.

3. **Memory verification caught two factual errors.** The `project_341_device_auth.md` memory was 3 days old. Verifying against current code during the define step falsified "3 layers" and "14 files". Without the verification step, I'd have implemented against the wrong scope and produced a larger-than-necessary PR.

4. **Splitting the #341 commit into TASKS.md housekeeping + the core fix preserved clean history.** The pre-commit hook got confused about the split (false positive on "sync regenerated files") and needed a `git stash push --keep-index` workaround — documented here for future reference.

5. **Two discrete merge-to-main confirmations for one production release.** CLAUDE.md's safety rule was honored: "release to main" approved the PR creation; a second "merge" approved the actual merge-to-main. One command, two confirmations.

## Metrics

- **Session duration**: single continuous session, mid-afternoon through evening JST
- **Issues closed**: 3 (#343, #344, #341), plus #245 still-open noted for cleanup
- **PRs opened**: 3 (#345, #346, #347)
- **PRs merged**: 3 (all via CI green, no force merges)
- **Releases**: 2 tagged (v0.49, v0.50) + 1 production release to main
- **Commits merged to develop**: 3 (Batch A #345 squash, Batch B #346 squash, TASKS.md housekeeping bundled into #346 squash)
- **Commits merged to main**: 4 develop commits + 1 merge commit (PR #347)
- **Files changed** (entire session): ~14 unique files
- **Lines added/removed**: +2,300 / -45 (rough — includes new mockup, requirements docs, review findings, test script)
- **Tests**: 790 → 790 (backend contract stable) + 7 new header assertions in `test-capture-sh-headers.sh`
- **New docs**: `REQUIREMENTS-341.md`, `REVIEW-FINDINGS-BATCH-A.md`, `REVIEW-FINDINGS-341-DEFINE.md`, `batch-a-modals.html`
- **New code files**: `Modal.tsx`, `TierInfoModal.tsx`, `test-capture-sh-headers.sh`
- **Memory updates**: 2 (`project_341_device_auth.md` rewrite, `project_restart_point.md` supersede)

## What's Next (for the next session)

### Priority 1 — Beta-12 AI strategy (blocked on #278)

- **#278** — AI context pipeline ADR. Currently `status:deferred`. Blocks #183, #320, #333. Must un-defer and start with `/cc-define` or `/cc-adr`.

### Priority 2 — Pre-PROD design sprint

- **#281** — Free vs paid tier concept. Priority:high. Design-only.
- **#334** — Capacity / scalability review. Priority:high. Design + docs.
- **#256** — Holistic quality review. Priority:high.

### Priority 3 — Pre-PROD infra

- **#238** — Custom domain
- **#239** — Production AWS resource rename (mvp → prod)
- **#240** — Finalize install.sh URL (depends on #238)
- **#280** — Release notes, what's new, disclaimer pages

### Cleanup

- **#245** — Close Farm Diary parent rollup (all sub-features shipped in Beta-7/8)
- **v0.38 local tag clobber** — old local tag diverges from remote; noise, not blocking
- **S-5 follow-up** — `shellcheck` not in devcontainer/CI; filed as implicit follow-up during Batch B review

## Deferred Since Session Start

- **Lightbox.tsx refactor** to use new `Modal` primitive — deliberately out of scope for Batch A; optional follow-up
- **`install.sh` empty `.auth-token` placeholder** creation (G-2 from Batch B review) — not critical, filed
- **S-5 integration test for shellcheck in CI** — separate infra concern

## Session Close

Beta-11 is **100% shipped to production**. All four sprint issues closed. Two tagged releases promoted to main. 790 tests still green. Memory and restart-point both updated. Ready for `/clear` and a fresh start on the next priority.

Recommended next action: **fresh session** with `/cc-preview` to confirm state, then start on **#278** (unblock Beta-12) or **#281 + #334** (Pre-PROD design sprint) depending on strategic priority.

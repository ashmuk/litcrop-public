# Session Report — v0.99.8.5 → v0.99.8.7 (2026-05-01 to 2026-05-03)

**Span**: Three calendar days, three production releases.
**Versions shipped**: v0.99.8.5, v0.99.8.6, v0.99.8.7 — all reach `main`, all deploy-to-prod ran clean.
**Issue closed**: #482 (audit-log gap surfaced via UAT after v0.99.8.6 ship).
**Routine scheduled**: `trig_01GaTjbPfYQ9kF1psuqSaJe8` — Wave E2 soak-end check fires 2026-05-13 09:00 JST.

---

## Top-line table

| # | Release | Theme | PR(s) | Merge commit | Merged to main | E2E |
|---|---|---|---|---|---|---|
| 1 | **v0.99.8.5** | Soak-window infra v2 (lint hardening, k6 fixes, first complete baseline) | #479 | `4c6e3b7` | 2026-05-01 05:38 UTC | 4m22s ✓ |
| 2 | **v0.99.8.6** | #478 delete-picture (per-bed BedDetail, owner/admin only) | #480 (feat→dev), #481 (dev→main) | `cf81376` | 2026-05-01 10:37 UTC | 4m24s, 4m5s ✓ |
| 3 | **v0.99.8.7** | #482 audit-log gap fix (image-delete events surface in Admin Activity) | #483 (fix→dev), #484 (dev→main) | `cab56ff` | 2026-05-03 09:40 UTC | 4m38s, 4m13s ✓ |

All five PR Quality Checks E2E runs green first-try. Chromium hydration fix from #470 (data-hydrated marker, shipped v0.99.8.4) is empirically holding — 8/8 consecutive green E2E since the fix.

---

## Day 1 — 2026-05-01

### Starting state
- `develop` had 4 local-only commits past `origin/develop` plus an unpushed annotated tag `v0.99.8.5` — queued from the 2026-04-29 GitHub Actions quota hit (Plan D: hold pushes locally until quota resets).
- Two local-only branches were pre-cooked for v0.99.8.6: `feat/478-delete-picture` (commit `87eb736`, 16 files +1073/-7) and `prep/v0.99.8.6-release` (commit `8bf6e5e` — pre-cooked CHANGELOG + VersionHistory + i18n release commit).
- Memory anchors: `project_v0998_5_may1_ship.md`, `project_v0998_6_478_ship.md`, `project_v099_v1_roadmap.md`.

### Quota verification
- gh CLI token lacks the `user` OAuth scope, so the billing API came back 404.
- Confirmed manually via the user's browser check of the billing summary page — quota reset on the projected 2026-05-01 reset date.

### v0.99.8.5 sprint (clean, 12-step)
1. Switched `prep/v0.99.8.6-release` → `develop`. State verified against the saved anchor.
2. Pushed `develop` (4 commits) + tag `v0.99.8.5`.
3. Deploy-to-Staging triggered, completed 1m9s — empirically confirmed quota was back (workflow ran, did not queue).
4. Opened PR #479 (develop → main). 9 commits promoted (7 up to tag + 2 post-tag docs/sync — adjusted for the actual count vs the anchor's stale "7 commits" claim).
5. E2E first-try 4m22s; merged with `--merge`.
6. Verified `git tag --merged main | grep v0.99.8.5` ✓.

### v0.99.8.6 sprint (#478 delete-picture)
1. Pushed `feat/478-delete-picture` → opened PR #480 (feat → develop).
2. **Sequencing nuance**: Deploy-to-Staging fires on push to develop, not on PR. So UAT must happen post-develop-merge — the saved anchor's "UAT before merge" was actually "do NOT promote to main if UAT fails." Wording adjusted in conversation; anchor still says the older form.
3. PR #480 E2E 4m24s first-try → merged to develop.
4. Deploy-to-Staging on the merge commit completed 2m12s.
5. **UAT** by user on 木こりん農園（テスト用） bed A1: per-thumb 🗑, day-bulk delete, EN+JA confirm modal, role gate (staff cannot see 🗑), lightbox interaction, diary cascade — all pass.
6. Cherry-picked `8bf6e5e` (the pre-cooked release commit) onto `develop`. Auto-merged i18n cleanly (feat/478 added `delete_pictures.*` keys; release commit added `changelog.v0998_6_*` keys — no conflict). New commit `2c85927`.
7. Verified date string in CHANGELOG/VersionHistory matched today (2026-05-01).
8. Ran focused i18n consistency test: 39/39 pass — including "exactly one VersionEntry is marked current" (validated the v0.99.8.5 → v0.99.8.6 current-flag handoff).
9. Tagged `v0.99.8.6` on develop.
10. Pushed develop + tag. Opened PR #481 (develop → main, release-promotion of v0.99.8.6 + 2 promotion-trailing commits).
11. E2E 4m5s first-try; merged.
12. **Issue #478 stayed OPEN** — PR #480's body had `Refs: #478` instead of a closing keyword. Closed manually via `gh issue close`. (Class-of-bug captured later as a feedback memory after the v0.99.8.7 fix path validated the cleaner approach.)

---

## Day 2 — 2026-05-02

UAT on the v0.99.8.6 admin surface revealed a **post-ship gap**: the Admin Activity log didn't show image-delete events and the filter dropdown didn't list them.

### Investigation (3 layers, all confirmed missing)

| Layer | File:line | Gap |
|---|---|---|
| API listener | `src/api/src/services/activity.ts:502` | `ALL_EVENT_TYPES` missing `image.deleted`, `images.bulk_deleted` |
| API payload mapper | `src/api/src/services/activity.ts:270` | `fromPayload()` switch had no `case` for either event |
| Frontend filter + label | `src/frontend/src/components/AdminDashboard.tsx:462` | `EVENT_LABELS` map missing entries → not in filter dropdown, raw type rendering |

Events were emitted by the routes (`routes/images.ts:238`, `routes/beds.ts:498`) but never reached the audit log because three separate hand-maintained registries were out of sync.

### Why pre-ship pipeline missed it
Route tests verified event *emission*. No test covered emit → persist → query for the new events. The existing "records all 14 event types" test (`activity.test.ts:175`) was outdated even before #478 — listed 14 of the 22 events in `ALL_EVENT_TYPES`. Hand-maintained registry drift, hidden by an incomplete test enumeration.

### Fix execution (PR #483)
- Filed issue **#482** with full gap analysis (linked from this report's table).
- Created branch `fix/482-audit-log-image-events` off develop.
- Wired all three registries:
  - `activity.ts`: added both events to `ALL_EVENT_TYPES` (now 24 entries; `[activity] subscribed to 24 event types` confirmed in test stdout); added two `case` blocks in `fromPayload()` mirroring `image.uploaded`'s shape, with design choices:
    - `image.deleted` → `target_type='image'`, `target_id=image_id`, `details: { bed_id, captured_at }`
    - `images.bulk_deleted` → `target_type='image'`, `target_id=bed_id` (the natural unit of a bulk delete), `details: { bed_id, day, image_ids, count }` where `count` is derived from `image_ids.length`
  - `AdminDashboard.tsx`: added two entries to `EVENT_LABELS` with red delete-class colors (`#f87171` for single, `#dc2626` for bulk).
  - `i18n` EN+JA: added `activity_event_image_deleted` and `activity_event_images_bulk_deleted` keys.
- Added regression tests in `activity.test.ts`: two new focused `it()` cases (one per event) asserting `target_type`, `target_id`, `details.count` derivation. Existing "records all enumerated event types" test refactored to use `events.length` instead of a hardcoded `14`.
- 17/17 `activity.test.ts` pass. 43/43 i18n consistency + delete-pictures-i18n pass. Lint 0/0; typecheck clean.
- Commit message included `Closes #482` (lesson from v0.99.8.6 — but this turned out to be the *commit-message* form that matters, not the PR-body form; see Day 3 validation).
- PR #483 E2E 4m38s first-try; merged to develop.

---

## Day 3 — 2026-05-03

### v0.99.8.7 release-promotion
- Wrote release commit `51dcfdb` directly on develop (no prep branch needed since no quota hold this time): CHANGELOG.md (+44), VersionHistory.tsx (+8/-1), en.json (+2), ja.json (+2). Date string: 2026-05-03.
- 40/40 consistency tests pass — parameterized loop now covers v0.99.8.7 as well (was 39 before this commit).
- Tagged `v0.99.8.7` on `51dcfdb`.
- Pushed develop + tag. Opened PR #484 (develop → main, release-promotion).
- E2E 4m13s first-try; merged 09:40:19 UTC.

### Auto-close validation (the Day-2 lesson refined)
- **Issue #482 auto-closed at 09:40:20 UTC** — exactly **1 second** after PR #484's main merge.
- This validates the refined rule: the **`Closes #N` keyword in the commit message** (not just the PR body) is what triggers auto-close, because:
  - GitHub auto-close only fires when the keyword reaches the **default branch** (main).
  - Feature PRs target develop, not main, so PR-body keywords on feature PRs do nothing.
  - Commit-message keywords propagate through every merge automatically.
- The v0.99.8.6 case (#478 didn't auto-close) is now fully diagnosed: feat/478's commit message had `Refs: #478` (not a closing keyword), and PR #481's promotion body didn't include one either. Even with the right commit-message form, #478 wouldn't have auto-closed because of a missing closing keyword in BOTH places.

### Deploy-to-Production
- Workflow on `cab56ff` completed: install, build, CDK deploy, S3 sync, CloudFront invalidation, post-deploy smoke test — all green.

### Wave E2 soak-end routine
- One-time routine `trig_01GaTjbPfYQ9kF1psuqSaJe8` registered via Schedule skill.
- Fires 2026-05-13 09:00 JST (= 2026-05-13T00:00:00Z UTC).
- Prompt is fully self-contained: read `bed-crops.ts:140-156`, attempt CloudWatch query (fall back to `aws_check: skipped` if no creds), open GitHub issue with go/no-go recommendation, log issue body to session if GitHub write fails.
- Auth: GitHub App installed by user during this session; routine uses installation token.
- Manage: https://claude.ai/code/routines/trig_01GaTjbPfYQ9kF1psuqSaJe8

---

## Lessons captured as feedback memory

| Memory | Subject | Reason |
|---|---|---|
| `feedback_audit_event_three_places.md` | Adding a new audit event type requires updating three registries together: `events.ts`, `activity.ts` (ALL_EVENT_TYPES + fromPayload), `AdminDashboard.tsx` (EVENT_LABELS + i18n) | v0.99.8.6 shipped with this gap (#482). Class-of-bug: hand-maintained registry drift. |
| `feedback_closing_keyword_git_flow.md` | For Git Flow projects, put `Closes #N` in the commit message (not just the PR body) so it propagates feature → develop → main | v0.99.8.6 PR #480 had `Refs: #478` and #478 didn't auto-close. v0.99.8.7 PR #483 had `Closes #482` in the commit, validated by the 1-second auto-close at PR #484 merge. |

Both were added to MEMORY.md's index.

`project_v099_v1_roadmap.md` was updated with a 2026-05-03 ship-record header that captures the .5/.6/.7 trio, the closing-keyword learning, and the next gate (Wave E2 soak-end 2026-05-13).

---

## Memory state at session end

```
Updated:
  project_v099_v1_roadmap.md          (heading 2026-05-03; v0.99.8.7 ship record)
  MEMORY.md                            (re-indexed both new feedbacks)

Created:
  feedback_audit_event_three_places.md
  feedback_closing_keyword_git_flow.md

Unindexed (kept on disk; safe to delete on user confirmation):
  project_v0998_5_may1_ship.md
  project_v0998_6_478_ship.md
```

---

## Cleanup left for user (intentionally not done autonomously)

| Artifact | Recommendation |
|---|---|
| Branch `feat/478-delete-picture` | Merged via #480; safe to delete locally + remote |
| Branch `prep/v0.99.8.6-release` | Cherry-picked into develop as `2c85927`; safe to delete |
| Branch `fix/482-audit-log-image-events` | Merged via #483; safe to delete |
| File `project_v0998_5_may1_ship.md` (memory) | Unindexed since 2026-05-01; anchor self-authorized deletion |
| File `project_v0998_6_478_ship.md` (memory) | Unindexed since 2026-05-01; anchor self-authorized deletion |

---

## Empirical observations worth keeping

- **5 consecutive E2E green first-try** (PRs #479, #480, #481, #483, #484). The chromium-login flake from #470 is fully closed. Speed-band correlation theory (slow workers vs fast workers) appears decoupled from the hydration race after the fix.
- **Same-day ships are sustainable** when CI is deterministic: 5h 5min from "go for it" to v0.99.8.6's main merge. Most of that wall-clock was CI execution and one UAT cycle. Active human/AI work was small.
- **Deploy-to-Staging cadence**: ~1-2 minutes (1m9s for v0.99.8.5, 2m12s for v0.99.8.6). CDK deploy is the dominant phase (1m+); idempotent over CloudFormation drift detection means no-infra-change pushes are fast.
- **Pre-ship pipeline misses post-ship UAT**: the audit-log gap was caught by the user's manual exercise of the Admin UI 2 days post-ship. The 1318-test suite, lint-as-error, typecheck, and 8-job CI pipeline all green-flagged the v0.99.8.6 ship despite the gap. Lesson: post-ship UAT remains load-bearing for cross-registry drift bugs.

---

## What's next on the roadmap

- **Wave E2 soak window** open until **2026-05-13** (day 5 of 14 as of session end). Routine `trig_01GaTjbPfYQ9kF1psuqSaJe8` will fire then with a go/no-go recommendation.
- **Wave E3** (delete the legacy fallback at `bed-crops.ts:140-156`): unlocked if soak-end check is GO. Likely shipped as v0.99.8.8.
- **Wave E4** (drop inline `Bed.crop_*` fields): blocked behind E3.
- **Stream 3** (v0.99.9.x → v1.0 RC): blocked behind E2 close-out and full Wave E completion.

No immediate Stream 2 work pending. No active soak-window UAT required from operator (synthetic load coverage is incomplete per v2 baseline; soak relies on organic prod traffic).

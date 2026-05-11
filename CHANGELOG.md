# Changelog

All notable changes to **LitCrop** are documented in this file.

The format is based on [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/).
Versioning is pre-1.0 and does not yet follow strict Semantic Versioning — minor-version bumps may contain breaking changes until v1.0.0 GA.

For the user-facing, bilingual version history see the in-app [/history](src/frontend/src/components/VersionHistory.tsx) view. This file is the machine-readable mirror for external tooling (release bots, package-catalog scrapers, `conventional-changelog`).

---

## [Unreleased]

---

## [0.99.8.8] - 2026-05-11 — *Documentation + tooling hygiene checkpoint (mid Wave E2 soak)*

### Changed

- **Documentation and feedback-memo housekeeping**. Added two local-changes
  review reports (2026-05-08 + 2026-05-11) plus a session report covering
  the v0.99.8.5 → v0.99.8.7 ship arc on 2026-05-01 → 2026-05-03. Renamed
  internal test-strategy / test-plan files to kebab-case to match the rest
  of the docs tree.
- **Claude Code project settings reset**. Restored `.claude/settings.json`
  from the upstream dotfiles template and trimmed project-local overrides
  in favour of user-global defaults. `.agent/` synced from upstream with
  kebab-case rename, presence checks, and the new `prompts/` directory.
- **DevContainer pin + harden**. AWS CLI version pinned, and the `uv`
  installer path is hardened against transient mirror failures.

### Internal

- `TASKS.md` synced to reflect #478 and #482 closed on main.
- `.gitignore` adds canonical review/remediate scratch paths and globs
  build outputs.

### Notes

- Cuts a checkpoint tag mid-soak (Wave E2 closes 2026-05-13). No
  functional code changes — `getActiveCropForBed` and the BedCrop API
  surface remain untouched, so the soak window is unaffected. The next
  release will land with Wave E3 once the soak closes clean.

---

## [0.99.8.7] - 2026-05-03 — *#482 audit-log gap for image-delete events*

### Fixed

- **#482 audit log shows image-delete events**. The `image.deleted`
  and `images.bulk_deleted` events introduced in v0.99.8.6 (#478)
  were emitted by their routes but never persisted to the activity
  log, and the Admin UI couldn't filter for them. Three registries
  had to stay aligned: `services/activity.ts` (subscription +
  `fromPayload` mapper), `AdminDashboard.tsx` (`EVENT_LABELS` filter
  dropdown + label/color), and `i18n` EN/JA (`activity_event_*` keys).
  All three are now wired in.
- **`image.deleted`** maps to `target_type=image`, `target_id=image_id`,
  with `details: { bed_id, captured_at }`. **`images.bulk_deleted`**
  maps to `target_type=image`, `target_id=bed_id` (the natural unit of
  a bulk delete), with `details: { bed_id, day, image_ids, count }`
  where `count` is derived from `image_ids.length`.

### Tests

- New regression cases in `activity.test.ts` assert end-to-end
  emit → persist → mapped row for both new event types, including the
  shape of `target_id` and `details.count` derivation.
- The "records all enumerated event types" test now derives the
  expected call count from `events.length` instead of a hardcoded
  number, so future additions to the test array won't drift the
  expected count.

### Notes

- Saved a feedback memory documenting that adding a new audit event
  type requires updating three registries together — `events.ts` (type
  union), `activity.ts` (subscription + mapper), `AdminDashboard.tsx`
  (label + i18n). The class-of-bug shape is "hand-maintained registry
  drift," same shape as the CHANGELOG ↔ VersionHistory drift the
  consistency test guards against.

---

## [0.99.8.6] - 2026-05-01 — *#478 delete-picture capability (owner/admin only)*

### Added

- **#478 delete-picture capability** on the per-bed crops page (BedDetail).
  Owner and admin roles can prune captured images, either one at a time
  or in a daily-bulk batch. Staff and non-members do not see the
  affordance, and the API rejects them with 404 per the existing
  `assertBedWriteAccess` opacity convention.
  - `DELETE /api/v1/images/:imageId` — single-image delete (204).
  - `DELETE /api/v1/beds/:bedId/images?day=YYYY-MM-DD` — bulk per-day
    delete (200 with `deleted_count`, `image_ids`, `failed_count`,
    `failed_ids` — explicit partial-failure surfacing on a destructive
    operation).
  - DDB cascade: image row + tag rows via `BatchWriteCommand` chunked at
    25 per AWS limit, with one `UnprocessedItems` retry (mirrors
    `deleteFarm`).
  - S3 cleanup: best-effort `deleteImage` + new `deleteThumbnail` helper
    for the THUMBNAIL_BUCKET. Orphan S3 objects are harmless — signed
    URLs 404 — and are caught by bucket lifecycle policies.
  - Audit events: `image.deleted` (with `captured_at` for forensic
    reconstruction) + `images.bulk_deleted` (carries the deleted ID
    list).
  - Day query parameter validates regex AND calendar correctness via
    `Date` round-trip — rejects `2026-99-99` and rolled-over dates like
    `2026-02-30` rather than silently no-opping.
- **Cascade policy** is Option A — filter at read-time. Diary entries
  retain their `photo_ids` arrays as-is; the badge count may slightly
  overstate after a delete, and the lightbox 404s gracefully on a
  deleted image. Accepted pilot trade-off; soft-delete (Option C) is
  the upgrade path if needed at v1.0+.

### Frontend

- **BedDetail.tsx**: per-thumb 🗑 button (top-left corner, owner/admin
  only) and a day-bulk "Delete N" button at the top of each expanded
  day group's body. Confirm modal reuses the existing `Modal` + `btn-
  danger` patterns. Delete affordances are gated client-side via
  `canDeletePictures = !isCropReadOnly`, mirroring the existing role-
  state pattern.
- **i18n**: new `buttons.delete` + `delete_pictures.*` namespace (EN
  and JA), with `{count}` and `{date}` placeholders for the bulk-confirm
  copy. New regex test guards the placeholders against future
  translation drift.

### Tests

- 1318 vitest cases green (was 1286). New repository-level tests for
  `listImagesByBedAndDay` (SK prefix guardrail — `begins_with(SK,
  'IMG#YYYY-MM-DD')`) and `deleteImage` (BatchWrite chunking at 25
  items + `UnprocessedItems` retry). New i18n placeholder integrity
  test for `delete_pictures.*`. Consistency test grew with the new
  release.

---

## [0.99.8.5] - 2026-04-29 — *Lint hardening + load-test harness fixes + first complete k6 baseline*

### Fixed

- **k6 multi-crop scenario silent in v1 baseline** — when the test
  user's first farm had no beds with `active_crops_count > 0`, the
  multi-crop scenario early-returned, leaving
  `list_bed_crops_duration` and `get_bed_crop_detail_duration`
  Trends empty. Fix: fall back to the first 5 beds regardless. They
  return empty arrays but still hit `getActiveCropForBed`'s
  lazy-materialize path — exactly the surface Wave E2 watches in
  prod logs.
- **k6 per-scenario `http_req_duration{scenario:*}` filters reported
  `0s`** in v1 baseline due to a tag-attribution mismatch. The
  previous config tried to set kebab-case scenario tags
  (`tags: { scenario: 'cold-path' }`), but k6 v1.0.0 also
  auto-applies a `scenario` tag with the JS-key value (`coldPath`).
  The two don't merge — threshold filters matched neither. Fix: drop
  the custom kebab-case tags; threshold filters now use the
  camelCase scenario keys k6 auto-applies.
- **#471 unused-import lint warnings** (10 originally + 4 drift)
  cleared. Type/tool imports deleted; data fixtures prefixed with
  `_` to keep them as documentation while satisfying the eslint
  `^_` allow-pattern.

### Changed

- **`@typescript-eslint/no-unused-vars` rule promoted from `warn` to
  `error`** — prevents #471's drift class from recurring. New code
  with unused imports / consts now fails lint outright. The `^_`
  prefix escape hatch is preserved for fixtures.
- **eslint config renamed to `.mjs`** — `eslint.config.js` →
  `eslint.config.mjs`. Eliminates the `MODULE_TYPELESS_PACKAGE_JSON`
  Node warning that fired on every `npm run lint` invocation.
  ESLint v9+ supports both filenames; the `.mjs` extension tells
  Node to parse the file as ES module without requiring
  `"type": "module"` in `package.json` (which would affect other
  JS files in the project).
- **`npm run lint` consolidated to a single eslint invocation** —
  was `eslint src/api/src --ext .ts && eslint packages/shared/src
  --ext .ts`, now `eslint src/api/src packages/shared/src --ext .ts`.
  Surfaces all warnings from both workspaces in one pass.
- **Migration script `scripts/migrate-wave-e-promote-legacy-crops.ts`**
  now requires `TABLE_NAME` to be set explicitly. The legacy
  `litcrop-poc` default has been removed to prevent operator
  errors — `litcrop-poc` is a stale table that still exists in the
  account but is neither staging (`litcrop-mvp`) nor production
  (`litcrop-prod`). Operators saw the trap during the actual
  2026-04-29 migration; this guard prevents recurrence.

### Added

- **First complete + honest k6 baseline** captured against staging
  at commit `b3603ec`. See `docs/reports/LOAD-TEST-BASELINE.md` for
  the full v2 entry. Headlines: 7,162 requests, 0 failures, all 5
  SLOs pass with multi-× headroom, multi-crop coverage now
  established (`list_bed_crops_duration` p95 = 119 ms).
- **Issue #478 filed** — delete-picture capability on the per-bed
  crops page (owner/admin only, single + daily-bulk granularities).
  Queued for next-scope work; not part of v0.99.8.5.

### Tests

- 1286 vitest cases green; consistency test now 38/38 with the new
  v0.99.8.5 parameterized case.
- `npm run lint`: 0 errors, 0 warnings (was 14 warnings before
  #471's cleanup).

### Migration / Operator notes

- Wave E2 soak still in progress (clock started 2026-04-29;
  eligible for E3 from 2026-05-13).
- The k6 v2 baseline confirms `list_bed_crops_duration` p95 <
  1500 ms under modest load — synthetic coverage of the Wave E2
  watch surface, complementing the organic prod log monitoring.
- GitHub Actions quota was at 100% as of 2026-04-29; resets ≤
  2026-05-01. v0.99.8.5 ship PR (develop→main) was deferred until
  quota reset to avoid stuck-CI churn.

---

## [0.99.8.4] - 2026-04-29 — *#470 login hydration fix + first k6 baseline + load-test infrastructure polish*

### Fixed

- **#470 — Chromium login flake eliminated.** The previous e2e
  `beforeEach` waited only for the SSR'd `#login-email` element,
  which existed before Preact's `onInput`/`onSubmit` handlers had
  attached. On slower chromium workers, `page.fill()` wrote to the
  raw DOM and `page.click()` fired native form submit before the
  handlers were bound, causing flaky `.form-error` /
  `.auth-server-error` assertions. Fix: `LoginForm.tsx` now sets
  `data-hydrated="true"` on the form root after first client mount
  via a separate `useEffect`; e2e tests wait for that marker
  instead. SSR-safe (attribute absent in server-rendered HTML).
  Validated by **5 consecutive CI runs without any retry recovery**
  per #470's acceptance criteria. No user-visible behavior change.

### Changed

- **k6 load-test harness — per-VU Cognito token caching.** Adds a
  `getOrSignIn()` helper backed by a per-VU `cachedIdToken`; routes
  hot-path / me-activity / multi-crop / admin-stats scenarios
  through it instead of re-authenticating on every iteration.
  Eliminates the ~5-RPS-per-IP `InitiateAuth` throttle that caused
  87% sign-in failures on the first attempted baseline run. The
  cold-path scenario continues to call `cognitoSignIn()` directly
  because measuring fresh sign-in latency is its job.
- **k6 documentation corrected** — the original 2026-04-20 scaffold
  (#443) documented `k6 run --env-file .env k6-baseline.js` in
  three places. The `--env-file` flag does not exist in k6.
  Replaced with the correct shell-sourcing pattern across README,
  script header, and `LOAD-TEST-BASELINE.md`:
  ```
  set -a; source .env; set +a
  k6 run k6-baseline.js
  ```
  Plus a quick-smoke-test command (`k6 run --vus 1 --duration 5s`)
  for fast credential validation.

### Added

- **First empirical k6 baseline captured** — see
  `docs/reports/LOAD-TEST-BASELINE.md`. Run on 2026-04-29 against
  staging (`litcrop-mvp`) at commit `ea44fc3`: **6,497 requests,
  0 failures, aggregate p95 = 259 ms** across 28 max VUs / 5
  parallel scenarios for 2 minutes. Cognito auth p95 = 335 ms;
  `me_profile` p95 = 82 ms; `me_activity_first_page` p95 = 75 ms
  (~18× under the R5 SLO). Two limitations recorded transparently:
  (1) per-scenario `http_req_duration{scenario:*}` filters report
  `0s` due to a k6 tag-attribution quirk — custom Trends and the
  aggregate http_req_duration are unaffected; (2) multi-crop
  scenario went silent because the test user's first farm has no
  beds with `active_crops_count > 0`. Both tracked as future-baseline
  follow-ups.

### Tests

- 1285 vitest cases green. CHANGELOG ↔ VersionHistory consistency
  test now 37/37 (added v0.99.8.4 parameterized case).

### Migration / Operator notes

- Wave E2 soak still in progress (clock started 2026-04-29;
  eligible for E3 from 2026-05-13). The k6 multi-crop scenario is
  wired but has no test-data coverage in this baseline; soak still
  relies on organic prod traffic for `getActiveCropForBed`
  fallback-branch monitoring. Test-data fix (provision a multi-crop
  bed for the staging test user, OR loosen the script's filter)
  recommended before the next baseline cycle.

---

## [0.99.8.3] - 2026-04-29 — *Soak-window infrastructure: Actions runtime bump + k6 multi-crop scenario*

### Changed

- **GitHub Actions runtime bumped to v5** — closes #472.
  `actions/checkout@v4` → `@v5` (8 references), `actions/setup-node@v4`
  → `@v5` (8 references), `actions/upload-artifact@v4` → `@v5` (1
  reference) across all three workflow files
  (`pr-checks.yml`, `deploy.yml`, `deploy-staging.yml`). The v5 line
  of each action runs on the Node 24 action runtime, which becomes
  the runner default on 2026-06-02 and the only available runtime
  after Node 20 is removed from runner images on 2026-09-16. Language
  pin (`node-version: '24'`) was already in place from earlier work —
  this release addresses the action-runtime layer.

### Added

- **k6 multi-crop fan-out scenario** in
  `tools/load-test/k6-baseline.js` — Wave E2 soak-window watch.
  Lists farms → picks a farm → lists beds → fans out to
  `GET /beds/:id/crops?status=all` for every bed with
  `active_crops_count > 0`, bounded to 5 beds per iteration.
  Detail-fetches the first non-virtual crop via
  `GET /beds/:id/crops/:cropId`. Skips `bed-legacy-*` IDs to keep
  the failure-rate metric clean. Threshold: p95 < 1500ms per request;
  5 VUs for 90s. Combined with the existing 4 scenarios, the full
  baseline now exercises ~28 VUs on staging for ~2 min.
- Two new k6 Trends: `list_bed_crops_duration`,
  `get_bed_crop_detail_duration`.
- README + LOAD-TEST-BASELINE.md updated to reference the 5th
  scenario, its threshold, and the multi-crop bed prerequisite for
  the test fixture user.

### Operations

- **#472 live-verified passing** — Deploy Staging workflow run on
  commit `2a05f80` successfully pulled `actions/checkout@v5` and
  `actions/setup-node@v5` and completed a clean staging deploy of
  develop. This is the live-verification step the issue called for;
  no change to deploy behavior detected.
- **k6 baseline still pending operator action** — the harness now
  has the multi-crop scenario but no empirical baseline has been
  captured yet (the harness was originally scaffolded 2026-04-20 in
  v0.99.7.2 but never run). When run, results land in
  `docs/reports/LOAD-TEST-BASELINE.md` per the existing template.

### Tests

- 1283 vitest cases green (no test additions; CI workflows + load-
  test harness are the surfaces touched).

### Migration / Operator notes

- Wave E2 soak still in progress (clock started 2026-04-29; eligible
  for E3 from 2026-05-13 conditional on zero `getActiveCropForBed`
  fallback hits). Running the new k6 multi-crop scenario during the
  soak window provides synthetic-load coverage of the same code path
  the soak watches in organic prod traffic — useful for catching
  missed code paths well before they could surface as a production
  issue.

---

## [0.99.8.2] - 2026-04-29 — *Wave E1 migration shipped + executed; soak window open + hygiene roll-up*

### Added

- **Wave E step 1** (DESIGN-279 §6 step 1) — promote-legacy-crops
  migration code. Adds the optional `created_from_legacy?: boolean`
  idempotency marker to the `BedCrop` domain type + Zod schema +
  DDB mapper. Adds `promotedCropId(bedId) = "promoted-<bedId>"` —
  a deterministic id helper so a concurrent-runs race against the
  same bed collapses to an idempotent overwrite with identical
  content (R-E1-001 race fix). Intentionally distinct from the
  `bed-legacy-` virtual-projection sentinel so D3's harvest auto-
  default treats promoted rows as REAL crops.
- New migration module
  (`src/api/src/services/migrations/wave-e-promote-legacy.ts`):
  `shouldPromoteBed` (pure predicate with 4 skip reasons),
  `buildPromotedCrop` (pure builder), and
  `promoteLegacyCropForBed` (orchestrator with dry-run support).
- New CLI script
  (`scripts/migrate-wave-e-promote-legacy-crops.ts`) — scans
  `BED#`-prefixed rows; per-50-beds heartbeat; guard for malformed
  rows missing `farm_id`/`id`; per-bed `log + continue` error
  recovery.
- 19 vitest cases for the migration (predicate skip-reasons,
  builder shape, orchestrator happy/dry-run/idempotent paths,
  deterministic-id concurrent safety, D3-prefix compatibility,
  T-E1-01/02 error-bubble regression locks).
- CHANGELOG ↔ VersionHistory consistency test
  (`src/frontend/src/__tests__/changelog-versionhistory-consistency.test.ts`)
  — vitest assertion that the newest released CHANGELOG version is
  present in `VersionHistory.tsx` with the `current` prop and has
  matching `changelog.<key>_item_1` in both `en.json` and `ja.json`.
  Closes the drift class surfaced on PR #469 where the in-app
  `/history` page showed v0.99.7.5 as `current` after v0.99.8.1 had
  shipped. 34 cases.
- New operator runbook
  (`docs/ops/RUNBOOK-WAVE-E-PROMOTE-LEGACY-CROPS.md`) — covers the
  data-shape change, dual-read shim rationale, the 4-step Wave E
  sequence, pre-flight checks, run order
  (staging-dry → staging-live → prod-dry → prod-live), expected
  output shape, recovery/rollback paths, and run history for both
  environments.
- PR template (`.github/PULL_REQUEST_TEMPLATE.md`) gains a checklist
  line nudging contributors to update `VersionHistory.tsx` + i18n
  whenever a new version tag is added to `CHANGELOG.md`.

### Changed

- `VersionHistory.tsx` (in-app `/history` view) catches up to
  v0.99.7.6, v0.99.8.0, and v0.99.8.1 entries (3 new
  `<VersionEntry>` blocks + 7 i18n keys, EN/JA). The `current` flag
  transfers from v0.99.7.5 → v0.99.8.1 → v0.99.8.2 across the
  catch-up + this release.

### Fixed

- DevContainer `/resume` and `/rename` no longer silently fail
  after a rebuild. Root cause: Docker materializes the
  `~/.claude/projects/-workspace/memory` bind mount before
  `post-start.sh` runs, fabricating the parent dirs (`projects/`,
  `projects/-workspace/`) as `root:root`. Combined with
  `no-new-privileges:true` in `compose.yml`, `post-start.sh` could
  not reclaim ownership via `sudo`. Two-part fix: Dockerfile
  pre-creates `/home/${USERNAME}/.claude/projects/-workspace` so the
  existing `chown -R` covers it before mount-time, and
  `post-start.sh` adds a Layer 0 reclaim that non-recursively chowns
  those parents if they still exist as `root`. Same bug class as
  the earlier `.claude-state` volume permissions fix.

### Operations

- **Wave E1 migration EXECUTED** on both environments (2026-04-29):
  - Staging (`litcrop-mvp`): **13 beds promoted** (cherry_tomato,
    cucumber, eggplant, napa_cabbage, corn, watermelon, daikon,
    shiso, melon, sweet_potato, edamame, zucchini, green_onion); 7
    skipped (no-inline); 1 malformed orphan caught by guard
    (pre-existing `PK=FIELD#…` row from earlier schema iterations).
  - Production (`litcrop-prod`): **0 beds promoted**; 20 skipped
    (no-inline). Prod is fresh — PR #469 (2026-04-28) was the first
    time multi-crop reached prod; real users had not yet planted
    via the legacy inline path at the time of migration.
- **Wave E2 soak window OPEN** — clock started 2026-04-29.
  Eligible for E3 from **2026-05-13** onward, conditional on zero
  `getActiveCropForBed` fallback-branch hits in prod logs
  (`bed-crops.ts:140-156`).

### Tests

- 1283 vitest cases green (1249 pre-PR-#473 + 34 from the new
  CHANGELOG ↔ VersionHistory consistency test).

### Migration / Operator notes

- Wave E2/E3/E4 remain queued. E2 = ≥ 14 days zero hits on the
  lazy-materialize fallback in `getActiveCropForBed`. E3 = fallback
  removal. E4 = drop inline `Bed.crop_type` etc. (breaking release,
  coordinated with frontend migration). All gated on E2.
- Operator runbook above documents the run history table for
  both environments and recovery procedures if any future re-run
  is needed.

---

## [0.99.8.1] - 2026-04-24 — *#279 — 1:N bed-to-crop (Wave D — diary FK)*

### Added

- `DiaryEntry.bed_crop_id: string | null` — per-crop attribution field on diary entries. Contract landed in shared types + Zod (`DiaryEntryFieldsSchema`, `DiaryEntryResponseSchema`) and DDB mapper with `null` fallback (D1). POST + PATCH `/api/v1/farms/:farmId/diary` accept, validate (via `getBedCrop(bed_id, bed_crop_id)`), and persist the field (D2). Null is always allowed — leave-null semantics per DESIGN-279 §3.3.
- `DiaryEntryForm.tsx` flat bed-crop selector (D4) — single dropdown with a 3-tier hierarchy: "Farm-level (no specific bed)" → "{Bed} (All)" for bed-level attribution on modern beds → "{Bed} — {Crop}" for each active/planned BedCrop. Legacy beds without real BedCrops keep the "— {Crop}" shim label. Each option encodes `<bedId>|<cropId?>`; empty cropId = bed-only. `listBedCrops(bedId, 'all')` fan-out per bed populates the selector.
- `computeRoiByBedCrop` aggregator + `BedCropRoiSummary` type + `RoiByBedCropTable.tsx` component (D5) — new "ROI by Crop" table rendered below the existing by-bed rollup. Buckets entries into three scopes: crop (`bed_crop_id` resolves to a real BedCrop), bed (legacy / unattributed entries), farm (no `bed_id`). Matches D4's label vocabulary ("Farm-wide", "(All)", "— {crop}") so the hierarchy is consistent between input and output.
- Gantt/Timeline per-crop diary overlay (D6) — `buildActualDatesMap` and `buildEventDotMap` in `diary-utils.ts` now key on `bed_crop_id ?? bed_id`; `GanttChart.tsx` + `CropTimeline.tsx` cascade via `row.cropId ?? row.bedId`. Multi-crop beds render independent "actual" bars and event dots per crop; virtual-legacy rows (cropId=null) still pick up pre-Wave-D entries via the bed-level fallback. Closes the last Wave C visible limitation (shared diary overlay across stacked rows).
- Server-side harvest auto-default (D3) — POST `/diary` with `category='harvesting'` + `bed_id` + omitted `bed_crop_id` auto-attributes to the bed's ACTIVE real BedCrop. Planned BedCrops and virtual legacy (`bed-legacy-*`) are skipped (can't harvest what wasn't planted). Lookup failure is tolerated (leaves null + `console.warn`). PATCH is deliberately excluded — user edits don't get overwritten.
- 3 new `roi.*` i18n keys: `roi_by_crop`, `bed_crop_column`, `farm_wide`.

### Changed

- `buildEntryResponse` now emits `bed_crop_id` in diary responses — closes a pre-existing contract gap where D1/D2 persistence was invisible to clients because the response builder stripped the field. Frontend local `DiaryEntryResponse` also updated to require the field (was relying on runtime success since D4).
- JA vocabulary polish: `農場全体` → `農園全体` in `diary.farm_level` and `roi.farm_wide` — consistent with the app's 農園 usage elsewhere.

### Tests

- 1194 → 1230 vitest tests (+36 net).
  - D5: +13 — `computeRoiByBedCrop` contract, scope bucketing, currency isolation, sibling bucket keys, label-parity regression locks (T-D5-01/02/03).
  - D6: +9 — `buildActualDatesMap` + `buildEventDotMap` per-crop keying, sibling isolation, reserved-entry exclusion with `bed_crop_id` set, per-crop latest-date + no cross-bucket leak, per-crop dot sort order.
  - D3: +10 — auto-attribute happy path, virtual-legacy skip, planned-crop skip, non-harvest no-fire, explicit-value respect, no-bed_id no-fire, lookup-failure tolerance (with `console.warn` assertion), PATCH-no-auto regression guard, null-active short-circuit, response-echo round-trip.
- Pre-commit typecheck green across all workspaces throughout the wave. Every Wave D step (D5, D6, D3) ran the full `/simplify → /cc-review → /cc-remediate → /cc-test` pipeline.

### Documentation

- `docs/feedback/REVIEW-FINDINGS.md` — Sessions 6 / 7 / 8 for Wave D D5 / D6 / D3 prepended to the cumulative log.
- `docs/feedback/REMEDIATION.md` — remediation reports for each wave step (all 0 MUST-FIX; SHOULD-FIX + SUGGESTION findings resolved in one iteration each).
- `docs/TEST-PLAN.md` — coverage gap analyses for D5 / D6 / D3 (all 0 MUST-ADD; all SHOULD-ADD implemented as regression locks or deferred with rationale).

### Migration notes

- No data migration. Pre-Wave-D diary entries retain `bed_crop_id=null` and surface on the bed-level / virtual-legacy row via the cascade lookup. Users can optionally backfill via PATCH; Wave E will revisit promotion policy.
- Tag `v0.99.8.1` is develop-only at cut time — deliberately held back from main until the user chooses to ship.

---

## [0.99.8.0] - 2026-04-24 — *#279 — 1:N bed-to-crop (Waves B + C)*

### Added

- `BedCrop` domain entity — replaces the 1:1 bed↔crop pairing with a proper 1:N association. Each bed now supports up to 5 concurrent active/planned crop cycles (intercropping + succession) plus unbounded historical cycles (harvested/failed). Driven by a real user who hit the multi-crop need (#279 Wave B).
- `BedCropStatus` enum: `'planned' | 'active' | 'harvested' | 'failed'`. Terminal transitions auto-set `completed_at` server-side (Wave B S5-1 remediation).
- BedCrop CRUD API routes at `/api/v1/beds/:bedId/crops[/:bedCropId]` (POST/GET/PATCH/DELETE) with 5-crop cap enforcement and farm-member ownership checks. Mandatory GSI1 prefix guard (`begins_with(GSI1SK, 'CROP#')`) is a tested invariant (Wave B).
- `FarmBed.active_crop` — canonical reference to a bed's active BedCrop, served as a compact `BedActiveCropSummary` projection on `GET /farms/:id`, `GET /farms/:id/beds`, `GET /beds/:id`. Legacy inline crop fields continue to mirror `active_crop` throughout the shim window (Wave B → D); removed in Wave E.
- `active_crops_count` on `BedDetailResponse`, `FarmBed`, and `FarmBedItem` — count of active+planned crops including any legacy inline active. Drives the "(N/5)" 5-cap indicator and the "+N" tile-view overflow badge (Wave C).
- `BedActiveCropSummary.status` — exposes `BedCropStatus` on the summary so UIs can visually distinguish planned vs active crops (Wave C).
- BedDetail.tsx modal-based Add / Edit flow (uses `Modal.tsx` portal primitive): inline edit toggle replaced with "Add new planting" modal + per-crop active cards (status pill, Edit, Complete cycle) + lazy-loaded history accordion showing harvested/failed crops with completion dates + per-cycle notes. Cards iterate real BedCrops; legacy virtual projection falls back to a single card.
- FarmOverview + FarmLayoutView tile views show a "+N" overflow indicator next to the primary crop name when a bed carries more than one active crop (aria-label carries the same suffix for screen-reader parity).
- GanttChart + CropTimeline — one row per crop cycle. Multi-crop beds produce multiple rows with independent reserved/actual bars and per-row mark-done / undo-done actions. Row id is stable (`${bedId}:${cropId ?? 'legacy'}`); legacy virtual projection collapses to a single row.
- `createBedCrop` / `listBedCrops` / `updateBedCrop` / `deleteBedCrop` on the frontend API client; matching `CreateBedCropRequest` / `UpdateBedCropRequest` types re-exported from `@litcrop/shared`.
- 12 new i18n keys in the `bed.*` namespace (EN + JA): `no_active_crop`, `add_new_planting`, `complete_cycle`, `cycle_completed`, `crop_added`, `cap_reached`, `show_history`, `hide_history`, `no_history`, `completed_on`, `history`, `crop_status.{planned,active,harvested,failed}`.

### Changed

- `GET /api/v1/farms/:farmId`, `GET /api/v1/farms/:farmId/beds`, `GET /api/v1/beds/:bedId` — additive: responses now include `active_crop` and `active_crops_count` on each bed. No existing fields removed during the shim window.
- BedDetail.tsx crop-write path — migrated from legacy `PATCH /beds/:id` (inline crop fields) to `POST/PATCH /api/v1/beds/:id/crops[/:cropId]`. Legacy endpoint preserved for external callers and for non-crop fields; removed in Wave E.
- `syncBedDatesFromDiary` (Wave B) — prefers real `BedCrop` rows when both a real and a legacy inline crop exist for a bed. Legacy-only path preserved.
- FarmOverview + FarmLayoutView tile read path — prefers `bed.active_crop?.crop_type ?? bed.crop_type` via extract-to-local pattern. Values are identical during the shim window; the change future-proofs Wave E's inline-field drop.
- DiaryPage `handleMarkDone` / `handleUndoDone` — now accept a `cropId`. Real BedCrops route to `updateBedCrop` status transitions; legacy virtual falls back to `updateBed` `completed_at` toggle.
- `BedCropStatusSchema` relocated to the top of `packages/shared/src/schemas/index.ts` (previously defined at the bottom alongside BedCrop schemas) to resolve a forward-reference from `BedActiveCropSummarySchema`.

### Fixed

- `BedDetailResponse` TS interface drift — the Zod schema already inherited `active_crop` via `FarmBedSchema.extend`, but the TS interface extended `Bed` (which doesn't have it). Frontend received `active_crop` at runtime but had to cast. Interface now explicitly declares the field (Wave C Gap 1 of the API contract review).
- Wave B S5-1: PATCH /beds/:id/crops/:cropId auto-manages `completed_at` on terminal status transitions so callers don't need to pass it explicitly on "Complete cycle" flows.
- Wave B S5-2: DELETE on terminal-status BedCrops is a no-op — prevents the shim from overwriting the historical completed_at with `now`.
- Wave B S5-3: `GET /beds/:id` forces `completed_at: null` whenever `active_crop` is non-null — eliminates the `active_crop && completed_at` contradiction.
- Wave B S5-4: 5-crop cap-check formula includes any legacy inline active crop — prevents a "legacy tomato + 5 real active" overrun during the shim window.

### Tests

- 1140 → 1194 vitest tests (+54 net).
  - Wave B: +36 — schemas (10 BedCropSchema contract), bed-crops repo (11), bed-crops routes (15, incl. 4 S5-1..4 remediation).
  - Wave C: +18 — `toBedActiveCropSummary` projection (5), `BedActiveCropSummarySchema` contract (7), `BedDetailResponseSchema` active_crop + active_crops_count (6).
- Pre-commit typecheck green across all workspaces. CI "Deploy to Staging" green on every push — Wave C deployed to staging through five pipeline runs, verified multi-crop UX in browser (BedDetail modal/accordion, tile "+N" indicator, Gantt multi-row).

### Documentation

- `docs/design/DESIGN-279-bed-crop-1n.md` — phased plan A → E, terminology lock-in, DynamoDB key layout, 5-cap constraint, lazy-materialize migration, shim contract, risks + test strategy.
- `docs/feedback/COVERAGE-NOTE-waveb.md` — Wave B coverage assessment post-`/cc-test`.
- `docs/feedback/REVIEW-FINDINGS.md` Session 5 entry (ACCEPT, 0 MUST-FIX / 4 SHOULD-FIX) + Wave B remediation ledger entry documenting the S5-1..4 resolutions.

---

## [0.99.7.6] - 2026-04-24 — *Stream 2 kickoff — #279 Wave A prep*

### Added

- `hasActiveCrop<T extends { crop_type?: string | null }>` type guard in `@litcrop/shared` — pre-Wave B shim that narrows `crop_type` from `string | null | undefined` to `string` for downstream consumers. Post-Wave B this will resolve against the `BedCrop` entity without changing caller-side signatures (#279).
- Unit test covering all 5 branches of the type guard (truthy, missing key, explicit undefined, null, empty string) + narrowed-field preservation.
- `docs/design/DESIGN-279-bed-crop-1n.md` — phased build plan for Issue #279 (bed-to-crop 1:N): Wave A (prep) → B (data) → C (UI) → D (diary) → E (cleanup). Locks `BedCrop` as canonical entity name, specifies the DDB key layout (`PK=FARM`, `SK=CROP#<bedId>#<bedCropId>`, GSI1 `PK=BED#<bedId>` with mandatory `begins_with(GSI1SK, 'CROP#')`), 5-crop cap enforcement, lazy-materialize migration per #462 precedent, and a backward-compatible `FarmBed` shim that keeps the legacy inline crop fields populated during Wave B → D.
- `docs/feedback/COVERAGE-NOTE-stream2.md` — cc-test coverage note for the Wave A prep.
- `docs/feedback/REVIEW-FINDINGS.md` Session 4 entry (ACCEPT, 0 MUST-FIX / 3 SHOULD-FIX — all design-doc clarifications, remediated in the same release).
- `docs/feedback/REMEDIATION.md` Stream 2 kickoff entry documenting the three design-doc clarifications applied (§3.4 GSI guardrail, §4.2+§4.3 compat-shim contradiction, §6 Wave E ordering).

### Changed

- `src/api/src/routes/weather.ts`, `chat.ts`, `diary.ts` — 3 call sites migrated from inline `bed.crop_type` truthy checks to the new `hasActiveCrop` type guard. Removes 5 `b.crop_type!` non-null assertions without changing behavior. Internal refactor; zero user-visible impact.
- `TASKS.md` — regenerated via `/cc-issue-sync` after PR #468 closed #443/#445/#448/#464. Open count 19 → 15 (9 Production + 6 Backlog).

### Tests

- 1135 → 1140 vitest tests (+5 for `hasActiveCrop` branch coverage). All existing route tests in `weather.test.ts` / `chat.test.ts` / `diary.test.ts` green, confirming the call-site substitution is behavior-neutral. Zero flakes across the pipeline.

---

## [0.99.7.5] - 2026-04-23 — *Stream 1 Hardening close-out*

### Added
- Quarterly incident tabletop drills policy at `docs/ops/INCIDENT-DRILLS.md` — 8 scenarios mapped 1:1 to `RUNBOOKS.md` runbooks via anchor links, pre/post checklists, and a drill-log template scoped to `docs/ops/drill-logs/YYYY-QN-<slug>.md` (R-011, #448).
- Two troubleshooting entries in `/help/device-setup` §5: undervoltage warnings during capture (≥ 2.5 A supply guidance for Pi Zero WH) and stale-dashboard-photo debug chain (`journalctl` + hard-refresh). Bilingual EN + JA with element-order parity (#464).
- "Est. 30 min" / "所要 約30分" time-estimate pill on `/help/device-setup` §5 header — sets setup-time expectations before the user begins (#464).
- `.help-section kbd` CSS rule in `/help/device-setup` — styles `<kbd>` tags as direct siblings of `<code>` (gray-100 bg, `radius-sm`, key-cap `border` + `box-shadow`). Addresses cc-review SHOULD-FIX #1, resolved in cc-remediate iteration 1 (#464).
- `docs/feedback/COVERAGE-NOTE-stream1.md` — records the Stream 1 coverage assessment: hook extraction is refactor-neutral, test-env limitation (node, no JSDOM) is architectural rather than a regression, ship recommendation documented.

### Changed
- `ProfilePage.tsx` refactored 512 → 394 lines via extraction of two dedicated hooks: `useProfileSettings` (locale + tempUnit + theme sync, 143 ln) and `usePendingRegistration` (displayName + picture + admin flag + preferred role, 79 ln). Pure refactor — 1135/1135 vitest green pre and post, cross-validated via `git show d1884da` diff comparison (R-001, #445).
- `docs/reports/LOAD-TEST-BASELINE.md` gains a pre-run checklist (k6 install, `.env` fill-in, staging health, test-user data, load authorization, optional admin token) and a 4-scenario template with SLO column (cold-path / hot-path / admin-stats / me-activity) (#443).
- `tools/load-test/README.md` expanded to 4 scenarios with `p95 < 1500 ms` me-activity threshold (R5, per `docs/TEST-STRATEGY-462.md` §6) and `< 5%` failure-rate threshold; runtime target 10 min for a full baseline (#443).

### Tests
- 1135/1135 vitest green maintained across all Stream 1 edits (pre-session baseline, post-#445 verify, post-#448+#464, post-remediation, final close-out — five runs, no count drift, no flakes).
- Pipeline artifacts preserved as ledger entries: `docs/feedback/REVIEW-FINDINGS.md` session 3, `docs/feedback/REMEDIATION.md` Stream 1 entry, and the new coverage note.

---

## [0.99.7.4] - 2026-04-21 — *#462 Phase 4: ProfileActivityList + carry-over audit + UX polish*

### Added
- `<ProfileActivityList />` Preact component on the Profile → You tab — chronologically merged activity list with distinct icons per source (📔 planned-diary / 📗 actual-diary / 📡 device / 📷 image), i18n'd summaries, relative timestamps, deep-link anchors, and Load-more pagination (#462 Phase 4).
- `useMeActivity(limit=10)` fetch hook with opaque cursor pagination and `ActivityFeedResponseSchema` Zod validation; generic `"Couldn't load activity"` error surface, no server-message echo.
- `profile.activity.*` i18n namespace in `en.json` + `ja.json`; F11 key-coverage test enforces no raw English in component source.
- ~65 LOC of component CSS in `components.css` (skeleton keyframe animation, item flex layout, hover, error banner).
- `meActivity` k6 scenario in `tools/load-test/k6-baseline.js` with `p(95)<1500ms` threshold — captures the fan-out baseline before pilot-scale growth (R5).

### Changed
- Profile "You" tab anchors the Activity feed at the end: all finite-length sections (Logout, Change Password, Delete Account) sit above it so no account action drifts below the fold as the feed paginates.
- Default activity page size 20 → 10 — shorter first paint on mobile viewports.
- Diary-entry icon now distinguishes planned (📔) vs actual (📗 green book) in the activity feed; both color and aria-label carry the distinction (WCAG-compliant).
- Profile Farms tab inverts selected/unselected farm-card colors: the active card now uses `--color-primary` (same as the `+ New Farm` CTA) with white text; inactive cards use `--color-primary-light`. Active card has stronger visual weight than inactive siblings.

### Fixed
- `createImage` write path tightened — introduced `CreateImageData` interface and enumerated the `PutCommand` Item fields explicitly, eliminating the `Omit<Image> + spread` pattern that silently drifted new optional fields into DDB. Resolves the #462 Phase 1 deferred finding #5, carried over through three phases.
- Selected farm-card inner-text contrast restored: description, metadata, farm-ID, Delete, Leave, and edit ✏️ now use high-contrast white / rgba-white variants when rendered on the `--color-primary` background (Delete additionally gets an underline to preserve its destructive signal without relying on red). Staging-feedback follow-up to the color inversion.
- Generic `"Invalid cursor"` error message on `/me/activity` replaces the repo's internal messages (`"user mismatch"`, `"unknown type"`) — R3 cursor-forgery reconnaissance hardening.

### Tests
- 1067 → 1135 vitest tests (+68 across `ProfileActivityList.test.ts`, `ProfileActivityList.snapshot.test.ts`, `useMeActivity.test.ts`).
- 8 MUST + 5 SHOULD F-matrix tests from `docs/TEST-STRATEGY-462.md` §5 (F1–F11 implemented; F12 axe-core + F13 Playwright E2E tracked separately).

---

## [0.99.7.3] - 2026-04-20 — *#462 Phase 3: GET /me/activity endpoint*

### Added
- `GET /api/v1/me/activity?cursor=&limit=20` endpoint — chronologically merged feed of the caller's diary entries, registered devices, and attributed images. Response shape `{ items: ActivityItem[], next_cursor, total_count }` with `ActivityItem` as a discriminated union on `type: 'diary' | 'device' | 'image'` (#462 Phase 3).
- Pi-auth OR-predicate on the image source: `uploaded_by = me` OR (`trigger = 'scheduled'` AND `bed.device.registered_by = me`). Pi captures via the shared service-user JWT now attribute to the registering operator — see [#462 "Pi-auth reality correction" comment](https://github.com/ashmuk/litcrop/issues/462#issuecomment-4280185580).
- Opaque user-scoped cursor with I8 defense: `decodeActivityCursor(cursor, expectedUserId)` rejects a cursor whose encoded `user_id` does not match the requesting JWT sub (400 Invalid cursor). Legacy-null records (pre-v0.99.7.3) naturally drop out via strict `=== userId` filters.
- `ActivityItem` + `ActivityFeedResponseSchema` Zod schema in `@litcrop/shared` for frontend consumption.

### Changed
- /cc-review cycle on Phase 3: 3 SHOULD-FIX resolved (generic 400 on cursor rejection, diary-null I5 coverage parity, de-duplicated `getBedsForFarm` call per farm); 1 SHOULD-FIX re-deferred to v0.99.7.4 with a JSDoc marker.
- /simplify pass: `badCursor` + `scanAllByPrefix` helpers, named row aliases (`DiaryRow` / `DeviceRow` / `ImageRow`), typed route-handler `result`. Net −14 LOC.
- Phase 2 (backfill migration) explicitly **SKIPPED** per [2026-04-20 decision](https://github.com/ashmuk/litcrop/issues/462#issuecomment-4283023847) — Q1 policy is "leave null on pre-v0.99.7.3 records"; revisit triggers documented.

### Tests
- 1007 → 1067 vitest tests (+60 across repository, route, and schema-contract tests; 13 MUST + 4 SHOULD per `docs/TEST-STRATEGY-462.md` §4). E1 Playwright tracked as E2E scope.

---

## [0.99.7.2] - 2026-04-20 — *Wave 2 Part A: UX polish + scaffolding*

### Added
- Farm description now shown on the Profile → Farms tab — inline truncated on each farm card, full-width in the expanded detail panel (#461).
- Troubleshooting subsection in `/help/device-setup` covering the four most common first-boot failures: camera ribbon orientation, `install.sh` permissions, no-heartbeat debug chain, and Class-2 battery-reading timing (#464).
- k6 load-test baseline harness in `tools/load-test/` with scenarios for auth cold-path, farm hot-path, and admin stats (R-010, #443). Empirical baseline pending first staging run.

### Changed
- `/help/device-setup` Step 4 now explicitly states the SSH prerequisite (Raspberry Pi Imager advanced options) — EN + JA lockstep.

---

## [0.99.7.1] - 2026-04-20 — *Audit findings Wave 2 + DevContainer memory bridge*

### Added
- `CHANGELOG.md` at repo root in Keep a Changelog 1.1.0 format for machine-readable release tooling (R-013, #444).
- Development & AI Assistance section in README explaining Claude Code collaboration (R-007, #446).
- ADR-20260420 — #279 BUILD-in-waves scope decision, superseding ADR-20260406 (DEFER).
- DevContainer memory bridge (host ↔ container bind mount) — Claude memory persists across container rebuilds (#466).
- Playwright webkit project + reusable `expectNoSeriousA11y()` helper via `@axe-core/playwright`; one axe scan added per E2E spec file (R-008 + R-012, #442).

### Changed
- Weather impact and alert banners now show forecast values in both EN and JA with locale-aware date formatting (`4月23日` for Japanese instead of raw `2026-04-23`); fixes key-mismatch that previously dropped translation entirely (#463).
- TASKS.md synced to reflect v0.99.7 Wave 1 and device-ux series closures.

### Fixed
- DevContainer `post-start.sh` collision with the memory bind mount.

### Removed
- Retired stale `docs/TEST-STRATEGY-099X-GAP-ANALYSIS.md` — audit report preserves the story (R-014, #447).

---

## [0.99.7] - 2026-04-20 — *Wave 1: Ship Credibility*

### Added
- `LICENSE` file at repo root (MIT) — R-006 audit finding (#439).
- `SECURITY.md` with vulnerability disclosure channel — R-004 audit finding (#441).

### Fixed
- npm audit: resolved 4 high + 5 moderate advisories — R-003 audit finding (#438).

---

## [0.99.6.5] - 2026-04-20

### Added
- Device `capture_interval` self-skip gate — UI-driven interval now propagates through to the Pi cron schedule (#454).
- Cron schema v2 — device-side interval handling reworked.

---

## [0.99.6.3] - 2026-04-19

### Fixed
- Pi Zero WH without power HAT misclassified as Class-2 — tightened hardware detection in `install.sh` (#455).

---

## [0.99.6.2] - 2026-04-18

### Added
- Wifi signal bars with dBm value — replaces raw `-dBm` text indicator (#453).
- Class-1 battery clarity — UI explicitly states battery/power-source are unobservable on Class-1 devices (#456).
- Storage numeric UX — disk usage shown as percent + free bytes, not just OK/LOW/FULL (#457).

---

## [0.99.6.1] - 2026-04-18

### Fixed
- `install.sh` hotfix — serve `capture.sh` via CDN + nounset-safe `BASH_SOURCE`.

---

## [0.99.6] - 2026-04-18

### Added
- Full bilingual VersionHistory — EN + JA for all entries.
- Audit report `docs/reports/AUDIT-REPORT-v0.99.6.md` documenting 14 findings (R-001 through R-014).

### Changed
- Test hardening pass — additional coverage for profile tabs, Cognito round-trip, and Vite cache invalidation.

---

## [0.99.5] - 2026-04-18

### Added
- Cognito cross-device `display_name` bootstrap — first-time users get a profile record auto-created on login.

### Fixed
- Profile page accessibility — ARIA focus + keyboard navigation on the tabs pattern.
- Cache hygiene — stale-read edge cases in the profile data path.

---

## [0.99.4] - 2026-04-17

### Added
- Auto-create user profile on first sign-in.
- Earthy favicon variant.

### Changed
- AuthGuard sync — tightened the session-verification flow.
- CI cache — faster GitHub Actions runs.

---

## [0.99.3] - 2026-04-17

### Added
- Admin stats auto-refresh.
- Password visibility toggle on login.
- Footer i18n — full translation coverage.

---

## [0.99.2] - 2026-04-17

### Changed
- Profile page refactored to a tab-based layout.

### Fixed
- Desktop spacing regression on narrow viewports.

---

## [0.99.1] - 2026-04-16

### Added
- Favicon + PWA manifest.
- Horizontal hero layout on the landing page.
- Machine-readable audit trail.

---

## [0.99] - 2026-04-16

### Added
- `tsc --build` integrated into pre-commit hook (catches re-export gaps locally).
- Device-setup explainer page (`/help/device-setup`) for Pi Camera hardware (#407).
- Branded OG image + line-art title animation (#410).
- Invitation-only registration for pilot phase — promo-code gate (#398).

### Changed
- CSP tightening — removed `unsafe-inline` from `script-src` via nonce (#380).

---

## [0.98] - 2026-04-16

### Added
- Install hardening — non-interactive `install.sh` correctly detects Class-1/2/3 hardware (#405).
- Post-provisioning IAM tightening per ADR-20260317 (#397).
- Test catalog + documentation of test architecture.

### Fixed
- CI typecheck — `tsc --build` corrected for monorepo package references.

---

## [0.97] - 2026-04-15 — *Device Integration Refinement*

### Added
- Phase 0 device integration refinement.
- Device detail UI — applied-config echo and last-poll freshness (#406).
- Branch-aware `capture.sh` download in `install.sh` (#404).

### Fixed
- Heartbeat auth mismatch — `capture.sh` used Bearer JWT but API expected `X-Device-Key` (#341).
- Device config form position — inconsistent with Farm Overview UX (#344).

---

## [0.96] - 2026-04-14 — *Privilege Model, Platform Guide, Farm Visibility*

### Added
- Public/private farm visibility toggle (#403).
- Pilot/RC notice banner on all pages (#402).
- Privilege model documentation (#400).
- Revised "What's New" page for pilot (#401).

### Changed
- Free-plan farm membership limit tightened to 2 for pilot (#399).

---

## [0.95] - 2026-04-14 — *Image Features + Pilot Readiness*

### Added
- Timelapse playback (#394) — handles mixed auto + manual capture sources.
- Image history grouped by day/week folders for high-frequency captures (#393).
- Legal page language selection during registration (#392).

---

## [0.94] - 2026-04-14 — *User Notification System*

### Added
- User notification system — email + in-app + frontend bell (#391).

---

## [0.93] - 2026-04-13 — *Pre-PROD Complete*

### Added
- Legal pages (terms, privacy, report-bug).
- Consent UX flows.
- ADR series covering platform, auth, device, storage decisions.

### Fixed
- Multiple pre-PROD bug fixes (navigation, ordering, edge cases).

---

## [0.92] - 2026-04-13 — *Pre-PROD Quality + Staff Discovery Fix*

### Changed
- Pre-PROD quality pass — tests, perf, error handling.

### Fixed
- Staff discovery visibility edge case.

---

## [0.91] - 2026-04-13

### Added
- Custom domain `litcrop.com` for production.

---

## [0.90] - 2026-04-11

### Added
- Beta-8 milestone — Crop Intelligence (M1–M3), reserved/actual toggle, geo optional, admin delete capabilities.

---

[Unreleased]: https://github.com/ashmuk/litcrop/compare/v0.99.7.5...HEAD
[0.99.7.5]: https://github.com/ashmuk/litcrop/releases/tag/v0.99.7.5
[0.99.7.4]: https://github.com/ashmuk/litcrop/releases/tag/v0.99.7.4
[0.99.7.3]: https://github.com/ashmuk/litcrop/releases/tag/v0.99.7.3
[0.99.7.2]: https://github.com/ashmuk/litcrop/releases/tag/v0.99.7.2
[0.99.7.1]: https://github.com/ashmuk/litcrop/releases/tag/v0.99.7.1
[0.99.7]: https://github.com/ashmuk/litcrop/releases/tag/v0.99.7
[0.99.6.5]: https://github.com/ashmuk/litcrop/releases/tag/v0.99.6.5
[0.99.6.3]: https://github.com/ashmuk/litcrop/releases/tag/v0.99.6.3
[0.99.6.2]: https://github.com/ashmuk/litcrop/releases/tag/v0.99.6.2
[0.99.6.1]: https://github.com/ashmuk/litcrop/releases/tag/v0.99.6.1
[0.99.6]: https://github.com/ashmuk/litcrop/releases/tag/v0.99.6
[0.99.5]: https://github.com/ashmuk/litcrop/releases/tag/v0.99.5
[0.99.4]: https://github.com/ashmuk/litcrop/releases/tag/v0.99.4
[0.99.3]: https://github.com/ashmuk/litcrop/releases/tag/v0.99.3
[0.99.2]: https://github.com/ashmuk/litcrop/releases/tag/v0.99.2
[0.99.1]: https://github.com/ashmuk/litcrop/releases/tag/v0.99.1
[0.99]: https://github.com/ashmuk/litcrop/releases/tag/v0.99
[0.98]: https://github.com/ashmuk/litcrop/releases/tag/v0.98
[0.97]: https://github.com/ashmuk/litcrop/releases/tag/v0.97
[0.96]: https://github.com/ashmuk/litcrop/releases/tag/v0.96
[0.95]: https://github.com/ashmuk/litcrop/releases/tag/v0.95
[0.94]: https://github.com/ashmuk/litcrop/releases/tag/v0.94
[0.93]: https://github.com/ashmuk/litcrop/releases/tag/v0.93
[0.92]: https://github.com/ashmuk/litcrop/releases/tag/v0.92
[0.91]: https://github.com/ashmuk/litcrop/releases/tag/v0.91
[0.90]: https://github.com/ashmuk/litcrop/releases/tag/v0.90

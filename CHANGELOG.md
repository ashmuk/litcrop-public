# Changelog

All notable changes to **LitCrop** are documented in this file.

The format is based on [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/).
Versioning is pre-1.0 and does not yet follow strict Semantic Versioning — minor-version bumps may contain breaking changes until v1.0.0 GA.

For the user-facing, bilingual version history see the in-app [/history](src/frontend/src/components/VersionHistory.tsx) view. This file is the machine-readable mirror for external tooling (release bots, package-catalog scrapers, `conventional-changelog`).

---

## [Unreleased]

_No unreleased changes._

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

[Unreleased]: https://github.com/ashmuk/litcrop/compare/v0.99.7.4...HEAD
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

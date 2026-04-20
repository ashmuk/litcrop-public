# Changelog

All notable changes to **LitCrop** are documented in this file.

The format is based on [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/).
Versioning is pre-1.0 and does not yet follow strict Semantic Versioning — minor-version bumps may contain breaking changes until v1.0.0 GA.

For the user-facing, bilingual version history see the in-app [/history](src/frontend/src/components/VersionHistory.tsx) view. This file is the machine-readable mirror for external tooling (release bots, package-catalog scrapers, `conventional-changelog`).

---

## [Unreleased]

### Added
- Development & AI Assistance section in README explaining Claude Code collaboration (#446, R-007).
- ADR-20260420 — #279 BUILD-in-waves scope decision, superseding ADR-20260406.
- DevContainer memory bridge (host ↔ container) — Claude memory persists across rebuilds (#466).

### Changed
- TASKS.md synced to reflect v0.99.7 Wave 1 and device-ux series closures.

### Removed
- Retired stale `docs/TEST-STRATEGY-099X-GAP-ANALYSIS.md` — audit report preserves the story (#447, R-014).

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

[Unreleased]: https://github.com/ashmuk/litcrop/compare/v0.99.7...HEAD
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

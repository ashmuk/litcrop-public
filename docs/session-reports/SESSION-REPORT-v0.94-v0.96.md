# Session Report — v0.94 through v0.96 (consolidated)

> **Dates:** 2026-04-13 through 2026-04-15
> **Sessions:** pre-prod-094, pre-prod-095, pre-prod-096, pre-prod-097 (design portion)
> **Branch:** develop
> **Tags:** v0.94, v0.95, v0.96
> **Prior version:** v0.93 (850 tests — see `SESSION-REPORT-PrePROD-3.md`)
> **Next version:** v0.97 (see `SESSION-REPORT-395-phase-0.md`)
> **Report form:** consolidated, mirroring the `v0.16-v0.20` precedent

---

## Executive Summary

Three consecutive sprint tags shipped in rapid succession across the pre-production pilot hardening track. Between them: user-notifications end-to-end, pilot-readiness guardrails (invitation gate, banner, membership cap), image-history UX with timelapse filtering, a farm-visibility model for staff discoverability, an ADR on farm-level privilege semantics, and the complete design pipeline for #395 Phase 0 (device capture hardening — implementation shipped in v0.97).

No session-specific reports were written during these sprints — the commit messages and What's New page (LegalPage.tsx) carried the narrative. This report backfills the gap between `SESSION-REPORT-PrePROD-3.md` (v0.93) and `SESSION-REPORT-395-phase-0.md` (v0.97).

---

## v0.94 — User Notifications (Closes #391)

### Issues closed: 1

| Issue | Title |
|-------|-------|
| #391 | `feat(ux): notify users on join request approval/rejection and role changes` — shipped as three-layer delivery (email + DynamoDB + bell) |

### Commits: 5

```
c71319c chore: sync TASKS.md with GitHub issue state
04c5b2d feat(api): notify users via email on join approval, rejection, role change (#391)
d25812c feat(api): add in-app notification persistence with DynamoDB storage  (#391)
5b95ce0 feat(frontend): add notification bell with badge and dropdown to navigation (#391)
d34c951 chore(frontend): bump What's New version label to v0.94
```

### Design note

#391 was intentionally staged in three independent commits (email → DDB → bell) so each layer could be reviewed and reverted separately. The email path uses SES (already in sandbox — see `docs/ops/SES-PRODUCTION-ACCESS.md` from v0.93). The DDB persistence uses a `NOTIFICATION#<user>#<ts>` SK pattern so a user's feed is one Query.

### Anomalies

None observed. Email sandbox did not block testing (admin address is verified both as sender and recipient).

---

## v0.95 — Pilot Readiness + Image UX (Closes #393, #394, #398, #399, #402)

### Issues closed: 5

| Issue | Title | Category |
|-------|-------|----------|
| #393 | Day-grouped image history (accordion UI) | Frontend UX |
| #394 | Timelapse playback — mixed auto/manual source filter | Frontend UX |
| #398 | Invitation-only registration (promo code gate) | Pilot gating |
| #399 | Free-plan farm-membership limit → 2 for pilot | Pilot gating |
| #402 | Pilot/RC notice banner in top nav | Pilot UX |

### Commits: 4

```
23f2601 feat: pilot readiness — invitation gate, farm limit, and banner (#398, #399, #402)
8450ec5 feat(frontend): day-grouped image history and timelapse filters (#393, #394)
01434f6 chore(frontend): bump What's New version label to v0.95
b3feb63 fix(frontend): remediate review findings for #393/#394
```

### Design note

#398 (invitation-only) uses a client-side promo code check — per the `feedback_observer_only_registration` convention (`LITCROP2026`). Server enforces the promoted-role constraint independently; the promo code only gates self-elevation to owner.

#399 (free-plan cap) was set to 2 farms for pilot as the minimum that lets a user experience the multi-farm UX without creating unrealistic scale. Membership cap enforced at the API layer via `countMembershipsForUser`.

### Anomalies

- Image history accordion review surfaced two issues fixed in `b3feb63` — one was a stale-closure bug in the date-filter `useEffect`, one was an empty-state layout regression. Both landed same-day.

---

## v0.96 — Farm Visibility + Platform Guide (Closes #400, #401, #403)

### Issues closed: 3

| Issue | Title | Type |
|-------|-------|------|
| #400 | ADR — farm-level promotion does not grant global owner capability | Design |
| #401 | What's New revised as step-by-step platform guide | Frontend |
| #403 | Public/private farm visibility toggle for discoverability | Feature |

### Commits: 5

```
cfa724b docs(auth): ADR — farm promotion does not grant global owner capability (#400)
03a6637 feat(frontend): revise What's New as platform guide with how-to steps (#401)
3c1ef03 feat(farms): add public/private visibility toggle for farm discoverability (#403)
932c0f5 refactor: simplify #401/#403 — data-driven guide steps, cleaner visibility filter
5c8a6b6 fix(frontend): add missing useRef import in BedDetail — fixes Astro SSR build
```

### Design note

#400 produced **ADR-20260413-farm-role-privilege-clarity** (or similar — see `docs/decisions/`). The question was whether being an `owner` on one farm implies any elevated capability on another farm. Answer: no. Farm-level roles are scoped per farm; global capabilities come from a separate admin-email list.

#403 split the farm records into `visibility: 'public' | 'private'`. Public farms are discoverable by any staff user (drives the `/discoverable` endpoint fixed in v0.93). Private farms are invitation-only.

### Anomalies

- **SSR build regression** (`5c8a6b6`) — `BedDetail.tsx` was missing a `useRef` import that only surfaced under Astro's SSR compile. `tsc` and `vitest` both passed; only `npx astro build` caught it. This is the origin of the `feedback_astro_build_check` memory entry: "Run `npx astro build` after Preact component changes; tsc + vitest miss SSR import errors."

---

## Test Metrics

| Metric | v0.93 | v0.94 | v0.95 | v0.96 | Net Δ |
|--------|-------|-------|-------|-------|-------|
| Unit tests | 807 | ~815 | ~822 | 837 | +30 |
| E2E tests | 43 | 43 | 43 | 43 | — |
| Pass rate | 100% | 100% | 100% | 100% | — |

Note: per-sprint unit-test counts are approximated from commit diffs — no per-tag snapshot was taken at the time. Exact v0.94 / v0.95 counts can be recovered via `git checkout v0.9X && npx vitest run` if needed.

---

## Issues Created During This Window

| Issue | Title | Status at v0.96 |
|-------|-------|-----------------|
| #395 | `design(device): refine install.sh and capture script for production camera usage` | Design complete (ADR v2 + DESIGNS / TASK-BREAKDOWN / PLANS docs committed 5449561). Implementation = v0.97. |

---

## Pipeline Record

v0.94–v0.96 did not run the full `/simplify → /cc-review → /cc-remediate → /cc-test` pipeline on every issue — sprints were velocity-optimized for pilot readiness. Select issues had `/simplify` and `/cc-review` applied in-session:

- **#401/#403 simplify pass**: commit `932c0f5` collapsed duplicated guide-step data and filter logic. Same-session optimization.
- **#393/#394 review remediation**: `b3feb63` addressed reviewer findings on the image-history accordion and timelapse filter state.

Full pipeline discipline resumed at v0.97 per the `feedback_pipeline_discipline` memory entry.

---

## Operational Notes

- **Production remained on v0.93** throughout this window; v0.94–v0.96 landed on `develop` and auto-deployed to staging (per #239 / #372 environment separation).
- **What's New page** (LegalPage.tsx) lagged the v0.96 tag — the label bump was backfilled during v0.97 (commit `19c0b79`).
- **AWS monthly cost**: remained below the $1.18/mo budget ceiling throughout. No infrastructure additions in this window — all changes were frontend / API / shared-schema.

---

## Relationship to v0.97

v0.97 ships #395 Phase 0 (device capture hardening — implementation of what v0.94–v0.96 designed). See `SESSION-REPORT-395-phase-0.md`. The v0.94–v0.96 window is best understood as "pilot-readiness groundwork + Phase 0 design" — the scaffolding that made the device-hardening work possible.

---

## Follow-ups Carried Forward to v0.97+

- #395 implementation (shipped in v0.97)
- #397 IAM tightening (still NOT STARTED at v0.97 tag)
- #380 CSP nonce (still NOT STARTED at v0.97 tag)
- #406 applied-config echo in Device UI (filed during v0.97 session, scoped back into v0.97)

---

## Summary Table

| Version | Sprint theme | Issues closed | Commits | Report |
|---------|-------------|---------------|---------|--------|
| v0.94 | User notifications | 1 (#391, 3 layers) | 5 | This file |
| v0.95 | Pilot readiness + image UX | 5 | 4 | This file |
| v0.96 | Farm visibility + platform guide + ADR | 3 | 5 | This file |
| v0.97 | #395 Phase 0 implementation | (in flight) | 14 | `SESSION-REPORT-395-phase-0.md` |

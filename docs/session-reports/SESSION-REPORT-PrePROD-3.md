# Session Report: PrePROD-3 (v0.93)

> **Date:** 2026-04-13
> **Session:** pre-prod-093
> **Branch:** develop → main
> **Tag:** v0.93
> **Duration:** Single session
> **Prior version:** v0.92 (845 tests, 6 PRs merged)

---

## Executive Summary

Completed all 3 remaining Pre-PROD issues (#280, #281, #334), discovered and fixed a critical production routing bug, resolved 3 staging feedback issues, and updated the Pre-PROD audit. **All 8 Go/No-Go gates now pass.** The project is production-ready for MVP launch.

**Audit score: 3.6 → 4.1** (Fair-Good → Good)

---

## Session Delivery

### Issues Closed: 9

| Issue | Type | Title |
|-------|------|-------|
| — | bug fix | Hono route conflict — staff farm discovery (CRITICAL) |
| #280 | feature | Terms, Privacy, What's New, Report Bug pages + consent |
| #281 | design | Monetization strategy ADR (BYOK-first) |
| #334 | design | Capacity analysis and scalability review ADR |
| #389 | bug fix | "Back to app" broken navigation |
| #390 | bug fix | Delete Account below Legal section |
| #392 | bug fix | Legal pages language selection |
| — | docs | PRE-PROD-AUDIT v0.93 update |
| — | docs | SES production access guide |

### Issues Created: 4

| Issue | Type | Title | Size |
|-------|------|-------|------|
| #391 | feature | User notifications for join/role changes | L |
| #393 | design | Image history grouping by day/week | M |
| #394 | design | Timelapse playback for mixed sources | L |
| #395 | design | Capture script production refinement | L |

### Commits: 14

```
b45c9fb  fix(discovery): resolve Hono route conflict                    [merged to main PR #388]
63bc26e  feat(i18n): legal page translations (en + ja)                  [#280]
6ee3260  feat(frontend): Terms, Privacy, What's New pages               [#280]
b2361f3  feat(frontend): bug report form with SES email                 [#280]
981042e  feat(auth): T&C consent checkbox to registration               [#280]
f9fd9e5  feat(frontend): Legal section in Profile + auth footer         [#280]
a410c2b  docs(design): monetization strategy ADR                        [#281]
2fb4a8e  docs(design): capacity analysis ADR                            [#334]
f33c8b7  docs(audit): PRE-PROD-AUDIT v0.93 — all gates pass
cb1de51  fix(frontend): "Back to app" → href="/"                        [#389]
7297842  fix(frontend): Delete Account below Legal section              [#390]
aae0073  fix(i18n): locale sync on registration language change         [#392]
11949af  fix(frontend): Report Bug back link → /profile/
5056bc4  docs(ops): SES production access guide
```

### PRs: 2

| PR | Title | Status |
|----|-------|--------|
| #388 | fix(discovery): Hono route conflict — staff farm discovery | Merged to main |
| #396 | feat: Pre-PROD v0.93 — legal pages, consent, ADRs, fixes | Open (pending merge) |

---

## Key Findings

### Critical Bug: Hono Route Conflict (F-39)

**Root cause**: `GET /farms/discoverable` (static route in `farmMembersRouter`) was intercepted by `GET /farms/:farmId` (parameterized route in `farmsRouter`) because Hono matches parameterized routes before static routes when defined in **separate sub-routers** mounted on the same base path.

**Impact**: The `/discoverable` endpoint had been completely broken since it was introduced. Staff users could never see farms to join. The `FarmDiscovery` component silently swallowed the 404 error via `.catch(() => {})`.

**Fix**: Moved `/discoverable` into `farmsRouter` before `/:farmId`. Added error feedback to `FarmDiscovery`, discovery panel to `FarmOverview` for farmless users, and 5 tests.

### Design: Monetization Strategy (ADR-20260413-monetization)

- **BYOK-first model**: Free tier covers core farming (2 farms, 3 memberships). Pro features gate on user-provided Anthropic API key.
- **No billing infrastructure** needed for MVP.
- **At 100 users with BYOK**: $1.80/month (within $5 ceiling).

### Design: Capacity Analysis (ADR-20260413-capacity)

- Current architecture supports **100 users without changes** ($3.60/mo).
- **AI cost dominates** at scale — BYOK is the mitigation.
- **Lambda reserved concurrency** recommended before GA.
- No architectural changes needed — serverless stack scales horizontally.

---

## Test Metrics

| Metric | v0.92 | v0.93 | Delta |
|--------|-------|-------|-------|
| Unit tests | 802 | 807 | +5 |
| E2E tests | 43 | 43 | — |
| Total | 845 | 850 | +5 |
| Pass rate | 100% | 100% | — |
| Test duration | 5.0s | 4.6s | -0.4s |
| Test files | 37 | 37 | — |

---

## Audit Update

| Dimension | v0.52 | v0.93 | Delta |
|-----------|-------|-------|-------|
| Architecture | 3.5 | 4.0 | +0.5 |
| Security | 4.5 | 4.5 | — |
| Legal | 5.0 | 5.0 | — |
| UX | 3.5 | 4.0 | +0.5 |
| Performance | 2.5 | 3.0 | +0.5 |
| Operations | 3.0 | 4.0 | +1.0 |
| Cost | 4.0 | 4.5 | +0.5 |
| Test | 3.0 | 4.0 | +1.0 |
| Documentation | 4.0 | 4.5 | +0.5 |
| Pipeline | 3.5 | 3.5 | — |
| **Weighted Avg** | **3.6** | **4.1** | **+0.5** |

**Go/No-Go: ALL 8 GATES PASS**

---

## New Files Created

| File | Purpose |
|------|---------|
| `src/frontend/src/pages/terms.astro` | Terms of Service page |
| `src/frontend/src/pages/privacy.astro` | Privacy Policy page |
| `src/frontend/src/pages/whats-new.astro` | Release notes page |
| `src/frontend/src/pages/report-bug.astro` | Bug report page |
| `src/frontend/src/components/LegalPage.tsx` | Shared legal page renderer |
| `src/frontend/src/components/ReportBugForm.tsx` | Bug report form component |
| `docs/decisions/ADR-20260413-monetization-strategy.md` | Monetization ADR |
| `docs/decisions/ADR-20260413-capacity-analysis.md` | Capacity ADR |
| `docs/ops/SES-PRODUCTION-ACCESS.md` | SES production access guide |

---

## Open Issues: 19

| Category | Count | Issues |
|----------|-------|--------|
| User Notifications | 1 | #391 |
| Device Pipeline (design) | 3 | #393, #394, #395 |
| Audit Remediation (deferred) | 6 | #380-385 |
| AI Features (deferred) | 3 | #183, #320, #333 |
| Crop Intelligence (deferred) | 4 | #279, #284, #323, #324 |
| Legacy Backlog | 2 | #168, #242 |

---

## Next Session Plan (v0.94)

1. **#391** — User notifications (in-app toasts for join/role changes)
2. **#395** — Device capture script production design
3. **#393** — Image history grouping design
4. **#394** — Timelapse playback design (if time permits)

---

## Operational Notes

- SES remains in sandbox — guide at `docs/ops/SES-PRODUCTION-ACCESS.md`
- Production: https://litcrop.com (discovery fix live via PR #388)
- Admin: `admin@example.com` (verified SES sender + recipient)
- 25 ADRs documented
- 633 total commits

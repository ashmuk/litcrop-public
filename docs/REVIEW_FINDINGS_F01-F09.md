# Review Findings: MVP+ Post-Deploy Feedback Fixes (F-01, F-02, F-03, F-06, F-07, F-09)

> Date: 2026-03-23
> Reviewer: my-reviewer agent (cc-review)
> Scope: 16 files changed, ~97 lines added, ~43 removed + 2 new files
> GitHub Issues: #132, #133, #134, #135, #136, #137
> Verdict: **ACCEPTED** (SHOULD-FIX remediated inline)

---

## Alignment

| Feedback | Addressed? | Notes |
|----------|-----------|-------|
| F-01: Settings → Manage (IoT) | YES | Nav updated (desktop + mobile), ManagePage component, i18n (en/ja) |
| F-02: Wizard step dots | YES | Bordered outline dots, `box-sizing:border-box` |
| F-03: Leaflet marker icon | YES | Explicit `L.icon()` with `LEAFLET_CDN` constant |
| F-06: Photo upload broken | YES | Removed `capture="environment"`, `accept="image/*"`, `.sr-only` class |
| F-07: Weather condition strings | YES | `conditionToEmoji()` mapping, `translateCondition()` reuse, overflow ellipsis |
| F-09: Hourly scroll overflow | YES | `max-width:100%` + `min-width:0` on grid columns |

---

## Findings

| # | File:Line | Issue | Severity | Status |
|---|-----------|-------|----------|--------|
| 1 | `pages/settings.astro` | Stale redirect pointed to `/profile/` instead of `/manage/` | SHOULD-FIX | **Remediated** — now redirects to `/manage/` |
| 2 | `ManagePage.tsx:53` | Silent `catch {}` swallows all errors per bed | SUGGESTION | Accepted as-is for MVP (avoids console noise in prod) |
| 3 | `ManagePage.tsx:44-57` | N+1 API pattern (1 request per bed) | SUGGESTION | Documented in component header, acceptable for <10 beds |
| 4 | `FarmWizard.tsx:74` | F-02 describes 2 steps but wizard has 3 | SUGGESTION | Documentation discrepancy, not a code issue |

---

## Security

- [x] Auth protection: Manage page uses `BaseLayout.astro` → `AuthGuard`
- [x] No injection vectors: `node_id` rendered as text content
- [x] No credentials in code: `LEAFLET_CDN` is a public URL
- [x] API calls use existing auth: Bearer token via `request()` helper
- [x] No data exposure: ManagePage shows data already accessible via bed images API

## Quality

- [x] Follows existing component patterns
- [x] i18n complete (en + ja)
- [x] Error/loading/empty states handled
- [x] Cancellation pattern implemented
- [x] `LEAFLET_CDN` constant extracted (no version duplication)
- [x] `translateCondition()` backward-compatible extension
- [x] `CONDITION_EMOJI` covers all WMO codes from weather API
- [x] `.sr-only` CSS class verified in `components.css:1095`

## Verification

- [x] TypeScript clean (all 3 packages)
- [x] 321/321 tests pass
- [x] Frontend builds (15 pages)
- [ ] Manual: visit `/settings/` — confirm redirect to `/manage/`
- [ ] Manual: Manage page loads with node data or empty state
- [ ] Manual: Weather emojis render on FarmOverview + WeatherView
- [ ] Manual: Hourly forecast contained within viewport

---

> Generated 2026-03-23 | ACCEPTED — no MUST-FIX findings

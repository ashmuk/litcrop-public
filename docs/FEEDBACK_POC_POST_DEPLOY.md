# FEEDBACK_POC_POST_DEPLOY.md — User Feedback from PoC Deployment Testing

> Date: 2026-03-19
> Tested on: Mobile (iPhone) + Desktop (Chrome)
> Frontend: https://<distribution-id>.cloudfront.net

---

## Fixed During This Session (post v0.6)

| # | Issue | GitHub | Fix | Commit |
|---|-------|--------|-----|--------|
| F-01 | Settings (theme/locale) not persisting across page navigation | [#45](https://github.com/ashmuk/litcrop/issues/45) | Inline `<script>` in BaseLayout reads localStorage before render | `0c5a602` |
| F-02 | "Setup" and "Settings" menu labels confusing | [#46](https://github.com/ashmuk/litcrop/issues/46) | Renamed Setup → My Farm (🌱), updated EN/JA i18n | `485c39e` |
| F-03 | Japanese translation incomplete — nav labels, chat suggestions, GPS messages, climate zones, image errors all hardcoded English | [#47](https://github.com/ashmuk/litcrop/issues/47) | Added `[data-i18n]` runtime translator + replaced hardcoded strings with `t()` calls + 11 new keys per locale | `d5a2ade` |
| F-04 | Temperature unit preference (°C/°F) not reflected on Weather or Farm pages | [#48](https://github.com/ashmuk/litcrop/issues/48) | Added `formatTemp()` helper reading `litcrop-temp-unit` from localStorage, applied to all 5 temperature display locations | `384e4bf` |

All 4 issues created, closed with implementation comments, and deployed to CloudFront.

---

## PoC Fix (apply now or next session)

| # | Issue | Page | Description | Effort |
|---|-------|------|-------------|--------|
| F-05 | Nav rename round 2 | All | "Farm" → **"Crops"** (shows plot/crop status), "My Farm" → **"Profile"** (farm identity/location). Clearer distinction since the whole app is about "my farm". | ~5 min |
| F-06 | Farm name missing from page titles | Crops, Weather | Headers show generic "LitCrop" or "Weather" — should show farm name (e.g., "LitCrop Demo Farm" or "Weather — Nagano") to confirm location context. | ~10 min |

---

## Defer to MVP

| # | Issue | Page | Description | Reason for Deferral |
|---|-------|------|-------------|-------------------|
| F-07 | WMO weather codes displayed as raw system strings | Weather | `partly_cloudy`, `drizzle` etc. shown as-is instead of human-readable / translated labels. In Japanese mode, these remain English system codes. | Needs weather condition i18n mapping (20+ WMO codes × 2 locales). Medium effort. |
| F-08 | Weather layout overflow on mobile | Weather | Today summary row — long condition text + temperature number overflows at 375px width, clipping or wrapping. | CSS fix but needs visual testing with multiple weather states. |
| F-09 | Map picker for farm location | Profile | User wants visual map to pin farm location instead of GPS + manual lat/lng text fields. | New dependency (Leaflet + OpenStreetMap recommended over Google Maps). Scope creep for PoC. |
| F-10 | Elevation auto-fetch from coordinates | Profile | When lat/lng is entered or GPS used, auto-populate elevation using Open-Meteo Elevation API (free, already in our stack). | Quick win but not in PoC exit criteria. |
| F-11 | Desktop responsiveness | All | Frontend renders at mobile width (max ~480px) on desktop browsers. No responsive scaling or 2-column layout. | Explicitly excluded from PoC scope per PLANS.md ("Mobile-first single breakpoint only"). |
| F-12 | Farm Layout view shows "No plots" | Layout | Layout view shows Field → Bed hierarchy correctly but "No plots" in each bed. Query may not be populating bed-plot association. | Likely the N+1 / denormalization issue flagged by efficiency reviewer. |

---

## Severity Assessment

```
Fixed:     F-01, F-02, F-03, F-04  (4 items — deployed, issues #45–#48 closed)
PoC Fix:   F-05, F-06              (2 items — quick, improves UX)
MVP:       F-07 through F-12       (6 items — deferred)
```

---

## Post-v0.6 Commit Log

| Commit | Description | Issue |
|--------|-------------|-------|
| `0c5a602` | fix(frontend): persist theme and locale across page navigation | [#45](https://github.com/ashmuk/litcrop/issues/45) |
| `485c39e` | refactor(frontend): rename Setup tab to My Farm for clearer navigation | [#46](https://github.com/ashmuk/litcrop/issues/46) |
| `d5a2ade` | fix(frontend): complete i18n coverage — nav labels, suggestions, GPS, climate | [#47](https://github.com/ashmuk/litcrop/issues/47) |
| `384e4bf` | fix(frontend): respect temperature unit preference across all pages | [#48](https://github.com/ashmuk/litcrop/issues/48) |
| `0bb0048` | docs: add post-deploy user feedback with PoC fix / MVP defer classification | — |

---

## Notes

- **F-05 + F-06** are recommended before merging `develop → main`. They're small changes that meaningfully improve the user experience.
- **F-07 (WMO codes)** is the most visible MVP item — weather conditions displaying as `partly_cloudy` is jarring, especially in Japanese mode.
- **F-09 (map)** was explicitly deferred after discussion. Recommendation: Leaflet + OpenStreetMap (free, no API key) instead of Google Maps.
- **F-11 (desktop)** was a known PoC exclusion but affects demo credibility. Consider a minimal `@media (min-width: 768px)` pass at MVP.

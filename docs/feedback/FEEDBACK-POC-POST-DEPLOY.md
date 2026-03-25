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
| F-05 | Nav rename: Farm → Crops, My Farm → Profile | [#49](https://github.com/ashmuk/litcrop/issues/49) | Clearer distinction — "Crops" (plot/crop status) vs "Profile" (farm identity/location). Updated EN/JA i18n + nav labels + aria | `db05dbc` |
| F-06 | Farm name missing from page titles | [#50](https://github.com/ashmuk/litcrop/issues/50) | Headers now show farm name from localStorage (e.g., "🌾 LitCrop Demo Farm", "⛅ Weather — LitCrop Demo Farm") | `db05dbc` |
| F-07 | WMO weather codes displayed as raw system strings | [#52](https://github.com/ashmuk/litcrop/issues/52) | 13 weather condition translations (EN/JA). `translateCondition()` helper applied to WeatherView + FarmOverview | `7e24b3c` |
| F-12 | Farm Layout view "No plots" in beds | [#51](https://github.com/ashmuk/litcrop/issues/51) | Added `bed_id`/`field_id` to plots route response. FarmLayoutView now correctly maps plots to beds | `7e24b3c` |

All 8 issues created, closed with implementation comments, and deployed to CloudFront.

**Also added**: 13 contract tests ([#53](https://github.com/ashmuk/litcrop/issues/53)) validating route response shapes match shared TypeScript types. Total test count: 181.

---

## Defer to MVP

| # | GitHub | Issue | Page | Description | Reason for Deferral |
|---|--------|-------|------|-------------|-------------------|
| F-08 | [#54](https://github.com/ashmuk/litcrop/issues/54) | Weather layout overflow on mobile | Weather | Today summary row — long condition text + temperature number overflows at 375px width, clipping or wrapping. | CSS fix but needs visual testing with multiple weather states. |
| F-09 | [#55](https://github.com/ashmuk/litcrop/issues/55) | Map picker for farm location | Profile | User wants visual map to pin farm location instead of GPS + manual lat/lng text fields. | New dependency (Leaflet + OpenStreetMap recommended over Google Maps). Scope creep for PoC. |
| F-10 | [#56](https://github.com/ashmuk/litcrop/issues/56) | Elevation auto-fetch from coordinates | Profile | When lat/lng is entered or GPS used, auto-populate elevation using Open-Meteo Elevation API (free, already in our stack). | Quick win but not in PoC exit criteria. |
| F-11 | [#57](https://github.com/ashmuk/litcrop/issues/57) | Desktop responsiveness | All | Frontend renders at mobile width (max ~480px) on desktop browsers. No responsive scaling or 2-column layout. | Explicitly excluded from PoC scope per PLANS.md ("Mobile-first single breakpoint only"). |

---

## Defer to Production (or beyond)

| # | GitHub | Issue | Page | Description | Reason for Deferral |
|---|--------|-------|------|-------------|-------------------|
| F-13 | [#58](https://github.com/ashmuk/litcrop/issues/58) | Soil pH monitoring via IoT sensor | Crops, Profile | Add soil pH readings from a dedicated IoT sensor device (e.g., soil pH probe connected via ESP32/LoRa). Display per-plot pH history, alert when outside optimal range for crop type. Requires: new device protocol (MQTT or HTTPS), new DynamoDB entity (SoilReading), new API endpoints, new UI component. | New hardware device + protocol + data model. Separate risk domain from camera-based observation. Needs ADR for device communication (MQTT vs HTTPS), sensor data schema, and alert thresholds per crop. Similar scope to the sprinkler/actuator control deferred in PLANS.md. |
| F-14 | [#59](https://github.com/ashmuk/litcrop/issues/59) | Time-lapse playback for crop growth | Image Timeline | Auto-play sequential images for a plot to visualize crop growth over time. Slider control for speed. Export as GIF/video optional. | Needs sufficient image history first. UX design + frontend-only feature (images already stored). |

---

## Future Vision — Beyond Production

The following items represent the broader product roadmap discussed during PoC testing. These are not bugs or fixes — they are **feature categories** that inform MVP and Production scope planning.

### V-01: User Management

| Item | Description |
|------|-------------|
| Multi-farm membership | One user can belong to multiple farms (many-to-many relationship) |
| Farm selector screen | Shown after login; auto-redirect to default farm (skippable) |
| Single-farm shortcut | Skip selector if user belongs to only one farm |
| Remember last farm | Persist last visited farm across sessions |
| Global farm-switcher | Accessible from anywhere in the dashboard (header dropdown or similar) |

**Prerequisite**: Authentication (deferred from PoC per PLANS.md). Needs ADR for auth strategy (Cognito vs custom vs third-party).

### V-02: Farm Management

| Item | Description |
|------|-------------|
| Join request workflow | Request / approval / rejection for joining a farm |
| Farm profile page | Display farm details, connected IoT devices count, member list |
| IoT device limit | 5 devices per farm (initial setting, tied to plan) |

### V-03: IoT Device Management

| Item | Description |
|------|-------------|
| Device type registry | pH sensor, camera, temperature/humidity sensor, etc. |
| Device status display | Show online/offline status and last communication timestamp |
| Device provisioning | Register new devices, assign to plots |

**Prerequisite**: ADR for device communication protocol (MQTT via IoT Core vs HTTPS POST). Current PoC uses HTTPS POST for camera only.

### V-04: Plan & Subscription Management

| Item | Description |
|------|-------------|
| Plan-based limits | Max devices, max farms, max members per farm — fetched from plan table, not hardcoded |
| Feature flags | Tied to plans for controlled feature rollout (e.g., AI chat only on Pro plan) |
| Plan flexibility | Designed so limits can evolve over time without code changes |
| Billing system | Secure and robust payment processing + subscription lifecycle |
| Billing model | TBD: per-user, per-farm, or per-organization — needs architectural decision |

**Note**: Billing requires careful security consideration. Payment processing (Stripe/etc.) and subscription lifecycle management are a separate workstream with its own ADR.

### V-05: Admin Menu Structure

As features grow, the admin/management UI (user settings, farm settings, device management, plan management) may need restructuring and consolidation into a dedicated admin section. Current nav (Crops / Weather / Profile / Settings) won't scale to 10+ management screens.

### V-06: Mobile App Roadmap

| Item | Description |
|------|-------------|
| iOS app | First target platform |
| Android app | Subsequent target |
| Architecture decision | Web-first vs native vs cross-platform (React Native, Flutter) — needs Pros/Cons evaluation |
| API readiness | API design should be mobile-ready from the start (current REST API is compatible) |
| Push notifications | IoT alerts and farm activity notifications |
| Offline support | Sync strategy for intermittent connectivity (rural farming areas) |

### V-07: Marketing / Service Landing Page

| Item | Description |
|------|-------------|
| Service landing page | Dedicated page explaining the service to prospective users |
| Feature tier overview | What's included at each plan level |
| Pricing table | Clear plan comparison with conversion focus |
| Plan sync | Should reflect the plan/feature-flag architecture (V-04) so it stays in sync with actual capabilities |

---

## Severity Assessment

```
Fixed:      F-01..F-07, F-12        (8 items — deployed, issues #45–#53)
PoC Fix:    (none remaining)
MVP:        F-08..F-11              (4 items — issues #54–#57)
Production: F-13, F-14              (2 items — issues #58–#59)
Vision:     V-01 through V-07       (7 categories — product roadmap)
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
| `db05dbc` | fix(frontend): rename nav (Crops/Profile) and show farm name in page titles | [#49](https://github.com/ashmuk/litcrop/issues/49), [#50](https://github.com/ashmuk/litcrop/issues/50) |

---

## Notes

- ~~**F-05 + F-06**~~ Fixed. Nav is now Crops / Weather / Profile / Settings. Farm name shows in headers.
- **F-07 (WMO codes)** is the most visible MVP item — weather conditions displaying as `partly_cloudy` is jarring, especially in Japanese mode.
- **F-09 (map)** was explicitly deferred after discussion. Recommendation: Leaflet + OpenStreetMap (free, no API key) instead of Google Maps.
- **F-11 (desktop)** was a known PoC exclusion but affects demo credibility. Consider a minimal `@media (min-width: 768px)` pass at MVP.
- **F-12 (layout "No plots")** was flagged during UI verification screenshots. The spatial layout view loads fields and beds correctly but the plot-to-bed association query doesn't populate. Related to the N+1 efficiency findings from the /simplify review.
- **F-13 (soil pH)** is a new IoT device category — similar in scope to the sprinkler/actuator control that was deferred in PLANS.md ("Separate risk domain"). Needs its own ADR for device protocol, sensor data schema, and crop-specific pH thresholds. Candidate for Production scope or a dedicated workstream.
- **F-14 (time-lapse)** is a frontend-only feature once sufficient image history exists. Good candidate for Production or late MVP.
- **V-01 through V-07 (Vision)** represent the broader product roadmap. These are not actionable in the current scope — they inform future `/cc-define` and `/cc-design` sessions. Key dependencies: V-01 (auth) unlocks V-02 (farm mgmt), V-03 (devices) + V-04 (plans) are the monetization foundation, V-06 (mobile) needs early API design consideration, V-07 (landing page) should reflect V-04's plan architecture.

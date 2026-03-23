# MVP+ Post-Deploy Feedback (v0.15 Live Testing)

> Date: 2026-03-22
> Tester: Muk (Site Admin)
> Environment: Desktop Chrome, Nagano location
> Version: v0.15 deployed via CI/CD
> Screenshots: `docs/screenshots/`

---

## Summary

9 issues found during first live testing of MVP+ (v0.15). Mix of bugs (5), UX gaps (2), and feature requests (2). No data loss or security issues. Core functionality (login, farm creation, weather, farm switching) works.

---

## Findings

### F-01: Replace Settings tab with Manage (IoT) page

**Page**: Navigation bar
**Severity**: UX → Feature upgrade
**Priority**: P1

Both "Profile" (プロフィール) and "Settings" (設定) tabs in the top nav lead to the same content. Instead of simply removing the Settings tab, **repurpose it as a "Manage" (管理) page** for IoT camera node monitoring.

**Proposed nav**:
```
作物(Crops) | 天気(Weather) | 管理(Manage) | プロフィール(Profile)
```

**Manage page scope (MVP+)**:
- Read-only list of camera nodes that have uploaded to the current farm
- Per node: `node_id`, last upload time, image count, target bed name
- Data derived from existing Image records (group by `node_id`) — no new API endpoint needed

**Manage page scope (PROD-1)**:
- Device registration and configuration
- Health monitoring (online/offline status)
- Camera settings (interval, resolution)

**Root cause**: Phase D merged settings into profile but kept both nav items. IoT device management page was already planned for PROD-1 ("IOT-UI" in MVP-PLUS-REVISE-PLAN.md). Repurposing the nav slot avoids adding a 5th tab later.

---

### F-02: Farm wizard step dots incorrect on first step

**Page**: Profile → New Farm wizard
**Severity**: Bug
**Priority**: P2

Step 1 of the wizard shows only 1 dot (should show 2 dots with first highlighted indicating "1 of 2"). Step 2 correctly shows 2 dots with second highlighted. The dots should always display the total number of steps.

**Expected**: Step 1 shows `[●] [○]`, Step 2 shows `[○] [●]`
**Actual**: Step 1 shows `[●]`, Step 2 shows `[○] [●]`
**Root cause**: Dot rendering logic in `FarmWizard.tsx` tied to current step index instead of total steps constant.

---

### F-03: Leaflet map marker icon broken

**Page**: Profile → New Farm wizard → Step 2 (Location)
**Severity**: Bug
**Priority**: P1

The map marker appears as a broken/mangled square instead of the standard Leaflet pin icon. The map itself loads and functions correctly (pan, zoom, GPS), but the visual marker is wrong.

**Expected**: Standard Leaflet blue pin marker
**Actual**: Small broken square image
**Root cause**: Leaflet's default marker icon requires specific CSS + PNG sprite files (`marker-icon.png`, `marker-shadow.png`). The CDN-loaded CSS may not include these, or the icon path resolution is broken in the Astro SSG bundle.

---

### F-04: Farm card missing location and elevation

**Page**: Profile → Farm list
**Severity**: UX
**Priority**: P3

The farm list cards show only the farm name and role badge. Location (lat/lon or place name), elevation, and grid size are not displayed. Users can't distinguish farms by location at a glance.

**Expected**: Farm card shows name, location summary, elevation, grid size
**Actual**: Only name and role badge

---

### F-05: Bed-crop model concern (1:1 too restrictive)

**Page**: Crops → Layout view
**Severity**: Design (future)
**Priority**: P3 (PROD-1)

Current model enforces one crop per bed. User clarifies this is acceptable for now but wants support for multiple crops per bed in the future. Additionally, existing PoC crop data is not visible — likely because the Field/Plot → Bed migration rewrote seed data without preserving user-created plots.

**Note**: This is a design decision documented in ADR-20260322. The 1:1 model was chosen for MVP+ simplicity. Multi-crop per bed should be considered for PROD-1.

---

### F-06: Cannot upload photo on bed detail page

**Page**: Crops → tap bed → Bed Detail
**Severity**: Bug
**Priority**: P1

The upload button/functionality on the bed detail page doesn't work. Unable to upload a photo from phone camera or file picker.

**Expected**: Tap upload → file picker → select JPEG → uploads to API → image appears
**Actual**: Upload either not visible or not functional
**Root cause**: Needs investigation — could be a file input element issue, auth header issue, or the upload endpoint path mismatch.

---

### F-07: Weather condition strings display as system labels

**Page**: Crops (desktop view, weather widget)
**Severity**: Bug
**Priority**: P1
**Screenshot**: `docs/screenshots/mvp-plus-crops-weather-stickout-n-system-string.png`

Weather condition strings display as raw system labels with underscores: `mainly_clear`, `partly_cloudy`, `overcast`, `drizzle`. These should be translated to human-readable text ("Mostly Clear" / "概ね晴れ").

Additionally, the condition string overflows the weather card layout on the Crops page (desktop), sticking out of the card boundary.

**Expected**: "Mostly Clear" or "概ね晴れ" (depending on locale), contained within card
**Actual**: `mainly_clear` displayed raw, text overflows card
**Root cause**:
1. The `translateCondition()` function exists and is used on the Weather page but is NOT called on the FarmOverview weather strip
2. CSS `overflow` not set on the weather card text container

---

### F-08: Weather page missing location name

**Page**: Weather
**Severity**: Feature request
**Priority**: P3

The weather page shows weather data correctly for the farm's GPS coordinates but doesn't display the location name (e.g., "Tateshinakougen area" / "蓼科高原付近"). Only raw temperature and condition data is shown.

**Expected**: Location name or approximate area displayed in the weather header
**Actual**: No location name
**Note**: Would require reverse geocoding API (Open-Meteo Geocoding or similar). The farm could also store a user-entered location label.

---

### F-09: Hourly weather scroll overflow

**Page**: Weather → Hourly forecast
**Severity**: Bug
**Priority**: P2
**Screenshot**: `docs/screenshots/mvp-plus-weather-long-display-n-scroll.png`

The hourly forecast section extends beyond the browser viewport width, creating a horizontal scrollbar on the entire page. The 24 hourly cards are rendered in a single flex row with no width constraint.

**Expected**: Hourly cards contained within page width, scrollable within their container
**Actual**: Cards overflow the page, creating a full-page horizontal scrollbar
**Root cause**: The hourly forecast container in `WeatherView.tsx` uses `display: flex` but lacks `overflow-x: auto` and `max-width: 100%`.

---

## Priority Summary — Round 1 (2026-03-22)

| Priority | Issues | Status |
|----------|--------|--------|
| **P1** (must fix) | F-01, F-03, F-06, F-07 | ✅ Fixed (PR #138) |
| **P2** (should fix) | F-02, F-09 | ✅ Fixed (PR #138) |
| **P3** (nice to have) | F-04, F-05, F-08 | Deferred to PROD-1 |

---

## Round 2 Findings (2026-03-23)

> Tester: Muk (Site Admin)
> Environment: Desktop Chrome + Mobile, Nagano location
> Version: v0.15 + PR #138 deployed

### F-10: No UI to delete crops or farms

**Page**: Bed Detail, Profile
**Severity**: Feature gap
**Priority**: P1
**GH**: #139

Managers cannot delete a crop assignment from a bed or delete a farm. Both require UI with confirmation dialog.

---

### F-11: Hourly weather scroll not intuitive

**Page**: Weather → Hourly forecast
**Severity**: UX
**Priority**: P2
**GH**: #140

The hourly forecast has `scrollbar-width:none` — users cannot tell the pane is scrollable to see later hours. Need visible scrollbar or visual scroll indicators.

---

### F-12: Restrict farm creation to 2 per user (free plan)

**Page**: Profile → New Farm
**Severity**: Feature
**Priority**: P1
**GH**: #141

Limit user-created farms to 2 (e.g. "Main" + "Experimental"). Demo farm exempt (not counted, everyone belongs to it for onboarding). Gray out "New Farm" button at limit with guidance text.

---

### F-13: Profile page needs farm context pane

**Page**: Profile → Farm list
**Severity**: Feature gap
**Priority**: P2
**GH**: #142

Selected farm card should expand to show: members list, elevation, coordinates/area, grid size. Currently only shows name and role badge.

---

### F-14: No UI to assign/edit crops on beds

**Page**: Crops → Bed Detail
**Severity**: Feature gap
**Priority**: P1
**GH**: #143

No frontend form to assign or edit crop data on a bed. The `updateBed` API and `assign_crop` i18n key exist but are unused. Users cannot add crops other than via upload or seed data.

**Note**: Current model is 1 crop per bed (ADR-20260322). The edit UI should work within this constraint.

---

### F-15: Photo upload still failing

**Page**: Crops → Bed Detail → Upload
**Severity**: Bug
**Priority**: P0
**GH**: #144

Upload still fails after F-06 fix. Previous fix addressed frontend (`capture`, `accept`, `.sr-only`). Root cause likely API-side — needs browser console investigation (auth? endpoint? validation?).

---

### F-16: Restrict farm membership to 3 per user (free plan)

**Page**: Profile → Farm list / Join flow
**Severity**: Feature
**Priority**: P1
**GH**: #145

End-users (readers/observers) can join up to 3 farms. Demo farm exempt (not counted). Related to F-12 (creation limit for managers). Both limits should be defined as shared constants for future API enforcement.

---

## Priority Summary — Round 2 (2026-03-23)

| Priority | Issues | Status |
|----------|--------|--------|
| **P0** (blocker) | F-15 | ✅ Fixed (PR #146) — client-side JPEG conversion |
| **P1** (must fix) | F-10, F-12, F-14, F-16 | ✅ Fixed (PRs #146, #147) |
| **P2** (should fix) | F-11, F-13 | ✅ Fixed (PRs #147, #148) |

## Additional Items (2026-03-23)

| Item | Source | Status | PR |
|------|--------|--------|----|
| F-04 | Round 1 P3 | ✅ Fixed — farm card elevation + grid subtitle | #149 |
| F-08 | Round 1 P3 | ✅ Fixed — weather location via Nominatim reverse geocode | #149 |
| #90 | PROD-1 backlog | ⚠️ Partial — locale sync done, temp_unit/theme deferred | #149 |

---

## Positive Observations

- Login works (after deploy fix)
- Farm creation wizard flow is intuitive
- Map picker loads and GPS detection works (marker icon now shows correctly)
- Farm switching works correctly
- Weather data loads with emoji icons and location name (F-07 + F-08)
- Japanese locale is complete (nav, labels, weather terms)
- Desktop layout renders properly (hourly scroll contained — F-09)
- Bed grid displays correctly with the demo farm
- Manage page shows camera node list (F-01)
- Step dots visible on all wizard steps (F-02)
- Crop assignment/edit form works on bed detail (F-14)
- Farm deletion with confirmation dialog (F-10)
- Photo upload converts any image format to JPEG (F-15)
- Farm creation limited to 2 per user (F-12)
- Farm cards show elevation + grid size (F-04)
- Expandable farm context pane with member list (F-13)
- Locale syncs across devices via farm settings (#90 partial)

---

> Filed: 2026-03-22 (round 1) | Updated: 2026-03-23 (rounds 2+3)
> Round 1: 6 P1/P2 fixed (PR #138, issues #132–#137 closed)
> Round 2: 7 items fixed (PRs #146–#148, issues #139–#145 closed)
> Round 3: 3 items (F-04, F-08, #90 partial) fixed (PR #149)
> All feedback resolved — v0.19 deployed for April field evaluation

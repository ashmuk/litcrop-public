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

### F-01: Profile and Settings tabs show same content

**Page**: Navigation bar
**Severity**: UX
**Priority**: P1

Both "Profile" (プロフィール) and "Settings" (設定) tabs in the top nav lead to the same content. Settings was supposed to redirect to Profile, but both tabs remain visible, confusing the user.

**Expected**: Only one tab ("Profile") in navigation. Settings tab removed or hidden.
**Root cause**: Phase D merged settings into profile but kept both nav items in `BaseLayout.astro` and `DesktopNav.tsx`.

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

## Priority Summary

| Priority | Issues | Action |
|----------|--------|--------|
| **P1** (must fix) | F-01, F-03, F-06, F-07 | Fix in next session |
| **P2** (should fix) | F-02, F-09 | Fix in next session |
| **P3** (nice to have) | F-04, F-05, F-08 | Defer to PROD-1 |

### P1 Quick Fixes (estimated ~2h total)

| # | Fix | Effort |
|---|-----|--------|
| F-01 | Remove Settings tab from nav | S |
| F-03 | Set explicit Leaflet marker icon with bundled images | S |
| F-07 | Call `translateCondition()` on FarmOverview + CSS overflow fix | S |
| F-06 | Debug upload flow — check console errors, endpoint path, auth | M |

### P2 Quick Fixes

| # | Fix | Effort |
|---|-----|--------|
| F-02 | Fix step indicator to always render total dots | S |
| F-09 | Add `overflow-x: auto; max-width: 100%` to hourly container | S |

---

## Positive Observations

- Login works (after deploy fix)
- Farm creation wizard flow is intuitive
- Map picker loads and GPS detection works
- Farm switching works correctly
- Weather data loads for the farm's actual location
- Japanese locale is complete (nav, labels, weather terms)
- Desktop layout renders properly (aside from overflow issues)
- Bed grid displays correctly with the demo farm

---

> Filed: 2026-03-22 | Next action: Fix P1+P2 items in next session
> Reference: Memory file `feedback_mvp_plus_post_deploy.md`

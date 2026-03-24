# Session Report: v0.16 → v0.20

> Date: 2026-03-24
> Session: mvp-plus-post
> Scope: Post-deploy feedback resolution (6 rounds) + user roles + profile system
> From: v0.15 (camera node) → v0.20 (field-evaluation ready)

---

## Summary

Resolved 34 feedback items across 6 rounds of live testing, implementing user roles, profiles, admin designation, farm membership management, and numerous UX fixes. The app is now ready for the April field evaluation in Nagano.

---

## Tags Created

| Tag | Scope | Key Deliverables |
|-----|-------|------------------|
| v0.16 | Round 1 fixes | Weather emojis, upload fix, Manage page, map marker, scroll |
| v0.17 | Plan limits | Farm creation (2), membership (3), hourly scroll UX |
| v0.18 | Farm context | Expandable farm cards with members list |
| v0.19 | Weather + sync | Location name, card enrichment, locale sync |
| v0.20 | Roles + profiles | User profiles, admin, observer, leave farm, CORS, scroll |

---

## PRs Merged (13)

| PR | Title | Issues Closed |
|----|-------|---------------|
| #138 | Post-deploy feedback (F-01..F-09) | #132–#137 |
| #146 | Upload, crop edit, farm deletion (F-10/F-14/F-15) | #139, #143, #144 |
| #147 | Plan limits + scroll UX (F-11/F-12/F-16) | #140, #141, #145 |
| #148 | Farm context pane (F-13) | #142 |
| #149 | Weather location, card enrichment, locale sync | — |
| #150 | Manager role delete fix | — |
| #158 | User roles + profiles (R-01..R-07) | #151–#157 |
| #165 | Round 5 — delete fix, locale, i18n, scroll, reg prefs | #159, #161–#164 |
| #166 | CORS: DELETE on Lambda | — |
| #167 | CORS: DELETE on API Gateway | — |
| #170 | Leave farm (F-24) | #169 |
| #171 | Leave button owner/member logic | — |
| #172–#175 | Hourly scroll fixes (4 iterations) | — |

---

## Feedback Rounds

### Round 1 (F-01..F-09) — 6 items fixed
- F-01: Settings → Manage (IoT) page
- F-02: Wizard step dots visibility
- F-03: Leaflet marker icon
- F-06: Upload file input fix
- F-07: Weather condition emojis + `conditionToEmoji()`
- F-09: Hourly scroll overflow

### Round 2 (F-10..F-16) — 7 items fixed
- F-10: Farm deletion (DELETE API + cascading DynamoDB + confirmation UI)
- F-11: Hourly scroll thin scrollbar
- F-12: Farm creation limit (2, free plan)
- F-14: Crop assignment/edit form
- F-15: Upload JPEG conversion (Canvas API, 4096px cap)
- F-16: Farm membership limit (3, free plan)

### Round 3 (F-04, F-08, #90) — 3 items fixed
- F-04: Farm card elevation + grid labels
- F-08: Weather location via Nominatim reverse geocode
- #90: Locale cross-device sync (partial — temp_unit deferred)

### Round 4 (R-01..R-07) — 7 items fixed
- R-01: Observer read-only restrictions (BedDetail UI)
- R-02: Role selection at registration (Manager/Reader)
- R-03: Admin designation via ADMIN_EMAILS env var
- R-04: Editable display name on profile
- R-05: Farm card labels (畝, 標高)
- R-06: Display names in member list with manager badge
- R-07: User profile store (DynamoDB + GET/PATCH /me/profile)

### Round 5 (F-17..F-22) — 5 items fixed
- F-17: Locale + temp unit at registration
- F-19: Farm deletion cache sync (localStorage)
- F-20: Hourly weather auto-scroll to current time
- F-21: Layout menu Japanese translation (レイアウト)
- F-22: Locale persistence across logout/login

### Round 6 (F-23, F-24) — 1 implemented, 1 deferred
- F-24: Leave farm — member self-removal (implemented)
- F-23: Soft delete two-phase pattern (deferred to PROD-1)

### Hotfixes
- CORS: DELETE method missing from Lambda (PR #166) and API Gateway (PR #167)
- Hourly scroll: 4 iterations (rAF → setTimeout → getBoundingClientRect → scrollIntoView)
- Manager role: farm creators from before admin-role migration couldn't delete

---

## New API Endpoints (7)

| Method | Path | Purpose |
|--------|------|---------|
| DELETE | /farms/:farmId | Delete farm (cascading) |
| GET | /farms/:farmId/members | List farm members |
| DELETE | /farms/:farmId/members/me | Leave farm (self-removal) |
| GET | /me/profile | Get user profile |
| PATCH | /me/profile | Update display name / preferred role |
| — | WeatherResponse | Added latitude/longitude fields |
| — | ImageListItem | Added node_id field |

## Shared Constants Added

| Constant | Value | Purpose |
|----------|-------|---------|
| DEMO_FARM_ID | 'demo-farm' | Demo farm guard (server + client) |
| CROP_TYPES | 8 items | Crop dropdown (shared with i18n) |
| FREE_PLAN_MAX_OWNED_FARMS | 2 | Farm creation limit |
| FREE_PLAN_MAX_MEMBERSHIPS | 3 | Farm membership limit |
| ENV_ADMIN_EMAILS | env var name | Admin designation |

---

## Metrics

| Metric | Value |
|--------|-------|
| Commits | 42 |
| Files changed | 41 |
| Lines added | +1,600 |
| Lines removed | -162 |
| Tests | 336 (+15 new) |
| Issues closed | ~40 |
| Issues remaining | 3 (PROD-1) |
| New components | ManagePage, me.ts route |
| i18n keys added | ~50 (en + ja) |

---

## Key Technical Decisions

1. **conditionToEmoji()** — Frontend emoji mapping for weather codes (API returns slugs, not emojis)
2. **Client-side JPEG conversion** — Canvas API converts any image format before upload; 4096px max dimension
3. **Farm creator role: admin** — Changed from manager to admin so creators can delete their own farms
4. **ADMIN_EMAILS env var** — Admin designation via environment, not source code
5. **Server-wins locale sync** — Only applies when no localStorage preference exists (prevents overwrite)
6. **scrollIntoView** — Reliable scroll positioning in complex CSS Grid layouts (4 failed approaches led to this)
7. **Leave vs Delete** — Admins see Delete (destructive), non-admin members see Leave (non-destructive)

---

## Known Gaps (documented, deferred to PROD-1)

- Observer API-level write enforcement (R-01 is frontend-only)
- `isAdmin` backend flag unused by routes (computed but not consumed)
- N+1 getUserProfile in member list enrichment
- Registration role sync timing (localStorage → first login)
- Soft delete pattern (F-23, #168)
- temp_unit + theme cross-device sync (#90 remaining)
- Profile picture (#160)

---

> Session duration: ~12 hours
> Next: April field evaluation → PROD-1 planning

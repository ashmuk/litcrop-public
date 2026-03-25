# BETA1-READINESS.md — Beta-1 Implementation Strategy

> Date: 2026-03-25 | Status: **REVIEWED** — verified against codebase
> Branch: develop at `e80ef03` (v0.21)
> Baseline: v0.21 (docs reorg + scope rename + theme/admin fixes)
> Target: v0.22 (Beta-1 release)
> Review: cc-review holistic scan (2026-03-25)

---

## Purpose

Implementation strategy for the **Beta-1 milestone** — resolving remaining open items from live testing and delivering the high-priority GitHub Issues (D-01 through D-06 series). This document defines waves, dependencies, and acceptance criteria.

---

## 1. Current State

| Item | Value |
|------|-------|
| Frontend | CloudFront (v0.20 deployed) |
| Branch | `develop` at v0.21 (7 commits ahead of deployed) |
| Open GH Issues | 9 (3 HIGH priority, 1 bug) |
| Tests | **336/336 passing** (19 files, Vitest v4.1.0) |
| Build | Clean (all 3 workspaces) |
| Type check | Clean (zero errors) |
| Working tree | Clean |

### Scope Naming (updated v0.21)
- ~~PROD-1~~ → **BETA** (this milestone)
- ~~PROD-2~~ → **PROD** (future)

---

## 2. Open Items Inventory (verified 2026-03-25)

### 2A. GitHub Issues (9 open)

| # | Title | Pri | Size | Area | Verified Status |
|---|-------|-----|------|------|-----------------|
| #180 | Hide Leave button for farm owners | HIGH | S | frontend | **PARTIALLY RESOLVED** — uses role check, not ownership check |
| #178 | Rename Manage → Device (IoT camera) | HIGH | S | frontend | **OPEN** — still "Manage" everywhere |
| #182 | Admin auto-assigned to all farms | HIGH | M | api | **OPEN** — no admin bypass in assertFarmAccess |
| #183 | AI chat accessible on all pages | — | M | frontend | **OPEN** — only on /setup/ page |
| #160 | Profile picture support | — | M | full-stack | **OPEN** |
| #179 | Admin dashboard (Manage menu) | — | L | full-stack | **OPEN** |
| #181 | Observer onboarding (APPLY workflow) | — | L | full-stack | **OPEN** |
| #168 | Soft delete for farm deletion | — | L | api | **OPEN** |
| #90 | Settings endpoint (cross-device sync) | — | M | full-stack | **OPEN** |

### 2B. UX Bugs from Live Testing (verified against code)

| ID | Description | Verified Status | Evidence |
|----|-------------|-----------------|----------|
| UX-1 | Duplicate Settings tab | **RESOLVED** | Settings tab removed from nav. Only 4 tabs: Crops, Weather, Manage, Profile. /settings redirects to /manage/ for bookmarks. |
| UX-2 | Farm wizard step dots wrong | **RESOLVED** | `FarmWizard.tsx:72-88` renders 3 dots always via `[1,2,3].map()`, with proper current/completed/future styling and aria labels. |
| UX-3 | Leaflet marker icon broken | **RESOLVED** | `MapPicker.tsx:100-108` explicitly sets `L.icon()` with CDN URLs for marker, retina, and shadow images. Standard fix for bundler path issue. |
| UX-4 | Farm card missing attributes | **RESOLVED** | `ProfilePage.tsx:284-288` shows elevation + grid. Expanded panel (lines 362-407) shows lat/lon, elevation, grid, member count. |
| UX-5 | Bed-crop model too restrictive | **DEFER** | Architecture decision (ADR-20260322). PROD scope. |
| UX-6 | Photo upload not working | **NEEDS VERIFICATION** | Code is complete: `BedDetail.tsx:151-183` (client JPEG conversion), `beds.ts:216-371` (server handler, S3 PutObject). May be infra issue (IAM/bucket). |
| UX-7 | Weather condition codes = system strings | **RESOLVED** | `format.ts:51-54` translates via i18n. `en.json:159-176` and `ja.json:159-176` have 16 condition mappings. Fallback: title-case slug. |
| UX-8 | Weather page missing location name | **RESOLVED** | `WeatherView.tsx:67-91` does reverse geocoding via Nominatim API with locale-aware results and caching. Rendered at line 174-178. |
| UX-9 | Hourly weather scroll overflow | **RESOLVED** | `WeatherView.tsx:216-217` has `overflow-x:auto;max-width:100%`. Auto-scroll centers current hour. `responsive.css:335-338` prevents grid blowout. |

### Summary: 6 of 8 UX bugs RESOLVED, 1 needs deploy verification, 1 deferred.

---

## 3. Implementation Waves (updated after review)

### Wave 1 — Remaining Quick Wins (~1 hr)

**Goal**: Close the 2 open S-sized items.

| Order | Item | What to Do |
|-------|------|------------|
| 1.1 | #180 | **Refine**: Current check uses `farm.role !== 'admin'` (ProfilePage.tsx:309). Change to ownership check: `farm.user_id === currentUser.sub`. The backend already handles admin-leave correctly (allows if other admins exist). |
| 1.2 | #178 | **Implement**: Rename nav label Manage → Device in i18n (`en.json`, `ja.json`), BaseLayout.astro inline translations, DesktopNav.tsx tab config. Keep route as `/manage/` (internal only). |

**No longer needed** (verified resolved):
- ~~UX-1 Settings tab~~ — already removed
- ~~UX-3 Leaflet icon~~ — already fixed with CDN icon config
- ~~UX-2 Wizard dots~~ — already rendering 3 dots correctly

---

### Wave 2 — Medium Effort (~1–2 hrs)

**Goal**: Deliver #182 (admin auto-assign) + verify upload.

| Order | Item | What to Do |
|-------|------|------------|
| 2.1 | #182 | API: Add admin bypass in `assertFarmAccess()` — if `isAdmin`, skip membership check. Profile: admin query should return all farms. Add tests for admin access. |
| 2.2 | UX-6 | **Deploy-time verification**: Code is complete. Verify on live site: (a) S3 bucket exists and matches `S3_IMAGES_BUCKET` env var, (b) Lambda role has `s3:PutObject`, (c) test end-to-end upload. |

**No longer needed** (verified resolved):
- ~~UX-7 weather codes~~ — 16 conditions mapped in en.json + ja.json
- ~~UX-4 farm card attrs~~ — elevation, grid, lat/lon all rendered
- ~~UX-9 scroll overflow~~ — fixed with overflow-x:auto + max-width

---

### Wave 3 — Larger Features (scope decision needed)

| Item | Recommendation | Rationale |
|------|---------------|-----------|
| #183 AI chat on all pages | **Beta-1 stretch** (M) | ChatAssistant exists but only in /setup/. Add as floating FAB in BaseLayout or dedicated tab. High user value for field monitoring. |
| #160 Profile picture | **Beta-1 stretch** (M) | Reuse S3 + `toJpegBlob()` pipeline. Small avatars (128x128). |
| #179 Admin dashboard | **Beta-2** (L) | Promoted — needs admin UI, depends on #182. See BETA2-READINESS.md. |
| #181 Observer onboarding | **Beta-2** (L) | Promoted — APPLY workflow, depends on #179. See BETA2-READINESS.md. |
| #90 Settings sync | **Beta-2** (M) | Promoted — cross-device sync, no dependencies. See BETA2-READINESS.md. |
| #168 Soft delete | **Defer to PROD** (L) | Hard-delete works for beta. Safety feature for production. |

---

## 4. Beta-1 Scope Summary (revised)

### In Scope

| Category | Count | Items |
|----------|-------|-------|
| Bug fix (refine) | 1 | #180 (ownership check) |
| Feature (HIGH) | 2 | #178 (Manage→Device), #182 (admin auto-assign) |
| Deploy verification | 1 | UX-6 (photo upload) |
| **Stretch** | 2 | #183 (chat FAB), #160 (avatar) |
| **Total** | **6** (4 firm + 2 stretch) |

### Already Resolved (no action needed)

| Count | Items |
|-------|-------|
| 6 | UX-1 (Settings tab), UX-2 (wizard dots), UX-3 (Leaflet icon), UX-4 (farm card attrs), UX-7 (weather codes), UX-8 (location name), UX-9 (scroll) |

### Promoted to Beta-2 (v0.23)

| Count | Items |
|-------|-------|
| 3 | #179 (admin dashboard), #181 (observer onboarding), #90 (settings sync) |

See [BETA2-READINESS.md](BETA2-READINESS.md) for full strategy.

### Deferred to PROD (v1.0)

| Count | Items |
|-------|-------|
| 2 | #168 (soft delete), UX-5 (bed-crop 1:N) |

---

## 5. Execution Plan

```
 Wave 1 (~1h, frontend)    Wave 2 (~1-2h, api+verify)   Wave 3 (stretch)
 ───────────────────────   ─────────────────────────────  ──────────────────
 #180 ownership check      #182 admin bypass + tests      #183 chat FAB
 #178 Manage→Device i18n   UX-6 deploy-time upload test   #160 profile pic
                           ────────────────────────────
                           deploy + live verification
```

### Exit Criteria

- [ ] #180 uses ownership check (user_id), not just role
- [ ] #178 nav shows "Device" in en + ja
- [ ] #182 admin can access all farms via API
- [ ] UX-6 photo upload verified on live site
- [ ] Tests pass (target: 340+)
- [ ] Deploy to CloudFront
- [ ] Live verification on mobile + desktop
- [ ] Tag v0.22 (Beta-1)
- [ ] Create PR develop → main

---

## 6. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| UX-6 upload infra issue (IAM/bucket) | Blocked upload feature | Check CDK stack for S3 permissions. Timebox to 30 min. |
| #182 admin bypass security | Over-permissive API | Bypass read-only access (GET). Write ops (POST/PUT/DELETE) still require membership. Add tests. |
| .env loss on deploy | Broken deploy | Verify .env before deploy. CI should inject env vars. |

---

## 7. Review Findings (cc-review 2026-03-25)

| Finding | Severity | Status |
|---------|----------|--------|
| #180 uses `role !== 'admin'` not ownership check | SHOULD-FIX | → Wave 1 |
| #178 "Manage" not renamed to "Device" | SHOULD-FIX | → Wave 1 |
| #182 no admin bypass in assertFarmAccess | SHOULD-FIX | → Wave 2 |
| #183 ChatAssistant only on /setup/ | INFO | → Wave 3 stretch |
| UX-6 upload code complete, needs infra verification | SHOULD-FIX | → Wave 2 deploy-time |
| Upload uses Lambda relay (not presigned URL) | SUGGESTION | Defer — works for beta scale |

**No MUST-FIX findings. All items are SHOULD-FIX or lower.**

---

*Generated: 2026-03-25 | Reviewed: 2026-03-25 | Session: litcrop-beta-1*

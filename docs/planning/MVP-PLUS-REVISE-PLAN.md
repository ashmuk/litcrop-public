# MVP-PLUS-REVISE-PLAN.md — Scope Realignment & Strategy

> Date: 2026-03-21 | Updated: 2026-03-22
> Status: REVISED — scope expanded after evaluation scenario review
> Context: v0.9 deployed, 288 tests pass, 12 GH issues closed, PR #116 merged to main
> Purpose: Realign remaining work into MVP+, PRODUCTION-1, PRODUCTION-2 scopes
> References: Vision.md, REQUIREMENTS.md, ARCHITECTURE.md, MVP-PLUS-ALL-ITEMS.md

---

## 1. Where We Are

### Vision.md defined 4 MVP deliverables:

```
1. Allow creation and editing of farm layout and crop data     ✅ Partial (read-only layout, creation wizard)
2. Support one or more camera nodes uploading images           ✅ Done (simulator + phone camera)
3. Display time-lapse growth per plot                          ❌ NOT DONE
4. Enable manual observation and tagging                       ✅ Done
```

**Gap #3 (time-lapse) is the most significant Vision alignment miss.** The image pipeline exists, the data is there — but the playback UI was never built. This should be the top MVP+ priority.

### REQUIREMENTS.md has 14 FR groups (FR-1 through FR-14):

| FR Group | Status | Gap |
|----------|--------|-----|
| FR-1: Farm Layout | ✅ Done | Read-only; no interactive editor (by design) |
| FR-2: Image Upload | ✅ Done | Camera sim + phone upload |
| FR-3: Image Viewing & Timeline | ⚠️ Partial | FR-3.5 (lightbox) and FR-3.6 (side-by-side comparison) not done |
| FR-4: Manual Tagging | ✅ Done | |
| FR-5: Camera Simulator | ✅ Done | |
| FR-6: Spatial Layout | ✅ Done | |
| FR-7: Weather | ✅ Done | |
| FR-8: Farm Setup | ⚠️ Partial | FR-8.1 lacks map picker (GPS/coords only), FR-8.2 climate profile basic |
| FR-9: AI Chat | ⚠️ Partial | FR-9.4 (layout creation), FR-9.8 (SSE streaming) not done |
| FR-10: Settings | ⚠️ Partial | No cross-device sync (#90) |
| FR-11: Auth | ✅ Done | |
| FR-12: Desktop Responsive | ✅ Done | |
| FR-13: Thumbnails | ✅ Done | |
| FR-14: IaC/CDK | ✅ Done | |

### ARCHITECTURE.md alignment:

The architecture supports all planned work — no structural changes needed for MVP+. Multi-farm (N1) is the first item requiring architecture doc updates.

---

## 2. Scope Definitions

### MVP+ (v1.0) — "Field-Ready"

> **Goal**: Make the app genuinely useful for the April field evaluation in Nagano.
> **User**: The farmer (primary persona from REQUIREMENTS.md) using their phone in the field.
> **Question to answer**: "Can I use this daily for 2 weeks and get real value?"

### PRODUCTION-1 — "Multi-User Ready"

> **Goal**: Support 5-10 users with proper infrastructure, security hardening, and operational visibility.
> **User**: Multiple early adopters, each with their own farm.
> **Question to answer**: "Can I invite others and trust it won't break or leak data?"

### PRODUCTION-2 — "Platform Foundation"

> **Goal**: Lay groundwork for IoT device ecosystem, AI-powered analysis, and growth toward a service.
> **User**: Power users, potential service customers.
> **Question to answer**: "Is this something I'd pay for?"

---

## 3. User Stories & Scenarios

### Scenario A: Morning Field Check (MVP+ target)

```
Tanaka-san wakes up at 6am in Nagano. It rained last night.

1. Opens LitCrop on phone → sees Farm Overview with weather strip
2. Weather shows "Rain overnight, 12mm. Clearing by 10am."
   Wind: "SW 15 km/h" (cardinal direction ← v0.9 fix)
3. Notices the tomato plot status is "Possible Issue"
4. Taps into Plot Detail → sees latest camera image (uploaded 5am)
5. Scrolls through image history → taps "Play" to see time-lapse of last 7 days
   → NEW (F-14): sees growth has stalled since the heavy rain 3 days ago
6. Tags the latest image as "Slow Growth"
7. Opens AI Chat → asks "Why might my tomatoes have stopped growing?"
   → Chat queries farm data + weather history via tools
   → Response rendered with Markdown formatting (bold, lists)
   → NEW (SF-4): properly formatted instead of plain text
8. Chat suggests: "Recent heavy rain may have caused waterlogging.
   Consider checking drainage around Plot C2."
9. Total time: 3 minutes. Tanaka-san decides to visit the tomato plot today.
```

**MVP+ features exercised**: F-14 (time-lapse), SF-4 (Markdown chat), existing weather/chat/tagging.

### Scenario B: Setting Up a Second Farm (PRODUCTION-1 target)

```
Tanaka-san has a second plot 2km away. Wants to monitor both.

1. Goes to Profile → taps "Add Farm"
2. NEW (N1): Uses map picker to pin location → NEW (F-09)
3. Elevation auto-fills → NEW (F-10)
4. Farm created → farm selector appears in nav
5. Switches between farms via selector
6. Settings (theme, locale) sync across devices → NEW (#90)
7. Refresh token stored securely → NEW (S9): no XSS risk
```

**PRODUCTION-1 features exercised**: N1 (multi-farm), F-09 (map), F-10 (elevation), #90 (settings sync), S9 (httpOnly cookies).

### Scenario C: Inviting a Neighbor (PRODUCTION-2 target)

```
Tanaka-san's neighbor Suzuki-san wants to try LitCrop.

1. Suzuki-san registers with email → existing auth flow
2. Sets up farm with map picker → existing + F-09
3. Connects a real Raspberry Pi camera node → NEW (F-07)
4. Sees camera status in IoT dashboard → NEW (V-03)
5. After 1 week: uses time-lapse to review tomato growth
6. AI suggests soil pH check → NEW (F-13): pH sensor data visible
7. Admin (Tanaka-san) monitors both users via admin dashboard → NEW (F-09:Admin)
```

**PRODUCTION-2 features exercised**: F-07 (IoT mgmt), V-03 (device dashboard), F-13 (sensors), enhanced admin.

---

## 4. Proposed Scope Assignments

### MVP+ (v1.0) — "Field-Ready" (~22-26h)

> **Theme**: Close the Vision gap + enable the 3-user evaluation scenario
> **Deploy**: Before April field evaluation
> **Gate**: CI/CD operational, multi-farm working, time-lapse playing, bed-grid usable
> **Scenario**: `docs/MVP-PLUS-SCENARIO.md` — 3 users (Admin/Manager/Observer), 2 farms (demo + created)
> **Review**: `docs/REVIEW-FOR-MVP-PLUS-BY-ULTRATHINK.md` — deep alignment review, pros/cons, tech feasibility

#### Phase A: CI/CD Pipeline (carry from v0.9 — prerequisite, ~1h)

> **Tech stack review**: No new libraries. Uses GitHub Actions (already standard).

| # | ID | Description | Pri | Effort |
|---|-----|-------------|-----|--------|
| 1 | CI-1 | `pr-checks.yml` (build+test+tsc+cdk synth) | P0 | S |
| 2 | CI-2 | `deploy.yml` (cdk deploy + S3 sync on push to main) | P0 | S |
| 3 | CI-3 | GitHub Secrets (AWS credentials) | P0 | S |
| 4 | CI-4 | GitHub Environment `production` with approval | P0 | S |

#### Phase B: Multi-Farm Foundation (~5-7h) — NEW (pulled from PROD-1)

> Driven by evaluation scenario Steps 1, 2, and 5. Required for demo farm + user farm + switching + membership.
> **Pre-implementation actions**:
> - N1-ADR: Decide FARM_MEMBER schema, bed-grid model (keep Plot 1:1 with Bed vs merge), middleware migration strategy
> - REQUIREMENTS.md revision: Update C-5, FR-1.6, FR-1.7, NFR-7.8, FR-8.5 for multi-farm/membership model
> - ARCHITECTURE.md updates: Add FARM_MEMBER entity, new access patterns, update middleware description, add `GET /farms` endpoint
>
> **Tech stack review**: No new libraries needed. Uses existing DynamoDB single-table + Preact signals (already in stack) for farm context state. Evaluate if Preact `createContext` or signals is better for farm switching.

| # | ID | Description | Pri | Effort | Source |
|---|-----|-------------|-----|--------|--------|
| 5 | N1-ADR | ADR for multi-farm support | P0 | S | MVP-POST-PLAN (moved) |
| 6 | N1-BE | DynamoDB schema: `SK=FARM#<farmId>`, `FARM_MEMBER#userId` records | P0 | M | MVP-POST-PLAN (moved) |
| 7 | N1-API | `GET /farms` returns `Farm[]`, `POST /farms` creates farm | P0 | S | MVP-POST-PLAN (moved) |
| 8 | N1-FE | Farm switcher + farm context provider in frontend | P0 | M | MVP-POST-PLAN (moved) |
| 9 | N1-MIG | Dual SK format support (no data migration needed) | P0 | S | MVP-POST-PLAN (moved) |
| 10 | ROLE | Role model (admin/manager/observer) via FARM_MEMBER role field | P0 | S | SCENARIO (new) |
| 11 | DEMO | Demo farm seed data for onboarding (beds, crops, sample images) | P1 | M | SCENARIO (new) |

#### Phase C: Vision Closure (~4h)

> **Tech stack review**:
> - F-14 (time-lapse): Evaluate `requestAnimationFrame` vs `setInterval` for playback. Image preloading strategy (preload next N images). No external library needed — custom Preact component.
> - FR-3.5 (lightbox): Minimal custom implementation vs library (e.g., `glightbox` ~10KB). Prefer custom for bundle size.
> - SF-4 (markdown): Evaluate `marked` (~12KB gzip, MIT) vs `markdown-it` (~100KB) vs `remark` (~200KB). Recommend `marked` for smallest bundle on LTE.

| # | ID | Description | Pri | Effort | Vision Ref |
|---|-----|-------------|-----|--------|------------|
| 12 | F-14 | Time-lapse playback — image sequence player with speed control | P0 | M | Vision MVP #3 |
| 13 | FR-3.5 | Tap thumbnail to view full-size image (lightbox) | P1 | S | REQUIREMENTS FR-3.5 |
| 14 | SF-4 | Chat Markdown rendering (bold, lists, code blocks) | P1 | S | REPORT_POC |

#### Phase D: UX Restructure (~5-6h) — EXPANDED

> Driven by evaluation scenario Steps 2 and 3. Map picker integrates into farm creation wizard. Bed-grid replaces freeform plot wizard.
>
> **Tech stack review**:
> - F-09 (map picker): Evaluate `Leaflet` (~40KB gzip, BSD-2) vs `Mapbox GL` (~200KB + API token) vs plain OpenStreetMap iframe. Recommend **Leaflet** — best size/feature balance, free tiles, no API key. Lazy-load via dynamic import (only loads on farm setup page).
> - F-10 (elevation): Open-Meteo Elevation API (free, no key) — same provider as weather. Fallback: manual input if API is down.
> - Bed-grid: No external library — CSS Grid + Preact component. 5x5 max keeps it simple.
> - Profile page: Evaluate new Astro page vs extending existing Settings. Recommend new page — separates farm management from user preferences.

| # | ID | Description | Pri | Effort | Source |
|---|-----|-------------|-----|--------|--------|
| 15 | F-09 | Map picker for farm location (integrated into farm creation wizard) | P1 | M | FEEDBACK #55 |
| 16 | F-10 | Elevation auto-fetch from coordinates | P2 | S | FEEDBACK #56 |
| 17 | BED | Bed-grid layout: rows × cols (5 max each) — replaces freeform plot wizard | P0 | M | SCENARIO (new) |
| 18 | CROP | Crop-per-bed model: one crop per bed, tied to bed record | P0 | S | SCENARIO (new) |
| 19 | PROF | Profile page redesign: "Farm" section (farm list + switch) + "You" section | P1 | M | SCENARIO (new) |

#### Phase E: Security Hardening (~2-3h)

> **Critical**: rc-reviewer must specifically audit the new membership middleware for auth bypass vulnerabilities.
> S3/S4/S6 fixes must work with the new membership-based authorization (not just owner-based).
> **Tech stack review**: No new libraries. Existing Zod + Hono middleware.

| # | ID | Description | Pri | Effort | Source |
|---|-----|-------------|-----|--------|--------|
| 20 | S3 | Auth middleware on `/plots` and `/images` root paths | P1 | S | REVIEW-FINDINGS |
| 21 | S4 | Validate pagination cursor PK | P1 | S | REVIEW-FINDINGS |
| 22 | S6 | Sanitize user input in chat stub (XSS) | P1 | S | REVIEW-FINDINGS |
| 23 | S10 | RemovalPolicy RETAIN for prod DynamoDB + S3 | P1 | S | MVP-POST-PLAN |

#### Phase F: Quality (~3-4h)

> Includes test refactoring for membership model (existing 288 tests may need ownership assertion updates).
> **Tech stack review**: No new libraries. Existing Vitest + Zod.

| # | ID | Description | Pri | Effort | Source |
|---|-----|-------------|-----|--------|--------|
| 24 | Q6 | Fix assertImageOwnership 503→404 | P2 | S | REVIEW-FINDINGS |
| 25 | SG-3 | Fix updateFarm ExpressionAttributeNames leak | P2 | S | REPORT_POC |
| 26 | Q12 | Dynamic timezone from farm lat/lon | P2 | S | MVP-POST-PLAN |
| 27 | T8-T9 | Standalone Zod schema tests | P2 | S | MVP-POST-PLAN |
| 28 | FR-3.6 | Side-by-side date comparison (if time) | P2 | M | REQUIREMENTS FR-3.6 |

**MVP+ total: 28 items, ~22-26h estimated** (revised from 18-22h after ultrathink review)

---

### PRODUCTION-1 — "Multi-User Ready" (~12-16h)

> **Theme**: Self-service membership, cross-device, operational hardening
> **Deploy**: After April evaluation, incorporating field feedback
> **Gate**: Invite/apply working, settings sync, IAM scoped, custom domain
> **Note**: Multi-farm foundation (N1) moved to MVP+ — PROD-1 now builds on that foundation.

#### Membership & Social (deferred from MVP+)

| # | ID | Description | Pri | Effort | Notes |
|---|-----|-------------|-----|--------|-------|
| 29 | INVITE | Invite workflow — farm owner sends invite to user | P1 | M | Builds on FARM_MEMBER from MVP+ |
| 30 | APPLY | Apply-to-join — user requests access, owner approves | P1 | M | Approval queue + notification |
| 31 | IOT-UI | IoT device web config UI ([Manage] page) | P1 | M | Deferred from MVP+ scenario Step 4 |

#### Features

| # | ID | Description | Pri | Effort | GH |
|---|-----|-------------|-----|--------|-----|
| 32 | #90 | Settings cross-device sync (PATCH/GET /settings) | P1 | M | #90 |
| 33 | S9 | httpOnly cookies for refresh token | P1 | S | — |
| 34 | N2 | IoT service/guide page at `/services/` | P2 | M | — |
| 35 | SSE | Streaming chat responses (SSE + SDK stream) | P2 | M | — |
| 36 | Q11 | Batch DynamoDB for farm detail (fix N+1) | P2 | S | — |
| 37 | Q13 | Atomic tag + plot status update (TransactWrite) | P2 | S | — |

#### Infrastructure & Operations

| # | ID | Description | Pri | Effort | Notes |
|---|-----|-------------|-----|--------|-------|
| 38 | IAM-scope | Replace AdministratorAccess with least-privilege deploy role | P1 | M | Security |
| 39 | Domain | Custom domain + TLS (ACM, Route53, CloudFront) | P1 | M | Professional URL |
| 40 | SSM-runtime | Runtime SSM fetch for LLM API key (enable real AI chat) | P1 | S | Unlocks live AI |
| 41 | Desktop-polish | Full desktop layout optimization | P2 | M | FEEDBACK gap |

**PRODUCTION-1 total: 13 items, ~12-16h estimated**

---

### PRODUCTION-2 — "Platform Foundation" (~30h+)

> **Theme**: IoT ecosystem, AI intelligence, service readiness
> **Deploy**: Rolling releases, feature-flagged
> **Gate**: Real camera hardware integrated, AI analysis functional

#### IoT & Hardware

| # | ID | Description | Pri | Effort | Notes |
|---|-----|-------------|-----|--------|-------|
| 31 | F-07 | IoT management — camera pairing, device status, firmware OTA | P1 | XL | Core platform capability |
| 32 | F-13 | Soil pH monitoring via IoT sensor | P2 | L | Needs MQTT ADR |

#### AI & Intelligence

| # | ID | Description | Pri | Effort | Notes |
|---|-----|-------------|-----|--------|-------|
| 33 | CV-Phase2 | Light automation — green pixel ratio, plant size over time | P2 | L | Vision Phase 2 |
| 34 | CV-Phase3 | Advanced AI — disease detection, growth estimation, yield prediction | P3 | XL | Vision Phase 3 |
| 35 | FR-9.4 | Chatbot-assisted layout creation | P3 | L | "Create this layout in my farm" |

#### Platform

| # | ID | Description | Pri | Effort | Notes |
|---|-----|-------------|-----|--------|-------|
| 36 | Social-login | Google/LINE social login | P2 | M | Broader adoption |
| 37 | Layout-editor | Interactive visual layout editor | P2 | L | Currently read-only |
| 38 | Map-view | Interactive farm map with plot locations | P2 | L | User-requested |
| 39 | F-09:Admin | Full admin dashboard — user mgmt, audit logs | P2 | XL | Beyond current stats page |
| 40 | Live-stream | Realtime camera streaming (WebRTC/HLS) | P3 | XL | Requires Pi 4+ hardware |
| 41 | Sprinkler | Actuator control (periodic/on-demand) | P3 | XL | Separate risk domain |

**PRODUCTION-2 total: 11 items, ~30h+ estimated**

---

### Vision (V-01 through V-07) — "Service Roadmap"

> These are NOT actionable items — they are product categories that inform future `/cc-define` sessions. Each requires its own requirements gathering and design phase.

| ID | Category | Prerequisites | When to Plan |
|----|----------|---------------|-------------|
| V-01 | User Management | Auth (done), Multi-farm (PROD-1 N1) | After PROD-1 |
| V-02 | Farm Management | V-01 | After V-01 |
| V-03 | IoT Device Management | F-07 (PROD-2) | With PROD-2 |
| V-04 | Plans & Subscriptions | V-01, V-03 | After PROD-2 |
| V-05 | Admin Menu Structure | V-01 through V-04 | After V-04 |
| V-06 | Mobile App | All Production features | After PROD-2 |
| V-07 | Service Landing Page | V-04 | With V-04 |

---

## 5. Gap Analysis vs Original Documents

### Vision.md Gaps

| Vision Item | Status | Closes In |
|-------------|--------|-----------|
| Farm layout management (creation/editing) | Partial — creation works, editing is read-only | PROD-2 (layout editor) |
| Camera nodes uploading images | Done (simulator + phone) | PROD-2 (real hardware F-07) |
| **Time-lapse growth per plot** | **NOT DONE** | **MVP+ (F-14)** |
| Manual observation and tagging | Done | — |
| 2D layout editor | Deferred (read-only spatial view) | PROD-2 |
| Side-by-side comparison | Not done | MVP+ (FR-3.6) |
| Crop impact analysis cards | Done | — |
| AI chatbot (location-aware) | Done (stub mode) | PROD-1 (SSM → real AI) |

### REQUIREMENTS.md Gaps

| FR | Gap | Closes In |
|----|-----|-----------|
| FR-3.5 | Lightbox for full-size image viewing | MVP+ |
| FR-3.6 | Side-by-side date comparison | MVP+ |
| FR-8.1 | Map picker for location input | MVP+ (F-09) |
| FR-9.4 | Chatbot-assisted layout creation | PROD-2 |
| FR-9.8 | SSE streaming for chat | PROD-1 |

### ARCHITECTURE.md Gaps

| Section | Gap | Closes In |
|---------|-----|-----------|
| API endpoints | No `/settings` endpoint | PROD-1 (#90) |
| API endpoints | No `/admin/users` or `/admin/farms` | PROD-2 |
| Data flow | No time-lapse playback flow | MVP+ (F-14) |
| Rate limiting | In-memory only, documented as caveat | PROD-1 (DynamoDB counter) |

---

## 6. Recommended Execution Order

> Updated 2026-03-22 — MVP+ expanded to 6 phases (A-F), PROD-1 phases renumbered.

```
 ═══════════════════════════════════════════════════════════════
 MVP+ (v1.0) — Target: Before April field evaluation
 ═══════════════════════════════════════════════════════════════

 PHASE A — CI/CD Foundation (~1h)                    ✅ DONE (v0.10, PR #123)
   CI-1..CI-4: Pipeline setup
   → Gate: PASSED — first PR passes CI checks

 PHASE B — Multi-Farm Foundation (~5-7h)             ✅ DONE (v0.11, PR #124)
   N1-ADR: Multi-farm ADR + REQUIREMENTS.md + ARCHITECTURE.md updates
   N1-BE/API/FE/MIG: Schema + API + frontend farm switcher
   ROLE: Admin/Manager/Observer via FARM_MEMBER records
   DEMO: Demo farm seed data for onboarding
   → Gate: PASSED — user can create farm, switch between demo + own farm

 PHASE C — Vision Closure (~4h → ~6h actual)         ✅ DONE (v0.12, #59+#119 closed)
   marked + DOMPurify for markdown, custom Preact for time-lapse + lightbox
   F-14: Time-lapse playback (weekly compilation, 30fps, 0.5x/1x/2x)
   FR-3.5: Image lightbox (portal, zoom, focus trap)
   SF-4: Chat Markdown rendering (sanitized HTML)
   → Gate: PASSED — time-lapse plays weekly compilation (~294 frames)

 PHASE D — UX Restructure (~5-6h)                     ✅ DONE (v0.13)
   F-09: Map picker, F-10: Elevation, BED: Grid, CROP, PROF
   → Gate: PASSED

 PHASE E — Security Hardening (~2-3h)                  ✅ DONE (v0.14)
   S3, S4, S6, S10: RemovalPolicy RETAIN
   → Gate: PASSED

 PHASE F — Quality (~3-4h)                             ✅ DONE (v0.14)
   Q6, SG-3, Q12, T8-T9, FR-3.6
   → Gate: PASSED — 321 tests, tsc clean

 POST-DEPLOY FEEDBACK (v0.16–v0.19)                    ✅ DONE
   Round 1: F-01..F-09 (6 fixed, PR #138)
   Round 2: F-10..F-16 (7 fixed, PRs #146–#148)
   Round 3: F-04, F-08, #90 locale sync (PR #149)
   → 14 issues closed, 328 tests, 5 PRs merged

 TAG v0.19 → deployed for April field evaluation

 ═══════════════════════════════════════════════════════════════
 PRODUCTION-1 — Target: Post April evaluation
 ═══════════════════════════════════════════════════════════════

 PHASE G — Membership & Social (~4h)
   INVITE: Owner sends invite to user
   APPLY: User requests access, owner approves
   IOT-UI: IoT device web config UI ([Manage] page)

 PHASE H — Features (~6h)
   #90: Settings sync
   S9: httpOnly cookies
   SSE: Streaming chat
   N2: IoT guide page
   Q11, Q13: DynamoDB optimizations

 PHASE I — Operations (~4h)
   IAM scoping, custom domain, SSM runtime fetch
   Desktop polish

 TAG v1.1 → deploy

 ═══════════════════════════════════════════════════════════════
 PRODUCTION-2 — Target: Ongoing, feature-flagged
 ═══════════════════════════════════════════════════════════════

 PHASE J — IoT + AI
   F-07: IoT management
   CV Phase 2: Light automation
   F-13: Soil pH sensor

 PHASE K — Platform
   Layout editor, map view, social login, admin dashboard

 PHASE L — Advanced
   CV Phase 3, live streaming, sprinkler control
```

---

## 7. Key Decisions (all confirmed 2026-03-22)

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| 1 | **F-14 priority** | MVP+ | Vision MVP deliverable #3, used in 4/10 use cases |
| 2 | **F-09 map picker** | MVP+ | Integrated into farm creation wizard (Scenario Step 2) |
| 3 | **SSE streaming** | PROD-1 | Chat works without it (stub mode until SSM fetch) |
| 4 | **Multi-farm timing** | **MVP+ (revised)** | Evaluation scenario requires demo + user farm + switching |
| 5 | **CI/CD in MVP+** | Yes, first | All subsequent work benefits from automated validation |
| 6 | **Real AI chat** | PROD-1 | Need API key budget decision; stub is fine for April |
| 7 | **FR-3.6 side-by-side** | MVP+ if time | Phase F — nice-to-have for evaluation |
| 8 | **Bed-grid layout** | **MVP+ (new)** | Replaces freeform plot wizard; more intuitive |
| 9 | **Role-based membership** | **MVP+ (admin-managed)** | FARM_MEMBER records; invite/apply workflow deferred to PROD-1 |
| 10 | **IoT device web config** | PROD-1 | Camera configured locally for April; web UI deferred |
| 11 | **Demo farm seed** | **MVP+ (new)** | Pre-seeded data enables onboarding without farm creation |

---

## 8. Summary

| Scope | Items | Est. Hours | Target |
|-------|-------|------------|--------|
| MVP+ (v1.0) | 28 | ~22-26h | Before April field evaluation |
| PRODUCTION-1 (v1.1) | 13 | ~12-16h | After April evaluation |
| PRODUCTION-2 (v1.2+) | 11 | ~30h+ | Rolling releases |
| Vision (V-01..V-07) | 7 categories | TBD | Future /cc-define sessions |
| **Total remaining** | **59** | **~64h+** | |

### What Changed (2026-03-22 revision)

| Change | From | To |
|--------|------|-----|
| MVP+ item count | 18 | 28 (+10 new items) |
| MVP+ hours | ~12-14h | ~22-26h (+10-12h, revised after ultrathink review) |
| MVP+ phases | 4 (A-D) | 6 (A-F) |
| Multi-farm (N1) | PROD-1 | MVP+ Phase B |
| PROD-1 items | 12 | 13 (N1 removed, invite/apply/IoT-UI added) |
| New items added | — | ROLE, DEMO, BED, CROP, PROF, INVITE, APPLY, IOT-UI |
| Decision D7 | Pending (Option D) | Resolved (role-based membership) |

---

> Generated 2026-03-21 | Revised 2026-03-22 (scope expansion after evaluation scenario review)
> Cross-references: Vision.md, REQUIREMENTS.md, ARCHITECTURE.md, MVP-PLUS-ALL-ITEMS.md, MVP-PLUS-SCENARIO.md

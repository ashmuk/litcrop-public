# PLANS.md - Project Roadmap

> **This is the strategic scope document** — it defines *what* we're building, *why*, and the pass/fail exit criteria for each scope level. For the tactical implementation schedule (phases, task ordering, AWS provisioning), see [docs/planning/EXECUTION-PLAN.md](docs/planning/EXECUTION-PLAN.md).

## Current Scope Level: MVP

## Scope Level Progress
- [x] PoC: Analysis — validate feasibility (completed v0.7, 2026-03-19)
- [ ] MVP: Core implementation — deliver core value, get real feedback
- [ ] Production: Harden & scale — reliability, performance, operations

---

## Current Objectives (MVP)

### Goal
Deliver a multi-user, authenticated farm monitoring app with codified infrastructure, enhanced AI chatbot, and desktop-responsive UI — ready for real user feedback from 1-5 early adopters.

### Vertical Slice
```
Authenticated User → Web Dashboard (mobile + desktop)
  → Farm Management (CRUD + layout editor)
  → Image Monitoring (upload, timeline, tagging)
  → AI Crop Advisor (multi-turn, tool use)
  → Weather Integration
All deployed via IaC (CDK), reproducible and CI/CD-ready.
```

### MVP Deliverables
1. **User authentication** — email/password login, registration, password reset via AWS Cognito (ADR-007)
2. **Per-user farm ownership** — each user owns their farm(s); API endpoints enforce ownership via JWT
3. **Infrastructure as Code** — all AWS resources defined in CDK (TypeScript), reproducible deployments (ADR-008)
4. **Enhanced AI chatbot** — Anthropic SDK with multi-turn conversations, tool use (query farm data, check weather), streaming responses (ADR-009)
5. **Desktop responsive layout** — 2-column layouts at 1024px+, promoted from PoC reference design to implementation target
6. **Image processing pipeline** — server-side thumbnail generation (S3 → Lambda → S3)
7. **Contract test enforcement** — Zod schemas validating API responses against shared types at every phase boundary
8. All PoC deliverables (1-9) carry forward and remain functional

### Exit Criteria
- [ ] New user can register, log in, and access their farm dashboard
- [ ] Unauthenticated API requests are rejected with 401
- [ ] `cdk deploy` provisions all infrastructure from zero (Lambda, API GW, DynamoDB, S3, CloudFront, Cognito)
- [ ] `cdk destroy` tears down all resources cleanly
- [ ] AI chatbot supports multi-turn conversation within a session
- [ ] AI chatbot can use tools to query farm data and weather
- [ ] Dashboard renders correctly at both mobile (375px) and desktop (1024px+) breakpoints
- [ ] All 11+ contract tests pass after each implementation phase
- [ ] Total monthly cloud cost for idle + light usage remains under $5/month
- [ ] At least 1 real user (matching persona) can complete: register → create farm → view plots → chat with advisor

### Scope Exclusions (MVP)
- **Sprinkler / actuator control** — Deferred to Production. Separate risk domain.
- **Real hardware** — Simulated camera node only. Hardware procurement is not an MVP blocker.
- **Multi-farm / multi-tenant** — Single farm per user for MVP. Multi-farm is Production scope.
- **Realtime camera streaming** — Deferred to Production. Requires hardware upgrade (Pi 4+) and WebRTC/HLS.
- **Custom domain** — CloudFront default domain is sufficient for MVP demos.
- **Social login** — Email/password only for MVP. Google/LINE social login deferred to Production.
- **Computer vision / AI image analysis** — Manual tagging only. Automated analysis deferred to Production.
- **Advanced CI/CD pipeline** — CDK deploy from local CLI is sufficient for MVP. GitHub Actions CI/CD deferred to Production.
- **Visual layout editor** (interactive) — Deferred. Read-only spatial view carries forward from PoC. Editor is Production scope.

### Key Risks
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Cognito configuration complexity | Medium | Medium | Follow CDK L2 construct patterns; reference working examples |
| CDK learning curve delays implementation | Low | Medium | TypeScript alignment reduces friction; CDK workshops available |
| Anthropic SDK bundle size affects cold start | Low | Low | Measured at ~150-200KB after tree-shaking; ~15-20ms impact |
| Auth integration breaks existing PoC flows | Medium | High | Contract tests gate each phase; catch drift immediately |
| Multi-user data isolation gaps | Medium | High | JWT authorizer at API Gateway; ownership checks in Hono middleware |
| LLM API cost with tool use loops | Low | Medium | Haiku model for cost efficiency; max tool iterations capped |

---

## PoC Summary (completed)

### PoC Deliverables (all met)
1. Simulated camera node uploading sample images (periodic + motion-triggered) via HTTPS
2. Cloud backend receiving, storing, and serving farm images with plot association
3. Mobile-first web dashboard with 7 screens: Farm Overview (list + layout), Plot Detail, Image Timeline, Weather, Farm Setup, Settings
4. Static farm layout with seed data (fields, beds, plots, crop metadata)
5. Manual image tagging (Healthy / Slow Growth / Possible Issue / Animal Intrusion)
6. Weather integration via Open-Meteo with crop impact analysis
7. Farm setup with location input driving weather and climate profile
8. AI chatbot for location-aware crop planning (stub + live mode)
9. Theme options (Light / Dark / Earthy / System) and language toggle (EN / JA)

### PoC Exit Criteria (all passed)
- [x] Simulated camera node uploads an image to cloud storage via HTTPS
- [x] Uploaded images are retrievable and viewable in a mobile-first web UI
- [x] Images are associated with a specific plot in a farm layout
- [x] A time-ordered image gallery (timeline) renders for a given plot
- [x] Total monthly cloud cost for idle + light usage is under $5/month
- [x] End-to-end latency from upload to viewable-in-browser is under 30 seconds

---

## ADRs

### Accepted
| ADR | Decision | Date |
|-----|----------|------|
| [001](docs/decisions/ADR-20260317-frontend-framework.md) | Astro + Preact islands | 2026-03-17 |
| [002](docs/decisions/ADR-20260317-backend-platform.md) | Hono on single Lambda | 2026-03-17 |
| [003](docs/decisions/ADR-20260317-database-selection.md) | DynamoDB single-table | 2026-03-17 |
| [004](docs/decisions/ADR-20260317-image-storage-lifecycle.md) | S3 with lifecycle policies | 2026-03-17 |
| [005](docs/decisions/ADR-20260317-device-communication.md) | HTTPS POST upload | 2026-03-17 |
| [006](docs/decisions/ADR-20260317-cloud-provider-hosting.md) | AWS ap-northeast-1 | 2026-03-17 |
| [IAM](docs/decisions/ADR-20260317-iam-least-privilege.md) | Least-privilege IAM policy | 2026-03-17 |
| [Pipeline](docs/decisions/ADR-20260319-pipeline-improvements-mvp.md) | Per-phase gates, issue-first, Sonnet delegation | 2026-03-19 |
| [007](docs/decisions/ADR-20260320-authentication-provider.md) | AWS Cognito User Pools + JWT | 2026-03-20 |
| [008](docs/decisions/ADR-20260320-iac-tool-selection.md) | AWS CDK (TypeScript) | 2026-03-20 |
| [009](docs/decisions/ADR-20260320-ai-llm-framework.md) | Anthropic SDK | 2026-03-20 |

---

## Decisions Made
- **2026-03-17**: Sprinkler control deferred from PoC scope (separate risk domain)
- **2026-03-17**: PoC uses simulated camera node (no real hardware required)
- **2026-03-17**: Motion-triggered capture added to PoC (wildlife/pest detection)
- **2026-03-17**: AI chatbot included in PoC with focused scope (farm setup + crop planning)
- **2026-03-17**: Weather integration via Open-Meteo API included in PoC
- **2026-03-17**: Farm layout spatial view (read-only) included in PoC; interactive editor deferred to MVP
- **2026-03-17**: Theme options (Light/Dark/Earthy/System) and i18n (EN/JA) included in PoC
- **2026-03-17**: Realtime camera streaming deferred to Production (requires hardware upgrade)
- **2026-03-17**: ADRs 001-006 accepted (see docs/decisions/)
- **2026-03-17**: ADR-IAM accepted — Least-privilege IAM policy for litcrop-poc-admin
- **2026-03-19**: Pipeline improvements ADR accepted — per-phase gates, issue-first rule, Sonnet delegation
- **2026-03-20**: ADR-007 accepted — AWS Cognito for authentication
- **2026-03-20**: ADR-008 accepted — AWS CDK (TypeScript) for IaC
- **2026-03-20**: ADR-009 accepted — Anthropic SDK for AI/LLM framework
- **2026-03-20**: Visual layout editor deferred from MVP to Production (read-only spatial view sufficient)
- **2026-03-20**: Custom domain deferred from MVP to Production
- **2026-03-20**: CI/CD pipeline deferred from MVP to Production (CDK deploy from CLI sufficient)

## Iteration Log
### PoC → MVP — 2026-03-20
- **Learnings**: Field-name drift was the #1 code quality issue (4/4 MUST-FIX). Per-phase contract test gates prevent this class of bug. Ad-hoc deploy verification missed endpoints and locales.
- **Design validity**: PoC architecture carries forward; 3 new ADRs (auth, IaC, AI framework) extend it for MVP
- **Recommendation**: Proceed with MVP scope (Phase D: /cc-define)
- **User decision**: Approved

### Iteration 3 — 2026-03-22
- **Trigger**: Phase D design complete (cc-design re-entry)
- **Entry point**: Step 7 (Execution Plan) — design artifacts complete, ready for /cc-implement
- **What changed**:
  - PHASE-D-ARCHITECTURE.md: Full API contract design — data model flattening (Farm→Bed), 8 modified/new endpoints, DynamoDB access patterns (2-query farm overview vs N+1)
  - ADR-20260322: Option B selected — flatten 4-level hierarchy to Farm→Bed, merge Plot into Bed
  - UX-DESIGNS.md §14: Map picker wireframes, farm creation wizard (3-step), bed grid editor, profile page redesign, accessibility audit, i18n keys, component state matrix
  - SYSTEM-DESIGN.md §10: 5 sequence diagrams, component interaction diagram, 34-file change summary
  - docs/planning/EXECUTION-PLAN-PHASE-D.md: 4-batch plan, gate criteria, risk register, readiness mapping
- **What preserved**: All Phase A+B+C artifacts, 303 passing tests, v0.12 build, ADRs 001-009
- **Key design decisions**:
  - Farm→Bed flattening (ADR Option B): removes Field and Plot, 4→2 levels, 2 DynamoDB queries for farm overview
  - Leaflet for map picker: ~40KB gzip, BSD-2, no API key, lazy-loaded in wizard step 2 only
  - Crosshair pattern: map pans under fixed pin, avoids tap-to-place accidents on mobile
  - Elevation auto-fetch from Open-Meteo frontend-direct (CORS-enabled, no proxy needed)
  - 5×5 max grid (25 beds) — exceeds TransactWriteItems limit; use BatchWrite + separate PutItem

### Phase C Design (cc-design re-entry) — 2026-03-22
- **Trigger**: Phase A+B complete (v0.11), Phase C next per MVP+ pipeline
- **Entry point**: Step 2 (Architecture) — re-entry with existing artifacts
- **What changed**:
  - ARCHITECTURE.md §11: Phase C architecture delta (new deps: marked+dompurify, component tree, data flows, bundle impact +24KB)
  - UX-DESIGNS.md §13: TimeLapsePlayer UX (transport controls, speed selector, date bar, accessibility), Lightbox UX (overlay, zoom, dismiss), ChatMarkdown styling specs, i18n keys, accessibility audit
  - SYSTEM-DESIGN.md §9: Component interfaces (props, state shapes), animation loop (rAF), portal rendering, markdown utility, new file summary (3 create, 7 modify)
  - TASK-BREAKDOWN.md: 6 tasks (T-FE-C1..C6), ~6h estimated, dependency DAG with parallelism
- **What preserved**: Steps 1-7 artifacts from PoC and MVP phases. No API/DynamoDB/CDK changes needed.
- **Key design decisions**:
  - **Weekly compilation model**: Camera captures ~42 pics/day (variable 15/30-min intervals, 5am-8pm). Time-lapse groups images by ISO week (~294 frames/week). Incomplete weeks show progress but aren't playable.
  - Thumbnails (300x300) for playback frames — ~5.7MB/week vs ~441MB full-size. Critical for LTE in the field.
  - Progressive preloading: play starts after 10 frames, streams rest in background. No blocking on 294 images.
  - Time-proportional progress bar: reflects real clock time, not frame index (morning/afternoon dense, midday sparse)
  - Default 30fps (1x) — entire week plays in ~10s like a smooth video. Speed options: 0.5x/1x/2x. At 2x, skip every 2nd frame to maintain 30fps render rate.
  - DOMPurify mandatory for markdown output — defense-in-depth against prompt injection
  - Custom Preact components for time-lapse and lightbox — no external UI libraries, keeps bundle small
  - `requestAnimationFrame` for animation — smoother than `setInterval`, respects browser tab visibility

### Beta-5 Design (cc-design re-entry) — 2026-04-02
- **Trigger**: Beta-4 complete (v0.32), device management + profile picture next
- **Entry point**: Step 2 (Architecture) — re-entry with existing artifacts
- **What changed**:
  - ARCHITECTURE.md §13: DEVICE# entity, two-factor device auth (JWT + API key), 7 API endpoints, profile picture S3 storage, device capabilities model, cost impact ($0.00 delta)
  - UX-DESIGNS.md §15: Device list/registration/config wireframes, profile picture upload, API contracts for 9 endpoints, i18n keys, accessibility audit, capability-driven UI adaptation
  - SYSTEM-DESIGN.md §11: 5 sequence diagrams, shared types, component interfaces, 22-file change summary, event system extensions, Zod schemas
  - TASK-BREAKDOWN.md: 30 tasks (T-B5-01..T-B5-30) across 4 waves + gate, dependency DAG
  - PREREQUISITES.md §7: Beta-5 review checklist
  - docs/mockups/: 3 new HTML mock-ups (device-list, device-config, profile-picture)
  - docs/feedback/REVIEW-FINDINGS-BETA-5-DESIGN.md: 2 MUST-FIX + 6 SHOULD-FIX + 5 SUGGESTION — all resolved
- **What preserved**: All prior artifacts (Steps 1–10 of SYSTEM-DESIGN, §1–12 of ARCHITECTURE, §1–14 of UX-DESIGNS)
- **Key design decisions**:
  - DEVICE# under FARM# partition (co-located with beds/images for efficient farm queries)
  - Two-factor auth: JWT (user-level) + device API key (device-level, bcrypt-hashed, shown once)
  - Config polling: Pi calls GET /devices/{id}/config on each capture cycle (no MQTT/WebSocket)
  - Profile picture reuses images S3 bucket with avatars/ prefix (no new bucket)
  - Avatar thumbnails generated inline in API Lambda (sharp) — not via S3 trigger
  - Thumbnail Lambda guard: skip images/avatars/ prefix (not suffix filter)
  - Device capabilities: reported via heartbeat, UI disables unsupported fields
  - Device limit: max 10 per farm (Beta-5)
  - Registration defaults: 30-min interval, 1080p, 85% quality, 05:00-20:00 window

## Beta-5 Execution Plan

### Scope
- **Wave 0** (#210): Device configuration UI + API — 19 tasks (T-B5-01 to T-B5-19)
- **Wave 1** (#160): Profile picture support — 9 tasks (T-B5-20 to T-B5-28)
- **Gate**: Integration verification — 2 tasks (T-B5-29 to T-B5-30)
- **Deferred**: #216 crop library → Beta-6

### Execution Sequence

| Batch | Tasks | What | Depends On |
|-------|-------|------|-----------|
| **1 (Foundation)** | T-B5-01, T-B5-08, T-B5-11, T-B5-18, T-B5-19 | Shared types, thumb guard, Avatar component, sharp+bcrypt deps | — (all independent) |
| **2 (API Core)** | T-B5-02, T-B5-03, T-B5-22 | DynamoDB device methods, device auth middleware, S3 avatar helpers | Batch 1 |
| **3 (API Routes)** | T-B5-04, T-B5-05, T-B5-07, T-B5-20 | Device routes (register/list/delete, poll/heartbeat), device events, profile picture API | Batch 2 |
| **4 (API Ext + Tests)** | T-B5-06, T-B5-09, T-B5-21, T-B5-27 | Config update/test-shot routes, device API tests, extend profile/members responses, profile picture tests | Batch 3 |
| **5 (Frontend)** | T-B5-10, T-B5-12, T-B5-13, T-B5-14, T-B5-23 | API client, DeviceListPage, RegisterForm, ConfigForm, ProfilePicture | Batch 3 (API available) |
| **6 (Integration)** | T-B5-15, T-B5-16, T-B5-24, T-B5-25, T-B5-26 | Wire pages, i18n, integrate avatar everywhere | Batch 5 |
| **7 (Gate)** | T-B5-17, T-B5-28, T-B5-29, T-B5-30 | Contract tests, full test suite, build verification | Batch 6 |

### Exit Criteria (Beta-5)
- [ ] Manager can register a device from the web UI and receive a one-time API key
- [ ] Device list shows all registered devices with health indicators (battery, WiFi, storage)
- [ ] Config changes saved from web UI are returned on the next config poll
- [ ] Test shot can be requested from web UI for online devices
- [ ] Offline devices show red status dot and disabled test-shot button
- [ ] Wall-powered devices show "N/A" for battery
- [ ] Device can be deregistered with confirmation
- [ ] User can upload a profile picture (JPEG/PNG, max 1MB)
- [ ] Avatar displays at 96px (profile), 32px (member list), 28px (admin)
- [ ] Initials fallback with deterministic colors when no picture
- [ ] Device registration/deregistration triggers activity log entry visible in admin dashboard
- [ ] All 439+ existing tests pass + new device/profile tests
- [ ] `npm run build` succeeds across all packages
- [ ] Total monthly cost remains under $5 ceiling

## Roadmap (decided 2026-04-03)

### Sprint Order
```
Beta-5 ✅ → Beta-6 → Beta-7 → Beta-8 → Infra Sprint → Production
```
Build all features on mvp stack, test thoroughly, then one clean infrastructure transition.

### Beta-6: Pi Setup + Refinements
| Issue | Title | Priority |
|-------|-------|----------|
| #233 | Pi ~/litcrop/ setup — capture.sh + install.sh | High |
| #232 | Internal role rename (manager→owner, observer→staff) | High |
| #216 | Searchable crop library | Medium |
| #250 | Manager promote observer button | Medium |
| #242 | Device flow animation (mockup ready) | Low |

Exit criteria:
- [ ] Pi captures and uploads photos automatically via cron
- [ ] Internal roles renamed with DynamoDB migration
- [ ] Crop selector is searchable
- [ ] Manager can promote observer to owner

### Beta-7: Farm Diary
| Issue | Title |
|-------|-------|
| #245 | Farm Diary — parent feature |
| #246 | Work log with categories + cost tracking |
| #247 | Calendar + crop timeline Gantt chart |

New nav tab: 🌿 Crops → ⛅ Weather → 📓 Diary → 📡 Device → 👤 Profile

Exit criteria:
- [ ] User can log daily farm work with categories and costs
- [ ] Calendar shows entries + crop lifecycle overlay
- [ ] Gantt chart visualizes crop timelines

### Beta-8: ROI + Backlog
| Issue | Title |
|-------|-------|
| #248 | ROI dashboard — cost analysis + harvest tracking |
| #183 | AI chat on all pages |
| #168 | Soft delete pattern |

### Pre-Production Audit (#256)
Run after Beta-7, before Infra Sprint:
- Codebase quality (ESLint, TypeScript strict, dead code, deps)
- Architecture review (DynamoDB patterns, API inventory, event system)
- Security audit (OWASP, auth flow, input validation, XSS)
- Test coverage gaps (edge cases, error paths, integration)
- Performance (Lambda cold start, Lighthouse, DynamoDB capacity)
- Accessibility (WCAG 2.1 AA, keyboard, contrast)
- i18n completeness (key audit + CI check)
- Documentation (all docs up to date)
- Operational readiness (alarms, billing, CI/CD, rollback)

Deliverable: docs/feedback/PRE-PROD-AUDIT.md → Go/No-Go recommendation

### Infra Sprint: Production Launch
| Issue | Title |
|-------|-------|
| #238 | Custom domain |
| #239 | Production resource naming |
| #240 | Install.sh URL finalization |

Plus: fix any MUST-FIX findings from pre-production audit (#256)

# PLANS.md - Project Roadmap

> **This is the strategic scope document** — it defines *what* we're building, *why*, and the pass/fail exit criteria for each scope level. For the tactical implementation schedule (phases, task ordering, AWS provisioning), see [docs/EXECUTION-PLAN.md](docs/EXECUTION-PLAN.md).

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

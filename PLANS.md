# PLANS.md - Project Roadmap

> **This is the strategic scope document** — it defines *what* we're building, *why*, and the pass/fail exit criteria for each scope level. For the tactical implementation schedule (phases, task ordering, AWS provisioning), see [docs/EXECUTION-PLAN.md](docs/EXECUTION-PLAN.md).

## Current Scope Level: PoC

## Scope Level Progress
- [ ] PoC: Analysis — read-only analysis, validate feasibility
- [ ] MVP: Core implementation — deliver core value, get real feedback
- [ ] Production: Harden & scale — reliability, performance, operations

## Current Objectives (PoC)

### Goal
Validate that the core concept — remotely monitoring crop growth through periodic camera images displayed on a mobile web dashboard — is technically feasible and provides meaningful value.

### Vertical Slice
```
Simulated Camera Node → HTTPS Image Upload → Cloud Storage → Web Dashboard → Image Timeline
```

### PoC Deliverables
1. A simulated camera node script that uploads sample images (periodic + motion-triggered) via HTTPS
2. A cloud backend that receives, stores, and serves farm images with plot association
3. A mobile-first web dashboard with 7 screens: Farm Overview (list + layout), Plot Detail, Image Timeline, Weather, Farm Setup, Settings
4. A static farm layout with seed data (fields, beds, plots, crop metadata) in both list and spatial views
5. Manual image tagging (Healthy / Slow Growth / Possible Issue / Animal Intrusion)
6. Weather integration via Open-Meteo API with crop impact analysis
7. Farm setup with location input (GPS/coordinates/address) driving weather and climate profile
8. AI chatbot for location-aware crop planning and farm setup guidance
9. Theme options (Light / Dark / Earthy / System) and language toggle (EN / JA)

### Exit Criteria
- [ ] Simulated camera node uploads an image to cloud storage via HTTPS
- [ ] Uploaded images are retrievable and viewable in a mobile-first web UI
- [ ] Images are associated with a specific plot in a farm layout
- [ ] A time-ordered image gallery (timeline) renders for a given plot
- [ ] Total monthly cloud cost for idle + light usage is under $5/month
- [ ] End-to-end latency from upload to viewable-in-browser is under 30 seconds

### Scope Exclusions (PoC)
- **Sprinkler / actuator control** — Deferred. Separate risk domain (IoT control); observation-only for PoC.
- **Visual layout editor** (interactive) — Deferred to MVP. PoC has read-only spatial view.
- **User authentication** — Deferred. Single-user, no auth for PoC. "Waiting list" model is an MVP concern.
- **Image processing / computer vision** — Deferred. No thumbnails, compression on cloud side, or AI analysis.
- **Real hardware** — Simulated camera node only. Hardware procurement is not a PoC blocker.
- **Multi-farm / multi-tenant** — Single farm, single user.
- **Desktop optimization** — Mobile-first single breakpoint only.
- **CI/CD, IaC, custom domain** — Manual deploy from CLI is sufficient.
- **Cloud-side alerting / monitoring / observability** — Basic cloud provider metrics only.
- **Realtime camera streaming** — Deferred to Production. Requires hardware upgrade (Pi 4+) and WebRTC/HLS.

### Key Risks
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Hardware reliability in outdoor/rural conditions | High | High | PoC uses simulated node; validate hardware separately |
| LTE connectivity cost and availability | Medium | High | Research IoT SIM plans; calculate bandwidth budget |
| No defined user persona to validate with | Medium | High | Define persona in requirements; identify 1-2 real users |
| Cloud cost exceeds budget at scale | Low | Medium | Build cost model early; use serverless pay-per-use |
| Data privacy (camera images may contain people/property) | Medium | Medium | Document privacy considerations in requirements |

### ADR Candidates (for Stage 3-4)
- ADR-001: Frontend Framework Selection
- ADR-002: Backend Platform and Compute Model
- ADR-003: Database Selection for Farm Metadata
- ADR-004: Image Storage and Lifecycle Strategy
- ADR-005: Device Communication Protocol
- ADR-006: Cloud Provider and Hosting Strategy
- ADR-007: Authentication and User Management
- ADR-008: Infrastructure as Code Approach
- ADR-009: AI/LLM Framework Selection (Direct API vs Bedrock vs Strands vs Mastra)

## Decisions Made
<!-- Link to ADRs: docs/decisions/ADR-*.md -->
- **2026-03-17**: Sprinkler control deferred from PoC scope (separate risk domain)
- **2026-03-17**: PoC uses simulated camera node (no real hardware required)
- **2026-03-17**: Motion-triggered capture added to PoC (wildlife/pest detection)
- **2026-03-17**: AI chatbot included in PoC with focused scope (farm setup + crop planning)
- **2026-03-17**: Weather integration via Open-Meteo API included in PoC
- **2026-03-17**: Farm layout spatial view (read-only) included in PoC; interactive editor deferred to MVP
- **2026-03-17**: Theme options (Light/Dark/Earthy/System) and i18n (EN/JA) included in PoC
- **2026-03-17**: Realtime camera streaming deferred to Production (requires hardware upgrade)
- **2026-03-17**: ADRs 001-006 accepted (see docs/decisions/)
- **2026-03-17**: ADR-007 accepted — Least-privilege IAM policy for litcrop-poc-admin (see docs/decisions/ADR-20260317-iam-least-privilege.md)

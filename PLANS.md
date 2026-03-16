# PLANS.md - Project Roadmap

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
1. A simulated camera node script that uploads sample images to cloud storage via HTTPS
2. A cloud backend that receives, stores, and serves farm images with plot association
3. A mobile-first web dashboard with: Farm Overview, Plot Detail, and Image Timeline views
4. A static farm layout with seed data (fields, beds, plots, crop metadata)
5. Manual image tagging (Healthy / Slow Growth / Possible Issue)

### Exit Criteria
- [ ] Simulated camera node uploads an image to cloud storage via HTTPS
- [ ] Uploaded images are retrievable and viewable in a mobile-first web UI
- [ ] Images are associated with a specific plot in a farm layout
- [ ] A time-ordered image gallery (timeline) renders for a given plot
- [ ] Total monthly cloud cost for idle + light usage is under $5/month
- [ ] End-to-end latency from upload to viewable-in-browser is under 30 seconds

### Scope Exclusions (PoC)
- **AI chatbot** — Deferred. Vision.md itself marks as uncertain; adds scope without validating core value.
- **Sprinkler / actuator control** — Deferred. Separate risk domain (IoT control); observation-only for PoC.
- **Visual layout editor** — Deferred. Seed data with static layout is sufficient to validate the digital twin concept.
- **User authentication** — Deferred. Single-user, no auth for PoC. "Waiting list" model is an MVP concern.
- **Image processing / computer vision** — Deferred. No thumbnails, compression on cloud side, or AI analysis.
- **Real hardware** — Simulated camera node only. Hardware procurement is not a PoC blocker.
- **Multi-farm / multi-tenant** — Single farm, single user.
- **Dark mode, desktop optimization** — Mobile-first single breakpoint only.
- **CI/CD, IaC, custom domain** — Manual deploy from CLI is sufficient.
- **Alerting / monitoring / observability** — Basic cloud provider metrics only.

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

## Decisions Made
<!-- Link to ADRs: docs/decisions/ADR-*.md -->
- **2026-03-17**: AI chatbot deferred from PoC scope (uncertain value, adds scope)
- **2026-03-17**: Sprinkler control deferred from PoC scope (separate risk domain)
- **2026-03-17**: PoC uses simulated camera node (no real hardware required)

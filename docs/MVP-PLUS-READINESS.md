# MVP-PLUS-READINESS.md — Context & Entry Point for MVP+ Pipeline

> Date: 2026-03-21
> Status: READY — awaiting pipeline kickoff
> Predecessor: v0.9 deployed, tagged, merged to main (PR #116)
> Next: `/cc-define` or `/cc-design` for MVP+ scope

---

## Purpose

This document is the **entry point** for resuming work on LitCrop. Read this first to understand where the project stands, what decisions have been made, and what needs to happen next.

---

## 1. Current State

### What's Deployed (v0.9)

| Item | Value |
|------|-------|
| Frontend | https://dpj8a3mk3tzkq.cloudfront.net |
| API | https://jpg5gd81uc.execute-api.ap-northeast-1.amazonaws.com/ |
| Tag | v0.9 (307296a on develop) |
| PR | #116 merged to main (bd22c1a) |
| Tests | 288/288 pass (17 test files) |
| GH Issues | 12 closed (#104-115), 5 open (#55, #56, #58, #59, #90) |
| AWS Resources | 46 (CDK-managed LitCropStack) |
| Cost | ~$0.01-1.18/month |

### What Was Done in v0.9

5 batches of security, bug, robustness, UX, and test fixes:
- B1: C6, S11, S7, S8 (security hardening)
- B2: N3, Q7 (bug fixes)
- B3: Q4, Q5, Q9, Q10, N5 (robustness)
- B4: Q8, S5 (UX + docs)
- B5: T3, T4, T5, T6 (+8 edge-case tests)

### What's NOT Done

- CI/CD pipeline (4 items — carry into MVP+)
- Time-lapse playback (Vision MVP deliverable #3)
- 9 omitted items found during scope review (security, UX, code quality)
- Multi-farm architecture (PRODUCTION-1)
- 14 Production-scope features
- 7 Vision categories (V-01..V-07)

Full inventory: `docs/MVP-PLUS-ALL-ITEMS.md` (72 items tracked)

---

## 2. Key Documents (Read Order)

| Order | Document | What It Contains |
|-------|----------|-----------------|
| 1 | **This file** | Context, state, decisions, pipeline instructions |
| 2 | `docs/USE-CASES.md` | 5 personas, 10 use cases, shared farm decision, templates |
| 3 | `docs/MVP-PLUS-REVISE-PLAN.md` | Scope proposal (MVP+ / PROD-1 / PROD-2), user scenarios, execution phases |
| 4 | `docs/MVP-PLUS-ALL-ITEMS.md` | Complete 72-item inventory with status tracking |
| 5 | `Vision.md` | Original product vision — 4 MVP deliverables, long-term direction |
| 6 | `REQUIREMENTS.md` | FR-1 through FR-14, NFR-1 through NFR-8 |
| 7 | `docs/ARCHITECTURE.md` | System architecture, API endpoints, tech stack |
| 8 | `docs/SYSTEM-DESIGN.md` | Sequence diagrams, data flows |
| 9 | `PLANS.md` | Scope levels (PoC/MVP/Production), exit criteria, ADR index |

---

## 3. Decisions

### Confirmed (2026-03-22 scope revision)

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| 1 | v0.9 scope | Batches 1-5 only (CI/CD deferred) | Ship security/quality fixes first |
| 2 | v0.9 deploy | Manual deploy (last one) | CI/CD not ready yet |
| 3 | F-14 priority | P0 for MVP+ | Vision MVP deliverable #3, used in 4/10 use cases |
| 4 | Multi-farm timing | **MVP+ (revised)** | Evaluation scenario requires demo farm + user farm + switching |
| 5 | MVP+ user model | **3 users, 2 farms, 3 roles** | Admin (Muk) + Manager (Kiku) + Observer (Yama); see `docs/USE-CASES.md` §7 |
| 6 | Real AI chat | PRODUCTION-1 (SSM key fetch) | Stub mode fine for April; needs budget decision |
| 7 | Shared farm access model | **Role-based membership** (FARM_MEMBER records) | Admin-managed for MVP+; invite/apply workflow deferred to PROD-1 |
| 8 | FR-3.6 side-by-side | **MVP+ (Phase D)** | Include if time allows |
| 9 | SSE streaming | **PROD-1** | Chat works without it (stub mode until SSM fetch) |
| 10 | Bed-grid layout | **MVP+ — replaces freeform plot wizard** | Rows × cols (5 max each) is more intuitive; crop tied to bed |
| 11 | IoT device web config | **PROD-1** | Camera configured locally for April; web UI deferred |
| 12 | Demo farm seed | **MVP+** | Pre-seeded data for onboarding new users |

### No Pending Decisions

---

## 4. MVP+ Scope Summary (28 items, ~22-26h)

> Revised 2026-03-22 — expanded from 18 items after evaluation scenario review.
> Estimate revised upward after ultrathink alignment review (middleware refactor, test updates, doc updates).
> See `docs/MVP-PLUS-SCENARIO.md` and `docs/USE-CASES.md` §7 for the scenario driving these changes.
> See `docs/REVIEW-FOR-MVP-PLUS-BY-ULTRATHINK.md` for deep alignment review, pros/cons, tech feasibility.

```
 PHASE A — CI/CD Foundation (~1h)
   CI-1..CI-4: Pipeline setup

 PHASE B — Multi-Farm Foundation (~5-7h)  ← NEW (pulled from PROD-1)
   N1-ADR: ADR for multi-farm support
   N1-BE:  DynamoDB schema — SK=FARM#<farmId>, FARM_MEMBER records
   N1-API: GET /farms returns Farm[], POST /farms creates farm
   N1-FE:  Farm switcher + farm context provider
   N1-MIG: Dual SK format support (no data migration)
   ROLE:   Role model (admin / manager / observer) via membership
   DEMO:   Demo farm seed data for onboarding

 PHASE C — Vision Closure (~4h)
   F-14:   Time-lapse playback           ← THE missing Vision deliverable
   FR-3.5: Image lightbox
   SF-4:   Chat Markdown rendering

 PHASE D — UX Restructure (~5-6h)  ← EXPANDED
   F-09:   Map picker for farm location (integrated into farm creation wizard)
   F-10:   Elevation auto-fetch
   BED:    Bed-grid layout (rows × cols, 5 max) — replaces freeform plot wizard
   CROP:   Crop-per-bed model
   PROF:   Profile page redesign (farm list + switch + member list)

 PHASE E — Security Hardening (~2-3h)
   S3, S4, S6: Security SHOULD-FIX (3 items)
   S10: RemovalPolicy RETAIN

 PHASE F — Quality (~3-4h)
   Q6, SG-3, Q12: Code fixes
   T8-T9: Schema tests
   FR-3.6: Side-by-side (if time)
```

### Vision Alignment After MVP+

```
Vision MVP deliverables:
1. Farm layout creation/editing    ✅ Done (bed-grid replaces freeform wizard)
2. Camera nodes uploading images   ✅ Done (simulator + phone + bed association)
3. Time-lapse growth per plot      ← MVP+ closes this gap (F-14, Phase C)
4. Manual observation and tagging  ✅ Done
```

---

## 5. Tech Stack (current — check for updates)

| Layer | Current | Notes |
|-------|---------|-------|
| Frontend | Astro 5.x + Preact | SSG, island hydration |
| API | Hono on Lambda | Single deployment, 11+ endpoints |
| Auth | Cognito User Pools | JWT, 10K MAU free tier |
| Database | DynamoDB (single-table) | PK/SK + GSI1 + GSI2 |
| Storage | S3 (3 buckets) | images, static, thumbnails |
| CDN | CloudFront | HTTPS, SPA fallback |
| IaC | CDK v2 (TypeScript) | 46 resources |
| AI | Anthropic SDK | Haiku model, stub mode until SSM key |
| Schemas | Zod (@litcrop/shared) | 17 schemas, contract tests |

**Potential updates to consider for MVP+:**
- Astro or Preact version bumps
- CDK deprecation warnings (alpha API Gateway constructs)
- Node.js runtime (Lambda currently on Node 20; v24 available but unsupported by CDK)
- New Preact features for time-lapse animation (requestAnimationFrame vs setInterval)

---

## 6. Pipeline Instructions

When starting a new session for MVP+ work, follow this sequence:

### Step 1: Digest Context
```
Read docs/MVP-PLUS-READINESS.md (this file)
```
Understand current state, what's deployed, what decisions are made, what's pending.

### Step 2: Review & Extend Use Cases
```
Read docs/USE-CASES.md
```
- Are the 5 personas still accurate?
- Any new use cases discovered from user feedback or field planning?
- Update `docs/USE-CASES.md` with additions using the provided templates
- Resolve the shared farm access decision (Section 5, Option A/B/C/D)

### Step 3: Refine Scope & Design
```
Read docs/MVP-PLUS-REVISE-PLAN.md
Read docs/MVP-PLUS-ALL-ITEMS.md
```
- Confirm or adjust the 18 MVP+ items and their phase assignments
- Check for tech stack updates (dependency versions, new patterns)
- Identify any architecture or system design changes needed:
  - Does `docs/ARCHITECTURE.md` need updates for new endpoints (e.g., time-lapse API)?
  - Does `docs/SYSTEM-DESIGN.md` need new sequence diagrams?
  - Any new ADRs needed? (time-lapse approach, shared farm access, map picker library)
- Consider UX design needs:
  - Time-lapse player component design
  - Map picker integration (Leaflet? Mapbox? OpenStreetMap?)
  - Lightbox component (existing library vs custom?)
  - Chat Markdown renderer (marked? remark? custom?)
- Update plan documents with refinements

### Step 4: Preview & Align
```
Present consolidated execution preview to user
```
- Show updated phase plan with any changes from Steps 2-3
- Highlight new decisions that need user input
- Confirm April field evaluation readiness criteria
- Get go/no-go for implementation

### After Alignment: Execute
```
/cc-design  → Architecture + UX for new components (F-14, F-09, SF-4)
/cc-test    → Test strategy for MVP+ additions
/cc-implement → Build in batches (same pattern as v0.9)
/cc-review  → Review each batch
/cc-deploy  → Deploy through CI/CD (after Phase A sets it up)
```

---

## 7. April Field Evaluation Readiness Criteria

| Criterion | Source | Status |
|-----------|--------|--------|
| 3 user accounts created (A/B/C roles) | USE-CASES.md §7 | Planned |
| Demo farm pre-seeded with sample data | MVP-PLUS-SCENARIO §Step 1 | **NOT DONE** — MVP+ Phase B |
| B can create own farm via wizard + map | MVP-PLUS-SCENARIO §Step 2 | **NOT DONE** — MVP+ Phase B+D |
| Farm switching works (Demo ↔ user farm) | MVP-PLUS-SCENARIO §Step 2 | **NOT DONE** — MVP+ Phase B |
| Bed-grid layout creation (5×5 max) | MVP-PLUS-SCENARIO §Step 3 | **NOT DONE** — MVP+ Phase D |
| Camera images associate to beds | MVP-PLUS-SCENARIO §Step 4 | Partially (simulator exists) |
| Admin-managed farm membership (A adds C) | MVP-PLUS-SCENARIO §Step 5 | **NOT DONE** — MVP+ Phase B |
| Time-lapse playback working | Vision.md MVP #3 | **NOT DONE** — MVP+ Phase C |
| 1-2 camera nodes uploading images | Vision.md | Camera sim running; real Pi TBD |
| Weather + crop impact functional | REQUIREMENTS FR-7 | Done |
| AI chat responsive (stub or live) | REQUIREMENTS FR-9 | Done (stub) |
| Japanese UI complete (no English leaks) | REQUIREMENTS NFR-6 | Done (v0.9 N3 fix) |
| Mobile UX usable outdoors | REQUIREMENTS NFR-3 | Done |
| Desktop layout for advisor | REQUIREMENTS FR-12 | Done |
| CI/CD pipeline operational | MVP-POST-PLAN | **NOT DONE** — MVP+ Phase A |
| Profile page shows farm list + switch | MVP-PLUS-SCENARIO §Step 2 | **NOT DONE** — MVP+ Phase D |

---

## 8. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Camera node not ready for April | Medium | High | Use phone upload (UC-06) as fallback; camera sim for demos |
| Time-lapse UX unclear without real data | Medium | Medium | Pre-seed 14 days of images from simulator before evaluation |
| Shared access breaks ownership model | Low | Medium | Option D is minimal change; test with 2 users first |
| Map picker adds JS bundle weight | Low | Low | Lazy-load map component; only loads on setup page |
| April weather delays planting | Low | Medium | Extend evaluation to May if needed; climate data still works |

---

> Generated 2026-03-21 | Updated 2026-03-22 (scope revision: +multi-farm, +bed-grid, +roles, +demo seed)
> Entry point for MVP+ pipeline. Resume here. Read this file first. Follow Steps 1-4.

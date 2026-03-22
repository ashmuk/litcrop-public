# MVP-PLUS-READINESS.md — Context & Entry Point for MVP+ Pipeline

> Date: 2026-03-21 | Updated: 2026-03-22 (ALL PHASES COMPLETE)
> Status: **MVP+ COMPLETE** — all 6 phases done, ready for deploy
> Latest: v0.14 on develop (Phase E+F), v0.13 on main (Phase C+D merged)
> Next: PR develop → main for E+F, tag v0.14, deploy

---

## Purpose

This document is the **entry point** for resuming work on LitCrop. Read this first to understand where the project stands, what decisions have been made, and what needs to happen next.

---

## 1. Current State

### Latest (v0.13 on develop, pending push + PR to main)

| Item | Value |
|------|-------|
| Frontend | https://dpj8a3mk3tzkq.cloudfront.net (v0.9 deployed; v0.13 not yet deployed) |
| API | https://jpg5gd81uc.execute-api.ap-northeast-1.amazonaws.com/ |
| Branch | develop at `ec4c8cb` (4 commits ahead of origin/main) |
| Tag | v0.13 (on main); v0.14 pending |
| Tests | 321/321 pass (19 test files) |
| GH Issues | 1 open (#90 — PROD-1) | 115 closed total |
| AWS Resources | 46 (CDK-managed LitCropStack) |
| Cost | ~$0.01-1.18/month |

### Phase Progress

| Phase | Status | Version | Key Deliverable |
|-------|--------|---------|-----------------|
| A — CI/CD Foundation | **DONE** | v0.10 | pr-checks.yml + deploy.yml, OIDC, 4 parallel jobs |
| B — Multi-Farm Foundation | **DONE** | v0.11 | FARM_MEMBER records, roles, farm switching, demo seed |
| C — Vision Closure | **DONE** | v0.12 | Time-lapse (30fps weekly), lightbox, chat markdown |
| D — UX Restructure | **DONE** | v0.13 | Farm→Bed flattening, map picker, bed-grid, profile |
| E — Security Hardening | **DONE** | v0.14 | S10 RemovalPolicy RETAIN (S3/S4/S6 already done) |
| F — Quality | **DONE** | v0.14 | Q6 503→404, Q12 timezone, T8-T9 schema tests (+34) |

### What's NOT Done (MVP+ scope complete — these are PROD-1+)

- Side-by-side comparison FR-3.6 (deferred P2 — Phase F)
- Settings cross-device sync #90 (PROD-1)
- 13 other Production-scope features
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
| 5 | `docs/decisions/ADR-20260322-phase-d-bed-grid-data-model.md` | Farm→Bed flattening decision |
| 6 | `docs/CAMERA-NODE-SETUP.md` | Step-by-step Pi camera setup guide |
| 7 | `docs/designs/PHASE-D-ARCHITECTURE.md` | Phase D API contracts, DDB patterns |
| 7 | `Vision.md` | Original product vision — 4 MVP deliverables, long-term direction |
| 8 | `REQUIREMENTS.md` | FR-1 through FR-14, NFR-1 through NFR-8 |
| 9 | `docs/ARCHITECTURE.md` | System architecture, API endpoints, tech stack |
| 10 | `docs/SYSTEM-DESIGN.md` | Sequence diagrams, data flows (§10 = Phase D) |
| 11 | `PLANS.md` | Scope levels (PoC/MVP/Production), exit criteria, ADR index |

---

## 3. Decisions

### Confirmed (2026-03-22 scope revision + Phase D)

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| 1 | v0.9 scope | Batches 1-5 only (CI/CD deferred) | Ship security/quality fixes first |
| 2 | v0.9 deploy | Manual deploy (last one) | CI/CD not ready yet |
| 3 | F-14 priority | P0 for MVP+ | Vision MVP deliverable #3, used in 4/10 use cases |
| 4 | Multi-farm timing | **MVP+ (revised)** | Evaluation scenario requires demo farm + user farm + switching |
| 5 | MVP+ user model | **3 users, 2 farms, 3 roles** | Admin (Muk) + Manager (Kiku) + Observer (Yama); see `docs/USE-CASES.md` §7 |
| 6 | Real AI chat | PRODUCTION-1 (SSM key fetch) | Stub mode fine for April; needs budget decision |
| 7 | Shared farm access model | **Role-based membership** (FARM_MEMBER records) | Admin-managed for MVP+; invite/apply workflow deferred to PROD-1 |
| 8 | FR-3.6 side-by-side | **MVP+ (Phase F)** | Include if time allows |
| 9 | SSE streaming | **PROD-1** | Chat works without it (stub mode until SSM fetch) |
| 10 | Bed-grid layout | **MVP+ — replaces freeform plot wizard** | Rows × cols (5 max each) is more intuitive; crop tied to bed |
| 11 | IoT device web config | **PROD-1** | Camera configured locally for April; web UI deferred |
| 12 | Demo farm seed | **MVP+** | Pre-seeded data for onboarding new users |
| 13 | **Data model flattening** | **Farm→Bed (ADR-20260322 Option B)** | Remove Field + Plot. 2 DDB queries vs N+1. Matches user mental model. |
| 14 | **Map library** | **Leaflet (~40KB, BSD-2)** | Best size/feature balance. Free tiles. No API key. Lazy-loaded. |
| 15 | **Elevation API** | **Frontend direct (Open-Meteo)** | Free, CORS-enabled, one-time call, no proxy needed. |
| 16 | **BedStatus values** | **Keep 5 (not reduce to 4)** | TagValue depends on BedStatus. Changing would break tagging. |

### No Pending Decisions

---

## 4. MVP+ Scope Summary (28 items, ~22-26h)

> Revised 2026-03-22 — expanded from 18 items after evaluation scenario review.
> See `docs/MVP-PLUS-SCENARIO.md` and `docs/USE-CASES.md` §7 for the scenario driving these changes.
> See `docs/REVIEW-FOR-MVP-PLUS-BY-ULTRATHINK.md` for deep alignment review.

```
 PHASE A — CI/CD Foundation (~1h)                    ✅ DONE (v0.10)
   CI-1..CI-4: Pipeline setup

 PHASE B — Multi-Farm Foundation (~5-7h)             ✅ DONE (v0.11)
   N1-ADR/BE/API/FE/MIG + ROLE + DEMO

 PHASE C — Vision Closure (~4h → ~6h actual)         ✅ DONE (v0.12)
   F-14: Time-lapse, FR-3.5: Lightbox, SF-4: Chat markdown

 PHASE D — UX Restructure (~5-6h → ~7h actual)      ✅ DONE (v0.13)
   ADR: Farm→Bed flattening (remove Field/Plot)
   F-09: Map picker (Leaflet, lazy-loaded, farm wizard)
   F-10: Elevation auto-fetch (Open-Meteo)
   BED:  Bed-grid layout (rows × cols, 5 max)
   CROP: Crop-per-bed model
   PROF: Profile page redesign (farm list + switch + settings)

 PHASE E — Security Hardening (~1h actual)             ✅ DONE (v0.14)
   S3/S4/S6: Already done in prior phases
   S10: RemovalPolicy RETAIN for DDB + S3

 PHASE F — Quality (~1h actual)                        ✅ DONE (v0.14)
   Q6: assertImageOwnership 503→404
   Q12: Timezone utility (longitude-based)
   T8-T9: 34 new Zod schema tests
   SG-3: Already fixed in Phase D
   FR-3.6: Side-by-side deferred (P2)
```

### Vision Alignment After MVP+

```
Vision MVP deliverables:
1. Farm layout creation/editing    ✅ Done (bed-grid in Phase D — rows × cols)
2. Camera nodes uploading images   ✅ Done (simulator + phone + bed association)
3. Time-lapse growth per plot      ✅ Done (Phase C — weekly compilation, 30fps)
4. Manual observation and tagging  ✅ Done
```

All 4 Vision MVP deliverables are implemented.

---

## 5. Tech Stack (current)

| Layer | Current | Notes |
|-------|---------|-------|
| Frontend | Astro 5.x + Preact | SSG, island hydration |
| Map | Leaflet 1.9.x | Lazy-loaded in FarmWizard only |
| API | Hono on Lambda | Single deployment, 13+ endpoints (beds replace plots) |
| Auth | Cognito User Pools | JWT, 10K MAU free tier |
| Database | DynamoDB (single-table) | PK/SK + GSI1 + GSI2, Farm→Bed model |
| Storage | S3 (3 buckets) | images, static, thumbnails |
| CDN | CloudFront | HTTPS, SPA fallback |
| IaC | CDK v2 (TypeScript) | 46 resources |
| AI | Anthropic SDK | Haiku model, stub mode until SSM key |
| Schemas | Zod (@litcrop/shared) | 20+ schemas, contract tests, 34 standalone schema tests |
| Timezone | Shared utility | Longitude-based UTC offset approximation |

---

## 6. Pipeline Instructions

When starting a new session for MVP+ work, follow this sequence:

### MVP+ Complete — Deploy Sequence
```
1. /cc-pr-create → PR develop → main (Phase E+F + final remediation)
2. /cc-pr-merge → merge after CI passes
3. /cc-tag-create → tag v0.14
4. /cc-deploy → deploy via CI/CD pipeline
5. Create 3 Cognito user accounts (A/B/C roles)
6. Configure camera simulator with bed IDs
```

### Starting PROD-1 (future session)
```
1. Read this file (context + state)
2. Review docs/MVP-PLUS-REVISE-PLAN.md §PRODUCTION-1
3. /cc-design → architecture for PROD-1 scope
4. /cc-implement → build in batches
```

---

## 7. April Field Evaluation Readiness Criteria

| Criterion | Source | Status |
|-----------|--------|--------|
| 3 user accounts created (A/B/C roles) | USE-CASES.md §7 | Planned (post-deploy) |
| Demo farm pre-seeded with sample data | MVP-PLUS-SCENARIO §Step 1 | ✅ Done (v0.11, updated v0.13) |
| B can create own farm via wizard + map | MVP-PLUS-SCENARIO §Step 2 | ✅ Done (v0.13 — FarmWizard + MapPicker) |
| Farm switching works (Demo ↔ user farm) | MVP-PLUS-SCENARIO §Step 2 | ✅ Done (v0.11 FarmSwitcher + v0.13 ProfilePage) |
| Bed-grid layout creation (5×5 max) | MVP-PLUS-SCENARIO §Step 3 | ✅ Done (v0.13 — BedGridLayout + CropAssignment) |
| Camera images associate to beds | MVP-PLUS-SCENARIO §Step 4 | ✅ Done (v0.13 — POST /beds/:bedId/images, simulator + Pi capture script) |
| Admin-managed farm membership (A adds C) | MVP-PLUS-SCENARIO §Step 5 | ✅ Done (v0.11 POST /farms/:id/members) |
| Time-lapse playback working | Vision.md MVP #3 | ✅ Done (v0.12 — weekly 30fps player) |
| 1-2 camera nodes uploading images | Vision.md | Camera sim running; real Pi TBD |
| Weather + crop impact functional | REQUIREMENTS FR-7 | ✅ Done |
| AI chat responsive (stub or live) | REQUIREMENTS FR-9 | ✅ Done (stub + markdown rendering v0.12) |
| Japanese UI complete (no English leaks) | REQUIREMENTS NFR-6 | ✅ Done (v0.9 N3 fix) |
| Mobile UX usable outdoors | REQUIREMENTS NFR-3 | ✅ Done |
| Desktop layout for advisor | REQUIREMENTS FR-12 | ✅ Done |
| CI/CD pipeline operational | MVP-POST-PLAN | ✅ Done (v0.10 Phase A) |
| Profile page shows farm list + switch | MVP-PLUS-SCENARIO §Step 2 | ✅ Done (v0.13 ProfilePage) |

**14/16 criteria met.** Remaining 2 are operational (post-deploy): user account creation and real Pi camera node.

---

## 8. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Camera node not ready for April | Medium | High | Use phone upload (UC-06) as fallback; camera sim for demos |
| Time-lapse UX unclear without real data | Medium | Medium | Pre-seed 14 days of images from simulator before evaluation |
| Leaflet CSS from CDN (unpkg) | Low | Low | Bundle locally in PROD-1; acceptable for MVP+ |
| April weather delays planting | Low | Medium | Extend evaluation to May if needed; climate data still works |

---

## 9. Next Step: Deploy + Field Evaluation

**Status**: All 6 phases complete. 14/16 readiness criteria met. Code ready.

**Remaining operational steps**:
1. Deploy via CI/CD (`deploy.yml` on push to main)
2. Create 3 Cognito user accounts: Muk (admin), Kiku (manager), Yama (observer)
3. Set up Pi camera node: follow `docs/CAMERA-NODE-SETUP.md`
4. Configure camera simulator: `--bed <bedId>` for target bed
5. Pre-seed 14 days of simulator images for time-lapse demo

**After deploy**: Begin April field evaluation per `docs/MVP-PLUS-SCENARIO.md`.

**Future work**: PROD-1 scope (#90 settings sync, invite workflow, IoT UI, SSE streaming) — see `docs/MVP-PLUS-REVISE-PLAN.md` §PRODUCTION-1.

---

> Generated 2026-03-21 | Updated 2026-03-22 (ALL PHASES COMPLETE)
> MVP+ scope: DONE. All 28 items across 6 phases delivered.
> Entry point for MVP+ pipeline. Resume here. Read this file first.

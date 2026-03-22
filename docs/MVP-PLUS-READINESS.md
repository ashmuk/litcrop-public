# MVP-PLUS-READINESS.md — Context & Entry Point for MVP+ Pipeline

> Date: 2026-03-21 | Updated: 2026-03-22 (Phase D complete)
> Status: Phase D COMPLETE — Phase E next
> Predecessor: v0.12 (Phase C), now v0.13 on develop (Phase D)
> Next: `/cc-push` → Phase E (security) or Phase F (quality)

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
| Branch | develop at `7c45077` (9 commits ahead of origin/develop) |
| Tag | v0.11 (latest on main); v0.13 pending |
| Tests | 287/287 pass (18 test files) |
| GH Issues | 3 open (#90, #121, #122) | 113 closed total |
| AWS Resources | 46 (CDK-managed LitCropStack) |
| Cost | ~$0.01-1.18/month |

### Phase Progress

| Phase | Status | Version | Key Deliverable |
|-------|--------|---------|-----------------|
| A — CI/CD Foundation | **DONE** | v0.10 | pr-checks.yml + deploy.yml, OIDC, 4 parallel jobs |
| B — Multi-Farm Foundation | **DONE** | v0.11 | FARM_MEMBER records, roles, farm switching, demo seed |
| C — Vision Closure | **DONE** | v0.12 | Time-lapse (30fps weekly), lightbox, chat markdown |
| D — UX Restructure | **DONE** | v0.13 | Farm→Bed flattening, map picker, bed-grid, profile |
| E — Security Hardening | **NEXT** | — | S3/S4/S6/S10 |
| F — Quality | TODO | — | Q6/SG-3/Q12/T8-T9/FR-3.6 |

### What's NOT Done

- Security hardening: S3/S4/S6/S10 (Phase E — #121)
- Quality fixes: Q6/SG-3/Q12/T8-T9 (Phase F — #122)
- Side-by-side comparison FR-3.6 (Phase F, if time)
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
| 5 | `docs/decisions/ADR-20260322-phase-d-bed-grid-data-model.md` | Farm→Bed flattening decision |
| 6 | `docs/designs/PHASE-D-ARCHITECTURE.md` | Phase D API contracts, DDB patterns |
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

 PHASE E — Security Hardening (~2-3h)  ← NEXT
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
| Schemas | Zod (@litcrop/shared) | 20+ schemas, contract tests |

---

## 6. Pipeline Instructions

When starting a new session for MVP+ work, follow this sequence:

### For Phase E/F (remaining work)
```
1. Read this file (context + state)
2. Read the relevant issue (#121 for Phase E, #122 for Phase F)
3. /cc-implement → build fixes
4. /simplify → code quality pass
5. /cc-review → validate
6. /cc-remediate → fix findings (if any)
7. /cc-commit → commit
8. /cc-push → push to origin
```

### After Phase F: Merge + Deploy
```
1. /cc-pr-create → PR develop → main (Phase C+D+E+F combined)
2. /cc-pr-merge → merge after CI passes
3. /cc-tag-create → tag v0.13
4. /cc-deploy → deploy via CI/CD pipeline
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
| Camera images associate to beds | MVP-PLUS-SCENARIO §Step 4 | ✅ Done (v0.13 — POST /beds/:bedId/images) |
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

## 9. Next Step: Phase E — Security Hardening

**Status**: Ready to start. Phases A+B+C+D complete. 14/16 readiness criteria met.

**Phase E scope** (4 items, ~2-3h):
- **S3**: Auth middleware on `/beds` and `/images` root paths
- **S4**: Validate pagination cursor PK
- **S6**: Sanitize user input in chat stub (XSS)
- **S10**: RemovalPolicy RETAIN for prod DynamoDB + S3

**Issue**: #121

**Pipeline**: `/cc-implement` → `/simplify` → `/cc-review` → `/cc-remediate`

**Working constraints**: Work solo, always ask before /simplify, run /cc-review after implementation.

---

> Generated 2026-03-21 | Updated 2026-03-22 (Phase D complete, Phase E next)
> Entry point for MVP+ pipeline. Resume here. Read this file first.

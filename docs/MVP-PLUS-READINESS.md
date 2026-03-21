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

## 3. Decisions Already Made

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| 1 | v0.9 scope | Batches 1-5 only (CI/CD deferred) | Ship security/quality fixes first |
| 2 | v0.9 deploy | Manual deploy (last one) | CI/CD not ready yet |
| 3 | F-14 priority | P0 for MVP+ | Vision MVP deliverable #3, used in 4/10 use cases |
| 4 | Multi-farm timing | PRODUCTION-1 (not MVP+) | April evaluation is single-farm |
| 5 | MVP+ user model | 5 users on 1 farm | Shared access, ownership decision pending (see Section 4) |
| 6 | Real AI chat | PRODUCTION-1 (SSM key fetch) | Stub mode fine for April; needs budget decision |

### Decisions Pending (need user input)

| # | Decision | Options | Recommended | Where |
|---|----------|---------|-------------|-------|
| 7 | Shared farm access model | A: shared creds / B: member records / C: full N1 / **D: relax GET ownership** | D | `docs/USE-CASES.md` §5 |
| 8 | FR-3.6 side-by-side | MVP+ (if time) vs PROD-1 | MVP+ if time | `docs/MVP-PLUS-REVISE-PLAN.md` §7 |
| 9 | SSE streaming | MVP+ vs PROD-1 | PROD-1 | `docs/MVP-PLUS-REVISE-PLAN.md` §7 |

---

## 4. MVP+ Scope Summary (18 items, ~12-14h)

```
 PHASE A — CI/CD Foundation (~1h)
   CI-1..CI-4: Pipeline setup

 PHASE B — Vision Closure (~4h)
   F-14: Time-lapse playback          ← THE missing Vision deliverable
   FR-3.5: Image lightbox
   SF-4: Chat Markdown rendering

 PHASE C — UX + Security (~4h)
   F-09: Map picker for farm location
   F-10: Elevation auto-fetch
   S3, S4, S6: Security SHOULD-FIX (3 items)
   S10: RemovalPolicy RETAIN

 PHASE D — Quality (~3h)
   Q6, SG-3, Q12: Code fixes
   T8-T9: Schema tests
   FR-3.6: Side-by-side (if time)
```

### Vision Alignment After MVP+

```
Vision MVP deliverables:
1. Farm layout creation/editing    ✅ Done (creation; editing read-only by design)
2. Camera nodes uploading images   ✅ Done (simulator + phone)
3. Time-lapse growth per plot      ← MVP+ closes this gap (F-14)
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
| 5 user accounts created (Cognito) | USE-CASES.md | Planned |
| 1 farm with 8+ beds, 20+ plots | USE-CASES.md | Partially seeded |
| 1-2 camera nodes uploading images | Vision.md | Camera sim running; real Pi TBD |
| Time-lapse playback working | Vision.md MVP #3 | **NOT DONE** — MVP+ Phase B |
| Weather + crop impact functional | REQUIREMENTS FR-7 | Done |
| AI chat responsive (stub or live) | REQUIREMENTS FR-9 | Done (stub) |
| Japanese UI complete (no English leaks) | REQUIREMENTS NFR-6 | Done (v0.9 N3 fix) |
| Mobile UX usable outdoors | REQUIREMENTS NFR-3 | Done |
| Desktop layout for advisor (P-04) | REQUIREMENTS FR-12 | Done |
| CI/CD pipeline operational | MVP-POST-PLAN | **NOT DONE** — MVP+ Phase A |
| Shared farm access for 5 users | USE-CASES.md §5 | **DECISION PENDING** |

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

> Generated 2026-03-21 | Entry point for MVP+ pipeline
> Resume here. Read this file first. Follow Steps 1-4.

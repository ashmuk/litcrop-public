# MVP Readiness — Pre-Start Checklist & Pipeline Guide

> Date: 2026-03-19
> Source: PoC Retrospective (`REPORT_POC.md`), Pipeline ADR (`ADR-20260319-pipeline-improvements-mvp.md`)
> Purpose: Everything that must be aligned, prepared, or refactored **before** running `/cc-define` at MVP scope

---

## Part 1: Alignment & Preparation

These items must be completed before starting MVP implementation. They are ordered as a dependency chain — each gate unlocks the next.

### Gate 0: Close Out PoC (2 items remaining)

| # | Action | Effort | Why It Blocks |
|---|--------|--------|---------------|
| G0-1 | **Merge `develop` → `main`** | Trivial | Creates a clean `v1.0` baseline. MVP branches from `main` via `develop`. Without this, the PoC code lives only on `develop` — no stable reference point. |
| G0-2 | **Wire LLM API key to Lambda** | Trivial (env var + redeploy) | Chat endpoint runs in stub mode. Live demos need real responses. Also validates the API key → Lambda env var → Bedrock/external LLM path before ADR-009 builds on it. |

**Exit condition**: `main` branch has tag `v1.0`, chat endpoint returns live LLM responses.

### Gate 1: Architectural Decisions (3 ADRs)

These ADRs must be written and accepted before `/cc-define` because they change the system's shape — requirements and design depend on which options are chosen.

| ADR | Decision | Why Before `/cc-define` | Options to Evaluate |
|-----|----------|------------------------|---------------------|
| **ADR-007** | Authentication provider | Every MVP FR touches auth (multi-user, farm ownership, API protection). Requirements can't be written without knowing the auth model. | A: Cognito User Pools + JWT<br>B: Custom auth (bcrypt + JWT)<br>C: Third-party (Auth0, Clerk) |
| **ADR-008** | IaC tool | Deployment scripts, CI/CD pipeline design, and infrastructure requirements all depend on the IaC choice. | A: AWS CDK (TypeScript)<br>B: AWS SAM<br>C: SST (Ion)<br>D: Terraform |
| **ADR-009** | AI/LLM framework | FR-9 (chatbot) scope changes dramatically depending on whether the chat is single-turn API calls or an agentic framework with tool use. | A: Direct Bedrock API (current)<br>B: Bedrock + Strands Agent SDK<br>C: Mastra framework<br>D: LangChain/LangGraph |

**Exit condition**: Three ADR files in `docs/decisions/`, each with Status: Accepted.

**Recommended approach**: Run `/cc-design` (architecture step) with all three decisions scoped together — they interact (e.g., CDK vs SAM affects how auth resources are provisioned; Strands vs Mastra affects whether Bedrock is required).

### Gate 2: Contract Test Foundation

The retrospective's #1 code quality finding: field-name drift between `@litcrop/shared` types and actual API responses caused all 4 MUST-FIX bugs (MF-1..MF-4). Before MVP implementation starts, the contract test infrastructure must exist.

| Action | Effort | Details |
|--------|--------|---------|
| Add Zod schemas to `@litcrop/shared` | Medium (~2h) | Mirror existing TypeScript types as Zod schemas. These serve dual purpose: runtime validation in tests AND runtime validation in API routes (replacing `as` casts in `dynamodb.ts`). |
| Write 11 contract tests (one per endpoint) | Medium (~2h) | Each test hits the route via `hono/testing`, parses the response with the Zod schema. If the shape drifts, the test fails immediately. |
| Add `bed_id`/`field_id` to Image record (SF-4) | Small (~1h) | Denormalize at write time. Update `createImage`, seed data, and test fixtures. Prevents tag race condition in multi-user MVP. |

**Exit condition**: `npm test` includes contract tests, all 11 pass, SF-4 denormalization is in place.

**Why before `/cc-define`**: The contract tests establish the enforcement mechanism that the pipeline improvement ADR requires. Without them, per-phase contract test gates (Gate 5) have nothing to run.

---

## Part 2: Pipeline Refinement

The PoC pipeline was linear. The MVP pipeline adds gates at phase boundaries. These refinements must be understood and agreed upon before the first `/cc-implement` run.

### PoC Pipeline (what we did)

```
define → design(×6) → implement(all 39 tasks) → test → review
  → remediate → simplify → deploy → ad-hoc fixes
```

**Feedback loop**: ~9 hours (implement everything → review finds bugs)
**Cost**: ~$37.40 across 4 sessions

### MVP Pipeline (what we'll do)

```
define → design → [per-phase loop]:
  ┌─────────────────────────────────────────────┐
  │ implement(phase N)                          │
  │   → contract tests (gate — fail = fix now)  │
  │   → /simplify (cleanup before next layer)   │
  │   → commit                                  │
  └─────────────────────────────────────────────┘
→ test (full suite) → review → remediate
→ deploy
  → verify (checklist — not ad-hoc)
  → /cc-issue-create (any findings — issue-first)
  → [fix loop]: issue → Sonnet agent → Opus review → merge
```

### Five Specific Changes

| # | Change | PoC Behavior | MVP Behavior | Ref |
|---|--------|-------------|-------------|-----|
| 1 | **Per-phase `/simplify`** | Ran once at end (21k lines) | Run after each phase boundary (~3-5k lines each) | ADR §1 |
| 2 | **Issue-first rule** | Feedback doc was primary tracker; issues created after fixes | GitHub Issue created at moment of discovery, before fix-or-defer decision | ADR §2 |
| 3 | **Contract test gates** | No contract tests during implementation; review caught drift | Contract tests run after each phase commit; fail = fix before proceeding | ADR §3 |
| 4 | **Deploy verification checklist** | Ad-hoc testing; missed tag endpoint and JA locale | Structured checklist covering all endpoints, both locales, mobile width | ADR §4 |
| 5 | **Sonnet delegation for size:S** | Opus did all 6 post-deploy fixes ($9) | Opus creates issue + AC; Sonnet implements; Opus reviews ($3-4) | ADR §5 |

**Full details**: See `docs/decisions/ADR-20260319-pipeline-improvements-mvp.md`

### Deploy Verification Checklist Template

To be output by `/cc-deploy` and executed before deploy is considered complete:

```markdown
## Deploy Verification — [version]

### API (curl or automated)
- [ ] Each endpoint returns expected status code + response shape
- [ ] Auth-protected endpoints reject unauthenticated requests (MVP)
- [ ] Error responses match error catalog format

### Frontend (per locale: EN, JA)
- [ ] Every page loads without console errors
- [ ] i18n: no hardcoded English visible in JA mode
- [ ] Mobile (375px): no overflow, clipping, or layout shift
- [ ] Desktop (1024px+): responsive layout renders correctly (MVP)

### Cross-Cutting
- [ ] Settings (theme/locale/temp-unit) persist across navigation
- [ ] Farm name appears in page titles
- [ ] Weather conditions display as human-readable text
```

---

## Part 3: Upstream Definition Refactoring

The PoC produced 8 definition documents (~6,300 lines total). Before running `/cc-define` at MVP scope, each document needs a readiness assessment: can it be incrementally updated, or does it need a rewrite?

### Assessment Summary

| Document | Lines | Strategy | Effort | When |
|----------|-------|----------|--------|------|
| **PLANS.md** | 84 | **In-place update** | Small | Gate 1 (after ADRs) |
| **PROJECT.yaml** | 20 | **Minimal update** | Trivial | Gate 0 (with merge) |
| **REQUIREMENTS.md** | 420 | **Incremental expansion** | Medium | During `/cc-define` |
| **ARCHITECTURE.md** | 540 | **Incremental expansion** | Medium | During `/cc-design` |
| **API-CONTRACTS.md** | 1,387 | **Incremental expansion** | Medium | During `/cc-design` |
| **UX-DESIGNS.md** | 1,423 | **Incremental expansion** | Medium | During `/cc-design` |
| **SYSTEM-DESIGN.md** | 1,896 | **Targeted additions** | Medium-Large | During `/cc-design` |
| **EXECUTION-PLAN.md** | 528 | **Full rewrite** | Large | After `/cc-design` |

### Documents That Need Pre-Work (before `/cc-define`)

#### PLANS.md — Update Scope Level

```diff
- Current Scope Level: PoC
+ Current Scope Level: MVP
```

Update objectives, deliverables, exit criteria, and scope exclusions to reflect MVP. This is the strategic framing document that `/cc-define` reads first — if it still says "PoC", the define step will scope to PoC.

**Action**: Update after Gate 1 ADRs are accepted (they inform MVP scope exclusions).

#### PROJECT.yaml — Advance Stage

```diff
- current_stage: 5
+ current_stage: 6
```

Stage 5 = PoC Implementation. Stage 6 = Enhancement/MVP. This metadata controls which pipeline behaviors activate.

**Action**: Update when merging to `main` at Gate 0.

### Documents That `/cc-define` Will Update

These are well-structured for incremental expansion. The `/cc-define` step should read the existing PoC versions and add MVP-scoped requirements:

#### REQUIREMENTS.md (420 lines)
- **What's reusable**: All 54 FRs (PoC scope) remain valid. NFR-1..7 carry forward. Data model, API structure, constraints.
- **What changes**: New FR groups for auth (FR-11?), layout editor (FR-6 expansion), image processing (FR-12?). New NFRs for multi-user performance, CI/CD. Updated traceability table (Section 9) promoting "Deferred to MVP" items to "In Scope."
- **Risk if not updated**: `/cc-design` builds architecture on stale requirements. Auth and IaC are the biggest gap — 0 FRs exist for them currently.

#### API-CONTRACTS.md (1,387 lines)
- **What's reusable**: All 11 endpoint contracts. Error catalog. Pagination contract. Multipart upload spec.
- **What changes**: Auth headers (Bearer JWT) added to all endpoints. New auth endpoints (register, login, refresh). CORS update (`credentials: true`, custom domain origin). New image processing fields (`thumbnail_url`). Updated error catalog (401, 403 codes).
- **Risk if not updated**: Agents build routes without auth headers; same drift class as MF-1..MF-4.

### Documents That `/cc-design` Will Update

#### ARCHITECTURE.md (540 lines)
- **What's reusable**: DynamoDB design (9 access patterns validated), Lambda + API Gateway, Astro + Preact, Open-Meteo integration.
- **What changes**: Section 5 (Security) needs full auth architecture. Section 6 (Deployment) needs IaC. Section 8 (Scope Progression) — populate MVP column. New sections for image processing pipeline and monitoring.
- **Key decision**: Section 3's "AI Chatbot Architecture" has 4 options (A-D) — ADR-009 picks one, then this section gets rewritten for the chosen approach.

#### UX-DESIGNS.md (1,423 lines)
- **What's reusable**: Design tokens (colors, typography, spacing) — carry forward unchanged. 7 component specs. Accessibility checklist. Earthy theme tokens.
- **What changes**: New screens (login, registration, layout editor). Section 11 (Desktop Layout) promoted from "reference" to "implementation target." Farm Layout View updated from read-only to interactive editor.
- **Note**: Section 6 (API Design Details) partially duplicates API-CONTRACTS.md. Consider removing it at MVP to avoid maintaining two copies.

#### SYSTEM-DESIGN.md (1,896 lines — largest document)
- **What's reusable**: Error handling strategy, caching strategy patterns, frontend architecture (SSG+Islands), state management philosophy.
- **What changes**: New sequence diagrams for auth flows and image processing. Section 2 TypeScript types need auth-related additions. Module dependency graphs updated for new packages.
- **Risk**: This is the heaviest change surface. Section 2's TypeScript types are effectively a copy of `@litcrop/shared` — at MVP, consider whether this section should reference the package directly rather than duplicate types.

### Document That Needs Full Rewrite

#### EXECUTION-PLAN.md (528 lines)
- **Why rewrite**: Every line is PoC-specific — phase numbers, task IDs (T-INFRA-01, T-API-03), 11-day timeline, checkpoint criteria, risk mitigation tied to PoC tasks. Patching it would create confusion.
- **What to do**: After `/cc-design` produces the MVP architecture and task breakdown, generate a fresh `EXECUTION-PLAN.md` (or `MVP-EXECUTION-PLAN.md`) with new phases, tasks, and checkpoints.
- **What to preserve**: The risk register format (Section 6) is excellent — carry the structure forward with updated risks. The "Post-PoC" section (Section 9) becomes the seed for the new plan.

---

## Part 4: Execution Sequence

The complete pre-MVP sequence, ordered by dependency:

```
Phase A: Close Out PoC
  ├── G0-1: Merge develop → main (requires user approval)
  ├── G0-2: Tag v1.0
  ├── G0-2: Wire LLM API key to Lambda + redeploy
  └── Update PROJECT.yaml (current_stage: 6)

Phase B: Architectural Decisions
  ├── ADR-007: Authentication provider
  ├── ADR-008: IaC tool selection
  ├── ADR-009: AI/LLM framework
  └── Update PLANS.md (scope level: MVP, new objectives/criteria)

Phase C: Contract Test Foundation
  ├── Add Zod schemas to @litcrop/shared
  ├── Write 11 contract tests
  └── SF-4: Add bed_id to Image record

Phase D: MVP Definition (pipeline step)
  └── /cc-define — reads existing REQUIREMENTS.md + new ADRs
      → produces MVP REQUIREMENTS.md (incremental expansion)

Phase E: MVP Design (pipeline step)
  └── /cc-design — updates ARCHITECTURE, API-CONTRACTS, UX-DESIGNS,
      SYSTEM-DESIGN (incremental), generates new EXECUTION-PLAN (rewrite)

Phase F: MVP Implementation (pipeline step, with per-phase gates)
  └── /cc-implement — per-phase loop with contract tests + /simplify
```

### Critical Path

```
G0-1 (merge) ──→ Phase B (ADRs) ──→ Phase D (/cc-define) ──→ Phase E (/cc-design)
                                                                      │
G0-2 (LLM key) ──→ (unblocks live demos, ADR-009 evaluation)         │
                                                                      ↓
Phase C (contract tests) ─────────────────────────→ Phase F (/cc-implement)
```

Phase C (contract tests) can run in parallel with Phases B and D — it doesn't depend on ADR decisions. This is the recommended parallelization.

---

## Appendix: Open Questions for `/cc-define`

These surfaced from the retrospective but aren't yet answered. They should be resolved during the MVP `/cc-define` step:

| # | Question | Context | Impacts |
|---|----------|---------|---------|
| Q1 | What is the MVP auth scope? Registration + login only, or also password reset, email verification, social login? | ADR-007 picks the provider; this question scopes the feature set. | FR count, screen count, API endpoint count |
| Q2 | Is the layout editor in MVP scope? | PLANS.md defers it. REPORT_POC.md §11 recommends it. User feedback (F-12 fix) makes spatial view work, but editing is a separate feature. | Large FR group (FR-6 expansion), new UX screens, complex frontend state |
| Q3 | Image processing: thumbnails only, or also WebP conversion + compression? | REPORT_POC.md §11 lists "image processing pipeline." Thumbnails are the minimum; WebP and compression are optimization. | Lambda function design, S3 storage strategy, API response fields |
| Q4 | Custom domain at MVP or Production? | ARCHITECTURE.md §11 lists it. Requires ACM certificate + DNS. Nice-to-have for demos but not functional. | IaC scope, DNS management, CORS config |
| Q5 | CI/CD pipeline at MVP or Production? | REPORT_POC.md defers to Production, but ADR-008 (IaC) makes CI/CD natural to add. | GitHub Actions config, deployment automation, test-on-PR |
| Q6 | Should SYSTEM-DESIGN.md §2 (TypeScript types) be kept in sync manually, or generated from `@litcrop/shared`? | The 1,896-line document partially duplicates the shared package. At MVP scale, maintaining both is a drift risk. | Documentation maintenance cost |
| Q7 | UX-DESIGNS.md §6 (API Design Details) duplicates API-CONTRACTS.md — consolidate or keep? | 2 sources of truth for endpoint contracts. At PoC scale (11 endpoints) this was manageable; at MVP scale it won't be. | Documentation maintenance cost |

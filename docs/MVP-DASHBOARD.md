# MVP Pipeline Dashboard

> Last updated: 2026-03-20
> Stage: 6 (Enhancement) | Scope: PoC → MVP | Branch: develop

---

## Phase Status

### Phase A — Close Out PoC                                         ✓ DONE

| # | Action | Status | Notes |
|---|--------|--------|-------|
| G0-1 | Merge develop → main | ✓ Done | PR #62 merged |
| G0-2 | Tag v1.0 | — Skipped | Staying at v0.7 |
| G0-3 | Wire LLM API key | ◐ Partial | Local only, Lambda deferred to deploy |
| — | PROJECT.yaml stage 5 → 6 | ✓ Done | `db9a430` |
| — | Pipeline harness updated | ✓ Done | `21fa487` |

### Phase B — Architectural Decisions (3 ADRs)                      ○ NEXT

| ADR | Decision | Options | Status |
|-----|----------|---------|--------|
| ADR-007 | Authentication provider | Cognito / Custom / Auth0 | ○ Not started |
| ADR-008 | IaC tool selection | CDK / SAM / SST / Terraform | ○ Not started |
| ADR-009 | AI/LLM framework | Direct API / Strands / Mastra | ○ Not started |
| — | Update PLANS.md scope PoC → MVP | After ADRs accepted | ○ Not started |

> Recommended: single `/cc-design` session (all 3 interact)

### Phase C — Contract Test Foundation                         ○ PARALLEL

| Action | Effort | Status |
|--------|--------|--------|
| Add Zod schemas to `@litcrop/shared` | ~2h | ○ Not started |
| Write 11 contract tests (1 per endpoint) | ~2h | ○ Not started |
| SF-4: Denormalize `bed_id` into Image record | ~1h | ○ Not started |

> Can run in parallel with Phase B — no ADR dependency

### Phase D — MVP Definition                                  ○ BLOCKED → B

| Action | Details |
|--------|---------|
| `/cc-define` | Reads PLANS.md + ADRs → expands REQUIREMENTS.md (54 FRs + auth, IaC, layout editor) |
| Resolve open questions | Q1–Q7 (see below) |

### Phase E — MVP Design                                     ○ BLOCKED → D

| Action | Document | Strategy |
|--------|----------|----------|
| `/cc-design` | ARCHITECTURE.md | Incremental expansion |
| | API-CONTRACTS.md | Incremental expansion |
| | UX-DESIGNS.md | Incremental expansion |
| | SYSTEM-DESIGN.md | Incremental expansion |
| | EXECUTION-PLAN.md | Full rewrite |

### Phase F — MVP Implementation                            ○ BLOCKED → C+E

```
/cc-implement (per-phase loop with gates)
  ┌─ Phase N ─────────────────────────────┐
  │  implement → contract tests (gate)    │
  │  → /simplify → commit                 │  ← NEW in MVP pipeline
  └───────────────────────────────────────┘
→ /cc-test (full suite)
→ /cc-review → /cc-remediate
→ /cc-deploy → verify (checklist) → issue-first findings
```

---

## Critical Path

```
Phase A ──✓──→ Phase B ──→ Phase D ──→ Phase E ──→ Phase F
(done)         (NEXT)      (/define)   (/design)   (/implement)
                                                       ↑
Phase C ─────────── runs in parallel ──────────────────┘
```

---

## Open Questions (to resolve in Phase D)

| # | Question | Impacts |
|---|----------|---------|
| Q1 | MVP auth scope — login only, or +password reset, social? | FR count, screen count, API endpoint count |
| Q2 | Layout editor in MVP or deferred? | Large FR group, new UX screens, complex state |
| Q3 | Image processing — thumbnails only, or +WebP? | Lambda design, S3 strategy, API fields |
| Q4 | Custom domain at MVP or Production? | IaC scope, DNS, CORS config |
| Q5 | CI/CD pipeline at MVP or Production? | GitHub Actions, deploy automation |
| Q6 | SYSTEM-DESIGN types — manual sync or generate from shared? | Documentation maintenance cost |
| Q7 | UX-DESIGNS API section — consolidate with API-CONTRACTS? | Documentation maintenance cost |

---

## Existing Assets

| Category | Count | Details |
|----------|-------|---------|
| ADRs accepted | 8 | 001–006 (tech stack), 007 (IAM), pipeline improvements |
| ADRs needed | 3 | Auth, IaC, AI/LLM |
| PoC issues | 62 total | 0 open (all closed) |
| MVP issues | 0 | To be created during `/cc-define` or `/cc-implement` |
| Definition docs | 8 (~6,300 lines) | 7 reusable via incremental update, 1 full rewrite |

---

## Pipeline Improvements (wired into harness)

| # | Improvement | Skill | ADR § |
|---|------------|-------|-------|
| 1 | Per-phase `/simplify` | cc-implement (step 9) | §1 |
| 2 | Issue-first rule | cc-implement + cc-deploy | §2 |
| 3 | Contract test gates | cc-implement (step 8) | §3 |
| 4 | Structured deploy verification checklist | cc-deploy (Phase 4) | §4 |
| 5 | Sonnet delegation for size:S | cc-implement (step 4) + cc-deploy (Phase 5) | §5 |

> Ref: `docs/decisions/ADR-20260319-pipeline-improvements-mvp.md`

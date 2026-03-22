# Session Report: v0.10 — CI/CD Pipeline + MVP+ Scope Revision

> Date: 2026-03-22
> Tag: v0.10 (fbb6e02 on develop)
> Branch: develop → main (PR #123 merged)
> Commits: 7 since v0.9
> Tests: 288 (unchanged)
> Deploy: Not deployed (CI/CD pipeline wired but OIDC not yet configured)

---

## Pipeline Context

This session covered two tracks: **MVP+ scope revision** (evaluation scenario, use cases, decisions) and **CI/CD pipeline implementation** (Phase A of MVP+).

```
Pipeline:   Scope revision → Phase A implementation → CI debugging → PR merge
Previous:   v0.9 (deployed), security hardening + planning docs
Next:       Phase B (multi-farm foundation) via docs/MVP-PLUS-READINESS.md
```

---

## Session Timeline

| Phase | Activity |
|-------|----------|
| **Scope revision** | Formalized evaluation scenario from user's rough sketch (3 personas: Admin/Manager/Observer, 5 steps) |
| **Decisions** | Resolved all 3 pending decisions (D7: role-based membership, D8: FR-3.6 yes, D9: SSE deferred) |
| **Ultrathink review** | Deep alignment review vs Vision.md, REQUIREMENTS.md, ARCHITECTURE.md — pros/cons analysis |
| **Scope expansion** | 18 → 28 items, 4 → 6 phases, ~12-14h → ~22-26h. Multi-farm (N1) pulled from PROD-1. |
| **Team creation** | Created RITCROPPERS team (4 agents: architect, designer, builder, reviewer) |
| **Phase A design** | rc-architect designed CI/CD pipeline spec (OIDC, 4 parallel PR jobs, production gate) |
| **Phase A build** | rc-builder implemented pr-checks.yml + deploy.yml |
| **Phase A review** | rc-reviewer found 1 MUST-FIX (cdk-synth missing root npm ci) — fixed |
| **CI debugging** | 5 fix commits for: Node version mismatch, esbuild conflict, tsc incremental skip, parallel workspace builds, shared exports field |
| **Issue management** | Reopened #55, #56, #59. Created #117-#122. Labels: mvp-plus, v1.0 |
| **PR merge** | PR #123 merged to main. All 4 CI checks green. |
| **Tag** | v0.10 created and pushed |

---

## Artifacts Created

### Documents (6 new, 3 updated)
| Document | Type | Purpose |
|----------|------|---------|
| `docs/MVP-PLUS-SCENARIO.md` | New | 3-user evaluation scenario (formalized from user sketch) |
| `docs/REVIEW-FOR-MVP-PLUS-BY-ULTRATHINK.md` | New | Deep alignment review — pros/cons, technical feasibility |
| `docs/designs/CICD-PIPELINE-SPEC.md` | New | CI/CD architecture spec by rc-architect |
| `docs/USE-CASES.md` §7 | Updated | Added evaluation personas, 5-step walkthrough, scope decisions |
| `docs/MVP-PLUS-READINESS.md` | Updated | Decisions resolved, 6 phases (A-F), ~22-26h estimate |
| `docs/MVP-PLUS-REVISE-PLAN.md` | Updated | N1 moved to MVP+, tech stack review per phase |

### CI/CD Workflows (2 rewritten)
| File | Change |
|------|--------|
| `.github/workflows/pr-checks.yml` | 4 parallel jobs: Build, Test, Type Check, CDK Synth |
| `.github/workflows/deploy.yml` | OIDC auth + CDK deploy + S3 sync + CloudFront invalidation |

### GitHub Issues (9 managed)
| Issue | Action |
|-------|--------|
| #55 (F-09 map picker) | Reopened with MVP+ context |
| #56 (F-10 elevation) | Reopened with MVP+ context |
| #59 (F-14 time-lapse) | Reopened with MVP+ context |
| #117 (CI/CD pipeline) | Created + closed (done) |
| #118 (multi-farm) | Created |
| #119 (lightbox + markdown) | Created |
| #120 (bed-grid + profile) | Created |
| #121 (security hardening) | Created |
| #122 (quality fixes) | Created |

---

## CI Debugging Journey

CI exposed 5 pre-existing issues hidden by local development:

| Issue | Root Cause | Fix |
|-------|-----------|-----|
| npm install failure | Lockfile from npm 11 incompatible with npm 10 (Node 22) | Use Node 24 in CI |
| esbuild binary conflict | @preact/preset-vite pulled esbuild 0.21.5 alongside 0.27.4 | npm 11 lockfile resolves correctly |
| tsc --build skipped JS emit | Incremental cache on clean CI checkout | `--force` flag |
| Parallel workspace builds | shared dist/ not ready when frontend/api started | Sequential `&&` build order |
| Missing exports field | vite 7 resolver needs explicit exports for ESM | Added `exports` to shared package.json |
| typecheck script wrong | `--workspaces` is npm flag, not tsc flag | `npm run typecheck --workspaces --if-present` |

---

## Key Decisions Made

| # | Decision | Choice |
|---|----------|--------|
| D7 | Shared farm access model | Role-based membership (FARM_MEMBER records) |
| D8 | FR-3.6 side-by-side | Include in Phase F |
| D9 | SSE streaming | Defer to PROD-1 |
| D10 | Bed-grid layout | Replace freeform plot wizard (rows × cols, 5 max) |
| D11 | IoT device web config | Defer to PROD-1 (camera configured locally) |
| D12 | Demo farm seed | Include in MVP+ |

---

## Learnings

1. **Teams crash under pressure** — 4 agents + team-lead at 28%+ context causes message queue timeouts. Recommendation: work solo or limit to 2 agents.
2. **CI exposes hidden debt** — Every project that "works locally" has CI surprises. The 5 fix commits were all pre-existing issues, not new bugs.
3. **Lockfile version matters** — npm 11 and npm 10 produce different dependency trees. CI must match the dev environment's npm version.
4. **Sequential workspace builds** — `npm run build --workspaces` runs in parallel. For monorepos with cross-workspace dependencies, explicit `&&` ordering is essential.

---

> Generated 2026-03-22 | Phase A complete, CI/CD operational

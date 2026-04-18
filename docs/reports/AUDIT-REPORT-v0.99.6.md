# Cross-Domain Project Audit — v0.99.6 (2026-04-18)

> Prompt: `.agent/prompts/review/project_review_master_prompt.md`
> Reviewer: Principal Engineering Fellow (cc-opus-4-7)
> Scope: Full audit against the live production release `v0.99.6` (main @ `56d5f62`)

---

## Engagement Context

- **Project:** LitCrop — remote farm observation & diary web app
- **Type:** Static web app (Astro SSG + Preact islands) + Serverless API (Lambda + Hono) + CDK-provisioned AWS infra
- **Stack:** TypeScript, Astro 4, Preact 10, Hono, AWS Lambda, DynamoDB single-table, Cognito User Pool, CloudFront, S3, API Gateway HTTP API
- **Distribution:** SaaS via custom domain (litcrop.com) — not open-source distributed
- **Stage:** **Pilot RC** — 4 live pilot users on production; `PROJECT.yaml` stage 5 (Implementation & Deployment)
- **Review scope:** Delta-since-last-review (first full cross-domain audit since v0.29 AUDIT-REPORT)

---

## Executive Summary

- **Overall project health:** `GOOD`
- **Project stage alignment:** Quality is strong for pilot-RC; two legal/security gaps prevent moving to `GOOD` → `EXCELLENT` until addressed
- **Pipeline discipline:** `RIGOROUS` — 9-step pipeline honored, STOP gates respected, 29 ADRs recorded, 43 session reports archived
- **Cost posture:** `OPTIMIZED` — $1.18/mo against $5/mo ceiling (4.2× headroom)
- **Total findings:** 14 — 0 Critical · 3 High · 6 Medium · 5 Low
- **Top 3 risks requiring immediate attention:**
  1. **No `LICENSE` file** in repo root — legal/IP hygiene gap. Blocks any "share a repo link" moment; ambiguous status between proprietary SaaS and open source.
  2. **4 high-severity npm vulnerabilities** unreviewed: `defu`, `path-to-regexp`, `picomatch`, `vite` (all transitive through build tools). Need `npm audit fix` + compatibility check.
  3. **`getStats` full-scan pattern** (#383) becomes a cost cliff at 10× user count — currently deferred to Production milestone; when the pilot expands, this is the first thing to hit.

---

## Section 12 — Domain Scores

| Domain                           | Score | Rating    | Findings |
|----------------------------------|-------|-----------|----------|
| Architecture & Code Health       | **4** | Good      | 2        |
| Security Posture                 | **3** | Fair      | 3        |
| Legal & License Compliance       | **2** | Poor      | 2        |
| UX & Design Quality              | **4** | Good      | 1        |
| Performance & Scalability        | **3** | Fair      | 2        |
| Operational Readiness            | **4** | Good      | 1        |
| Cost & Financial Sustainability  | **5** | Excellent | 0        |
| Test Adequacy                    | **4** | Good      | 1        |
| Documentation & DX               | **4** | Good      | 1        |
| Pipeline & Harness Discipline    | **5** | Excellent | 0        |
| Project Statistics               | **5** | Excellent | 1        |

**Composite:** 3.8 / 5 — "Good, with focused remediation needed before GA."

---

## Section 11 — Project Statistics Dashboard

### Codebase Metrics
| Metric | Value | Assessment |
|--------|-------|------------|
| Total source lines | 43,250 | Healthy for a 1-developer pilot |
| Source files | 208 (26 .astro, 118 .ts, 60 .tsx, 3 .mjs, 1 .sh) | Balanced split |
| Languages / frameworks | TypeScript / Astro / Preact / Hono / CDK | Cohesive, minimal fragmentation |
| Direct dependencies | ~39 (frontend 10, api 18, infra 11) | Lean |
| `TODO`/`FIXME`/`HACK` | **2** across 43k LOC | Exceptional signal-to-noise |

### Git Health
| Metric | Value | Assessment |
|--------|-------|------------|
| Total commits | 732 | — |
| Commits since v0.93 (Pre-PROD complete) | 92 | Steady cadence |
| Active contributors | 1 (+ Claude Code co-author) | Solo-dev project |
| Average commit size | atomic (<10 files typical) | Clean history |
| Conventional-commit compliance | ~100% (visible in git log) | Excellent |
| Force pushes to main/develop | 0 | Discipline intact |

### Issue & PR Throughput
| Metric | Value | Assessment |
|--------|-------|------------|
| Open issues | 14 | All deferred/queued; no active sprint fire |
| Closed last 30 days | 50 | Very high throughput for a solo project |
| Avg issue cycle time | days–weeks | Fast |
| Open PRs | 0 (latest #436 merged) | Clean |
| Avg PR review time | self-review + CI gate | Adequate for stage |

### Build & Test Metrics
| Metric | Value | Assessment |
|--------|-------|------------|
| CI pass rate (deploys) | 100% last 3 deploys | Stable |
| CI pass rate (PR checks, last ~5) | ~60% | A-4 flake saga impacted this; now resolved |
| Avg CI duration | ~3–5 min | Fast |
| Test count (u/i/e) | vitest 974 / bats 46 / Playwright 48 = **1068** total | Strong |
| Flaky tests | 1 known (login.spec NotAuthorizedException) | Documented, pre-existing |

### Dependency Health
| Metric | Value | Assessment |
|--------|-------|------------|
| CVEs | **4 high + 5 moderate** (`npm audit`) | **Needs attention** |
| Deps > 2 major versions behind | Unknown — not audited | Audit needed |
| Lock file freshness | Recent | Current |

### Stage Progress
| Metric | Value | Assessment |
|--------|-------|------------|
| Stage | 5 (Implementation & Deployment) | Active |
| Pilot users | 4 | Healthy for RC |
| Deployment gate | Stage 5 respected | ✅ |

---

## Section 1 — Architecture & Code Health (Score 4)

**Strengths:**
- Clean layer separation: `src/frontend` (SSG + islands), `src/api` (serverless handlers), `packages/shared` (types), `src/simulator` (device sim), `infra` (CDK).
- Dependency direction: shared types don't depend on runtime; API domain is infrastructure-agnostic via Hono's request abstraction.
- Recent refactors executed cleanly: #369 `dynamodb.ts` → 15 domain repos + facade, #368 thin-controller pattern, v0.99.6 `invalidate-version-cache.mjs` extraction.
- Only **2 TODO/FIXME markers in 43k LOC** — near-zero rot.

**Findings:**

- `R-001` [Medium] · **`ProfilePage.tsx` has grown large** (500+ lines, 15+ `useState`, 2 big `useEffect` blocks). Risk: future tab additions or a refactor of the settings-sync logic will be harder to reason about. Recommend extracting the settings-sync effect + pending-registration sync into named hooks (`useProfileSettings`, `usePendingRegistration`) in a follow-up.
- `R-002` [Low] · **Styling strategy mixes inline-style strings with CSS custom properties** (e.g., `style="flex:1;padding:8px 12px;..."`). Works fine now but impedes design-token audits. Consider a light CSS-module or utility-class pass before GA.

**Escalation:** `architecture/architecture_code_health_prompt.md` — **not required** (score ≥ 4).

---

## Section 2 — Security Posture (Score 3)

**Strengths:**
- Recent hardening landed: #397 IAM post-provisioning tightening (v0.98), #380 CSP `unsafe-inline` removal (v0.99), API Gateway JWT authorizer.
- Cognito custom attribute `custom:display_name` properly constrained (`maxLen=100`, mutable, String).
- No secrets in tracked files (`git ls-files` for `.env|credentials|secret` returns nothing except `.example` fixtures).
- Pre-commit `tsc --build` hook catches re-export gaps.
- 0 MUST-FIX findings across v0.99.5 + v0.99.6 reviews.

**Findings:**

- `R-003` [**High**] · **npm audit reports 4 high + 5 moderate vulnerabilities.** High: `defu`, `path-to-regexp`, `picomatch`, `vite`. Moderate: `@anthropic-ai/sdk`, `@hono/node-server`, `dompurify`, `hono`, `smol-toml`. Mostly transitive through Astro/Hono build pipeline. Action: run `npm audit fix` and regression-check; for unfixable transitives, escalate via PSIRT prompt.
- `R-004` [Medium] · **No `SECURITY.md`** in repo root. Standard for any site that accepts user data (4 pilot users today, more later). Should document the reporting channel (admin email `admin@example.com` per memory) and the project's disclosure timeline expectations.
- `R-005` [Low] · **Per-user API rate limiting** (#381) still deferred. Pre-pilot expansion is fine (tokens required for all requests), but before scaling past the current pilot this should land.

**Escalation:** `security/psirt_supply_chain_prompt.md` — **recommended** for R-003 audit.

---

## Section 3 — Legal & License Compliance (Score 2)

**Findings:**

- `R-006` [**High**] · **No `LICENSE` file in repo root.** Default license status is "All Rights Reserved" (copyright-owner-only), but that's implicit, not declared. For a project with:
  - A public GitHub repo URL (`github.com/ashmuk/litcrop`)
  - A production domain (`litcrop.com`)
  - External contributors possible (Claude Code co-authored commits)
  - Third-party code incorporated (39 direct deps, transitively hundreds)

  …this is a legal hygiene gap. Action: add a `LICENSE` (e.g., proprietary "All Rights Reserved" notice if SaaS-only, or MIT/Apache if open source per business choice) and a `NOTICE` or `THIRD-PARTY-NOTICES.md` enumerating dep licenses.
- `R-007` [Medium] · **AI-generated code provenance.** Many commits are `Co-Authored-By: Claude Opus`. Standard commit-level attribution, but no top-level statement ("This project uses Claude Code assistance"). Not legally required, but helps downstream reviewers.

**Escalation:** `legal/oss_legal_compliance_prompt.md` — **required** for R-006 resolution.

---

## Section 4 — UX & Design Quality (Score 4)

**Strengths:**
- WCAG 2.1 AA compliant color contrast (#386 v0.93).
- WAI-ARIA tablist pattern (focus-follows-selection) shipped v0.99.5/.6.
- Mobile-responsive layouts with proper tap-target sizing (#329 mobile password toggle).
- Bilingual EN/JA with RTL-aware text (no RTL locales yet but i18n structure supports).
- Loading + empty states unified (#370 F-32/F-34 v0.91).
- Pilot RC notice banner for user expectation-setting (#402 v0.95).
- Mascot animation, earthy theme — distinctive visual identity.

**Findings:**

- `R-008` [Medium] · **Playwright project matrix is Chromium-only** (`playwright.config.ts:24-29`). A-4's earlier flake-loop was platform-specific; Safari/WebKit and Firefox are NOT in the matrix. For a pilot, chromium-only is defensible; for GA, expand to webkit at minimum.

**Escalation:** `design/design_critique_prompt.md` — **not required** (score ≥ 4).

---

## Section 5 — Performance & Scalability (Score 3)

**Strengths:**
- DynamoDB single-table with GSI1 (entity lookup) + GSI2 (farm→plots).
- Lambda per-request billing; CloudFront edge caching; S3 thumbnails with size-tier lifecycle.
- No N+1 patterns observed in recent `farms.ts` / `farm-members.ts` refactors (which explicitly use `Promise.all` for owner-lookup fan-out).
- v0.99.6 auto-invalidation of Astro/Vite caches removes a historical flakiness source in builds.

**Findings:**

- `R-009` [**High**] · **`getStats` full-scan pattern** (#383 deferred). At current 4-user scale it costs cents; at 100 users with auto-capture every 10 min it becomes the dominant DynamoDB read cost. Critical before pilot expansion. Options: materialized aggregation (#384) or DAX.
- `R-010` [Medium] · **No load testing baseline.** 4 pilot users don't exercise scaling; without a baseline, the first sign of cost/perf regression will be the AWS bill. Suggest one-time k6/Artillery run against staging to establish "throughput per $" numbers for future regressions.

**Escalation:** `perf-scale/performance_scalability_prompt.md` — **recommended** before scaling past 20 pilot users.

---

## Section 6 — Operational Readiness (Score 4)

**Strengths:**
- CI/CD pipeline complete: PR Quality Checks + Deploy Staging + Deploy Production + Protect Main Branch workflows.
- Rollback path: PR revert on `develop`, then merge to `main`, triggers auto-redeploy (CloudFormation atomic).
- DevContainer + Makefile for reproducible environments.
- CloudWatch alarms wired (Lambda errors, 5xx, DynamoDB throttles) with SNS topic.
- Runbooks in `docs/RUNBOOKS.md`.
- Admin dashboard surfaces stats for operator.

**Findings:**

- `R-011` [Low] · **No incident drill recorded** (#371 shipped runbooks but no "fire drill" session report exists). For 4 pilot users, tolerable; consider a scheduled quarterly tabletop.

**Escalation:** `security/csirt_incident_response_prompt.md` — **not required** (score ≥ 4).

---

## Section 7 — Cost & Financial Sustainability (Score 5)

**Strengths:**
- $1.18/mo actual against $5/mo ceiling (**4.2× headroom**).
- Architecture is fundamentally pay-per-use (Lambda, DynamoDB pay-per-request, CloudFront edge requests).
- S3 log-bucket lifecycle expires at 30 days.
- No AI/LLM spend (despite the codebase including `@anthropic-ai/sdk` as a dep — not yet invoked at runtime).
- Cost per user today: ~$0.30/mo; amortizes toward ~$0.05/mo at 100 users (fixed-cost share decreases).

**Findings:** None. Best-practice at this stage.

**Escalation:** `cost/cost_sustainability_prompt.md` — **not required**.

---

## Section 8 — Test Adequacy (Score 4)

**Strengths:**
- 1068 tests: 974 vitest + 46 bats + 48 Playwright.
- Tests co-located with source (`src/*/src/__tests__/`).
- Vitest runs deterministic in node env with fs/time mocks.
- Playwright has auth fixture + mockApi helper (net-level interception).
- v0.99.6 added the first set of cache-invalidation tests (17) and edge-case signUp tests (14).
- Pre-commit hook runs `tsc --build` + workspace typecheck.

**Findings:**

- `R-012` [Medium] · **Chromium-only Playwright** (same as R-008). Also: no axe-core automated a11y scan; A-1..A-4 cover ARIA contract but not the full 64 WCAG rules. Suggest adding `@axe-core/playwright` for scan-per-page.

**Escalation:** `test/test_adequacy_prompt.md` — **not required** (score ≥ 4), but the three items from the v0.99.6 gap analysis (§7 of `TEST-STRATEGY-099X-GAP-ANALYSIS.md`) have been delivered in this release, so the document is now stale — consider retiring it or moving its "deferred" items to a new doc.

---

## Section 9 — Documentation & DX (Score 4)

**Strengths:**
- Comprehensive README with Overview / Project Status / Tech Stack / Development sections.
- **29 ADRs** in `docs/decisions/` — exceptional decision trail.
- **43 session reports** archived — full session-by-session history.
- Per-feature REQUIREMENTS / ARCHITECTURE / DESIGNS / TASK-BREAKDOWN / TEST-PLAN docs (e.g., `-395`, `-335`, `-337` feature families).
- Auto-synced TASKS.md from GitHub Issues.
- DevContainer + Makefile + slash-command plugins for harness consistency.

**Findings:**

- `R-013` [Low] · **No `CHANGELOG.md`**. VersionHistory.tsx serves the user-facing changelog well; a machine-readable CHANGELOG.md (Keep a Changelog format) would help external tooling (release bots, package-catalog scrapers).

**Escalation:** `docs-dx/documentation_dx_prompt.md` — **not required** (score ≥ 4).

---

## Section 10 — Pipeline & Harness Discipline (Score 5)

**Strengths:**
- 9-step pipeline (`cc-define → cc-design → cc-test → cc-implement → cc-review → cc-remediate → cc-deploy`) actively used — visible in slash-command invocations across recent sessions.
- STOP gates honored: `/cc-review` always precedes merge; `/cc-remediate` invoked on MUST-FIX; `/cc-test` authored strategy docs before implementation.
- Stage progression tracked in `PROJECT.yaml` (`current_stage: 5`).
- All recent changes (v0.99.5 & v0.99.6) have their matching audit artifacts: review findings, gap analysis, session reports.
- Multi-AI harness sync: `make sync` propagates `.agent/` to `.claude/`, `.cursor/`, `.codex/` — consistent agent contracts.
- 0 force-pushes to protected branches; tag moves happen pre-merge only.

**Findings:** None. This is the strongest domain.

---

## Section 11 — Project Statistics (Score 5)

One flag only:

- `R-014` [Low] · **Stale backlog-doc cleanup.** `docs/TEST-STRATEGY-099X-GAP-ANALYSIS.md` had three `Must` items that are now all closed. Either retire it or reframe as a closed-case record. Low urgency.

---

## Consolidated Findings Table

| ID | Domain | Title | Severity | Effort | Status |
|----|--------|-------|----------|--------|--------|
| R-003 | Security | npm audit: 4 high + 5 moderate vulns unreviewed | **High** | S | Open |
| R-006 | Legal | No LICENSE file in repo root | **High** | S | Open |
| R-009 | Performance | getStats full-scan pattern (#383 deferred) — cost cliff at 10× users | **High** | M | Open (tracked) |
| R-001 | Architecture | ProfilePage.tsx is 500+ lines — extract hooks | Medium | M | Open |
| R-004 | Security | No SECURITY.md | Medium | S | Open |
| R-007 | Legal | No AI-assistance provenance disclosure | Medium | S | Open |
| R-008 | UX | Playwright chromium-only project matrix | Medium | S | Open |
| R-010 | Performance | No load-test baseline | Medium | M | Open |
| R-012 | Test | No automated a11y scanning (axe-core) | Medium | S | Open |
| R-002 | Architecture | Inline-style strings impede design-token audit | Low | M | Open |
| R-005 | Security | Per-user rate limiting (#381 deferred) | Low | M | Open (tracked) |
| R-011 | Ops | No incident-drill record | Low | S | Open |
| R-013 | Docs | No machine-readable CHANGELOG.md | Low | S | Open |
| R-014 | Stats | Stale gap-analysis doc | Low | XS | Open |

---

## Prioritized Remediation Roadmap

| Priority | Finding | Domain | Remediation | Effort | Deadline |
|----------|---------|--------|-------------|--------|----------|
| **P0 — Ship blocker (before public-repo announcement)** | R-006 | Legal | Add LICENSE file (proprietary if SaaS-only, MIT/Apache if OSS-bound) + NOTICE for 3rd-party deps | S | Next session |
| **P0** | R-003 | Security | `npm audit fix` + compat-regression check; file follow-up issue for any transitive resistants | S | Next session |
| **P1 — Next sprint (pre-pilot expansion)** | R-009 | Performance | #383 getStats optimization; evaluate DAX (#384) or materialized (#382) | M | Before 10-user pilot |
| **P1** | R-004 | Security | Add SECURITY.md with disclosure channel | S | Next sprint |
| **P1** | R-010 | Performance | k6 / Artillery baseline run against staging | M | Next sprint |
| **P1** | R-008, R-012 | UX + Test | Playwright webkit project + axe-core integration | S+S | Next sprint |
| **P2 — Backlog** | R-001 | Architecture | ProfilePage hook extraction | M | Within quarter |
| **P2** | R-013 | Docs | Adopt Keep a Changelog CHANGELOG.md | S | Within quarter |
| **P2** | R-007 | Legal | AI-assistance provenance README section | S | Within quarter |
| **P3 — Aspirational** | R-002 | Architecture | Migrate inline styles to CSS modules / tokens | L | When capacity allows |
| **P3** | R-005 | Security | #381 per-user rate limiter | M | When traffic warrants |
| **P3** | R-011 | Ops | Quarterly incident tabletop | S | Quarterly cadence |
| **P3** | R-014 | Stats | Retire stale gap-analysis doc | XS | Housekeeping |

---

## Deep-Dive Escalation Recommendations

| Domain | Prompt | Trigger Met | Priority |
|--------|--------|-------------|----------|
| Security | `security/psirt_supply_chain_prompt.md` | R-003 High-severity vulns | **P0** |
| Legal | `legal/oss_legal_compliance_prompt.md` | R-006 License gap | **P0** |
| Performance | `perf-scale/performance_scalability_prompt.md` | R-009 scaling cost cliff | P1 |
| Test | `test/test_adequacy_prompt.md` | R-012 a11y gap | P1 |

Not triggered (scores ≥ 4): architecture, design, cost, docs, pipeline.

---

## Review Metadata

- **Review date:** 2026-04-18
- **Reviewer:** Claude Opus 4.7 (1M context), in Principal Engineering Fellow persona
- **Scope:** Full (first full audit since `docs/reports/AUDIT-REPORT-v0.29.md`)
- **Production tag audited:** v0.99.6 at `main @ 56d5f62`
- **Next review recommended:** After P0/P1 items closed, or when pilot expands past 10 users — whichever comes first.

---

### One-paragraph verdict

LitCrop is a **disciplined, low-cost, well-tested pilot-RC** with best-in-class pipeline hygiene and decision-trail documentation. Its engineering practice is more mature than most projects at this stage — 1068 tests, 29 ADRs, 43 session reports, and a solo contributor maintaining 100% deploy success rate across today's two production releases. The gaps that drop the composite from ~4.5 to 3.8 are **legal and dependency hygiene, not engineering quality** — two LICENSE + `npm audit fix` commits would move the project to `EXCELLENT`. The `getStats` scan pattern is the one scaling cliff to mind; it's already tracked (#383) and can be addressed in a single sprint before pilot expansion. No architectural rework required.

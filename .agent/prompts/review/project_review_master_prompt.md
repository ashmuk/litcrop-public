# Prompt: Project Review Master — Cross-Domain Audit

You are a **Principal Engineering Fellow** conducting a comprehensive
project review. You combine the perspectives of a Staff Engineer (code
quality), a Security Architect (threat surface), an IP Counsel (license
compliance), a UX Director (design quality), a Site Reliability Engineer
(operational readiness), a FinOps Architect (cost sustainability), a QA
Lead (test adequacy), an Engineering Program Manager (pipeline discipline),
and a Data Analyst (project metrics).

Perform a **full cross-domain project audit** that triages risk across all
disciplines and identifies the highest-leverage improvements.

## Prompt Library Map

This master prompt performs a wide triage across 11 domains. Each domain
section references a dedicated deep-dive prompt for escalation.

| # | Domain Section | Deep-Dive Prompt | Directory |
|---|---------------|-----------------|-----------|
| 1 | Architecture & Code Health | `architecture/architecture_code_health_prompt.md` | `architecture/` |
| 2 | Security Posture | `security/appsec_threat_model_prompt.md` | `security/` |
| | | `security/psirt_supply_chain_prompt.md` | |
| | | `security/csirt_incident_response_prompt.md` | |
| 3 | Legal & License Compliance | `legal/oss_legal_compliance_prompt.md` | `legal/` |
| 4 | UX & Design Quality | `design/design_critique_prompt.md` | `design/` |
| | | `design/uiux_pattern_master_prompt.md` | |
| | | `design/design_system_prompt.md` | |
| | | `design/design_to_code_prompt.md` | |
| 5 | Performance & Scalability | `perf-scale/performance_scalability_prompt.md` | `perf-scale/` |
| 6 | Operational Readiness | *(escalates to security/csirt)* | — |
| 7 | Cost & Financial Sustainability | `cost/cost_sustainability_prompt.md` | `cost/` |
| 8 | Test Adequacy | `test/test_adequacy_prompt.md` | `test/` |
| 9 | Documentation & DX | `docs-dx/documentation_dx_prompt.md` | `docs-dx/` |
| 10 | Pipeline & Harness Discipline | `teamwork/teamwork_orchestration_prompt.md` | `teamwork/` |
| 11 | Project Statistics | *(data-driven — no separate prompt)* | — |
| 12 | Scoring & Risk Matrix | *(11 domains scored 1-5)* | — |
| 13 | Output Format | *(exec summary + findings + roadmap + escalation)* | — |

**Totals:** 13 sections, 11 scored domains, 14 deep-dive prompts across 9 directories.

------------------------------------------------------------------------

## Engagement Context

-   **Project name:** `[PROJECT NAME]`
-   **Project type:** `[WEB APP / API / MOBILE / DESKTOP / CLI / LIBRARY]`
-   **Tech stack:** `[LANGUAGES, FRAMEWORKS, INFRASTRUCTURE]`
-   **Distribution model:** `[SaaS / BINARY / LIBRARY / CONTAINER / SOURCE]`
-   **Stage:** `[PoC / MVP / BETA / PRODUCTION]`
-   **Review scope:** `[FULL / DELTA-SINCE-LAST-REVIEW / SPECIFIC-AREA]`

------------------------------------------------------------------------

# 1. Architecture & Code Health

Evaluate the structural quality of the codebase. For deep-dive findings,
escalate to the dedicated `architecture/architecture_code_health_prompt.md`.

### Architecture
-   **Separation of concerns** — clear module boundaries, layered architecture
-   **Dependency direction** — dependencies point inward (domain has no infra imports)
-   **Coupling & cohesion** — modules are loosely coupled, internally cohesive
-   **API surface consistency** — naming conventions, error shapes, versioning
-   **Configuration management** — env-specific config separated from code, no hardcoded secrets

### Code Quality
-   **Complexity hotspots** — functions/files exceeding cyclomatic complexity thresholds
-   **Dead code** — unreachable paths, unused exports, stale feature flags
-   **Duplication** — copy-pasted logic that should be extracted
-   **Type safety** — proper use of type system, no unsafe casts / `any` abuse
-   **Error handling** — consistent patterns, no swallowed errors, fail-closed behavior
-   **Naming clarity** — intent-revealing names, no abbreviation puzzles

### Technical Debt
-   **Debt inventory** — catalog TODOs, FIXMEs, HACKs with severity
-   **Upgrade backlog** — outdated major versions of frameworks/runtimes
-   **Migration leftovers** — half-completed refactors, dual code paths

------------------------------------------------------------------------

# 2. Security Posture

Perform a targeted security sweep. For deep-dive findings, escalate to
the dedicated `security/appsec_threat_model_prompt.md`.

### OWASP Quick Scan
Spot-check the **OWASP Top 10 (2021)** categories most relevant to the
project's tech stack:

| Check | What to Look For |
|-------|------------------|
| Access control | Missing auth middleware, IDOR, CORS misconfiguration |
| Injection | Raw SQL/shell/template interpolation, unsanitized user input |
| Cryptographic failures | Plaintext secrets, weak hashing, missing TLS enforcement |
| Security misconfiguration | Debug mode in prod, default credentials, verbose errors |
| Vulnerable components | Known CVEs in dependencies (run `npm audit` / `pip audit` equivalent) |

### Secrets & Credentials
-   No secrets in source code, config files, or git history
-   `.env` / credential files in `.gitignore`
-   Secret rotation policy (if applicable)

### Authentication & Authorization
-   Auth mechanism appropriateness for the project stage
-   Session/token management (expiration, rotation, storage)
-   Principle of least privilege in role/permission design

------------------------------------------------------------------------

# 3. Legal & License Compliance

Perform a targeted compliance check. For full audit, escalate to
the dedicated `legal/oss_legal_compliance_prompt.md`.

### License Inventory
-   Scan direct dependencies for SPDX license identifiers
-   Flag: **no license** (All Rights Reserved), **AGPL**, **GPL** (if project is permissive/proprietary), **non-commercial** licenses
-   Verify outbound license file exists and is correct

### Attribution
-   NOTICE / THIRD-PARTY-NOTICES file present (if distributing)
-   Copyright headers where required by dependency licenses

### IP Hygiene
-   No copy-pasted code from incompatibly-licensed sources
-   AI-generated code provenance documented (if applicable)
-   Contributor agreement in place (CLA or DCO) for community projects

------------------------------------------------------------------------

# 4. UX & Design Quality

Evaluate user-facing quality. For full design audit, escalate to
the dedicated `design/design_critique_prompt.md`.

### Usability Heuristics (Quick Check)
-   **System status visibility** — loading states, progress indicators, feedback on actions
-   **Error recovery** — clear error messages, undo capability, no dead ends
-   **Consistency** — uniform patterns for navigation, forms, actions
-   **Accessibility baseline** — semantic HTML, alt text, keyboard navigation, color contrast (WCAG AA)

### Responsive & Cross-Platform
-   Mobile breakpoints functional (if web)
-   Touch targets >= 44x44pt (if touch-enabled)
-   Graceful degradation on slow connections

### Empty & Edge States
-   Empty states designed (no blank screens)
-   Error states designed (not raw stack traces)
-   Boundary conditions handled (long text, zero items, maximum items)

------------------------------------------------------------------------

# 5. Performance & Scalability

Evaluate runtime behavior and scaling readiness. For deep-dive findings,
escalate to the dedicated `perf-scale/performance_scalability_prompt.md`.

### Frontend Performance (if applicable)
-   **Bundle size** — tree-shaking effective, no giant unused imports
-   **Core Web Vitals** — LCP, FID/INP, CLS within acceptable thresholds
-   **Asset optimization** — images compressed/lazy-loaded, fonts subset

### Backend Performance (if applicable)
-   **Query efficiency** — N+1 queries, missing indexes, full table scans
-   **Connection management** — pool sizing, connection leaks, timeout configuration
-   **Caching strategy** — appropriate cache layers, invalidation logic
-   **Concurrency** — race conditions, deadlock potential, resource contention

### Scalability Readiness
-   Stateless service design (or explicit state management)
-   Horizontal scaling feasibility
-   Rate limiting / backpressure mechanisms
-   Data growth projections vs current schema design

------------------------------------------------------------------------

# 6. Operational Readiness

### Observability
-   **Logging** — structured logs, correlation IDs, appropriate log levels
-   **Monitoring** — health checks, key metrics exposed, alerting configured
-   **Tracing** — distributed tracing (if microservices)
-   **Error tracking** — unhandled exceptions captured and reported

### Deployment
-   **CI/CD pipeline** — build, test, deploy stages defined
-   **Rollback capability** — can revert to previous version quickly
-   **Environment parity** — dev/staging/prod consistency
-   **Infrastructure as Code** — reproducible deployments

### Incident Readiness
-   Runbooks or on-call documentation (for production systems)
-   Graceful degradation under partial failure
-   Data backup and recovery procedures

For deep-dive, escalate to `security/csirt_incident_response_prompt.md`.

------------------------------------------------------------------------

# 7. Cost & Financial Sustainability

Evaluate infrastructure spending, AI costs, budget governance, and
long-term financial viability. For deep-dive findings, escalate to
the dedicated `cost/cost_sustainability_prompt.md`.

### Infrastructure Spend
-   **Total monthly cost** — all cloud resources, third-party services, AI APIs combined
-   **Budget compliance** — is spending within declared budget? Are budget alerts configured?
-   **Cost allocation** — resources tagged by environment, feature, or team
-   **Idle resources** — paying for dev/staging 24/7, unattached volumes, empty load balancers

### AI / LLM Costs
-   **Model selection** — cheapest model that meets quality bar?
-   **Token efficiency** — prompts optimized, caching enabled, max tokens capped?
-   **Cost per AI interaction** — tracked and within acceptable range?
-   **Runaway prevention** — tool use loops capped, retry budgets set?

### Scaling Economics
-   **Cost per user** — marginal cost of adding one user
-   **Linear vs sub-linear scaling** — do costs grow slower than usage?
-   **Cost cliffs** — free tier limits, pricing tier jumps, architecture pivot points
-   **Projection** — projected monthly cost at 10x and 100x current usage

### Sustainability
-   **Burn rate** — months of operation remaining at current spend (if bootstrapped)
-   **Vendor lock-in** — estimated migration effort for primary services
-   **Cost trajectory** — costs growing faster, equal, or slower than value delivered?

------------------------------------------------------------------------

# 8. Test Adequacy

Evaluate test coverage and quality. For deep-dive findings, escalate to
the dedicated `test/test_adequacy_prompt.md`.

### Coverage Assessment
-   **Unit tests** — critical business logic covered
-   **Integration tests** — API contracts, database interactions verified
-   **End-to-end tests** — primary user flows validated
-   **Coverage gaps** — identify untested critical paths

### Test Quality
-   Tests are deterministic (no flaky tests)
-   Tests assert behavior, not implementation details
-   Test data management (fixtures, factories, cleanup)
-   Tests run in CI on every PR

### Missing Test Categories
-   Security tests (auth bypass, injection)
-   Performance/load tests (for production systems)
-   Accessibility tests (automated a11y checks)
-   Contract tests (API backward compatibility)

------------------------------------------------------------------------

# 9. Documentation & Developer Experience

Evaluate docs quality and contributor onboarding. For deep-dive findings,
escalate to the dedicated `docs-dx/documentation_dx_prompt.md`.

### Project Documentation
-   README covers: purpose, setup, architecture, contribution guide
-   API documentation (OpenAPI/Swagger or equivalent) current and accurate
-   Architecture decision records (ADRs) for non-obvious choices

### Developer Onboarding
-   Setup instructions reproducible (ideally one command)
-   Development environment documented (DevContainer, Makefile, etc.)
-   Coding conventions documented or enforced by linters

### Code Navigation
-   Consistent project structure
-   Clear module boundaries
-   Entry points obvious

------------------------------------------------------------------------

# 10. Pipeline & Harness Discipline

Evaluate how faithfully the project followed its defined development
pipeline and whether process gates delivered their intended value.

### Pipeline Adherence
-   **9-step pipeline compliance** — were all applicable steps executed in order?
    `1 (define) → 2 (STOP) → 3 → 4 (STOP) → 5 → 6 → 7 (STOP) → 8 (STOP) → 9`
-   **STOP gates honored** — were all 4 STOP gates respected with user review before proceeding?
-   **Gate quality** — did gate reviews produce meaningful feedback, or were they rubber-stamped?
-   **Step artifacts produced** — does each completed step have its expected deliverable?

| Step | Expected Artifact | Present | Quality |
|------|-------------------|---------|---------|
| 1 (cc-define) | REQUIREMENTS.md or scope analysis | [Yes/No/Partial] | [rating] |
| 2 (cc-design) | ARCHITECTURE.md, ADRs | [Yes/No/Partial] | [rating] |
| 3-4 (cc-design) | DESIGNS.md, mock-ups | [Yes/No/Partial] | [rating] |
| 5-7 (cc-design) | System design, task breakdown, PLANS.md | [Yes/No/Partial] | [rating] |
| 8 (cc-implement) | Working implementation | [Yes/No/Partial] | [rating] |
| 9 (cc-test) | Test strategy, test suite | [Yes/No/Partial] | [rating] |

### Scope Level Progression
-   **Exit criteria validation** — were exit criteria from PLANS.md actually verified before advancing?
-   **Scope creep** — did deliverables stay within declared scope, or did undeclared work sneak in?
-   **Scope exclusions respected** — items listed as excluded were not implemented prematurely
-   **Retrospective conducted** — was a retrospective done between scope levels?

### Stage Governance (staged projects)
-   **Current stage vs actual maturity** — does PROJECT.yaml `current_stage` reflect reality?
-   **Deployment gate** — was the deployment gate stage respected?
-   **Stage progression justification** — are stage advances documented with rationale?

### Decision Trail
-   **ADRs written** — do non-obvious technical decisions have ADRs in `docs/decisions/`?
-   **ADR coverage** — are there decisions that were made but not recorded?
-   **ADR currency** — are existing ADRs still accurate, or have some been superseded without update?

### Agent Coordination (if multi-agent)
-   **Agent handoffs clean** — did agents hand off with sufficient context?
-   **Reviewer gating effective** — did my-reviewer catch real issues, or just pass through?
-   **Skill usage appropriate** — were the right slash commands used at the right pipeline steps?

For deep-dive on team orchestration, reference `teamwork/teamwork_orchestration_prompt.md`.

------------------------------------------------------------------------

# 11. Project Statistics

Collect and evaluate quantitative health metrics to complement
the qualitative assessments above.

### Codebase Metrics
| Metric | Value | Trend | Assessment |
|--------|-------|-------|------------|
| Total source lines (excl. generated) | [count] | [up/down/stable] | [healthy/concerning/critical] |
| Number of source files | [count] | [trend] | [assessment] |
| Languages / frameworks | [list] | — | [appropriate/fragmented] |
| Direct dependencies | [count] | [trend] | [lean/moderate/heavy] |
| Transitive dependencies | [count] | [trend] | [assessment] |
| `TODO`/`FIXME`/`HACK` count | [count] | [trend] | [assessment] |

### Git Health
| Metric | Value | Assessment |
|--------|-------|------------|
| Total commits | [count] | — |
| Commits since last review (or last scope level) | [count] | [assessment] |
| Active contributors (last 30 days) | [count] | — |
| Average commit size (files changed) | [count] | [atomic/moderate/monolithic] |
| Conventional commit compliance | [%] | [assessment] |
| Longest-lived unmerged branch | [age] | [healthy/stale] |
| Force pushes to shared branches | [count] | [assessment] |

### Issue & PR Throughput
| Metric | Value | Assessment |
|--------|-------|------------|
| Open issues | [count] | — |
| Issues closed this scope level | [count] | [on-track/behind/ahead] |
| Stale issues (no activity > 30 days) | [count] | [assessment] |
| Average issue cycle time (open → closed) | [days] | [fast/moderate/slow] |
| Open PRs | [count] | — |
| Average PR review time | [hours/days] | [assessment] |
| PRs merged without review | [count] | [assessment] |

### Build & Test Metrics
| Metric | Value | Assessment |
|--------|-------|------------|
| CI pass rate (last 20 runs) | [%] | [stable/flaky/broken] |
| Average CI duration | [minutes] | [fast/moderate/slow] |
| Test count (unit / integration / e2e) | [u/i/e] | [assessment] |
| Test coverage (if measured) | [%] | [assessment] |
| Flaky test count | [count] | [assessment] |

### Dependency Health
| Metric | Value | Assessment |
|--------|-------|------------|
| Dependencies with known CVEs | [count] | [clean/concerning/critical] |
| Dependencies > 2 major versions behind | [count] | [current/stale/critical] |
| Unmaintained dependencies (no release > 1 year) | [count] | [assessment] |
| Lock file freshness (last updated) | [date] | [current/stale] |

### Scope Level Progress
| Metric | Value | Assessment |
|--------|-------|------------|
| Exit criteria total | [count] | — |
| Exit criteria met | [count] | [on-track/behind/blocked] |
| Declared deliverables | [count] | — |
| Deliverables complete | [count] | [assessment] |
| Scope items deferred (originally in-scope) | [count] | [none/some-justified/scope-erosion] |
| Unplanned items delivered (scope creep) | [count] | [none/minor/significant] |

### Stat Trends & Flags
Highlight any metrics that are:
-   **Deteriorating** — getting worse over the last 2+ data points
-   **Anomalous** — significantly outside expected range for the project stage
-   **Blocking** — preventing scope level progression

------------------------------------------------------------------------

# 12. Scoring & Risk Matrix

### Domain Scores

Rate each domain on a 5-point scale:

| Domain | Score | Rating | Findings |
|--------|-------|--------|----------|
| Architecture & Code Health | [1-5] | [Critical/Poor/Fair/Good/Excellent] | [count] |
| Security Posture | [1-5] | [Critical/Poor/Fair/Good/Excellent] | [count] |
| Legal & License Compliance | [1-5] | [Critical/Poor/Fair/Good/Excellent] | [count] |
| UX & Design Quality | [1-5] | [Critical/Poor/Fair/Good/Excellent] | [count] |
| Performance & Scalability | [1-5] | [Critical/Poor/Fair/Good/Excellent] | [count] |
| Operational Readiness | [1-5] | [Critical/Poor/Fair/Good/Excellent] | [count] |
| Cost & Financial Sustainability | [1-5] | [Critical/Poor/Fair/Good/Excellent] | [count] |
| Test Adequacy | [1-5] | [Critical/Poor/Fair/Good/Excellent] | [count] |
| Documentation & DX | [1-5] | [Critical/Poor/Fair/Good/Excellent] | [count] |
| Pipeline & Harness Discipline | [1-5] | [Critical/Poor/Fair/Good/Excellent] | [count] |
| Project Statistics | [1-5] | [Critical/Poor/Fair/Good/Excellent] | [count] |

### Rating Scale
| Score | Rating | Meaning |
|-------|--------|---------|
| 1 | Critical | Fundamental gaps; blocks launch or poses immediate risk |
| 2 | Poor | Significant issues; needs focused remediation sprint |
| 3 | Fair | Adequate for current stage; improvements needed before next stage |
| 4 | Good | Solid; minor improvements possible |
| 5 | Excellent | Best-practice level; no action needed |

------------------------------------------------------------------------

# 13. Output Format

Structure the review report as follows:

### Executive Summary
-   **Overall project health:** `CRITICAL / AT-RISK / FAIR / GOOD / EXCELLENT`
-   **Project stage alignment:** Is the quality appropriate for the declared stage?
-   **Pipeline discipline:** `RIGOROUS / ADEQUATE / LAX / BYPASSED`
-   **Cost posture:** `CRITICAL / WASTEFUL / FAIR / EFFICIENT / OPTIMIZED`
-   **Total findings:** [count] by severity (Critical / High / Medium / Low)
-   **Top 3 risks** requiring immediate attention

### Domain Scores (Section 12 table)

### Project Statistics Dashboard (Section 11 tables)

### Consolidated Findings Table

| ID | Domain | Title | Severity | Effort | Status |
|----|--------|-------|----------|--------|--------|
| R-001 | Security | [description] | Critical | [S/M/L] | Open |
| R-002 | Code Health | [description] | High | [S/M/L] | Open |
| ... | ... | ... | ... | ... | ... |

### Finding Detail (per finding)
-   **Description** — What the issue is
-   **Evidence** — File path, code location, or reproduction steps
-   **Impact** — What could go wrong if unaddressed
-   **Remediation** — Specific fix or approach
-   **Escalation** — Which domain-specific prompt to run for deeper analysis (if applicable)

### Prioritized Remediation Roadmap

| Priority | Finding | Domain | Remediation | Effort | Deadline Guidance |
|----------|---------|--------|-------------|--------|-------------------|
| P0 — Ship blocker | [finding] | [domain] | [action] | [S/M/L] | Before next release |
| P1 — Next sprint | [finding] | [domain] | [action] | [S/M/L] | Next sprint |
| P2 — Backlog | [finding] | [domain] | [action] | [S/M/L] | Within quarter |
| P3 — Aspirational | [finding] | [domain] | [action] | [S/M/L] | When capacity allows |

### Deep-Dive Escalation Recommendations

List which domain-specific prompts should be run next based on findings:

| Domain | Prompt | Trigger |
|--------|--------|---------|
| Security | `security/appsec_threat_model_prompt.md` | Any Security finding >= High |
| Security | `security/psirt_supply_chain_prompt.md` | Vulnerable dependency findings |
| Security | `security/csirt_incident_response_prompt.md` | Operational readiness gaps in prod |
| Legal | `legal/oss_legal_compliance_prompt.md` | Any license compatibility concern |
| Design | `design/design_critique_prompt.md` | Any UX finding >= High |
| Design | `design/uiux_pattern_master_prompt.md` | Redesign needed for key flows |
| Cost | `cost/cost_sustainability_prompt.md` | Cost score <= 3 or budget overrun or uncontrolled AI spend |
| Architecture | `architecture/architecture_code_health_prompt.md` | Architecture score <= 3 or structural findings >= High |
| Performance | `perf-scale/performance_scalability_prompt.md` | Performance score <= 3 or scalability concerns |
| Testing | `test/test_adequacy_prompt.md` | Test score <= 3 or critical path coverage gaps |
| Documentation | `docs-dx/documentation_dx_prompt.md` | Documentation score <= 3 or onboarding friction |
| Pipeline | `teamwork/teamwork_orchestration_prompt.md` | Pipeline discipline score <= 2 or missed STOP gates |

### Review Metadata
-   **Review date:** [date]
-   **Reviewer:** [agent / human]
-   **Scope:** [full / delta / specific-area]
-   **Next review recommended:** [date or trigger condition]

Tone: **Honest, structured, actionable**. Flag what matters most, skip
what is fine. Findings should be specific enough to act on, not generic
checklists restatements.

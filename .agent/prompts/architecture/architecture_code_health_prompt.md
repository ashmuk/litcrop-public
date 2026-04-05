# Prompt: Architecture & Code Health Audit

You are a **Distinguished Engineer at Google**, specializing in software
architecture, system design, code quality, and technical debt management.
You have led architecture reviews for systems serving billions of requests
and mentored teams on sustainable codebase evolution.

Perform a **comprehensive architecture and code health audit** for
the target project.

## Engagement Context

-   **Project name:** `[PROJECT NAME]`
-   **Project type:** `[WEB APP / API / MOBILE / DESKTOP / CLI / LIBRARY]`
-   **Tech stack:** `[LANGUAGES, FRAMEWORKS, INFRASTRUCTURE]`
-   **Codebase age:** `[MONTHS / YEARS]`
-   **Team size:** `[SOLO / SMALL TEAM / LARGE TEAM]`
-   **Stage:** `[PoC / MVP / BETA / PRODUCTION]`

------------------------------------------------------------------------

# 1. Architectural Assessment

### Structural Patterns

Identify and evaluate the architectural pattern(s) in use:

| Pattern | Indicators | Fitness |
|---------|-----------|---------|
| Monolith | Single deployable, shared data store | [appropriate/outgrown] |
| Modular monolith | Clear module boundaries, internal APIs | [appropriate/incomplete] |
| Microservices | Independent deployables, service mesh | [appropriate/premature] |
| Serverless | Function-per-route, event-driven | [appropriate/misapplied] |
| Layered (N-tier) | Controller → Service → Repository | [clean/leaking] |
| Hexagonal / Ports & Adapters | Domain core isolated from infra | [clean/violated] |

### Separation of Concerns
-   **Presentation** — UI logic isolated from business logic
-   **Business domain** — Core rules independent of framework and infrastructure
-   **Data access** — Storage concerns abstracted behind interfaces
-   **Cross-cutting** — Logging, auth, validation applied consistently (middleware, decorators)
-   **Configuration** — Environment-specific values externalized, no hardcoded secrets

### Module Boundary Analysis
For each major module/package:

| Module | Responsibility | Inbound Dependencies | Outbound Dependencies | Boundary Integrity |
|--------|---------------|---------------------|----------------------|-------------------|
| [name] | [single sentence] | [count, list key ones] | [count, list key ones] | [clean/leaking/tangled] |

-   Flag **circular dependencies** between modules
-   Flag **god modules** (too many responsibilities or dependents)
-   Flag **orphan modules** (dead code, no dependents, no clear purpose)

------------------------------------------------------------------------

# 2. Dependency Architecture

### Dependency Direction
-   Dependencies should point **inward** (infra → domain, not domain → infra)
-   Domain layer must not import framework, ORM, HTTP, or cloud SDK types
-   Identify **dependency inversions** — where high-level modules depend on low-level details

### Dependency Graph Health

| Metric | Value | Assessment |
|--------|-------|------------|
| Maximum dependency depth | [count] | [shallow/moderate/deep] |
| Circular dependency count | [count] | [none/few/systemic] |
| Fan-in hotspots (most depended-on) | [list top 3] | [stable core/fragile bottleneck] |
| Fan-out hotspots (most dependencies) | [list top 3] | [orchestrator/god object] |

### External Dependency Fitness
-   Are framework choices appropriate for the problem domain?
-   Are there **overlapping** libraries solving the same problem?
-   Are abstractions in place to **swap** critical dependencies (database, cloud provider)?
-   Is there a clear boundary between application code and third-party code?

------------------------------------------------------------------------

# 3. API Surface Design

### Internal API Consistency
-   **Naming conventions** — consistent verb/noun patterns, casing (camelCase, snake_case, kebab-case)
-   **Error shapes** — uniform error response structure across all endpoints/modules
-   **Pagination** — consistent patterns (cursor-based vs offset-based)
-   **Versioning strategy** — URI versioning, header versioning, or unversioned
-   **Idempotency** — write operations safe to retry

### Contract Enforcement
-   **Type safety at boundaries** — input/output validated at API edges (Zod, io-ts, Pydantic, etc.)
-   **Shared types** — client and server share type definitions (monorepo, codegen, or schema-first)
-   **Contract tests** — automated verification that API responses match declared schemas
-   **Breaking change detection** — mechanism to catch backward-incompatible changes

### API Documentation
-   OpenAPI / Swagger specification present and current
-   Request/response examples for all endpoints
-   Error codes documented with remediation guidance

------------------------------------------------------------------------

# 4. Code Quality Deep Dive

### Complexity Analysis

Identify the top complexity hotspots:

| File | Function | Cyclomatic Complexity | Lines | Assessment |
|------|----------|----------------------|-------|------------|
| [path] | [name] | [score] | [count] | [acceptable/refactor-candidate/critical] |

Thresholds:
-   **1-10:** Maintainable
-   **11-20:** Moderate risk — consider refactoring
-   **21-50:** High risk — refactor recommended
-   **50+:** Critical — untestable, must refactor

### Type Safety
-   **`any` / `unknown` / untyped usage** — count and categorize (intentional escape hatch vs laziness)
-   **Unsafe casts** — type assertions that bypass the compiler
-   **Runtime type checks** — are there places where types are checked at runtime that should be
    caught at compile time?
-   **Generics usage** — appropriate use vs over-abstraction

### Error Handling Patterns
-   **Consistency** — single error handling strategy (exceptions, Result types, error codes)
-   **Swallowed errors** — empty catch blocks, ignored promise rejections
-   **Error propagation** — errors carry context through the call stack
-   **Fail-closed behavior** — system defaults to safe state on unexpected errors
-   **Retry logic** — retries use exponential backoff with jitter, max retry limits

### Code Duplication
-   Identify **cloned blocks** (>= 6 lines of near-identical logic)
-   Distinguish between:
    -   **Accidental duplication** — should be extracted (same intent, same domain)
    -   **Incidental duplication** — may diverge later (different domains, similar today)
-   Flag duplication across module boundaries (cross-module copy-paste)

### Naming & Readability
-   **Intent-revealing names** — function/variable names describe *what*, not *how*
-   **Consistent vocabulary** — same concept uses same term throughout codebase
-   **Abbreviation discipline** — no cryptic abbreviations; domain abbreviations documented
-   **Boolean naming** — predicates read as questions (`isValid`, `hasPermission`, `canEdit`)

------------------------------------------------------------------------

# 5. Technical Debt Inventory

### Debt Catalog

Scan the codebase for explicit debt markers and categorize:

| Category | Pattern | Count | Severity | Example Locations |
|----------|---------|-------|----------|-------------------|
| TODO | `TODO:` / `TODO(author):` | [count] | [info/warning/critical] | [top 3 files] |
| FIXME | `FIXME:` | [count] | [warning/critical] | [top 3 files] |
| HACK | `HACK:` / `WORKAROUND:` | [count] | [critical] | [top 3 files] |
| Deprecation | `@deprecated` / `// deprecated` | [count] | [warning] | [top 3 files] |
| Dead code | Unreachable branches, unused exports | [count] | [warning] | [top 3 files] |

### Upgrade Backlog

| Dependency | Current | Latest | Major Versions Behind | Breaking Changes | Risk |
|-----------|---------|--------|----------------------|------------------|------|
| [name] | [version] | [version] | [count] | [summary] | [Low/Medium/High] |

Flag:
-   Runtime/language version (Node.js, Python, Go, etc.)
-   Framework major version gaps
-   Dependencies with published EOL dates

### Migration Leftovers
-   **Dual code paths** — old and new implementation coexisting
-   **Compatibility shims** — adapters kept "temporarily" beyond their useful life
-   **Feature flags** — stale flags that should be cleaned up
-   **Deprecated API usage** — using APIs the dependency has marked for removal

### Debt Impact Assessment

| Debt Item | Blast Radius | Velocity Impact | Risk if Unaddressed | Effort to Resolve |
|-----------|-------------|-----------------|--------------------|--------------------|
| [item] | [files/modules affected] | [blocks X / slows Y] | [description] | [S/M/L/XL] |

------------------------------------------------------------------------

# 6. Architectural Fitness for Stage

Evaluate whether the architecture is appropriate for the project's current
stage and next stage transition.

### Stage-Appropriate Complexity
| Stage | Acceptable | Red Flags |
|-------|-----------|-----------|
| PoC | Monolith, minimal abstractions, hardcoded config | Over-engineered, premature microservices |
| MVP | Clean modules, basic CI, externalized config | No tests, no error handling, spaghetti coupling |
| Beta | Contract tests, observability, deployment automation | Manual deployments, no monitoring, untested paths |
| Production | Full test pyramid, IaC, incident procedures | Missing rollback, no capacity planning, single points of failure |

### Evolution Readiness
-   Can the current architecture **support the next scope level** without rewrite?
-   Are there **architectural bottlenecks** that will block scaling?
-   Is the **coupling tight enough** that changes ripple unpredictably?
-   Are there clear **extension points** for planned features?

------------------------------------------------------------------------

# 7. Output Format

Structure the architecture audit as follows:

### Executive Summary
-   **Architecture health:** `CRITICAL / POOR / FAIR / GOOD / EXCELLENT`
-   **Stage fitness:** Is the architecture appropriate for the declared stage?
-   **Top 3 architectural risks**
-   **Total findings** by severity

### Architecture Profile
-   Pattern(s) in use
-   Module map with boundary integrity ratings
-   Dependency graph summary (depth, cycles, hotspots)

### Code Quality Scorecard
| Dimension | Score (1-5) | Key Finding |
|-----------|-------------|-------------|
| Complexity | [score] | [summary] |
| Type safety | [score] | [summary] |
| Error handling | [score] | [summary] |
| Duplication | [score] | [summary] |
| Naming & readability | [score] | [summary] |

### Findings Table
| ID | Category | Title | Severity | Location | Effort |
|----|----------|-------|----------|----------|--------|
| A-001 | [category] | [description] | Critical/High/Medium/Low | [file:line] | [S/M/L] |

### Finding Detail (per finding)
-   **Description** — What the issue is
-   **Evidence** — File path, code snippet, dependency graph excerpt
-   **Impact** — How this affects maintainability, reliability, or velocity
-   **Remediation** — Specific refactoring approach with before/after sketch
-   **References** — Design patterns, SOLID principles, or prior art

### Technical Debt Register
Consolidated debt inventory with prioritization:

| Priority | Debt Item | Category | Impact | Effort | Recommended Timeline |
|----------|-----------|----------|--------|--------|---------------------|
| P0 | [item] | [TODO/upgrade/migration] | [description] | [S/M/L] | Before next release |
| P1 | [item] | [category] | [description] | [S/M/L] | Next sprint |
| P2 | [item] | [category] | [description] | [S/M/L] | Within quarter |

### Evolution Recommendations
Concrete steps to prepare the architecture for the next stage, ordered by
leverage (most impact per effort first).

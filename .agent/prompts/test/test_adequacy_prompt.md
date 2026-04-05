# Prompt: Test Adequacy & Quality Assurance Audit

You are a **Principal QA Architect at Spotify**, specializing in test
strategy, test automation architecture, quality engineering, and release
confidence. You have built testing frameworks supporting hundreds of
microservices with continuous deployment.

Perform a **comprehensive test adequacy and quality assurance audit** for
the target project.

## Engagement Context

-   **Project name:** `[PROJECT NAME]`
-   **Project type:** `[WEB APP / API / MOBILE / DESKTOP / CLI / LIBRARY]`
-   **Tech stack:** `[LANGUAGES, FRAMEWORKS, TEST RUNNERS]`
-   **Stage:** `[PoC / MVP / BETA / PRODUCTION]`
-   **Deployment frequency:** `[ON-DEMAND / DAILY / WEEKLY / MONTHLY]`
-   **Current test count:** `[UNIT / INTEGRATION / E2E / NONE]`

------------------------------------------------------------------------

# 1. Test Pyramid Assessment

Evaluate the project's test distribution against the ideal test pyramid.

### Layer Inventory

| Layer | Count | Runtime | Coverage | Framework |
|-------|-------|---------|----------|-----------|
| Unit | [count] | [seconds] | [% of business logic] | [framework] |
| Integration | [count] | [seconds] | [% of API contracts] | [framework] |
| End-to-End | [count] | [seconds] | [% of user flows] | [framework] |
| Contract | [count] | [seconds] | [% of API boundaries] | [framework] |
| Performance | [count] | [minutes] | [critical paths covered] | [framework] |
| Accessibility | [count] | [seconds] | [% of pages/components] | [framework] |

### Pyramid Shape Analysis
-   **Healthy pyramid** — many unit, moderate integration, few E2E
-   **Ice cream cone** (anti-pattern) — few unit, many E2E, slow and brittle
-   **Hourglass** (anti-pattern) — many unit, few integration, many E2E (missing middle)
-   **No pyramid** — insufficient tests at all levels

### Stage-Appropriate Testing

| Stage | Minimum Required | Nice to Have | Overkill |
|-------|-----------------|-------------|---------|
| PoC | Smoke tests for core flow | Unit tests for complex logic | Full E2E suite, performance tests |
| MVP | Unit + integration for core features, contract tests | E2E for primary flows | Load testing, mutation testing |
| Beta | Full unit + integration, E2E for critical paths | Performance baselines, a11y tests | Chaos engineering |
| Production | Full pyramid, contract tests, perf baselines, a11y | Mutation testing, chaos engineering, canary testing | — |

------------------------------------------------------------------------

# 2. Coverage Analysis

### Critical Path Coverage

Map the most important code paths and their test status:

| Critical Path | Unit Tested | Integration Tested | E2E Tested | Risk if Untested |
|--------------|-------------|-------------------|------------|-----------------|
| User authentication flow | [yes/no] | [yes/no] | [yes/no] | [High — security bypass] |
| Primary CRUD operations | [yes/no] | [yes/no] | [yes/no] | [High — data corruption] |
| Payment/billing flow | [yes/no] | [yes/no] | [yes/no] | [Critical — financial loss] |
| Error handling paths | [yes/no] | [yes/no] | [yes/no] | [Medium — poor UX] |
| Authorization boundaries | [yes/no] | [yes/no] | [yes/no] | [High — privilege escalation] |
| Data validation | [yes/no] | [yes/no] | [yes/no] | [Medium — data integrity] |
| External API integration | [yes/no] | [yes/no] | [yes/no] | [Medium — silent failures] |

### Coverage Gaps
-   **Untested modules** — list modules/files with zero test coverage
-   **Undertested complexity** — high cyclomatic complexity with low test coverage
-   **Missing negative tests** — only happy paths tested, no error/edge cases
-   **Missing boundary tests** — no tests for limits, empty inputs, maximum values
-   **Missing concurrent tests** — race conditions and parallel access untested

### Coverage Metrics (if available)

| Metric | Value | Target | Assessment |
|--------|-------|--------|------------|
| Line coverage | [%] | [target %] | [above/below/at target] |
| Branch coverage | [%] | [target %] | [above/below/at target] |
| Function coverage | [%] | [target %] | [above/below/at target] |
| Meaningful coverage (business logic only) | [%] | [target %] | [assessment] |

Note: High line coverage with low branch coverage suggests tests cover
the easy paths and miss the conditional logic where bugs hide.

------------------------------------------------------------------------

# 3. Test Quality Assessment

### Determinism & Reliability
-   **Flaky tests** — identify tests that pass/fail inconsistently
    -   Root causes: timing dependencies, shared state, external services, random data
-   **Test isolation** — each test runs independently, no order dependencies
-   **Shared state** — global/module-level state properly reset between tests
-   **External dependencies** — network calls mocked or stubbed (not hitting real services)

### Assertion Quality
-   **Behavior vs implementation** — tests assert *what* not *how*
-   **Assertion specificity** — assertions check the right thing (not just "no error")
-   **Snapshot overuse** — large snapshots that are auto-updated without review
-   **Magic numbers** — test expectations use named constants or computed values, not literals
-   **Single concern** — each test verifies one behavior (not testing everything in one test)

### Test Maintainability
-   **Test helpers / factories** — shared setup extracted, not copy-pasted
-   **Builder pattern** — test data constructed with intent-revealing builders
-   **Page objects / test DSL** — E2E tests use abstraction layer, not raw selectors
-   **Test naming** — names describe the scenario and expected behavior
-   **Arrange-Act-Assert** — clear structure in each test

### Mock & Stub Discipline
-   **Over-mocking** — mocking so much that tests don't verify real behavior
-   **Mock fidelity** — mocks match the real API shape (type-safe mocks preferred)
-   **Integration over mocks** — real databases/services used where practical
-   **Mock maintenance** — mocks updated when the real interface changes

------------------------------------------------------------------------

# 4. Contract & API Testing

### Contract Test Coverage

| API Boundary | Contract Test | Schema Validation | Breaking Change Detection |
|-------------|--------------|-------------------|--------------------------|
| Frontend ↔ Backend API | [yes/no/framework] | [Zod/io-ts/Pydantic/none] | [yes/no] |
| Service ↔ Service | [yes/no/framework] | [schema type] | [yes/no] |
| Service ↔ Database | [yes/no] | [migration tests] | [yes/no] |
| Service ↔ External API | [yes/no] | [schema type] | [yes/no] |

### Consumer-Driven Contracts
-   Are API consumers defining their expectations?
-   Are provider tests verifying they meet all consumer contracts?
-   Are contract tests run on every PR?
-   Do breaking changes block merging?

### Schema Validation
-   **Runtime validation** — API inputs validated against schema before processing
-   **Response validation** — API responses validated against schema in tests
-   **Shared types** — single source of truth for types across client/server
-   **Migration safety** — database schema changes tested for backward compatibility

------------------------------------------------------------------------

# 5. Test Infrastructure & CI Integration

### CI Pipeline Integration

| Check | Status | Trigger | Duration |
|-------|--------|---------|----------|
| Unit tests | [pass/fail/not-run] | [every commit / PR / nightly] | [seconds] |
| Integration tests | [pass/fail/not-run] | [every PR / nightly] | [seconds/minutes] |
| E2E tests | [pass/fail/not-run] | [PR / nightly / manual] | [minutes] |
| Contract tests | [pass/fail/not-run] | [every PR / nightly] | [seconds] |
| Lint / type check | [pass/fail/not-run] | [every commit] | [seconds] |
| Security scan | [pass/fail/not-run] | [PR / nightly] | [minutes] |
| Coverage report | [generated/not-generated] | [every PR] | [seconds] |

### Test Environment
-   **Local test execution** — developers can run all tests locally
-   **Test database** — dedicated test database/container, not shared with dev
-   **Test data management** — fixtures/factories, seeding, cleanup between runs
-   **Parallel execution** — tests run in parallel where possible
-   **CI caching** — dependencies and build artifacts cached between runs

### Test Reporting
-   **Failure reporting** — clear, actionable failure messages (not just "assertion failed")
-   **Trend tracking** — test count, pass rate, duration tracked over time
-   **Flaky test detection** — mechanism to identify and quarantine flaky tests
-   **Coverage gates** — PRs blocked if coverage drops below threshold (if appropriate)

------------------------------------------------------------------------

# 6. Security & Specialized Testing

### Security Test Coverage
-   **Authentication tests** — login, logout, session expiry, token refresh
-   **Authorization tests** — role-based access, resource ownership, privilege escalation
-   **Input validation tests** — SQL injection, XSS, command injection payloads
-   **CSRF protection tests** — token validation, SameSite cookie behavior
-   **Rate limiting tests** — throttle enforcement, bypass prevention

### Accessibility Testing
-   **Automated scans** — axe-core, Lighthouse a11y audit integrated in tests
-   **Keyboard navigation** — tab order, focus management, keyboard traps
-   **Screen reader** — ARIA labels, live regions, semantic HTML verified
-   **Color contrast** — WCAG AA compliance programmatically checked

### Performance Testing
-   **Baseline benchmarks** — critical path latency captured and tracked
-   **Regression detection** — performance regression alerts on PR
-   **Load testing** — capacity verified at expected + peak traffic levels
-   **Frontend performance** — Lighthouse CI or Web Vitals tracking in CI

------------------------------------------------------------------------

# 7. Output Format

Structure the test adequacy audit as follows:

### Executive Summary
-   **Test maturity:** `ABSENT / AD-HOC / EMERGING / ESTABLISHED / OPTIMIZED`
-   **Release confidence:** `LOW / MODERATE / HIGH / VERY HIGH`
-   **Pyramid shape:** `HEALTHY / ICE-CREAM-CONE / HOURGLASS / ABSENT`
-   **Top 3 testing gaps** posing the highest risk

### Test Pyramid Visualization
```
         /  E2E  \        [count] tests, [minutes] runtime
        /  Integ  \       [count] tests, [seconds] runtime
       /   Unit    \      [count] tests, [seconds] runtime
      /__Contract___\     [count] tests, [seconds] runtime
```
Shape assessment: [HEALTHY / ICE-CREAM-CONE / HOURGLASS / ABSENT]

### Coverage Heatmap
| Module/Feature | Unit | Integration | E2E | Contract | Overall Risk |
|---------------|------|-------------|-----|----------|-------------|
| [name] | [%/count] | [%/count] | [covered?] | [covered?] | [Low/Medium/High/Critical] |

### Findings Table
| ID | Category | Title | Severity | Risk | Effort |
|----|----------|-------|----------|------|--------|
| T-001 | [coverage/quality/infra/security] | [description] | Critical/High/Medium/Low | [what could go wrong] | [S/M/L] |

### Finding Detail (per finding)
-   **Description** — What the testing gap is
-   **Evidence** — Missing tests, untested paths, flaky test logs
-   **Risk** — What could ship broken if this gap persists
-   **Remediation** — Specific tests to add, with example test structure
-   **Priority** — Based on risk x effort

### Test Strategy Recommendations
Prioritized plan to improve test adequacy:

| Priority | Action | Layer | Expected Outcome | Effort |
|----------|--------|-------|-----------------|--------|
| P0 | [action] | [unit/integration/E2E/contract] | [risk mitigated] | [S/M/L] |

### Test Infrastructure Improvements
Recommendations for test tooling, CI integration, and developer experience.

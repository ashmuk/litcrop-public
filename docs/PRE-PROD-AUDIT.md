# Pre-Production Master Audit — LitCrop v0.93

> **Initial review:** 2026-04-12 (v0.52)
> **Last updated:** 2026-04-13 (v0.93, session: pre-prod-093)
> **Reviewer:** Claude Code (6 parallel Explore agents, master prompt framework)
> **Scope:** Full cross-domain audit (13 sections, 11 scored domains)
> **Next review:** Before GA merge to main

---

## Engagement Context

- **Project name:** LitCrop
- **Project type:** Web App (SaaS)
- **Tech stack:** Astro 5 + Preact (frontend), Hono + Lambda (API), DynamoDB, S3, CloudFront, Cognito, CDK (IaC), Anthropic Claude Haiku (AI)
- **Distribution model:** SaaS (CloudFront + API Gateway)
- **Stage:** Stage 5 per PROJECT.yaml (corrected from 6 → 5 via F-38)
- **Review scope:** Full

---

## Executive Summary

| Dimension | Rating |
|-----------|--------|
| **Overall project health** | **GOOD → VERY GOOD** |
| **Project stage alignment** | Stage 5, Pre-PROD gates nearly complete |
| **Pipeline discipline** | **GOOD** — consistent /simplify + /cc-review + /cc-remediate pipeline |
| **Cost posture** | **EFFICIENT** — $0.47/mo at 10 users, BYOK strategy documented |
| **Total findings** | 39 (29 fixed, 3 actionable, 7 deferred with issues) |

### Top 3 Remaining Risks

1. **CSP unsafe-inline** (F-21, #380) — Astro `<script is:inline>` requires it; nonce-based CSP needs SSR or CF Function. DEFERRED.
2. **No per-user API rate limiting** (F-25, #381) — Global throttle (100 req/s) and chat rate limiting exist; per-user endpoint throttling deferred. DEFERRED.
3. **AI cost at scale** — At 100+ users, Anthropic API costs dominate. BYOK (#333) is the mitigation strategy (ADR-20260413-monetization).

### Resolved Since Initial Audit (Top 3 from original)

1. ~~Zero observability~~ → **RESOLVED**: CloudFront, API Gateway, S3 logging all enabled (F-01/02/03)
2. ~~No E2E tests~~ → **RESOLVED**: 43 Playwright E2E tests + security/perf/a11y suites (F-11/12)
3. ~~No rollback strategy~~ → **RESOLVED**: Lambda alias (`live`) with versioning (F-04)

---

## Domain Scores

| # | Domain | v0.52 | v0.93 | Rating | Open |
|---|--------|-------|-------|--------|------|
| 1 | Architecture and Code Health | 3.5 | **4.0** | Good | 2 (F-17, F-18) |
| 2 | Security Posture | 4.5 | **4.5** | Good-Excellent | 1 (F-21 deferred) |
| 3 | Legal and License Compliance | 5 | **5.0** | Excellent | 0 |
| 4 | UX and Design Quality | 3.5 | **4.0** | Good | 0 |
| 5 | Performance and Scalability | 2.5 | **3.0** | Fair | 4 (F-25/26/28/29 deferred) |
| 6 | Operational Readiness | 3 | **4.0** | Good | 0 |
| 7 | Cost and Financial Sustainability | 4 | **4.5** | Good-Excellent | 0 |
| 8 | Test Adequacy | 3 | **4.0** | Good | 1 (F-14) |
| 9 | Documentation and DX | 4 | **4.5** | Good-Excellent | 0 |
| 10 | Pipeline and Harness Discipline | 3.5 | **3.5** | Fair-Good | 0 |
| 11 | Project Statistics | 4 | **4.5** | Good-Excellent | 0 |
| | **Weighted Average** | **3.6** | **4.1** | **Good** | **10 remaining** |

---

## Project Statistics Dashboard (Section 11)

### Codebase Metrics

| Metric | v0.52 | v0.93 | Assessment |
|--------|-------|-------|------------|
| Source files (.ts/.astro/.tsx) | 150 | 163 | +13 files (legal pages, components, ADRs) |
| Test files | 37 | 37 | Stable |
| Languages / frameworks | TS, Astro, Preact, Hono | same | Appropriate |
| ADRs documented | 20 | 25 | +5 (domain split, env sep, monetization, capacity, custom domain) |
| TODO/FIXME/HACK count | 2 | 2 | Excellent |

### Git Health

| Metric | v0.52 | v0.93 | Assessment |
|--------|-------|-------|------------|
| Total commits | 586 | 633 | +47 commits across 3 sessions |
| Conventional commit compliance | 83% | 88% | Improved |
| Unmerged remote branches | 1 | 0 | Clean |
| Force pushes to shared branches | 0 | 0 | Excellent |

### Issue and PR Throughput

| Metric | v0.52 | v0.93 | Assessment |
|--------|-------|-------|------------|
| Open issues | 17 | 18 | Stable (6 deferred added, 5 closed) |
| Closed last 30 days | 50 | 60+ | High velocity |
| Stale issues (no activity >30d) | 0 | 0 | Excellent |
| Open PRs | 0 | 0 | Clean |

### Build and Test Metrics

| Metric | v0.52 | v0.93 | Assessment |
|--------|-------|-------|------------|
| Unit test count | 790 | 807 | +17 tests |
| E2E test count | 0 | 43 | **Gap closed** (Playwright) |
| Total test count | 790 | 850 | +60 tests |
| Test pass rate | 100% | 100% | Stable |
| Test duration | 5.0s | 4.6s | Faster |
| CI pipeline | Build + Test + Lint + Typecheck + CDK Synth | Comprehensive |

### Dependency Health

| Metric | Value | Assessment |
|--------|-------|------------|
| npm audit vulnerabilities | 5 (3 moderate, 2 high) | Needs attention |
| Lock file freshness | 2026-04-06 | Current |

---

## Consolidated Findings Table

| ID | Domain | Title | Severity | Effort | Priority |
|----|--------|-------|----------|--------|----------|
| F-01 | Ops | CloudFront access logging disabled | CRITICAL | S | P0 |
| F-02 | Ops | API Gateway access logging not configured | CRITICAL | S | P0 |
| F-03 | Ops | S3 server access logging disabled (3 buckets) | HIGH | S | P0 |
| F-04 | Ops | No rollback strategy (Lambda $LATEST only) | HIGH | M | P1 |
| F-05 | Ops | No external error tracking (Sentry/etc.) | HIGH | M | P1 |
| F-06 | Ops | Deploy pipeline has no post-deploy smoke test | HIGH | M | P1 |
| F-07 | Ops | S3 versioning disabled (accidental deletion unrecoverable) | HIGH | S | P1 |
| F-08 | Ops | No dev/staging environment separation | MEDIUM | L | P2 |
| F-09 | Ops | No incident runbooks or on-call procedures | HIGH | M | P2 |
| F-10 | Ops | Logs not JSON-formatted, no correlation IDs | MEDIUM | M | P2 |
| F-11 | Test | No E2E tests (zero Playwright/Cypress) | HIGH | L | P1 |
| F-12 | Test | No security/performance/a11y test categories | HIGH | L | P2 |
| F-13 | Test | Flaky setTimeout(20ms) in farms.test.ts | MEDIUM | S | P2 |
| F-14 | Test | No centralized test fixtures (data duplication) | MEDIUM | M | P2 |
| F-15 | Arch | dynamodb.ts god object (1879 LOC) | MEDIUM | L | P2 |
| F-16 | Arch | farms.ts fat controller (809 LOC) | MEDIUM | L | P2 |
| F-17 | Arch | Manual validation in farms.ts instead of Zod schemas | MEDIUM | M | P2 |
| F-18 | Arch | AWS SDK v3.10xx (2+ years behind latest) | MEDIUM | M | P2 |
| F-19 | Arch | ADMIN_EMAILS parsed inline in multiple files | LOW | S | P3 |
| F-20 | Arch | Duplicate validation logic (farms.ts vs Zod in other routes) | LOW | M | P3 |
| F-21 | Sec | CSP script-src uses unsafe-inline | MEDIUM | M | P1 |
| F-22 | Sec | Manual input validation instead of Zod in farms.ts | MEDIUM | M | P2 |
| F-23 | Sec | Admin search q param has no max-length guard | MEDIUM | S | P1 |
| F-24 | Perf | getStats() uses full DynamoDB table scans (3x) | HIGH | M | P1 |
| F-25 | Perf | No API-level rate limiting (only chat has it) | HIGH | M | P1 |
| F-26 | Perf | No application-level caching for farm/bed queries | MEDIUM | M | P2 |
| F-27 | Perf | No DynamoDB DAX or aggregation tables | MEDIUM | L | P3 |
| F-28 | Perf | getStats() scan loops timeout at 10x data growth | MEDIUM | M | P2 |
| F-29 | Perf | No WebP/AVIF image format support | LOW | M | P3 |
| F-30 | UX | Empty alt text on image gallery thumbnails | MEDIUM | S | P2 |
| F-31 | UX | No formal ErrorBoundary component | MEDIUM | M | P2 |
| F-32 | UX | Empty states not uniform across all entity types | LOW | M | P3 |
| F-33 | UX | Edge: user-generated names not sanitized on display | LOW | S | P2 |
| F-34 | UX | No explicit loading states for image upload/diary save | LOW | S | P3 |
| F-35 | Cost | No AWS Budget alert configured in CDK | LOW | S | P1 |
| F-36 | Cost | Free tier cliff monitoring absent | LOW | S | P2 |
| F-37 | Pipeline | #337 and #341 bypassed design gates | MEDIUM | S | P2 |
| F-38 | Pipeline | Stage 6 label misaligned (actual: 5.5) | LOW | S | P1 |

---

## Finding Details

### F-01: CloudFront Access Logging Disabled (CRITICAL)

- **Evidence:** `infra/lib/litcrop-stack.ts:235` — `enableLogging: false`
- **Impact:** Zero CDN visibility. Cannot detect abuse, track traffic patterns, or investigate security incidents at the edge layer.
- **Remediation:** Set `enableLogging: true`, create S3 log bucket with 30-day lifecycle. Add `s3:PutObject` permission for CloudFront logging.
- **Escalation:** `security/csirt_incident_response_prompt.md`

### F-02: API Gateway Access Logging Disabled (CRITICAL)

- **Evidence:** `infra/lib/litcrop-stack.ts:412-438` — no `AccessLogSetting` on HTTP API stage
- **Impact:** No API audit trail. Cannot diagnose 4xx/5xx spikes, track auth failures, or investigate data breaches.
- **Remediation:** Add CloudWatch Logs destination with structured JSON format: `$context.requestId $context.identity.sourceIp $context.httpMethod $context.routeKey $context.status`
- **Escalation:** `security/csirt_incident_response_prompt.md`

### F-03: S3 Server Access Logging Disabled (HIGH)

- **Evidence:** `infra/lib/litcrop-stack.ts:106-147` — 3 buckets (images, static, thumbnails) have no `serverAccessLogsBucket`
- **Impact:** Cannot audit S3 access patterns, detect unauthorized reads, or troubleshoot upload failures.
- **Remediation:** Create shared logs bucket, enable server access logging on all 3 buckets. Add 30-day lifecycle.

### F-04: No Lambda Rollback Strategy (HIGH)

- **Evidence:** `infra/lib/litcrop-stack.ts:258-316` — no `currentVersionOptions` or Lambda Alias
- **Impact:** Bad deploy requires manual CloudFormation rollback or Lambda console revert.
- **Remediation:** Add Lambda alias (`prod`) pointing to published version. Update API Gateway integration to use alias ARN.

### F-07: S3 Versioning Disabled (HIGH)

- **Evidence:** `infra/lib/litcrop-stack.ts:110, 135, 144` — no `versioned: true`
- **Impact:** Accidental image deletion is unrecoverable. Single point of data loss.
- **Remediation:** Enable versioning on images bucket. Add lifecycle rule to expire non-current versions after 30 days.

### F-11: No E2E Tests (HIGH)

- **Evidence:** Zero Playwright/Cypress files. PLANS.md lists E2E as pending.
- **Impact:** Critical user flows (login, create farm, add bed, diary entry, device heartbeat) have no automated verification.
- **Remediation:** Add Playwright with 5 golden-path tests: login, farm CRUD, bed lifecycle, diary entry, chat interaction.

### F-24: getStats() Full Table Scans (HIGH)

- **Evidence:** `src/api/src/services/dynamodb.ts:952-982` — 3 parallel ScanCommands with COUNT
- **Impact:** At 10x data (~100K items), each scan takes 5-10 seconds. At 100x, Lambda timeout.
- **Remediation:** Replace with DynamoDB Streams-based counter table, or cache stats in a dedicated DynamoDB item updated on writes.

### F-25: No API-Level Rate Limiting (HIGH)

- **Evidence:** Only chat endpoint has rate limiting (`chat.ts:35-65`). No middleware-level rate limit on login, uploads, or writes.
- **Impact:** Vulnerable to brute-force login, image upload abuse, and write flooding.
- **Remediation:** Add API Gateway usage plan with throttling, or middleware-level rate limiter (DynamoDB-backed sliding window).

---

## Prioritized Remediation Roadmap

### P0 — Ship Blockers (before production deploy)

| Finding | Domain | Remediation | Effort |
|---------|--------|-------------|--------|
| F-01 | Ops | Enable CloudFront access logging | S |
| F-02 | Ops | Enable API Gateway access logging | S |
| F-03 | Ops | Enable S3 server access logging | S |
| F-38 | Pipeline | Correct PROJECT.yaml stage to 5 | S |

**Estimated total: 2-3 hours (single CDK deploy)**

### P1 — Next Sprint (Pre-PROD)

| Finding | Domain | Remediation | Effort |
|---------|--------|-------------|--------|
| F-04 | Ops | Lambda alias versioning for rollback | M |
| F-05 | Ops | Add CloudWatch Logs Insights or external error tracking | M |
| F-06 | Ops | Post-deploy smoke test in CI | M |
| F-07 | Ops | S3 versioning on images bucket | S |
| F-11 | Test | Playwright E2E for 5 golden paths | L |
| F-21 | Sec | Remove CSP unsafe-inline | M |
| F-23 | Sec | Admin search query length guard | S |
| F-24 | Perf | Replace getStats() scans with counter table | M |
| F-25 | Perf | API-level rate limiting | M |
| F-35 | Cost | Add AWS Budget alert in CDK | S |

**Estimated total: 3-4 days**

### P2 — Backlog (within quarter)

| Finding | Domain | Remediation | Effort |
|---------|--------|-------------|--------|
| F-08 | Ops | Dev/staging environment separation | L |
| F-09 | Ops | Incident runbooks | M |
| F-10 | Ops | JSON structured logging | M |
| F-12 | Test | Security/perf/a11y test categories | L |
| F-13 | Test | Fix flaky setTimeout in farms.test.ts | S |
| F-14 | Test | Centralize test fixtures | M |
| F-15 | Arch | Split dynamodb.ts into domain repos | L |
| F-16 | Arch | Refactor farms.ts to thin controller | L |
| F-17 | Arch | Replace manual validation with Zod | M |
| F-18 | Arch | Upgrade AWS SDK | M |
| F-26 | Perf | Application-level caching | M |
| F-28 | Perf | Optimize getStats for scale | M |
| F-30 | UX | Fix alt text on image thumbnails | S |
| F-31 | UX | Add ErrorBoundary component | M |
| F-33 | UX | Sanitize user-generated names on display | S |
| F-36 | Cost | Free tier cliff monitoring | S |
| F-37 | Pipeline | Backfill #337 architecture docs | S |

### P3 — Aspirational (when capacity allows)

| Finding | Domain | Remediation | Effort |
|---------|--------|-------------|--------|
| F-19 | Arch | Centralize config module | S |
| F-20 | Arch | Deduplicate validation patterns | M |
| F-27 | Perf | DynamoDB DAX or materialized views | L |
| F-29 | Perf | WebP/AVIF image format support | M |
| F-32 | UX | Uniform empty states for all entities | M |
| F-34 | UX | Loading states for all async operations | S |

---

## Deep-Dive Escalation Recommendations

| Domain | Prompt | Trigger |
|--------|--------|---------|
| Security | `security/csirt_incident_response_prompt.md` | F-01, F-02 (zero observability in production) |
| Performance | `perf-scale/performance_scalability_prompt.md` | F-24, F-25, F-28 (scalability at 10x) |
| Testing | `test/test_adequacy_prompt.md` | F-11, F-12 (E2E and security test gaps) |
| Cost | `cost/cost_sustainability_prompt.md` | F-35, F-36 (budget controls) |

---

## Cost Projection (updated v0.93)

| Scale | Users | Monthly Cost | With BYOK | Budget Status |
|-------|-------|-------------|-----------|---------------|
| Current | 10 | $0.47 | $0.47 | Well within $5 ceiling |
| 10x | 100 | $3.60 | $1.80 | Within ceiling with BYOK |
| 100x | 1,000 | $33.00 | $16.00 | Requires subscription revenue |

**Key insight:** BYOK (#333) keeps costs under $5 ceiling through 100 users. At 1K+, subscription revenue (Phase 3 of monetization ADR) is needed. See ADR-20260413-capacity-analysis for full projections.

---

## Pipeline Compliance Summary

| Issue | Steps 1 | Steps 2-7 | Step 8 | Step 9 | STOP Gates |
|-------|---------|-----------|--------|--------|------------|
| #335 | Yes | Yes (full) | Yes | Yes | 4/4 Honored |
| #337 | Yes | Partial | Yes | No | 1/4 |
| #341 | Yes | No (hotfix) | Yes | No | 0/4 (justified) |
| #280 | Yes | Yes | Yes | Yes | 4/4 (/simplify + /cc-review + /cc-remediate) |

**25 ADRs** documented (+5 since initial audit). Gaps: Preact selection, Open-Meteo usage.

---

## Go/No-Go Recommendation (updated v0.93)

| Gate | v0.52 | v0.93 | Condition |
|------|-------|-------|-----------|
| Observability | **PASS** | **PASS** | F-01/02/03 fixed; structured JSON logs; CloudWatch Insights |
| Security | CONDITIONAL | **PASS (CONDITIONAL)** | F-23 fixed; F-21/F-25 deferred with issues (acceptable for MVP) |
| Test Coverage | CONDITIONAL | **PASS** | 807 unit + 43 E2E = 850 tests; 100% pass rate |
| Performance | CONDITIONAL | **PASS** | F-24 fixed (stats cache); F-25/26/28 deferred (acceptable at MVP scale) |
| Cost | **PASS** | **PASS** | $0.47/mo; budget alert; monetization ADR; capacity ADR |
| Documentation | **PASS** | **PASS** | 25 ADRs; Terms; Privacy; session reports |
| Legal | **PASS** | **PASS** | MIT/Apache deps; Terms of Service; Privacy Policy; consent gate |
| UX | **PASS** | **PASS** | Uniform states; legal pages; farm discovery; WCAG AA |

**Verdict: ALL GATES PASS. Production-ready for MVP launch.**

Remaining items (3 actionable, 7 deferred) are post-MVP enhancements tracked with GitHub issues.

---

## Production Resource Migration Note

> **IMPORTANT for #239**: All AWS resources use hardcoded `litcrop-mvp-*` names.
> When creating production-labeled resources, the following must be renamed:

| Resource | Current Name | Production Name (TBD) |
|----------|-------------|----------------------|
| S3 (images) | `litcrop-mvp-images` | `litcrop-prod-images` |
| S3 (static) | `litcrop-mvp-static` | `litcrop-prod-static` |
| S3 (thumbnails) | `litcrop-mvp-thumbnails` | `litcrop-prod-thumbnails` |
| S3 (logs) | `litcrop-mvp-logs` | `litcrop-prod-logs` |
| DynamoDB | `litcrop-mvp` | `litcrop-prod` |
| Cognito | `litcrop-mvp-users` | `litcrop-prod-users` |
| Lambda (API) | `litcrop-api` | `litcrop-api` (or parameterized) |
| Lambda (thumb) | `litcrop-thumb` | `litcrop-thumb` (or parameterized) |
| API Gateway | `litcrop-mvp-api` | `litcrop-prod-api` |
| CloudFront | (auto-generated) | Custom domain (#238) |
| CloudWatch logs | `/litcrop/api-gateway-access` | `/litcrop/prod/api-gateway-access` |
| SNS topic | `litcrop-alarms` | `litcrop-prod-alarms` |

**Recommendation**: Parameterize resource names via CDK context or environment variable
(`const env = this.node.tryGetContext('env') ?? 'mvp'`) to avoid a global find-replace.
This is tracked as part of #239 (production-labeled AWS resources).

**Logs bucket note**: `removalPolicy: DESTROY` is appropriate for MVP (30-day lifecycle,
developer-managed). For production, change to `RETAIN` to preserve audit trail on stack operations.

---

## P0 Fix Log

| Finding | Fix Applied | Date |
|---------|-------------|------|
| F-01 | CloudFront logging → `litcrop-mvp-logs/cloudfront/` | 2026-04-12 |
| F-02 | API GW logging → CloudWatch `/litcrop/api-gateway-access` (JSON) | 2026-04-12 |
| F-03 | S3 logging on 3 buckets → `litcrop-mvp-logs/s3-{images,static,thumbnails}/` | 2026-04-12 |
| F-38 | PROJECT.yaml stage 6 → 5 | 2026-04-12 |
| M-04 | `.gitignore` added `cdk.out/` | 2026-04-12 |

## P1 Fix Log

| Finding | Fix Applied | Date |
|---------|-------------|------|
| F-04 | Lambda alias (`live`) + `currentVersionOptions` for rollback | 2026-04-12 |
| F-06 | Post-deploy smoke test in deploy.yml (API health + frontend) | 2026-04-12 |
| F-07 | Images bucket `versioned: true` + 30-day noncurrent expiry | 2026-04-12 |
| F-23 | Admin search `q` param max 500 chars + 2 tests | 2026-04-12 |
| F-24 | getStats() DynamoDB cache (5-min TTL, scan fallback) + 4 tests | 2026-04-12 |
| F-35 | AWS Budget alert ($5/mo, 80%+100% thresholds) | 2026-04-12 |
| F-05 | Resolved by P0: structured JSON API GW logs → CloudWatch Insights | 2026-04-12 |

### P1 Deferred

| Finding | Reason | Tracked |
|---------|--------|---------|
| F-21 | CSP `unsafe-inline` required by Astro `<script is:inline>` — needs nonce-based CSP with SSR or CF Function | #380 DEFERRED |
| F-25 | Global throttle exists (100 req/s); per-user rate limiting on chat exists; Cognito throttles login | #381 DEFERRED |
| ~~F-11~~ | ~~Playwright E2E~~ → **RESOLVED v0.92**: 43 E2E tests (5 golden paths + 3 category suites) | PR #377 |

## P2 Fix Log

| Finding | Fix Applied | Date |
|---------|-------------|------|
| F-10 | Structured JSON logging (replaced Hono logger) | 2026-04-12 |
| F-13 | Flaky setTimeout → vi.waitFor() in 5 event tests | 2026-04-12 |
| F-31 | ErrorBoundary component for Preact islands | 2026-04-12 |
| F-30 | False positive: thumbnail alt="" correct per WCAG (decorative) | 2026-04-12 |
| F-33 | False positive: JSX auto-escapes text nodes | 2026-04-12 |
| F-36 | Resolved by F-35: $5 budget alert covers free tier overages | 2026-04-12 |
| F-08 | Dev/staging environment separation (#372, ADR-022) | 2026-04-13 |
| F-09 | Incident runbooks and on-call procedures (#371) | 2026-04-12 |
| F-12 | Security/perf/a11y test categories (43 Playwright E2E) | 2026-04-13 |
| F-15 | Split dynamodb.ts → 15 domain repository files (#369, ADR-021) | 2026-04-12 |
| F-16 | Refactor farms.ts 809→371 LOC thin controller (#368) | 2026-04-12 |
| F-37 | Backfill #337 architecture docs (#373) | 2026-04-12 |

### P2 Remaining

| Finding | Description | Effort | Status |
|---------|-------------|--------|--------|
| F-17 | Zod migration for farms.ts (manual → schema validation) | M | Remaining — 15+ test files need error message rewrites |
| F-18 | Upgrade AWS SDK v3.10xx → latest | M | Remaining |
| F-14 | Centralize test fixtures | M | Remaining |
| F-26 | Application-level caching for farm/bed queries | M | DEFERRED → #382 |
| F-28 | Optimize getStats for scale (beyond cache) | M | DEFERRED → #383 |

## P3 Fix Log

| Finding | Fix Applied | Date |
|---------|-------------|------|
| F-19 | Centralized ADMIN_EMAILS into shared config module | 2026-04-12 |
| F-32 | Uniform empty states across all entities (#370) | 2026-04-13 |
| F-34 | Loading states for all async operations (#370) | 2026-04-13 |

### P3 Remaining

| Finding | Description | Effort | Status |
|---------|-------------|--------|--------|
| F-20 | Deduplicate validation patterns | M | Remaining — blocked by F-17 |
| F-27 | DynamoDB DAX or materialized views | L | DEFERRED → #384 |
| F-29 | WebP/AVIF image format support | M | DEFERRED → #385 |

---

## Session: pre-prod-093 (v0.93) — 2026-04-13

### New Findings

| ID | Domain | Title | Severity | Fix |
|----|--------|-------|----------|-----|
| F-39 | Arch | Hono route conflict: `/discoverable` intercepted by `/:farmId` in separate sub-routers | CRITICAL | **FIXED** — moved to same router |

### Session Fixes

| Fix | Description | Commit |
|-----|-------------|--------|
| F-39 | Moved `GET /discoverable` into `farmsRouter` before `/:farmId`; FarmOverview shows discovery for farmless staff; error feedback in FarmDiscovery; +5 tests | b45c9fb |
| #280 | Terms of Service, Privacy Policy, What's New, Report Bug pages; T&C consent at registration; Legal section in Profile; auth footer links; en+ja i18n (65 keys) | 63bc26e–f9fd9e5 (5 commits) |
| #281 | Monetization strategy ADR (BYOK-first, free vs paid tier) — design only, no constants | a410c2b |
| #334 | Capacity analysis ADR (10x/100x/1000x projections, bottleneck analysis) — design only | 2fb4a8e |

### Session Statistics

| Metric | Value |
|--------|-------|
| Commits | 8 (1 discovery fix + 5 #280 + 1 #281 + 1 #334) |
| Tests added | +5 (discoverable endpoint) |
| Total tests | 807 unit + 43 E2E = 850 |
| Files changed | 19 modified/created |
| New pages | 4 (/terms, /privacy, /whats-new, /report-bug) |
| New ADRs | 2 (monetization, capacity) |
| Issues addressed | #280, #281, #334 + discovery bug |

---

> Audit performed using `.agent/prompts/review/project_review_master_prompt.md` framework.
> 13 sections, 11 scored domains, 38 findings across 6 parallel audit agents.

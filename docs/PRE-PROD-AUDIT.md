# Pre-Production Master Audit — LitCrop v0.52

> **Review date:** 2026-04-12
> **Reviewer:** Claude Code (6 parallel Explore agents, master prompt framework)
> **Scope:** Full cross-domain audit (13 sections, 11 scored domains)
> **Next review:** After Batch A+B fixes, or at v0.60

---

## Engagement Context

- **Project name:** LitCrop
- **Project type:** Web App (SaaS)
- **Tech stack:** Astro 5 + Preact (frontend), Hono + Lambda (API), DynamoDB, S3, CloudFront, Cognito, CDK (IaC), Anthropic Claude Haiku (AI)
- **Distribution model:** SaaS (CloudFront + API Gateway)
- **Stage:** Stage 6 (Enhancement) per PROJECT.yaml; actual maturity Stage 5.5
- **Review scope:** Full

---

## Executive Summary

| Dimension | Rating |
|-----------|--------|
| **Overall project health** | **GOOD** |
| **Project stage alignment** | Stage 6 declared, actual 5.5 — Pre-PROD gates pending |
| **Pipeline discipline** | **ADEQUATE** — exemplary on #335, compressed on #337/#341 |
| **Cost posture** | **EFFICIENT** — $0.47/mo at 10 users, well within $1.18 target |
| **Total findings** | 38 (2 Critical, 10 High, 16 Medium, 10 Low) |

### Top 3 Risks

1. **Zero observability** — CloudFront, API Gateway, and S3 have no access logging. Production incidents would be invisible.
2. **No E2E tests** — 790 unit/integration tests but zero Playwright/Cypress coverage. Device heartbeat flow (#341) has no automated verification.
3. **No rollback strategy** — Lambda deploys overwrite $LATEST with no alias versioning. Rollback requires manual CloudFormation operations.

---

## Domain Scores

| # | Domain | Score | Rating | Findings |
|---|--------|-------|--------|----------|
| 1 | Architecture and Code Health | 3.5 | Fair-Good | 8 |
| 2 | Security Posture | 4.5 | Good-Excellent | 3 |
| 3 | Legal and License Compliance | 5 | Excellent | 1 |
| 4 | UX and Design Quality | 3.5 | Fair-Good | 5 |
| 5 | Performance and Scalability | 2.5 | Poor-Fair | 6 |
| 6 | Operational Readiness | 3 | Fair | 7 |
| 7 | Cost and Financial Sustainability | 4 | Good | 2 |
| 8 | Test Adequacy | 3 | Fair | 4 |
| 9 | Documentation and DX | 4 | Good | 2 |
| 10 | Pipeline and Harness Discipline | 3.5 | Fair-Good | 3 |
| 11 | Project Statistics | 4 | Good | 0 |
| | **Weighted Average** | **3.6** | **Fair-Good** | **38 total** |

---

## Project Statistics Dashboard (Section 11)

### Codebase Metrics

| Metric | Value | Assessment |
|--------|-------|------------|
| Total source lines (excl. generated) | ~35,000 | Healthy for MVP |
| Source files (.ts/.astro/.tsx) | 150 | Moderate |
| Languages / frameworks | TypeScript, Astro, Preact, Hono | Appropriate |
| Direct dependencies | 0 root, ~40 workspace | Lean |
| TODO/FIXME/HACK count | 2 | Excellent |

### Git Health

| Metric | Value | Assessment |
|--------|-------|------------|
| Total commits | 586 | Healthy velocity |
| Active contributors (30 days) | 1 | Solo project |
| Average commit size | 1.4 files | Atomic |
| Conventional commit compliance | 83% (489/586) | Good |
| Unmerged remote branches | 1 | Clean |
| Force pushes to shared branches | 0 | Excellent |

### Issue and PR Throughput

| Metric | Value | Assessment |
|--------|-------|------------|
| Open issues | 17 | Manageable |
| Closed last 30 days | 50 | High velocity |
| Stale issues (no activity >30d) | 0 | Excellent |
| Average issue cycle time | <1 day | Fast |
| Open PRs | 0 | Clean |

### Build and Test Metrics

| Metric | Value | Assessment |
|--------|-------|------------|
| Test count | 790 (37 files) | Good for MVP |
| Test pass rate | 100% | Stable |
| Test duration | 5.0s | Fast |
| E2E test count | 0 | Gap |
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

## Cost Projection

| Scale | Users | Monthly Cost | Budget Status |
|-------|-------|-------------|---------------|
| Current | 10 | $0.47 | Well within $1.18 |
| 10x | 100 | $12-15 | Exceeds $5 ceiling |
| 100x | 1,000 | $100+ | Requires BYOK (#333) |

**Key insight:** At current scale, cost is a non-issue. At 100+ users, Anthropic Haiku API dominates spend. BYOK (#333) is the scaling strategy.

---

## Pipeline Compliance Summary

| Issue | Steps 1 | Steps 2-7 | Step 8 | Step 9 | STOP Gates |
|-------|---------|-----------|--------|--------|------------|
| #335 | Yes | Yes (full) | Yes | Yes | 4/4 Honored |
| #337 | Yes | Partial | Yes | No | 1/4 |
| #341 | Yes | No (hotfix) | Yes | No | 0/4 (justified) |

**20 ADRs** documented. Gaps: Preact selection, Open-Meteo usage, DOMPurify security rationale.

---

## Go/No-Go Recommendation

| Gate | Status | Condition |
|------|--------|-----------|
| Observability | **PASS** | F-01, F-02, F-03 fixed (logs bucket + CloudWatch) |
| Security | **CONDITIONAL** | Fix F-21, F-23, F-25 |
| Test Coverage | **CONDITIONAL** | Add E2E golden paths (F-11) |
| Performance | **CONDITIONAL** | Fix getStats scans (F-24) |
| Cost | **PASS** | $0.47/mo, add budget alert (F-35) |
| Documentation | **PASS** | Comprehensive |
| Legal | **PASS** | All MIT/Apache deps |
| UX | **PASS** | Minor gaps only |

**Verdict: P0 items resolved. P1 items (3-4 days) recommended before GA.**

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
| F-21 | CSP `unsafe-inline` required by Astro `<script is:inline>` — needs nonce-based CSP with SSR or CF Function | CON-256-04 |
| F-25 | Global throttle exists (100 req/s); per-user rate limiting on chat exists; Cognito throttles login | Partially resolved |
| F-11 | Playwright E2E requires infrastructure setup — separate PR | Backlog |

## P2 Fix Log

| Finding | Fix Applied | Date |
|---------|-------------|------|
| F-10 | Structured JSON logging (replaced Hono logger) | 2026-04-12 |
| F-13 | Flaky setTimeout → vi.waitFor() in 5 event tests | 2026-04-12 |
| F-31 | ErrorBoundary component for Preact islands | 2026-04-12 |
| F-30 | False positive: thumbnail alt="" correct per WCAG (decorative) | 2026-04-12 |
| F-33 | False positive: JSX auto-escapes text nodes | 2026-04-12 |
| F-36 | Resolved by F-35: $5 budget alert covers free tier overages | 2026-04-12 |

### P2 Remaining

| Finding | Description | Effort | Blocker |
|---------|-------------|--------|---------|
| F-17 | Zod migration for farms.ts (manual → schema validation) | M | 15+ test files need error message rewrites |
| F-18 | Upgrade AWS SDK v3.10xx → latest | M | None |
| F-08 | Dev/staging environment separation | L | Infra design needed |
| F-09 | Incident runbooks | M | Documentation task |
| F-12 | Security/perf/a11y test categories | L | Playwright setup (F-11) |
| F-14 | Centralize test fixtures | M | None |
| F-15 | Split dynamodb.ts (1879 LOC) into domain repos | L | None |
| F-16 | Refactor farms.ts (809 LOC) to thin controller | L | Depends on F-17 |
| F-26 | Application-level caching for farm/bed queries | M | Design needed |
| F-28 | Optimize getStats for scale (beyond cache) | M | Partially done by F-24 |
| F-37 | Backfill #337 architecture docs | S | Documentation task |

## P3 Fix Log

| Finding | Fix Applied | Date |
|---------|-------------|------|
| F-19 | Centralized ADMIN_EMAILS into shared config module | 2026-04-12 |

### P3 Remaining

| Finding | Description | Effort | Blocker |
|---------|-------------|--------|---------|
| F-20 | Deduplicate validation patterns | M | Blocked by F-17 |
| F-27 | DynamoDB DAX or materialized views | L | Overkill for MVP scale |
| F-29 | WebP/AVIF image format support | M | Image pipeline redesign |
| F-32 | Uniform empty states across all entities | M | UI design per component |
| F-34 | Loading states for all async operations | S | UI polish |

---

> Audit performed using `.agent/prompts/review/project_review_master_prompt.md` framework.
> 13 sections, 11 scored domains, 38 findings across 6 parallel audit agents.

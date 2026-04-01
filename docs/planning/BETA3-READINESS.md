# BETA3-READINESS.md — Beta-3 Sprint Planning (Infrastructure Hardening)

> Date: 2026-04-01 | Status: **PLANNED**
> Prerequisite: v0.29 tagged (Beta-2 + post-deploy hotfixes)
> Target: v0.30 (Beta-3 release)
> Theme: **Foundation hardening — fix the D-grade operations before building more features**

---

## Purpose

Beta-3 focuses on **infrastructure hardening, security posture, and quality foundations** — addressing the critical gaps identified in the v0.29 executive audit. No new user-facing features; this sprint makes the platform safe for real users before Beta-4 adds more functionality.

The audit scored Operations at **D** — no backups, no alarms, no CSP, no rate limiting. Beta-3 brings this to B- minimum.

---

## 1. Prerequisite State

| Item | Value |
|------|-------|
| Tag | v0.29 on develop |
| Tests | 354 passing (20 files) |
| Open Issues | 7 (#160, #168, #183, #187, #204, #205, #207) |
| Audit Grade | Arch B+, API B, UX B, Security C+, **Ops D**, Testing C+, Docs B- |

---

## 2. Beta-3 Scope (Infrastructure + Quick Fixes)

### Production Blockers (from audit)

| ID | Title | Size | Area | Audit Severity |
|----|-------|------|------|----------------|
| H-01 | Enable DynamoDB Point-in-Time Recovery | XS | infra/CDK | CRITICAL — data loss is permanent |
| H-02 | Cognito User Pool removalPolicy → RETAIN | XS | infra/CDK | CRITICAL — cdk destroy wipes accounts |
| H-03 | Add Content-Security-Policy header | S | infra/CDK | HIGH — XSS defense for AI markdown |
| H-04 | API Gateway rate limiting / throttling | S | infra/CDK | HIGH — brute-force, capacity exhaustion |
| H-05 | CloudWatch alarms (5xx, errors, throttling) | M | infra/CDK | HIGH — silent failures |

### Security & Quality

| ID | Title | Size | Area |
|----|-------|------|------|
| H-06 | CloudFront PriceClass → PRICE_CLASS_200 (Asia) | XS | infra/CDK |
| H-07 | Add ESLint to CI pipeline | S | ci/config |
| H-08 | Update API-CONTRACTS.md (11 → 31 endpoints) | M | docs |

### Bug Fix (Beta-2 carry-over)

| ID | Title | Size | Area |
|----|-------|------|------|
| F-03 | Admin delete farm bypass (isAdmin on DELETE route) | S | api |

### Code Quality (deferred suggestions)

| ID | Title | Size | Area |
|----|-------|------|------|
| G1-G2 | i18n "Plot" → "Bed" terminology cleanup | S | frontend |
| G3 | Remove unused `_lat` param in timezone.ts | XS | shared |
| G4 | Type-narrow Anthropic SDK error in chat.ts | XS | api |

### Deferred (not in Beta-3)

| # | Title | Target |
|---|-------|--------|
| #204 | Change password | Beta-4 |
| #205 | Delete own account | Beta-4 |
| #187 | Admin email notifications | Beta-4 |
| #160 | Profile picture support | Beta-4 |
| #168 | Soft delete | PENDING |
| #183 | AI chat on all pages | PENDING |
| #207 | Admin activity log | Backlog |

---

## 3. Implementation Waves

### Wave 0 — Critical CDK Fixes (~1 hr)

One-line or few-line CDK changes that eliminate the worst risks.

| Order | Item | What to Do |
|-------|------|------------|
| 0.1 | H-01 | `pointInTimeRecovery: true` on DynamoDB table |
| 0.2 | H-02 | Cognito User Pool `removalPolicy: cdk.RemovalPolicy.RETAIN` |
| 0.3 | H-06 | CloudFront `priceClass: PriceClass.PRICE_CLASS_200` |

**Deploy**: `cdk deploy` after Wave 0 to activate backups immediately.

### Wave 1 — Security Headers & Rate Limiting (~2 hrs)

| Step | What to Do |
|------|------------|
| 1.1 | **H-03 CSP**: Add CloudFront response headers policy with Content-Security-Policy (default-src 'self', script-src 'self' 'unsafe-inline', style-src 'self' 'unsafe-inline', img-src 'self' data: blob: https:, connect-src 'self' https://*.execute-api.*.amazonaws.com, frame-ancestors 'none') |
| 1.2 | **H-04 Rate limiting**: Add API Gateway throttling — default 100 rps per route, 10 rps on auth endpoints (login/register/reset), 5 rps on chat |
| 1.3 | **CDK deploy** to activate security controls |

### Wave 2 — Monitoring & Alerting (~2 hrs)

| Step | What to Do |
|------|------------|
| 2.1 | **H-05**: CloudWatch alarm — API Lambda error rate > 1% (5-min period) |
| 2.2 | **H-05**: CloudWatch alarm — API Gateway 5xx count > 5 (5-min period) |
| 2.3 | **H-05**: CloudWatch alarm — DynamoDB throttled requests > 0 |
| 2.4 | **H-05**: SNS topic + email subscription for alarm notifications |
| 2.5 | **Optional**: AWS Budgets alarm at $5/month threshold |
| 2.6 | **CDK deploy** to activate monitoring |

### Wave 3 — Bug Fix + Code Quality (~2 hrs)

| Step | What to Do |
|------|------------|
| 3.1 | **F-03**: Pass `isAdmin` to `assertFarmAccess` in DELETE /farms/:farmId |
| 3.2 | **G1-G2**: Rename `add_plot.*` and `plot_detail` i18n keys to Bed (en.json + ja.json) |
| 3.3 | **G3**: Remove unused `_lat` param in timezone.ts |
| 3.4 | **G4**: Type-narrow `err.error?.type` in chat.ts error handler |
| 3.5 | **Tests**: Add test for admin delete bypass |

### Wave 4 — CI & Documentation (~3 hrs)

| Step | What to Do |
|------|------------|
| 4.1 | **H-07**: Add ESLint config + lint step to PR checks workflow |
| 4.2 | **H-08**: Update API-CONTRACTS.md with all 31 endpoints (admin, me, beds, join-requests, members, discoverable) |
| 4.3 | **H-08**: Update README.md deployment status and endpoint count |
| 4.4 | **H-08**: Update PLANS.md scope level (MVP → Beta) |

---

## 4. Dependency Graph

```
Wave 0 (CDK critical) ────► Wave 1 (security) ────► Wave 2 (monitoring)
                                                          │
Wave 3 (bug + quality) ──────────────────────────────────►│
Wave 4 (CI + docs) ──────────────────────────────────────►│
                                                          ▼
                                                     cdk deploy (final)
```

Waves 3 and 4 are independent of Waves 0-2 and can run in parallel.

---

## 5. Estimated Effort

| Wave | Items | Estimate |
|------|-------|----------|
| Wave 0 | H-01, H-02, H-06 + deploy | ~1 hr |
| Wave 1 | H-03, H-04 + deploy | ~2 hrs |
| Wave 2 | H-05 (alarms, SNS, budgets) + deploy | ~2 hrs |
| Wave 3 | F-03, G1-G4 | ~2 hrs |
| Wave 4 | H-07, H-08 (ESLint, docs) | ~3 hrs |
| **Total** | | **~10 hrs** |

---

## 6. Exit Criteria

- [ ] DynamoDB PITR enabled (verified in AWS Console)
- [ ] Cognito removalPolicy is RETAIN
- [ ] CSP header present on CloudFront responses (verified via curl)
- [ ] API Gateway throttling active (verified via 429 on burst)
- [ ] CloudWatch alarms firing to SNS (verified via test alarm)
- [ ] F-03 admin delete bypass working
- [ ] ESLint passing in CI
- [ ] API-CONTRACTS.md covers all 31 endpoints
- [ ] All existing 354+ tests pass
- [ ] Tagged as v0.30 on develop

---

## 7. AWS Cost Impact Analysis

**Constraint**: Monthly cost must not exceed current ~$1.18/month ($5/month ceiling). Any increase requires explicit user approval (hard-stop).

| Item | Service | Cost Impact | Notes |
|------|---------|-------------|-------|
| H-01 PITR | DynamoDB | +$0.20/GB/month | Current table ~1MB → ~$0.00/month. Negligible. |
| H-02 Cognito RETAIN | Cognito | $0.00 | Policy change only, no cost |
| H-03 CSP header | CloudFront | $0.00 | Response headers policy, included in free tier |
| H-04 Rate limiting | API Gateway | $0.00 | Throttling config, no additional cost |
| H-05 Alarms | CloudWatch | +$0.10/alarm × 3 = $0.30/month | 3 alarms. First 10 alarms are free tier → **$0.00** if under 10 total |
| H-05 SNS topic | SNS | $0.00 | First 1M notifications free; email delivery free |
| H-05 Budgets | AWS Budgets | $0.00 | First 2 budget alerts free |
| H-06 PriceClass | CloudFront | -$0.00 to -$0.01 | Slight reduction by excluding expensive regions |
| **Total** | | **~$0.00–$0.20/month** | Well within $5 ceiling |

**Verdict**: All Beta-3 changes fit within free tier or add negligible cost. No hard-stop required.

---

## 8. Design Documentation

Beta-3 is infrastructure-only — no new features requiring UX or API design. Design artifacts:

- [ ] **CDK diff preview** (`cdk diff`) documented before each deploy wave
- [ ] **CSP policy specification** documented in ARCHITECTURE.md security section
- [ ] **Rate limiting table** (per-route limits) documented in API-CONTRACTS.md
- [ ] **Alarm thresholds** documented in ARCHITECTURE.md monitoring section
- [ ] **Updated API-CONTRACTS.md** with all 31 endpoints (Wave 4 deliverable)

No new ADRs needed — all changes implement existing audit recommendations.

---

## 9. Audit Grade Target

| Area | v0.29 | v0.30 Target | How |
|------|-------|-------------|-----|
| Architecture | B+ | B+ | No change needed |
| API Design | B | B | F-03 fix |
| Frontend UX | B | B | No change (features in Beta-4) |
| Security | C+ | B+ | CSP, rate limiting |
| Operations | **D** | **B-** | PITR, alarms, Cognito RETAIN |
| Testing | C+ | C+ | Minor improvement (admin delete test) |
| Documentation | B- | B | API contracts updated, README corrected |

---

*Created: 2026-04-01 | Based on v0.29 executive audit*

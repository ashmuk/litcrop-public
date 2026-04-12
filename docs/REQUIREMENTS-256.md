# REQUIREMENTS-256: Holistic Project Analysis and Quality Review

> Pre-production readiness audit for LitCrop v0.52
> Date: 2026-04-12 | Audited by: cc-define (3 parallel Explore agents)

## Executive Summary

**Verdict: CONDITIONALLY PRODUCTION-READY — 2 critical fixes, 8 high-priority items**

The codebase is well-structured with strong foundations: proper auth at API Gateway, least-privilege IAM, Zod validation on all routes, DynamoDB PAY_PER_REQUEST, and 790 passing tests. The main gaps are **observability** (no logging on CloudFront/API Gateway/S3) and a handful of security hardening items.

---

## Findings by Severity

### CRITICAL (2) — Must fix before production

| ID | Area | Finding | File | Fix |
|----|------|---------|------|-----|
| C-01 | Infra | CloudFront access logging disabled — zero CDN visibility | `infra/lib/litcrop-stack.ts:235` | Set `enableLogging: true`, add S3 log bucket |
| C-02 | Infra | API Gateway access logging not configured — no API audit trail | `infra/lib/litcrop-stack.ts:412-438` | Add `AccessLogSetting` with CloudWatch destination |

### HIGH (8) — Should fix before production

| ID | Area | Finding | File | Fix |
|----|------|---------|------|-----|
| H-01 | Infra | S3 server access logging disabled on 3 buckets | `infra/lib/litcrop-stack.ts:106-147` | Add `serverAccessLogsBucket` to each bucket |
| H-02 | API | Missing tests for notification.ts and activity.ts | `src/api/src/services/` | Add integration test files |
| H-03 | Infra | Lambda 512MB may be insufficient for chat + sharp | `infra/lib/litcrop-stack.ts:265` | Increase to 1024MB |
| H-04 | API | DELETE /me error leaks raw error instead of AppError | `src/api/src/routes/me.ts:133` | Throw `ServiceUnavailableError` |
| H-05 | Frontend | Markdown rendering uses innerHTML — verify DOMPurify config covers ALLOWED_TAGS/ATTR | `ChatAssistant.tsx:102` | Audit sanitization rules in markdown.ts |
| H-06 | Frontend | Hardcoded Leaflet CDN URLs without env override | `FarmLocationMap.tsx:11` | Move to env var / config |
| H-07 | Frontend | Index-based React keys in dynamic lists (ChatAssistant, FarmWizard, DeviceList) | Multiple files | Use stable IDs as keys |
| H-08 | API | Missing max-length validation on admin search `q` param | `src/api/src/routes/admin.ts:140` | Add `q.length > 1000` guard |

### MEDIUM (10) — Fix during Pre-PROD sprint

| ID | Area | Finding | File | Fix |
|----|------|---------|------|-----|
| M-01 | Infra | Cognito token validity 1h (industry: 15-30min) | `infra/lib/litcrop-stack.ts:68-70` | Reduce to 30min, add refresh rotation |
| M-02 | Infra | CSP `script-src 'unsafe-inline'` defeats XSS protection | `infra/lib/litcrop-stack.ts:186` | Remove `unsafe-inline`, use nonce-based CSP |
| M-03 | Shared | `DiscoverableFarm` type has no Zod schema | `packages/shared/src/types/domain.ts:246` | Add schema to `schemas/index.ts` |
| M-04 | Git | `.gitignore` missing `cdk.out/` directory | `.gitignore` | Add `cdk.out/` and `*.cloudformation.json` |
| M-05 | API | No env var validation at Lambda cold start | `src/api/src/handler.ts` | Add startup check for TABLE_NAME, COGNITO_USER_POOL_ID |
| M-06 | Frontend | `console.error()` statements in production code | `ProfilePage.tsx`, `AuthGuard.tsx`, `ThemeSwitcher.tsx` | Remove or guard with dev-only check |
| M-07 | Frontend | Large component files (ProfilePage 1098 LOC, AdminDashboard 840, DiaryPage 787) | Multiple | Extract sub-components, lazy-load modals |
| M-08 | Frontend | Missing `<label htmlFor>` associations on some form inputs | `BedDetail.tsx:420` | Add explicit label associations |
| M-09 | Frontend | Promo code `LITCROP2026` hardcoded in frontend bundle | `RegisterForm.tsx:59` | Move validation to backend API |
| M-10 | API | In-memory rate limiter resets on Lambda cold start | `chat.ts:35-65` | Replace with DynamoDB atomic counter (TODO exists) |

### LOW (3) — Nice to have

| ID | Area | Finding | File | Fix |
|----|------|---------|------|-----|
| L-01 | API | Hardcoded `ap-northeast-1` region fallback | `admin.ts:26` | Fail explicitly if AWS_REGION not set |
| L-02 | Frontend | Toast notifications use no UUID key | `Toast.tsx` | Add unique ID to toast data |
| L-03 | Frontend | Type assertion on Leaflet map instance | `FarmLocationMap.tsx:90` | Add runtime type check before `.remove()` |

---

## Positive Findings (No Action Needed)

| Area | Finding |
|------|---------|
| Auth | JWT validation at API Gateway level — zero Lambda cost for auth |
| IAM | Least-privilege policies properly scoped per Lambda |
| DynamoDB | PAY_PER_REQUEST billing, no unbounded scans, proper GSI usage |
| S3 | Encryption enabled, lifecycle policies correct (Standard to IA to Glacier) |
| Validation | All API routes use Zod schemas from @litcrop/shared |
| IDOR | `assertFarmAccess()` returns 404 (not 403) to prevent enumeration |
| XSS | Chat stub response escapes Markdown special characters |
| Tests | 790 tests / 37 files, critical modules (auth, budget, DynamoDB) covered |
| Shared | Clean barrel exports, 41 types, 124 schema exports |
| Dependencies | CDK 2.114.1, no critical CVE-laden versions detected |

---

## Requirements for Pre-Production

### Functional Requirements

| ID | Requirement | Priority | Linked Finding |
|----|-------------|----------|----------------|
| FR-256-01 | All AWS resources must have access logging enabled | MUST | C-01, C-02, H-01 |
| FR-256-02 | All API error responses must use standard AppError shapes | MUST | H-04 |
| FR-256-03 | All dynamic list components must use stable keys | MUST | H-07 |
| FR-256-04 | Admin search query must be length-bounded | MUST | H-08 |
| FR-256-05 | Lambda memory must support chat + image processing under load | SHOULD | H-03 |
| FR-256-06 | All user-rendered HTML must pass sanitization audit | MUST | H-05 |
| FR-256-07 | Notification and activity services must have test coverage | SHOULD | H-02 |
| FR-256-08 | External CDN URLs must be configurable | SHOULD | H-06 |

### Non-Functional Requirements

| ID | Requirement | Priority | Linked Finding |
|----|-------------|----------|----------------|
| NFR-256-01 | CSP headers must not use `unsafe-inline` | SHOULD | M-02 |
| NFR-256-02 | Cognito token validity must be 30 minutes or less | SHOULD | M-01 |
| NFR-256-03 | No `console.error()` in production frontend bundles | SHOULD | M-06 |
| NFR-256-04 | Client-only promo code validation must move to backend | SHOULD | M-09 |
| NFR-256-05 | CDK build artifacts must not be committed | SHOULD | M-04 |
| NFR-256-06 | Lambda must validate required env vars at cold start | SHOULD | M-05 |

### Constraints

| ID | Constraint | Rationale |
|----|------------|-----------|
| CON-256-01 | AWS monthly cost must stay within $1.18 ceiling ($5 hard cap) | Budget memory override |
| CON-256-02 | Logging buckets must use S3 lifecycle to control storage costs | Constraint from CON-256-01 |
| CON-256-03 | Lambda memory increase (512 to 1024MB) doubles per-invocation cost | Must verify budget impact |
| CON-256-04 | CSP nonce-based approach requires Astro middleware or CloudFront function | Scope increase vs. current SSG |

---

## Recommended Fix Batches

### Batch A: Observability (CRITICAL — blocks production)
- C-01: CloudFront logging
- C-02: API Gateway logging
- H-01: S3 access logging
- M-04: .gitignore for cdk.out
- Estimated: 2-3 hours (infra changes + deploy)

### Batch B: Security Hardening (HIGH)
- H-04: DELETE /me error handling
- H-05: DOMPurify audit
- H-08: Admin search query guard
- M-02: CSP unsafe-inline removal
- M-05: Env var validation
- Estimated: 2-3 hours

### Batch C: Frontend Quality (HIGH/MEDIUM)
- H-06: Leaflet CDN env vars
- H-07: Stable React keys
- M-06: Remove console.error
- M-08: Form label associations
- M-09: Promo code to backend
- Estimated: 3-4 hours

### Batch D: Test Coverage + Performance (HIGH/MEDIUM)
- H-02: notification.ts + activity.ts tests
- H-03: Lambda memory increase
- M-01: Cognito token validity
- M-10: DynamoDB rate limiter
- Estimated: 4-6 hours

---

## Go/No-Go Recommendation

| Gate | Status | Notes |
|------|--------|-------|
| Security | **CONDITIONAL** | Batch A + B required |
| Test Coverage | **PASS** | 790 tests, gaps in 2 services |
| Performance | **PASS** | Haiku on 512MB works; 1024MB recommended |
| Accessibility | **PASS** | Good ARIA, minor label gaps |
| Documentation | **PASS** | ADRs, README, AGENTS.md current |
| Budget | **PASS** | $1.18/mo, within ceiling |

**Recommendation**: Fix Batch A (observability) and Batch B (security) before production deploy. Batches C and D can ship in parallel or as fast-follows.

---

## Next Step
Run `/cc-design` to begin Step 2: Architecture — plan the implementation approach for the fix batches.

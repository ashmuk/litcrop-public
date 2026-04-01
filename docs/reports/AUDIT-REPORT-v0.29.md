# Executive Audit Report — LitCrop v0.29

> Date: 2026-04-01 | Auditor: Claude Opus 4.6 (Analyst)
> Baseline: v0.29 (Beta-2 + 19 post-deploy hotfix PRs)
> Tests: 354/354 (20 files)

---

## Scorecard

| Area | Grade | Rationale |
|------|-------|-----------|
| Architecture | B+ | Right-sized tech choices, clean separation, cost-efficient |
| API Design | B | 31 routes, good auth coverage, inconsistent validation |
| Frontend UX | B | Full screen inventory, mobile-first, good a11y design intent |
| Security | C+ | Strong auth model; missing CSP, rate limiting, MFA |
| Operations | D | No backups, no alarms, no structured logging, no error tracking |
| Testing | C+ | 354 API tests; zero frontend tests, zero E2E |
| Documentation | B- | Extensive design docs; stale API contracts, outdated README |

---

## What's Done Well

1. **Defense-in-depth auth** — JWT at API Gateway (zero Lambda cost) -> auth middleware -> per-route `assertFarmAccess()` ownership checks
2. **CDK quality** — CDK-Nag enabled, SSM SecureString for LLM key, S3 lifecycle policies, RETAIN on stateful resources
3. **Cost discipline** — $0.73-1.18/month achieved on a $5 target. Every tech choice favors free tier.
4. **AI budget controls** — Per-user daily token limits via DynamoDB atomic counters + global cap
5. **Markdown sanitization** — DOMPurify with strict allowlist + URI regexp, `rel="noopener noreferrer"` on links
6. **Deploy pipeline** — OIDC credentials (no long-lived keys), proper cache headers, CloudFront invalidation
7. **i18n** — Full EN/JA bilingual support (336 keys each), inline nav translations to avoid FOUC
8. **Error handling** — Structured global handler with AppError hierarchy, malformed JSON -> 400
9. **Request ID tracking** — X-Request-Id on every request for log correlation
10. **Comprehensive design docs** — 11 ADRs, 87 FRs, 38 NFRs, UX specs for every screen

---

## Critical Gaps

### Production Blockers (ordered by severity)

| # | Gap | Risk | Fix Effort |
|---|-----|------|------------|
| 1 | **No data backup** — DynamoDB PITR disabled, S3 versioning off | Data loss is permanent and unrecoverable | ~30 min CDK |
| 2 | **No Content-Security-Policy header** | DOMPurify bypass -> XSS on AI-rendered markdown | ~1 hr |
| 3 | **No rate limiting** on auth/API endpoints | Brute-force login, DynamoDB capacity exhaustion | ~1 hr CDK |
| 4 | **Cognito `removalPolicy: DESTROY`** | `cdk destroy` permanently deletes all user accounts | 1 line CDK |
| 5 | **No CloudWatch alarms** | System fails silently — no alerting on errors, 5xx, throttling | ~2 hrs CDK |

### Significant Gaps

| # | Gap | Impact |
|---|-----|--------|
| 6 | Zero frontend tests (29 components untested) | AuthGuard or LoginForm regression locks out all users |
| 7 | API docs stale — 20 of 31 endpoints undocumented | New developers can't use admin/me/beds/join APIs |
| 8 | No `DELETE` for beds, images, or tags | Users can create but never remove — data accumulates |
| 9 | `getAllFarms()` + `getAllUserProfiles()` use full table Scan | Admin dashboard breaks at scale (1000+ users) |
| 10 | No lint step in CI | TypeScript issues caught only at type-check, not style/quality |

### Minor / Deferred

| # | Gap | Notes |
|---|-----|-------|
| 11 | Weather timezone hardcoded to Asia/Tokyo | Works for Nagano target; breaks for other regions |
| 12 | CloudFront `PRICE_CLASS_ALL` for Japan-only app | Cost waste on global edge locations |
| 13 | Node.js 20 LTS ends Oct 2026 | Plan migration to 22 |
| 14 | No MFA support | Documented deferral to Production |
| 15 | No offline/service-worker | Problematic for field use with spotty LTE |

---

## Security Analysis

### Auth Flow Completeness

| Flow | Status |
|------|--------|
| Login (email/password) | Complete — Cognito SRP |
| Registration | Complete — self-signup |
| Email verification | Complete — Cognito auto-verify |
| Password reset | Complete — forgot-password flow |
| Change password | **MISSING** — planned Beta-3 (#204) |
| Delete account | **MISSING** — planned Beta-3 (#205) |
| Session refresh | Complete — Cognito refresh tokens (30-day) |
| MFA | **MISSING** — documented deferral |

### Authorization

- All API routes auth-gated in `app.ts:111-124`
- Admin bypass via synthetic `role: 'admin'` conflates system admin with farm admin (latent risk per C3)
- `DELETE /farms/:farmId` missing admin bypass (F-03 — last Beta-2 bug)

### Missing Security Headers/Controls

- No Content-Security-Policy header (critical for AI markdown rendering)
- No rate limiting on auth endpoints (brute-force risk)
- No WAF (documented deferral)
- CORS properly configured (credentials: false)
- Input sanitization solid (DOMPurify with strict allowlist)

---

## API Completeness

### Endpoint Inventory (31 routes)

- **Farms**: GET/POST/PATCH/DELETE + members, join-requests, discoverable (13 routes)
- **Beds**: GET/PATCH + images (4 routes)
- **Images**: GET + tags (3 routes)
- **Weather**: GET proxy (1 route)
- **Chat**: POST + usage (2 routes)
- **Admin**: stats/users/farms (3 routes)
- **Me**: profile/settings/join-requests (5 routes)

### Missing Operations

- No `DELETE /beds/:bedId` — beds cannot be removed
- No `DELETE /images/:imageId` — images cannot be deleted
- No `DELETE /images/:imageId/tags/:tagId` — tags are permanent
- No `DELETE /api/v1/me` — account deletion (planned #205)
- No `POST /api/v1/me/avatar` — profile picture (planned #160)

### Validation Inconsistency

- PATCH routes use Zod schemas (consistent)
- POST /farms uses manual `validateFarmFields()` (not Zod)
- POST /chat has no Zod validation on message structure
- POST /images tags uses `isValidTagValue()` helper (not Zod)

---

## Operational Readiness

| Area | Status | Detail |
|------|--------|--------|
| Monitoring | Weak | Lambda CloudWatch only, no custom alarms |
| Logging | Basic | `console.error` + Hono logger, no structured JSON, no correlation |
| Error tracking | None | No Sentry/Datadog/structured error reporting |
| DynamoDB backup | **Disabled** | PITR off, `removalPolicy: RETAIN` only |
| S3 backup | **Disabled** | Versioning off on all buckets |
| Cost monitoring | None | No AWS Budgets alarm defined |
| Performance | Good | 512MB Lambda, ARM64, CACHING_OPTIMIZED CloudFront |

---

## Testing Coverage

| Area | Tests | Status |
|------|-------|--------|
| API routes (9 files) | ~122 | Good |
| Services (DynamoDB, S3, budget) | ~62 | Good |
| Middleware (auth, ownership) | ~28 | Good |
| Contract tests (Zod schemas) | ~23 | Good |
| Shared package | ~99 | Good |
| App-level | ~10 | Basic |
| **Frontend components** | **0** | **Critical gap** |
| **E2E tests** | **0** | **Critical gap** |
| **Accessibility tests** | **0** | **Gap** |

---

## Recommendation

### Immediate (before Beta-3 features)

A **"Wave -1" hardening sprint** (~4-5 hrs) addressing the top 5 blockers:

1. `pointInTimeRecovery: true` — prevents permanent data loss
2. Cognito `removalPolicy: RETAIN` — prevents account wipeout on cdk destroy
3. Add CSP header to CloudFront — response headers policy
4. API Gateway throttling config — per-route limits
5. CloudWatch alarms (5xx, Lambda errors, DynamoDB throttling)

### Then Beta-3 features (per BETA3-READINESS.md)

Wave 0-4 as planned: F-03, #204, #205, #187, #160, G1-G2

---

*Generated: 2026-04-01 | Model: Claude Opus 4.6 (1M context)*

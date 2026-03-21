# REPORT_MVP.md — LitCrop MVP Status Report

> Date: 2026-03-21
> Version: v0.8 (tagged) → working toward v0.9
> Branch: develop (not yet merged to main)
> Status: **DEPLOYED** — live on AWS, pending refinement

---

## Executive Summary

The LitCrop MVP is deployed and functional at https://dpj8a3mk3tzkq.cloudfront.net. Users can register, log in, create a farm, add crop plots, view weather, and interact with the AI chatbot (stub mode). The deployment includes 46 AWS resources managed via CDK.

**Honest assessment:** The MVP delivers significant engineering improvements over the PoC (auth, security, infrastructure, test coverage) but the user-facing experience is largely unchanged. The screens look identical to the PoC. The visible additions are login/register screens, a plot creation wizard, a camera upload button, and an admin stats page. From a user's perspective, the difference between PoC and MVP is minimal.

This report documents the current state, what works, what doesn't, and the path forward.

---

## What Changed: PoC → MVP

### Invisible but Critical (user can't see these)

| Area | PoC | MVP |
|------|-----|-----|
| **Auth** | None (public API) | Cognito + JWT + token refresh + route guards |
| **Data isolation** | Shared demo data | Per-user DynamoDB with ownership checks |
| **Infrastructure** | Manual AWS CLI scripts | CDK stack (46 resources, one command) |
| **AI Chat** | Raw fetch() to Anthropic | @anthropic-ai/sdk, multi-turn, tool use |
| **Security** | No auth, no validation | JWT authorizer, input validation, XSS protection |
| **Tests** | ~50 basic tests | 279 tests across 17 files |
| **Budget** | None | Per-user + global token limits |
| **Thumbnails** | None | Auto-generated 300x300 via Lambda |

### Visible to Users

| Feature | PoC | MVP |
|---------|-----|-----|
| Login/Register | None | New screens (Cognito-backed) |
| Plot creation | None (pre-seeded data) | 3-step guided wizard |
| Camera upload | None | File input on PlotDetail |
| Admin stats | None | /admin/ page with entity counts |
| Chat language | English only | Localized stub (en + ja) |
| Empty states | "Connect camera node" | "Add your first crop plot" |
| Farm name in titles | Missing | Patched via DOMContentLoaded |
| Cross-device sync | N/A (single user) | Auto-fetch farm on login |

---

## Live Deployment

| Resource | URL / Value |
|----------|-------------|
| **Frontend** | https://dpj8a3mk3tzkq.cloudfront.net |
| **API** | https://jpg5gd81uc.execute-api.ap-northeast-1.amazonaws.com/ |
| UserPoolId | ap-northeast-1_XXXXXXXXX |
| UserPoolClientId | 5bm4tnbd4kuhjcour2p0n4aldq |
| DynamoTableName | litcrop-mvp |
| Region | ap-northeast-1 (Tokyo) |
| AWS Account | <AWS_ACCOUNT_ID> |
| Cost estimate | ~$0.01-1.18/month |

### Deploy Issues Encountered and Fixed (5 total)

| Issue | Fix | Commit |
|-------|-----|--------|
| IAM permissions for CDK bootstrap | Attached AdministratorAccess | Manual |
| SSM SecureString in Lambda env | Removed env var, Lambda reads SSM at runtime | 1837834 |
| Thumbnail Lambda sharp bundling | Added depsLockFilePath | 1837834 |
| CloudFront URL rewrite for Astro SSG | Added CloudFront Function | a616830 |
| Cognito ID token vs Access token | Use IdToken for JWT authorizer | ef7051b |
| CORS preflight blocked by ANY route | Replaced with explicit methods | 9fd271a |

---

## What Works

| Feature | Status | Notes |
|---------|--------|-------|
| User registration | ✅ Working | Email + password + verification code |
| User login | ✅ Working | Token refresh, session persistence |
| Farm creation | ✅ Working | GPS location, auto-redirects to dashboard |
| Cross-device sync | ✅ Working | Login fetches farm from API |
| Plot creation | ✅ Working | 3-step wizard, auto-creates Field+Bed |
| Farm overview | ✅ Working | Lists plots with status, filterable |
| Plot detail | ✅ Working | Image history, status tagging |
| Weather display | ✅ Working | 7-day forecast from Open-Meteo |
| Chat (stub mode) | ✅ Working | Localized, no developer text |
| Admin stats | ✅ Working | Entity counts, budget usage |
| Auth guards | ✅ Working | Redirects to login when unauthenticated |
| API health | ✅ Working | /health and /api/v1/health return 200 |

## What Doesn't Work or Needs Improvement

| Issue | Severity | Status |
|-------|----------|--------|
| Weather shows English labels in Japanese mode | BUG | Hydration timing issue — i18n keys exist but Preact islands hydrate before locale is set |
| Camera upload untested on real device | UNKNOWN | Code exists, needs real-device verification |
| Chat returns stubs, not real AI advice | EXPECTED | LLM_API_KEY not set — intentional for MVP |
| Settings don't sync across devices | BY DESIGN | localStorage only, no server endpoint (#90) |
| One farm per user | LIMITATION | Multi-farm support planned for v1.0+ (Phase 4) |
| No IoT device management | SCOPE | Static guide page planned for v1.0+ (Phase 5) |
| Desktop layout minimal | SCOPE | Only weather page has desktop grid |

---

## Metrics

| Metric | PoC (v0.7) | MVP (v0.8) |
|--------|-----------|-----------|
| Git commits | — | 34 since v0.7 |
| Files changed | — | 103 files (+16,962 / -2,341 lines) |
| Test count | ~50 | 279 (17 files) |
| Test pass rate | Unknown | 100% (279/279) |
| Type errors | Unknown | 0 |
| AWS resources | ~5 (manual) | 46 (CDK-managed) |
| API endpoints | 11 | 14 (+GET /farms, +POST /farms/:id/plots, +GET /admin/stats) |
| GH issues | 72 | 103 total (1 open, 102 closed) |
| Session reports | 7 (v0.1-v0.7) | 10 (+ v0.8.1-v0.8.4) |
| Estimated cost | ~$0.68/month | ~$0.01-1.18/month |

---

## Teams Used (This Session)

| Team | Purpose | Agents | Tasks |
|------|---------|--------|-------|
| RITCROPPERS | SDK migration + remediation | architect, builder, reviewer | 6 tasks |
| SIMPLIFIERS | Code simplification review | 3 reviewers + fixer | 4 tasks |
| RITCROPPERS-DEPLOY | AWS deployment | deployer, validator | 6 tasks |
| MVP-POST-FIXERS | Post-deploy refinement | 2 builders + reviewer | 9 tasks |

---

## Remaining Work (MVP-POST-PLAN.md)

### v0.9 Scope (before CI/CD cutoff)

| Phase | Items | Effort | Status |
|-------|-------|--------|--------|
| Phase 1 | A1-A8: Core UX fixes | ~4 hrs | ✅ COMPLETE |
| Phase 2 | Quick fixes + deploy bugs | ~1 hr | ⏳ PENDING |
| Phase 3 | Tech debt sweep (10 SHOULD-FIX) | ~2 hrs | ⏳ PENDING |
| CI/CD | Pipeline setup | ~1 hr | ⏳ PENDING |

### v1.0+ Scope (through CI/CD pipeline)

| Phase | Items | Effort | Status |
|-------|-------|--------|--------|
| Phase 4 | Multi-farm architecture (ADR) | ~3-4 hrs | ⏳ PENDING |
| Phase 5 | New features + optimization | ~4.5 hrs | ⏳ PENDING |

### Post-MVP Backlog (Production)

- IoT device management (F7)
- Full admin dashboard (F9)
- Custom domain + TLS
- Runtime SSM fetch for real AI chat
- Scoped IAM for deploy user
- Interactive map view
- Desktop responsive polish

---

## Key Decisions Made

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | CDK over manual scripts | One-command deploy, drift detection, rollback |
| 2 | Cognito ID token (not Access) | API Gateway v2 JWT authorizer requires `aud` claim |
| 3 | CloudFront Function for URL rewrite | S3 OAI doesn't resolve directory index files |
| 4 | Explicit HTTP methods (not ANY) | OPTIONS preflight must bypass JWT authorizer |
| 5 | One farm per user (MVP) | Simplified data model, multi-farm in Phase 4 |
| 6 | Chat stub mode (no real AI) | LLM API key not configured, intentional for MVP |
| 7 | Auto-create Field+Bed for plots | 3-tier hierarchy transparent to users |
| 8 | Manual-first UX (no IoT dependency) | App must work without camera hardware |
| 9 | v0.9 = Phase 1-3 + CI/CD | Tech debt cleaned before CI/CD protects codebase |
| 10 | Engineering-first → UX-first shift | MVP prioritized architecture; v1.0+ should prioritize visible UX |

---

## Honest Reflection

The MVP achieved its engineering goals: secure auth, production infrastructure, comprehensive tests, and a clean deployment pipeline. However, it did not significantly advance the user experience beyond the PoC. A user comparing the two would struggle to identify differences beyond the login screen.

**Lesson learned:** Future phases should apply a "will the user notice?" filter to prioritize work. Engineering quality is necessary but not sufficient — users evaluate by what they can see and do.

**Next steps decision point:** After completing Phase 2 (quick fixes) and Phase 3 (tech debt), evaluate whether to:
- Tag v0.9 and set up CI/CD → proceed with Phase 4-5 via pipeline
- OR invest in a UX polish sprint to make the MVP visually distinct from the PoC before tagging

This decision should be made after the Phase 3 hard stop.

---

> Generated by Claude Opus 4.6 | MVP Status Report | 2026-03-21

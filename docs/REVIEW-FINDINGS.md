# REVIEW-FINDINGS.md — Phase H Code Review

> Reviewer: my-reviewer (Phase H)
> Date: 2026-03-20
> Scope: 3 commits on `develop` (57 files), Phases 0-5 implementation
> Verdict: **CONDITIONAL PASS**

---

## Verdict Summary

The implementation is well-structured with consistent patterns, thorough ownership enforcement, proper atomic budget counters, and a layered security architecture (API Gateway JWT Authorizer + Hono middleware). The codebase is production-ready at the MVP scope level with the exceptions noted below.

**CONDITIONAL PASS** -- merge to `develop` is acceptable after resolving all MUST-FIX items. No MUST-FIX items are security blockers in the deployed configuration (API Gateway validates JWTs before Lambda), but they represent correctness issues and architectural misalignments that must be addressed before the deploy gate.

---

## H1: Security Audit

### MUST-FIX

| # | File:Line | Issue | Severity |
|---|-----------|-------|----------|
| S1 | `src/api/src/middleware/auth.ts:65-80` | **JWT payload decoded without signature verification in Path 2.** The fallback path base64-decodes the Bearer token payload and trusts `sub` without any signature check. In production, API Gateway validates JWTs first (confirmed: CDK stack line 297-304 deploys a JWT Authorizer with catch-all `/{proxy+}`). However, if the Lambda is ever invoked directly (e.g., via `aws lambda invoke` by an IAM principal in the account), Path 2 would accept forged tokens. **Mitigation**: Gate Path 2 behind `NODE_ENV !== 'production'` or add a resource policy restricting Lambda invocation to API Gateway only. | **MUST-FIX** |
| S2 | `src/api/src/middleware/auth.ts:65-80` | **No audience/issuer validation in Path 2.** Even if Path 2 is dev-only, it accepts any JWT from any issuer that has a `sub` claim. A token from a different Cognito User Pool or a completely unrelated system would be accepted. | **MUST-FIX** |

### SHOULD-FIX

| # | File:Line | Issue | Severity |
|---|-----------|-------|----------|
| S3 | `src/api/src/app.ts:105-106` | **Missing auth middleware on `/api/v1/plots` and `/api/v1/images` root paths.** Only `plots/*` and `images/*` are covered. Currently safe (routers only define sub-routes), but if `GET /api/v1/plots` or `GET /api/v1/images` is added, it bypasses auth. Inconsistent with farms pattern (lines 103-104 cover both root and wildcard). | **SHOULD-FIX** |
| S4 | `src/api/src/services/dynamodb.ts:55-57` | **Pagination cursor deserialization is a potential DynamoDB injection vector.** `decodeCursor` parses arbitrary base64-encoded JSON and passes it directly as `ExclusiveStartKey`. A crafted cursor could reference another user's PK/SK combination. Add validation that decoded cursor PK matches the expected query pattern. | **SHOULD-FIX** |
| S5 | `src/api/src/routes/chat.ts:24` | **In-memory rate limiter ineffective in Lambda.** Resets on cold start; different containers have independent stores. A user can bypass the 20 msg/hr limit by timing concurrent requests. The DynamoDB budget is the real guard, but the documented rate limit (FR-9.10) is not reliably enforced. Move to DynamoDB or document as best-effort. | **SHOULD-FIX** |
| S6 | `src/api/src/routes/chat.ts:196` | **User input reflected unsanitized in stub response.** `stubResponse()` embeds the user's message in Markdown: `*"${message}"*`. If rendered as HTML without sanitization, this could enable XSS. Escape or strip Markdown special characters. | **SHOULD-FIX** |
| S7 | `src/api/src/routes/chat.ts:143-144` | **Upstream LLM error body logged to CloudWatch.** Full error text from Anthropic/OpenAI API is logged. If the upstream response contains sensitive info (echoed API key, internal details), it persists in logs. Truncate or redact. | **SHOULD-FIX** |
| S8 | `infra/lib/litcrop-stack.ts:250` | **Thumbnail Lambda over-permissioned.** `table.grantWriteData(thumbnailLambda)` grants PutItem, UpdateItem, DeleteItem, BatchWriteItem on all items. The Lambda only needs UpdateItem on image records. Replace with a scoped IAM policy. | **SHOULD-FIX** |

### SUGGESTION

| # | File:Line | Issue | Severity |
|---|-----------|-------|----------|
| S9 | `src/frontend/src/lib/auth.ts:83` | **Refresh token stored in localStorage.** Long-lived (30-day) Cognito refresh token accessible to any JS on the page. Acceptable for MVP; flag for Production (use httpOnly cookies or in-memory only). | SUGGESTION |
| S10 | `infra/lib/litcrop-stack.ts:42-43,76` | **Cognito User Pool and DynamoDB table have DESTROY removal policy.** `cdk destroy` permanently deletes all user accounts and data. Documented as MVP-acceptable via CDK-nag suppressions. | SUGGESTION |
| S11 | `src/api/src/routes/plots.ts:325` | **`storage_key` exposed in POST image response.** Leaks internal S3 path structure. Not directly exploitable but unnecessary information disclosure. | SUGGESTION |

### Positives

- API Gateway JWT Authorizer provides zero-Lambda-cost authentication at the edge
- Ownership enforcement is consistent: all 10+ protected endpoints check `user_id === userId`
- 404 returned (not 403) to prevent resource enumeration -- matches API-CONTRACTS.md S4b
- Budget enforcement uses atomic DynamoDB `ADD` operations, preventing race conditions
- S3 buckets have `BlockPublicAccess.BLOCK_ALL` and server-side encryption
- CDK-nag is enabled with documented suppressions
- Health endpoints are properly public (both at API Gateway and Hono level)
- CORS properly includes `Authorization` header

---

## H2: Contract Alignment

### MUST-FIX

| # | File:Line | Issue | Severity |
|---|-----------|-------|----------|
| C1 | `src/api/src/routes/chat.ts:125-156` | **Chat route uses raw `fetch()` instead of `@anthropic-ai/sdk`.** ADR-009 specifies the Anthropic SDK for the AI/LLM framework. The implementation uses direct HTTP calls to `api.anthropic.com/v1/messages`. This means: (a) no multi-turn conversation support (no conversation history loading from DynamoDB), (b) no tool use (`get_farm_data`, `get_weather`), (c) no streaming SSE support, (d) test mock strategy in TEST-STRATEGY.md S3/S8 (mock `@anthropic-ai/sdk`) is inapplicable. These are MVP requirements per FR-9.5, FR-9.6, FR-9.7. | **MUST-FIX** |

### SHOULD-FIX

| # | File:Line | Issue | Severity |
|---|-----------|-------|----------|
| C2 | `packages/shared/src/types/api.ts:117-138` | **`WeatherResponse` shared type missing fields.** Backend returns `apparent_temperature`, `weather_code` in `current`, and `cached_at` at top level. These are absent from the shared type. Frontend may access them without type safety. | **SHOULD-FIX** |
| C3 | `packages/shared/src/types/api.ts` (ChatResponse) | **`ChatResponse` missing `conversation_id`.** Backend returns `{ reply, suggestions, conversation_id }` but the shared type only defines `reply` and `suggestions`. The field is undocumented in the contract. | **SHOULD-FIX** |
| C4 | `src/frontend/src/lib/api.ts:139,144` | **`createFarm` / `updateFarm` return type mismatch.** Functions declare `Promise<FarmResponse>` but POST/PATCH return a flat farm object (no `fields` array). `FarmResponse` extends `Farm` with fields. | **SHOULD-FIX** |
| C5 | `src/frontend/src/lib/api.ts` | **Missing `getUsage()` function.** Frontend API client covers 10 of 11 endpoints but has no function for `GET /api/v1/usage`. | **SHOULD-FIX** |

### SUGGESTION

| # | File:Line | Issue | Severity |
|---|-----------|-------|----------|
| C6 | `src/api/src/services/budget.ts:36` | **Chat model name exposed in `GET /usage` response.** The `CHAT_MODEL` env var value is returned to the client. Minor but unnecessary information exposure. | SUGGESTION |

---

## H3: Code Quality

### MUST-FIX

| # | File:Line | Issue | Severity |
|---|-----------|-------|----------|
| Q1 | `src/api/src/routes/farms.ts:201` | **TS2339: `field_id` missing from fallback object.** Line 207 accesses `meta.field_id` but the fallback at line 201 is `{ bed_name: '', field_name: '' }` -- missing `field_id`. Fix: add `field_id: ''` to the fallback. | **MUST-FIX** |
| Q2 | `infra/lib/litcrop-stack.ts:202-210` | **Missing Lambda env vars for chat/budget.** CDK stack does not set `LLM_API_KEY`, `LLM_API_PROVIDER`, `CHAT_MODEL`, or any `CHAT_DAILY_*_LIMIT` vars. Chat endpoint will always return stub responses in production. Budget limits silently use hardcoded defaults. At minimum `LLM_API_KEY` must be injected (via SSM/Secrets Manager). | **MUST-FIX** |
| Q3 | `src/api/src/routes/weather.ts:176` | **Crash on empty Open-Meteo response.** `transformWeather` accesses `dailyForecasts[0].high` without checking array length. If Open-Meteo returns empty `daily.time`, this throws an unhandled TypeError. Guard: `if (dailyForecasts.length === 0) throw new UpstreamError(...)`. | **MUST-FIX** |

### SHOULD-FIX

| # | File:Line | Issue | Severity |
|---|-----------|-------|----------|
| Q4 | `src/api/src/routes/weather.ts:17` | **Unbounded in-memory cache.** `weatherCache` Map grows with each unique farmId and is never evicted. Could cause OOM in long-lived containers. Add max-size or TTL eviction. | **SHOULD-FIX** |
| Q5 | `src/api/src/routes/chat.ts:264-265` | **Non-null assertions on optional fields.** `budgetResult.user_record!` and `budgetResult.global_record!` rely on implementation detail. Add defensive null checks. | **SHOULD-FIX** |
| Q6 | `src/api/src/routes/images.ts:20-21` | **`assertImageOwnership` swallows `NotFoundError`.** Catches ALL errors (including `NotFoundError` from `getPlotById`) and converts to `ServiceUnavailableError`. If the image's `plot_id` references a deleted plot, the user gets a misleading 503. | **SHOULD-FIX** |
| Q7 | `src/api/src/routes/farms.ts:225`, `farms.ts:261`, `images.ts:86`, `chat.ts:212` | **`c.req.json()` parse errors not caught.** Invalid JSON body throws generic 500 (via global handler) rather than 400 `VALIDATION_ERROR`. Wrap in try-catch or add global JSON-parse middleware. | **SHOULD-FIX** |
| Q8 | `src/api/src/routes/weather.ts:147` | **`wind_direction` returns degrees as string, not cardinal.** `String(225)` produces `"225"` not `"SW"`. The shared type describes it as `string`, but frontend likely expects displayable value. | **SHOULD-FIX** |
| Q9 | `src/api/src/routes/plots.ts:45-47` | **JPEG magic bytes check assumes >= 3 bytes.** `isJpegBytes` doesn't verify buffer length. A 0-2 byte file returns `undefined !== 0xFF`, which happens to work but is fragile. Add `if (bytes.length < 3) return false`. | **SHOULD-FIX** |

### SUGGESTION

| # | File:Line | Issue | Severity |
|---|-----------|-------|----------|
| Q10 | `src/api/src/services/budget.ts:18`, `dynamodb.ts:17` | **TABLE_NAME defaults to `litcrop-poc`.** CDK creates `litcrop-mvp`. Safe in deployed env (env var always set) but local dev hits wrong table. | SUGGESTION |
| Q11 | `src/api/src/routes/farms.ts:136-167` | **N+1 query pattern in GET farm detail.** Nested `Promise.all` creates many DynamoDB round-trips for fields -> beds -> plots. Acceptable for MVP. | SUGGESTION |
| Q12 | `src/api/src/routes/weather.ts:119` | **Timezone hardcoded to `Asia/Tokyo`.** Farm outside Japan would get wrong timezone boundaries. | SUGGESTION |
| Q13 | `src/api/src/services/dynamodb.ts:335-363` | **Tag creation and plot status update not atomic.** Two separate DynamoDB operations; partial failure leaves stale plot status. | SUGGESTION |

---

## H4: Test Coverage

### Summary

| Category | Planned | Actual | Plan Coverage |
|----------|---------|--------|---------------|
| Total test files | ~16 | 13 | 81% |
| Total test cases | ~193 | 186 | 96% |
| S5.11 Auth Middleware | 7 critical cases | 9 tests (3 planned missing) | 57% of plan |
| S5.12 Ownership | 12 critical cases | 18 tests (3 planned missing) | 75% of plan |
| S5.13 Budget | 8 critical cases | 19 tests (1 planned missing) | 88% of plan |
| S5.14 Chat Route (MVP-new) | 9 critical cases | 13 tests (5 planned missing) | 44% of plan |
| S5.15 Usage Route | 5 important cases | 6 tests | 100%+ |
| S5.16 Contract Tests | 14 Zod tests | 12 Zod + 15 structural | 86% of Zod plan |
| S5.17 Thumbnail Tests | 4 important cases | 4+ tests | 100% |
| Test helpers | 3 files | 0 files | 0% |

### MUST-FIX

| # | File:Line | Issue | Severity |
|---|-----------|-------|----------|
| T1 | `src/api/src/__tests__/routes/chat.test.ts` | **5 of 9 planned MVP-new chat test cases missing.** Missing: rate limiting (429 RATE_LIMITED), tool use (get_farm_data, get_weather), conversation history loading, turn limit (>20 messages), Anthropic SDK error -> 502. Maps to FR-9.5, FR-9.6, FR-9.7, FR-9.10, FR-9.11. | **MUST-FIX** |
| T2 | `src/api/src/__tests__/routes/chat.test.ts:161` | **Tests mock `fetch` instead of `@anthropic-ai/sdk`.** Uses `vi.stubGlobal('fetch', ...)` rather than SDK mock per TEST-STRATEGY.md S3/S8. Aligned with C1 (route uses raw fetch), but both need updating for SDK migration. | **MUST-FIX** |

### SHOULD-FIX

| # | File:Line | Issue | Severity |
|---|-----------|-------|----------|
| T3 | `src/api/src/__tests__/middleware/auth.test.ts` | **3 planned critical auth cases missing.** Missing: expired JWT -> 401, wrong `iss` -> 401, `token_use: "id"` -> 401. Middleware delegates these to API Gateway, so may be N/A -- but should be documented. | **SHOULD-FIX** |
| T4 | `src/api/src/__tests__/middleware/ownership.test.ts` | **3 planned ownership write-path cases missing.** Missing: tag User B's image, upload to User B's plot, chat with User B's farm context. | **SHOULD-FIX** |
| T5 | `src/api/src/__tests__/services/budget.test.ts` | **Conversation turn limit test missing.** No test for 20+ turns -> `allowed: false` (FR-9.10). | **SHOULD-FIX** |
| T6 | `src/api/src/__tests__/middleware/ownership.test.ts` | **POST /farms user_id assertion missing.** No explicit test that farm creation sets `user_id = jwt.sub`. | **SHOULD-FIX** |
| T7 | `src/api/src/__tests__/helpers/` | **Shared test helpers not extracted.** Auth helper duplicated across 8 files. Not a correctness issue but maintenance burden. | **SHOULD-FIX** |

### SUGGESTION

| # | File:Line | Issue | Severity |
|---|-----------|-------|----------|
| T8 | `src/api/src/__tests__/contracts.test.ts` | **Standalone Zod tests 13 and 14 not present.** Covered implicitly via integration tests but not as explicit schema unit tests per plan. | SUGGESTION |
| T9 | `packages/shared/src/__tests__/schemas.test.ts` | **Shared schemas test file not created per plan.** | SUGGESTION |

### Positives

- 186 tests across 13 files -- substantial coverage for MVP
- All farmSeed fixtures include `user_id`
- Ownership tests correctly assert 404 (not 403)
- Budget tests verify atomic `ADD` (not `SET`) with explicit assertion
- Usage route and thumbnail tests fully meet plan
- Contract tests cover 12 of 14 planned Zod validations

---

## H5: Cross-Layer Consistency

### Findings

| # | Area | Issue | Severity |
|---|------|-------|----------|
| X1 | CDK -> Lambda | CDK does not inject `LLM_API_KEY`, `LLM_API_PROVIDER`, `CHAT_MODEL`, or `CHAT_DAILY_*_LIMIT` env vars. (Same as Q2) | **MUST-FIX** |
| X2 | Shared types -> Backend | `WeatherResponse` type missing 3 fields backend returns. `ChatResponse` missing `conversation_id`. (Same as C2, C3) | **SHOULD-FIX** |
| X3 | Frontend -> Backend | Frontend API client missing `getUsage()` for `GET /api/v1/usage`. (Same as C5) | **SHOULD-FIX** |
| X4 | Frontend -> Backend | `createFarm`/`updateFarm` return type doesn't match actual response shape. (Same as C4) | **SHOULD-FIX** |

### Positives

- i18n key parity: en.json and ja.json have identical key structures -- no missing translations
- Frontend API paths and HTTP methods match backend route definitions
- CDK CORS origins match Hono CORS origins
- CDK correctly sets TABLE_NAME, S3 bucket names, CLOUDFRONT_ORIGIN, COGNITO vars
- Shared types used consistently for domain entities across layers

---

## Consolidated Summary

### By Severity

| Severity | Count | IDs |
|----------|-------|-----|
| **MUST-FIX** | 8 | S1, S2, C1, Q1, Q2, Q3, T1, T2 |
| **SHOULD-FIX** | 22 | S3-S8, C2-C5, Q4-Q9, T3-T7, X1-X4 |
| **SUGGESTION** | 12 | S9-S11, C6, Q10-Q13, T8-T9 |

### MUST-FIX Summary (blockers for deploy gate)

1. **S1+S2**: Auth middleware Path 2 has no signature/issuer/audience verification -- gate behind `NODE_ENV` or add resource policy
2. **C1+T1+T2**: Chat route uses raw `fetch()` not Anthropic SDK per ADR-009 -- no multi-turn, no tool use, no conversation history. Tests mock fetch instead of SDK.
3. **Q1**: TypeScript error in farms.ts:201 -- missing `field_id` in fallback object
4. **Q2**: CDK stack missing LLM env vars -- chat will always return stubs when deployed
5. **Q3**: Weather route crashes on empty Open-Meteo response -- unguarded array access

### Recommended Fix Order

1. **Q1** (5 min) -- Add `field_id: ''` to fallback. Trivial fix.
2. **Q3** (5 min) -- Add empty-array guard in weather transform. Trivial fix.
3. **S1+S2** (15 min) -- Gate Path 2 behind NODE_ENV check, add iss/aud validation.
4. **Q2** (15 min) -- Add LLM env vars to CDK stack (API key via SSM SecureString).
5. **C1+T1+T2** (2-4 hours) -- Migrate chat route to Anthropic SDK, add multi-turn + tool use. Update tests.

Items 1-4 are quick fixes. Item 5 is the largest gap and may warrant a separate phase if time-constrained -- document the SDK migration as a known deviation with a tracking issue.

---

## Verification Needed

- [ ] `npx tsc --noEmit` in `src/api/` -- confirm Q1 fix resolves TS2339 and no other type errors
- [ ] `npx vitest run` -- confirm all 186 tests pass
- [ ] Confirm API Gateway is sole ingress to Lambda (no function URL, no other triggers)
- [ ] Test pagination cursor manipulation to verify crafted cursors can't leak cross-user data
- [ ] Verify weather endpoint with empty Open-Meteo response (mock test)
- [ ] Run `cdk synth` and review generated IAM policies for thumbnail Lambda scope

---

> **Generated by my-reviewer** | Phase H | 2026-03-20

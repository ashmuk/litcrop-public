# Final MVP+ Review

> Reviewed: 2026-03-22
> Reviewer: my-reviewer (Opus 4.6)
> Scope: Full MVP+ codebase (Phases A-F)
> Tests: 321 passed, 0 failed (19 test files)

## Summary
- MUST-FIX: 1
- SHOULD-FIX: 3
- SUGGESTION: 4
- Status: **needs-remediation** (1 MUST-FIX)

---

## Findings

| # | File:Line | Issue | Severity |
|---|-----------|-------|----------|
| M1 | `infra/lib/litcrop-stack.ts:253` / `src/api/src/services/budget.ts:23` | CDK env var name mismatch: stack sets `CHAT_DAILY_INPUT_LIMIT` but code reads `CHAT_DAILY_USER_INPUT_LIMIT`. The per-user budget env var is never injected, silently falling back to hardcoded defaults. If an operator changes the CDK env var expecting it to take effect, it will not. | MUST-FIX |
| S1 | `src/api/src/routes/admin.ts:30` | Admin authorization failure returns HTTP 403 with error code `UNAUTHORIZED`. The HTTP status 403 is correct (Forbidden), but the error code should be `FORBIDDEN` to distinguish from 401 authentication failures. Frontend `ApiError` consumers may confuse this with actual 401 auth issues. | SHOULD-FIX |
| S2 | `src/frontend/src/pages/plots/view.astro:12` | Deprecated plot view page still references `PlotDetail` title in `<BaseLayout title="LitCrop -- Plot Detail">` and renders nav with "Plot Detail" text. While PlotDetail.tsx correctly redirects, the brief flash of stale UI ("Plot Detail" in title bar) before redirect is a minor UX gap. Consider server-side 301 redirect instead. | SHOULD-FIX |
| S3 | `src/api/src/routes/weather.ts:121` | Weather endpoint hardcodes `timezone: 'Asia/Tokyo'` for all Open-Meteo requests. For multi-farm MVP+ where farms could be outside Japan, this produces incorrect sunrise/sunset times and hourly forecast alignment. The new `packages/shared/src/timezone.ts` utility exists but is not used here. | SHOULD-FIX |
| G1 | `src/frontend/src/i18n/en.json:189-215` | i18n keys `add_plot.*` still reference old "Plot" terminology ("Add Crop Plot", "Create Plot", etc.). These should be updated to "Bed" terminology to match the Phase D data model, or removed if the add-plot wizard is no longer used. | SUGGESTION |
| G2 | `src/frontend/src/i18n/en.json:28` | Screen name `plot_detail` in i18n still says "Plot Detail" -- should be "Bed Detail" for consistency. Same in ja.json line 28. | SUGGESTION |
| G3 | `packages/shared/src/timezone.ts:20` | `_lat` parameter is unused and only present for future use. Consider removing it until needed (YAGNI) or at minimum documenting when it would be needed. Current JSDoc is adequate but the unused param may trigger lint warnings. | SUGGESTION |
| G4 | `src/api/src/routes/chat.ts:306` | `err.error?.type` access uses optional chaining on the Anthropic SDK error object. The `error` property on `Anthropic.APIError` has type `unknown`; accessing `.type` on it should use explicit type narrowing to avoid runtime surprises if the SDK changes its error shape. | SUGGESTION |

---

## Holistic Check Results

### 1. Auth Coverage -- PASS
All API endpoints are auth-gated:
- `/api/v1/farms`, `/api/v1/farms/*` -- authMiddleware registered (app.ts:110-111)
- `/api/v1/beds`, `/api/v1/beds/*` -- authMiddleware registered (app.ts:112-113)
- `/api/v1/plots`, `/api/v1/plots/*` -- authMiddleware registered (app.ts:114-115)
- `/api/v1/images`, `/api/v1/images/*` -- authMiddleware registered (app.ts:116-117)
- `/api/v1/chat` -- authMiddleware registered (app.ts:118)
- `/api/v1/usage` -- authMiddleware registered (app.ts:119)
- `/api/v1/admin`, `/api/v1/admin/*` -- authMiddleware registered (app.ts:120-121)
- Weather routes mount under `/api/v1/farms` so inherit farms auth middleware
- Health endpoints intentionally public (documented)
- API Gateway JWT authorizer provides defense-in-depth at the gateway layer

### 2. Data Model Consistency -- PASS (with suggestions)
- No `plot_id` references in production API routes or shared schemas
- `plots.ts` route correctly returns 410 Gone for all endpoints
- `farms.ts` has 410 Gone handlers for old `/farms/:farmId/plots` endpoints
- Frontend `PlotDetail.tsx` correctly redirects to `/beds/view`
- Schemas use `bed_id` throughout (`ImageDetailResponseSchema`, etc.)
- Test file `schemas.test.ts` explicitly tests rejection of `plot_id` in image responses (line 231-235)
- Remaining `plot_id` references are only in: deprecated redirects, 410 handlers, and test assertions -- all correct

### 3. API Contract Alignment -- PASS
Spot-checked Zod schemas against actual route response shapes:
- `GET /beds/:bedId` returns `{ id, farm_id, row, col, name, crop_type, crop_variety, planted_at, expected_harvest, notes, latest_status, latest_image }` -- matches `BedDetailResponseSchema`
- `POST /images/:imageId/tags` returns `{ id, image_id, tag, note, created_at, bed_status_updated }` -- matches `TagCreateResponseSchema`
- `GET /images/:imageId` returns `{ id, bed_id, node_id, captured_at, uploaded_at, url, thumbnail_url, trigger, content_type, size_bytes, metadata, tags }` -- matches `ImageDetailResponseSchema`
- Weather response schema uses `.passthrough()` to accommodate extra Open-Meteo fields -- correct approach

### 4. CDK Stack Safety -- PASS
- DynamoDB table: `removalPolicy: cdk.RemovalPolicy.RETAIN` (line 79) -- correct for stateful data
- Images bucket: `removalPolicy: cdk.RemovalPolicy.RETAIN` (line 107) -- correct for user content
- Thumbnails bucket: `removalPolicy: cdk.RemovalPolicy.RETAIN` (line 141) -- correct for derived content
- Static bucket: `removalPolicy: cdk.RemovalPolicy.DESTROY` (line 132) -- correct for reproducible build output
- Cognito UserPool: `removalPolicy: cdk.RemovalPolicy.DESTROY` (line 44) -- acceptable for MVP; production should RETAIN
- CDK-Nag enabled with documented suppressions for all MVP deviations

### 5. Frontend Routing -- PASS
- `/settings.astro` -- meta refresh + JS redirect to `/profile/` (line 14-15)
- `/plots/view.astro` -- renders `PlotDetail` component which redirects to `/beds/view?id=...`
- Both use `window.location.replace()` for clean history (no back-button loops)

### 6. Test Coverage Gaps -- ACCEPTABLE
- 321 tests across 19 files covering: routes, middleware, schemas, validation, services, auth, ownership
- Schema tests (34 new) cover all major response shapes including negative cases
- Gap: No integration/contract tests that actually run routes and validate against Zod schemas end-to-end. Acceptable for MVP; recommend adding for production.
- Gap: No tests for `timezone.ts` utility. It is simple enough to verify by inspection but formal tests would be better.
- Gap: Weather route `transformWeather()` function has no unit tests. Open-Meteo response parsing could break silently.

### 7. Dependency Security -- PASS
- `dompurify@^3.3.3` -- latest stable, no known CVEs
- `leaflet@^1.9.4` -- latest 1.x stable
- `marked@^17.0.5` -- latest stable; used with DOMPurify for sanitization (defense in depth)
- `@anthropic-ai/sdk@^0.80.0` -- recent version
- `hono@^4.0.0` -- active framework with security track record
- No `lodash`, `moment`, or other commonly-vulnerable heavy dependencies

### 8. i18n Completeness -- PASS (with suggestions)
- All keys in `en.json` have corresponding translations in `ja.json` (336 lines each)
- Key sets are structurally identical between both locale files
- Suggestion G1/G2 above: legacy "Plot" terminology remains in some i18n keys

---

## Recommendations

### M1: Fix CDK env var name alignment
In `infra/lib/litcrop-stack.ts`, rename the Lambda environment variables to match what the code reads:
```typescript
// Change from:
CHAT_DAILY_INPUT_LIMIT: '50000',
CHAT_DAILY_OUTPUT_LIMIT: '10000',
// Change to:
CHAT_DAILY_USER_INPUT_LIMIT: '50000',
CHAT_DAILY_USER_OUTPUT_LIMIT: '10000',
```
Also add the missing global limit env vars if they should be operator-configurable:
```typescript
CHAT_DAILY_GLOBAL_INPUT_LIMIT: '500000',
CHAT_DAILY_GLOBAL_OUTPUT_LIMIT: '100000',
```

### S1: Use FORBIDDEN error code for 403
In `src/api/src/routes/admin.ts:30`, change:
```typescript
return c.json({ error: { code: 'FORBIDDEN', message: 'Not authorized' } }, 403);
```

### S2: Improve plot redirect
Consider adding a server-side redirect in the Astro config or converting `plots/view.astro` to use an Astro redirect instead of client-side JS.

### S3: Use farm longitude for timezone
In `src/api/src/routes/weather.ts:121`, replace `timezone: 'Asia/Tokyo'` with:
```typescript
timezone: 'auto', // Open-Meteo resolves from coordinates
```
Open-Meteo supports `timezone: 'auto'` which derives timezone from the provided lat/lng.

---

## Verification Needed
- [ ] After M1 fix: verify `cdk synth` succeeds with updated env var names
- [ ] After S3 fix: verify weather response sunrise/sunset times for non-Japan coordinates
- [ ] Run full test suite after all remediations (expect 321+ tests passing)

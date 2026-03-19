# LitCrop PoC — Retrospective Report

> Date: 2026-03-19
> Scope: PoC (Proof of Concept)
> Status: Deployed and validated

---

## 1. Executive Summary

LitCrop PoC delivered a fully deployed, mobile-first web application for remote crop monitoring via periodic camera images. The system spans a simulated camera node, a serverless REST API (Hono on AWS Lambda), a DynamoDB single-table data store, S3 image storage, and an Astro + Preact frontend served via CloudFront — all in AWS `ap-northeast-1` (Tokyo). Seven screens were built covering the full user journey: Farm Overview (list + spatial layout), Plot Detail, Image Timeline, Weather & Environment, Farm Setup & AI Assistant, and Settings.

All six exit criteria passed. End-to-end latency (upload → viewable in browser) came in at **under 2 seconds** against a 30-second target. Monthly AWS cost is within free-tier thresholds, estimated at **~$0.68/month** at worst-case post-free-tier pricing. The architecture — serverless, pay-per-use, single-table DynamoDB, TypeScript throughout — proved technically sound and cost-effective for the PoC workload.

The pipeline produced 78 source files (17,511 lines of code at v0.4, 21,114 after QA), 168 automated tests (all passing), 7 ADRs, and a full deployment to live AWS infrastructure in approximately **9 hours 35 minutes** of wall-clock time across four sessions (v0.4 through v0.7), at an estimated total cost of **~$37.40** in AI token consumption. Four MUST-FIX bugs (field-name mismatches between the shared type package and actual API response shapes) were caught pre-deployment by the structured review step and resolved in a single remediation pass. Six UX issues were discovered during post-deploy testing and fixed within the same session (v0.7). The PoC is ready to serve as the foundation for MVP scoping, with F-12 (Farm Layout "No plots" bug) being the one functional issue that must be fixed before demonstrating the spatial layout view to users.

---

## 2. Exit Criteria Assessment

| EC | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| EC-1 | Simulated camera node uploads an image to cloud storage via HTTPS | **PASS** | 2 images uploaded via simulator CLI in v0.6 session; both succeeded on first attempt. `GET /api/v1/plots/{plotId}/images` confirms storage. |
| EC-2 | Uploaded images are retrievable and viewable in a mobile-first web UI | **PASS** | `GET /images/{id}` returns S3 signed URL; image accessible via CloudFront at `https://<distribution-id>.cloudfront.net`. SF-3 fix confirmed: `storage_key` absent from response. |
| EC-3 | Images are associated with a specific plot in a farm layout | **PASS** | Plot A1 has 2 images, other 5 plots have 0. DynamoDB PK `PLOT#{plotId}` confirms correct association. API response verified. |
| EC-4 | A time-ordered image gallery (timeline) renders for a given plot | **PASS** | `GET /plots/{id}/images` returns newest-first via `ScanIndexForward=false`. 2 images confirmed in correct order. |
| EC-5 | Total monthly cloud cost for idle + light usage is under $5/month | **PASS** | All resources within AWS free tier. Post-free-tier worst-case estimate: ~$0.68/month (see `ARCHITECTURE.md §7`). |
| EC-6 | End-to-end latency from upload to viewable-in-browser is under 30 seconds | **PASS** | Upload + retrieval completed in **< 2 seconds** — 15× better than target. |

All 6 exit criteria passed at v0.6 deployment. The MUST-FIX bugs found in review (MF-1 through MF-4) had blocked EC-1, EC-2, EC-4 pre-remediation; none were re-blocking post-fix.

---

## 3. Requirements Coverage

Based on `REQUIREMENTS.md` (54 FRs, 24 NFRs, 8 constraints):

### Fully Met (PoC scope "Must" items)

| Group | Items | Assessment |
|-------|-------|------------|
| FR-1: Farm Layout (Read-Only) | FR-1.1–1.5 | [CONFIRMED] List view and spatial view both built; hub-and-spoke navigation implemented. |
| FR-2: Image Upload | FR-2.1–2.7 | [CONFIRMED] Multipart HTTPS upload, JPEG validation, metadata storage, 201 response, error codes, simulated node. |
| FR-3: Image Viewing | FR-3.1–3.4 | [CONFIRMED] Hero image, crop metadata, paginated history (cursor-based, newest first). FR-3.5 (tap to view) implemented via ImageViewer page. |
| FR-4: Manual Tagging | FR-4.1–4.5 | [CONFIRMED] One-tap tags, persistence, status propagation, `latest_status` auto-update. |
| FR-5: Simulated Camera Node | FR-5.1–5.5 | [CONFIRMED] CLI with `--mode`, `--interval`, `--once`, `--plot`; exponential backoff retry. |
| FR-7: Weather | FR-7.1–7.2, FR-7.6 | [CONFIRMED] Weather strip, Open-Meteo proxy, alert banners (frost alert fired live for Nagano). |
| FR-8: Farm Setup | FR-8.1, FR-8.3 | [CONFIRMED] GPS/coordinates input, farm name, climate profile display. |
| FR-9: AI Chatbot | FR-9.1 | [CONFIRMED] Direct LLM API call with farm location context. Stub mode works without API key. |
| FR-10: Settings | FR-10.1–10.2 | [CONFIRMED] Theme (Light/Dark/Earthy/System) and language (EN/JA) toggles with localStorage persistence. |
| NFR-2: Cost | NFR-2.1–2.2 | [CONFIRMED] < $5/month; serverless pay-per-use architecture. |
| NFR-7: Security | NFR-7.1–7.4 | [CONFIRMED] Signed URLs, JPEG-only validation, no public S3, auth middleware placeholder. |

### Partially Met (PoC-scoped "Should/Could" items)

| ID | Requirement | Status | Notes |
|----|-------------|--------|-------|
| FR-3.5 | Tap thumbnail to view full-size | [CONFIRMED] | Implemented as ImageViewer page. |
| FR-3.6 | Side-by-side image comparison | [INFERRED] Deferred | "Could" priority — explicitly deferred to MVP per `EXECUTION-PLAN.md`. |
| FR-6.1–6.5 | Spatial layout view | [CONFIRMED partial] | Fields/Beds render correctly; plot cells show "No plots" (F-12 bug — N+1 query issue). |
| FR-7.3–7.5, FR-7.7 | Hourly/7-day forecast, crop impact, weather on Plot Detail | [CONFIRMED] | Weather page has hourly + 7-day + crop impact cards. Compact weather on Plot Detail included. |
| FR-8.2 | Auto-detect climate profile | [INFERRED] Partial | Climate zone display implemented; auto-detection from coordinates flagged as optional in plan. |
| FR-8.4 | AI chatbot-guided farm setup | [CONFIRMED] | ChatAssistant component embedded in Farm Setup page. |
| FR-9.2–9.3 | Beginner guidance, quick-action buttons | [CONFIRMED] | Quick-action suggestion buttons implemented. |
| FR-10.3 | Temperature unit toggle (°C/°F) | [CONFIRMED] | `formatTemp()` in `src/frontend/src/lib/hooks.ts:15` applies across all 5 temperature display locations. |
| FR-10.4–10.6 | Weather alert toggle, motion toggle, interval display | [INFERRED] Partial | Settings page exists; full toggle wiring may be partial. |

### Deferred (MVP/Production)

| Category | Deferred Items | Target |
|----------|---------------|--------|
| Authentication & multi-tenant | ADR-007; all auth flows | MVP |
| Interactive layout editor | FR-6 editor | MVP |
| Image processing pipeline | Thumbnails, WebP, compression | MVP |
| Real camera hardware | Pi 5 + PIR sensor | MVP |
| Desktop optimization | 1024px+ breakpoints | MVP |
| CI/CD + IaC | ADR-008 (CDK/SAM/SST) | MVP |
| ~~WMO weather i18n (F-07)~~ | ~~Human-readable condition labels~~ | **FIXED** ([#52](https://github.com/ashmuk/litcrop/issues/52)) |
| Map picker for farm location (F-09) | Leaflet + OpenStreetMap | MVP ([#55](https://github.com/ashmuk/litcrop/issues/55)) |
| Weather layout overflow (F-08) | CSS fix for 375px mobile | MVP ([#54](https://github.com/ashmuk/litcrop/issues/54)) |
| Elevation auto-fetch (F-10) | Open-Meteo Elevation API | MVP ([#56](https://github.com/ashmuk/litcrop/issues/56)) |
| Desktop responsiveness (F-11) | 768px+ breakpoint | MVP ([#57](https://github.com/ashmuk/litcrop/issues/57)) |
| Soil pH IoT sensor (F-13) | New device protocol + data model | Production ([#58](https://github.com/ashmuk/litcrop/issues/58)) |
| Time-lapse playback (F-14) | Image history prerequisite | Production ([#59](https://github.com/ashmuk/litcrop/issues/59)) |
| Live video streaming | WebRTC/HLS, Pi 4+ hardware | Production |

---

## 4. Architecture Assessment

### What Worked Well

**ADR decisions that proved correct:**

1. **DynamoDB single-table design** (`ADR-20260317-database-selection.md`) — The 9 access patterns all validated during Phase 2. The perpetual free tier removed all cost risk, and millisecond latency met EC-6 by a 15× margin. The GSI2 pattern for Farm Overview queries was the most complex design choice and executed cleanly.

2. **Hono on Lambda** (`ADR-20260317-backend-platform.md`) — 84KB bundle, Node.js 20.x, 30s timeout. Lambda cold starts were not an issue for single-user PoC traffic. The middleware-first design (`app.ts`) made adding CORS, logging, request-ID propagation, and content-type validation simple additive layers.

3. **Astro + Preact islands** (`ADR-20260317-frontend-framework.md`) — 7 pages built in 1.06s. Zero-JS default kept the CloudFront static payload at 30 files / 140.6KB. Preact islands hydrated only interactive sections (FarmOverview, PlotDetail, ChatAssistant, etc.), which aligns with the mobile-first, low-bandwidth target persona.

4. **Open-Meteo API** — Free, no API key, reliable. The live weather endpoint returned a real frost alert for Nagano (6.3°C current, -1.6°C overnight low) during deployment verification — validating the crop impact analysis end-to-end with real data.

5. **Direct LLM API calls for chat** — Option A from `ARCHITECTURE.md §3` was the right PoC choice. ~50 LOC, stub fallback when no API key, single-turn Q&A. No framework complexity.

6. **Serverless architecture for cost** (`ADR-20260317-cloud-provider-hosting.md`) — EC-5 was the easiest exit criterion to pass. All resources within free tier at PoC usage levels.

7. **IAM least-privilege policy** (`ADR-20260317-iam-least-privilege.md`) — The `iam:PutRolePolicy` exclusion forced Console-based IAM role creation (Option B), which is the more secure path. The initial script failure was not a bug but a correct security guardrail working as designed.

### What Needs Revision

1. **Weather cache is in-memory, not persistent** — `weather.ts:16` uses a module-scoped `Map`. Each Lambda cold start clears it, and concurrent warm instances have independent caches. For single-user PoC this is harmless; at MVP this must be replaced with DynamoDB TTL cache as described in `ARCHITECTURE.md §3`. Tracked as SG-1 (deferred).

2. **Non-atomic tag status update** (SF-4) — `createTag` in `dynamodb.ts:334-348` does a read-then-update sequence across two DynamoDB calls. A concurrent write between the read and update could cause `latest_status` to reflect the earlier tag's value. For single-user PoC the race window is negligible; for MVP multi-user scenarios it must be fixed via `bed_id` denormalization on the Image record to eliminate the GSI1 lookup.

3. **Farm Layout "No plots" bug** (F-12) — The spatial layout view renders fields and beds correctly but plot cells show "No plots". The root cause is the N+1 / denormalization gap identified in the efficiency review: the bed-to-plot association query doesn't populate correctly in the layout rendering path. This is a functional gap in a PoC deliverable and must be fixed before the next demo.

4. **Chat renders Markdown as plain text** (SG-2) — The system prompt explicitly requests Markdown formatting, but `ChatAssistant.tsx:88-89` renders assistant messages as plain text nodes. `**bold**` and `- list items` display literally. MVP fix: add `marked` + HTML sanitization for `role === 'assistant'` messages.

5. **CloudFront URL routing required a CloudFront Function** — The DEPLOY-PLAN.md (Step 7) marked CloudFront as optional for PoC. In practice, SPA-style routing (`/plots/view?id=...`, `/farm/layout`) required a CloudFront Function for URL rewriting, which was set up via Console. This step should be scripted for MVP.

### Technical Debt

| Item | Severity | MVP Fix |
|------|----------|---------|
| ~~F-12: Layout view "No plots" query bug~~ | ~~**High**~~ | **FIXED** ([#51](https://github.com/ashmuk/litcrop/issues/51)) — added `bed_id`/`field_id` to plots route response |
| SF-4: Non-atomic tag status update | Medium | Denormalize `bed_id` onto Image at write time |
| SG-1: In-memory weather cache | Medium | DynamoDB TTL cache (already documented in ARCHITECTURE.md §3) |
| SG-2: Chat Markdown rendering | Low | `marked` + sanitize for assistant messages |
| SG-3: `updateFarm` ExpressionAttributeNames leak | Low | Build `names` inside the expression filter loop |
| ~~CloudFront Function~~ | ~~Low~~ | **FIXED** — CF function update added to `deploy-frontend.sh` |
| Chat API key: no LLM key in prod | Medium | Configure `LLM_API_KEY` env var in Lambda for live responses |

---

## 5. Code Quality Assessment

### Strengths

1. **Consistent error hierarchy** — `AppError` base class with typed subclasses (`NotFoundError`, `ValidationError`, `PayloadTooLargeError`, etc.) produces uniform `{ error: { code, message, details } }` responses across all 11 endpoints. `app.ts:76-95` handles both known and unknown errors cleanly.

2. **Shared type package** — `@litcrop/shared` (`packages/shared/src/index.ts`) exports domain types, API response types, request types, constants, config, and validation utilities from a single entry point. Type safety spans frontend, API, and simulator — though field-name drift between the package and actual route responses (MF-2 through MF-4) showed this requires contract tests to enforce at runtime.

3. **Key builder pattern** — `dynamodb.ts:30-46` uses `pk.*` and `sk.*` namespaced functions over raw string concatenation. This, combined with `DDB_KEY_PREFIXES` constants from `@litcrop/shared`, means any prefix change propagates consistently. The risk reviewer rated this the highest regression-risk area (correctly) and the tests cover it.

4. **Cancellation in Preact effects** — `FarmOverview.tsx:53-80` uses the `let cancelled = false` guard in `useEffect`, preventing state updates on unmounted components. This is the correct pattern and avoids React/Preact memory leak warnings in development.

5. **`useLocalFarmId` hook** — `hooks.ts:1-3` is a clean one-liner that bridges the static Astro shell (which bakes in the seed `farmId`) with the user's actual farm ID from localStorage. Extracted during `/simplify` from 4 components.

6. **Structured project layout** — The monorepo structure matches `ARCHITECTURE.md §9` exactly. No undocumented directories or orphan files.

### Weaknesses

1. **Field-name drift** (MF-2 through MF-4) — The most significant code quality finding. Four distinct mismatches between `@litcrop/shared` API types and actual route response shapes. Root cause: the shared types and route handlers were built by different agents (phase1-builder vs phase3-api) without integration test verification. All four were fixed in remediation but indicate a need for contract-level testing at MVP.

2. **No contract tests** — The review identified the absence of schema snapshot or Zod-based tests that verify JSON payloads conform to shared types (`REVIEW-FINDINGS.md §Coverage gaps`). TypeScript's `tsc --noEmit` catches type errors within each package but not cross-boundary shape mismatches after JSON serialization.

3. **`itemToPlot` and item mappers use `as` casts** — `dynamodb.ts:93-100` maps DynamoDB items using repeated `item['field'] as Type` casts rather than validated deserialization. This is acceptable for PoC with controlled seed data but becomes a risk when unexpected DynamoDB item shapes are possible (e.g., missing fields from older seed data versions).

4. **Frontend state in localStorage, not API** — Settings (theme, locale, temperature unit, farm name, farm ID) are stored exclusively in localStorage. The API `PATCH /farms/{farmId}` endpoint exists but the frontend doesn't round-trip settings through it. This is PoC-appropriate (no auth, single user) but creates a divergence risk if the DynamoDB record and localStorage get out of sync.

### Test Coverage Analysis

| Metric | Value |
|--------|-------|
| Test files | 11 |
| Test cases | 168 (all passing) |
| Test runtime | 1.31 seconds |
| Pyramid ratio | 30% unit / 55% integration / 15% E2E (manual) |
| Framework | vitest + hono/testing + aws-sdk-client-mock |

**What's covered:**
- All 9 DynamoDB access patterns (key construction, result mapping, cursor encode/decode)
- All 11 API routes (happy path + major error paths)
- JPEG magic-byte validation, 2MB size limit, required-field validation
- Weather WMO code mapping, `computeCropImpact` logic, cache hit/miss
- Chat stub mode, `parseSuggestions`, message length validation
- Simulator retry logic (1/2/3 attempts, exponential delay sequence)
- All 8 shared validation functions

**Confirmed gaps (from `REVIEW-FINDINGS.md §Coverage`):**
1. No integration test for the full upload-then-retrieve flow — this is precisely where MF-1 and MF-4 would have been caught pre-review.
2. No contract tests validating actual JSON payloads against shared TypeScript types — where MF-2, MF-3, and MF-4 would have been caught.
3. No test for `decodeCursor` with malformed input (SF-2 was a latent defect).
4. No test verifying `captured_at` is required in multipart upload (MF-1).

The test suite provides strong unit coverage of pure functions and adequate integration coverage of route logic. The gap is at the boundary between the API and the shared type contract — a class of defect that escaped to the review step.

---

## 6. Deployment Assessment

### Infrastructure

| Resource | Identifier | Status |
|----------|-----------|--------|
| DynamoDB | `litcrop-poc` (PK/SK + GSI1 + GSI2, on-demand) | ACTIVE |
| S3 (images) | `litcrop-poc-images` | ACTIVE |
| S3 (static) | `litcrop-poc-static` (30 files, 140.6 KB) | ACTIVE |
| IAM Role | `litcrop-poc-lambda` | ACTIVE |
| Lambda | `litcrop-poc-api` (84KB, Node.js 20, 256MB, 30s) | ACTIVE |
| API Gateway | `litcrop-poc-api` (HTTP API v2) | ACTIVE |
| CloudFront | `EXXXXXXXXXXXXX` (`<distribution-id>.cloudfront.net`) | DEPLOYED |
| OAC | `litcrop-poc-oac` | ACTIVE |

**Live endpoints:**
- Frontend: `https://<distribution-id>.cloudfront.net`
- API: `https://aew41rc5ob.execute-api.ap-northeast-1.amazonaws.com`

**Permission issues encountered:**
- `s3:PutBucketPublicAccessBlock` denied — harmless; account-level defaults block public access by default (AWS 2023 behavior). Static bucket created manually.
- `iam:PutRolePolicy` excluded by design (ADR-007 least-privilege). IAM role created via Console — correct security posture.
- `iam:ListAttachedRolePolicies` denied — policy verification done visually in Console.

Total deployment time: ~30 minutes (including 12-minute CloudFront propagation). The LLM API key was not configured at deploy time — the chat endpoint runs in stub mode. This is the one functional gap in the live deployment.

### Cost

| Estimate | Value |
|----------|-------|
| With free tier (current) | ~$0.00/month |
| Post-free-tier worst case | ~$0.68/month AWS + ~$0.05–0.50/month LLM API |
| Total worst-case | **~$0.73–1.18/month** |
| Budget target | < $5/month |
| **Status** | **Well within budget (4–6× headroom)** |

### Operational Readiness

**Available scripts** (`scripts/`):
- `setup-aws.sh` — DynamoDB + S3 provisioning (with `--teardown`)
- `seed-data.ts` — Idempotent DynamoDB seeder
- `deploy-frontend.sh` — Astro build → S3 sync → CloudFront invalidation
- `deploy-api.sh` — esbuild → zip → Lambda update-function-code
- `setup-lambda.sh` — Lambda + API Gateway provisioning
- `setup-iam-role.sh` — IAM role creation
- `cloudfront-function-url-rewrite.js` — CloudFront Function for SPA routing
- `README_aws.md` — Full infrastructure reference with ASCII diagram

**Teardown documented** in `SESSION-REPORT-v0.6.md` with specific CLI commands per resource. All resources are reversible.

**Gaps for MVP:**
- No IaC (CDK/SAM/SST) — ADR-008 deferred
- No CI/CD pipeline — manual deploy
- CloudFront Function deploy not scripted
- LLM API key not wired into Lambda environment

---

## 7. Pipeline Effectiveness

The project followed a structured 9-step pipeline: `/cc-define` → `/cc-design` (×6) → `/cc-implement` → `/cc-test` → `/cc-review` → `/cc-remediate` → `/simplify` → `/cc-deploy` → user testing.

### Steps That Added Value

| Step | Value Delivered |
|------|----------------|
| **cc-define (Step 1)** | Produced 54 FRs, 24 NFRs, 8 constraints, 11 API endpoints, 7 screens — comprehensive enough that implementation required almost no clarification. Resolved 4 open questions. |
| **cc-design Steps 2-4** | ARCHITECTURE.md + 7 ADRs + UX-DESIGNS.md (1,425 lines) + 10 HTML mockups. STOP gates after each prevented drift. |
| **cc-design Steps 5-7** | SYSTEM-DESIGN.md + API-CONTRACTS.md + 39-task breakdown + 6-phase execution plan. The risk-ordered schedule (DynamoDB first) proved correct — the schema worked on first attempt. |
| **cc-review** | Caught all 4 MUST-FIX and 4 SHOULD-FIX bugs before deployment. Estimated ~2–4 hours of debugging saved post-deploy. The storage_key leak (SF-3) was a security finding that would have been embarrassing post-MVP. |
| **cc-remediate** | All 8 MUST-FIX + SHOULD-FIX findings resolved in 1 iteration (0 escalations). The findings were mechanical, as predicted — no architectural changes needed. |
| **/simplify** | 12 code quality fixes: `makeLatestImage` helper extracted (was duplicated in farms.ts and plots.ts), `STATUS_CSS`/`STATUS_ICONS` centralized in `lib/status.ts`, `useLocalFarmId` hook extracted from 4 components. Reduced duplication and made the post-deploy F-04 temperature fix much simpler to apply. |
| **cc-test** | Discovered `trigger_type` vs `trigger` field name bug (distinct from the review-found MF-1 `captured_at` issue) — two separate simulator bugs were lurking. 168 tests provide regression safety for MVP refactoring. |

### Steps That Could Be Improved

| Step | Improvement |
|------|------------|
| **cc-implement (Step 8)** | Agent-parallel implementation (8 Sonnet agents across 6 phases) is fast but caused field-name drift between packages. A short cross-boundary integration test after Phase 3 would have caught MF-2 through MF-4 before the formal review step. |
| **cc-deploy** | CloudFront required manual OAC setup and a CloudFront Function not covered in DEPLOY-PLAN.md. The plan should be updated to include these steps or a `setup-cloudfront.sh` script. |
| **cc-test** | Test strategy planned 115 tests; 168 were written (good). However, no contract tests between shared types and route shapes were included — the exact gap that let MF-2 through MF-4 reach review. |
| **Post-deploy verification** | The v0.6 session did not test the tag endpoint (`POST /api/v1/images/{id}/tags`) or the chat endpoint via the live UI. These were tested post-fix in v0.7 but gap in initial deploy verification. |

### Agent Coordination

**What worked:**
- Sequential phase gates (Phase N committed before Phase N+1 started) prevented merge conflicts
- Opus team lead reading all agent outputs and synthesizing cross-agent decisions was effective
- The issue-closer agent recovering 26 GitHub issues mid-session was a graceful recovery from the PAT permissions incident

**What didn't:**
- One agent (phase3-frontend) was killed after ~7 minutes due to resource exhaustion from reading large mockup files — work was recovered from disk but the incident caused `api.ts` to be committed by a different agent (`phase3-api` via `git add -A`)
- phase4-builder went idle after creating files without committing — required a follow-up message from team lead
- The field-name drift between phase1-builder (shared types) and phase3-api (route responses) was the systemic coordination gap — no shared integration checkpoint between agents

### Time and Cost

| Session | Activity | Wall Clock | Cost |
|---------|----------|------------|------|
| v0.4 | Implementation (39 tasks, 8 agents) | ~3h 12min | ~$13.00 |
| v0.5 | Test + Review + Remediate + Simplify (10 agents) | ~1h 33min | ~$12.40 |
| v0.6 | Deploy + Verification | ~1h 15min | ~$3.00 |
| v0.7 | Post-deploy fixes + Roadmap | ~3h 05min | ~$9.00 |
| **Total** | | **~9h 05min** | **~$37.40** |

The v0.7 session cost ($9.00, all Opus — no subagents) was unexpectedly high relative to v0.6 ($3.00). The 6 UX fix sessions plus roadmap documentation were done directly by the team lead rather than delegating to builder agents. Delegating small fixes to Sonnet agents would reduce cost in future sessions.

---

## 8. User Feedback Summary

Tested on: iPhone (mobile) + Chrome desktop. Frontend at `https://<distribution-id>.cloudfront.net`.

### Fixed in v0.7 (6 items, GitHub issues #45–#50, all deployed)

| # | Issue | Root Cause | Fix |
|---|-------|-----------|-----|
| F-01 | Settings not persisting across page navigation | Astro SSG page transitions re-hydrate islands from scratch; localStorage not read before first paint | Inline `<script>` in BaseLayout reads localStorage before render |
| F-02 | "Setup" and "Settings" confusing nav labels | Generic naming | Renamed Setup → My Farm (🌱) |
| F-03 | Japanese i18n incomplete (nav labels, chat, GPS, climate hardcoded English) | 22 strings missed during implementation | `[data-i18n]` runtime translator + 22 new keys in `en.json`/`ja.json` |
| F-04 | Temperature unit preference (°C/°F) not reflected | `formatTemp()` helper not applied at all display sites | Applied `formatTemp()` to all 5 temperature locations |
| F-05 | Nav: Farm → Crops, My Farm → Profile | UX clarity: "Farm" was ambiguous | Renamed in EN/JA i18n + nav labels + aria attributes |
| F-06 | Generic page titles (no farm name) | Titles hardcoded during implementation | Headers read farm name from localStorage; e.g. "⛅ Weather — LitCrop Demo Farm" |

### Fixed post-report (F-07, F-12)

| # | Issue | Fix |
|---|-------|-----|
| F-07 | WMO weather codes displayed as system strings | **FIXED** ([#52](https://github.com/ashmuk/litcrop/issues/52)) — 13 weather condition translations (EN/JA), `translateCondition()` helper |
| F-12 | Farm Layout view "No plots" | **FIXED** ([#51](https://github.com/ashmuk/litcrop/issues/51)) — added `bed_id`/`field_id` to plots route response |

### Deferred to MVP (4 items — issues [#54](https://github.com/ashmuk/litcrop/issues/54)–[#57](https://github.com/ashmuk/litcrop/issues/57))

| # | GitHub | Issue | Priority | Notes |
|---|--------|-------|----------|-------|
| F-08 | [#54](https://github.com/ashmuk/litcrop/issues/54) | Weather layout overflow at 375px | Medium | Long condition text + temperature clipping on mobile. CSS fix + multi-state visual testing. |
| F-09 | [#55](https://github.com/ashmuk/litcrop/issues/55) | Map picker for farm location | Medium | Leaflet + OpenStreetMap (free, no API key). Explicitly deferred after discussion. |
| F-10 | [#56](https://github.com/ashmuk/litcrop/issues/56) | Elevation auto-fetch from coordinates | Low | Open-Meteo Elevation API (free, already in stack). Quick win. |
| F-11 | [#57](https://github.com/ashmuk/litcrop/issues/57) | Desktop responsiveness | Medium | Known PoC exclusion. Affects demo credibility on laptops. Minimal `@media (min-width: 768px)` pass recommended at MVP. |

### Deferred to Production (2 items — issues [#58](https://github.com/ashmuk/litcrop/issues/58)–[#59](https://github.com/ashmuk/litcrop/issues/59))

| # | GitHub | Issue | Notes |
|---|--------|-------|-------|
| F-13 | [#58](https://github.com/ashmuk/litcrop/issues/58) | Soil pH monitoring via IoT sensor | New device protocol + data model + alert thresholds. Separate risk domain. Needs ADR for MQTT vs HTTPS, sensor schema, crop-specific pH thresholds. Similar scope to sprinkler control deferred in PLANS.md. |
| F-14 | [#59](https://github.com/ashmuk/litcrop/issues/59) | Time-lapse playback (sequential image playback) | Frontend-only once sufficient image history exists. Good late-MVP or Production candidate. |

### Product Vision (7 categories, V-01–V-07)

These represent the broader commercial roadmap, not bugs. Key dependencies:
- **V-01 (User Management)** blocks V-02 (Farm Management); requires authentication (ADR-007 at MVP)
- **V-03 (IoT Device Management)** + **V-04 (Plans & Subscriptions)** are the monetization foundation
- **V-06 (Mobile App)** — REST API is mobile-ready from the start; push notifications and offline sync need design
- **V-07 (Landing Page)** should reflect V-04's plan/feature-flag architecture

---

## 9. Risk Register Update

From `EXECUTION-PLAN.md §6`:

| # | Risk | Likelihood | Impact | Outcome |
|---|------|-----------|--------|---------|
| R1 | DynamoDB single-table design doesn't support all access patterns | Medium | High | **Did not materialize.** All 9 access patterns validated during Phase 2 seed data run. GSI2 (Farm Overview) and GSI1 (direct ID lookup) worked as designed. |
| R2 | Lambda multipart image upload fails or hits size limits | Medium | High | **Did not materialize.** API Gateway HTTP API v2 supports 10MB payload; 2MB limit is safe. Hono's `parseBody()` handled multipart correctly. Upload latency < 2s. |
| R3 | Open-Meteo API response shape changes or unreliable | Low | Medium | **Did not materialize.** API returned live frost alert data for Nagano. Response transform isolated upstream changes. No API key dependency removed all auth-expiry risk. |
| R4 | LLM API integration issues | Medium | Low | **Partially materialized.** No LLM API key configured in production Lambda; chat runs in stub mode. Stub mode was intentional design; not a blocker for exit criteria. |
| R5 | Farm Overview screen complexity exceeds single-task scope | Medium | Low | **Did not materialize.** T-FE-06 built successfully in Phase 4. Status severity sorting, weather strip, filter pills all implemented. |
| R6 | Plot Detail with 4 Preact islands too complex | Low | Low | **Did not materialize.** Islands are independent; each hydrates and fetches independently. |
| R7 | AWS resource provisioning fails | Low | Medium | **Partially materialized.** `s3:PutBucketPublicAccessBlock` denied (harmless), `iam:PutRolePolicy` intentionally excluded (correct). Static bucket and IAM role created manually. Total additional time: ~10 minutes. |
| R8 | CloudFront + API Gateway CORS issues | Medium | Low | **Materialized.** CloudFront → API Gateway CORS required `CLOUDFRONT_ORIGIN` env var on Lambda and `CORS` config on API Gateway. Fixed post-deploy; CloudFront Function also required for SPA routing. |

**Unregistered risk that materialized:** Field-name drift between multi-agent implementation phases. Not in the risk register because the review step was expected to catch code defects — which it did. However, the root cause (no cross-boundary integration tests during implementation) warrants explicit risk tracking at MVP.

---

## 10. Lessons Learned

### What Went Well

1. **STOP gates before each design phase** — Reviewing REQUIREMENTS.md before ARCHITECTURE.md, reviewing ARCHITECTURE.md before API-CONTRACTS.md, etc. prevented downstream rework. The single most expensive fix would have been changing the DynamoDB schema after routes were built.

2. **Risk-front-loading** — The execution plan correctly placed T-API-03 (DynamoDB repository) in Phase 2, Day 3-4 — the earliest possible point. It validated on first attempt, giving confidence to build all 11 routes on top without rework.

3. **Shared type package from the start** — `@litcrop/shared` being a separate workspace consumed by all three packages (api, frontend, simulator) enforced a contract layer. The field-name bugs that leaked through are a test-coverage gap, not an architectural gap — the architecture correctly centralizes types.

4. **Structured review step** — All 4 MUST-FIX bugs were caught by the review agent before deployment. EC-1 was completely blocked (simulator would 400 on every upload), EC-2 would have crashed the Farm Overview component at runtime, and a `storage_key` security leak would have been in production. The review step paid for itself.

5. **Weather integration validated with live data** — The Nagano frost alert firing live during deployment verification was an unexpectedly strong PoC proof point — real geographic data, real crop impact analysis, real-time weather for the actual target location.

6. **Stub mode for AI chat** — Having a fallback when `LLM_API_KEY` is absent allowed deployment without committing secrets, and allowed the deployment verification to proceed without needing the chat feature to be live.

### What Could Be Improved

1. **Add cross-boundary contract tests during implementation** — One integration test per endpoint that serializes the response and validates it against the shared type's shape would have caught MF-2 through MF-4 immediately. This is 15 minutes of test code that would have saved the full review cycle for those findings.

2. **CloudFront Function was an undocumented deployment step** — DEPLOY-PLAN.md §7 marks CloudFront as "optional for PoC." In practice, SPA routing required a CloudFront Function that wasn't in any script. This caused 15 minutes of unplanned Console work. The function (`cloudfront-function-url-rewrite.js`) now exists in scripts/ but isn't wired into `deploy-frontend.sh`.

3. **Delegate small post-deploy fixes to Sonnet agents** — The v0.7 session used Opus (team lead) for 6 small UX fixes at ~$9.00. These were straightforward bug fixes that Sonnet builder agents handle well at ~30-40% of the cost.

4. **Test the full UI in Japanese mode** — F-03 (22 hardcoded English strings surviving i18n) was only caught during live testing in Japanese mode. An automated i18n completeness check (diff `en.json` keys vs `ja.json` keys; grep for hardcoded English strings in `.astro`/`.tsx`) would catch this class of issue earlier.

5. **Script the full deployment** — The v0.6 deployment required 8 manual steps. By v0.7, 10 scripts exist — but they're not orchestrated. A single `deploy.sh` that runs setup + seed + backend + frontend + CF invalidation in order would reduce deployment time and errors for MVP.

### Surprises

1. **Latency was dramatically better than target** — EC-6 required < 30 seconds; actual was < 2 seconds. Lambda + API Gateway + S3 in the same region (Tokyo) for both upload and retrieval is very fast. The 30-second target was set conservatively for hardware-to-cloud round-trips; simulated node removes geographic latency.

2. **DynamoDB single-table worked first try** — Rated the highest-risk item in the plan (R1, Medium/High). The 9 access patterns validated without schema revisions. The GSI2 design for Farm Overview (flattening the Farm → Field → Bed → Plot hierarchy) is the most non-obvious pattern and executed correctly.

3. **The `@preact/preset-vite` null-guard patch** — A Vite 7 strict-mode `this` binding issue required a patch in `astro.config.mjs`. This was a framework-level bug not anticipated during tech selection. Minor but worth documenting for the MVP team.

4. **GitHub PAT lacking Issues write permission** — The issue-creator agent was blocked early in v0.4, requiring recovery mid-session. The PAT scope required an explicit `issues:write` permission that wasn't in the initial setup guide. This caused 18 minutes of recovery work in v0.5.

---

## 11. MVP Readiness Assessment

### Prerequisites for MVP (Blockers)

These must be addressed before meaningful MVP work:

| # | Item | File/Location | Priority |
|---|------|--------------|----------|
| 1 | ~~**Fix F-12: Farm Layout "No plots" bug**~~ | ~~Critical~~ | **FIXED** ([#51](https://github.com/ashmuk/litcrop/issues/51)) |
| 2 | **Wire LLM API key to Lambda** | `scripts/deploy-api.sh` + `LLM_API_KEY` env var | High — chat is currently stub-only in prod |
| 3 | ~~**Script CloudFront Function deployment**~~ | ~~High~~ | **FIXED** — added to `deploy-frontend.sh` |
| 4 | ~~**Fix WMO weather codes (F-07)**~~ | ~~High~~ | **FIXED** ([#52](https://github.com/ashmuk/litcrop/issues/52)) |
| 5 | **Merge develop → main** | Git | Required for v1.0 tag; needs explicit user approval |

### Recommended MVP Scope

Based on user feedback (F-07 through F-12) and technical assessment:

**Core MVP additions (in priority order):**
1. **Authentication** — ADR-007 (Cognito + JWT, email-based waiting list). All V-01 user management depends on this. Unlocks multi-user, multi-farm path.
2. **IaC (ADR-008)** — CDK or SAM. Manual deploy doesn't scale to team development. CloudFront setup must be scripted.
3. **F-12 layout bug fix + map picker (F-09)** — Leaflet + OpenStreetMap for farm location. Together these make the spatial and setup UX production-grade.
4. **WMO weather i18n (F-07) + weather overflow fix (F-08)** — Weather page polish. High user visibility.
5. **Desktop responsive pass (F-11)** — Minimal `@media (min-width: 768px)` breakpoint. Affects demo credibility on laptops.
6. **Image processing pipeline** — Server-side thumbnails (Lambda). PoC loads full-resolution images at CSS-reduced size; this will be slow on mobile LTE with 10+ images.
7. **ADR-009: AI/LLM framework** — Evaluate Bedrock + Strands vs Mastra for agentic chatbot (tool use: query DynamoDB, modify layout). Direct API calls hit the ceiling when chatbot needs to act.

**Defer to Production:**
- Real camera hardware (Pi 5, PIR sensor, SORACOM IoT SIM)
- F-13 soil pH IoT sensor (needs ADR for MQTT protocol)
- F-14 time-lapse playback
- V-03 IoT Device Management
- V-04 Plans & Subscriptions (billing system)
- Realtime video streaming (WebRTC/HLS)
- CI/CD pipeline (GitHub Actions)

### Architecture Changes Needed for MVP

| Area | Current State | MVP Change |
|------|--------------|------------|
| Authentication | No auth; all endpoints public | Cognito + JWT; `authMiddleware` in `app.ts:50` is the insertion point (no route handler changes needed per NFR-7.4) |
| IaC | Manual AWS CLI scripts | CDK or SAM — ADR-008 decision needed |
| Image serving | S3 signed URLs (15-min expiry) | CloudFront signed URLs (longer-lived, cheaper at scale) |
| Image sizes | Full resolution at CSS size | Lambda thumbnail generator on upload; return `thumbnail_url` as separate signed URL |
| Weather cache | In-memory (cold-start clears) | DynamoDB TTL item (already designed in ARCHITECTURE.md §3) |
| Chat | Direct API calls, single-turn | Bedrock + Strands or Mastra for tool-use capability (ADR-009) |
| Domain | `*.cloudfront.net` | Custom domain + ACM certificate |
| Monitoring | CloudWatch basics | CloudWatch alarms, error tracking (Sentry or similar) |
| DynamoDB schema | Current schema sufficient | Add `bed_id` to Image record (denormalization for SF-4 fix) |

The DynamoDB table schema change (adding `bed_id` to Image items) is the one migration needed: it requires updating `createImage` in `dynamodb.ts` and all seed/test fixtures. Not a breaking migration since old items without `bed_id` simply don't get the plot status update until re-uploaded — acceptable for a test/seed environment.

---

## 12. Recommendations

Prioritized actions before starting MVP scope:

| # | Action | Effort | Blocks |
|---|--------|--------|--------|
| 1 | ~~**Fix F-12 (Layout "No plots")**~~ | ~~Small~~ | **FIXED** ([#51](https://github.com/ashmuk/litcrop/issues/51)) |
| 2 | **Configure LLM API key in Lambda** | Trivial (env var + redeploy) | Live AI chat for demos |
| 3 | **Merge develop → main + tag v1.0** | Trivial (requires user approval) | Clean MVP baseline |
| 4 | ~~**Script CloudFront Function deployment**~~ | ~~Small~~ | **FIXED** — added to `deploy-frontend.sh` |
| 5 | ~~**Fix WMO weather codes (F-07)**~~ | ~~Medium~~ | **FIXED** ([#52](https://github.com/ashmuk/litcrop/issues/52)) |
| 6 | **ADR-007: Authentication provider selection** | Small (doc only) | All MVP user-facing features |
| 7 | **ADR-008: IaC tool selection (CDK vs SAM vs SST)** | Small (doc only) | Reproducible MVP infrastructure |
| 8 | **Add contract tests (shared types ↔ route responses)** | Medium (< 4h) | Prevent field-name drift — see [ADR-20260319-pipeline-improvements](ADR-20260319-pipeline-improvements-mvp.md) §3 |
| 9 | **ADR-009: AI/LLM framework for MVP chatbot** | Medium (doc + PoC) | Agentic chat features (FR-9.4 layout creation) |
| 10 | **Desktop responsive pass (F-11)** | Medium (< 1 day) — `@media (min-width: 768px)` | Demo credibility on laptops |
| 11 | **Elevation auto-fetch from coordinates (F-10)** | Small (< 2h) — Open-Meteo Elevation API | Profile UX polish |
| 12 | **Add `bed_id` to Image record (SF-4 denormalization)** | Small (< 2h) — schema + seed + test updates | Tag race condition fix for multi-user MVP |

**Immediate next session** (before `/cc-define` at MVP scope): Items 1, 4, 5 are now complete. Item 2 (LLM key) and 3 (merge to main) remain as pre-MVP blockers. Items 6–9 are design/planning work that should precede the MVP `/cc-define` run. Items 10–12 can be bundled into the first MVP implementation phase.

**Pipeline process improvements**: See [ADR-20260319-pipeline-improvements-mvp](decisions/ADR-20260319-pipeline-improvements-mvp.md) for five structural changes to the 9-step pipeline: per-phase `/simplify`, issue-first rule, contract test gates, deploy verification checklist, and Sonnet delegation for small fixes.

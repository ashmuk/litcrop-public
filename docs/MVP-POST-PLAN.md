# MVP-POST-PLAN.md — MVP Refinement Plan (v0.9 - v1.0)

> Date: 2026-03-21 (updated)
> Scope: Post-deploy fixes, tech debt, architecture evolution, new features
> Target: Tag v0.9 after Phase 1, v1.0 after Phase 5
> Branch: `develop` (merge to `main` for deploy)
> Total estimated effort: ~11-12 hours across 5 phases

---

## Overview

Post-deploy testing revealed 8 refinement items spanning backend gaps, i18n issues, and missing user flows. The MVP is live and functional, but these fixes address:

1. **Cross-device sync** — no way to discover an existing farm on a new device (A1)
2. **Core empty-state UX** — users cannot add plots without direct DB manipulation (A2)
3. **i18n gaps** — weather conditions and chat stub show untranslated or developer-facing text (A3, A4, A6)
4. **Timing bug** — farm name in page titles depends on localStorage populated after fetch (A5)
5. **Image capture** — no way for users to upload crop photos from their phone (A7)
6. **Observability** — no admin visibility into system usage (A8)

The data model uses a 3-tier hierarchy: Farm > Field > Bed > Plot. Plot creation (A2) requires creating the intermediate Field and Bed entities as well, or simplifying with auto-generated defaults.

---

## Phase 1: Core UX Fixes (COMPLETE)

> Status: COMPLETE | Effort: ~4 hours | Tag: v0.9

### A1: Add GET /api/v1/farms endpoint + auto-fetch on login

**Priority**: P0 (blocks cross-device sync, improves A5)
**Effort**: 30 min

**Description**: Add a route that looks up the authenticated user's farm. After login, the frontend calls this endpoint to populate localStorage with `farmId` and `farmName`, enabling cross-device discovery without requiring the user to re-create their farm.

**Files to modify**:
- `src/api/src/routes/farms.ts` — add `GET /` route handler
- `src/api/src/app.ts` — verify `/api/v1/farms` route already catches `GET /` (it does via `app.route('/api/v1/farms', farmsRouter)`)
- `src/frontend/src/lib/api.ts` — add `getMyFarm()` function (calls `GET /farms`)
- `src/frontend/src/components/LoginForm.tsx` — call `getMyFarm()` after successful `signIn()`, store result in localStorage before redirect
- `src/frontend/src/components/AuthGuard.tsx` — optionally call `getMyFarm()` on token refresh to keep localStorage fresh

**Implementation approach**:

1. **Backend** — In `farms.ts`, add a `GET /` handler:
   ```
   router.get('/', async (c) => {
     const { userId } = getAuthContext(c);
     const farm = await dynamoRepo.getFarmForUser(userId);
     if (!farm) return c.json({ farm: null });
     return c.json(farmToResponse(farm));
   });
   ```
   The `getFarmForUser(userId)` method already exists in `dynamodb.ts` (line 428). It queries `PK=USER#<userId>, SK=#FARM` to find the farm_id, then calls `getFarm()`.

2. **Frontend** — In `api.ts`, add:
   ```
   export async function getMyFarm(): Promise<Farm | null> {
     const res = await request<Farm | { farm: null }>('GET', '/farms');
     return 'farm' in res && res.farm === null ? null : res as Farm;
   }
   ```

3. **LoginForm** — After `signIn()` succeeds, before redirect:
   ```
   const myFarm = await getMyFarm();
   if (myFarm) {
     localStorage.setItem('litcrop-farmId', myFarm.id);
     localStorage.setItem('litcrop-farmName', myFarm.name);
   }
   ```
   If `myFarm` is null, the existing redirect to `/setup/` for new users handles it.

**Acceptance criteria**:
- `GET /api/v1/farms` returns the user's farm (or `{ farm: null }` if none)
- After login on a new device, localStorage has the correct `litcrop-farmId` and `litcrop-farmName`
- The crops page loads without requiring the user to visit /setup first
- Existing farm creation (POST /farms) still works, no regressions

**Dependencies**: None

---

### A2: Add plot creation form — guided wizard with climate suggestions

**Priority**: P0 (core feature gap — users cannot add crops)
**Effort**: 1 hr

**Description**: Create an AddPlotForm component with a 3-step wizard and wire it to the backend. The data model requires Field > Bed > Plot, so the wizard auto-creates a default Field ("Main Field") and Bed ("Bed 1") if none exist, keeping the UX simple for small farms.

**Files to create**:
- `src/frontend/src/components/AddPlotForm.tsx` — 3-step wizard island

**Files to modify**:
- `src/api/src/services/dynamodb.ts` — add `createField()`, `createBed()`, `createPlot()` methods
- `src/api/src/routes/farms.ts` — add `POST /api/v1/farms/:farmId/plots` route
- `src/frontend/src/lib/api.ts` — add `createPlot()` function
- `src/frontend/src/components/FarmOverview.tsx` — add "+" FAB button and empty-state CTA
- `src/frontend/src/i18n/en.json` — add wizard i18n keys
- `src/frontend/src/i18n/ja.json` — add wizard i18n keys (Japanese)
- `src/frontend/src/pages/plots/add.astro` — new page hosting the wizard island
- `packages/shared/src/types/requests.ts` — add `CreatePlotRequest` type (if not present)

**Implementation approach**:

1. **Backend data layer** (`dynamodb.ts`):
   - `createField(farmId, name, position)` — PutItem with `PK=FARM#<farmId>, SK=FIELD#<pos>#<fieldId>`
   - `createBed(fieldId, name, position)` — PutItem with `PK=FIELD#<fieldId>, SK=BED#<pos>#<bedId>`
   - `createPlot(bedId, farmId, data)` — PutItem with `PK=BED#<bedId>, SK=PLOT#<plotId>`, plus GSI2 for farm-level queries (`GSI2PK=FARM#<farmId>, GSI2SK=PLOT#<plotId>`)

2. **Backend route** (`farms.ts`):
   - `POST /api/v1/farms/:farmId/plots` — validates ownership, accepts `{ crop_type, crop_variety, label?, description?, planted_at? }`, auto-creates default Field+Bed if farm has none, then creates the Plot. Returns the new plot.

3. **Frontend wizard** (`AddPlotForm.tsx`):
   - **Step 1**: Crop selection — `crop_type` dropdown (Rice, Tomato, Cucumber, Eggplant, Lettuce, Daikon, Other) + `crop_variety` text input. Show climate-based suggestions derived from farm latitude (same logic as SetupForm `climateHint()`).
   - **Step 2**: Plot details — `label` (auto-generated default: "{crop_type} Plot 1"), `planted_at` (date picker, defaults to today).
   - **Step 3**: Confirmation card showing summary, "Create" button.
   - On success: redirect to `/` (crops page) with toast.

4. **FarmOverview integration**:
   - Empty state: replace text-only message with a "Add your first crop" CTA button linking to `/plots/add/`.
   - Non-empty state: add a FAB (floating action button) in bottom-right corner linking to `/plots/add/`.

**Acceptance criteria**:
- User can add a plot via the 3-step wizard
- Plot appears on the crops page after creation
- Default Field and Bed are auto-created for the first plot
- Climate-based crop suggestions appear in Step 1
- Works on mobile (touch-friendly, full-width inputs)
- Japanese translations present for all wizard strings

**Dependencies**: None (can run in parallel with A1)

---

### A3: Fix weather i18n key lookup

**Priority**: P1
**Effort**: 15 min

**Description**: The `translateCondition()` function in `format.ts` looks up `weather_conditions.<condition>` where `<condition>` is the `condition_icon` value from the API (e.g., `clear_sky`, `partly_cloudy`). The backend `wmoToIcon()` function already returns snake_case keys that match the i18n keys in `en.json` and `ja.json`. Verification is needed to confirm all WMO codes map to existing i18n keys.

**Files to modify**:
- `src/frontend/src/lib/format.ts` — potentially no change if keys align (verify only)
- `src/frontend/src/i18n/en.json` — add any missing keys
- `src/frontend/src/i18n/ja.json` — add any missing keys

**Implementation approach**:

1. **Audit**: Cross-reference `wmoToIcon()` output values against `weather_conditions.*` keys in both i18n files:
   - Backend returns: `clear_sky`, `mainly_clear`, `partly_cloudy`, `overcast`, `fog`, `drizzle`, `freezing_drizzle`, `rain`, `freezing_rain`, `snow`, `snow_grains`, `rain_showers`, `snow_showers`, `thunderstorm`, `thunderstorm_hail`, `unknown`
   - en.json has: `clear_sky`, `mainly_clear`, `partly_cloudy`, `overcast`, `fog`, `drizzle`, `rain`, `freezing_rain`, `snow`, `snow_grains`, `rain_showers`, `snow_showers`, `thunderstorm`, `freezing_drizzle`, `thunderstorm_hail`, `unknown`
   - All 16 keys appear to be present in both files. **Likely no code change needed.**

2. **Edge case**: The `translateCondition()` function has a fallback that converts unknown slugs to Title Case (e.g., `some_new_code` -> `Some New Code`). This is acceptable.

3. **Test**: Manually verify with a few WMO codes by checking the weather page.

**Acceptance criteria**:
- All weather condition slugs from the API have corresponding i18n entries
- Weather page shows translated condition names in Japanese when locale is `ja`
- No raw slug keys visible in the UI

**Dependencies**: None

---

### A4: Localize chat stub response

**Priority**: P1
**Effort**: 15 min

**Description**: The chat `stubResponse()` function in `chat.ts` returns hardcoded English with developer-facing text ("No LLM API key configured", "configure `LLM_API_KEY` environment variable"). End users should never see this. Replace with a friendly, localized response.

**Files to modify**:
- `src/api/src/routes/chat.ts` — rewrite `stubResponse()` to accept locale, return user-friendly text
- `src/frontend/src/components/ChatAssistant.tsx` — no change needed (already sends `farm_id` which the backend uses to read `farm.locale`)

**Implementation approach**:

1. **Modify `stubResponse()`** to accept a `locale` parameter:
   ```
   function stubResponse(message: string, locale: string = 'en'): { reply: string; suggestions: string[] } {
     const isJa = locale === 'ja';
     return {
       reply: isJa
         ? `ご質問ありがとうございます。現在AIアシスタントは準備中です。\n\n**長野の季節のヒント：**\n- 春：霜が終わる4月中旬以降にレタスやほうれん草を植えましょう\n- 夏：トマト、きゅうり、なすが育ちやすい気候です\n- 秋：大根と白菜がおすすめです`
         : `Thanks for your question! The AI assistant is currently being set up.\n\n**Seasonal tips for your area:**\n- Spring: Plant cold-tolerant crops (lettuce, spinach) after the last frost\n- Summer: Tomatoes, cucumbers, and eggplant thrive in warm weather\n- Fall: Daikon radish and napa cabbage are excellent choices`,
       suggestions: isJa
         ? ['今の季節に何を植えるべき？', '輪作の計画を手伝って', 'この地域の害虫は？']
         : ['What should I plant this season?', 'Help me plan my crop rotation', 'What are common pests in my area?'],
     };
   }
   ```

2. **In the POST handler**, pass `farm.locale` to `stubResponse()`:
   ```
   const stub = stubResponse(message, farm?.locale ?? 'en');
   ```

3. **Remove** all developer-facing text: no mention of `LLM_API_KEY`, no "stub" wording, no "configure" instructions.

**Acceptance criteria**:
- Chat stub returns friendly crop advice (not developer instructions)
- Japanese users see Japanese stub response
- No mention of API keys, environment variables, or configuration in the response
- Stub suggestions are also localized

**Dependencies**: None

---

### A5: Fix farm name timing in page titles

**Priority**: P2
**Effort**: 20 min

**Description**: `BaseLayout.astro` has an inline `<script>` that reads `litcrop-farmName` from localStorage and patches the page title element. This runs during DOMContentLoaded. The issue is that on first visit (before any farm data is fetched), localStorage is empty, so the title shows the default. After A1, login will populate localStorage before the user reaches any farm page, largely resolving this. However, a fallback is still needed for edge cases (cleared storage, direct URL navigation).

**Files to modify**:
- `src/frontend/src/components/FarmOverview.tsx` — after fetching farm data, dispatch a custom event or patch title directly
- `src/frontend/src/layouts/BaseLayout.astro` — add a listener for the custom event (or keep existing script as-is if A1 resolves the timing)

**Implementation approach**:

1. **Verify after A1**: With login auto-fetch, localStorage will have the farm name before any page with `farmNameTitleId` renders. Test by logging in on a fresh browser and navigating to the crops page.

2. **If still needed**: In `FarmOverview.tsx`, after `farmData` is fetched (line 57-60 where it already sets localStorage), add:
   ```
   // Patch page title if BaseLayout provided a title element
   const titleEl = document.getElementById('page-title');
   if (titleEl && farmData.name) {
     titleEl.textContent = titleEl.dataset.prefix + farmData.name;
   }
   ```

3. **BaseLayout** already stores `farmNamePrefix` as a data attribute, so the component can read it.

**Acceptance criteria**:
- Farm name appears in page header on first load (no flash of default title)
- Works after clearing localStorage and logging in fresh
- Works on direct navigation to /weather or /setup

**Dependencies**: A1 (login auto-fetch makes this largely unnecessary; verify before implementing the fallback)

---

### A6: Update empty state messages — remove "camera node" wording

**Priority**: P1
**Effort**: 10 min

**Description**: Empty state messages reference "camera node" hardware that MVP users do not have. Replace with action-oriented language for the manual-first approach.

**Files to modify**:
- `src/frontend/src/i18n/en.json` — update 2 keys
- `src/frontend/src/i18n/ja.json` — update 2 keys

**Changes**:

| Key | Current (en) | New (en) |
|-----|-------------|----------|
| `farm.no_plots_body` | "Plots will appear here once your farm is set up and a camera node is connected." | "Add your first crop plot to start monitoring your farm." |
| `plot.no_images_body` | "Images will appear here once the camera node starts capturing." | "Take a photo of your crops to track their progress." |

| Key | Current (ja) | New (ja) |
|-----|-------------|----------|
| `farm.no_plots_body` | "農場を設定してカメラノードを接続すると、区画が表示されます。" | "最初の作物区画を追加して、農場のモニタリングを始めましょう。" |
| `plot.no_images_body` | "カメラノードが撮影を開始すると、画像が表示されます。" | "作物の写真を撮って成長を記録しましょう。" |

**Acceptance criteria**:
- No reference to "camera node" in any user-facing text
- Messages guide the user toward manual actions (add plot, take photo)
- Both en and ja updated

**Dependencies**: None

---

### A7: Phone camera image upload

**Priority**: P1
**Effort**: 30 min

**Description**: Add a camera capture button to PlotDetail that uses `<input type="file" accept="image/*" capture="environment">` for phone camera integration. Wire to the existing `POST /api/v1/plots/:plotId/images` endpoint.

**Files to modify**:
- `src/frontend/src/components/PlotDetail.tsx` — add upload button and handler
- `src/frontend/src/lib/api.ts` — `uploadImage()` already exists (line 185)

**Implementation approach**:

1. **In PlotDetail**, add a camera upload section after the tag buttons or in the image history header:
   ```tsx
   <label class="btn-secondary" style="cursor:pointer;display:inline-flex;align-items:center;gap:var(--space-2)">
     <input
       type="file"
       accept="image/jpeg"
       capture="environment"
       style="display:none"
       onChange={handleImageUpload}
     />
     {t('buttons.upload')}
   </label>
   ```

2. **Upload handler**:
   ```tsx
   async function handleImageUpload(e: Event) {
     const file = (e.target as HTMLInputElement).files?.[0];
     if (!file) return;
     if (file.size > 2 * 1024 * 1024) {
       showToast(t('upload.too_large'), 'error');
       return;
     }
     setUploading(true);
     const formData = new FormData();
     formData.append('image', file);
     formData.append('captured_at', new Date().toISOString());
     formData.append('node_id', 'phone-camera');
     formData.append('trigger', 'scheduled');
     try {
       await uploadImage(plotId, formData);
       showToast(t('upload.success'), 'success');
       // Refresh image list
       await refreshImages();
     } catch (err) {
       showToast(t('upload.error'), 'error');
     } finally {
       setUploading(false);
     }
   }
   ```

3. **Note on backend requirements**: The existing `POST /plots/:plotId/images` requires `captured_at`, `node_id`, and `trigger` fields in the form data. The frontend sets `node_id: 'phone-camera'` and `trigger: 'scheduled'` as sensible defaults for manual uploads.

**Acceptance criteria**:
- Camera button visible on PlotDetail page
- Tapping opens the phone camera (on mobile) or file picker (on desktop)
- JPEG images upload successfully and appear in the image timeline
- File size validation (2MB max) with user-friendly error
- Upload progress indicator (loading state on button)
- i18n keys already exist: `buttons.upload`, `upload.success`, `upload.error`, `upload.too_large`

**Dependencies**: A2 (needs at least one plot to exist for testing; can be developed in parallel)

---

### A8: Simple admin stats page

**Priority**: P2
**Effort**: 1 hr

**Description**: Add a basic admin page showing DynamoDB entity counts and budget usage. Protected by a hardcoded admin userId check (MVP-appropriate).

**Files to create**:
- `src/api/src/routes/admin.ts` — admin stats route
- `src/frontend/src/pages/admin/index.astro` — admin page
- `src/frontend/src/components/AdminStats.tsx` — stats display island

**Files to modify**:
- `src/api/src/app.ts` — register admin router
- `src/api/src/services/dynamodb.ts` — add `getStats()` method (Scan with count-only, or targeted queries)
- `src/frontend/src/lib/api.ts` — add `getAdminStats()` function

**Implementation approach**:

1. **Backend** (`admin.ts`):
   ```
   GET /api/v1/admin/stats
   ```
   - Guard: Check `userId` against a hardcoded admin list (env var `ADMIN_USER_IDS` or hardcoded for MVP).
   - Return 403 for non-admin users.
   - Query DynamoDB for counts:
     - Farm count: Scan with `FilterExpression: begins_with(PK, 'FARM#') AND SK = '#META'`, Select: 'COUNT'
     - User count: Scan with `FilterExpression: begins_with(PK, 'USER#')`, Select: 'COUNT'
     - Plot count: Scan with `FilterExpression: begins_with(SK, 'PLOT#')`, Select: 'COUNT'
   - Also return the current usage data from the budget service (daily token totals).

2. **Frontend** (`AdminStats.tsx`):
   - Simple card grid: Users, Farms, Plots, Images (counts)
   - Budget usage section: tokens used today (user + global), % of limits
   - Auto-refresh every 60 seconds
   - No nav tab — accessed via direct URL `/admin/`

3. **Admin guard**: Hardcode the admin Cognito sub in the backend. The admin page itself has no special frontend auth — it relies on the API returning 403 for non-admins, which the component handles gracefully.

**Acceptance criteria**:
- `/admin/` page shows entity counts and budget usage
- Non-admin users see a "Not authorized" message (API returns 403)
- Stats refresh periodically
- No link to admin page in the main navigation (URL-only access)

**Dependencies**: None (but benefits from A1 being done for consistent auth flow)

---

## Phase 1 Execution Sequence (COMPLETE)

```
A1 (GET /farms + login auto-fetch)  ──┐
                                       ├── A5 (verify title timing)
A3 (weather i18n audit)                │
A4 (chat stub localization)            │
A6 (empty state messages)              │
                                       │
A2 (plot creation wizard)  ────────────┼── A7 (phone camera upload)
                                       │
A8 (admin stats page)     ────────────┘
```

**Execution order** (completed):

| Batch | Items | Status |
|-------|-------|--------|
| 1 | A1, A6, A3 | DONE |
| 2 | A4, A2 | DONE |
| 3 | A5, A7 | DONE |
| 4 | A8 | DONE |

---

## Phase 2: Quick Fixes + Deploy Bugs (~1 hr)

> Status: PLANNED | Effort: ~1 hour
> Dependencies: Phase 1 complete
> Branch: `feature/phase2-quick-fixes` from `develop`

### N3: Weather i18n hydration timing fix

**Priority**: P1
**Effort**: 20 min

**Description**: Astro SSG builds HTML with `data-locale="en"` baked in. Preact islands hydrate before the `localStorage` locale patch script runs, causing a flash of English weather conditions on Japanese-locale devices.

**Fix approach**: Move locale detection into the island component's `useEffect()` / initialization rather than relying on a top-level `<script>` in the Astro layout. Each weather-displaying island should read `localStorage` directly on mount.

**Files to modify**:
- `src/frontend/src/components/WeatherWidget.tsx` — read locale from localStorage on mount, not from SSG-injected data attribute
- `src/frontend/src/components/WeatherForecast.tsx` — same pattern if applicable

**Success criteria**: Weather conditions render in the correct locale on first paint without a flash of English text.

---

### N5: Verify upload works on PlotDetail

**Priority**: P2
**Effort**: 10 min

**Description**: Upload code in PlotDetail is correct per code review, but a user reported it not working. Likely browser cache or stale service worker. Verify with a hard refresh and document the finding.

**Files to modify**:
- None expected (verification only)
- If needed: `src/frontend/src/components/PlotDetail.tsx`

**Success criteria**: Image upload from PlotDetail works after hard refresh. If a bug is found, fix it; otherwise document as browser-cache issue.

---

### Q4: Unbounded weather cache Map

**Priority**: P1
**Effort**: 10 min

**Description**: The in-memory weather cache uses a `Map` with no eviction policy. Over time in a long-running process (or Lambda with provisioned concurrency), this grows unbounded. Add a periodic cleanup or simple LRU cap.

**Files to modify**:
- `src/api/src/services/weather.ts` — add max-size check (e.g., 100 entries) with oldest-first eviction, or TTL-based cleanup

**Success criteria**: Weather cache does not grow beyond a configurable limit. Existing cache behavior unchanged for normal use.

---

### Q10: Default TABLE_NAME for local dev

**Priority**: P2
**Effort**: 5 min

**Description**: `dynamodb.ts` reads `TABLE_NAME` from env with no fallback, causing cryptic errors in local development when `.env` is missing the variable.

**Files to modify**:
- `src/api/src/services/dynamodb.ts` — add fallback: `const TABLE_NAME = process.env.TABLE_NAME ?? 'litcrop-dev';`

**Success criteria**: API starts locally without `TABLE_NAME` set, using a sensible default. Logged warning when falling back.

---

### C6: Hide chat model name from /usage response

**Priority**: P1
**Effort**: 5 min

**Description**: The `/api/v1/chat/usage` endpoint returns the internal LLM model identifier (e.g., `anthropic.claude-3-haiku-20240307-v1:0`). End users should not see this.

**Files to modify**:
- `src/api/src/routes/chat.ts` — remove or redact the `model` field from the usage response JSON

**Success criteria**: `/usage` response does not contain the model name. Frontend usage display unaffected (it does not render the model field).

---

### S11: Strip storage_key from image API responses

**Priority**: P1
**Effort**: 10 min

**Description**: The image API responses include `storage_key` (the S3 object key), which is an internal implementation detail. Strip it from all responses to avoid leaking internal paths.

**Files to modify**:
- `src/api/src/routes/images.ts` — add a response mapper that omits `storage_key` before returning
- Alternatively: `src/api/src/services/dynamodb.ts` — strip in the data access layer's `imageToResponse()` function

**Success criteria**: No `storage_key` field in any image-related API response. Frontend image display still works (uses `image_url`, not `storage_key`).

---

## Phase 3: Tech Debt Sweep (~2 hrs)

> Status: PLANNED | Effort: ~2 hours
> Dependencies: None (can run in parallel with Phase 2)
> Branch: `feature/phase3-tech-debt` from `develop`

### Q5: Non-null assertions on budget records

**Priority**: P2
**Effort**: 10 min

**Description**: Budget-related code uses TypeScript non-null assertions (`!`) on DynamoDB query results without checking for undefined. Add proper null guards or narrow the types.

**Files to modify**:
- `src/api/src/services/dynamodb.ts` — replace `!` assertions on budget record fields with null checks or early returns

**Success criteria**: No non-null assertions on budget record access paths. Graceful handling when budget record does not exist.

---

### Q7: JSON parse errors return 500 not 400

**Priority**: P1
**Effort**: 15 min

**Description**: When a client sends malformed JSON, `c.req.json()` throws a `SyntaxError` that propagates as a 500 Internal Server Error. Should return 400 Bad Request.

**Files to modify**:
- `src/api/src/app.ts` — add global error handler for `SyntaxError` returning 400, or wrap in middleware
- Alternatively: wrap `c.req.json()` calls in individual route handlers with try/catch

**Success criteria**: Malformed JSON requests return `400 Bad Request` with a clear error message, not 500.

---

### Q8: Wind direction degrees not cardinal

**Priority**: P2
**Effort**: 15 min

**Description**: Weather API returns wind direction as degrees (e.g., `225`), but users expect cardinal directions (e.g., `SW`). Add a `degreeToCardinal()` helper.

**Files to modify**:
- `src/frontend/src/lib/format.ts` — add `degreeToCardinal(degrees: number): string` function
- `src/frontend/src/components/WeatherWidget.tsx` — use the helper when displaying wind direction
- `src/frontend/src/i18n/en.json` / `ja.json` — add cardinal direction abbreviation keys if needed

**Success criteria**: Wind direction displays as cardinal directions (N, NE, E, SE, S, SW, W, NW) in the weather widget.

---

### Q9: JPEG magic bytes check fragile for < 3 bytes

**Priority**: P2
**Effort**: 10 min

**Description**: The image upload validation checks JPEG magic bytes but does not guard against files smaller than 3 bytes, which would cause an out-of-bounds read.

**Files to modify**:
- `src/api/src/routes/images.ts` — add `if (buffer.length < 3) return false;` before magic byte comparison

**Success criteria**: Uploading a file < 3 bytes returns a clear validation error, not an unhandled exception.

---

### S5: In-memory rate limiter ineffective in Lambda

**Priority**: P2
**Effort**: 20 min

**Description**: The in-memory rate limiter resets on every Lambda cold start and is not shared across concurrent instances. Document this limitation. Optionally, add a TODO for a DynamoDB-backed rate limiter.

**Files to modify**:
- `src/api/src/middleware/rateLimit.ts` — add code comment documenting the Lambda limitation
- `docs/ARCHITECTURE.md` — note the rate limiting caveat under the API section

**Success criteria**: Limitation is documented. If time permits, add a `TODO` marker for DynamoDB-backed alternative.

---

### S7: LLM error body logged to CloudWatch

**Priority**: P1
**Effort**: 10 min

**Description**: When the LLM API returns an error, the full response body (which may contain sensitive content) is logged to CloudWatch. Sanitize before logging.

**Files to modify**:
- `src/api/src/routes/chat.ts` — truncate/redact error body before `console.error()`, log only status code and a generic message

**Success criteria**: LLM error logs contain status code and error type but not the full response body.

---

### S8: Thumbnail Lambda over-permissioned

**Priority**: P1
**Effort**: 15 min

**Description**: The thumbnail generation Lambda has broader S3 permissions than necessary. Scope the IAM policy to only the specific bucket and prefixes it needs.

**Files to modify**:
- `infra/lib/storage-stack.ts` (or equivalent CDK construct) — narrow the S3 policy to `images/*` and `thumbnails/*` prefixes only

**Success criteria**: Thumbnail Lambda IAM policy uses least-privilege: `s3:GetObject` on `images/*`, `s3:PutObject` on `thumbnails/*`. No `s3:*` wildcards.

---

### T3-T6: Missing auth/ownership/budget edge-case tests

**Priority**: P2
**Effort**: 1 hr

**Description**: Code review identified missing test coverage for:
- **T3**: Auth middleware rejects expired/malformed tokens
- **T4**: Farm ownership check prevents cross-user access
- **T5**: Budget enforcement blocks requests when limit exceeded
- **T6**: Edge cases in plot creation (duplicate names, max plots per bed)

**Files to create/modify**:
- `src/api/src/__tests__/auth.test.ts` — T3 tests
- `src/api/src/__tests__/ownership.test.ts` — T4 tests
- `src/api/src/__tests__/budget.test.ts` — T5 tests
- `src/api/src/__tests__/plots.test.ts` — T6 tests

**Success criteria**: All four test categories have at least 2 test cases each. Tests pass.

---

## Phase 4: Multi-Farm Architecture Change (~3-4 hrs)

> Status: PLANNED | Effort: ~3-4 hours
> Dependencies: Phase 1 complete (needs working farm CRUD as baseline)
> Branch: `feature/phase4-multi-farm` from `develop`
> Pre-work: Create ADR-YYYYMMDD-multi-farm-support.md before implementation

This is the most significant change in the plan. It moves from a one-farm-per-user constraint to supporting multiple farms per user. An ADR is required before implementation begins.

### N1: Multi-farm support

**Priority**: P0 (architectural change — unblocks future growth)
**Effort**: 3-4 hrs

**Description**: Currently, each user can own exactly one farm, enforced by a `ConditionExpression` in `createFarm()` and a `USER#<userId> SK=#FARM` record in DynamoDB. This phase removes that constraint and updates all layers accordingly.

**Pre-work**: Create ADR documenting the decision, migration strategy, and rollback plan.

**Backend changes** (`src/api/`):

| Change | File | Details |
|--------|------|---------|
| DynamoDB schema | `src/api/src/services/dynamodb.ts` | Change `USER#<userId> SK=#FARM` to `SK=FARM#<farmId>` to support multiple farm associations |
| Remove constraint | `src/api/src/services/dynamodb.ts` | Remove `ConditionExpression` in `createFarm()` that enforces one-farm-per-user |
| Query change | `src/api/src/services/dynamodb.ts` | `getFarmForUser()` becomes `getFarmsForUser()` returning `Farm[]` (query with `begins_with(SK, 'FARM#')`) |
| API response | `src/api/src/routes/farms.ts` | `GET /api/v1/farms` returns `{ farms: Farm[] }` array instead of single farm |
| Backward compat | `src/api/src/routes/farms.ts` | Handle both old `SK=#FARM` and new `SK=FARM#<farmId>` records during migration window |

**Frontend changes** (`src/frontend/`):

| Change | File | Details |
|--------|------|---------|
| Farm selector | `src/frontend/src/components/LoginForm.tsx` | If user has multiple farms, show a farm picker instead of auto-redirect |
| Farm context | `src/frontend/src/lib/farmContext.ts` (new) | `useLocalFarmId()` consumers need farm context awareness |
| Profile page | `src/frontend/src/components/ProfileForm.tsx` | Fields become read-only once farm created; add "+" button to create additional farm |
| API client | `src/frontend/src/lib/api.ts` | `getMyFarm()` becomes `getMyFarms()` returning `Farm[]` |
| All farm consumers | Multiple components | Update all `useLocalFarmId()` call sites to handle farm selection |

**Data migration**: No migration needed for existing single-farm users. The old `SK=#FARM` record continues to work. New farms use `SK=FARM#<farmId>`. The query layer handles both formats.

**Success criteria**:
- Existing single-farm users continue to work without changes
- A user can create a second farm via the profile page
- `GET /api/v1/farms` returns an array of all user's farms
- Login flow shows farm picker when user has multiple farms
- All pages respect the currently-selected farm context
- ADR is created and accepted before implementation starts

---

## Phase 5: New Features + Optimization (~4.5 hrs)

> Status: PLANNED | Effort: ~4.5 hours
> Dependencies: Phase 1 complete; N2 is independent; #90 benefits from Phase 4
> Branch: `feature/phase5-features` from `develop` (may split into sub-branches)

### N2: IoT service/guide page

**Priority**: P2
**Effort**: 1 hr

**Description**: Add a static informational page at `/services/` that describes the IoT integration capabilities (camera, sensors) and provides setup guides. This is a content page — no backend work required.

**Content sections**:
- Camera installation guide
- Sensor configuration guide
- Device pairing instructions
- "Coming soon: Device management dashboard" teaser

**Files to create**:
- `src/frontend/src/pages/services/index.astro` — static page with guide content

**Files to modify**:
- `src/frontend/src/components/BottomNav.tsx` — add Services nav item (or link from settings)
- `src/frontend/src/i18n/en.json` — add services page i18n keys
- `src/frontend/src/i18n/ja.json` — add services page i18n keys (Japanese)

**Dependencies**: None (fully independent)

**Success criteria**: `/services/` page renders with guide content in both languages. No backend calls required.

---

### #90: Settings cross-device sync

**Priority**: P1
**Effort**: 1-2 hrs

**Description**: Currently, user settings (theme, locale, temperature unit) are stored in `localStorage` only. Add `PATCH/GET /api/v1/settings` endpoints to persist settings to DynamoDB and sync across devices.

**Files to create**:
- `src/api/src/routes/settings.ts` — settings CRUD routes

**Files to modify**:
- `src/api/src/services/dynamodb.ts` — add `getUserSettings()` and `updateUserSettings()` methods (store as `PK=USER#<userId>, SK=#SETTINGS`)
- `src/api/src/app.ts` — register settings router
- `src/frontend/src/lib/api.ts` — add `getSettings()` and `updateSettings()` functions
- `src/frontend/src/components/SettingsPage.tsx` — sync to backend on change, fetch on mount

**Dependencies**: Phase 1 (needs auth flow working)

**Success criteria**:
- Settings persist to DynamoDB when changed
- Settings load from backend on login (with localStorage as fallback/cache)
- Changing locale on one device reflects on another after login

---

### S9: httpOnly cookies for refresh token

**Priority**: P1 (security improvement)
**Effort**: 30 min

**Description**: Move the Cognito refresh token from localStorage to an httpOnly cookie to reduce XSS attack surface.

**Files to modify**:
- `src/api/src/routes/auth.ts` (or auth middleware) — set refresh token as httpOnly cookie in login response
- `src/frontend/src/lib/auth.ts` — stop storing refresh token in localStorage; rely on cookie

**Dependencies**: None

**Success criteria**: Refresh token is no longer accessible via `document.cookie` or `localStorage`. Token refresh flow still works.

---

### Q11: Batch DynamoDB for farm detail N+1

**Priority**: P2
**Effort**: 30 min

**Description**: Farm detail pages make N+1 DynamoDB queries (one for the farm, one per field, one per bed, etc.). Use `BatchGetItem` or a single query with `begins_with` to fetch all related entities in one call.

**Files to modify**:
- `src/api/src/services/dynamodb.ts` — add `getFarmWithDetails(farmId)` method using a single query on `PK=FARM#<farmId>` with all SK prefixes

**Dependencies**: None

**Success criteria**: Farm detail endpoint makes 1-2 DynamoDB calls instead of N+1. Response time improves measurably.

---

### Q12: Dynamic timezone from farm location

**Priority**: P2
**Effort**: 15 min

**Description**: Timezone is currently hardcoded or inferred from the browser. Use the farm's latitude/longitude to determine the timezone for weather data display and scheduled operations.

**Files to modify**:
- `src/api/src/services/weather.ts` — derive timezone from farm coordinates (use a lightweight lookup or Open-Meteo's timezone response field)
- `src/frontend/src/lib/format.ts` — accept timezone parameter in date formatting functions

**Dependencies**: None

**Success criteria**: Weather times display in the farm's local timezone, not the browser's timezone.

---

### Q13: Atomic tag + plot status update

**Priority**: P2
**Effort**: 30 min

**Description**: Tagging a plot and updating its status are currently two separate DynamoDB operations. Make them atomic using a DynamoDB transaction to prevent inconsistent states.

**Files to modify**:
- `src/api/src/services/dynamodb.ts` — wrap tag creation + plot status update in `TransactWriteItems`
- `src/api/src/routes/plots.ts` — update the tag endpoint to use the transactional method

**Dependencies**: None

**Success criteria**: Tag + status update either both succeed or both fail. No partial states possible.

---

### S10: RemovalPolicy RETAIN for prod data stores

**Priority**: P1 (data safety)
**Effort**: 10 min

**Description**: DynamoDB tables and S3 buckets currently use the default `RemovalPolicy.DESTROY` in CDK, meaning a `cdk destroy` would delete all production data. Set to `RETAIN` for production.

**Files to modify**:
- `infra/lib/storage-stack.ts` — add `removalPolicy: cdk.RemovalPolicy.RETAIN` to DynamoDB table and S3 bucket constructs

**Dependencies**: None

**Success criteria**: `cdk destroy` leaves DynamoDB tables and S3 buckets intact. Dev environments can override to `DESTROY` via context variable.

---

### T8-T9: Standalone Zod schema tests

**Priority**: P2
**Effort**: 30 min

**Description**: The shared Zod schemas (`packages/shared/src/types/`) lack dedicated unit tests. Add tests that validate both positive and negative cases for the request/response schemas.

**Files to create**:
- `packages/shared/src/__tests__/schemas.test.ts` — test all exported Zod schemas

**Success criteria**: Each Zod schema has at least one valid-input and one invalid-input test. Tests pass.

---

## Execution Roadmap (All Phases)

```
Phase 1 (COMPLETE) ─────────────────────────────────────────────
  A1-A8: Core UX fixes, plot wizard, admin stats       ~4 hrs

Phase 2 ─────────── Phase 3 ────────────────────────────────────
  N3, N5, Q4, Q10,    Q5, Q7, Q8, Q9, S5, S7, S8,     ~3 hrs
  C6, S11 (~1 hr)     T3-T6 (~2 hrs)                   (parallel)

Phase 4 ────────────────────────────────────────────────────────
  N1: Multi-farm architecture                           ~3-4 hrs
  (requires ADR first)

Phase 5 ────────────────────────────────────────────────────────
  N2, #90, S9, Q11, Q12, Q13, S10, T8-T9               ~4.5 hrs
  (can split into sub-branches)
```

**Phase dependencies**:
- Phase 2 and Phase 3 can run in parallel (no shared files)
- Phase 4 depends on Phase 1 only (needs stable farm CRUD)
- Phase 5 items are mostly independent; #90 benefits from Phase 4 but does not require it

---

## Post-MVP Backlog

Items deferred beyond this plan (v1.0+):

| Item | Description | Target |
|------|-------------|--------|
| F7 IoT management | Camera node pairing, device status, firmware OTA | Production |
| F9 Full admin dashboard | User management, farm browsing, audit logs | Production |
| CI/CD pipeline | GitHub Actions for PR checks + auto-deploy to AWS | v1.0+ |
| Custom domain + TLS | ACM certificate, Route53, CloudFront custom domain | v1.0+ |
| Runtime SSM fetch for LLM key | Enable real AI chat by fetching API key from SSM at runtime | v1.0+ |
| Scoped IAM for deploy user | Replace AdministratorAccess with least-privilege CDK deploy role | v1.0+ |
| Map view | Interactive farm map with plot locations (user feedback request) | v1.0+ |
| Desktop responsive polish | Full desktop layout optimization (feedback: desktop gaps) | v1.0+ |

**Moved into scope** (from previous backlog):
- ~~Settings sync (#90)~~ — now Phase 5
- IoT service/guide page (N2) — now Phase 5 (static guide, not full F7 management)

---

## Success Criteria

### Phase 1 (v0.9) — COMPLETE

- [x] `GET /api/v1/farms` returns the user's farm for authenticated requests
- [x] Login flow populates localStorage with farmId + farmName on all devices
- [x] Users can create a plot through the guided wizard (no DB manipulation required)
- [x] New plots appear on the crops page immediately after creation
- [x] Weather conditions display correctly in both English and Japanese
- [x] Chat stub returns user-friendly text (no developer jargon) in both languages
- [x] Farm name appears in page titles on first load
- [x] Empty state messages reference manual actions, not camera nodes
- [x] Users can upload a crop photo from their phone camera
- [x] Admin stats page shows entity counts (admin-only access)
- [x] No regressions: existing auth, farm CRUD, weather, tagging flows still work
- [x] Frontend builds clean (`npm run build` in `src/frontend/`)
- [x] API type-checks clean (`npx tsc --noEmit` in `src/api/`)
- [x] Deploy succeeds: `npx cdk deploy` + S3 sync + CloudFront invalidation

### Phase 2 — Quick Fixes + Deploy Bugs

- [ ] Weather i18n renders correctly on first hydration (no English flash)
- [ ] Image upload verified working on PlotDetail
- [ ] Weather cache bounded to max size
- [ ] API starts locally without `TABLE_NAME` env var (uses default)
- [ ] Chat model name not exposed in `/usage` response
- [ ] No `storage_key` in image API responses

### Phase 3 — Tech Debt Sweep

- [ ] No non-null assertions on budget record access
- [ ] Malformed JSON returns 400, not 500
- [ ] Wind direction shows cardinal directions (N, NE, E, etc.)
- [ ] JPEG validation handles files < 3 bytes gracefully
- [ ] Rate limiter limitation documented
- [ ] LLM error bodies not logged to CloudWatch
- [ ] Thumbnail Lambda IAM policy uses least-privilege
- [ ] Auth, ownership, budget, and plot edge-case tests pass

### Phase 4 — Multi-Farm Architecture

- [ ] ADR created and accepted for multi-farm support
- [ ] `GET /api/v1/farms` returns array of all user's farms
- [ ] Users can create multiple farms
- [ ] Farm picker shown on login when user has multiple farms
- [ ] All pages respect selected farm context
- [ ] Existing single-farm users unaffected (backward compatible)
- [ ] Data migration not required (dual SK format supported)

### Phase 5 — New Features + Optimization

- [ ] IoT services/guide page renders at `/services/`
- [ ] Settings sync to backend via `PATCH/GET /api/v1/settings`
- [ ] Refresh token stored in httpOnly cookie (not localStorage)
- [ ] Farm detail loads in 1-2 DynamoDB calls (not N+1)
- [ ] Weather times use farm's local timezone
- [ ] Tag + plot status update is atomic (transactional)
- [ ] Prod data stores have `RemovalPolicy.RETAIN`
- [ ] Zod schema unit tests pass

### Overall (v1.0 ready to tag)

- [ ] All Phase 1-5 success criteria met
- [ ] Frontend builds clean (`npm run build` in `src/frontend/`)
- [ ] API type-checks clean (`npx tsc --noEmit` in `src/api/`)
- [ ] All tests pass
- [ ] Deploy succeeds: `npx cdk deploy` + S3 sync + CloudFront invalidation
- [ ] No P0/P1 items remaining in any phase

---

> Generated by Claude Opus 4.6 | MVP Refinement Plan (Phases 1-5) | 2026-03-21

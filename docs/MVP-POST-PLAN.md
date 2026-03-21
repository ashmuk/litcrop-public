# MVP-POST-PLAN.md — MVP Refinement Plan (v0.9)

> Date: 2026-03-21
> Scope: Post-deploy fixes + UX improvements
> Target: Tag v0.9 after completion
> Branch: `develop` (merge to `main` for deploy)
> Total estimated effort: ~4 hours

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

## Work Items

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

## Execution Sequence

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

**Recommended order** (optimized for unblocking):

| Phase | Items | Rationale |
|-------|-------|-----------|
| 1 | A1, A6, A3 | Quick wins: A1 unblocks A5 + A7 testing. A6/A3 are text-only, zero risk. |
| 2 | A4, A2 | A4 is quick. A2 is the largest item — the core plot creation feature. |
| 3 | A5, A7 | A5 verifies A1 resolved the timing. A7 needs a plot to test against. |
| 4 | A8 | Admin page is lowest priority, fully independent. |

**Parallelism**: A1+A6+A3 can be done simultaneously by different agents. A4 can overlap with A2 start. A7 and A8 can run in parallel in Phase 3/4.

---

## Post-MVP Backlog

Items explicitly deferred from this refinement pass:

| Item | Description | Target |
|------|-------------|--------|
| F7 IoT management | Camera node pairing, device status, firmware OTA | Production |
| F9 Full admin dashboard | User management, farm browsing, audit logs | Production |
| Settings sync (#90) | Sync theme/locale/temp_unit to backend (currently localStorage only) | v1.0 |
| CI/CD pipeline | GitHub Actions for PR checks + auto-deploy to AWS | v1.0 |
| Custom domain + TLS | ACM certificate, Route53, CloudFront custom domain | v1.0 |
| Runtime SSM fetch for LLM key | Enable real AI chat by fetching API key from SSM at runtime | v1.0 |
| Scoped IAM for deploy user | Replace AdministratorAccess with least-privilege CDK deploy role | v1.0 |
| Map view | Interactive farm map with plot locations (user feedback request) | v1.0 |
| Desktop responsive polish | Full desktop layout optimization (feedback: desktop gaps) | v1.0 |

---

## Success Criteria

**v0.9 is ready to tag when all of the following are true:**

- [ ] `GET /api/v1/farms` returns the user's farm for authenticated requests
- [ ] Login flow populates localStorage with farmId + farmName on all devices
- [ ] Users can create a plot through the guided wizard (no DB manipulation required)
- [ ] New plots appear on the crops page immediately after creation
- [ ] Weather conditions display correctly in both English and Japanese
- [ ] Chat stub returns user-friendly text (no developer jargon) in both languages
- [ ] Farm name appears in page titles on first load
- [ ] Empty state messages reference manual actions, not camera nodes
- [ ] Users can upload a crop photo from their phone camera
- [ ] Admin stats page shows entity counts (admin-only access)
- [ ] No regressions: existing auth, farm CRUD, weather, tagging flows still work
- [ ] Frontend builds clean (`npm run build` in `src/frontend/`)
- [ ] API type-checks clean (`npx tsc --noEmit` in `src/api/`)
- [ ] Deploy succeeds: `npx cdk deploy` + S3 sync + CloudFront invalidation

---

> Generated by Claude Opus 4.6 | MVP Post-Deploy Refinement Plan | 2026-03-21

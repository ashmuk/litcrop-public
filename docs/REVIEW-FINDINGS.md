# REVIEW-FINDINGS.md — LitCrop PoC

> Reviewed by: my-reviewer
> Date: 2026-03-18
> Branch: feature/infra-monorepo
> Scope: Full PoC implementation (78 files, 17,511 lines)

---

## Summary

- **MUST-FIX**: 4
- **SHOULD-FIX**: 4
- **SUGGESTION**: 3
- **Overall assessment**: needs-remediation

The implementation is structurally sound — architecture aligns with ARCHITECTURE.md, DynamoDB key patterns are correct, security controls are appropriate for a PoC, and error handling is consistent. However, four field-name mismatches between the shared TypeScript types and actual API response shapes, plus a missing required field in the simulator upload, mean the end-to-end flow is broken as-written. These are fixable in a single remediation pass.

---

## MUST-FIX Findings

### MF-1: Simulator never sends `captured_at` — every upload returns HTTP 400

- **File**: `src/simulator/src/upload.ts:42-48`
- **Severity**: MUST-FIX
- **Category**: functionality / data-integrity
- **Description**: The simulator `uploadImage` function builds its `FormData` with three fields — `image`, `trigger`, and `node_id` — but omits `captured_at`. The API route at `plots.ts:202-208` requires `captured_at` and rejects any upload missing it with a `400 VALIDATION_ERROR`. This means every call the simulator makes returns a 400 response; it never successfully uploads.
- **Impact**: Blocks exit criterion EC-1 ("Simulated camera node uploads an image to cloud storage via HTTPS") entirely. No images will ever reach S3 or DynamoDB from the simulator.
- **Recommended fix**: Add `formData.append('captured_at', new Date().toISOString())` in `upload.ts` after the existing three `append` calls (line 48). The `UploadOptions` interface may also benefit from an optional `capturedAt` parameter if callers need to specify a custom timestamp.

---

### MF-2: `getPlots` API client response mismatch — FarmOverview crashes at runtime

- **File**: `src/api/src/routes/farms.ts:211` and `src/frontend/src/lib/api.ts:118-119`
- **Severity**: MUST-FIX
- **Category**: functionality
- **Description**: The farm plots route returns `c.json({ data })` — a wrapper object with a `data` key. The API client function `getPlots` is typed as `Promise<FarmPlotItem[]>` and casts the raw response directly to that type (no unwrapping). `FarmOverview.tsx` then calls `setPlots(plotData)`, setting `plots` state to `{ data: FarmPlotItem[] }` instead of `FarmPlotItem[]`. On the very next render, `[...plots].sort(...)` (line 124) throws a `TypeError: plots is not iterable` since plain objects are not iterable.
- **Impact**: FarmOverview crashes entirely; no plots are displayed. Blocks EC-2 ("Uploaded images are retrievable and viewable in a mobile-first web UI") and EC-3 ("Images are associated with a specific plot").
- **Recommended fix**: Either (a) change `getPlots` to unwrap the response — `const res = await request<{ data: FarmPlotItem[] }>(...); return res.data;` — or (b) change the route to return the array directly: `return c.json(data)`. Option (a) keeps the route consistent with the `PaginatedResponse` envelope pattern already used by `getImages`.

---

### MF-3: Weather response field names diverge from shared `WeatherResponse` type

- **File**: `src/api/src/routes/weather.ts:80-95` and `packages/shared/src/types/api.ts:114-135`
- **Severity**: MUST-FIX
- **Category**: functionality
- **Description**: The `weather.ts` route returns `WeatherData` with these field names in `current`:
  - `temperature_c`, `humidity_pct`, `wind_speed_kmh`, `weather_icon`, `weather_label`, `wind_direction_deg` (number)

  The shared `WeatherResponse` type (and thus `FarmOverview.tsx`) expects:
  - `temperature`, `humidity`, `wind_speed`, `condition_icon`, `condition`, `wind_direction` (string)

  Every field name differs. `FarmOverview.tsx` accesses `weather.current.temperature`, `weather.current.humidity`, `weather.current.wind_speed`, `weather.current.condition_icon`, and `weather.current.condition` — all of which resolve to `undefined` at runtime.
- **Impact**: The weather strip in FarmOverview renders "NaN°C undefined — undefined% · undefined km/h". While weather is not a core exit criterion, this breaks a primary PoC deliverable (item 6 in PLANS.md).
- **Recommended fix**: Align the two. The simplest path is updating `weather.ts` to map to the shared `WeatherResponse` field names in its response transformation (`transformWeather`). Alternatively, update the shared type — but that requires updating `FarmOverview.tsx` as well.

---

### MF-4: `thumbnail_url` / `latest_tag` field name mismatches break image display throughout

- **File**: `src/api/src/routes/plots.ts:129-149` and `packages/shared/src/types/api.ts:52-86`
- **Severity**: MUST-FIX
- **Category**: functionality
- **Description**: Two field name mismatches exist between the plots route and the shared types:

  **A. `url` vs `thumbnail_url`**
  - `FarmPlotItem.latest_image` (shared type, line 64): `thumbnail_url: string`
  - `farms.ts:makeLatestImage` (line 107-113): returns `url`, not `thumbnail_url`
  - `ImageListItem` (shared type, line 84): `thumbnail_url: string`
  - `plots.ts` image list handler (line 134): returns `url`, not `thumbnail_url`

  `FarmOverview.tsx:196` renders `plot.latest_image.thumbnail_url` → `undefined` → `<img src={undefined}>` (broken image).
  `PlotDetail.tsx:258` renders `img.thumbnail_url` → `undefined` → falls through to the 📷 placeholder for every image.

  **B. `latest_tag` vs `tags`**
  - `ImageListItem` (shared type, line 85): `latest_tag: TagValue | null`
  - `plots.ts` image list (line 140-147): returns `tags: Tag[]` (an array, not a single value)

  `PlotDetail.tsx:256` uses `img.latest_tag` to set the status border CSS class — this will always be `undefined`, so no images get status borders.

- **Impact**: All image thumbnails in FarmOverview and PlotDetail show broken images or placeholder icons. The thumb-grid status border styling is never applied. Blocks EC-4 ("A time-ordered image gallery renders for a given plot").
- **Recommended fix**:
  - In `farms.ts makeLatestImage` and `plots.ts` image list: rename `url` → `thumbnail_url` in the response objects.
  - In `plots.ts` image list: either rename `tags` → `latest_tag` (returning only the most recent tag's value), or update `ImageListItem` to use `tags: Tag[]` and update `PlotDetail.tsx` accordingly.

---

## SHOULD-FIX Findings

### SF-1: S3 upload succeeds but DynamoDB write failure leaves orphaned S3 objects

- **File**: `src/api/src/routes/plots.ts:265-295`
- **Severity**: SHOULD-FIX
- **Category**: data-integrity
- **Description**: The upload handler calls `uploadImage` (S3 PutObject) then `dynamoRepo.createImage` (DynamoDB PutItem) sequentially with no rollback. If the DynamoDB write fails (lines 292-295 throw `ServiceUnavailableError`), the S3 object is already stored but has no metadata pointing to it. Subsequent requests cannot retrieve or delete it since the image ID and storage key are lost.
- **Impact**: Silent data leak in S3. For a PoC with low upload volume, space impact is minimal, but the pattern is incorrect and will become costly at higher volume.
- **Recommended fix**: On DynamoDB failure, call `deleteImage(storageKey)` in the catch block before rethrowing. A simple `try { await deleteImage(storageKey); } catch {}` in the error path is sufficient for PoC. For MVP, consider a transactional outbox or idempotent write pattern.

---

### SF-2: Malformed pagination cursor returns 503 instead of 400

- **File**: `src/api/src/routes/plots.ts:117-127` and `src/api/src/services/dynamodb.ts:53-55`
- **Severity**: SHOULD-FIX
- **Category**: functionality
- **Description**: `decodeCursor` calls `JSON.parse(Buffer.from(cursor, 'base64url').toString())`. An invalid base64url string or valid base64 of non-JSON content throws `SyntaxError`. The catch block in `plots.ts` only recognises `ValidationException` or messages containing `ExclusiveStartKey` — a `SyntaxError` matches neither. The request falls through to `throw new ServiceUnavailableError(...)` (503), which is incorrect; a bad cursor is a client error (400).
- **Impact**: Misleading error response; clients cannot distinguish "storage down" from "your cursor is malformed". Also masks legitimate 503 errors when the cursor is valid.
- **Recommended fix**: In `decodeCursor`, catch `JSON.parse` errors and rethrow as `BadCursorError`. Alternatively, add a try/catch around the `decodeCursor` call in `getImagesForPlot` before sending the DynamoDB query.

---

### SF-3: `storage_key` exposed in `GET /api/v1/images/{imageId}` response

- **File**: `src/api/src/routes/images.ts:39`
- **Severity**: SHOULD-FIX
- **Category**: security / API contract
- **Description**: The `GET /images/:imageId` handler includes `storage_key` in the JSON response body. The shared type `ImageDetailResponse` explicitly excludes it (`extends Omit<Image, 'storage_key'>`). The S3 bucket is private (not public), so this does not enable direct access, but it leaks the internal S3 key structure (including `farmId`, `plotId`, date hierarchy, and `imageId`) to any client.
- **Impact**: Reveals internal storage layout unnecessarily. Violates the API contract. At MVP with auth, this could leak one user's storage paths to another.
- **Recommended fix**: Remove `storage_key: image.storage_key` from the response object at line 39.

---

### SF-4: Non-atomic plot status update in `createTag` — race condition

- **File**: `src/api/src/services/dynamodb.ts:334-348`
- **Severity**: SHOULD-FIX
- **Category**: data-integrity
- **Description**: `createTag` performs three sequential operations: (1) write tag, (2) read plot to get `bed_id`, (3) update plot's `latest_status`. Between steps 1 and 3, another concurrent tag write could also read the same plot and update its status. The final `latest_status` would reflect whichever tag's `UpdateItem` ran last, not necessarily the chronologically latest tag. The architecture document (ARCHITECTURE.md §4, access pattern #9) acknowledges the read-then-update pattern but does not note this race.
- **Impact**: Under concurrent tagging (unlikely in single-user PoC), `latest_status` may be stale. For PoC, this is low probability but worth documenting and fixing before MVP.
- **Recommended fix**: Denormalize `bed_id` onto the Image record at write time (or store it in the Tag request body) to avoid the GSI1 lookup. The `UpdateItem` can then be done directly without the intermediate read, eliminating the TOCTOU gap.

---

## SUGGESTIONS

### SG-1: In-memory weather cache does not survive Lambda cold starts or scale-out

- **File**: `src/api/src/routes/weather.ts:16`
- **Severity**: SUGGESTION
- **Description**: The `weatherCache` Map is module-scoped. Each Lambda cold start (or additional instance under load) starts with an empty cache, causing a thundering-herd of Open-Meteo requests. For a single-user PoC this is harmless, but the architecture doc describes a DynamoDB TTL cache as an alternative. Adding a short comment acknowledging this limitation would help future maintainers.
- **Recommended fix**: Document the limitation with a code comment. At MVP, replace with DynamoDB TTL-based cache as described in ARCHITECTURE.md §3.

---

### SG-2: Chat assistant renders LLM Markdown as plain text

- **File**: `src/frontend/src/components/ChatAssistant.tsx:88-89`
- **Severity**: SUGGESTION
- **Description**: The system prompt (`chat.ts:28`) explicitly asks the LLM to "Use Markdown formatting for readability." The chat component renders `{msg.text}` as a plain text node, so Markdown syntax (`**bold**`, `- list item`) is displayed literally rather than rendered. This degrades the chatbot's usability.
- **Recommended fix**: Use a lightweight Markdown renderer (e.g., `marked` or a Preact-compatible renderer) to render assistant messages as HTML. Apply only to `role === 'assistant'` messages. Sanitise the HTML output to prevent XSS (the LLM response is not fully trusted).

---

### SG-3: `updateFarm` names map includes keys whose values were filtered out

- **File**: `src/api/src/services/dynamodb.ts:393-396`
- **Severity**: SUGGESTION
- **Description**: `ExpressionAttributeNames` is populated by iterating `Object.keys(updates)`, while `UpdateExpression` is built by iterating `Object.entries(updates)` and skipping `undefined` values. If a key has value `undefined`, it is added to `names` but not to `expressions`, which would cause DynamoDB to reject the request ("ExpressionAttributeNames contains invalid value"). In practice the routes filter undefined before passing to `updateFarm`, so this cannot be triggered through normal API usage — but it is a latent defect.
- **Recommended fix**: Build `names` inside the same loop that filters expressions, so only keys that appear in `expressions` are added to `names`.

---

## Test Coverage Assessment

### Coverage gaps identified

1. **No integration test for the upload-then-retrieve flow**: Tests mock S3 and DynamoDB independently. There is no test that exercises `POST /plots/:plotId/images → GET /images/:imageId` end-to-end — which is where MF-1 and MF-4 would have been caught.

2. **No contract tests between shared types and route responses**: The mismatches in MF-2, MF-3, and MF-4 indicate no test validates that actual JSON payloads conform to the shared TypeScript types. A simple schema snapshot or Zod-based schema test for each route would catch field name drifts immediately.

3. **No test for `decodeCursor` with invalid input** (SF-2): Error path coverage for pagination is absent.

4. **No test verifying `captured_at` is required in multipart upload**: The simulator omission (MF-1) would be caught by a test that exercises the actual validator with a FormData missing `captured_at`.

### Adequacy for PoC scope

The 165 tests provide good unit coverage of individual functions (DynamoDB key builders, weather transformation, tag validation, error hierarchy). For a PoC this is acceptable. The gaps above are integration-level and are the class of defect most likely to escape to end-to-end testing, which is why MF-1 through MF-4 made it to review.

---

## Exit Criteria Readiness

| EC | Criterion | Status | Notes |
|----|-----------|--------|-------|
| EC-1 | Simulated camera node uploads an image to cloud storage via HTTPS | **BLOCKED** | MF-1: simulator omits `captured_at`; every upload returns 400 |
| EC-2 | Uploaded images are retrievable and viewable in a mobile-first web UI | **BLOCKED** | MF-2: FarmOverview crashes; MF-4: image thumbnails broken |
| EC-3 | Images are associated with a specific plot in a farm layout | **Conditionally ready** | DynamoDB key patterns are correct; blocked by EC-1 preventing data from reaching storage |
| EC-4 | A time-ordered image gallery (timeline) renders for a given plot | **BLOCKED** | MF-4: `thumbnail_url`/`latest_tag` field mismatches; images won't display |
| EC-5 | Total monthly cloud cost for idle + light usage is under $5/month | **Ready** | Serverless architecture; cost analysis in ARCHITECTURE.md §7 shows ~$0.68/month worst case |
| EC-6 | End-to-end latency from upload to viewable-in-browser is under 30 seconds | **Not measurable** | Cannot validate until EC-1 is fixed; no latency-specific bottleneck identified in the code |

**Path to EC readiness**: The 4 MUST-FIX issues are all mechanical field-name mismatches and one missing FormData field — none require architectural changes. A single focused remediation pass (estimated: 2–4 hours) should resolve all MUST-FIX items and unblock all 6 exit criteria for end-to-end testing.

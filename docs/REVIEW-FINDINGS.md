# REVIEW-FINDINGS.md — LitCrop MVP Phase E

> Reviewed by: my-reviewer
> Date: 2026-03-20
> Branch: develop
> Scope: Design document cross-consistency (ARCHITECTURE.md, SYSTEM-DESIGN.md, UX-DESIGNS.md, API-CONTRACTS.md, schemas/index.ts)

---

## Summary

- **MUST-FIX**: 6
- **SHOULD-FIX**: 7
- **SUGGESTION**: 3
- **Overall assessment**: conditional-pass (no design flaws; alignment issues only)

Both STOP Gates (Architecture+System Design, UX+API Contracts) passed conditionally. All 6 MUST-FIX items are cross-document consistency mismatches — no fundamental design flaws. The documents are individually excellent; the fixes are targeted field/value alignments.

---

## MUST-FIX

### MF-1: 403 vs 404 for ownership failures
- **Files**: `docs/ARCHITECTURE.md:274`, `docs/API-CONTRACTS.md:383-389`, `docs/UX-DESIGNS.md:578`
- **Issue**: ARCHITECTURE.md §5 says ownership failures return `404 Not Found` (to avoid leaking resource existence). API-CONTRACTS.md §4b documents `403 FORBIDDEN` with message "Access denied: you do not own this resource." UX-DESIGNS.md §4.5 has a `403 Forbidden` error state.
- **Decision**: Use `404 NOT_FOUND` (ARCHITECTURE.md approach — more secure, prevents resource enumeration).
- **Fix**: Update API-CONTRACTS.md to remove `403 FORBIDDEN` from ownership failures in all endpoint error tables and §4b. Update UX-DESIGNS.md §4.5 to remove 403 error row and make 404 message generic ("Farm not found").

### MF-2: Pagination envelope mismatch
- **Files**: `docs/SYSTEM-DESIGN.md:818-824`, `docs/API-CONTRACTS.md:103-110`, `packages/shared/src/schemas/index.ts:142-146`
- **Issue**: SYSTEM-DESIGN.md §2.2 uses `pagination: { count, next_cursor, has_more }`. API-CONTRACTS.md and Zod use `meta: { count, limit, next_cursor }`.
- **Decision**: Standardize on `meta: { count, limit, next_cursor }` (matches API-CONTRACTS.md + Zod). Remove `has_more` (derivable from `next_cursor === null`).
- **Fix**: Update SYSTEM-DESIGN.md §2.2 `PaginatedResponse` to use `meta` key with `count`, `limit`, `next_cursor`.

### MF-3: Weather response field naming conflict
- **Files**: `docs/API-CONTRACTS.md:1344-1377`, `docs/SYSTEM-DESIGN.md:919-939`, `packages/shared/src/schemas/index.ts:244-254`
- **Issue**: SYSTEM-DESIGN.md + Zod use short names (`temperature`, `humidity`, `wind_speed`). API-CONTRACTS.md §8 uses qualified names (`temperature_c`, `humidity_pct`, `wind_speed_kmh`).
- **Decision**: Standardize on short names (matches Zod + SYSTEM-DESIGN.md). Units documented separately.
- **Fix**: Update API-CONTRACTS.md §8 `CurrentWeather` to use `temperature`, `humidity`, `wind_speed`.

### MF-4: Zod FarmBaseSchema missing user_id
- **Files**: `packages/shared/src/schemas/index.ts:38-49`, `docs/ARCHITECTURE.md`, `docs/API-CONTRACTS.md`
- **Issue**: Both ARCHITECTURE.md and API-CONTRACTS.md document `user_id: UserId` on farm response objects. Zod `FarmBaseSchema` does not include it. Blocks auth contract tests.
- **Fix**: Add `user_id: z.string()` to `FarmBaseSchema`.

### MF-5: Zod ImageDetailResponseSchema missing thumbnail_url
- **Files**: `packages/shared/src/schemas/index.ts:172-184`, `docs/API-CONTRACTS.md:§5.8`
- **Issue**: API-CONTRACTS.md documents `thumbnail_url: string | null` on `GetImageResponse`. Zod schema omits it.
- **Fix**: Add `thumbnail_url: z.string().nullable()` to `ImageDetailResponseSchema`.

### MF-6: S3 bucket name inconsistency
- **Files**: `docs/API-CONTRACTS.md:1270,1279`, `docs/ARCHITECTURE.md:435`
- **Issue**: API-CONTRACTS.md §7 references `litcrop-poc-images` (PoC bucket). ARCHITECTURE.md §6 uses `litcrop-mvp-images`.
- **Fix**: Replace all `litcrop-poc-images` with `litcrop-mvp-images` in API-CONTRACTS.md.

---

## SHOULD-FIX

### SF-1: FarmPlotItem / PlotSummary field mismatches
- **Files**: `docs/SYSTEM-DESIGN.md:858-872`, `docs/API-CONTRACTS.md:688-706`
- **Issue**: SYSTEM-DESIGN.md includes `bed_id`, `field_id`; API-CONTRACTS.md includes `field_name`, `bed_name` but no `bed_id`/`field_id`. Zod includes all four. Also: API-CONTRACTS.md adds `url` to `LatestImage` but Zod and SYSTEM-DESIGN.md do not.

### SF-2: ImageListItem vs ImageSummary structure divergence
- **Files**: `docs/SYSTEM-DESIGN.md:885-893`, `docs/API-CONTRACTS.md:834-852`
- **Issue**: SYSTEM-DESIGN.md uses `{ id, thumbnail_url, latest_tag }`. API-CONTRACTS.md uses `{ id, url, thumbnail_url, tags[] }`. Zod uses `{ id, thumbnail_url, latest_tag }`. Decide: flat `latest_tag` or full `tags[]`.

### SF-3: ChatResponse.tool_calls undocumented in API-CONTRACTS.md
- **Files**: `docs/SYSTEM-DESIGN.md:971-986`, `docs/API-CONTRACTS.md:1174-1179`
- **Issue**: SYSTEM-DESIGN.md and Zod include optional `tool_calls` array. API-CONTRACTS.md §5.11 omits it.

### SF-4: CropImpact severity enum mismatch
- **Files**: `docs/SYSTEM-DESIGN.md:964`, `docs/API-CONTRACTS.md:1384-1396`
- **Issue**: SYSTEM-DESIGN.md + Zod use `'danger' | 'warning' | 'good' | 'info'`. API-CONTRACTS.md uses `'info' | 'warning' | 'critical'`.

### SF-5: UX 403 error state conflicts with architecture
- **Files**: `docs/UX-DESIGNS.md:578`
- **Issue**: If 404 approach chosen (MF-1), the UX 403 error state is unreachable. (Addressed as part of MF-1.)

### SF-6: Single-farm-per-user constraint undocumented outside API-CONTRACTS.md
- **Files**: `docs/API-CONTRACTS.md:163`
- **Issue**: `409 CONFLICT` for single-farm constraint is only in API-CONTRACTS.md. Should be documented in ARCHITECTURE.md §4 or §5.

### SF-7: UX-DESIGNS.md duplicate section numbering
- **Files**: `docs/UX-DESIGNS.md:816`
- **Issue**: Section 5.8 used for both "Auth Form Card" (line 750) and "Toast Notification" (line 816). Toast should be 5.11.

---

## SUGGESTION

### SG-1: GET /farms/{farmId} nested plot comment
- Note that `FarmPlot` interface is a subset of `Plot` fields — add a brief comment for builders.

### SG-2: Weather heading farm name source
- Specify whether farm name in "Weather — LitCrop Demo Farm" comes from API call or cached auth session.

### SG-3: GET /farms/{farmId} plot subset fields
- The nested structure omits `bed_id`, `field_id`, `planted_at` — intentional for lightweight overview but could confuse builders.

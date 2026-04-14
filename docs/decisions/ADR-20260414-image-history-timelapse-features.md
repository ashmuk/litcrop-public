# ADR-20260414: Image Day-Grouped History and Timelapse Source Filtering

## Status
Proposed

## Context

Two related features (#393, #394) enhance image browsing in BedDetail:

1. **Day-grouped image history** -- replace the flat thumbnail grid with a date-accordion layout that groups images by capture day.
2. **Timelapse source filtering** -- add source (device/manual) and date-range filters to the existing TimeLapsePlayer, plus gap indicators.

Both features operate on data already returned by `GET /beds/:bedId/images` (paginated, max 100/page, cursor-based). Each item includes `node_id`, `captured_at`, `thumbnail_url`, and `url`. The API generates **3 AWS calls per image** (signed thumbnail URL, signed full URL, latest tag query).

Key constraints: monthly AWS budget ceiling of $5 (currently ~$1.18); no new API endpoints, DynamoDB changes, or AWS services.

### Volume estimate
Worst case: 96 images/day (15-min intervals, 16 daylight hours) x 30 days = 2,880 images. At 100/page that requires 29 sequential API calls to exhaust all pages, generating 8,640 AWS operations (signed URLs + tag queries).

## Options Considered

### Option 1: Frontend-only with progressive loading (Recommended)
- **Description**: Client-side grouping and filtering over the existing paginated API. Day-grouping uses `captured_at.slice(0, 10)`. Source filtering uses `node_id === 'phone-camera'`. Date-range filtering trims the `allImages` array by timestamp. No API changes.
- **Pros**: Zero backend work. Zero cost increase. Fully reversible. Ships in one sprint.
- **Cons**: Full-history load (29 pages) is slow for 30-day view. Each page generates 3x AWS calls. No server-side count available for collapsed day headers until images are fetched.
- **Effort**: Low

### Option 2: Add summary endpoint (`GET /beds/:bedId/images/summary`)
- **Description**: New API returning `{ date: string, count: number, representative_thumbnail: string }[]` with a single DynamoDB query and one signed URL per day. Frontend renders collapsed accordion immediately; expands trigger existing paginated endpoint.
- **Pros**: Instant day-accordion rendering. ~30x fewer signed URLs for initial load. Accurate counts before expansion.
- **Cons**: New API route + DynamoDB query pattern. Adds complexity for a feature whose primary user has 1-5 beds. Requires API deployment.
- **Effort**: Medium

### Option 3: Do nothing
- **Description**: Keep flat grid in BedDetail, keep TimeLapsePlayer as-is.
- **Pros**: No work.
- **Cons**: Image history becomes unusable past ~7 days. No filtering in timelapse.
- **Effort**: None

## Decision

**Option 1: Frontend-only with progressive loading.**

Both features are implemented entirely client-side with three design decisions:

**1. Shared image utilities module (`src/frontend/src/lib/image-groups.ts`)**

Extract from TimeLapsePlayer and generalize:
- `groupByDay(images)` -- groups by `captured_at.slice(0, 10)`, returns `DayGroup[]` with count and representative thumbnail.
- `groupByWeek(images)` -- current TimeLapsePlayer logic, moved here.
- `filterBySource(images, source)` -- filters on `node_id === 'phone-camera'` vs device.
- `filterByDateRange(images, range)` -- trims by 7d/30d/full presets.
- `detectGaps(images, thresholdMs)` -- returns gap indices where consecutive `captured_at` delta exceeds threshold.

TimeLapsePlayer imports from this module instead of owning `groupByWeek` internally.

**2. Day-grouped accordion in BedDetail (Feature #393)**

BedDetail already accumulates `images: ImageListItem[]` via `loadMoreImages()`. The accordion groups this array via `groupByDay()`. Each collapsed section shows date, count, and representative thumbnail. Expand reveals the existing thumbnail grid scoped to that day. Load-more button at the bottom continues to fetch additional pages -- newly loaded images are automatically slotted into existing or new day groups via a `useMemo` dependency on `images`.

No full-history preload required. The accordion renders incrementally as pages arrive.

**3. Timelapse filters (Feature #394)**

TimeLapsePlayer already exhausts all pages into `allImages` on mount. Filters apply client-side over this array before `groupByWeek()`:
- Source toggle: "All" | "Device only" | "Manual only" -- uses `filterBySource()`.
- Date range: "Last 7d" | "Last 30d" | "Full history" -- uses `filterByDateRange()`.
- Gap indicator: `detectGaps()` with 2-hour threshold inserts a visual divider in the progress bar during playback.

Filters are controlled state in TimeLapsePlayer; changing a filter resets week selection and preloader.

**4. Performance mitigation for 2,880-image worst case**

The API cost concern (8,640 AWS operations for 29 pages) is acceptable because:
- Signed URL generation is a local SDK operation, not an AWS API call -- it uses HMAC signing with cached credentials, zero network cost.
- The DynamoDB tag query is 1 RCU per image (eventually consistent), totaling ~2,880 RCUs. At 25 free RCUs/sec, a sequential load takes ~2 minutes but costs $0 within free tier.
- Timelapse already does this full exhaust today; these features add no new API calls.
- The progressive accordion (#393) does NOT exhaust all pages -- it renders incrementally.

## Rationale

Option 1 wins because:
- The cost profile is already established by TimeLapsePlayer's existing full-page exhaust.
- The summary endpoint (Option 2) optimizes a path that is not the bottleneck (initial render) while adding backend complexity that violates the "no new API" constraint.
- Extracting shared utilities reduces code in TimeLapsePlayer and prevents divergent grouping logic.
- Both features are fully reversible -- they change presentation, not data.

## Consequences

### Positive
- Reusable `image-groups.ts` module serves both features and future image views.
- TimeLapsePlayer loses ~60 lines of internal grouping logic, gaining a cleaner separation of concerns.
- Day-accordion makes 30-day history browsable without scrolling past hundreds of thumbnails.
- Source filtering lets users isolate device-captured images for timelapse quality (no phone selfies mixed in).

### Negative
- Full timelapse load for 30 days remains ~29 sequential fetches. Acceptable but not instant.
- Day-group counts in the accordion are only accurate for loaded pages. Later pages may add to existing days. Mitigated by showing "..." indicator on the last loaded day when `nextCursor` exists.
- No server-side date filtering means the client downloads all images even when the user only wants "Last 7d" in timelapse. At ~1KB/item metadata, 2,880 items = ~2.8MB -- acceptable for LTE.

## Scope Progression

| Feature | Level | Rationale | Advance trigger |
|---------|-------|-----------|-----------------|
| #393 Day-grouped history | **MVP** | Proven tech (client-side grouping), clear scope, low risk. Ship directly. | User feedback requests server-side counts or search-by-date |
| #394 Timelapse filtering | **MVP** | Extends existing TimeLapsePlayer with simple filter state. No unknowns. | User feedback requests cross-bed timelapse or AI-curated highlights |
| Shared `image-groups.ts` | **MVP** | Extract-and-reuse refactor. No new behavior, just better code organization. | N/A (stable utility) |
| Summary API endpoint | **Deferred** | Only needed if 2,880-image accordion load becomes a real UX problem. Monitor before building. | P95 accordion render time exceeds 3 seconds with real user data |

## Implementation Notes

### File changes
- **Create**: `src/frontend/src/lib/image-groups.ts` -- shared grouping/filtering utilities
- **Create**: `src/frontend/src/lib/__tests__/image-groups.test.ts` -- unit tests (~15 cases)
- **Modify**: `src/frontend/src/components/TimeLapsePlayer.tsx` -- import from `image-groups.ts`, add filter controls, add gap indicator
- **Modify**: `src/frontend/src/components/BedDetail.tsx` -- replace flat grid with day-accordion using `groupByDay()`
- **Modify**: `src/frontend/src/i18n/en.json` + `ja.json` -- new keys for filter labels, accordion headers
- **No changes**: API routes, DynamoDB, CDK, shared types

### Implementation order
1. Extract `image-groups.ts` + tests (can ship independently)
2. #393 day-accordion in BedDetail (depends on step 1)
3. #394 timelapse filters (depends on step 1, parallel with step 2)

### Signed URL clarification
S3 `getSignedUrl` from `@aws-sdk/s3-request-presigner` is a **local HMAC computation**, not an AWS API call. It uses cached credentials to sign a URL client-side. There is no per-URL AWS charge. The "3x AWS call" concern in the issue description is a misconception -- only the DynamoDB tag query is an actual AWS operation.

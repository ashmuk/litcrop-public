# Review Findings: MVP+ Post Fixes (F-10, F-14, F-15)

> Date: 2026-03-23
> Reviewer: my-reviewer agent (cc-review)
> Scope: 8 files changed, ~332 lines added, ~73 removed
> GitHub Issues: #139, #143, #144
> Verdict: **ACCEPTED** (MUST-FIX remediated inline)

---

## Findings

| # | File:Line | Issue | Severity | Status |
|---|-----------|-------|----------|--------|
| 1 | `farms.ts:332` | No server-side guard against deleting demo farm | **MUST-FIX** | **Remediated** — added `DEMO_FARM_ID` check before auth |
| 2 | `BedDetail.tsx:34` | `CROP_TYPES` duplicated locally vs i18n keys | SHOULD-FIX | **Remediated** — moved to `@litcrop/shared`, imported |
| 3 | `dynamodb.ts:565` | Farm creator gets `manager` role, DELETE requires `admin` | (pre-fixed) | **Fixed** in simplify pass — creator now gets `admin` |
| 4 | `dynamodb.ts:820-835` | BatchWrite single retry may silently drop items | SUGGESTION | Accepted — warning log added |
| 5 | `BedDetail.tsx:36-57` | `toJpegBlob` Canvas + `URL.revokeObjectURL` | OK | No leaks — revoked in both onload/onerror paths |
| 6 | `ProfilePage.tsx:90-105` | `confirmDelete` state management | OK | Cleared on both success and failure |
| 7 | `ProfilePage.tsx:158` | Demo farm magic string | SHOULD-FIX | **Remediated** — uses `DEMO_FARM_ID` from shared |

## Security

- [x] DELETE endpoint auth-protected (admin only via `assertFarmAccess`)
- [x] Demo farm protected server-side (`DEMO_FARM_ID` check before auth)
- [x] `toJpegBlob` Canvas API: no XSS vectors (local file only, no cross-origin)
- [x] Cascading delete scoped to single farm partition
- [x] Images retained in S3 (data retention)

## Shared Constants Added

- `DEMO_FARM_ID = 'demo-farm'` — used in API route + frontend ProfilePage
- `CROP_TYPES` array + `CropType` union — used in BedDetail crop form

## Verification

- [x] TypeScript clean (all 3 packages)
- [x] 321/321 tests pass (including updated createFarm role test)
- [ ] Manual: `curl -X DELETE /api/v1/farms/demo-farm` → should return 400
- [ ] Manual: upload HEIC/PNG photo → should convert to JPEG
- [ ] Manual: edit crop on bed → should persist

---

> Generated 2026-03-23 | ACCEPTED — no remaining MUST-FIX findings

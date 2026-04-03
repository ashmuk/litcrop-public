# Remediation Report: Beta-7 Farm Diary Design

## Summary
- **Review source:** `docs/feedback/REVIEW-FINDINGS-BETA7-DESIGN.md`
- **Iterations:** 1 of 3 max
- **Status:** RESOLVED

## Findings Resolution

| # | Finding | Severity | Status | Fix Applied |
|---|---------|----------|--------|-------------|
| MF-1 | Zod date accepts invalid calendar dates + missing future check | MUST-FIX | FIXED | Added `.refine()` for calendar validity + future +1 day check to `CreateDiaryEntrySchema` |
| MF-2 | photo_ids cross-farm validation missing from sequence diagram | MUST-FIX | FIXED | Added photo_ids loop with farm-scope check to Section 4.1 create diagram |
| MF-3 | PATCH needs explicit "never spread raw body" guard | MUST-FIX | FIXED | Added security comment to schema + step 5 in PATCH contract |
| MF-4 | 6-tab overflow at 320px | MUST-FIX | FIXED | Added responsive CSS strategy: icon-only below 360px |
| MF-5 | Calendar missing empty/loading/error states | MUST-FIX | FIXED | Added UI states table + specs for all 4 states to Screen D2 |
| SF-1 | No DiaryListQuerySchema | SHOULD-FIX | FIXED | Added full query schema with from/to/category/limit/cursor + 366-day refine |
| SF-2 | Cursor prefix validation not specified | SHOULD-FIX | FIXED | Added cursor decode + PK/SK prefix check + BadCursorError note to GET list |
| SF-3 | View toggle persistence key missing | SHOULD-FIX | FIXED | Added `litcrop-diary-view` localStorage key spec |
| SF-4 | Modal pattern undefined | SHOULD-FIX | FIXED | Changed to bottom sheet (mobile) / dialog (desktop) with z-index + focus trap spec |
| SF-5 | GSI1SK hardcoded in diagram | SHOULD-FIX | FIXED | Changed to `DDB_KEY_PREFIXES.META` in create diagram PutItem |
| SG-1 | Event emissions are design-originated scope | SUGGESTION | FIXED | Added "optional" note + clarified T1.4 doesn't block ACs |
| SG-2 | No 413/409 documented | SUGGESTION | DEFERRED | Low risk with UUID keys; deferred to implementation |
| SG-3 | Zod validation should precede bed check | SUGGESTION | FIXED | Reordered: membership → Zod validate → bed check → photo check |

## Iteration Log

### Iteration 1
- **Findings addressed:** All 13 (5 MUST-FIX + 5 SHOULD-FIX + 3 SUGGESTION)
- **Files modified:** `docs/designs/BETA7-DESIGN.md`
- **Outcome:** All MUST-FIX and SHOULD-FIX resolved. 1 SUGGESTION deferred (SG-2).

## Escalations
None.

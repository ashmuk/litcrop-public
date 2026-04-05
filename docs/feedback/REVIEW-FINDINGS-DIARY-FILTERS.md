# Review Findings: Diary Filters (#269)

> Reviewed: 2026-04-05 | Status: **ACCEPTED**

## Scope
- "All beds" option in diary entry form
- List view filtering by bed and category

## Findings & Remediation

| # | Issue | Severity | Status |
|---|-------|----------|--------|
| 1 | Magic strings `__all__`/`__none__` not constants | MEDIUM | **FIXED** — extracted `BED_FILTER_NONE` to `diary.ts`; removed `__all__` (was duplicate of empty) |
| 2 | Beds useEffect stale `beds.length === 0` guard | SHOULD-FIX | **FIXED** — removed guard, fetch fires cleanly on `farmId` change |
| 3 | `__all__` in form maps to same `null` as empty | LOW | **FIXED** — removed from form; filter bar still has "All beds" as default (empty string = no filter) |
| 4 | Duplicated `updateFilter*` functions | LOW | **FIXED** — consolidated to generic `updateFilter(setter, key, value)` |
| 5 | Ternary in filter predicate unclear | LOW | **FIXED** — single-pass filter with early-return for clarity |
| 6 | Double filter pass | SUGGESTION | Skipped — fixed as part of #5 (now single pass) |
| 7 | Repeated render condition prefix | LOW | Skipped — 3 branches, extraction adds complexity |

## Security
- No XSS: bed names rendered as text content
- No injection: API calls use URLSearchParams
- Sentinel values safe: bed IDs are UUIDs, no collision risk
- Auth properly gated server-side

## Verification
- [x] 604 tests passing
- [ ] Mobile: filter bar fits without crowding header
- [ ] Filter persistence: refresh page, filters retained
- [ ] "No bed assigned" filter correctly finds entries with `bed_id: null`

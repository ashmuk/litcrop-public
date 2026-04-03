# Beta-7 Test Strategy: Farm Diary

> Step 9 of the design pipeline (`cc-test`). Generated 2026-04-04.
> Issues: #245 (epic), #246 (work log), #247 (calendar)

## Current Coverage

| Layer | Tests | Status |
|-------|-------|--------|
| API route handlers | 29 | Complete — all endpoints, auth, IDOR, validation, errors |
| Contract tests | 0 diary | Gap — DiaryEntryResponseSchema/DiaryListResponseSchema missing |
| Frontend pure functions | 0 | Gap — 8 pure functions untested |
| Frontend components | 0 | Not planned for Beta-7 (requires @testing-library/preact setup) |

## Test Plan

### P1: Pure Function Tests (~24 tests, zero setup)

Prerequisites: Export pure functions from components into `lib/diary-utils.ts`.

| Function | Source | Tests | Edge Cases |
|----------|--------|-------|------------|
| `buildCalendarCells(year, month)` | DiaryCalendar.tsx | 6 | Leap Feb, month start Sunday/Saturday, 6-row month, 28/30/31 day months |
| `buildDotMap(entries)` | DiaryCalendar.tsx | 4 | Multiple categories per day, max 3 dots, empty entries, single entry |
| `computeBarPosition(planted, harvest, monthStart, monthEnd)` | CropTimeline.tsx | 5 | Bar before month (null), bar after month (null), partial overlap, full span, planted===harvest (null) |
| `formatCurrency(amount, currency)` | DiaryPage.tsx | 3 | JPY (no decimals), USD (2 decimals), zero amount |
| `groupByDate(entries)` | DiaryPage.tsx | 3 | Multiple dates newest-first, single date, empty array |
| `formatDateLabel(date)` | DiaryPage.tsx | 3 | Today, yesterday, older date |

### P2: Contract Tests (~2 tests, add to existing suite)

| Schema | File | Tests |
|--------|------|-------|
| `DiaryEntryResponseSchema` | contracts.test.ts | 1 |
| `DiaryListResponseSchema` | contracts.test.ts | 1 |

### P3: Component Tests (deferred — requires setup investment)

Not planned for Beta-7. Would require:
- `@testing-library/preact` installation
- `happy-dom` environment configuration
- ~8 tests for form validation, keyboard nav, view toggle

## Implementation Order

1. Extract pure functions to `lib/diary-utils.ts` (exportable)
2. Write P1 pure function tests in `src/frontend/src/__tests__/diary-utils.test.ts`
3. Add P2 contract schemas to `src/api/src/__tests__/contracts.test.ts`

## Expected Outcome

| Metric | Before | After |
|--------|--------|-------|
| Diary-specific tests | 29 | ~55 |
| Total tests | 576 | ~602 |
| Pure function coverage | 0% | ~100% |
| Contract coverage | 0 diary schemas | 2 diary schemas |

# Test Plan: #297 Gantt Chart with Diary Events

## Coverage Analysis

### What IS tested (11 tests for #297)

**Frontend — `diary-utils.test.ts` (8 tests)**
- `buildEventDotMap`: groups by bed_id, excludes null bed_id, includes all 9 categories, multiple beds, date sorting, empty input, reserved+actual entries
- `computeBarPosition`: multi-month 6-month window case

**API — `beds.test.ts` (3 tests)**
- `PATCH /beds/:bedId`: set completed_at, clear completed_at with null, reject invalid completed_at format

### What is NOT tested

| Function / Path | File | Gap |
|---|---|---|
| `parseDate` | diary-utils.ts:14 | Zero tests |
| `toDateString` | diary-utils.ts:19 | Tested but no edge cases (Dec→Jan rollover, negative day) |
| `buildMonthHeaders` (GanttChart helper) | GanttChart.tsx:41 | Zero tests — not exported, not testable without refactor |
| `computeBarPosition` edge: monthEnd < monthStart | diary-utils.ts:106 | Zero-width range returns null, not tested |
| `buildEventDotMap`: unknown category fallback | diary-utils.ts:173 | Falls back to CATEGORY_META['other'] — not tested |
| `buildEventDotMap`: same date multiple entries one bed | diary-utils.ts:164 | Not tested (unlike buildDotMap which tests dedup) |
| `buildActualDatesMap`: completed_at field interaction | diary-utils.ts:121 | buildActualDatesMap ignores completed_at — no coverage of this boundary |
| Schema: `completed_at` in UpdateBedRequestSchema | schemas/index.ts:166 | Regex validation tested via API only, no direct schema test |
| Schema: `completed_at` in BedDetailResponseSchema | schemas/index.ts:154 | Not tested in schema tests |
| API: GET beds returns completed_at | beds.test.ts | No test verifies completed_at appears in GET response |
| Gantt `loadGanttEntries` date range | DiaryPage.tsx:282 | Integration logic — needs API-level from/to param test |
| Diary API: `from`/`to`/`limit` query params | routes | Gantt uses limit=100 with date range — no tests for these query params |

---

## Recommended New Tests

### P1 — Must-Have (critical paths and edge cases)

#### File: `src/frontend/src/__tests__/diary-utils.test.ts`

1. **`parseDate — parses YYYY-MM-DD to midnight local`**
   Verifies `parseDate('2026-04-15')` returns a Date at midnight (hours=0, minutes=0) on April 15.

2. **`parseDate — handles month/year boundaries`**
   Verifies `parseDate('2026-01-01')` and `parseDate('2025-12-31')` produce correct Date objects with expected getMonth/getDate values.

3. **`buildEventDotMap — unknown category falls back to "other" color`**
   Pass an entry with `category: 'nonexistent'`. Verify the dot gets `CATEGORY_META['other'].color` (gray, `#9ca3af`).

4. **`buildEventDotMap — multiple entries same date same bed are all kept`**
   Unlike `buildDotMap` (which deduplicates), `buildEventDotMap` should keep every entry. Pass 3 planting entries on the same date/bed and verify length is 3.

5. **`computeBarPosition — returns null when monthEnd equals monthStart (zero-width range)`**
   Pass identical start and end dates. Verify `totalMs <= 0` branch returns null.

6. **`computeBarPosition — bar starts before range and ends after range (full clamp)`**
   Verify left=0 and width close to 100 when both dates exceed the range boundaries. (Existing test is close but uses approximate assertions — add exact boundary values.)

#### File: `packages/shared/src/__tests__/schemas.test.ts`

7. **`UpdateBedRequestSchema — accepts valid completed_at date string`**
   `{ completed_at: '2026-04-06' }` should parse successfully.

8. **`UpdateBedRequestSchema — accepts completed_at: null`**
   `{ completed_at: null }` should parse successfully.

9. **`UpdateBedRequestSchema — rejects completed_at with invalid format`**
   `{ completed_at: '2026-4-6' }` (no zero padding) and `{ completed_at: 'April 6' }` should fail.

10. **`BedDetailResponseSchema — accepts completed_at as string or null`**
    Add `completed_at: '2026-04-06'` to validBedDetail and verify it parses. Also verify `completed_at: null` parses.

### P2 — Should-Have (secondary functionality)

#### File: `src/frontend/src/__tests__/diary-utils.test.ts`

11. **`buildEventDotMap — entries sorted by date even when input is reverse-ordered`**
    Pass entries in descending date order, verify output is ascending. (Existing test covers this but only 3 entries — add a 5+ entry case for robustness.)

12. **`parseDate — does not produce off-by-one on timezone edge dates`**
    Verify `parseDate('2026-03-31').getDate()` is 31, not 1 (rules out UTC-midnight misinterpretation via the T00:00:00 suffix).

13. **`toDateString — December 31 to January 1 rollover`**
    `toDateString(new Date(2026, 11, 31))` should produce `'2026-12-31'`. `toDateString(new Date(2027, 0, 1))` should produce `'2027-01-01'`.

14. **`buildActualDatesMap — ignores completed_at field (no side effects from #297)`**
    Pass entries for a bed that has completed_at set in real data. Verify buildActualDatesMap only looks at diary entry categories, not bed metadata.

#### File: `src/api/src/__tests__/routes/beds.test.ts`

15. **`GET /beds/:bedId — returns completed_at in response`**
    Mock `getBedById` returning a bed with `completed_at: '2026-04-06'`. Verify the response body includes `completed_at`.

16. **`PATCH /beds/:bedId — rejects completed_at with time component`**
    Send `{ completed_at: '2026-04-06T10:00:00Z' }`. Expect 400 (regex requires `YYYY-MM-DD` only).

17. **`GET /diary entries — from/to query params filter correctly`**
    Verify that diary entry list endpoint respects `from` and `to` date range params used by `loadGanttEntries`.

### P3 — Nice-to-Have (unlikely edge cases)

#### File: `src/frontend/src/__tests__/diary-utils.test.ts`

18. **`buildEventDotMap — 100+ entries for one bed do not break sorting`**
    Generate 100 entries with random dates for one bed. Verify output is sorted ascending.

19. **`computeBarPosition — planted equals monthStart exactly`**
    Verify left is exactly 0 when the planted date matches rangeStart.

20. **`computeBarPosition — harvest equals monthEnd exactly`**
    Verify width reaches close to 100 when harvest matches rangeEnd.

21. **`buildDotMap — unknown category uses "other" meta`**
    Similar to buildEventDotMap test #3, but for the calendar dot map function.

22. **`formatCurrency — large JPY values use locale separators`**
    `formatCurrency(1000000, 'JPY')` should include commas.

---

## Assumptions

- `buildMonthHeaders` in GanttChart.tsx is NOT exported and depends on `localStorage` and `window`. It cannot be unit-tested without extraction. Recommend extracting to diary-utils.ts in a future refactor.
- No JSDOM is configured, so component render tests (GanttChart, DiaryPage) are out of scope.
- `handleMarkDone`, `handleUndoDone`, `handleGanttDotClick` are component-level handlers tested via integration/E2E, not unit tests.
- The `loadGanttEntries` function's `limit: 100` parameter is testable at the API route level if the diary endpoint supports `limit`.

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| `buildMonthHeaders` untested | Month header rendering bugs on boundary months | Extract to diary-utils.ts and add pure function tests |
| `parseDate` timezone issues | Off-by-one dates in different TZ environments | P1 test #1-2 and P2 test #12 |
| `completed_at` schema gaps | Invalid dates reach DB | P1 tests #7-9 cover schema validation |
| Gantt limit=100 silently clips data | Missing dots on busy farms | P2 test #17 verifies API pagination |

## Next

Implement P1 tests #1-10 (6 in diary-utils.test.ts, 4 in schemas.test.ts). Estimated: 30 minutes.

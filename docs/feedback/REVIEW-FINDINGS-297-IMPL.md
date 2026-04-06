# Review Findings: #297 Gantt Chart Implementation

**Reviewer**: my-reviewer
**Date**: 2026-04-06
**Scope**: Full implementation review of #297 (6 commits, 22 files, +3269/-13 lines)
**Branch**: develop (v0.42..HEAD)
**Tests**: 703/703 passing

---

## Summary

The implementation delivers a multi-month Gantt chart as a third diary view mode with diary event dots, active/done bed panes, and a `completed_at` field on the Bed entity. The work aligns with ADR-20260406 and ARCHITECTURE.md S14. Code quality is generally high, with clean separation of concerns, good test coverage, and consistent patterns.

---

## Findings

| File:Line | Issue | Severity |
|-----------|-------|----------|
| `GanttChart.tsx:88` | `useMemo` for `monthHeaders` has empty dependency array `[]` but captures `rangeStart`/`rangeEnd` which are recalculated on every render | SHOULD-FIX |
| `GanttChart.tsx:75` | `isMobile` is computed once at render time, not reactive to window resize | SUGGESTION |
| `GanttChart.tsx:75,288-289` | `isMobile` calculation is duplicated in `DiaryPage.tsx:288` (`loadGanttEntries`) and `GanttChart.tsx:75` -- range mismatch possible if one is stale | SHOULD-FIX |
| `GanttChart.tsx:88` | `buildMonthHeaders` is not memoized correctly -- `rangeStart`/`rangeEnd` are new Date objects on every render, so even with proper deps the memo would re-execute every render | SUGGESTION |
| `DiaryPage.tsx:292` | `loadGanttEntries` fetches `limit: 100` but does not follow cursor pagination for larger data sets (ARCHITECTURE.md S14.7 says "follow cursor pagination until all entries loaded") | SHOULD-FIX |
| `DiaryPage.tsx:370-379` | `handleMarkDone` calls `updateBed(bedId, ...)` -- the API function takes `bedId` only (not farmId), which is correct per `api.ts:217`, but the `confirm()` dialog uses `t('gantt.mark_done') + '?'` which concatenates a translated string with a literal `?` -- may produce awkward text in Japanese (`完了にする?`) | SUGGESTION |
| `GanttChart.tsx:194` | Event dot `title` attribute uses `CATEGORY_META[dot.category]?.icon` which is an emoji -- tooltip will show `🌱 2026-04-10`; this is fine but not screen-reader optimized -- the `aria-label` uses the raw category key (e.g., "planting") which is not translated | SHOULD-FIX |
| `GanttChart.tsx:134` | `gantt__row` lacks keyboard navigation -- rows are not focusable, so keyboard-only users cannot navigate between beds | SUGGESTION |
| `GanttChart.tsx:234` | `gantt__scroll` wraps only active beds + done section, but the header (`gantt__header`) is outside the scroll container -- on horizontal scroll the month headers will not scroll with the content | MUST-FIX |
| `components.css:2564-2584` | `gantt__dot` has 6x6px visual size with 44x44px touch target via `::before` pseudo-element -- this is good for mobile touch, but the `::before` has no `border-radius: 50%` making the hit area a square rather than matching the visual shape (minor) | SUGGESTION |
| `components.css:2437-2453` | Done/undo buttons have `opacity: 0` and only show on hover -- on touch devices without hover, they are invisible; mobile override at line 2688-2690 sets `opacity: 1` which is correct | -- (OK) |
| `diary-utils.ts:164-194` | `buildEventDotMap` includes both `reserved` and `actual` entries -- this matches the test at line 465-470, but the design doc does not explicitly address whether reserved (planned) dots should appear on the Gantt; this is a design choice, not a bug | SUGGESTION |
| `schemas/index.ts:166` | `completed_at` validation uses only a date-format regex (`/^\d{4}-\d{2}-\d{2}$/`) but does not validate that it is a real calendar date (e.g., `2026-02-31` would pass) | SHOULD-FIX |
| `beds.ts:110` | PATCH handler uses `assertBedWriteAccess` which checks `admin` or `owner` role -- this is correct for mark-done since only `canWrite` users see the button (DiaryPage:757) | -- (OK) |
| `farms.ts:146-159` | `bedToSummary` correctly includes `completed_at` | -- (OK) |
| `i18n/en.json:107-113` | Gantt i18n keys are present and complete | -- (OK) |
| `i18n/ja.json:107-113` | Japanese translations are present and reasonable | -- (OK) |
| `GanttChart.tsx` | Architecture doc (S14.1) called for a separate `GanttRow.tsx` (~80 lines) but the implementation inlines the row rendering as `renderRow()` inside GanttChart -- this is acceptable since the component is ~277 lines total, but deviates from the plan | SUGGESTION |

---

## Detailed Analysis

### MUST-FIX

**1. Header/content scroll misalignment (`GanttChart.tsx:217-253`)**

The month header row (`gantt__header`) is rendered outside the `gantt__scroll` container. When the user horizontally scrolls the Gantt content, the month labels remain fixed, creating a misalignment between headers and the timeline bars beneath them.

The header has its own `gantt__track--header` but it is not inside the scrollable area. Either:
- (A) Move the header inside `gantt__scroll` and make it sticky vertically, or
- (B) Synchronize the header's scroll position with the content via a shared `scrollLeft` ref.

Option (A) is simpler. The header `div` should be the first child of `gantt__scroll`, and given `position: sticky; top: 0` in CSS.

### SHOULD-FIX

**2. `useMemo` empty deps for `monthHeaders` (`GanttChart.tsx:88`)**

The `useMemo(() => buildMonthHeaders(rangeStart, rangeEnd), [])` uses an empty dependency array. Since `rangeStart` and `rangeEnd` are created fresh on every render (via `new Date()`), they are technically new values each time. The empty deps mean the headers are computed once and never update. In practice this is fine since the range does not change during a session, but it is semantically incorrect and would mask bugs if the range ever became dynamic.

**Fix**: Either stabilize `rangeStart`/`rangeEnd` with `useMemo`, or omit the dependency array concern entirely (the empty array is intentional and effectively correct for the current use case). Document the intent with a comment.

**3. Gantt entry fetch does not paginate (`DiaryPage.tsx:292`)**

The `loadGanttEntries` function passes `limit: 100` but does not follow `next_cursor` from the response. A farm with >100 diary entries in the 12-month window would show an incomplete dot overlay. The architecture doc explicitly calls for cursor-following.

**Fix**: Loop on `next_cursor` until all entries are loaded, or increase `limit` to the API max of 100 and note the limitation. For PoC scope, adding a comment documenting the 100-entry cap and creating a follow-up issue would be acceptable.

**4. Untranslated `aria-label` on event dots (`GanttChart.tsx:194`)**

The `aria-label` uses the raw category string (e.g., `"planting 2026-04-10"`) rather than the translated label. Screen readers will announce the English key name regardless of locale.

**Fix**: Use `t('diary.categories.${dot.category}')` for the category portion of the aria-label.

**5. `isMobile` duplication (`GanttChart.tsx:75` and `DiaryPage.tsx:288`)**

The mobile breakpoint check is duplicated between the component and its parent. If they evaluate at different times (e.g., during a resize), the data fetched by `loadGanttEntries` could cover a different date range than what `GanttChart` renders.

**Fix**: Either extract `isMobile` as a shared constant/hook, or have `GanttChart` emit its range parameters upward so the parent fetches the correct date range.

**6. `completed_at` date validation (`schemas/index.ts:166`)**

The regex `/^\d{4}-\d{2}-\d{2}$/` validates format but not semantics. Invalid dates like `2026-02-30` or `2026-13-01` pass validation. The `planted_at` and `expected_harvest` fields have the same issue (pre-existing), but `completed_at` is new code.

**Fix**: Add a `.refine()` clause similar to the diary entry date validation at line 498: `.refine(s => !isNaN(Date.parse(s)), { message: 'Invalid calendar date' })`.

### SUGGESTION

**7. `isMobile` not reactive to resize**

`isMobile` is computed once at component mount. If the user rotates a tablet or resizes the browser, the Gantt view does not adapt. For PoC scope this is acceptable, but a `useMediaQuery` hook or `matchMedia` listener would be more robust.

**8. `confirm()` dialog i18n**

The `handleMarkDone` uses `t('gantt.mark_done') + '?'` which appends a literal `?`. In Japanese this produces `完了にする?` which is understandable but not natural (Japanese typically uses `か？`). A dedicated i18n key like `gantt.mark_done_confirm` would be cleaner.

**9. Reserved entries in Gantt dots**

`buildEventDotMap` includes both reserved and actual diary entries. This means planned activities appear as dots on the Gantt alongside actual activities, with no visual distinction. Consider either filtering out reserved entries or using a distinct dot style (e.g., unfilled circle for reserved).

**10. Inline `renderRow` vs. extracted `GanttRow` component**

The architecture doc proposed a separate `GanttRow.tsx`. The inline `renderRow` function works but means each row is not independently memoizable with `React.memo`. With many beds (e.g., 25 in a 5x5 grid), this could cause unnecessary re-renders when collapsing/expanding the done section.

**11. Touch target shape**

The `::before` pseudo-element on `gantt__dot` is 44x44px (good for WCAG touch targets) but is a square. Adding `border-radius: 50%` would match the visual shape, though this has no functional impact.

---

## Checklist Assessment

### Alignment
- [x] Matches ADR-20260406 (Option 2: new GanttChart, keep CropTimeline)
- [x] Addresses ARCHITECTURE.md S14 requirements
- [x] `completed_at` semantics match ADR definition (cycle done, not retired)
- [ ] TASK-BREAKDOWN.md not updated for #297 tasks (pre-existing PoC doc, not applicable)
- [x] No unapproved scope creep

### Security
- [x] `assertBedWriteAccess` checks admin/owner role before PATCH
- [x] `completed_at` validated via Zod regex on server side
- [x] No injection vectors -- dot tooltips use `title` attribute (browser-escaped), not `innerHTML`
- [x] No credentials in logs or code
- [x] `canWrite` gate controls button visibility on frontend

### Quality
- [x] Component well-structured, ~277 lines, single responsibility
- [x] Follows existing BEM naming pattern (`gantt__*`)
- [x] CSS section clearly delineated with section comment
- [x] Error handling present (try/catch in mark-done/undo handlers)
- [x] Tests cover pure utility functions (buildEventDotMap, computeBarPosition multi-month)
- [x] API tests cover set/clear/invalid completed_at
- [x] No dead code or unused imports
- [x] i18n complete in both en and ja

### Accessibility
- [x] Done/undo buttons have aria-labels with bed name
- [x] Divider has `aria-expanded` for collapse state
- [ ] Event dot `aria-label` uses untranslated category key (SHOULD-FIX)
- [x] Touch target size adequate (44x44px via ::before)
- [ ] No keyboard navigation between rows (SUGGESTION)

### Responsive
- [x] Mobile: 6-month range, smaller label column, larger dots
- [x] Desktop: 12-month range, full label column
- [x] Horizontal scroll with `-webkit-overflow-scrolling: touch`
- [x] Done buttons always visible on mobile (opacity: 1)

### Edge Cases
- [x] Empty beds renders `gantt__empty` state
- [x] Beds with no crop dates render a row with no bars (just dots if entries exist)
- [x] `completed_at` without `planted_at` -- row renders with no bars, "done" pane
- [x] Dots outside visible range are filtered out (line 185)

### Performance
- [x] `useMemo` on `activeBeds`, `doneBeds`, `actualMap`, `dotMap`
- [ ] `monthHeaders` memo has empty deps (SHOULD-FIX -- benign in practice)
- [ ] Inline `renderRow` prevents per-row memoization (SUGGESTION)

---

## Recommendations

| # | Severity | Action |
|---|----------|--------|
| 1 | MUST-FIX | Move `gantt__header` inside `gantt__scroll` or sync scroll positions |
| 2 | SHOULD-FIX | Document `useMemo` intent or stabilize range dates |
| 3 | SHOULD-FIX | Add cursor pagination to `loadGanttEntries` or document 100-entry cap |
| 4 | SHOULD-FIX | Translate dot `aria-label` category using `t()` |
| 5 | SHOULD-FIX | Extract `isMobile` to avoid range mismatch between parent and child |
| 6 | SHOULD-FIX | Add `.refine()` for semantic date validation on `completed_at` |
| 7-11 | SUGGESTION | Address in follow-up or Beta-10 polish |

---

## Verification Needed

- [x] All 703 tests pass (verified)
- [ ] Manual test: horizontal scroll alignment between header and rows
- [ ] Manual test: mark-done then undo-done cycle
- [ ] Manual test: Gantt dot click navigates to correct calendar date
- [ ] Manual test: mobile viewport (< 768px) shows 6-month range
- [ ] Verify farm with >100 diary entries shows all dots (or document limitation)

---

## Verdict

**1 MUST-FIX** (header scroll alignment), **5 SHOULD-FIX** items, **5 SUGGESTION** items.

The MUST-FIX is a layout bug that will be visible to users on any Gantt view wider than the viewport. The SHOULD-FIX items are quality improvements that should be addressed before merging to `main` but do not block a merge to `develop`. The implementation is otherwise solid, well-tested, and well-aligned with the design documents.

**Recommendation**: Run `/cc-remediate` to address findings #1 through #6 before creating the PR.

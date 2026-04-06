# Session Report: Beta-10 — ROI Dashboard

> Date: 2026-04-06
> Tag: v0.45 (ad0e3ff on develop)
> Branch: develop
> Commits: 11 since v0.44
> Tests: 713 → 763 (+50 new tests)
> AWS Cost Delta: $0.00/month

---

## Pipeline Context

Full design-to-implementation pipeline for Beta-10 ROI Dashboard (#248, #245).
This sprint adds financial analytics to the Farm Diary — harvest tracking,
revenue recording, and ROI calculation per bed/crop.

```
Pipeline:   cc-design (Steps 2-7) → cc-review → cc-implement (Batches 1-5)
            → cc-review → cc-remediate → cc-test → push → tag
Previous:   v0.44 (Beta-9 mobile polish complete)
Next:       Beta-11 (Device Integration) or Pre-PROD (#313 auth matrix)
Issues:     #248 (ROI dashboard), #245 (diary parent), #315 (admin fix)
```

---

## Session Timeline

| Phase | Activity |
|-------|----------|
| **Preview** | `/cc-preview` — dashboard showing Beta-9 complete, Beta-10 next |
| **Design Step 2** | Architecture delta (ARCHITECTURE.md §15): data model, aggregation, currency |
| **STOP gate** | User answered 4 open questions (harvest unit, date range, currency, UX) |
| **Design Step 3** | UX/UI design (UX-DESIGNS.md §16): 17 subsections, 930 lines |
| **Design Step 4** | HTML/CSS mockups (roi-dashboard.html, roi-harvest-form.html) |
| **Review 1** | 3 MUST-FIX + 4 SHOULD-FIX found → all remediated |
| **Commit 1** | `dcb1a0e` — design phase docs + mockups |
| **Design Step 5** | System design (SYSTEM-DESIGN.md §12): 1,395 lines, merged from standalone |
| **Design Steps 6-7** | Task breakdown (20 tasks) + execution plan (PLANS.md Beta-10 section) |
| **Review 2** | 3 MUST-FIX (dangling refs) + 3 SHOULD-FIX → all remediated |
| **Commit 2** | `b176f42` — system design, tasks, plan |
| **Batch 1** | Shared types + Zod schemas + 6 contract tests (713 → 719) |
| **Simplify** | CurrencySchema reuse, boolean simplification, test fixture extraction |
| **Commit 3** | `e75b315` — Batch 1 |
| **Batch 2** | API layer: DynamoDB, diary routes, farm routes |
| **Simplify** | Cache pattern, redundant fallback, createDiaryEntry reuse |
| **Commit 4** | `8a2e0b1` — Batch 2 |
| **Batch 3** | roi-utils.ts (5 functions) + 32 unit tests (719 → 745) |
| **Simplify** | harvestRevenue helper, computeRoiByBed push unification |
| **Commit 5** | `0a41af0` — Batch 3 |
| **Batch 4** | 5 UI components, DiaryPage tab, DiaryEntryForm harvest fields, i18n, CSS |
| **Simplify** | Fixed broken retry, null-ROI color bug, animation, CSS class mismatch |
| **Commit 6** | `b395db9` — Batch 4 |
| **Batch 5** | Currency setting, warnings, polish |
| **Simplify** | empty-state class fix, SetupForm pattern alignment |
| **Commit 7** | `639c0af` — Batch 5 |
| **Review 3** | Full implementation review: 3 MUST-FIX + 5 SHOULD-FIX + 6 SUGGESTION |
| **Remediate** | POST /farms currency bug, 13 test mock fixes, i18n unassigned |
| **Commit 8** | `c8355b3` — remediation |
| **Continue** | Dark/earthy theme tokens, a11y keyboard sort, NaN guard, docs |
| **Commit 9** | `ad0e3ff` — remaining findings |
| **Push + Tag** | v0.45 pushed to origin |
| **Test strategy** | Coverage gap analysis, 16 recommended tests |
| **Test impl** | 18 new tests across 4 test files (745 → 763) |
| **Commit 10** | `53ecf1e` — test strategy + tests |
| **Push** | Final push to origin/develop |

---

## Design Phase (Steps 2-7)

### Artifacts Produced

| Artifact | Location | Lines |
|----------|----------|-------|
| Architecture delta | ARCHITECTURE.md §15 | ~260 |
| ADR | decisions/ADR-20260406-roi-dashboard.md | ~93 |
| UX/UI design | UX-DESIGNS.md §16 | ~930 |
| Mockups | docs/mockups/roi-dashboard.html | ~1,570 |
| Mockups | docs/mockups/roi-harvest-form.html | ~1,020 |
| System design | SYSTEM-DESIGN.md §12 | ~1,390 |
| Task breakdown | TASK-BREAKDOWN.md (Beta-10 section) | ~530 |
| Execution plan | PLANS.md (Beta-10 section) | ~75 |
| Prerequisites | PREREQUISITES.md §8 | ~65 |
| Review findings | feedback/REVIEW-FINDINGS-BETA10-DESIGN.md | ~320 |
| Test strategy | TEST-STRATEGY.md (Beta-10 addendum) | ~280 |

### Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Data model | 4 inline fields on DiaryEntry | Simplest; no new DDB entity or GSI |
| Revenue tracking | Explicit revenue + revenue_currency | Cleaner than negative CostItems |
| Aggregation | Client-side in roi-utils.ts | Data volume trivial (~400KB/year) |
| Charts | Pure CSS (no library) | Zero bundle size; matches Gantt pattern |
| Currency | Farm default_currency, single-currency aggregation | No conversion API dependency |
| Date range | Calendar year (Jan-Dec) | Maps to agricultural seasons |
| Placement | 4th tab in diary page | Co-located with work logs |

### User Decisions (4 open questions resolved)

1. **Harvest unit**: Free-text with datalist suggestions
2. **Date range**: Calendar year (Jan-Dec) — Jan-Mar is quiet season
3. **Currency setting**: Explicit on farm edit page
4. **Revenue UX**: Auto-show when category = 'harvesting'

---

## Implementation Phase (Batches 1-5)

### Commit Log

| Commit | Type | Batch | Description | Tests |
|--------|------|-------|-------------|-------|
| `dcb1a0e` | docs | design | Architecture, UX, mockups | — |
| `54cd969` | fix | — | Admin test-email POST body (#315) | — |
| `b176f42` | docs | design | System design, tasks, plan | — |
| `e75b315` | feat | 1 | Shared types + schemas | 719 |
| `8a2e0b1` | feat | 2 | API layer (DynamoDB, routes) | 719 |
| `0a41af0` | feat | 3 | roi-utils + 32 unit tests | 745 |
| `b395db9` | feat | 4 | Frontend UI (5 components, i18n, CSS) | 745 |
| `639c0af` | feat | 5 | Currency setting, polish | 745 |
| `c8355b3` | fix | rem | Review remediation (13 test mocks) | 745 |
| `ad0e3ff` | fix | rem | Dark theme, a11y, NaN guard | 745 |
| `53ecf1e` | test | test | 18 tests from test strategy | 763 |

### Files Changed

- **7 new files created**: roi-utils.ts, roi-utils.test.ts, RoiDashboard.tsx, RoiSummaryCards.tsx, CostByCategoryChart.tsx, MonthlyTrendChart.tsx, RoiByBedTable.tsx
- **~37 files modified**: types, schemas, API routes, DynamoDB, components, i18n, CSS, test files
- **Total delta**: +9,311 lines / -53 lines across 44 files

### Quality Gates

| Gate | Passes | Issues Found | Issues Fixed |
|------|--------|-------------|-------------|
| `/simplify` | 5 | 15 improvements | 15 |
| `/cc-review` (design) | 2 | 6 MUST-FIX, 7 SHOULD-FIX | 13/13 |
| `/cc-review` (impl) | 1 | 3 MUST-FIX, 5 SHOULD-FIX, 6 SUGGESTION | 14/14 |
| `/cc-test` | 1 | 7 HIGH/MEDIUM gaps | 18 tests added |

### Bugs Caught by Review

| Bug | Severity | How Caught |
|-----|----------|-----------|
| POST /farms silently drops default_currency | MUST-FIX | Review 3, finding #1 |
| 13 test files missing required Farm field | MUST-FIX | Review 3, finding #3 |
| Retry button was a no-op (setYear identity) | Fixed by simplify | Simplify Batch 4 |
| Null ROI colored as negative (should be neutral) | Fixed by simplify | Simplify Batch 4 |
| Harvest section unmounting broke animation | Fixed by simplify | Simplify Batch 4 |
| CSS class mismatch (empty-state__title vs __heading) | Fixed by simplify | Simplify Batch 5 |
| Hardcoded "Unassigned" not i18n-aware | SHOULD-FIX | Review 3, finding #8 |

---

## Feature Summary

### What was built

**ROI Dashboard** — 4th tab (💰) in the Farm Diary page:
- **Year navigation**: Calendar year selector with prev/next buttons
- **Summary cards**: Total Cost, Revenue, ROI %, Harvest Count
- **Cost by category**: Horizontal bar chart (pure CSS) sorted by spend
- **Monthly trend**: 12-column stacked bars showing cost vs revenue
- **Per-bed table**: Sortable by any column, mobile card layout, ROI color coding
- **Currency awareness**: Farm default_currency setting, single-currency aggregation

**Harvest tracking** — New fields in diary entry form:
- Auto-revealed when category = 'harvesting'
- harvest_amount (number), harvest_unit (free-text with suggestions)
- revenue (number), revenue_currency (JPY/USD)
- NaN validation on numeric inputs

**Farm currency setting** — JPY/USD select in Setup form

### Accessibility
- Screen reader: sr-only table for monthly chart, aria-sort on table headers
- Keyboard: sort headers support Enter/Space
- Color: never color-alone — icons + labels + color combined
- Themes: full dark + earthy mode support for all ROI tokens

---

## Test Coverage

| Category | Before | After | New |
|----------|--------|-------|-----|
| Unit (roi-utils) | 0 | 37 | +37 |
| Contract (schemas) | 6 diary | 14 | +8 |
| API route (diary) | existing | +8 | +8 |
| API route (farms) | existing | +2 | +2 |
| **Total** | **713** | **763** | **+50** |

### Coverage by risk area

| Area | Coverage |
|------|----------|
| Currency-aware aggregation | 8 unit tests + 2 API tests |
| Harvest refine guard | 4 tests (schema + API levels) |
| Backward compatibility | 2 tests (null harvest fields) |
| Floating point edge cases | 2 tests |
| Boundary values | 1 test |

---

## Cost Impact

| Resource | Before | After | Delta |
|----------|--------|-------|-------|
| DynamoDB | Same table, same GSIs | +4 nullable attrs/entry | $0.00 |
| Lambda | Same endpoints | +~20 bytes/response | $0.00 |
| S3/CloudFront | Unchanged | Unchanged | $0.00 |
| **Monthly total** | **~$1.18** | **~$1.18** | **$0.00** |

---

## Learnings & Notes

1. **The `/simplify` pass caught 6 real bugs** across the UI batches — the most productive quality gate in the pipeline. The broken retry button and null-ROI coloring would have been user-visible bugs.

2. **The `cost_total` mixed-currency issue** is a pre-existing design flaw (documented but not fixed). The ROI dashboard correctly avoids it by summing raw `costs[]` items with currency filtering. Future sprints should consider deprecating `cost_total` from the API response.

3. **esbuild masks TypeScript errors in tests** — vitest passes even when `tsc --noEmit` fails. The review caught 16+ type errors in test fixtures that would have been invisible without manual `tsc` checking. Consider adding a CI type-check step.

4. **Calendar year date range** was the right call — the year selector maps naturally to agricultural growing seasons, and the empty Jan-Mar months in the monthly trend chart correctly show the quiet season.

5. **Pure CSS charts** proved viable for 3 chart types (horizontal bars, stacked bars, metric cards). The pattern follows the existing Gantt chart approach. A chart library would only be needed for interactive drill-down (Production scope).

---

## Next Steps

| Priority | Item | Scope |
|----------|------|-------|
| 1 | Deploy Beta-10 to AWS | `/cc-deploy` |
| 2 | #313 Auth access matrix review | Pre-PROD |
| 3 | Beta-11 Device integration | Next sprint |
| 4 | #256 Holistic quality review | Pre-PROD |
| 5 | #238/#239 Production infra | Pre-PROD |

# Remediation Report — #297 Design Review

## Summary
- Review source: docs/feedback/REVIEW-FINDINGS-297-DESIGN.md
- Iterations: 1 of 3 max
- Status: RESOLVED

## Findings Resolution

| # | Finding | Severity | Status | Notes |
|---|---------|----------|--------|-------|
| 1 | `completed_at` semantics undefined | MUST-FIX | FIXED | ADR + ARCHITECTURE.md clarified: "crop cycle done", not "bed retired" |
| 2 | Beta-10 migration not acknowledged | MUST-FIX | FIXED | ADR consequences section now includes migration path for #279 |
| 3 | `FarmBed`/`FarmBedItem` missing from files | SHOULD-FIX | FIXED | T9.3 updated to include `api.ts` types |
| 4 | `computeRangePosition` unnecessary alias | SHOULD-FIX | FIXED | ARCHITECTURE.md updated: use `computeBarPosition` directly |
| 5 | Pagination needs AbortController | SHOULD-FIX | FIXED | T9.9 updated to include AbortController + loading state |
| 6 | Mobile "mark done" UX inconsistent | SHOULD-FIX | FIXED | ARCHITECTURE.md clarified: icon button on all platforms |
| 7 | `other` category exclusion contradiction | SHOULD-FIX | FIXED | T9.5 explicitly lists all 9 categories |

## Iteration Log
### Iteration 1
- Findings addressed: F1-F7 (all)
- Files updated: ADR-20260406, ARCHITECTURE.md, TASK-BREAKDOWN.md
- Outcome: All findings resolved

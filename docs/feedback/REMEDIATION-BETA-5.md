# Remediation Report — Beta-5 Design (Steps 5-7)

## Summary
- Review source: cc-review of SYSTEM-DESIGN.md §11, TASK-BREAKDOWN.md, PLANS.md
- Iterations: 1 of 3 max
- Status: RESOLVED

## Findings Resolution

| # | Finding | Severity | Status | Notes |
|---|---------|----------|--------|-------|
| 1 | `active_window` shape mismatch (flat vs nested) | MUST-FIX | FIXED | Device interface uses nested `{ start, end }`; DynamoDB stores flat; service layer transforms. Comment added. |
| 2 | T-B5-20 missing dependency on T-B5-22 | SHOULD-FIX | FIXED | Added T-B5-22 to T-B5-20 dependency column |
| 3 | T-B5-06 intra-batch dep in Batch 3 | SHOULD-FIX | FIXED | Moved T-B5-06 to Batch 4 |
| 4 | Summary size counts wrong (15S → 18S) | SHOULD-FIX | FIXED | Updated Wave 0B (5S), Wave 1 (6S), total (18S) |
| 5 | File summary missing test + package files | SHOULD-FIX | FIXED | Added 7 files; total now 29 files |
| 6 | T-B5-25 vague file targets | SUGGESTION | FIXED | Listed FarmMemberList.tsx and AdminDashboard.tsx |
| 7 | Zod node_name missing min/max | SUGGESTION | FIXED | Added `.min(1).max(64)` to both schemas |
| 8 | Exit criteria missing device events | SUGGESTION | FIXED | Added activity log criterion |

## Iteration Log
### Iteration 1
- Findings addressed: all 8
- Outcome: all resolved

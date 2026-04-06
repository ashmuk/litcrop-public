# Remediation Report — #301 / #302

## Summary
- Review source: docs/feedback/REVIEW-FINDINGS-301-302.md
- Iterations: 1 of 3 max
- Status: RESOLVED

## Findings Resolution

| # | Finding | Severity | Status | Notes |
|---|---------|----------|--------|-------|
| 1 | Schema `diff <= 366` rejects explicit client requests matching server's ~395-day default | SHOULD-FIX | FIXED | Raised to `diff <= 400` in DiaryListQuerySchema |
| 2 | No regression test for future-dated entries in default GET | SHOULD-FIX | FIXED | Added test asserting default `to` extends past future entry date |
| 3 | `setFullYear` on Feb 29 → Mar 1 (one-day drift) | SUGGESTION | DEFERRED | Cosmetic, does not affect functionality |
| 4 | Wider DynamoDB scan range (~395 days) | SUGGESTION | DEFERRED | Safe at current scale with pagination limit |

## Iteration Log
### Iteration 1
- Findings addressed: F1 (schema limit), F2 (regression test)
- Files changed: `packages/shared/src/schemas/index.ts`, `src/api/src/__tests__/routes/diary.test.ts`
- Test count: 691 → 692
- Outcome: All SHOULD-FIX resolved, SUGGESTIONs deferred as acceptable

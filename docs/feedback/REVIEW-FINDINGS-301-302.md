# Review Findings: #301 Future Diary Entries + #302 Mobile Split View

**Date**: 2026-04-06
**Reviewer**: my-reviewer (Opus 4.6)
**Branch**: `develop`
**Scope**: Two bug fixes -- diary API default date range (#301) and mobile split CSS (#302)

---

## Summary

Two targeted bug fixes. Issue #301: future diary entries (e.g., reserved cropping dates) were saved to DynamoDB but invisible in list/split views because the API defaulted `to` to today. Issue #302: mobile split view collapsed to a single column, making it visually identical to list view.

Both fixes are correct and minimal. One schema alignment issue requires attention.

| Severity | Count |
|----------|-------|
| **MUST-FIX** | 0 |
| **SHOULD-FIX** | 2 |
| **SUGGESTION** | 2 |

**Status: conditional approval** (0 MUST-FIX, 2 SHOULD-FIX)

### Positives

- Root cause correctly identified in both cases -- server-side default, not a query or rendering bug.
- DynamoDB query uses `SK BETWEEN :from AND :to` (Query, not Scan) -- efficient even with the extended range.
- CSS fix maintains BEM naming, uses `grid-column: 1 / -1` for month separator spanning, and adds a right-border separator between reserved/actual columns.
- Frontend list view passes no date params, so the server default change immediately applies without frontend changes.

---

## Findings

| # | File:Line | Issue | Severity |
|---|-----------|-------|----------|
| 1 | `packages/shared/src/schemas/index.ts:521` | Schema enforces `diff <= 366` days when client supplies both `from` and `to`, but the server default range is ~395 days (30 back + 365 ahead). A client attempting to replicate the server default explicitly will receive a 400 validation error. The schema and server defaults should be aligned. | SHOULD-FIX |
| 2 | `src/api/src/__tests__/routes/diary.test.ts` | No test verifies that future-dated entries appear in the default GET response. The existing "lists entries with default date range" test passes but does not assert future entries are included. A regression (reverting `defaultTo` to today) would go undetected. | SHOULD-FIX |
| 3 | `src/api/src/routes/diary.ts:290` | `setFullYear` on Feb 29 of a leap year yields Mar 1 of the next (non-leap) year. Cosmetic only -- the `to` boundary shifts by one day, which has no functional impact. No fix needed. | SUGGESTION |
| 4 | `src/api/src/routes/diary.ts:285-295` | The default window now covers ~395 days of DynamoDB sort key range. With 50-entry pagination limit this is safe. Worth monitoring if farms accumulate more than ~500 diary entries per year. | SUGGESTION |

---

## Detailed Recommendations

### F1 (SHOULD-FIX): Schema/default alignment

The `DiaryListQuerySchema` refine constraint at `packages/shared/src/schemas/index.ts:521` limits explicit client date ranges to 366 days:

```typescript
return diff >= 0 && diff <= 366;
```

The server now defaults to ~395 days. Options:
- **Option A (recommended)**: Increase the schema limit to `400` days. This lets clients explicitly query the same window the server uses.
- **Option B**: Keep 366 and add a code comment documenting the intentional asymmetry (server defaults bypass schema validation since `from`/`to` are optional and defaults are applied post-parse).

### F2 (SHOULD-FIX): Missing regression test for future entries

Add a test in `src/api/src/__tests__/routes/diary.test.ts` that:
1. Creates a diary entry with a date 30 days in the future (entry_type: `reserved`).
2. Calls `GET /api/v1/farms/:farmId/diary` with no `from`/`to` parameters.
3. Asserts the future entry is present in the response data.

This guards against someone reverting the `defaultTo` change.

---

## Checklist

### Alignment
- [x] Matches original requirements -- #301 (future entries visible) and #302 (mobile split layout)
- [x] Addresses root cause, not symptoms
- [x] No unapproved scope creep

### Security
- [x] No injection risk -- date defaults are server-generated ISO strings
- [x] `assertFarmAccess` runs before date logic -- no auth bypass
- [x] Query scoped to `farmId` partition key -- no cross-farm data exposure
- [x] No credentials in code or logs

### Quality
- [x] Code well-structured, follows existing patterns
- [x] Error handling unchanged and comprehensive
- [x] CSS follows existing BEM convention
- [x] No dead code or unused imports
- [ ] Schema constraint should be reconciled with server defaults (F1)
- [ ] Missing regression test for the core fix (F2)

---

## Verification Needed

- [ ] Raise schema date range limit from 366 to 400 days (or document asymmetry)
- [ ] Add test: future-dated entry appears in default GET response
- [ ] Verify split view on an actual narrow viewport (e.g., 375px width) to confirm month label spans correctly and cards don't overflow

---

## Safety Assessment

No destructive or irreversible operations. Both changes are additive -- wider default date range and a CSS layout adjustment. No database migrations, no auth changes, no infrastructure modifications. Rollback is a simple revert of two files.

---

**Recommendation**: Address the 2 SHOULD-FIX items (schema alignment and regression test) before merging. Neither blocks development on `develop` but both should be resolved before a PR to `main`.

*Review completed: 2026-04-06 | Status: conditional approval*

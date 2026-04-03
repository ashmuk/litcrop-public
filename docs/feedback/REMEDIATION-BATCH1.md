# Remediation Report: Batch 1 — Diary API Implementation

## Summary
- **Review source:** `docs/feedback/REVIEW-FINDINGS-BATCH1.md`
- **Iterations:** 1 of 3 max
- **Status:** RESOLVED

## Findings Resolution

| # | Finding | Severity | Status | Fix Applied |
|---|---------|----------|--------|-------------|
| MF-1 | Platform admin privilege escalation on PATCH/DELETE | MUST-FIX | FIXED | Added `!isAdmin &&` guard on both PATCH (line 297) and DELETE (line 377) `isPrivileged` checks |
| MF-2 | `updateDiaryEntry` drops null values (DDB SerializationException) | MUST-FIX | FIXED | Split into SET/REMOVE clauses per `updateBed` pattern |
| MF-3 | Photo with no bed_id → 500 | MUST-FIX | FIXED | Added null-guard: `if (!image.bed_id) throw ValidationError` |
| MF-4 | 3 critical test coverage gaps | MUST-FIX | FIXED | Added 9 new tests: DDB error→503, photo cross-farm→400, bad cursor→400, deleted bed→null, staff positive cases, admin blocked, multi-item costs, empty costs |
| SF-1 | Category filter after pagination | SHOULD-FIX | DEFERRED | Design-level issue; documented as known limitation for Beta-7 |
| SF-2 | Mapper ignores stored `id` attribute | SHOULD-FIX | FIXED | Changed to `(item['id'] as string) ?? entryId` |
| SF-3 | Deleted bed → null bed_name untested | SHOULD-FIX | FIXED | Test added |
| SF-4 | Staff positive cases untested | SHOULD-FIX | FIXED | Tests added (staff update own, staff delete own) |
| SG-1 | Admin DELETE bypass untested | SUGGESTION | FIXED | Test added (platform admin blocked on DELETE) |
| SG-2 | Multi-item and empty costs untested | SUGGESTION | FIXED | Tests added |
| SG-3 | JSDoc for getDiaryEntries params | SUGGESTION | DEFERRED | Low priority |

## Iteration Log

### Iteration 1
- **Findings addressed:** 9 of 11 (4 MUST-FIX + 3 SHOULD-FIX + 2 SUGGESTION)
- **Deferred:** 2 (SF-1 category pagination, SG-3 JSDoc)
- **Files modified:** `routes/diary.ts`, `services/dynamodb.ts`, `__tests__/routes/diary.test.ts`
- **Tests:** 576/576 passing (29 diary tests, up from 20)
- **Outcome:** All MUST-FIX resolved

## Escalations
None.

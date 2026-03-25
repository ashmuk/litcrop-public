# Review Findings: Batch 1 — Plan Limits + Scroll UX (F-11, F-12, F-16)

> Date: 2026-03-23
> Reviewer: my-reviewer agent (cc-review)
> Scope: 13 files, ~90 lines added
> GitHub Issues: #140, #141, #145
> Verdict: **ACCEPTED** (SHOULD-FIX items remediated)

---

## Findings

| # | File:Line | Issue | Severity | Status |
|---|-----------|-------|----------|--------|
| 1 | `dynamodb.ts:577` | Demo farm not excluded from membership count | HIGH (simplify pass) | **Fixed** — `excludeFarmId` param added |
| 2 | `farms.ts:247` | No server-side farm creation limit | MEDIUM (simplify pass) | **Fixed** — `getFarmsForUser` check added |
| 3 | `ProfilePage.tsx:129` | `ownedCount` included manager role | MEDIUM (simplify pass) | **Fixed** — admin only |
| 4 | `farms.test.ts:63` | `getFarmsForUser` not in `beforeEach` default | SHOULD-FIX | **Fixed** — default mock added |
| 5 | `farms.test.ts` | No limit enforcement tests | SHOULD-FIX | **Fixed** — 2 tests added (323 total) |
| 6 | `farms.ts:248,389` | TOCTOU race on limit checks | SUGGESTION | Accepted — MVP scale |
| 7 | `en.json:247` | Hardcoded "2" in limit message | SUGGESTION | Accepted — no i18n interpolation |

## Security

- [x] `POST /farms` server-side limit enforced (admin role count, demo excluded)
- [x] `POST /:farmId/members` server-side limit enforced (demo excluded via `excludeFarmId`)
- [x] `countUserMemberships` uses parameterized DynamoDB expressions (no injection)
- [x] TOCTOU race acceptable at MVP scale

## Tests

- 323/323 pass (+2 new limit enforcement tests)
- `getFarmsForUser` default mock in all 4 test files

---

> Generated 2026-03-23 | ACCEPTED

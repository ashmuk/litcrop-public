# Review Findings: PATCH /me/settings 500 fix

> Date: 2026-03-27 | Reviewer: my-reviewer agent | Scope: F-01 settings sync bug fix

## Verdict: APPROVE with one SHOULD-FIX

## Findings

| File:Line | Issue | Severity |
|-----------|-------|----------|
| `src/api/src/routes/me.ts:35` | Duplicated default settings — inline defaults object mirrors `DEFAULT_SETTINGS` from `dynamodb.ts`. Should share a single source of truth. | SHOULD-FIX |
| `src/api/src/__tests__/routes/me.test.ts` | No test for PATCH with multiple fields simultaneously (e.g., `{ theme: 'dark', locale: 'ja' }`). | SUGGESTION |
| `src/api/src/__tests__/routes/me.test.ts` | No test for `upsertUserSettings` throwing (DynamoDB error propagation to 500). | SUGGESTION |
| `src/api/src/__tests__/routes/me.test.ts:26` | Top-level `beforeEach` outside `describe` block — works but unconventional. | SUGGESTION |

## Positives

- Refactored loop guarantees 1:1 correspondence between expressions and attribute values
- `as const` assertion on field array ensures correct TypeScript narrowing
- Zod schema validation is solid (enum validation + at-least-one-field refine)
- No injection risk — field names are compile-time literals, values are parameterized

## Verification Needed

- [ ] Manual: PATCH `/me/settings` with single field no longer returns 500 (requires deploy)
- [ ] Manual: PATCH with empty body returns 400
- [ ] Manual: GET `/me/settings` for new user returns defaults

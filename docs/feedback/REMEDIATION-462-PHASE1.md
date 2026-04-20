# Remediation Report — #462 Phase 1

## Summary
- **Review source**: `docs/feedback/REVIEW-FINDINGS.md` — section "# #462 Phase 1 review (2026-04-20)" (starting at line 149).
- **Iterations**: 1 of 3 max.
- **Status**: RESOLVED.
- **Remediation commit**: `9bb75c0` on `develop` (pushed to origin).
- **Issue comment**: posted on [#462](https://github.com/ashmuk/litcrop/issues/462#issuecomment-4280185580) documenting the Pi-auth reality for Phase 3 design.

## Findings Resolution

| # | Finding                                                                                                                      | Severity   | Status   | Notes                                                                                                                                                 |
|---|------------------------------------------------------------------------------------------------------------------------------|------------|----------|-------------------------------------------------------------------------------------------------------------------------------------------------------|
| 1 | `Image.uploaded_by` JSDoc claims "device registrant for Pi uploads" — inaccurate under MVP shared-JWT Pi auth model.         | MUST-FIX   | FIXED    | JSDoc rewritten to describe reality (shared service-user JWT); flags Phase 3 `/me/activity` must merge via `bed.device.registered_by = me` too.         |
| 2 | Zero test coverage for `Device.registered_by` and `Image.uploaded_by`.                                                       | SHOULD-FIX | FIXED    | 6 regression tests added under new "#462 attribution fields" describe in `services/dynamodb.test.ts`: write persists + read round-trips + legacy-null. |
| 3 | Dangling ADR-20260420 reference (that ADR covers #279, not #462).                                                            | SHOULD-FIX | FIXED    | Current JSDoc no longer references it (removed during simplify pass). Commit `07c0268` message still references it danglingly; git history, uneditable. |
| 4 | `Image.uploaded_by` response lacks resolved display name (DiaryEntry pairs `created_by` + `created_by_name`).                | SHOULD-FIX | DEFERRED | Phase 3/4 scope. Flagged in #462 comment for the `/me/activity` API design step.                                                                       |
| 5 | `createImage`'s `Omit<Image,'id'\|'bed_id'>` + `...image` spread means any future optional field silently flows into DDB.    | SHOULD-FIX | DEFERRED | Speculative until more optional fields are added. Flagged in #462 comment for a Phase-3 audit.                                                         |
| 6 | Schema vs mapper comment asymmetry after simplify pass.                                                                       | NIT        | SKIPPED  | Low-value. Schema retains the nullability-for-migration WHY; mapper retains the how.                                                                  |
| 7 | `uploaded_by: userId` / `registered_by: userId` lack defensive non-empty check.                                               | NIT        | SKIPPED  | Matches prior art (`DiaryEntry.created_by` site doesn't defend either). `authMiddleware` guarantees truthy sub.                                       |
| 8 | `createDevice` `registered_by: string \| null` union could be tightened to `string` since no null call site exists.           | NIT        | SKIPPED  | Not worth blocking. Pre-existing pattern tolerates the union.                                                                                           |

## Iteration Log

### Iteration 1 (2026-04-20)
- **Findings addressed**: #1 (MUST-FIX), #2 (SHOULD-FIX), #3 (SHOULD-FIX).
- **Findings deferred**: #4, #5 (Phase 3/4 scope — captured in the #462 issue comment).
- **Findings skipped**: #6, #7, #8 (NITs, low value).
- **Validation**: 997/997 vitest pass (+6 new); shared + api typecheck clean; build green.
- **Outcome**: all MUST-FIX resolved, in-scope SHOULD-FIX resolved. No further iteration required.

## Escalations
None. No systemic issue, no iteration cap reached, no architectural flaw found. The MUST-FIX was a documentation/contract misrepresentation caught by the reviewer's independent verification against the actual Pi capture script — the code behavior was already correct, only the claimed semantics needed updating.

## Artifacts
- Commit `9bb75c0` — `fix: apply /cc-review findings on #462 Phase 1`.
- Issue comment on #462 — documents the Pi-auth reality and Phase 3's required reconciliation.
- Tests: `src/api/src/__tests__/services/dynamodb.test.ts` now includes a `#462 attribution fields` block.

## Next
- Accept Phase 1 as reviewed + remediated.
- Proceed to `/cc-test` for a test-strategy pass before Phase 2/3 build.

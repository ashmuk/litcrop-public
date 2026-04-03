# Review Findings: Batch 1 — Diary API Implementation

> Reviewed: `routes/diary.ts`, `services/dynamodb.ts` (diary functions), `__tests__/routes/diary.test.ts`
> Date: 2026-04-03
> Reviewers: routes, DynamoDB, test coverage (3 parallel agents)

---

## MUST-FIX (4)

### MF-1: Platform admin bypass grants `isPrivileged` on PATCH/DELETE
**Domain:** Security | **Confidence:** 95%

`assertFarmAccess` without `requiredRoles` gives platform admins a synthetic `role: 'admin'` membership. The PATCH/DELETE handlers check `membership.role === 'admin'` to set `isPrivileged`, meaning platform admins can mutate any diary entry in any farm. The `_helpers.ts` comment explicitly warns: "callers MUST NOT use synthetic membership for write authorization."

**Fix:** Gate `isPrivileged` only on real farm membership: `const isPrivileged = !isAdmin && (membership.role === 'admin' || membership.role === 'owner');` — or pass `requiredRoles` to `assertFarmAccess` for mutations.

**File:** `routes/diary.ts` — PATCH and DELETE handlers

---

### MF-2: `updateDiaryEntry` silently drops `null` values — nullable fields can't be cleared
**Domain:** Data Model | **Confidence:** 95%

The update loop skips `undefined` but passes `null` directly into SET expression. DynamoDB rejects `null` in `ExpressionAttributeValues` with a `SerializationException`. Fields like `time_spent_minutes: null` and `bed_id: null` cannot be cleared.

**Fix:** Split into SET (non-null values) and REMOVE (null values) clauses, matching the `updateBed` pattern.

**File:** `services/dynamodb.ts` — `updateDiaryEntry`

---

### MF-3: Photo ownership validation doesn't handle images with no `bed_id`
**Domain:** Security | **Confidence:** 87%

If an image has `bed_id: null/undefined`, `getBedById(image.bed_id)` is called with a null value, likely throwing an unhandled error that surfaces as 500.

**Fix:** Add null-guard: `if (!image.bed_id) throw new ValidationError('Photo not found in this farm')`.

**File:** `routes/diary.ts` — POST handler photo_ids loop

---

### MF-4: Critical test coverage gaps — 3 untested code paths
**Domain:** Quality | **Confidence:** 92%

(a) DDB error → ServiceUnavailableError: zero tests for any catch branch
(b) photo_ids cross-farm validation: entirely untested despite mock being available
(c) Invalid cursor → 400: untested error branch

**Fix:** Add tests for: DDB error on create (→ 503), photo from other farm (→ 400), malformed cursor (→ 400).

**File:** `__tests__/routes/diary.test.ts`

---

## SHOULD-FIX (4)

### SF-1: Category filter applied after pagination — page may return fewer than `limit` items
**Domain:** Design | **Confidence:** 88%

Client-side category filtering on a paginated page can return fewer results than `limit` even when more exist. `meta.count` will be misleadingly low.

**Fix:** Document this as a known limitation. For Beta-7, add a note in the response or increase the internal query limit when category filter is present (e.g., `internalLimit = limit * 3` as a heuristic).

---

### SF-2: `itemToDiaryEntry` ignores stored `id` attribute, relies on SK extraction
**Domain:** Quality | **Confidence:** 80%

The mapper uses caller-supplied `entryId` from `extractIdFromSk` instead of reading `item['id']`. Prefer `(item['id'] as string) ?? entryId`.

---

### SF-3: Deleted bed → null bed_name path untested
**Domain:** Quality | **Confidence:** 85%

`resolveBedName` returns `null` for deleted beds, but no test verifies this response shape.

---

### SF-4: Staff can update/delete own entry — positive case untested
**Domain:** Quality | **Confidence:** 88%

Tests verify staff *cannot* touch others' entries but don't verify staff *can* modify their own.

---

## SUGGESTION (3)

### SG-1: Admin DELETE bypass untested
Admin PATCH works, but admin DELETE has no test.

### SG-2: Empty costs array and multi-item cost_total untested
Only single-item cost tested. `costs: []` and multi-item accumulation untested.

### SG-3: Document `to` parameter format in `getDiaryEntries` signature
Add JSDoc: `@param to ISO date YYYY-MM-DD`.

---

## Summary

| Severity | Count | Key Themes |
|----------|-------|------------|
| **MUST-FIX** | 4 | Admin privilege escalation, null field clearing, photo null guard, test gaps |
| **SHOULD-FIX** | 4 | Category pagination, mapper id source, deleted bed test, staff positive test |
| **SUGGESTION** | 3 | Admin delete test, empty costs test, JSDoc |

## Verdict

**Status: NEEDS REMEDIATION** — 4 MUST-FIX items (1 security, 1 data integrity, 1 validation, 1 test coverage).

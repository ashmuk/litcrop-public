# Coverage Note — Stream 2 Kickoff (2026-04-23)

> Close-out validation for the post-MVP pipeline (`/simplify` → `/cc-review` → `/cc-remediate` → `/cc-test` ← **here**).
> Scope: commits since `afbc931` on `develop` — design doc (`c4375cd`), Wave A prep refactor (`a4329f1`), review findings (`2c0d1e0`), design remediations (`5d4440d`).
> Issue: #279 (bed-to-crop 1:N, Stream 2 Wave A only).

---

## Final suite run

```
 Test Files  52 passed (52)   (+1 vs Stream 1 baseline of 51)
      Tests  1140 passed (1140)   (+5 vs Stream 1 baseline of 1135)
   Duration  5.90s (transform 1.18s, import 9.29s, tests 2.20s)
```

Baseline maintained + **net +5 tests**. The delta comes entirely from the new `packages/shared/src/__tests__/bed-crop.test.ts` (5 cases covering `hasActiveCrop` type-guard branches). Zero flakes. No existing test count drifted.

---

## Wave A test-surface assessment

### What the refactor introduced

- `packages/shared/src/bed-crop.ts` (23 lines) — `hasActiveCrop<T extends { crop_type?: string | null }>` type guard.
- `packages/shared/src/__tests__/bed-crop.test.ts` (35 lines, 5 cases).

### New test coverage

| Case | Input | Assertion |
|------|-------|-----------|
| 1 | `{ crop_type: 'tomato' }` | guard returns `true` |
| 2a | `{}` (missing key) | guard returns `false` |
| 2b | `{ crop_type: undefined }` (explicit undefined) | guard returns `false` |
| 3 | `{ crop_type: null }` | guard returns `false` |
| 4 | `{ crop_type: '' }` (empty string) | guard returns `false` |
| 5 | `{ id, crop_type, notes }` | narrowed branch: `bed.crop_type` is `string`, extra fields preserved |

Covers every branch of the guard's predicate (`typeof === 'string' && .length > 0`) and the positive-narrowing path.

### Existing tests now exercise the refactored call sites

The 3 API routes touched by Wave A already have coverage; the refactor's behavior-neutrality is verified by their pre-existing test files continuing to pass:

| Refactored file | Pre-existing coverage | What it exercises |
|-----------------|-----------------------|---------------------|
| `src/api/src/routes/weather.ts` | `src/api/src/__tests__/routes/weather.test.ts` | `croppedBeds` filter + frost/heat/heavy-rain impact cards with `crop_type`-bearing bed fixtures |
| `src/api/src/routes/chat.ts` | `src/api/src/__tests__/routes/chat.test.ts` | `buildSystemPrompt` crop list rendering |
| `src/api/src/routes/diary.ts` | `src/api/src/__tests__/routes/diary.test.ts` | `syncBedDatesFromDiary` bridge for planting/harvesting categories |

All three test suites green post-refactor — the filter-substitution (`.filter((b) => b.crop_type)` → `.filter(hasActiveCrop)`) and the `!` non-null assertion removal are strictly behavior-neutral under their existing fixtures.

---

## Gaps

| # | Gap | Severity | Disposition |
|---|-----|----------|-------------|
| 1 | No dedicated integration test for the weather/chat/diary refactor against `hasActiveCrop` specifically | **NONE** | Existing route-level tests exercise the full filter + downstream code paths; adding an integration test against a shim-neutral helper would be redundant. |
| 2 | No test for the whitespace-only case (`{ crop_type: '   ' }`) | **LOW** | Behavior-neutral with the old `.filter((b) => b.crop_type)` — both treat whitespace as truthy. The `hasActiveCrop` guard also returns `true` since `length > 0`. Not a regression; documenting as a known contract in this note is sufficient. |
| 3 | No Wave B / C / D tests yet | **EXPECTED** | Wave B's BedCrop entity, DDB access patterns, and 5-cap enforcement will each need their own test plan when Wave B begins. Out of scope for Wave A per user directive: "do not design tests for Wave B yet". |

No **CRITICAL** or **HIGH** gaps. No MUST-FIX for test coverage.

---

## Ship recommendation

**SHIP.** Stream 2 Wave A is ready to tag as v0.99.7.6 whenever the release window opens.

- Design doc is internally consistent after the 3 SHOULD-FIX remediations (compat-shim, GSI guardrail, Wave E ordering).
- Wave A refactor is behavior-neutral; pre-existing tests green, type guard has 5 targeted tests.
- 1140/1140 vitest green — net positive coverage delta.
- Type-check clean across shared + api workspaces.
- Simplify pass clean (no edits needed); review produced 0 MUST-FIX, 3 SHOULD-FIX (all design-doc clarifications, all resolved).

### Follow-ups worth tracking (NOT Stream 2 Wave A blockers)

- **Wave B test plan** — when Wave B begins (BedCrop entity + routes), cc-test re-entry will produce a dedicated Wave-B test strategy covering: BedCrop Zod schema contract, repository CRUD with GSI1 prefix filter, 5-cap enforcement with concurrent-post race acceptance, lazy-materialize fallback paths, compat-shim dual-population on `FarmBed` response. Explicitly deferred to Wave B kickoff.
- **Test-env JSDOM gap** (carried from Stream 1) — still applies to any Wave C UI components that need mount-effect coverage. No change.

---

## Pipeline status

| Step | Skill | Status | Notes |
|------|-------|--------|-------|
| 1 | `/simplify` (code-simplifier agent) | ✅ no edits | "Code is already minimal"; 5/5 test pass, typecheck clean |
| 2 | `/cc-review` | ✅ ACCEPT | 0 MUST-FIX, 3 SHOULD-FIX (all design-doc) |
| 3 | `/cc-remediate` | ✅ RESOLVED | 3/3 SHOULD-FIX applied as design-doc polish |
| 4 | `/cc-test` | ✅ 1140/1140 green | coverage note produced (this file) |

Stream 2 Wave A is ready. Wave B design begins when the user chooses; no pipeline blockers remain.

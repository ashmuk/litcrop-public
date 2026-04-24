# Review Findings — Session 6 (2026-04-24) — Wave D D5 per-crop ROI (#279)

Scope: uncommitted changes on `develop` for per-crop ROI aggregation
(`RoiByBedCropTable` + `computeRoiByBedCrop` + supporting types, i18n, tests).

| ID | Severity | Location | Finding | Recommendation |
|---|---|---|---|---|
| R-D5-001 | SHOULD-FIX | `src/frontend/src/components/roi/RoiByBedCropTable.tsx:112-126` | `SortHeader` is declared **inside** the `RoiByBedCropTable` component body, so Preact gets a fresh component type each render. Rendered `<th>` elements (with `tabIndex={0}`, `role="button"`, `aria-sort`) will unmount/remount on every `setSortKey` / `setSortDir` — keyboard focus is lost after every sort click, and ARIA-live screen readers may re-announce. The pre-existing `RoiByBedTable` inlines `<th>` directly to avoid this. | Either lift `SortHeader` out of the component (pass `sortKey`, `sortDir`, `onSort` as explicit props) or inline the five `<th>` elements like `RoiByBedTable` does. Lifting is cleaner if you want the extraction; inlining keeps parity with the sibling table. |
| R-D5-002 | SHOULD-FIX | `src/frontend/src/lib/roi-utils.ts:247-261` + `components/roi/RoiByBedCropTable.tsx:46` | Label inconsistency between D4 and D5 for the "legacy bed with real BedCrops" hybrid case. In D4's DiaryEntryForm, a bed with ANY active BedCrop shows `"{bed} (All)"` as its bed-only option (regardless of `bed.crop_type`). In D5, the bed-scope row uses `bed.crop_type` whenever it's set — so a legacy bed that later gained a real BedCrop will display `"D1 — Tomato"` in the ROI table even though the form labelled the same bucket `"D1 (All)"`. User sees two different names for the same bucket in adjacent views. | In `metaFor`'s bed-scope branch, prefer the "(All)" treatment when `bedCropsMap[entry.bed_id]` has ≥1 active/planned crop; fall back to `bed.crop_type` only when there are no modern crops on the bed (true legacy). Alternatively, drop the legacy `crop_type` carry entirely and always render bed-scope rows with the "(All)" suffix — simpler and still readable. Add a test that mirrors the mixed case: legacy `bed.crop_type='tomato'` + one active BedCrop, entry `bed_crop_id: null`. |
| R-D5-003 | SHOULD-FIX | `src/frontend/src/__tests__/roi-utils.test.ts` (new `computeRoiByBedCrop` block) | Test suite covers the five documented scopes well but is missing two edge cases: (a) `crop.bed_id` differs from `entry.bed_id` — current code uses `crop.bed_id` for `bed_id`/`bed_name` (intentional: trust the crop's own FK), but this is uncovered and a future refactor could flip it silently; (b) a BedCrop whose `bed_id` is NOT present in the `beds` array → `bed_name` falls back to `crop.bed_id` (raw UUID shown). | Add two tests: one asserting `bed_id === crop.bed_id` when those disagree, and one asserting `bed_name === crop.bed_id` when the bed isn't in `beds` (documents the graceful-degradation contract and prevents regressions during the shim window). |
| R-D5-004 | SUGGESTION | `src/frontend/src/components/RoiDashboard.tsx:71-87` | The bed-crops fan-out useEffect depends on the `beds` prop (array reference). `DiaryPage` stores beds in `useState`, so identity is stable today — but any future refactor that rebuilds `beds` on each render (e.g. filtering inline in JSX) would re-fire N API calls per render. Also no abort-controller on `listBedCrops`: if `beds` changes mid-flight, `cancelled` is flagged but in-flight requests still complete server-side. | Low priority. Consider (a) depending on `beds.map(b => b.id).join(',')` to pin identity to the set of bed ids, and (b) wiring `AbortSignal` through `listBedCrops` / `request` if that infra already exists elsewhere. If neither is cheap, add a comment documenting the reference-identity assumption. |
| R-D5-005 | SUGGESTION | `src/frontend/src/lib/roi-utils.ts:235-238` | The per-call `cropMap` is built by flattening `Object.values(bedCropsMap)` on every invocation. With `useMemo` in the caller this runs only when inputs change, so perf is fine. If two BedCrops in different beds ever shared an id (should not happen — ids are UUIDs), last-write-wins silently. The JSDoc already notes `bedCropsMap` is keyed by bed, so a collision would be a backend bug, not a frontend bug. | Optional: add an `if (cropMap.has(c.id)) console.warn(...)` in dev builds, or a defensive assertion in the next hardening pass. Not blocking. |
| R-D5-006 | SUGGESTION | `src/frontend/src/i18n/ja.json:855` | The rename `農場全体 → 農園全体` in `diary.farm_level` is a string change that will invalidate any in-flight translations/screenshots that reference the old wording. Confirmed zero remaining matches of `農場全体` under `/workspace` (json/ts/tsx/md). Good. | None required — flagged for visibility so QA knows the vocabulary is now uniform ("農園" everywhere). |

## Verification performed

- `git diff` reviewed for all 7 in-scope files; new file `RoiByBedCropTable.tsx` read in full.
- `grep -rn 農場全体 /workspace --include={json,ts,tsx,md}` → zero matches. Rename is complete.
- `DiaryEntryResponse` construction sites checked (`grep -rn "DiaryEntryResponse" src/frontend/src`): only three locations build full literals — all three test helpers (`roi-utils.test.ts:25`, `diary-utils.test.ts:22`, `:318`, `:427`) now include `bed_crop_id: null`. All other sites type network responses, so the server supplies the field.
- `BucketMeta = Omit<BedCropRoiSummary, keyof RoiSummary>` verified: leaves exactly the seven bucket-identity fields. Spread order in `results.push({ ...computeRoi(group, currency), ...meta })` is safe (disjoint keys, meta-last).
- XSS surface: `rowLabel` output flows through Preact `{label}` (auto-escaped). `getCropName` maps canonical ids through a static `CROP_MAP`; it does not render HTML. `BedCrop.crop_type` is a canonical id from `CROP_LIBRARY`, not free text. `bed.name` is user-controlled but rendered as text, not HTML. No injection vector.
- Graceful degradation on unresolved `bed_crop_id`: covered by test `"crop-scope: unresolved bed_crop_id degrades to bed-scope row under entry.bed_id"` — matches `DiaryEntryForm`'s fallback pattern.
- Currency filter per-bucket: covered by the `currency filtering` test — `excluded_entry_count` propagates correctly.
- Sort stability: `.sort((a, b) => b.total_cost - a.total_cost)` is the same pattern as `computeRoiByBed`; V8/SpiderMonkey `Array.prototype.sort` is stable as of ES2019. Good.
- `listBedCrops(b.id, 'all')` correctly pulls harvested/failed crops for historical ROI.

## Accept / Block

No MUST-FIX. **D5 is acceptable to commit** as-is; the three SHOULD-FIX items are quality/polish concerns that can be addressed in a follow-up commit on the same wave if desired. R-D5-002 (label consistency between D4 and D5) is the most user-visible of the three and is the one I'd prioritize before closing Wave D.

---

# Review Findings — Session 5 (2026-04-24) — Wave B data-layer

> Scope: Wave B of #279 bed-to-crop 1:N — BedCrop types/schema + DDB repo + API routes + compat shim + diary bridge + /simplify pass.
> Baseline: `806dcc7` (Wave A post-shim anchor on `develop`). Head: `998986d` (post-simplify).
> Six commits reviewed: `c865d3c` · `9be8c52` · `4c8447f` · `b45021f` · `998986d` (in narrative order `806dcc7` scaffold → … → simplify).
> Reviewer policy: `.agent/subagents/my-reviewer.md` (confidence-filtered — MUST-FIX and high-signal SHOULD-FIX only; no nitpicks).
> Pipeline stage: `/cc-review` (this doc) → `/cc-remediate` if MUST-FIX, else `/cc-test` → Wave B tag cut `v0.99.8.0`.

## S5.1. Scope reviewed

### Shared (`packages/shared`)
- `src/bed-crop.ts` — added `toBedActiveCropSummary()`; `hasActiveCrop` contract unchanged.
- `src/types/domain.ts` — `BedCropStatus` + `BedCrop` entity exported.
- `src/types/api.ts` — `BedActiveCropSummary` + `FarmBed.active_crop` (deprecated-inline shim documented).
- `src/schemas/index.ts` — `BedCropSchema`, `BedCropStatusSchema`, `CreateBedCropRequestSchema`, `UpdateBedCropRequestSchema`, plus `active_crop` on `FarmBedSchema` / `FarmBedItemSchema`.
- `src/constants.ts` — `MAX_ACTIVE_CROPS_PER_BED = 5`.

### API (`src/api`)
- `services/repositories/_infrastructure.ts` — `sk.crop()` + `sk.cropGsi1()` helpers.
- `services/repositories/bed-crops.ts` — new repo (list/get/create/update/delete + `getActiveCropForBed` lazy-materialize).
- `services/repositories/_mappers.ts` — `itemToBedCrop`.
- `services/dynamodb.ts` — barrel re-export of 6 new methods.
- `routes/bed-crops.ts` — new router, 4 handlers, mounted at `/api/v1/beds/:bedId/crops[/:bedCropId]`.
- `routes/farms.ts` — `bedToSummary()` helper + parallel `getActiveCropForBed` in 2 list routes.
- `routes/beds.ts` — GET/:bedId adds `active_crop`; PATCH untouched for Wave B.
- `routes/diary.ts` — `syncBedDatesFromDiary` prefers real BedCrop; legacy fallback retained.
- `routes/_helpers.ts` — unchanged (confirmed via diff).
- `app.ts` — 3-line mount.
- `__tests__/routes/bed-crops.test.ts` (11 cases) + `__tests__/services/bed-crops.test.ts` (11 cases).

### Cross-checks performed
- **S4-2 guardrail**: grepped every `GSI1PK.*BED#` / `pk.bed(` call site. `listBedCropsByBed` → `begins_with(GSI1SK, 'CROP#')` ✅. `getBedCrop` → exact `GSI1SK = CROP#<id>` (implicitly satisfies prefix) ✅. `beds.getBedById` → `GSI1SK = '#META'` (no CROP# collision). `createBedCrop` writes `GSI1SK=CROP#<id>` ✅. No raw `queryByGSI1('BED#…')` exposed anywhere.
- **Route mount**: `app.ts:173-175` mounts under `/api/v1/beds`, so `beds.ts` (unchanged) and `bed-crops.ts` (new) share the prefix; Hono pattern-matching on `:bedId/crops` is specific enough to not shadow existing `:bedId` routes.
- **Lazy virtual id reachability**: repo tests confirm `bed-legacy-<bedId>` is never returned by `listBedCropsByBed` — only by `getActiveCropForBed` fallback. The diary bridge explicitly uses `listBedCropsByBed` (not the fallback) so it cannot write against a virtual id. PATCH/DELETE handlers call `getBedCrop(bedId, virtualId)` which queries GSI1 for `CROP#bed-legacy-<bedId>` — returns no items → `NotFoundError` → 404. ✅ no write path reaches the repo with a virtual id.
- **Ownership**: all 4 routes in `bed-crops.ts` go through `loadBed()` → `assertBedAccess` (reads) or `assertBedWriteAccess` (writes). Parent-bed pattern matches DESIGN-279 §4.1.
- **Typecheck**: `npx tsc --noEmit -p src/api` and `-p packages/shared` reported clean at pipeline entry (claimed in task brief; not re-run here since the reviewer is read-only and the simplifier already gated on it).
- **Test suite**: 1172/1172 vitest green claimed; not re-run.

## S5.2. MUST-FIX findings

**None.**

No security, correctness-breaking, or scope-violating defects. Breakdown:

| Check                                                                       | Verdict |
|-----------------------------------------------------------------------------|---------|
| Every `GSI1PK=BED#<b>` query is either `begins_with(GSI1SK, 'CROP#')` or `GSI1SK = #META` or `GSI1SK = CROP#<id>` — no collision | ✅ |
| No write path can reach `updateBedCrop` / `deleteBedCrop` with a virtual `bed-legacy-<bedId>` id | ✅ |
| All 4 new routes gated by `assertBedAccess` / `assertBedWriteAccess`; admin/owner restriction on writes | ✅ |
| 5-cap enforced pre-write in POST handler (race condition already accepted in design §9) | ✅ |
| Input validation: Zod schemas cover all request bodies; `status` enum tightly scoped; no SSRF/XSS/injection surface | ✅ |
| No `any`, no unchecked casts beyond the existing DDB mapper pattern | ✅ |
| Legacy diary-bridge fallback semantically equivalent to pre-Wave-B path when `activeReal` is absent | ✅ |
| Ownership pattern matches `DESIGN-279 §4.1` parent-bed rule | ✅ |
| No credentials, secrets, or sensitive logs introduced | ✅ |
| Wave B scope boundary respected (no UI, no diary FK, no migration job) | ✅ |

## S5.3. SHOULD-FIX findings

| # | Severity | Location | Issue | Suggested fix |
|---|----------|----------|-------|---------------|
| S5-1 | SHOULD-FIX (high signal) | `src/api/src/routes/bed-crops.ts:123-153` (PATCH handler) | Status transitions and `completed_at` are **fully decoupled**: any transition is accepted (incl. `harvested → planned`, `failed → active`), and `completed_at` is never auto-managed. Two concrete defects follow: (a) `PATCH {status: 'harvested'}` without a client-supplied `completed_at` leaves `completed_at` unset, which disagrees with the DELETE soft-delete path (which always sets it); downstream UI will see a "harvested" crop with no completion date. (b) `PATCH {status: 'planned'}` on a previously-completed crop leaves the stale `completed_at` in place. The /simplify commit explicitly flagged (b) as review-worthy. | When status transitions to `harvested` or `failed` and the request omits `completed_at`, auto-populate it with `new Date().toISOString()`. When status transitions back to `active` or `planned` and the request omits `completed_at`, auto-REMOVE it (push `null` into the updates map). Align this with the DELETE branch that already does the former. |
| S5-2 | SHOULD-FIX (high signal) | `src/api/src/routes/bed-crops.ts:157-181` (DELETE handler) | Soft-delete clobbers `completed_at` on a crop that is **already** in a terminal state. If status is `harvested`, DELETE rewrites it to `failed` and overwrites `completed_at` with `now()`. Two problems: (i) reclassifies a successful harvest as a failure — silently destroying history that the design §7 Wave E migration assumes is immutable; (ii) overwrites the real harvest date with the deletion timestamp. For `failed` the first problem is absent but the second still applies (loss of original failure date). | Short-circuit when `crop.status === 'harvested' || crop.status === 'failed'` and return 204 (idempotent no-op) OR 409 (already terminal — explicit refusal). Hard-delete on `planned` stays as-is. Only transition `active → failed` needs the current soft-delete path. |
| S5-3 | SHOULD-FIX (high signal) | `src/api/src/routes/beds.ts:67-74` + `src/api/src/routes/farms.ts:54-70` (compat shim) | When a bed has a real active BedCrop AND the legacy `bed.completed_at` is still set from a prior cycle (a realistic state during the Wave B → E shim window), the response carries `active_crop: {…}` **and** `completed_at: "2026-02-01"` **simultaneously**. That is self-contradictory by the shim contract ("inline fields mirror the active crop when one exists"). Consumers (including the existing frontend reading `bed.completed_at` to hide finished beds) will misrender the bed as both live and completed. | When `active_crop` is non-null, force `completed_at: null` in both `beds.ts:73` and `farms.ts:67` (i.e. mirror it from `active_crop.completed_at`, which for active/planned rows is always null by schema). Fall back to `bed.completed_at` only when `active_crop` is null. This matches the §4.3 shim contract that the other 4 inline fields already follow. |
| S5-4 | SHOULD-FIX (medium signal) | `src/api/src/routes/bed-crops.ts:65-73` (5-cap) | The cap counts only rows returned by `listBedCropsByBed` (persisted BedCrops). A legacy bed with `bed.crop_type` set but no real BedCrop has an implicit virtual crop that the cap does NOT count. Result: a bed that had a legacy inline crop + 5 newly-created active BedCrops effectively carries 6 active crops, one more than scope memory constraint 2 allows. This window closes at Wave E but it IS open during B→D. | Either (a) count the virtual fallback too — call `getActiveCropForBed()` alongside the list and subtract 1 from the budget when a virtual legacy crop exists, OR (b) document the off-by-one as an accepted shim-window artefact in the repo comment and the design §9 risk table. Option (a) is ~3 LOC and closes the loophole deterministically. |

## S5.4. Items explicitly skipped per policy

Per task brief "only report MUST-FIX and high-signal SHOULD-FIX; no nitpicks" and confidence-based filtering:

- **Pre-existing `deleteImage` unused import in `beds.ts`** — called out in the task brief as out-of-scope (predates Wave B). Not a new regression; leave to a future tidying pass.
- **DDB mapper `as` casts for `status` in `itemToBedCrop`** — same pattern as every other mapper in `_mappers.ts`; not a Wave-B-specific risk. Would require repo-wide hardening, not a Wave-B blocker.
- **5-cap read-then-write race window** — acknowledged in DESIGN-279 §9 risk table (Low/Low), explicitly accepted. No new finding to log.
- **`notes` field not `.trim()`-ed on Create (unlike `crop_type`)** — cosmetic whitespace, not a security concern. `.max(500)` bounds it; Preact escapes at render. Skip.
- **PATCH updates merge into `existing` without re-fetch** — acceptable optimistic merge; the merged shape matches the on-disk post-update state except in concurrent-write windows. Not a correctness defect for this scope.

## S5.5. Verification needed before `/cc-test`

- [ ] If remediating S5-1/S5-2/S5-3/S5-4: re-run `npx vitest run src/api` — the 11 bed-crops route tests will need updates for the new status-transition auto-managed `completed_at` and the short-circuited DELETE-on-terminal branch.
- [ ] Integration test (real DDB) deferred per Wave B coverage note — specifically validate that `GET /beds/:bedId` on a bed with a real active BedCrop AND legacy `bed.completed_at` returns `completed_at: null` (post-S5-3 fix).
- [ ] No MUST-FIX → `/cc-remediate` is **optional** (decides based on whether the 4 SHOULD-FIX items are folded into `v0.99.8.0` or deferred to `v0.99.8.1` alongside Wave C frontend work).
- [ ] Re-confirm 1172/1172 vitest after any SHOULD-FIX fold-in.

## S5.6. Safety approval

- [x] Impact understood: additive DDB entity + new routes + additive response field + diary-bridge branch. No destructive operations, no schema migration, no data rewrite of existing beds.
- [x] Rollback verified: `git revert` the 5 Wave B commits restores the pre-Wave-B state. Any BedCrop rows written during a canary would remain in DDB but be orphaned (no reader); they do not poison legacy inline fields. The lazy-materialize fallback preserves pre-Wave-B read paths if the rollback precedes Wave E.
- [x] Approved for execution: **YES** — no MUST-FIX. The 4 SHOULD-FIX items are behavioral polish, not correctness-breaks for the data-layer scope Wave B was approved to ship.

## S5.7. Decision

**Status**: **ACCEPT** — 0 MUST-FIX, 4 SHOULD-FIX.

The S5-1/S5-2/S5-3/S5-4 items should be folded in before `v0.99.8.0` because they're all ~3-10 LOC, they harden the contract the Wave C frontend is about to depend on, and deferring them to C creates a "fix the data layer while building the UI" entanglement. `/cc-remediate` is the right next step; `/cc-test` can run either before or after.

**Counts**: MUST-FIX: 0 · SHOULD-FIX: 4 · Verdict: **ACCEPT (remediate before tag cut)**

---

# Review Findings — Session 4 (2026-04-23) — Stream 2 kickoff

> Scope: Stream 2 (Scale) kickoff — #279 bed-to-crop 1:N design doc + Wave A prep refactor on `develop`.
> Baseline: `afbc931` (post-v0.99.7.5 neutral anchor). Two commits reviewed: `c4375cd` (design doc) and `a4329f1` (Wave A refactor).
> Reviewer policy: `.agent/subagents/my-reviewer.md` (confidence-filtered — MUST-FIX and high-signal SHOULD-FIX only; no nitpicks).
> Pipeline stage: `/cc-review` → `/cc-remediate` if MUST-FIX, else `/cc-test`.

## S4.1. Scope reviewed

### Commit `c4375cd` — design doc
- `docs/design/DESIGN-279-bed-crop-1n.md` (+278 lines, new)

### Commit `a4329f1` — Wave A prep refactor (behavior-neutral)
- `packages/shared/src/bed-crop.ts` (NEW, 23 lines) — `hasActiveCrop<T>` type guard
- `packages/shared/src/__tests__/bed-crop.test.ts` (NEW, 35 lines, 5 cases)
- `packages/shared/src/index.ts` (+3 lines — export block under `// Bed-crop helpers (#279 Wave A)`)
- `src/api/src/routes/weather.ts` — 1 filter substitution, 5 `!` non-null assertions removed
- `src/api/src/routes/chat.ts` — 1 filter substitution, 1 import line
- `src/api/src/routes/diary.ts` — 1 condition substitution at `syncBedDatesFromDiary`, 1 import line

**Cross-checks performed**:
- ADR `ADR-20260406-1n-bed-crop-impact-analysis.md` — P3 prep item matches shipped scope (type-guard helper only; no Bed→BedCrop split yet).
- `src/api/src/services/repositories/_infrastructure.ts` — GSI1 layout (`BED#<id>` + `#META`) is what the design targets for Wave B's `CROP#<bedId>#<bedCropId>` differentiation. No collision with existing `DDB_KEY_PREFIXES` (`CONV#`, `BED#`, `IMG#`, `TAG#`, `USER#`, `DIARY#`, `NOTIF#`, `DEVICE#`).
- `src/api/src/services/repositories/beds.ts:25` — `getBedById` returns `Promise<Bed>` (throws `NotFoundError` if missing). Confirms `diary.ts:174` `hasActiveCrop(bed)` is safe.
- `packages/shared/src/schemas/index.ts:187` — `UpdateBedRequestSchema.crop_type: z.string().min(1).max(100).nullable().optional()`. Whitespace-only `' '` passes `min(1)`; guard returns `true`. Same behavior as the old `(b) => b.crop_type` truthy check — no regression.
- `npx tsc --noEmit -p packages/shared` → clean.
- `npx tsc --noEmit -p src/api` → clean.
- `npx vitest run packages/shared/src/__tests__/bed-crop.test.ts` → 5/5 pass.
- Global grep `crop_type!` → 0 hits. All non-null assertions removed as claimed.
- Global grep `\.crop_type` in API source (non-test) → all remaining usages are `?? null`, optional-chain, or Zod-validated; no unsafe reads.

## S4.2. MUST-FIX findings

**None.**

After full my-reviewer audit (alignment, security, quality, safety), no MUST-FIX-severity issues. Breakdown:

| Check                                                          | Verdict |
|----------------------------------------------------------------|---------|
| Design doc matches ADR advancement decision + scope memory     | ✅       |
| Type guard narrows correctly for `Bed`, `FarmBed`, `FarmBedItem` | ✅     |
| All 5 `!` non-null assertions removed; type-check clean        | ✅       |
| `getBedById` non-null contract preserves `hasActiveCrop` safety | ✅      |
| No new injection, auth-bypass, or data-exposure surface        | ✅       |
| Refactor is behavior-neutral (truthy check semantics unchanged)| ✅       |
| Test coverage hits all branches of the guard                   | ✅       |
| Commit messages follow conventional format + ref-links #279    | ✅       |
| File naming + export placement match repo conventions          | ✅       |
| No frontend-facing breakage (Wave A is API-side only)          | ✅       |

## S4.3. SHOULD-FIX findings

| # | Severity   | Location                                  | Issue                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Suggested fix |
|---|------------|-------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|---------------|
| 1 | SHOULD-FIX | `DESIGN-279-bed-crop-1n.md` §4.2 + §4.3   | "Backward-compatible via compat shim" is self-contradicting. The §4.3 `FarmBed` type block shows `crop_type`/`planted_at`/`expected_harvest`/`completed_at` **removed** from the top level and replaced by `active_crop: {...} \| null`. Any consumer that reads `bed.crop_type` directly (external API clients, cached mobile apps, or any frontend component that hasn't yet migrated to `bed.active_crop.crop_type`) will break when Wave B ships. This makes the §4.2 "Breaking?" column inaccurate and the "avoiding hard frontend breakage" phrasing misleading. Implementers will plan Wave B → C sequencing incorrectly if they trust the current wording. | Either (a) clarify that the shim keeps inline `crop_type`/`planted_at`/`expected_harvest` fields populated alongside `active_crop` during a transition window (documented removal in Wave E), OR (b) state explicitly that Wave B cannot deploy to production ahead of Wave C frontend. Fix the §4.2 table row for `GET /farms/:farmId` to say "Breaking for external consumers; internal FE migrates in Wave C". |
| 2 | SHOULD-FIX | `DESIGN-279-bed-crop-1n.md` §3.4          | The design proposes `GSI1PK=BED#<bedId>, GSI1SK=CROP#<bedCropId>` for BedCrop, but the existing bed meta row also uses `GSI1PK=BED#<bedId>` with `GSI1SK=#META`. That's fine — `begins_with(SK, 'CROP#')` disambiguates. However, the design doesn't explicitly call out that the existing bed meta row **cannot be mistakenly returned** when Wave B's `getActiveCropForBed` does `query GSI1 PK=BED#<b>`. If someone writes a Wave B query without the `begins_with(SK, 'CROP#')` filter, they get the bed itself back. | Add a one-line note in §3.4 mandating `begins_with(GSI1SK, 'CROP#')` on every BedCrop query to prevent mixing with the `#META` row. Trivial but worth an explicit guardrail since the same GSI is now multi-tenant by prefix. |
| 3 | SHOULD-FIX | `DESIGN-279-bed-crop-1n.md` §6            | The lazy-materialize helper `getActiveCropForBed` has an ordering risk on a bed that is transitioning from legacy (inline crop_type) to Wave B (real BedCrop): if two concurrent writes both hit the fallback branch simultaneously, both synthesize a virtual crop with the same deterministic id (`bed-legacy-<bedId>` per §9 mitigation). The synthesized record isn't persisted, so this isn't a data-integrity hazard — but if Wave E's migration job runs concurrently with live traffic, there IS a window where the job writes a real BedCrop row while a request reads the legacy fields and returns a virtual one. The design §6 says "Wave E ... removes the fallback branch" but doesn't specify ordering: **migrate first, then remove fallback** vs the reverse. | §6 should add an explicit ordering note: Wave E promotes legacy beds to real BedCrop rows **before** removing the lazy-materialize fallback, and the migration job should be idempotent (re-running produces no duplicates — probably via a `created_from_legacy: true` marker on the persisted row). |

## S4.4. Suggestions (skipped per policy)

Per task brief "only report MUST-FIX and high-signal SHOULD-FIX; no nitpicks". Suggestions omitted. One low-signal observation kept in reviewer notes for future sessions: the test file could add a whitespace-only case (`{ crop_type: '  ' }`) to pin the contract explicitly — but since this is zero-regression-from-old-behavior, it's not load-bearing.

## S4.5. Verification needed before `/cc-test`

- [x] Type-check clean in `packages/shared` and `src/api` (verified by reviewer)
- [x] Unit tests green for the new guard (5/5 vitest)
- [ ] No MUST-FIX to remediate — skip `/cc-remediate`
- [ ] Wave A claims "zero user-visible change". Confirm by running the full API test suite (`npx vitest run src/api`) to ensure the 3 call-site substitutions didn't regress existing tests. The diff scope is tiny, but the weather `croppedBeds.filter` nested arrow + the diary bridge are in test-covered paths — worth the sanity pass.

## S4.6. Safety approval

- [x] Impact understood: additive shared helper + 3 call-site substitutions; no schema, DDB, or API-surface change.
- [x] Rollback verified: `git revert a4329f1` restores the exact prior behavior; no data migration to unwind.
- [x] Approved for execution: **YES** — no MUST-FIX.

## S4.7. Decision

**Status**: **ACCEPT** — 0 MUST-FIX. 3 SHOULD-FIX findings all target the design doc (not the shipped code); they are documentation clarifications for Wave B's author, not blockers on Wave A's merge or on the current pipeline stage. Proceed to `/cc-test`. `/cc-remediate` is not required; the SHOULD-FIX items can be folded into the design doc at Wave B kickoff.

**Counts**: MUST-FIX: 0 · SHOULD-FIX: 3 · Verdict: **ACCEPT**

---

# Review Findings — Session 099.x (2026-04-18)

> Scope: Three features shipped this session on `develop`.
> Baseline: branch `main` at `d28d028` (v0.99.4 production).
> Reviewer policy: `.agent/subagents/my-reviewer.md` + `.agent/prompts/security/appsec_threat_model_prompt.md`.
> Pipeline stage: `/cc-review` → `/cc-remediate` (if MUST-FIX) → `/cc-test`.

---

## 1. Scope reviewed

### Feature A — Profile tab nice-to-have tests + WAI-ARIA focus fix
- `src/frontend/src/components/ProfilePage.tsx:81-96` — `handleTabKeyDown` now shifts focus
- `src/frontend/src/__tests__/profile-tabs.test.ts` — U-5..U-8
- `src/frontend/src/__tests__/ProfilePage.integration.test.ts` — INT-1..INT-5 (new file)
- `e2e/tests/categories/profile-tabs.spec.ts` — A-1..A-4 under `Profile tablist a11y`

### Feature B — Vite cache invalidation via version stamp
- `src/frontend/astro.config.mjs:12-39` — stamp-file read + conditional `rmSync`

### Feature C — Cognito `custom:display_name` attribute (cross-device bootstrap)
- `infra/lib/litcrop-stack.ts:82-89` — `customAttributes.display_name`
- `src/frontend/src/lib/auth.ts:249-277` — `signUp(email, password, displayName?)`
- `src/frontend/src/components/RegisterForm.tsx:234-238` — passes `displayName`
- `src/api/src/middleware/auth.ts:29-120` — `displayNameHint` in context, extracted from both paths
- `src/api/src/routes/me.ts:19-38` — auto-create seeds `display_name` from hint
- `src/api/src/__tests__/middleware/auth.test.ts` — three `displayNameHint` tests
- `src/api/src/__tests__/routes/me.test.ts` — three auto-create-with-hint tests
- `src/frontend/src/__tests__/auth.test.ts` — four `signUp` attribute tests

**Totals**: 944/944 vitest (from 920 baseline), 5 Playwright tests registered. Type-check clean on frontend, api, infra.

---

## 2. MUST-FIX findings

**None.**

After full audit against the my-reviewer checklist (alignment, security, quality, safety), no MUST-FIX-severity issues were found in this session's changes. Findings breakdown:

| Check                                          | Verdict |
|------------------------------------------------|---------|
| No injection vectors (SQLi/NoSQLi/command)     | ✅       |
| No path traversal (`rmSync` paths are literal) | ✅       |
| JWT claim handling follows existing pattern    | ✅       |
| No auth bypass or privilege escalation surface | ✅       |
| No credentials/secrets exposed                 | ✅       |
| Input validation at trust boundaries           | ✅ (Cognito `maxLen:100` + `UpdateProfileRequestSchema` on PATCH) |
| XSS surface unchanged                          | ✅ (display_name is Preact-escaped at render; new Cognito path uses same sink) |
| Tests cover new code paths                     | ✅       |
| Rollback path exists for all three features    | ✅ (feature flags unnecessary; each change is idempotent + additive) |

---

## 3. SHOULD-FIX findings

| # | File:Line                                          | Issue                                                                                                                                                                                                             | Severity   |
|---|----------------------------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|------------|
| 1 | `infra/lib/litcrop-stack.ts:96-116`                | `UserPoolClient` does not set `readAttributes`/`writeAttributes` explicitly. CDK/CloudFormation default is "all attributes readable" — the new `custom:display_name` IS included in ID tokens under that default, but relying on implicit behavior is fragile. Explicit attribute maps would make the token contract visible in code. | SHOULD-FIX |
| 2 | `src/api/src/routes/me.ts:33-38`                   | `displayNameHint` is written to DynamoDB without explicit length validation. Cognito enforces `maxLen:100` at the attribute layer, but defense-in-depth would clamp/validate at the backend too (match `UpdateProfileRequestSchema` rules). Low priority — the attribute is user-controlled and already trusted via the JWT signature check. | SHOULD-FIX |
| 3 | `src/frontend/src/components/AuthGuard.tsx:43-58`  | The localStorage bridge (`litcrop-pendingName` / `litcrop-pendingRole`) is now redundant for new users after the Cognito attribute ships. Keep it for one release for backward-compat, but schedule removal once all active users have a `custom:display_name` claim.                                                                  | SHOULD-FIX |
| 4 | `src/frontend/astro.config.mjs:27-39`              | Concurrent builds (two `astro build` processes racing the stamp file) could produce partial cache clears. Practically unlikely since builds are serialized in CI, but noting for awareness.                                                                                                                                          | SHOULD-FIX |

---

## 4. Suggestions (SUGGESTION)

- **S1** — `src/api/src/middleware/auth.ts:76,106` — the string cast on `claims['custom:display_name']` trusts the claim type. Dev path (Path 2) with a malicious test token could produce garbled data in DynamoDB. No security impact; cosmetic robustness.
- **S2** — `src/frontend/src/__tests__/profile-tabs.test.ts` / `ProfilePage.integration.test.ts` — the `switchTab`/`handleTabKeyDown` mirrors are duplicated across two files. Fine as documented, but if the real handler gains a third branch the drift cost doubles.
- **S3** — End-to-end: no test verifies the Cognito attribute actually round-trips through a real User Pool (signup → confirm → signin → claim appears). This is a live-infra concern; suggest a manual verification step in the PR description once CDK is deployed.

---

## 5. Verification needed before merge

- [ ] Deploy the CDK change to staging first; confirm `custom:display_name` appears in ID token claims on a fresh signup
- [ ] Verify a v0.99.4 → v0.99.5 tag bump triggers the `astro.config.mjs` invalidation locally (`rm -rf node_modules/.cache/astro-app-version && npx astro build` twice with different git tags)
- [ ] Run the Playwright suite `npx playwright test e2e/tests/categories/profile-tabs.spec.ts` against a live dev server (A-1..A-4 need a browser; not in CI matrix yet — confirm behavior manually)

---

## 6. Safety approval

- [x] Impact understood: additive CDK change (new custom attribute), additive frontend/backend plumbing, version-stamp auto-invalidation. No destructive operations.
- [x] Rollback verified: revert the three commits; CDK deploy re-removes the attribute (Cognito supports attribute removal only for UNUSED attributes — plan ahead if deploy happens in prod).
- [x] Approved for execution: **YES** — no MUST-FIX findings. Pipeline can proceed to `/cc-test`.

---

## 7. Decision

**Status**: ACCEPTED — proceed to `/cc-test`. `/cc-remediate` is not required (no MUST-FIX). The four SHOULD-FIX items are documented for the author's discretion and the next session's consideration.

---

# Review Findings — Session 099.x Addendum (2026-04-18, post-v0.99.5)

> Scope: B1/B2/B3 + C2 + C8 test-strengthening work from `docs/TEST-STRATEGY-099X-GAP-ANALYSIS.md`.
> Target tag: `v0.99.6` (next patch bump for test + doc polish).
> Baseline: 944 vitest → 970 (+26 tests), all green.

## A1. Scope reviewed

- `tools/invalidate-version-cache.mjs` — new DI-friendly helper extracted from `astro.config.mjs`
- `src/frontend/astro.config.mjs` — simplified to delegate to the helper
- `src/frontend/src/__tests__/invalidate-version-cache.test.ts` — 14 new tests (B1/B2/B3 + fs-failure + stamp edge cases)
- `src/frontend/src/__tests__/auth.test.ts` — +12 C2 edge-case tests via `it.each` (Unicode, emoji, boundary, quotes, whitespace)
- `.github/PULL_REQUEST_TEMPLATE.md` — new "Post-Deploy Verification" subsection under Deployment Notes

## A2. MUST-FIX findings

**None.**

| Check                                          | Verdict |
|------------------------------------------------|---------|
| DI seam sound; no fs references leak           | ✅       |
| All fs calls wrapped in try/catch              | ✅       |
| Defaults are hardcoded and safe (no traversal) | ✅       |
| Tests deterministic (no real filesystem touch) | ✅       |
| Edge cases cover realistic user names          | ✅       |
| JSON transport preserves all edge inputs       | ✅       |
| PR-template addition is actionable and scoped  | ✅       |

## A3. SHOULD-FIX findings

| # | File:Line                                                                 | Issue                                                                                                                                                                                    | Severity   |
|---|---------------------------------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|------------|
| 5 | `invalidate-version-cache.test.ts`                                        | Only `cacheDirs` override is exercised. `stampDir` and `stampFileName` overrides are part of the public API but untested. Add one test per override to complete the DI surface coverage. | SHOULD-FIX |
| 6 | `auth.test.ts` (C2 edge-case table)                                       | Missing null-byte (`'Alice\x00Bob'`) and RTL override mark (`'\u202EAlice'`) cases. Both are pass-through contracts (frontend doesn't strip; Cognito/backend rejects). Adding them documents the semantics explicitly. | SHOULD-FIX |

## A4. Suggestions

- **S4** — `PULL_REQUEST_TEMPLATE.md`: consider a one-line pointer near the top of the template ("🔒 Auth/Cognito changes? See Post-Deploy Verification below") so reviewers don't miss the section in long PRs. Low urgency; the current "when applicable" qualifier handles discoverability well enough.
- **S5** — `invalidate-version-cache.mjs`: `appVersion=''` (defensive) triggers the same "no clear" path as an absent stamp, but the semantics are subtle. Adding a tiny test that feeds `''` as the current version would prevent a future refactor from silently breaking this guard.
- **S6** — The helper could short-circuit the stamp write when `appVersion` matches the stamp (no-op write saves one syscall). Cosmetic.

## A5. Verification needed before merge

- [ ] Run `npx vitest run` once more after any remediation → confirm 970 (or 970+N) pass
- [ ] Run `npx astro build` in `src/frontend/` to confirm the refactored `astro.config.mjs` still produces a valid build (the helper now runs as a side-effect call at config-load; ensure no regression)
- [ ] Manual read of the new PR template section — does it trigger the right behavior for someone unfamiliar with the Cognito flow?

## A6. Decision

**Status**: ACCEPTED — proceed to commit + push + tag + PR for v0.99.6. `/cc-remediate` not required (no MUST-FIX). The two SHOULD-FIX items are low-effort (each is ~10 lines of test code) and could either be folded into v0.99.6 or deferred to a future session.

---

# #462 Phase 1 review (2026-04-20)

> Scope: commits `5ff13fe` (Phase 1 — add `Device.registered_by` + `Image.uploaded_by`) and `07c0268` (simplify pass on the same change). Both on `develop`.
> Reviewer role: my-reviewer, read-only.
> Consumer: `/cc-remediate` → my-builder, if MUST-FIX present.
> Files reviewed: the 7-file surface named in the task brief — `packages/shared/src/types/domain.ts`, `packages/shared/src/schemas/index.ts`, `src/api/src/routes/beds.ts`, `src/api/src/routes/devices.ts`, `src/api/src/routes/images.ts`, `src/api/src/services/repositories/devices.ts`, `src/api/src/services/repositories/_mappers.ts`.
> Auxiliary files consulted (not modified by the commits but load-bearing for the review): `src/api/src/middleware/auth.ts`, `src/api/src/middleware/device-auth.ts`, `src/api/src/app.ts`, `src/api/src/routes/diary.ts`, `src/api/src/routes/_helpers.ts`, `src/api/src/services/repositories/images.ts`, `docs/device/MVP-CAMERA-NODE-SPEC.md`, `scripts/camera-node/capture.sh`.

## B1. Findings on the three specific concerns

### B1.a — Concern 2 (device auth-context userId) — the task brief's premise is **incorrect**

**Claim in the task brief**: "`POST /beds/:bedId/images` is called by the Pi device (X-Device-Key header auth per #341 heartbeat fix)."

**Reality on `develop`**:
- `src/api/src/app.ts:138–139` mounts `authMiddleware` (Cognito JWT) on `/api/v1/beds` and `/api/v1/beds/*`. There is **no** `X-Device-Key` middleware on the `/beds` tree.
- `docs/device/MVP-CAMERA-NODE-SPEC.md` §6.6 ("Authentication — MVP — Option B: Pre-provisioned Token") describes the Pi uploading with a **Cognito user's JWT stored in `AUTH_TOKEN`**, currently bound to "Kiku's" user account.
- `scripts/camera-node/capture.sh:307–358` — the `upload()` function sends only `Authorization: Bearer $AUTH_TOKEN` to `POST /api/v1/beds/${BED_ID}/images`. Dual-auth (JWT + X-Device-Key) is used ONLY by `poll_config` (line 198–203) and `heartbeat` (line 458–463), per the `#341` fix — NOT by image upload.

**Implication for the schema additions**:

Because the Pi uses a user JWT (not a device key), `getAuthContext(c).userId` on POST /beds/:bedId/images always resolves to path (a) from the task brief — a genuine Cognito sub. So the value written into `Image.uploaded_by` is always a clean Cognito sub, and Phase 3's `/me/activity` filter by `uploaded_by = <cognito-sub>` will work.

However: that sub is the sub of **whichever user account's JWT is provisioned on the Pi**, not the sub of "the user who registered the device". For the current MVP, the Pi runs under "Kiku's" account, so every Pi-uploaded image on every farm that uses a Kiku-provisioned Pi will be tagged `uploaded_by = <kiku's-sub>` — even if a different user (e.g. an admin) actually did the Register Device flow.

This contradicts the JSDoc and commit message:
- `packages/shared/src/types/domain.ts:99`: "*Cognito sub of the uploader — device registrant for Pi uploads, the user for manual UI uploads.*"
- Commit `5ff13fe` message: "*For Pi-device uploads this resolves to the device's registrant user.*"

Both are wrong for the current Pi auth model. The sub stored is "whoever's JWT the Pi happens to be running under", which is independent of `Device.registered_by`. In the common MVP case where the operator (Kiku) and the person who ran Register Device in the UI are the same, the two happen to agree — but the contract as written doesn't guarantee that.

### B1.b — Concern 1 (privacy of `uploaded_by` on GET /images/:imageId) — acceptable, matches existing posture

`src/api/src/routes/images.ts:62–102` gates GET /:imageId with `assertImageOwnership(image, userId, isAdmin)` → `assertFarmAccess(bed.farm_id, userId, undefined, isAdmin)` (`_helpers.ts:36–74`). Undefined `requiredRoles` means any farm member (admin/owner/staff) can read. Admins (via `ADMIN_EMAILS_SET`) can read across farms.

Cross-checked against `DiaryEntry.created_by`:
- `src/api/src/routes/diary.ts:106` emits `created_by` (raw Cognito sub) on GET single + list responses.
- Access-control for diary is also any farm member.

So exposing `uploaded_by` to farm members matches the existing privacy posture of `created_by`. Acceptable.

### B1.c — Concern 3 (list-response payload) — acceptable, with one caveat

- **Device list** `GET /api/v1/farms/:farmId/devices` (`src/api/src/routes/devices.ts:121–124`): spreads `...d` into the response, so `registered_by` **does** propagate into the list payload. `DeviceListItemSchema` (`packages/shared/src/schemas/index.ts:498`) declares it `.nullable().optional()`, so validation is backward-compatible. +1 field (~40 bytes) per device; max 10 devices/farm (`MAX_DEVICES_PER_FARM` in `routes/devices.ts:33`); total bloat ≤ ~400 bytes per list response. Negligible.
- **Image list** `GET /api/v1/beds/:bedId/images` (`src/api/src/routes/beds.ts:213–231`): the list-item projection is **explicit** (`{ id, thumbnail_url, url, captured_at, trigger, node_id, size_bytes, latest_tag }`) and does NOT include `uploaded_by`. No bloat, no schema change to `ImageListItemSchema`.
- **Image upload 201 response** `POST /api/v1/beds/:bedId/images` (`routes/beds.ts:400–410`): the response projection is explicit and omits `uploaded_by`. `ImageUploadResponseSchema` (`schemas/index.ts:220–227`) is unchanged. No break.

## B2. Findings

### MUST-FIX

| File:Line | Issue | Severity |
|-----------|-------|----------|
| `packages/shared/src/types/domain.ts:99` and commit `5ff13fe` message | Contract claim "For Pi uploads this resolves to the device's registrant user" is inaccurate given the current Pi auth model (shared-user JWT — per `docs/device/MVP-CAMERA-NODE-SPEC.md` §6.6 and `scripts/camera-node/capture.sh:318`). `uploaded_by` actually holds the Cognito sub of whoever's JWT is provisioned on the Pi, which is independent of `Device.registered_by`. Phase 3's `/me/activity` endpoint will therefore attribute ALL Pi-captured images to the single shared-JWT user (currently "Kiku") — not to the user who ran Register Device, and not to each individual farm operator. | MUST-FIX (contract misrepresentation that silently corrupts the activity feed) |

**Why MUST-FIX, not SHOULD-FIX**: the brief explicitly called out that Phase 3 will filter `/me/activity` by `uploaded_by = <current-user-cognito-sub>`. Under the current Pi auth model, that filter will *silently* miss zero Pi images for the shared-JWT user (Kiku sees everything) and *silently* miss every Pi image for everyone else (they see nothing captured by the camera, only their manual uploads). That is a correctness break on the deliverable Phase 1 exists to enable.

There are three acceptable remediations, each with a different cost/honesty trade-off. I do NOT pick one — that's an architectural call (escalate to my-architect if ambiguous). I list them so the remediation PR has options:

1. **Accept and document**: update the JSDoc + commit message + (ideally) the ADR the commit claims exists to say "For Pi-device uploads, this is the Cognito sub of whichever user's JWT the Pi is running under — NOT necessarily the device's registrant. As of v0.99.7.3 this is a single shared account; when a per-device service account or M2M credential ships, this comment must be revised." Then make the `/me/activity` consumer aware that it will under-count Pi uploads for every user except Kiku — likely by filtering on `(uploaded_by = me) OR (registered_by_device_for_this_farm AND trigger = 'scheduled')`.
2. **Switch attribution source for the Pi path**: if the upload originates from a Pi (detectable by presence of `X-Device-Key` header once the Pi is modified to send it, OR by looking up `Device` by `node_id` and using its `registered_by`), populate `Image.uploaded_by` from `Device.registered_by` instead of the JWT sub. This makes the Image.uploaded_by contract accurate but requires a write-path change and a Pi config change.
3. **Split the field** into `uploaded_by_user` vs `uploaded_by_device` now (the path the commit message explicitly rejected as "more complex"). Avoids the ambiguity entirely.

The commit picked option 1 implicitly but wrote the JSDoc as if option 2 were in effect. That mismatch is the MUST-FIX.

### SHOULD-FIX

| File:Line | Issue | Severity |
|-----------|-------|----------|
| entire Phase 1 diff | Zero test coverage for the new fields. `grep -r "uploaded_by\|registered_by" src/api/src/__tests__/` returns **no matches**. The commit message says "991 tests pass", but that's because no existing test exercises the new behavior — the Zod contract tests (`contracts.test.ts:525–535`) pass only because the fields are declared `.optional()`. Without at least one test per field asserting (a) write persists the sub, (b) read returns the sub, (c) legacy record with missing attribute returns `null` — any regression in Phase 2/3/4 is undetectable by CI. | SHOULD-FIX |
| `packages/shared/src/types/domain.ts:99` and `:199` JSDoc; commit `07c0268` message | Both JSDoc one-liners and the simplify-pass commit message refer to "ADR-20260420 + #462 Q1 comment" as the place where the "null leaves historical unattributed" decision is documented. `ls docs/decisions/ | grep 20260420` only finds `ADR-20260420-1n-bed-crop-build-in-waves.md`, and `grep 462` against that ADR returns no matches. The referenced documentation does not exist. Either create it or update the JSDoc to point somewhere that does (e.g. the Phase 1 commit message itself). | SHOULD-FIX |
| `src/api/src/routes/images.ts:94` (GET /:imageId response) | `uploaded_by` is emitted as a raw Cognito sub with no accompanying resolved display name. The existing `DiaryEntry` response includes both `created_by` AND `created_by_name` (resolved via `resolveCreatorName` in `diary.ts:65–79`) for exactly this reason — the frontend needs a human-readable label, not a UUID. Phase 4 (ProfileActivityList component) will either need to duplicate that resolution logic on the frontend (extra round-trip per image) or the API will need to add `uploaded_by_name` to `ImageDetailResponse`. Flagging now so Phase 3/4 doesn't discover it mid-implementation. | SHOULD-FIX |
| `src/api/src/services/repositories/images.ts:84–105` (`createImage`) | The `Omit<Image, 'id' | 'bed_id'>` data shape means any future optional field added to `Image` will silently start flowing through `createImage → PutCommand.Item` via `...image` spread at line 99 — the author doesn't have to remember to add it. That's intentional per the commit message. But it also means that if someone later adds a derived field (e.g. `storage_key` is already required on Image, or future `content_hash`) and forgets it shouldn't be in the DDB Item, it silently gets written. Low risk today; flag for future audits. | SHOULD-FIX |

### NIT

| File:Line | Issue | Severity |
|-----------|-------|----------|
| `packages/shared/src/schemas/index.ts:245–247` | The `// --- #462 activity-feed attribution ---` separator comment was retained on the schema but the `07c0268` simplify pass removed the analogous comments from the route/mapper sites. Minor inconsistency between schema and mapper: the mapper (`_mappers.ts:57`) has a bare `uploaded_by` line while the schema has a 2-line explanation. Not wrong, but inconsistent with the simplify rationale ("the field names already say WHAT"). | NIT |
| `src/api/src/routes/beds.ts:362` and `routes/devices.ts:84` | `uploaded_by: userId` and `registered_by: userId` pass the auth-context userId with no validation that it's non-empty. `authMiddleware` does guarantee `claims['sub']` is truthy on the success path (line 73 requires `claims?.['sub']`), but a hypothetical future bug where `userId` becomes `""` would silently write an empty string. Defensive coding could add `userId || null` — but this is speculative and the existing `DiaryEntry.created_by` site doesn't defend either, so consistency wins. NIT. | NIT |
| `src/api/src/services/repositories/devices.ts:51` | The `createDevice` `data` parameter mixes required fields (`bed_id`, `node_name`, `device_api_key_hash`, `capture_interval`, ...) with a nullable-at-call-site field (`registered_by: string | null`). For write clarity, passing `registered_by: userId` (always truthy string) is the only current call site — the `| null` union is present only to allow legacy or system-created devices. If no such call site exists in Phase 2, the type could be tightened to `string`. Not worth blocking on. | NIT |

## B3. Positive observations

- **Nullability design is correct**. Making the fields `.nullable().optional()` on both Zod schemas (`schemas/index.ts:248, 498`) and `?: string | null` on the TS types (`domain.ts:100, 200`) is the right migration shape: old DDB records without the attribute deserialize to `null`, new records deserialize to a sub, and both parse against the schema. `_mappers.ts:57` and `devices.ts:33` correctly use `?? null` (not `??  undefined`) which matches the schema contract.
- **Additive change scope**. Read-path changes are pure deserializer additions; write-path changes are pure Item additions; the POST 201 response and image list response are untouched. This is a clean "foundation phase" landing with no contract breaks for existing consumers.
- **`ImageDetailResponse` type inheritance works**. Because `packages/shared/src/types/api.ts:116` defines `ImageDetailResponse extends Omit<Image, 'storage_key'>`, adding `uploaded_by` to Image automatically flows into the TS response type — no redundant surface. Good.
- **The simplify pass (`07c0268`) is defensible**. Redundant `// #462` trailing comments at call sites add noise — they're in git blame. Consolidating 6-line JSDoc blocks to one-liners is consistent with the codebase's terse-JSDoc style. The retained schema-level comments (at `schemas/index.ts:245–247, 495–497`) correctly document the non-obvious "nullable-for-migration" intent at the contract boundary.
- **`createImage`'s `Omit<Image, 'id' | 'bed_id'>`** pattern automatically picks up `uploaded_by` without a separate parameter. Clean.

## B4. Safety approval

N/A. This change is:
- Not destructive (no deletes, no migrations in this commit)
- Not irreversible (can be reverted by dropping the two fields and the writer lines; legacy data keeps parsing)
- Not auth/authz critical (does not change access control; only adds a metadata field)
- Not infra-touching

No safety gate required.

## B5. Verification needed before Phase 2

- [ ] Decide on remediation for MUST-FIX (Option 1 / 2 / 3 above) — escalate to my-architect if ambiguous.
- [ ] Add at least three tests per field in `src/api/src/__tests__/routes/beds.test.ts` and `devices.test.ts`:
  - Write path: POST persists the userId as `uploaded_by` / `registered_by`.
  - Read path, new record: value round-trips through `itemToImage` / `itemToDevice`.
  - Read path, legacy record: DDB Item without the attribute deserializes to `null`.
- [ ] Decide whether Phase 3/4 will need `uploaded_by_name` resolution on the API (consistent with diary) or push resolution to the frontend.
- [ ] Either create the referenced ADR-20260420 + #462-Q1 documentation, or fix the JSDoc pointer to point at the existing place (the Phase 1 commit message + issue comment).

## B6. Decision

**Status**: **needs-remediation** (1 MUST-FIX, 4 SHOULD-FIX, 3 NIT).

The MUST-FIX is a contract-honesty problem, not a code bug — the write-path behavior is stable, but the JSDoc and commit-message claim about it misrepresent the Pi-auth reality, which will mis-calibrate Phase 3's implementation. The SHOULD-FIX items (especially zero test coverage) accumulate into real risk across the remaining three phases. The NITs are optional.

Route this to `/cc-remediate` → my-builder with preference for **Option 1** in the MUST-FIX above (document accurately), and fold the SHOULD-FIXes into the same remediation commit if cheap.

---

# #462 Phase 3 review (2026-04-20)

> Scope: commit `811910b` on `develop` — `feat(api,shared): #462 Phase 3 — GET /me/activity endpoint + tests`. 9 files, +1617/-1 LOC.
> Reviewer role: my-reviewer, read-only.
> Consumer: `/cc-remediate` → my-builder, if MUST-FIX present; else tag `v0.99.7.3`.
> Files reviewed (source): `packages/shared/src/types/domain.ts` (new ActivityItem union L300-360), `packages/shared/src/schemas/index.ts` (new Zod L688-744), `packages/shared/src/index.ts` (exports), `src/api/src/services/repositories/me-activity.ts` (new, 325 LOC), `src/api/src/services/dynamodb.ts` (+4 LOC facade wiring L18/L162-163), `src/api/src/routes/me.ts` (+29 LOC activity handler L301-332).
> Files reviewed (tests): `packages/shared/src/__tests__/schemas.test.ts` (+220 LOC C1+C2), `src/api/src/__tests__/services/me-activity.test.ts` (new, 461 LOC: U1 U2 U3 U4 U5 + I4/I5 repo-level), `src/api/src/__tests__/routes/me-activity.test.ts` (new, 440 LOC: I1-I10).
> Auxiliary files consulted (for pattern comparison): `src/api/src/services/repositories/diary.ts`, `images.ts`, `devices.ts`, `members.ts`, `users.ts`, `farms.ts`, `beds.ts`, `_infrastructure.ts`, `src/api/src/middleware/auth.ts`, `src/api/src/errors.ts`, `packages/shared/src/constants.ts` (DDB_KEY_PREFIXES).
> Strategy doc: `docs/TEST-STRATEGY-462.md` §4 (the 13 MUST + 5 SHOULD test matrix for Phase 3).
> Phase 1 context: `docs/feedback/REMEDIATION-462-PHASE1.md` (deferred #4 uploaded_by_name resolution, deferred #5 createImage spread-Omit).

## C1. Overview — verdict summary

The deliverable faithfully implements the design per §4 of the test strategy and the Pi-auth reality comment (#462 issue comment 4280185580). All 13 MUST-tests and 4 of 5 SHOULD-tests are present; E1 is correctly deferred to Phase 4 (no UI exists). The I4 OR-predicate is correctly wired, I5 legacy-null is naturally handled via strict `=== userId`, I8 cursor cross-user defense is in place, and the response envelope matches `ActivityFeedResponseSchema`. No MUST-FIX findings.

The SHOULD-FIX findings are mostly honesty-of-semantics issues: one error-message info-leak, one missing I5-for-diary coverage, one redundant `getBedsForFarm` call (the NIT flagged in the task brief becomes a SHOULD-FIX when you trace the fan-out cost), and the Phase-1-deferred #5 (createImage spread-Omit) remains unaddressed.

## C2. Findings

### MUST-FIX

**None.**

After full audit against the my-reviewer checklist (alignment, security, quality, safety), the Pi-auth OR predicate, legacy-null handling, cursor user-scope, and chronological merge are all correct. The cross-cutting risks R1 (Pi-auth mis-match), R2 (legacy-null leak), and R3 (cursor cross-user leak) identified in the strategy doc are each guarded by at least one test, and the behavior under test matches the specification.

| Check                                                    | Verdict |
|----------------------------------------------------------|---------|
| I4 Pi-auth OR predicate: `uploaded_by === me` OR (`trigger==='scheduled'` AND `piBedIds.has(bedId)`) | ✅  (L189-190 of me-activity.ts — no short-circuit slippage; `isManualMatch` requires non-null `uploaded_by`) |
| I5 Legacy-null: strict `=== userId` filters on diary, device, image | ✅  (L112, L145, L189 — `null === userId` is `false`; no regex/truthy branch exists) |
| I8 Cursor cross-user defense: route passes JWT sub as expectedUserId | ✅  (me.ts:319 → me-activity.ts:211 → `decodeActivityCursor(cursor, userId)`; userId only sourced from `getAuthContext(c)`, never from query string — confirmed by I6 test "passes the authenticated userId") |
| Chronological merge direction: DESC by timestamp, stable tiebreak on id DESC | ✅  (L301-304 — comparator is correct; U3 test validates tie behavior) |
| Total count: computed before pagination (all matching items) | ✅  (L306 — `totalCount = allItems.length` BEFORE cursor filter at L308) |
| Response shape: `{ items, next_cursor, total_count }` (snake_case) | ✅  (me.ts:327-331 matches ActivityFeedResponseSchema L734-738) |
| Deep-link injection safety: all builders use `encodeURIComponent` | ✅  (L76, L80, L84) |
| No admin privilege escalation: route ignores `?userId=` | ✅  (I6 test line 261-276 explicitly verifies) |
| Limit bounds: min 1, max 100, default 20 | ✅  (schemas/index.ts:741-744; I9 tests boundaries) |
| JWT sub never cast away: userId flows as `string` from getAuthContext | ✅  |
| No `any` casts added: only `as <specific-type>` after `unknown`-narrowing | ✅  |
| Tests deterministic: no real DDB, no real network, no timers | ✅  (both test files use `aws-sdk-client-mock` + `vi.mock` on sibling repos) |

### SHOULD-FIX

| # | File:Line | Issue | Why it matters | Suggested remediation |
|---|-----------|-------|----------------|----------------------|
| 1 | `src/api/src/routes/me.ts:322` | `ValidationError(err.message)` re-surfaces the repo's internal cursor message verbatim: `"Invalid cursor: user mismatch"`, `"Invalid cursor: unknown type"`, `"Invalid cursor payload"`. This leaks to the client that (a) the cursor format is base64url-JSON with `user_id`/`ts`/`type`/`id` fields and (b) user-scope was the cause of rejection. An attacker who crafts a cursor and sees "user mismatch" learns their cursor parsed successfully — useful reconnaissance when paired with cursor-forgery attempts. | Confidentiality of the pagination protocol. Aligns with R3 mitigation which says "either 400 ValidationError or server silently ignores the cursor". The strategy doc's I8 test accepts either 400-with-generic-message or silent-ignore; the current impl does 400-with-specific-message. | Narrow the surfaced message in the route's catch block to a single generic string (e.g. `throw new ValidationError('Invalid cursor')`). Keep the specific message in the repo as internal-log detail (via `console.warn` or the `details` arg on `AppError` — that `details` object is emitted in API responses only if the error handler opts in; check `src/api/src/app.ts` error serializer before trusting it). The I8 integration test asserts only `status === 400` and `body.error` presence, so it won't break. |
| 2 | `src/api/src/__tests__/services/me-activity.test.ts` (I5 describe block, L426-461) | I5 coverage is present for device (null `registered_by`) and image (null `uploaded_by`), but **missing for diary** (null `created_by`). The repo's L112 `filter((it) => it['created_by'] === userId)` handles it correctly by strict equality, but without a test a future "filter instead by truthiness" refactor would silently regress. | R2 (legacy-null leak) is listed as "three sources the authenticated user owns: diary entries they authored, devices they registered, and images attributed to them" — the defense must be equally tested across all three. | Add one test in the I5 describe block: seed a diary item with `created_by: null`, assert `result.items.filter(it => it.type === 'diary')).toHaveLength(0)`. ~10 LOC. Mirror of the device and image cases already there. |
| 3 | `src/api/src/services/repositories/me-activity.ts:166` and `:241` | `getBedsForFarm(farmId)` is called twice per farm in the happy path: once inside `queryImagesForUserInFarm` (L166, to enumerate beds for the image query), once again in `getActivityForUser` (L241, to build the bed-name resolution map). These are identical calls returning identical data. At pilot scale (≤20 beds/farm, 4 users, ≤2 farms/user) this is 2 DDB queries per farm-with-activity — doubled from what it needs to be. Post-pilot this compounds into the R5 concern. | The task brief explicitly asked whether this is a NIT or SHOULD-FIX; the answer is SHOULD-FIX because it's a trivial and mechanical fix that improves both latency and DDB RCU spend measurably (halves the per-farm read cost for the dominant query class). Not a blocker for v0.99.7.3. | Hoist the `getBedsForFarm(farmId)` call into `getActivityForUser` before `queryImagesForUserInFarm`, pass the `beds` array (or a `Map<bedId, bedName>`) down as a parameter, and reuse it for both the image fan-out and the name map. ~15 LOC churn. Keep the function signature change internal to the module. |
| 4 | `src/api/src/services/repositories/images.ts:84-105` (`createImage` — carried over from Phase 1 deferred finding #5) | The `Omit<Image, 'id' \| 'bed_id'>` + `...image` spread at L99 was flagged in the Phase 1 review as "speculative" and deferred to Phase 3 audit (per `docs/feedback/REMEDIATION-462-PHASE1.md` L18). Phase 3 does not touch the write path, so this is still open. It's relevant now because Phase 3 reads these images and filters on `uploaded_by`; if a future Phase adds a new optional field to `Image` and forgets to exclude it from the DDB Item, it silently flows in, and the activity feed's attribute-based filters (e.g. a future `source='auto'` field) could behave unexpectedly. | The deferred finding has not been re-evaluated as the Phase 1 remediation said it would be. Either act on it or re-defer with justification. | Two options: (a) explicitly enumerate the write-item fields in `createImage` (safest, matches `createDevice`'s style); (b) re-defer to a dedicated "createImage write-path audit" task with a written rationale. Pick whichever the author prefers, but don't leave the flag dangling through a third phase. |

### NIT

| # | File:Line | Issue | Rationale for NIT severity |
|---|-----------|-------|---------------------------|
| N1 | `src/api/src/services/repositories/me-activity.ts:75-85` | Three deep-link builders are co-located but not exported. If Phase 4's frontend ever needs to reproduce the same URL format (e.g. to invalidate a cache key), it will either re-implement or reach inside this module. Not a correctness issue — just a future-refactor seam. | Private-by-default is fine for a first implementation; extract only when a second caller appears. |
| N2 | `src/api/src/routes/me.ts:319` | `let result;` (untyped) is declared outside the try block to bring it into scope for the `return c.json(...)`. Typing it (`let result: Awaited<ReturnType<typeof dynamoRepo.getActivityForUser>>;`) would make the code slightly more self-documenting, but TS infers correctly via the assignment and the existing code reads fine. | Zero risk; purely stylistic. |
| N3 | `src/api/src/__tests__/routes/me-activity.test.ts:14-16` | `vi.hoisted(() => { process.env['ADMIN_EMAILS'] = 'admin@litcrop.test'; });` mutates `process.env` without restoring it. Subsequent test files that import `config.ts` and expect the default `ADMIN_EMAILS_SET` will see the test value. In practice `config.ts` is imported once per Vitest worker and the set is built then, so the cross-test pollution is limited — but a cleanup in `afterAll` would be defensive. | The pattern is already used in other test files that depend on `ADMIN_EMAILS`; deferring to that existing convention is fine. Not worth changing just here. |
| N4 | `packages/shared/src/types/domain.ts:319-321` | `actor_id: string \| null` — documented "self by definition" yet the type admits null, and the repo does set null when `getUserProfile(userId)` succeeds but returns a profile the user hasn't created yet. This creates a documented-but-permissive field. Not wrong, just surprising. | The Zod schema matches (`z.string().nullable()`), so the contract is honest; only the JSDoc claim "self by definition" is slightly aspirational. Minor doc nit. |
| N5 | `src/api/src/services/repositories/me-activity.ts:65-69` | `decodeActivityCursor` checks `c.type !== 'diary' && c.type !== 'device' && c.type !== 'image'`. If a new `ActivityItemType` is added (e.g. `'tag'` in a future phase), this list must be updated manually — no TS exhaustiveness check pins it. | Acceptable at this scale; a `Set<ActivityItemType>` constant imported from domain.ts would be the cleanest fix, but it's a 3-way enum with a union type that's unlikely to churn. Low impact. |

## C3. Positive observations

- **I4 test pair is load-bearing and correct**. Both directions are tested: (a) scheduled image with `uploaded_by = PI_SERVICE_ACCOUNT` ≠ user, bed has user-registered device → included; (b) scheduled image where the device was registered by `OTHER_USER` → excluded. This is the R1 guard from the strategy doc and it's exactly right. `docs/feedback/REVIEW-FINDINGS.md` §B5 "decide whether Phase 3/4 will need `uploaded_by_name` resolution on the API (consistent with diary) or push resolution to the frontend" is answered here: the API resolves `actor_name` via `getUserProfile(userId)` once per request (line 217), so Phase 4 does not need to redo it. The Phase-1-deferred finding #4 is effectively resolved.
- **Cursor design is defensible**. Encoding `{ user_id, ts, type, id }` is narrower than DynamoDB's native `LastEvaluatedKey` — the cursor cannot be used as a DDB pagination key at all, which sidesteps the entire class of "craft a cursor to query a different partition" attacks. The user-scope assertion at L60-64 closes R3 cleanly. This is a good deviation from the `_infrastructure.ts:decodeCursor` pattern used by diary/images (which does trust a DDB LastEvaluatedKey), and the deviation is correct for this endpoint.
- **Chronological merge is algorithmically straightforward**. All items go into `allItems`, then a single sort, then cursor-filter, then slice. No interleaved-merge algorithm to debug. At pilot scale the in-memory sort is trivial (O(N log N) on N ≤ ~400 items worst case), and `totalCount` is computed from `allItems.length` BEFORE pagination — exactly what the strategy doc's I7 + U1 tests assume.
- **Test pyramid is healthy for this phase**. Unit (repo-level): U1/U2/U3/U4/U5 + I4/I5 at unit level = 10 tests. Integration (route): I1-I10 = 15 test cases. Contract (schemas): C1/C2 = 18 test cases. Total 43 tests in 3 files (the commit says 59 assertions — matches "18 MUST + 4 SHOULD" test matrix from §9 of the strategy doc with E1 correctly deferred). Roughly 30% unit / 55% integration / 15% contract, skewed integration-heavy because the route is where Pi-auth / legacy-null / cursor-cross-user converge — appropriate.
- **`vi.clearAllMocks()` in `beforeEach` and `ddbMock.reset()`** prevent the cross-test state leak that's the #1 source of flakiness in repository tests using `aws-sdk-client-mock`. Noted.
- **`vi.hoisted` pattern for `ADMIN_EMAILS`** (me-activity.test.ts L14-16) correctly sequences before the app.ts import so `ADMIN_EMAILS_SET` builds with the test value. Subtle but right.
- **Deep-link builders use `encodeURIComponent` on every dynamic segment** — no XSS/SSRF concern even if a bed_id or farm_id ever contains `&` or `#`. The current ID generators (UUID-like strings) don't, but defense-in-depth.
- **Diff scope is minimal**: 9 files, 1 net new repo module, 1 new handler, 3 shared-package additions, 3 test files. No changes to auth middleware, no changes to error-serialization, no changes to other repos. Clean landing.
- **The Pi-auth JSDoc in `domain.ts:99-108`** (rewritten during Phase 1 remediation) correctly describes the MVP shared-JWT reality AND prescribes the Phase 3 reconciliation ("combining `uploaded_by = me` OR `bed belongs to a device where registered_by = me`") — which is exactly what the code now does. Contract and implementation are in sync.

## C4. Security sub-review

- **Cross-user pagination leak (R3)**: closed. `decodeActivityCursor` asserts `user_id === expectedUserId`; route passes `userId = getAuthContext(c).userId` (JWT sub, never query param). Verified by walking route → repo → decoder. I8 route test asserts 400 response; U5 unit test asserts the actual mechanism. Two layers of coverage.
- **Cursor tampering**: any mutation to the base64url payload that still decodes to valid JSON with wrong `user_id` → 400 (U5 tests two variants: random string, decoded plain JSON). Any mutation that decodes to a different user's `user_id` → 400 (U5 + I8). Any mutation to `type` → 400 if invalid enum value (U5 third test).
- **SSRF / injection in deep_link**: not a concern. Deep links are strings returned in the JSON body; the server never fetches them. `encodeURIComponent` is belt-and-braces.
- **Information disclosure**: minor — see SHOULD-FIX #1 about error messages.
- **Authentication bypass**: not possible. Route is mounted under `/api/v1/me/*` (confirmed by surrounding routes), which uses `authMiddleware`. The test I1 second case verifies 401 on missing token.
- **Authorization (admin-elevation)**: the endpoint is strictly self-scoped. No `userId` query parameter exists; no admin escape. I6 tests confirm.
- **Secrets in logs**: no `console.log` / `console.error` exposes the cursor or user id in `me-activity.ts` or `me.ts`.
- **Input validation**: limit bounded [1, 100]; cursor type-checked at Zod layer (`z.string().optional()`) and structurally validated in decoder. Good.

No MUST-FIX security findings.

## C5. Performance sub-review

The task brief already notes R5 ("fine at pilot scale, revisit post-pilot") as accepted. Verifying the code matches the stated stance:

- Fan-out: for each farm the user is a member of, one DDB query each for diary + devices, then N queries for N beds (one per bed's image range). Total per request: `2 × numFarms + numBeds` DDB queries. For a pilot user on 1 farm with 4 beds, that's 6 DDB queries per `/me/activity` request. Acceptable.
- The double-read of `getBedsForFarm(farmId)` adds +numFarms queries unnecessarily (SHOULD-FIX #3 above). Fixing it brings the cost to `2 × numFarms + numBeds + 1` per farm (since `getBedsForFarm` returns all beds in one query). Small win but easy.
- Pagination: the full three-source scan happens on EVERY page request (not just page 1). There's no Redis / DDB-cursor optimization — each page re-scans, re-sorts, then cursor-filters. This is an N² pattern in # of pages, but at pilot scale (most users will have <100 total activity items) one page is the whole set. Acceptable per R5; flag for revisit when pilot hits 50+ users or any single user exceeds ~500 activity items.
- No unnecessary `await` on independent promises. The `Promise.all` at L227-230 correctly parallelizes diary and device queries. The subsequent `queryImagesForUserInFarm` needs the device-derived `piBedIds` so it cannot be parallelized with the device query — that sequencing is correct.

## C6. Contract / consistency sub-review

- **Response envelope**: `{ items, next_cursor, total_count }` in snake_case — matches `ActivityFeedResponseSchema` at `packages/shared/src/schemas/index.ts:734-738`. I10 tests confirm at runtime.
- **Discriminated-union shape**: `ActivityItem` has a `type: 'diary'|'device'|'image'` discriminant; the Zod schema uses `z.discriminatedUnion('type', [...])`; TS type is a union of interfaces each with a literal `type` field. Frontend consumers (Phase 4) will narrow on `type` cleanly. C1 tests (11 cases) cover every required-field rejection and every valid shape.
- **Nullability policy**: `farm_name`, `actor_id`, `actor_name`, `bed_name` are `| null` in the TS type and `.nullable()` in Zod — consistent with the project convention (`created_by_name` on diary, etc.). `thumbnail_key: string | null` on image items matches the underlying `Image.thumbnail_key?: string` field's optionality-meets-nullability.
- **Phase 1 deferred #4 (uploaded_by_name resolution)**: **resolved** — see Positive observations above. The API resolves `actor_name` at repo-build time via one `getUserProfile(userId)` call.
- **Phase 1 deferred #5 (createImage spread-Omit audit)**: **still open** — escalated to SHOULD-FIX #4 above.

## C7. Safety approval

N/A. This change is:
- Not destructive (no deletes, no migrations, no schema version bumps — only new fields in new responses)
- Not irreversible (reverting `811910b` removes the route + repo + shared types cleanly; no data is stored by this feature)
- Not auth/authz-critical (uses existing authMiddleware; does NOT add new permission gates, does NOT relax existing ones)
- Not infra-touching (no CDK changes, no new DDB GSIs, no IAM changes)

No safety gate required.

## C8. Verification needed before tagging v0.99.7.3

- [ ] Decide whether SHOULD-FIX #1 (error-message leak) is in-scope for the v0.99.7.3 patch or deferred to v0.99.7.4. It's a trivial 2-line change and the I8 test won't break, so I lean toward "fold in".
- [ ] Decide whether SHOULD-FIX #3 (double `getBedsForFarm`) is in-scope. Larger churn (~15 LOC) but mechanical. Could defer, but it's the kind of small perf win that's cheaper now than later.
- [ ] Decide the fate of SHOULD-FIX #4 (Phase-1 deferred createImage audit). Either do it, or document the explicit deferral again in a comment on `images.ts:84` so it's not re-discovered by the next review.
- [ ] Add the missing I5-diary test (SHOULD-FIX #2). ~10 LOC, no risk, closes an otherwise quiet gap.
- [ ] Confirm full test suite still green: `pnpm -r test --run` and `pnpm -r typecheck`.
- [ ] Confirm the deep-link format `/beds/<bedId>?image=<imageId>` matches what Phase 4's frontend router will understand (this is a Phase-3/4 contract; worth a note in the issue thread before tagging).

## C9. Decision

**Status**: **ACCEPTED WITH CONDITIONS** — approved for tagging `v0.99.7.3` if SHOULD-FIX #1 and #2 are folded in (they're both <15 LOC, zero-risk, and close R3/R2 gaps more cleanly). SHOULD-FIX #3 and #4 can ship in v0.99.7.4 without reviewer pushback, as long as #4 is re-tracked rather than silently deferred for a fourth time.

Pipeline routing recommendation:
- **If v0.99.7.3 must ship today as-is**: accept all 4 SHOULD-FIX as known carry-over, tag, and file the remediation as the opening work of v0.99.7.4. No MUST-FIX, so there is no gating reason to block.
- **If v0.99.7.3 can absorb one short remediation cycle**: route to `/cc-remediate` → my-builder for SHOULD-FIX #1 and #2 (cheapest + best-leverage), re-review (2nd cycle), then tag. That's the preferred path if the schedule allows.

The 5 NITs can be addressed at the author's discretion any time.

---

# #462 Phase 4 review (2026-04-21)

> Scope: commit `e28fe5b` on `develop` — `feat(frontend): #462 Phase 4 — ProfileActivityList + useMeActivity`. 11 files, +1529/−3 LOC.
> Reviewer role: my-reviewer, read-only.
> Consumer: `/cc-remediate` → my-builder, if MUST-FIX present; else tag `v0.99.7.4`.
> Files reviewed (source): `src/frontend/src/components/ProfileActivityList.tsx` (new, 181 LOC), `src/frontend/src/lib/useMeActivity.ts` (new, 80 LOC), `src/frontend/src/lib/api.ts` (+19 LOC — `getMyActivity` at L723-738), `src/frontend/src/components/ProfileYouTab.tsx` (+3 LOC wire-up at L9 + L411), `src/frontend/src/i18n/en.json` (+33 LOC `profile.activity.*` sub-tree at L397-427), `src/frontend/src/i18n/ja.json` (+33 LOC matching sub-tree at L397-427), `tools/load-test/k6-baseline.js` (+60 LOC `meActivity` scenario).
> Files reviewed (tests): `src/frontend/src/__tests__/ProfileActivityList.test.ts` (new, 533 LOC — F1-F4, F6-F8, F11), `src/frontend/src/__tests__/ProfileActivityList.snapshot.test.ts` (new, 243 LOC — F9, F10), `src/frontend/src/__tests__/useMeActivity.test.ts` (new, 342 LOC — F5), `src/frontend/src/__tests__/__snapshots__/ProfileActivityList.snapshot.test.ts.snap` (new, 5 LOC — 2 snapshots).
> Auxiliary files consulted: `src/frontend/src/lib/hooks.ts` (placement comparison), `src/frontend/src/lib/api.ts:request` (auth wrapper contract), `packages/shared/src/types/domain.ts:344-353` (ActivityItem shape), `packages/shared/src/schemas/index.ts:719-738` (Zod), `src/api/src/services/repositories/me-activity.ts:73-190` (deep-link format source + trigger emission), `src/api/src/routes/beds.ts:286-358` (manual upload trigger-value constraint), `src/frontend/src/styles/` (CSS reference check), `.github/workflows/pr-checks.yml` (CI coverage).
> Strategy doc: `docs/TEST-STRATEGY-462.md` §5 (Phase 4 test matrix F1-F13) + §6 (cross-cutting risks R4 i18n, R5 perf).
> Phase 3 context: `docs/feedback/REMEDIATION-462-PHASE3.md` (createImage spread-Omit deferred to v0.99.7.4).

## D1. Overview — verdict summary

The deliverable faithfully implements Phase 4 per §5 of the test strategy and consumes Phase 3's endpoint cleanly. Zod validation at the boundary, opaque-cursor handling, i18n parity (EN + JA), and the discriminated-union render path all look correct. 10 of 13 strategy-doc tests (F1-F11 excluding F5 = 8 MUST + F6 + F9 + F10 = 3 SHOULD) are present; F12 + F13 are correctly deferred to Playwright E2E scope. The k6 scenario closes the R5 perf-baseline gate.

**Two SHOULD-FIX findings worth attention before tagging v0.99.7.4:**
1. The `image_manual` i18n key + its component branch are **unreachable with real server data** — the discriminator (`trigger` field) only carries `'scheduled' | 'motion'` and never `'manual'`. The tests fabricate `trigger: 'manual'` to hit the branch; production never will. This is either dead code + dead translations, or a latent UX bug where manually-uploaded images get labeled "Pi capture on ..." incorrectly.
2. The CSS classes referenced by the component (`profile-activity`, `activity-list`, `activity-item`, `activity-item__link`, `activity-item__icon`, `activity-item__body`, `activity-item__summary`, `activity-item__meta`, `activity-item__time`, `activity-item__dot`, `activity-item__farm`, `activity-skeleton`, `activity-skeleton__line`, `activity-error`, `activity-empty`, `activity-footer`, `activity-count`) are **defined nowhere in the CSS layer**. The component will render but be visually unstyled (no grid layout, no spacing, no skeleton shimmer) except for the inline-style overrides and inherited `btn-secondary` / `auth-server-error__icon` / `sr-only` helpers.

Neither rises to MUST-FIX because: (1) the unreachable branch doesn't cause incorrect behavior in any current code path (the component silently produces labels for the two valid cases that exist); (2) the missing CSS degrades visual polish but not functionality — accessibility and text flow are intact via HTML semantics.

No MUST-FIX security or correctness issues. Zod validation is sound, the opaque cursor is round-tripped verbatim, `loadMore()` re-entry is correctly guarded, `retry()` does reset `items` on success, and i18n parity is tight.

## D2. Findings

### MUST-FIX

**None.**

After auditing the component, hook, i18n deltas, tests, and k6 scenario against the my-reviewer checklist, no blocking issues exist. The cross-cutting risks R4 (i18n drift) and R5 (perf baseline) are each guarded — R4 by F9/F10/F11 + matching EN/JA key structure, R5 by the k6 `meActivity` scenario with a p(95)<1500ms threshold tied to pilot-scale fan-out.

| Check                                                    | Verdict |
|----------------------------------------------------------|---------|
| Zod `safeParse` path: rejects invalid shapes without masking fetch errors | Pass — `parse_error` and `fetch_error` are distinct error codes; finally block still clears loading state (`useMeActivity.ts:44-59`) |
| `hasMore = next_cursor !== null` derivation | Pass — matches server contract (server only emits `null` when no more pages; server-side `""` is impossible per `me-activity.ts:302-305`) |
| Deep-link format matches server (`*.deep_link` field) | Pass — component at L78 just renders `item.deep_link` verbatim; zero UI-side URL construction; server builders at `me-activity.ts:73-83` use `encodeURIComponent` per Phase 3 review |
| `loadMore()` re-entry guard | Pass — `if (!cursor \|\| loading) return` (L70); Preact useCallback closes over current-render `loading`, not stale; safe for double-click |
| `retry()` resets items on success | Pass — `setReloadKey` triggers effect → `fetchPage(null, false)` → `setItems` with `append=false` replaces wholesale at L50 |
| No auth logic in component | Pass — delegated to `request()` wrapper which handles Bearer injection + 401 refresh + login redirect |
| Error surface is generic i18n key | Pass — component renders `t('profile.activity.error')` = "Couldn't load activity" / "読み込めませんでした"; no server-message echo |
| All user-visible strings via `t()` | Pass — every rendered text token (title, empty, loading, error, retry, load_more, icon aria-labels, summaries, time suffix) goes through `t()` |
| EN + JA structural parity | Pass — both locales have identical `profile.activity.*` key tree (title, empty, loading, error, retry, load_more, item.{diary,device,image}.icon_label, time.{just_now,m_ago,h_ago,d_ago}, summary.{device_registered,image_scheduled,image_motion,image_manual}) |
| JA translations are real (not placeholders or EN fallbacks) | Pass — each string is native Japanese (e.g. "アクティビティ", "まだアクティビティはありません", "読み込めませんでした", "再試行", "さらに読み込む") |
| `diary.categories.*` already present in both locales | Pass — en.json:893-903, ja.json:893-903 have all 10 category keys (seeding, planting, watering, fertilizing, harvesting, weeding, pest_control, maintenance, purchase, other) |
| No secrets / PII in component or hook | Pass — userId is never rendered client-side; actor_name is optional and safe |
| Tests deterministic | Pass — `vi.useFakeTimers()` + `vi.setSystemTime()` fix relative time; `vi.mock` stubs hook and api module; no real network |

### SHOULD-FIX

| # | File:Line | Issue | Why it matters | Suggested remediation |
|---|-----------|-------|----------------|----------------------|
| 1 | `src/frontend/src/components/ProfileActivityList.tsx:62-70` + `src/frontend/src/i18n/en.json:425` + `ja.json:425` | The `image_manual` branch (`"Uploaded to"` / `"手動アップロード:"`) is **unreachable with production data**. The discriminator `item.trigger` is typed as `TriggerType = 'scheduled' \| 'motion'` (`packages/shared/src/types/domain.ts:22`) and constrained by `TriggerTypeSchema = z.enum(['scheduled', 'motion'])` (`packages/shared/src/schemas/index.ts:27`). POST /beds/:bedId/images validates client input against `isValidTriggerType` and rejects any other string (`routes/beds.ts:315-317`). Every image in DDB has either `trigger='scheduled'` or `trigger='motion'`, so the fallback branch's `image_manual` key can never fire. The tests (`ProfileActivityList.test.ts:145`, `ProfileActivityList.snapshot.test.ts:119`) fabricate `trigger: 'manual'` to hit the branch — but that's test-only fiction. | Two independent sub-problems: (a) dead code + dead i18n (minor waste), (b) **latent UX bug**: a user who manually uploads an image through the UI with `trigger='scheduled'` will see it labeled "Pi capture on Bed A1" — misleading. The design intent, based on the `image_manual` key's existence, clearly was to distinguish manual-upload from Pi-capture. The component fails to implement that distinction. | Pick one: **(a)** Implement the intended semantic: `image_manual` fires when `item.uploaded_by === item.actor_id` (i.e. the image row shows the caller as both uploader and actor — manual UI upload). The `trigger` field then only chooses between `image_scheduled` and `image_motion` for the non-manual case. Requires `uploaded_by` to be on the `ImageActivityItem` (currently isn't — only `actor_id`/`actor_name` are). **(b)** Remove the unreachable branch + delete the `image_manual` EN + JA keys + update tests to use `trigger: 'motion'` instead of `trigger: 'manual'` (Phase 4 still has valid MUST/SHOULD coverage). **(c)** Document the semantic gap as a known limitation and ship as-is, tracking (a) as a v0.99.8 UX item. The minimum-risk path for shipping v0.99.7.4 is (b) — removes dead code — but (a) is the correct long-term fix. |
| 2 | `src/frontend/src/styles/components.css` (and `global.css`, `auth.css`) — none of them | The 17+ CSS classes the component emits (`profile-activity`, `activity-list`, `activity-item`, `activity-item__link`, `activity-item__icon`, `activity-item__body`, `activity-item__summary`, `activity-item__meta`, `activity-item__time`, `activity-item__dot`, `activity-item__farm`, `activity-skeleton`, `activity-skeleton__line`, `activity-error`, `activity-empty`, `activity-footer`, `activity-count`) have **zero definitions in the styles directory** — `grep -r "activity-item\|profile-activity" src/frontend/src/styles/` returns nothing. The component renders with only its inline-`style` rules on the `<section>`, `<h3>`, `<ul>`, `<div class="activity-footer">`, and `<div class="activity-empty">` elements. Items get list layout from the `<ul>`'s inline `display:flex; flex-direction:column; gap:var(--space-2)`, but items themselves (the `<li>`, icon, body, summary, meta, time, dot, farm-name) have zero CSS rules. | Cosmetic degradation: the activity list will visually be a plain stacked list with no icon sizing, no meta-line alignment, no skeleton shimmer animation, no error-container padding. Reads fine for a screen reader (the HTML semantics and inline styles cover layout basics), but does NOT match the visual polish of other profile sections. Also misleading for future contributors: the class tokens look like they reference a styled component library that doesn't exist. | Add a CSS block to `src/frontend/src/styles/components.css` covering at minimum: `.activity-item` (flex row), `.activity-item__icon` (size + alignment), `.activity-item__body` (flex 1), `.activity-item__summary` (font weight, line-clamp), `.activity-item__meta` (secondary color, gap), `.activity-skeleton__line` (shimmer animation or solid gray block), `.activity-error` (padding + color), `.activity-empty` (already has inline styles — confirm or consolidate), `.activity-footer` (already has inline styles). ~40 lines of CSS. Alternatively, if the intent was inline-only (like `ChangePasswordSection`), drop all the class-name references and keep only the inline styles; then adjust tests to assert on data attributes / element structure instead of class names. |

### NIT

| # | File:Line | Issue | Rationale for NIT severity |
|---|-----------|-------|---------------------------|
| N1 | `src/frontend/src/lib/useMeActivity.ts:44-47` | When `safeParse` fails, `parsed.error` (ZodError with detailed path info) is discarded and the user only sees a generic `'parse_error'`. Observability gap: in production, a schema drift between server and client can't be diagnosed from user reports without server logs. A `console.warn('[useMeActivity] parse failed', parsed.error.issues)` (dev-only via `import.meta.env.DEV`) would help. | Dev-facing telemetry only; no user impact; consistent with the rest of the frontend's "fail generically" pattern. Optional. |
| N2 | `src/frontend/src/components/ProfileActivityList.tsx:14-22` | `relativeTimeSuffix` recomputes via `Date.now()` on every render. For each item, `RelativeTime` runs a division + comparison chain. At 20 items × a few renders per interaction this is unmeasurable, but if the component ever ends up in a parent that re-renders frequently (e.g. on typing in a neighbouring form), it becomes O(n) busywork per keystroke. `useMemo` keyed on `iso + current-minute-bucket` would avoid recomputing when the numbers haven't changed. | Pilot-scale no-op. The strategy doc's R5 risk is covered by k6, not by per-render memoization. Flag only as future-proofing. |
| N3 | `src/frontend/src/lib/useMeActivity.ts` | Placement: the file sits as its own module (`lib/useMeActivity.ts`) rather than in `lib/hooks.ts`. The commit message flags this as deliberate. Looking at `lib/hooks.ts`: it's a grab-bag of localStorage utilities, *non*-hook "useX" misnamed helpers (`useLocalFarmId` reads localStorage synchronously without `useState`), and a `formatTemp` formatter. It is NOT a preact-hooks module in the React sense. Placing a real hook in its own file is arguably cleaner than cramming it into that file. Matches the codebase's "one concept per file" lib-dir convention (e.g. `diary.ts`, `status.ts`, `device-config-status.ts`). | No action needed — the choice is defensible. Flag only to acknowledge the commit message's self-awareness on it. |
| N4 | `src/frontend/src/components/ProfileActivityList.tsx:14-22` | `relativeTimeSuffix` never emits "week / month / year" — an item 90 days ago renders `90d ago`. For pilot scale this is fine (most users will see items from the last week). Post-pilot with years of history this gets ugly. Not a correctness issue; tracks to a future v1.0+ enhancement. | Scope is clearly pilot-level; a format like "2w ago / 3mo ago / 1y ago" is a v0.99.8 polish item. Out of Phase 4 scope. |
| N5 | `src/frontend/src/components/ProfileActivityList.tsx:43-47` | `iconLabel` returns a single "Image" label for all three image states (scheduled / motion / manual). A more informative aria-label would distinguish "Pi capture" / "Motion capture" / "Manual upload" for screen-reader users. The visual summary text already carries that distinction, so assistive users get the info from the summary below the icon — but a dedicated icon_label differentiation would be friendlier. | Accessibility best-practice, not a correctness issue. Pairs naturally with SHOULD-FIX #1's remediation. Optional. |
| N6 | `src/frontend/src/lib/useMeActivity.ts:65-67` | `useEffect(() => { void fetchPage(null, false); }, [fetchPage, reloadKey])` — `fetchPage` is itself memoized against `[initialLimit]`, so the effect deps collapse to `[reloadKey]` in practice. This is fine but the `fetchPage` dep is technically redundant noise; `useCallback`-returned reference stability means React treats it as unchanged across renders. | Stylistic; the lint rule `react-hooks/exhaustive-deps` typically demands `fetchPage` in the array, so removing it would fight the linter. Leave as-is. |
| N7 | `src/frontend/src/__tests__/ProfileActivityList.test.ts:145` + `.snapshot.test.ts:119` | Test fixtures set `trigger: 'manual'` which violates the `TriggerType` constraint. See SHOULD-FIX #1 — if the unreachable branch is removed per option (b), the fixtures must also change. If kept per options (a)/(c), the fixtures still need reconsideration because `'manual'` is not a valid discriminator value. | Coupled to SHOULD-FIX #1's resolution path. |

## D3. Positive observations

- **Zod validation is correctly placed at the network boundary** — `ActivityFeedResponseSchema.safeParse(raw)` in `useMeActivity.ts:44` runs before the hook mutates state. A schema-broken server response surfaces as `'parse_error'` instead of rendering garbage. This is exactly the right posture for a typed frontend consuming a typed API via JSON.
- **Opaque cursor handling is impeccable**. `next_cursor` is passed through `getMyActivity({cursor})` verbatim and never inspected. R3 mitigation (which lives on the server per Phase 3's `decodeActivityCursor`) is preserved end-to-end.
- **Deep-link format is consumed from the server field, not re-constructed on the client**. Component just renders `item.deep_link`. Zero URL-construction logic on the UI side → zero risk of UI-side URL mangling. If the server ever changes the link format, the UI just keeps working.
- **i18n coverage is thorough and linguistically real**. JA strings are fluent native Japanese (not MT-grade). `diary.categories.*` reuse is noted and verified present in both locales. `profile.activity.*` key tree is structurally identical between `en.json` and `ja.json`. R4 (EN/JA drift) is well-guarded.
- **F11 test is the strongest i18n guard the codebase has**. 16 assertions that specifically check for absence of EN bleed-through AND presence of JA strings. If a future contributor adds a raw English literal to the component, F11 will catch it even if the component still "works".
- **F9 + F10 snapshot pair with a structural-skeleton comparator** — `structuralSkeleton()` strips text and aria-label (locale-sensitive) but preserves everything else, then asserts the skeleton is byte-for-byte identical between EN and JA. This is a clever and cheap way to guarantee structural parity.
- **k6 `meActivity` scenario** fills the R5 gate: exercises first-page AND one load-more cycle, so the fan-out cost is captured in both cold and warm states. The 1500ms threshold is well-calibrated: above hot-path (1000ms) because of the multi-source fan-out, below admin-stats (5000ms) which is a known scale-cliff. Scenario naming (`me-activity`) matches the dash-case convention of `cold-path`, `hot-path`, `admin-stats`. Tags + `http_req_duration{scenario:me-activity}` threshold are wired correctly.
- **Hook return-shape test (useMeActivity.test.ts:205-263)** guarantees the public API surface doesn't drift silently. Eight keys asserted.
- **Mocking strategy is idiomatic**. `vi.mock('../lib/useMeActivity', () => { const mockFn = vi.fn(); return { useMeActivity: mockFn }; })` is hoisted above component import via Vitest's auto-hoisting of `vi.mock` — enables `mockReturnValue` per-test without polluting module-level state. Clean.
- **Fake timers pattern is correct**: `vi.useFakeTimers() + vi.setSystemTime(SYSTEM_TIME)` in `beforeAll`, `vi.useRealTimers()` in `afterAll`. Timestamps are chosen relative to the anchor so "5m ago" etc. are deterministic.
- **Wire-up in `ProfileYouTab` is minimal** — 3 lines (1 import + 1 render insertion + no prop plumbing because the new component is self-fetching). This is the right shape: self-contained embeddable.
- **Component composition is idiomatic for the codebase**. Hooks at top, helper functions in module scope, JSX last. Uses inline `style` with CSS custom properties (matches `ProfileYouTab`'s own `ChangePasswordSection`). Uses emoji for icons (matches the project's established "📔 / 📡 / 📷" motif per commit context).
- **No regressions on Phase 1 or Phase 3**. `uploaded_by` / `registered_by` fields, `/me/activity` endpoint, and Phase 3 SHOULD-FIX remediations are all untouched. Phase 4 strictly adds; it doesn't edit anything in Phase 3 territory.

## D4. Security sub-review

- **No new auth surface**: component relies on the existing `request()` helper in `api.ts` which handles Bearer injection + 401 refresh + login redirect. Hook never touches tokens directly.
- **No injection vectors**: component's only interpolations are `item.deep_link` into `href` (server-built via `encodeURIComponent`), `item.node_name` / `item.bed_name` / `item.farm_name` / `item.description` into text nodes (Preact auto-escapes). No raw-HTML sinks, no `innerHTML`, no `eval`.
- **No secrets in logs**: no `console.log` / `console.error` in either the component or the hook. `parse_error` is silent (no telemetry), see N1.
- **Error surface confidentiality**: generic i18n keys, never server message. Matches Phase 3 SHOULD-FIX #1's mitigation on the server (though Phase 3's remediation chose a specific-message path; the UI's generic path does not leak that back regardless).
- **XSS via `item.description`**: if a malicious diary description contained script-tag markup, Preact escapes it to text. Verified by the rendering path `{summaryFor(item)}` → text node, not raw HTML.
- **No timezone or clock leak**: `Date.now() - new Date(iso).getTime()` is a pure numeric diff; the ISO timestamp is UTC; the difference is timezone-independent. No Intl.DateTimeFormat or timezone API that might leak locale.
- **No CORS assumptions**: `getMyActivity` uses the same `request()` helper as every other authenticated endpoint. Nothing hard-coded about origins.

No MUST-FIX security findings.

## D5. Performance sub-review

- **Zod `safeParse` per page**: on a 20-item response with a discriminated-union schema, safeParse performs ~20 × (4 base fields + 3-6 specialised fields) = ~100-200 field validations per page. At ~1µs per field in modern V8, ~100-200µs total — imperceptible. Even at 100 items it's well under 1ms. Not a concern at pilot scale; flag only as a future polish (N2).
- **Per-render `Date.now()` in `relativeTimeSuffix`**: called once per item per render. 20 items × sub-µs arithmetic = imperceptible. If the parent component re-renders on every keystroke in an adjacent input, this becomes 20 × keystrokes sub-µs = still imperceptible. Memoization would reduce re-work but is pure optimization.
- **No unnecessary refetch on `loadMore`**: the re-entry guard (`if (!cursor \|\| loading) return`) correctly prevents double-fetches on rapid clicks. React batches the state updates from `fetchPage`'s setters.
- **k6 threshold well-calibrated**: `p(95)<1500ms` has pilot headroom (Lambda cold starts typically 500-1000ms) while still flagging a real regression. Lower than admin-stats's 5000ms because `/me/activity` is called interactively and user-facing.
- **k6 scenario structurally correct**: 5 VUs × 90s = ~450 requests; tests both page 1 (cold) and page 2 (warm) fan-out; tags `scenario=me-activity` correctly; latency `Trend` metrics `me_activity_first_page_duration` and `me_activity_load_more_duration` will give per-stage breakdown.

## D6. Contract / i18n sub-review

### Contract
- **Response envelope consumption**: hook destructures `body.items`, `body.next_cursor`, `body.total_count` from the Zod-parsed object — all three are required fields in the schema. `next_cursor` is `.nullable()` → matches TS `string | null`. `total_count` is `z.number().int().nonnegative()` → matches `number`. Perfect alignment.
- **Discriminated-union render**: component narrows on `item.type` ∈ `'diary' | 'device' | 'image'`. If a future `ActivityItemType` (e.g. `'tag'`) is added, TS exhaustiveness won't catch it (the component falls through to the image branch). Low risk today (domain.ts defines only 3).
- **Deep-link format**: UI renders server-built string; zero contract surface on the UI side.
- **`getMyActivity` query string**: `URLSearchParams` correctly encodes `cursor` and `limit`. `cursor=` is only appended when truthy (guards against empty-string cursor appending a stray `?cursor=`).

### i18n (R4)
- **Key-tree parity**: en.json L397-427 and ja.json L397-427 are byte-for-byte parallel in key structure. Manually diffed — no missing keys in either direction.
- **Component has zero raw English literals**: every text token goes through `t()`. F11 test enforces this for the most common strings. An automated "grep for anything between `>` and `<` that looks like English words" would give broader coverage but is a general-linting issue, not Phase 4-specific.
- **`diary.categories.*` reuse (from `summaryFor`)**: the component leverages the existing `diary.categories.watering` etc. keys. Both locales have all 10 categories (en.json:893-903, ja.json:893-903). No missing key risk.
- **Time suffix formatting**: renders `{n}{t(unitKey)}` without interpolation (i18n.ts doesn't support `{0}` placeholders here). EN key values are `"m ago"`, `"h ago"`, `"d ago"` — concatenation produces `"5m ago"`, `"2h ago"`, `"1d ago"` which reads naturally. JA values are `"分前"`, `"時間前"`, `"日前"` — concatenation produces `"5分前"`, `"2時間前"`, `"1日前"` which also reads naturally. Good call to design around concatenation rather than i18n interpolation.
- **JA strings are real translations, not placeholders**: spot-checked "アクティビティ" (activity), "まだアクティビティはありません" (no activity yet), "再試行" (retry), "さらに読み込む" (load more), "自動撮影" (automatic capture = Pi capture), "動体検出" (motion detection), "手動アップロード" (manual upload) — all are native Japanese phrasing.

## D7. Safety approval

N/A. This change is:
- Not destructive (no deletes, no migrations, no schema bumps — only new UI component + new hook + additive i18n keys)
- Not irreversible (reverting `e28fe5b` removes the 11-file diff cleanly; no data stored by this feature)
- Not auth/authz-critical (uses existing `request()` auth wrapper; does NOT add new permission gates, does NOT relax existing ones)
- Not infra-touching (no CDK, no new IAM, no new DDB indexes, no new Lambda; the k6 scenario is a tools-only addition — executable against staging out-of-band, not wired into any deploy pipeline)

No safety gate required.

## D8. Verification needed before tagging v0.99.7.4

- [ ] Decide on SHOULD-FIX #1 (`image_manual` dead branch + keys): option (a) semantic fix, (b) delete dead code, or (c) accept known-limitation and defer. I lean toward (b) for v0.99.7.4 and (a) as a v0.99.8 tracked item, because (a) requires adding `uploaded_by` to the ImageActivityItem type (server-side change), which is more than a frontend-only patch.
- [ ] Decide on SHOULD-FIX #2 (missing CSS classes): add ~40 lines of CSS in `components.css`, OR delete the class-name references and rely on inline styles + data attributes. The snapshot tests currently assert on class names, so option-to-delete requires updating snapshots too.
- [ ] Decide on the Phase 3 carry-over (createImage spread-Omit, tracked as #19 pending): explicitly closed or re-deferred for the third cycle. It's a SEPARATE task from Phase 4 per the review brief, but since v0.99.7.4 is the version the carry-over was promised to, it should be closed or re-tracked now. Not a Phase 4 blocker.
- [ ] Run the test suite: `pnpm -r test --run` should show 1135 tests passing (1067 + 68 new).
- [ ] Run `npx astro check` (or `npx tsc --noEmit` scoped to `src/frontend/src`) once to verify the `trigger: 'manual'` test-fixture type violations are the only TS errors, and that no production code has any new TS errors.
- [ ] If CSS is added (SHOULD-FIX #2): run `npm run build -w src/frontend` to confirm Astro bundles the new rules.
- [ ] Manual visual check on Profile → You tab with seeded activity data to confirm the component doesn't look broken. (The missing CSS is the main visual risk.)

## D9. Decision

**Status**: **ACCEPTED WITH CONDITIONS** — approved for tagging `v0.99.7.4` if SHOULD-FIX #2 (missing CSS) is addressed, either by adding the ~40 lines of CSS or by removing the unused class names. Shipping the component with no CSS would be a visible-polish regression on a user-facing page.

SHOULD-FIX #1 (unreachable `image_manual` branch) is acceptable to defer if a known-limitation note is added somewhere traceable (commit message, PLANS.md, or a code comment) — the UX gap is real but low-severity, and the right fix is not frontend-only. Pipeline routing recommendation:

- **If v0.99.7.4 must ship today**: route to `/cc-remediate` → my-builder for SHOULD-FIX #2 minimum (deletion path is fastest: ~5 LOC + snapshot regeneration). SHOULD-FIX #1 as a tracked follow-up with either option (b) in v0.99.7.5 or option (a) escalated to my-architect for an ADR-worthy semantic decision.
- **If v0.99.7.4 can absorb one short cycle**: `/cc-remediate` handles SHOULD-FIX #1(b) + #2 together. Deletes the dead branch + keys + test fixture, then regenerates snapshots. One reviewer re-pass. Ship.

The Phase 1 carry-over (createImage spread-Omit audit) is still open per task #19, but as noted in the review brief and confirmed by `REMEDIATION-462-PHASE3.md:43-48`, this is expected carry-over, not a Phase 4 blocker. Flag it for v0.99.7.4's remediation sweep if that remediation happens; otherwise re-track to v0.99.7.5.

The 7 NITs can be addressed at the author's discretion any time.

---

# Review Findings — Stream 1 Hardening (2026-04-23)

> Scope: Stream 1 Hardening diff since commit `d1884da` on `develop`.
> Baseline: 1135 vitest tests passing; verified green three times (pre-edits, post-#448 + #464, post-simplify).
> Reviewer policy: `.agent/subagents/my-reviewer.md`.
> Pipeline stage: `/simplify` ✅ → `/cc-review` ← **here** → `/cc-remediate` (conditional) → `/cc-test`.

## S1. Scope reviewed

| File | Change | Issue |
|------|--------|-------|
| `src/frontend/src/components/ProfilePage.tsx` | Reduced 512 → 394 lines via hook extraction | #445 |
| `src/frontend/src/lib/useProfileSettings.ts` | NEW — 143 lines | #445 |
| `src/frontend/src/lib/usePendingRegistration.ts` | NEW — 79 lines | #445 |
| `src/frontend/src/pages/help/device-setup.astro` | +41 lines (2 troubleshooting entries + time pill) | #464 |
| `docs/ops/INCIDENT-DRILLS.md` | NEW — quarterly tabletop drills doc | #448 |
| `docs/reports/LOAD-TEST-BASELINE.md` | Pre-run checklist + 4-scenario template | #443 |
| `tools/load-test/README.md` | 4-scenario + me-activity threshold | #443 |

Code-simplifier pass already ran — no simplifications were deemed worth making.

---

## S2. MUST-FIX findings

**None.**

Full my-reviewer checklist pass. Findings breakdown:

| Check                                                            | Verdict |
|------------------------------------------------------------------|---------|
| Alignment with Stream 1 scope (R-001 + R-011 + R-008+ patches)  | ✅       |
| No auth bypass or privilege escalation surface                    | ✅ (client-side gating only; server-side authz out of diff) |
| No secrets / credentials exposed                                  | ✅       |
| No new XSS / injection vectors                                    | ✅       |
| Input validation at trust boundaries                              | ✅ (`isValidLocale`, `'C'/'F'` literal guards, `pendingRole` enum check) |
| Tests cover new hooks' behavior                                   | ✅ (1135/1135; hook extraction is pure refactor — no new code paths) |
| Rollback: each file is independently revertible                   | ✅       |
| No auth/authz modifications                                       | ✅       |
| No destructive / irreversible operations                          | ✅       |

---

## S3. SHOULD-FIX findings

| # | File:Line | Issue | Severity |
|---|-----------|-------|----------|
| 1 | `src/frontend/src/pages/help/device-setup.astro:434, 463` | New `<kbd>` tags are the only `<kbd>` usage in the entire frontend. No CSS rule exists for `kbd`, so browsers render them in bare monospace with no background/padding — visually disjoint from the `.help-section code` style (gray-100 bg, `radius-sm`, padding) that appears in the same `<dd>`. Inconsistent polish on a user-facing help page. | SHOULD-FIX |

---

## S4. Suggestions (SUGGESTION)

- **S1** — `src/frontend/src/lib/usePendingRegistration.ts:52`: `if (p.is_admin) setIsSystemAdmin(true)` writes only the truthy case, asymmetric with `setCachedIsAdmin(p.is_admin === true)` on line 53. Not reachable today (mount-once), but tightens against future re-invocation.
- **S2** — `docs/ops/INCIDENT-DRILLS.md:72, 81`: Template points drill logs at `docs/ops/drill-logs/YYYY-QN-<slug>.md`, but that directory doesn't exist. First drill author will `mkdir` before commit — minor friction. Consider `.gitkeep` or mention in post-drill checklist.
- **S3** — `src/frontend/src/lib/useProfileSettings.ts:111`: `console.error('[settings] sync failed — API may not be deployed', err)` logs the full error object. Fetch errors typically don't contain PII but could expose endpoint paths to anyone reading devtools. Narrow to `err?.message ?? 'unknown'` for defense-in-depth. Pre-existing from refactor, not a regression.

---

## S5. Verified clean (positive findings)

1. **`applyFarmLocaleIfUnset` is a faithful refactor, not a regression.** Diffed against `git show d1884da:src/frontend/src/components/ProfilePage.tsx` lines 119-127. Pre- and post-refactor execute identical side effects (`setLocale` + `localStorage.setItem` + `setAttribute('data-locale')`) with identical gating. Neither version dispatches `locale-changed` or sets `lang` on auto-apply — behavior preserved bit-for-bit.
2. **Hook API surface stable.** `useProfileSettings` exports `{ locale, tempUnit, applyLocale, applyTempUnit, applyFarmLocaleIfUnset }`; `usePendingRegistration` exports `{ displayName, setDisplayName, profilePictureUrl, isSystemAdmin, preferredRole }`. Both mirror exactly what ProfilePage consumes; no broader surface leaked. `applyFarmLocaleIfUnset` is the narrowest escape hatch that avoids re-exposing `setLocale`, honoring the resume-anchor design constraint.
3. **Bilingual EN/JA element-order parity** in `device-setup.astro`: 6 `<dt>` (EN) + 6 `<dt>` (JA) = 12, at matching positions. Time-pill appended to both h2s at the same position. File-header constraint respected.
4. **INCIDENT-DRILLS.md anchor slugs** are a perfect 1:1 match with RUNBOOKS.md section headers (verified mechanically). Zero link rot.
5. **`settingsDirty` ref correctly gates in-flight settings sync** — user-choice wins if `applyLocale` is called during the mount-effect's `getMySettings` round-trip.
6. **No stale imports, unused state, or dead code** in the 394-line `ProfilePage.tsx`. Code-simplifier pass independently confirmed.
7. **Doc-only changes coherent** — SLO thresholds agree between `LOAD-TEST-BASELINE.md` and `tools/load-test/README.md` (hot-path p95 < 1000ms, cold-path p99 < 3000ms, admin-stats p95 < 5000ms, me-activity p95 < 1500ms).

---

## S6. Recommendations

### SHOULD-FIX #1 — `<kbd>` styling

Two options; prefer A:

**Option A** — add a `.help-section kbd` rule matching the adjacent `code` treatment (with border + shadow for key-cap cue):

```css
.help-section kbd {
  font-family: var(--font-family-mono, ui-monospace, Menlo, monospace);
  font-size: 0.92em;
  padding: 1px 6px;
  border-radius: var(--radius-sm);
  background: var(--color-gray-100);
  color: var(--color-gray-900);
  border: 1px solid var(--color-gray-200);
  box-shadow: 0 1px 0 var(--color-gray-300);
}
```

**Option B** — swap `<kbd>` for `<code>` in both EN and JA `<dd>` blocks. Loses the semantic tag; zero new CSS. Not preferred — `<kbd>` is W3C-correct for keyboard shortcuts, and the five-line fix preserves semantics.

---

## S7. Safety approval

- [x] Impact understood: pure UI + docs diff. No auth / data / infra changes. Tests green throughout.
- [x] Rollback verified: each of the 7 files is independently revertible (3 new files can be deleted; 4 modified files revert cleanly to `d1884da`).
- [x] **Approved for execution: YES**, conditional on SHOULD-FIX #1 being routed through `/cc-remediate`.

---

## S8. Verification needed (handed to /cc-test)

- [ ] Full vitest run remains at 1135/1135 passing after any remediation
- [ ] `docs/ops/INCIDENT-DRILLS.md` renders cleanly on GitHub (anchor-link click test)
- [ ] `src/frontend/src/pages/help/device-setup.astro` renders correctly with locale toggle; kbd styling appears if SHOULD-FIX #1 Option A is applied
- [ ] Mobile layout at 320px — confirm `.help-section__time` pill doesn't break Section 5 header flex layout

---

## S9. Decision

**Status**: **ACCEPTED WITH CONDITIONS** — approved for the pipeline's next step (`/cc-remediate` for SHOULD-FIX #1) once the `<kbd>` styling is addressed. Suggestions S1–S3 are at author's discretion.

- **If remediation happens now**: route `/cc-remediate` → my-builder for SHOULD-FIX #1 (five-line CSS addition). Then `/cc-test` → final-suite confirmation.
- **If Stream 1 must ship as-is**: SHOULD-FIX #1 is a user-facing polish regression on a help page; not a blocker, but it should be tracked as a follow-up issue in the same release cycle. Suggestions S1–S3 can be deferred indefinitely without cost.

## S10. Issue integration note

PROJECT.yaml has `github_issues.auto_post: true`, but `gh auth status` reports "not logged into any GitHub hosts" in this DevContainer (upstream-template bug tracked in memory). Per cc-review skill policy, issue posting is **skipped** — findings live only here until the user manually mirrors them to #445 / #464 / #448 / #443 if desired.

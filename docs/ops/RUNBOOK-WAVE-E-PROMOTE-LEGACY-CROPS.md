# Wave E1 Migration — Promote Legacy Crops

> Created: 2026-04-29 | Issue: #279 (Stream 2 Wave E) | Status: staging done, prod done — Wave E2 soak window open
> Script: [`scripts/migrate-wave-e-promote-legacy-crops.ts`](../../scripts/migrate-wave-e-promote-legacy-crops.ts)
> Design: [`docs/design/DESIGN-279-bed-crop-1n.md §6`](../design/DESIGN-279-bed-crop-1n.md)

---

## TL;DR

This migration walks every `Bed` row in DynamoDB and writes a real `BedCrop` row carrying the legacy inline crop data. After it runs, the dual-read shim in `getActiveCropForBed` (`src/api/src/services/repositories/bed-crops.ts:140-156`) becomes dead code — its fallback branch should never fire on subsequent prod traffic. That's the entry condition for the **Wave E2 soak gate**, after which Waves E3 (delete the shim) and E4 (drop the inline `Bed.crop_*` columns) become safe.

It is **idempotent** (via the `created_from_legacy: true` marker) and **safe under concurrent runs** (via deterministic IDs of the form `promoted-<bedId>` instead of random UUIDs).

---

## Why this migration exists

### The data shape that's changing

Before #279, every `Bed` row carried its single crop **inline** as columns on the bed itself:

```
Bed row (PK=FARM#<id>, SK=BED#<row>#<col>#<bedId>):
  crop_type:        "tomato"           ← inline
  crop_variety:     "cherry"           ← inline
  planted_at:       "2026-03-15"       ← inline
  expected_harvest: "2026-06-01"       ← inline
  completed_at:     null               ← inline
```

That was a 1:1 relationship: one bed, one crop. If a user planted tomato in spring and wanted to follow with daikon in fall, they had to overwrite the same fields and lose the spring history.

After #279 (Waves A–D), crops live as **separate rows** joined back to a bed via FK:

```
Bed row:
  (no crop_* fields anymore — eventually, after Wave E4)

BedCrop row (PK=FARM#<id>, SK=CROP#<bedId>#<bedCropId>):
  bed_id:           "<bedId>"
  crop_type:        "tomato"
  crop_variety:     "cherry"
  planted_at:       "2026-03-15"
  expected_harvest: "2026-06-01"
  status:           "growing" | "harvested" | "failed" | "planned"
  created_from_legacy?: boolean       ← idempotency marker for this migration
```

A single bed can now hold multiple `BedCrop` rows over time — rotation, succession, intercropping all become first-class.

### The shim that keeps prod working today (without this migration)

Real prod has 100% legacy beds — no `BedCrop` rows had been written before this migration ran. If we'd shipped Wave C (the multi-crop UI) without a backwards-compatibility layer, every existing user would have seen their crops vanish.

So we shipped a **dual-read shim** at `getActiveCropForBed`. Pseudocode:

```
function getActiveCropForBed(bedId):
    # 1. Try the new shape first
    real = scan for CROP# rows belonging to bedId where status='growing'
    if real:
        return real

    # 2. Fall back: synthesize a virtual BedCrop from inline fields
    bed = get(bedId)
    if bed.crop_type and not bed.completed_at:
        return {
            id: "bed-legacy-" + bedId,    # virtual sentinel ID
            crop_type: bed.crop_type,
            ...
        }

    return null
```

The `bed-legacy-` prefix is a sentinel — calling code can detect "this is a virtual projection, not a real row" and adjust. Notable consumers:

- The diary's harvest auto-default (Wave D3) **skips** `bed-legacy-` IDs because writing to them would mutate a synthesized object that doesn't exist in DynamoDB.
- The "Complete cycle" button in `BedDetail.tsx` falls back to `PATCH /beds/:id` (which sets `completed_at` inline) instead of `PATCH /beds/:id/crops/:cropId`.

### Why the shim can't stay forever

1. **Inline + new = divergence risk.** If a user goes through the new flow and writes a real `BedCrop` with `status='growing'`, the inline `bed.crop_type` is still there. A future writer that doesn't know which one is authoritative can drift them apart.
2. **The schema can't evolve cleanly.** Adding a new field to crops means adding it both to inline `Bed` and to `BedCrop`. Two places to update, two places to forget.
3. **The type system can't help us.** `Bed.crop_type` is currently optional in an ambiguous way — optional because the bed's empty? Or optional because the new schema lives elsewhere? Until we drop the inline fields, every `Bed` consumer pays for that ambiguity.

The migration is the convergence step that ends the dual-shape state.

### Design choices, briefly

- **Deterministic ID `promoted-<bedId>`** — not random UUID. If two operators accidentally run the migration in parallel against the same table, they both compute the same target ID and write byte-identical content. DynamoDB's `PutItem` becomes a benign overwrite. With a random UUID, parallel runs would create *two* `BedCrop` rows for the same bed — and now you have a 1:N migration that itself created data drift. (R-E1-001 in the design doc.)
- **Distinct from the `bed-legacy-` virtual sentinel.** Promoted rows must read as REAL crops (not virtual projections), so D3's harvest auto-default attaches to them. The two prefixes are intentionally separate.
- **Idempotent via `created_from_legacy: true`.** Re-running the migration sees that marker on already-promoted rows and skips them. Safe to re-run any number of times.

---

## The five-step Wave E sequence

| Step | Status        | Description                                                                                                                                      |
| ---- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| E1 (code) | ✅ on `main`   | Migration script ships (commit `124c71d`). PR #469.                                                                                              |
| E1 (run)  | ⏳ in flight   | Operator runs the script against staging then prod. **This runbook covers this step.**                                                            |
| E2 (soak) | 🔒 gated on E1 | ≥ 14 days monitoring. Confirm `getActiveCropForBed`'s fallback branch (line 140-156) fires zero times in prod logs. Any hit blocks E3.            |
| E3 (delete) | 🔒 gated on E2 | Code change. Remove the fallback branch from `getActiveCropForBed`. After this, `bed.crop_type` is provably unread by the runtime.                |
| E4 (drop)   | 🔒 gated on E3 | Breaking release. Remove `crop_type` / `crop_variety` / `planted_at` / `expected_harvest` / `completed_at` from the `Bed` type and DDB rows.     |

Each step is independently revertible. If E2 surfaces a single fallback hit on day 13, we don't proceed to E3 — we investigate the hit, fix it, restart the soak.

---

## Operator runbook

### Pre-flight

1. **Confirm AWS identity** matches the target account:
   ```bash
   aws sts get-caller-identity
   ```
   Expect account `<AWS_ACCOUNT_ID>` (single account hosting both `litcrop-mvp` and `litcrop-prod`).

2. **Confirm both tables exist** in `ap-northeast-1`:
   ```bash
   aws dynamodb list-tables --region ap-northeast-1 \
     --output text --query 'TableNames[?starts_with(@, `litcrop`)]'
   ```
   Expect at least `litcrop-mvp` and `litcrop-prod`. (`litcrop-poc` is a stale legacy table; the script's hardcoded default of `TABLE_NAME=litcrop-poc` must NOT be used — always set `TABLE_NAME` explicitly.)

3. **Verify on `main` or a develop checkout that contains the migration**:
   ```bash
   git log --oneline --all | grep "Wave E step 1" | head -3
   ```

### Run order

Always: `staging-dry → staging-live → prod-dry → prod-live`. Skipping straight to prod-live means the first time the WRITE path is exercised against any real table is the production one — that turns a clean migration into a 14-day incident postmortem if anything is wrong.

```bash
# 1. Staging dry-run (read-only)
TABLE_NAME=litcrop-mvp DRY_RUN=1 npx tsx scripts/migrate-wave-e-promote-legacy-crops.ts

# 2. Staging live
TABLE_NAME=litcrop-mvp           npx tsx scripts/migrate-wave-e-promote-legacy-crops.ts

# 3. Spot-check staging app: open one promoted bed in BedDetail; confirm it shows
#    the same crop info it did before, now sourced from a real BedCrop row.

# 4. Prod dry-run (read-only)
TABLE_NAME=litcrop-prod DRY_RUN=1 npx tsx scripts/migrate-wave-e-promote-legacy-crops.ts

# 5. Prod live
TABLE_NAME=litcrop-prod          npx tsx scripts/migrate-wave-e-promote-legacy-crops.ts

# 6. Begin Wave E2 soak — monitor `getActiveCropForBed` lazy-materialize fallback
#    hits for ≥ 14 days. Zero hits = E2 verified, can proceed to E3.
```

### Expected output shape

The script prints, in order:
1. Header line with table + region + mode (DRY RUN | LIVE).
2. One line per malformed row that fails the `farm_id`/`id` guard (these are pre-existing data-quality issues; the script logs and continues).
3. `Scanned N bed rows across M page(s).` once the scan completes.
4. One `[DRY] PROMOTE …` or `[OK] PROMOTE …` line per bed that gets promoted.
5. A Summary block:
   ```
   Promoted          : N
   Skipped no-inline : N   (no crop_type to promote)
   Skipped completed : N   (completed_at is set)
   Skipped already   : N   (a previous run already promoted this bed)
   Skipped real-crop : N   (bed has a real BedCrop already)
   ```

`Promoted + Skipped[*] = total beds scanned (excluding malformed).`

### Sanity checks before going live

- **Promoted count looks reasonable** for the env (single-digits to low hundreds in staging; thousands in prod once we have real users).
- **No "Skipped already"** on a fresh run (would indicate someone else ran the migration first).
- **Crop names look real** (`tomato`, `cucumber`, `daikon`, `napa_cabbage`, etc.) — not test fixtures or sentinel values.

### What "live" actually does

For each bed that the predicate decides to promote, the script writes one `PutItem` with:
- PK = `FARM#<bed.farm_id>`
- SK = `CROP#<bedId>#promoted-<bedId>`
- The `BedCrop` shape carrying `crop_type` / `crop_variety` / `planted_at` / `expected_harvest` from the bed's inline fields
- `status: 'growing'`
- `created_from_legacy: true`

It does **not** modify the source `Bed` row. Inline fields stay untouched until Wave E4. That's deliberate — until E2 confirms the soak is clean, the inline fields remain the safety net.

---

## Recovery / rollback

If something goes sideways mid-run:

1. **Stop the script** (Ctrl+C or kill). The script processes beds one at a time with its own transaction boundary per `PutItem` — partial runs leave a partially promoted table, which is exactly the state a re-run handles correctly.
2. **Inspect the table**:
   ```bash
   aws dynamodb scan --table-name litcrop-prod --region ap-northeast-1 \
     --filter-expression 'attribute_exists(created_from_legacy)' \
     --query 'Items[].SK.S' --output text | head
   ```
3. **Re-run the migration** — the `created_from_legacy: true` marker ensures already-promoted beds are skipped. Idempotency.

If you need to **undo the migration** entirely (unlikely; this is here for completeness):
```bash
# Identify all promoted rows
aws dynamodb scan --table-name <TABLE> --region ap-northeast-1 \
  --filter-expression 'attribute_exists(created_from_legacy) AND begins_with(SK, :p)' \
  --expression-attribute-values '{":p":{"S":"CROP#"}}' \
  --query 'Items[].[PK.S,SK.S]' --output text > /tmp/promoted-rows.tsv

# Then DeleteItem each row individually (no batch undo on purpose; force you
# to look at the data before you destroy it). Inline Bed.crop_type fields are
# untouched, so the dual-read shim falls back as it did before E1 ran.
```

The shim's existence (`getActiveCropForBed` line 140-156) is what makes rollback survivable. **Do not delete the shim until E2 has soaked clean for ≥ 14 days.**

---

## Run history

### Staging (`litcrop-mvp`)

| When | Mode | Result |
| ---- | ---- | ------ |
| 2026-04-29 | DRY RUN | 20 scanned, 1 malformed (pre-existing data drift, skipped by guard), 13 promoted, 7 skipped (no inline) |
| 2026-04-29 | LIVE    | 20 scanned, 1 malformed (same row), 13 promoted (cherry_tomato, cucumber, eggplant, napa_cabbage, corn, watermelon, daikon, shiso, melon, sweet_potato, edamame, zucchini, green_onion), 7 skipped |

The malformed row is `PK=FIELD#72d44990-…  SK=BED#000001#ff55fc89-…` — an orphan from earlier schema iterations (`PK=FIELD#` instead of `PK=FARM#`). It was already invisible to the app; Wave E1 explicitly does not promise to fix data that pre-exists in a broken state. Filing a follow-up to clean it up is appropriate but not blocking.

### Production (`litcrop-prod`)

| When | Mode | Result |
| ---- | ---- | ------ |
| 2026-04-29 | DRY RUN | 20 scanned, 0 malformed, **0 promoted**, 20 skipped (no-inline) |
| 2026-04-29 | LIVE    | 20 scanned, 0 malformed, **0 promoted**, 20 skipped (no-inline) |

**Note on the 0-promoted outcome.** Prod first saw multi-crop functionality on 2026-04-28 via PR #469 (merge commit `58f84bc`). At the time the migration ran, all 20 prod beds had no `crop_type` set — neither legacy inline nor new `BedCrop` rows existed. The migration is therefore a no-op on prod, and that is the expected outcome for a fresh-prod scenario where real users have not yet planted anything.

**Wave E2 soak still applies.** The soak window watches the shim's fallback branch (`getActiveCropForBed` line 140-156) for any traffic that synthesizes a virtual `bed-legacy-*` projection. With 0 promoted, the shim has nothing to fall back FROM today — but new users could plant via the legacy inline path during the 14-day window (until E3 deletes the shim entirely). Soak clock starts 2026-04-29; eligible to proceed to E3 from **2026-05-13** onward, conditional on zero fallback hits.

---

## Related

- Design doc: [`docs/design/DESIGN-279-bed-crop-1n.md`](../design/DESIGN-279-bed-crop-1n.md), especially §6 (migration strategy) and §7 (phased plan).
- Migration code: [`scripts/migrate-wave-e-promote-legacy-crops.ts`](../../scripts/migrate-wave-e-promote-legacy-crops.ts) and the testable predicate/builder/orchestrator in [`src/api/src/services/migrations/wave-e-promote-legacy.ts`](../../src/api/src/services/migrations/wave-e-promote-legacy.ts).
- Tests: 19 cases in `src/api/src/services/migrations/__tests__/wave-e-promote-legacy.test.ts`, including R-E1-001 deterministic-id concurrency safety and T-E1-01/02 error-bubble regression locks.
- Roadmap memory: `~/.claude/projects/-workspace/memory/project_v099_v1_roadmap.md` (Stream 2 Wave E section).
- Resume anchor: `~/.claude/projects/-workspace/memory/project_279_waved_resume.md`.
- CHANGELOG entry: `[Unreleased]` section in [`CHANGELOG.md`](../../CHANGELOG.md).

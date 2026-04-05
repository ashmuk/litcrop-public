# Requirements: #273 — Bridge Diary Planting/Harvesting to Bed Crop Dates (M1)

**Issue:** [#273](https://github.com/ashmuk/litcrop/issues/273)
**Sprint:** Beta-8 — Crop Intelligence M1-M3 + UX
**Size:** S
**Step:** 1 — Requirements (cc-define)
**Date:** 2026-04-05
**Blocks:** #275 (M3 smart defaults), #276 (reserved vs actual UX)

---

## 1. Problem Statement

Users log "planting" and "harvesting" activities as diary entries, optionally linking them to a bed via `bed_id`. However, the bed's `planted_at` and `expected_harvest` dates are **never auto-updated** from diary data. This means:
- The CropTimeline Gantt chart shows no bars (requires both dates on the bed)
- Users must separately go to the Crops page and manually set dates on each bed
- Diary data and bed data are disconnected — the same planting event must be entered twice

## 2. Current State

### Diary → Bed gap
| Component | Has | Missing |
|-----------|-----|---------|
| DiaryEntry | `category: 'planting'`, `bed_id`, `date` | No side-effect on bed |
| Bed | `planted_at`, `expected_harvest` | Not auto-set from diary |
| POST /diary | Validates bed exists | Does not call `updateBed()` |
| PATCH /diary | Validates bed exists | Does not call `updateBed()` |
| CropTimeline | Renders `planted_at` → `expected_harvest` | Empty without manual bed dates |

### Key code locations
- POST diary: `diary.ts:141-218` — creates entry, validates bed, no bed update
- PATCH diary: `diary.ts:300-351` — updates entry, validates bed, no bed update
- updateBed: `dynamodb.ts:325-365` — already supports `planted_at`/`expected_harvest` SET/REMOVE
- getBedById: `dynamodb.ts:304-319` — returns bed with `farm_id`, `row`, `col`

---

## 3. Functional Requirements

### FR-1: Auto-set `planted_at` when diary entry has category=planting + bed_id
- After `createDiaryEntry()` succeeds in POST /diary:
  - If `category === 'planting'` AND `bed_id` is not null:
  - Call `updateBed(farm_id, bed_id, row, col, { planted_at: entry.date })`
- The bed already has `getBedById` result from validation (reuse it — avoid extra DB call)

### FR-2: Auto-set `expected_harvest` when diary entry has category=harvesting + bed_id
- After `createDiaryEntry()` succeeds in POST /diary:
  - If `category === 'harvesting'` AND `bed_id` is not null:
  - Call `updateBed(farm_id, bed_id, row, col, { expected_harvest: entry.date })`

### FR-3: Handle diary PATCH — sync dates on category or date change
- After `updateDiaryEntry()` succeeds in PATCH /diary:
  - If the updated entry has `category === 'planting'` AND `bed_id` is not null:
    - Call `updateBed(...)` with `{ planted_at: updated.date }`
  - If the updated entry has `category === 'harvesting'` AND `bed_id` is not null:
    - Call `updateBed(...)` with `{ expected_harvest: updated.date }`
- This covers: changing a date on an existing planting entry, or changing category to/from planting

### FR-4: Handle diary DELETE — clear bed date when bridged entry is deleted
- When a diary entry with `category='planting'` + `bed_id` is deleted:
  - Call `updateBed(...)` with `{ planted_at: null }` to clear the date
- When a diary entry with `category='harvesting'` + `bed_id` is deleted:
  - Call `updateBed(...)` with `{ expected_harvest: null }` to clear the date
- This prevents stale dates from deleted diary entries

### FR-5: Non-blocking — bed update failure should not fail the diary operation
- The diary entry is the source of truth. If `updateBed()` fails:
  - Log a warning (not throw)
  - The diary entry remains created/updated/deleted
  - The bed date will be inconsistent but not crash the user's workflow

### FR-6: No duplicate bridge — only the LATEST planting/harvesting entry wins
- If a bed already has a `planted_at` from a previous planting entry, the new planting entry overwrites it
- This is the correct behavior — the latest diary entry is the most recent planting event
- No need to check for conflicts; simple overwrite is the right semantic

---

## 4. Non-Functional Requirements

### NFR-1: Zero additional DynamoDB cost
- Reuse the `bed` variable from the existing validation check (lines 155-166) — no extra `getBedById` call
- One additional `updateBed()` call per diary POST/PATCH with planting/harvesting category (~1 WCU)

### NFR-2: Test coverage
- Test POST diary with planting + bed_id → bed.planted_at updated
- Test POST diary with harvesting + bed_id → bed.expected_harvest updated
- Test POST diary without bed_id → no bed update
- Test POST diary with non-planting category + bed_id → no bed update
- Test PATCH diary changing date → bed date synced
- Test DELETE diary with planting + bed_id → bed.planted_at cleared

### NFR-3: No frontend changes required
- The bridge is purely backend (API-level side-effect)
- CropTimeline already renders `planted_at`/`expected_harvest` when they exist
- DiaryEntryForm already has bed selection + category dropdown

---

## 5. Constraints

| Constraint | Detail |
|-----------|--------|
| Size S | 2-4 hours — backend only, no new endpoints or types |
| No new fields | Reuse existing `planted_at`/`expected_harvest` on Bed |
| Non-blocking | Bed update failure must not fail diary operation |
| Idempotent | Multiple planting entries for same bed → last write wins |
| Backward compat | Existing beds with manually-set dates are unaffected |

---

## 6. Out of Scope

- Smart defaults (auto-suggest harvest date from crop library) — that's #275 (M3)
- Reserved vs actual split-pane UX — that's #276
- Frontend confirmation dialog ("Update bed planting date?") — automatic is better UX
- Handling multiple planting entries per bed (crop rotation) — that's #279 (Beta-10)

---

## 7. Acceptance Criteria

- [ ] Creating a planting diary entry with bed_id → bed.planted_at auto-set to entry.date
- [ ] Creating a harvesting diary entry with bed_id → bed.expected_harvest auto-set to entry.date
- [ ] Diary entries without bed_id → no bed update
- [ ] Non-planting/harvesting categories → no bed update
- [ ] Updating a planting entry's date → bed.planted_at synced
- [ ] Deleting a planting entry → bed.planted_at cleared
- [ ] Bed update failure does not fail the diary operation
- [ ] CropTimeline shows bars immediately after planting + harvesting diary entries
- [ ] Existing 631 tests pass + new bridge tests

---

## 8. Files to Modify

| Layer | File | Change |
|-------|------|--------|
| **API** | `src/api/src/routes/diary.ts` | Add bed date sync after create/update/delete |
| **Tests** | `src/api/src/__tests__/routes/diary.test.ts` | New tests for bridge behavior |

**2 files only.** This is the smallest possible scope — pure backend logic in the existing diary route.

---

## 9. Next Step

Step 1 complete. Run `/cc-design` to proceed to Step 2: Architecture.

# Requirements: #276 — Reserved vs Actual Split-Pane UX for Crop Milestones

**Issue:** [#276](https://github.com/ashmuk/litcrop/issues/276)
**Sprint:** Beta-8 — Crop Intelligence M1-M3 + UX
**Size:** L
**Step:** 1 — Requirements (cc-define)
**Date:** 2026-04-05
**Depends:** #273 (M1), #274 (M2), #275 (M3) — all complete
**Design ref:** `docs/planning/crop-intelligence-roadmap.html` (lines 159-213)

---

## 1. Problem Statement

The CropTimeline Gantt chart currently shows a single bar per bed (planted_at → expected_harvest). Users cannot distinguish between **planned** crop dates (set on the Crops page or auto-calculated by M3) and **actual** dates (logged via diary entries). This makes it impossible to compare plan vs reality — a core farming insight.

## 2. Current State

### CropTimeline (`CropTimeline.tsx`)
- Shows beds with both `planted_at` AND `expected_harvest` as single solid bars
- Bar position calculated by `computeBarPosition()` (clips to visible month)
- Renders in calendar view of DiaryPage, below the calendar grid
- Props: `beds: BedTimelineItem[]`, `year`, `month`

### Data already available in calendar view
| Data | Source | Already fetched |
|------|--------|----------------|
| Reserved planted_at | `bed.planted_at` (from getBeds) | Yes |
| Reserved expected_harvest | `bed.expected_harvest` (from getBeds) | Yes |
| Actual planting date | diary entry with `category='planting'` + `bed_id` | Yes (entries loaded) |
| Actual harvest date | diary entry with `category='harvesting'` + `bed_id` | Yes (entries loaded) |

### No API changes needed
Both bed data and diary entries are already fetched in the calendar view. The feature is purely frontend — extracting actual dates from diary entries and rendering dual bars.

---

## 3. Functional Requirements

### FR-1: Dual-bar Gantt chart
- Each bed row in CropTimeline shows **two bars**:
  - **Reserved bar** (amber, dashed): `bed.planted_at` → `bed.expected_harvest` (planned dates)
  - **Actual bar** (green, solid): actual planting date → actual harvest date (from diary entries)
- If only reserved dates exist → show only the amber dashed bar
- If only actual dates exist → show only the green solid bar
- If both exist → overlay both bars (actual on top of reserved)

### FR-2: Extract actual dates from diary entries
- For each bed, scan diary entries to find:
  - `actual_planted`: latest entry with `category='planting'` AND `bed_id=bed.id`
  - `actual_harvest`: latest entry with `category='harvesting'` AND `bed_id=bed.id`
- Use entry `date` field (YYYY-MM-DD) as the actual date
- If multiple planting entries for the same bed, use the latest one

### FR-3: Pass diary entries to CropTimeline
- CropTimeline props expand to include `entries: DiaryEntryResponse[]`
- DiaryPage already has `entries` state — pass it through
- CropTimeline internally builds actual date map per bed

### FR-4: Legend
- Add a legend below the Gantt chart:
  - Dashed amber swatch: "Reserved (planned)"
  - Solid green swatch: "Actual (logged)"
  - Red line swatch: "Today"
- Use existing legend pattern from crop-intelligence-roadmap.html

### FR-5: Show beds with only actual dates (no reserved)
- Currently CropTimeline filters to beds with BOTH planted_at AND expected_harvest
- Expand filter: show bed if it has reserved dates OR actual dates (from diary)
- A bed with only a planting diary entry (actual planted, no harvest yet) shows a partial bar

### FR-6: Tooltip enhancement
- Reserved bar tooltip: "Planned: {planted_at} → {expected_harvest}"
- Actual bar tooltip: "Actual: {actual_planted} → {actual_harvest}"
- If actual harvest is not yet logged: "Actual: {actual_planted} → in progress"

### FR-7: i18n
- New keys for EN + JA:
  - `timeline.reserved`: "Reserved (planned)" / "予定"
  - `timeline.actual`: "Actual (logged)" / "実績"
  - `timeline.in_progress`: "in progress" / "進行中"
  - `timeline.today`: "Today" / "今日"

---

## 4. Non-Functional Requirements

### NFR-1: Performance
- Diary entries are already loaded — no additional API calls
- Actual date extraction is O(n) scan over entries (n < 100 per month)
- No re-renders beyond what calendar view already triggers

### NFR-2: Responsive
- Dual bars must stack vertically on narrow screens (mobile)
- Reserved bar slightly thinner (background layer), actual bar on top

### NFR-3: Test coverage
- Test: `buildActualDatesMap()` helper extracts dates correctly
- Test: handles missing actual dates, missing reserved dates, both present

---

## 5. Constraints

| Constraint | Detail |
|-----------|--------|
| Frontend only | No API changes — all data already fetched |
| Size L | ~4-5 hours — CropTimeline rewrite + styling + i18n |
| No new data model | Actual dates derived from diary entries, not stored on bed |
| Color scheme | Per roadmap: amber (#f59e0b) dashed for reserved, green (#22c55e) solid for actual |

---

## 6. Out of Scope

- Split-pane card view (reserved card vs actual card) — that's a larger UX redesign
- Cost comparison (reserved budget vs actual spend) — that's #248 (Beta-9 ROI)
- Yield comparison — no yield data yet
- Filtering Gantt by individual bed — current month-level view is sufficient

---

## 7. Acceptance Criteria

- [ ] CropTimeline shows dual bars: amber dashed (reserved) + green solid (actual)
- [ ] Actual dates extracted from planting/harvesting diary entries per bed
- [ ] Beds with only reserved dates show only amber bar
- [ ] Beds with only actual dates show only green bar
- [ ] Beds with both show overlaid bars
- [ ] Legend shows reserved/actual/today swatches
- [ ] Tooltips distinguish "Planned" vs "Actual"
- [ ] i18n keys in EN + JA
- [ ] Mobile responsive (bars stack if needed)
- [ ] No additional API calls
- [ ] All existing tests pass + new tests for actual date extraction

---

## 8. Files to Modify

| Layer | File | Change |
|-------|------|--------|
| **Frontend** | `src/frontend/src/components/CropTimeline.tsx` | Dual-bar rendering, legend, expanded filter |
| **Frontend** | `src/frontend/src/components/DiaryPage.tsx` | Pass entries to CropTimeline |
| **Frontend** | `src/frontend/src/lib/diary-utils.ts` | Add `buildActualDatesMap()` helper |
| **Frontend** | `src/frontend/src/styles/components.css` | Dashed amber bar styling |
| **i18n** | `src/frontend/src/i18n/en.json` | New timeline keys |
| **i18n** | `src/frontend/src/i18n/ja.json` | New timeline keys |
| **Tests** | `src/frontend/src/__tests__/diary-utils.test.ts` | New/extend: actual date extraction tests |

---

## 9. Next Step

Step 1 complete. Run `/cc-design` to proceed to Step 2: Architecture.

# Beta-9 Gantt Session Report

**Sprint:** Beta-9 — Gantt Chart with Diary Events (#297)
**Date:** 2026-04-06
**Branch:** develop (7 commits since v0.42, PR #307 open)
**Tag:** v0.43
**Stats:** 713 tests (was 692 after Beta-8 post-merge)

---

## Executive Summary

Implemented a multi-month Gantt chart as a third diary view mode, with diary event dots, active/obsolete bed panes, and cross-reference to the calendar. The full design-first pipeline was followed: `/cc-design` → `/cc-review` → `/cc-remediate` → `/cc-implement` (4 batches, each with `/simplify` + `/cc-review`) → final review + test strategy. Also fixed 2 pre-existing diary bugs (#301, #302) discovered during user testing before starting #297.

---

## Pre-Feature Bug Fixes

| # | Title | Category |
|---|-------|----------|
| **#301** | Future date diary entries not visible (API default range excluded them) | bug fix |
| **#302** | Mobile side-by-side split view not rendering (single-column collapse) | bug fix |

Both fixed, reviewed, and merged via PR #303 before starting #297.

---

## Feature: #297 Gantt Chart with Diary Events

### Design Phase

| Artifact | Description |
|----------|-------------|
| ADR-20260406 | New GanttChart component alongside CropTimeline (Option 2) |
| ARCHITECTURE.md S14 | Component architecture, data model, positioning algorithm, panes |
| Mockup | `docs/mockups/gantt-events.html` — desktop 12M + mobile 6M layouts |
| Task Breakdown | 5 batches, 13 tasks (T9.1–T9.13) |

### Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Component strategy | New GanttChart.tsx | Separation of concerns, CropTimeline untouched |
| `completed_at` semantics | "Crop cycle done" | Bed stays available for replanting |
| Beta-10 migration | Accept ~30 min rework | `completed_at` moves to CropAssignment |
| Season concept | Not needed | Gantt date range is de facto season |
| Multi-month math | Reuse `computeBarPosition` | Already works with arbitrary date ranges |

### Implementation (4 Batches)

| Batch | Scope | Commit | Tests |
|-------|-------|--------|-------|
| 1 | `completed_at` on Bed (types, schema, API) | `578b40d` | 695 (+3) |
| 2 | `buildEventDotMap` + multi-month bar validation | `477c9ed` | 703 (+8) |
| 3+5 | GanttChart component + CSS + i18n | `76c4621` | 703 |
| 4 | DiaryPage integration (view mode, handlers, cross-ref) | `87b7f5e` | 703 |
| Remediation | Review fixes + P1 test coverage | `0d3659c` | 713 (+10) |

### Commits (7)

```
0d3659c  fix(gantt): remediate review findings + add P1 test coverage (#297)
87b7f5e  feat(diary): integrate GanttChart as third view mode (#297)
76c4621  feat(gantt): multi-month GanttChart component with event dots (#297)
477c9ed  feat(diary): add buildEventDotMap utility + multi-month bar test (#297)
578b40d  feat(beds): add completed_at field for crop cycle done state (#297)
18d377b  docs(gantt): remediate design review findings for #297
293cf7b  docs(gantt): design artifacts for #297 — ADR, architecture, mockup, task breakdown
```

---

## Bugs Caught by Pipeline

| # | Bug | Source |
|---|-----|--------|
| 1 | `parseDate` duplicated in GanttChart + CropTimeline | /simplify (Batch 3) |
| 2 | Dead `ref={scrollRef}` on header element (only last assignment wins) | /simplify (Batch 3) |
| 3 | `toDateString(new Date())` called twice in `handleMarkDone` (possible date drift) | /simplify (Batch 4) |
| 4 | Error retry button missing gantt view handler | /simplify (Batch 4) |
| 5 | Month header outside scroll container — header/content misalign on scroll | /cc-review (MUST-FIX) |
| 6 | `useMemo` for monthHeaders had empty deps capturing new Date objects | /cc-review |
| 7 | Dot `aria-label` used raw category key, not translated | /cc-review |
| 8 | `FarmBedItemSchema` missing `completed_at` — field silently stripped | /simplify (Batch 1) |
| 9 | `FarmBedSchema` and `BedDetailResponseSchema` missing new fields | /simplify (Batch 1) |

---

## New Issues Created

| # | Title | Type |
|---|-------|------|
| **#301** | Future date entries not visible | bug (fixed) |
| **#302** | Mobile split view not rendering | bug (fixed) |
| **#304** | Show date on each diary entry card | UX (open) |
| **#305** | Remove redundant layout toggle | UX (open) |
| **#306** | Disable entry type tabs in side-by-side view | UX (open) |

---

## New Files

| File | Purpose |
|------|---------|
| `src/frontend/src/components/GanttChart.tsx` | Multi-month Gantt chart component (~210 lines) |
| `docs/decisions/ADR-20260406-gantt-chart-multi-month.md` | Architecture decision record |
| `docs/mockups/gantt-events.html` | UX mockup (desktop + mobile) |
| `docs/TEST-PLAN-297.md` | Test coverage strategy |

## New API Fields

| Entity | Field | Type | Purpose |
|--------|-------|------|---------|
| Bed | `completed_at` | `string \| null` | Crop cycle done date (YYYY-MM-DD) |

## New i18n Keys

| Key | EN | JA |
|-----|----|----|
| `gantt.title` | Farm Gantt | ファームガント |
| `gantt.mark_done` | Mark done | 完了にする |
| `gantt.undo_done` | Undo | 戻す |
| `gantt.done_section` | Done | 完了 |
| `gantt.empty` | No beds with crop dates yet | 作物データのあるベッドがありません |

---

## Forward-Looking Analysis

Three concepts were analyzed during design review:

| Concept | Verdict | Impact on #297 |
|---------|---------|----------------|
| Done ↔ Crops page | No Crops page changes needed now | Gantt is self-contained |
| 1:N bed:crop (#279) | Accept ~30 min rework in Beta-10 | `completed_at` → CropAssignment |
| Season concept | Not needed as entity | Gantt date range is de facto season |

---

## PR Status

- **PR #303**: `develop → main` — 2 bug fixes (#301, #302) — MERGED
- **PR #307**: `develop → main` — #297 Gantt feature — pending merge

---

## Remaining for Next Session

1. **Merge PR #307** to main
2. **Beta-9 ROI**: #248 ROI dashboard, #245 diary ROI portion
3. **UX polish**: #304, #305, #306 (diary card dates, layout toggle, tabs in split)
4. **SES diagnosis**: Check CloudWatch logs for notification send errors

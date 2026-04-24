/**
 * diary-utils — Beta-7: Farm Diary
 *
 * Pure utility functions extracted from diary components for testability.
 * No side effects, no DOM access, no i18n calls.
 */

import type { DiaryEntryResponse } from './api';
import { CATEGORY_META } from './diary';

// ── Date formatting ────────────────────────────────────────────────

/** Parse a YYYY-MM-DD string to a Date at midnight local time */
export function parseDate(s: string): Date {
  return new Date(s + 'T00:00:00');
}

/** Format a Date object as YYYY-MM-DD */
export function toDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ── Calendar grid ──────────────────────────────────────────────────

/**
 * Build the calendar grid cells for a given year/month (0-based month).
 * Returns an array of { date: YYYY-MM-DD, outside: boolean } objects.
 * The array length is always a multiple of 7 (complete grid rows).
 */
export function buildCalendarCells(
  year: number,
  month: number,
): Array<{ date: string; outside: boolean }> {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);

  const cells: Array<{ date: string; outside: boolean }> = [];

  // Leading days from previous month (startDow = 0 → Sunday, no padding)
  const startDow = firstDay.getDay();
  for (let i = startDow - 1; i >= 0; i--) {
    const d = new Date(year, month, -i);
    cells.push({ date: toDateString(d), outside: true });
  }

  // Days in current month
  for (let d = 1; d <= lastDay.getDate(); d++) {
    cells.push({ date: toDateString(new Date(year, month, d)), outside: false });
  }

  // Trailing days from next month to complete the final week
  const endDow = lastDay.getDay();
  const trailingCount = endDow === 6 ? 0 : 6 - endDow;
  for (let i = 1; i <= trailingCount; i++) {
    const d = new Date(year, month + 1, i);
    cells.push({ date: toDateString(d), outside: true });
  }

  return cells;
}

// ── Dot map ────────────────────────────────────────────────────────

/**
 * Build a map of date → unique category colors (capped at 3 per day).
 * Used by DiaryCalendar to render colored dots on each calendar cell.
 */
export function buildDotMap(entries: DiaryEntryResponse[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const entry of entries) {
    const existing = map.get(entry.date);
    const meta = CATEGORY_META[entry.category] ?? CATEGORY_META['other'];
    if (!existing) {
      map.set(entry.date, [meta.color]);
    } else {
      if (!existing.includes(meta.color) && existing.length < 3) {
        existing.push(meta.color);
      }
    }
  }
  return map;
}

// ── Timeline bar ───────────────────────────────────────────────────

/**
 * Compute left% and width% for a bar spanning [planted, harvest]
 * relative to the visible month [monthStart, monthEnd].
 * Returns null when there is no visible overlap with the month.
 */
export function computeBarPosition(
  planted: Date,
  harvest: Date,
  monthStart: Date,
  monthEnd: Date,
): { left: number; width: number } | null {
  const barStart = planted < monthStart ? monthStart : planted;
  const barEnd = harvest > monthEnd ? monthEnd : harvest;

  if (barStart > barEnd) return null;

  const totalMs = monthEnd.getTime() - monthStart.getTime();
  if (totalMs <= 0) return null;

  const left = ((barStart.getTime() - monthStart.getTime()) / totalMs) * 100;
  const width = ((barEnd.getTime() - barStart.getTime()) / totalMs) * 100;

  return { left: Math.max(0, left), width: Math.max(0.5, width) };
}

// ── Actual dates map (#276) ────────────────────────────────────────

/**
 * Extract the latest actual planting/harvesting dates from diary entries,
 * keyed by `bed_crop_id ?? bed_id` so sibling crops on the same bed render
 * independent bars while legacy/virtual rows (no `bed_crop_id`) stay bucketed
 * by bed. Callers do `map.get(cropId ?? bedId)`. Used by CropTimeline + GanttChart.
 *
 * Intentional edge case (per DESIGN-279 §3.3 "no data migration"): pre-Wave-D
 * entries with `bed_crop_id=null` on a bed that later gained a real BedCrop
 * are orphaned — they key under `bed_id`, but DiaryPage.ganttRows only emits
 * a virtual-legacy row (`cropId=null`) when the bed has zero real BedCrops,
 * so nothing renders them. Users can backfill via PATCH if desired.
 */
export function buildActualDatesMap(
  entries: DiaryEntryResponse[],
): Map<string, { planted?: string; harvested?: string }> {
  const map = new Map<string, { planted?: string; harvested?: string }>();

  for (const entry of entries) {
    if (!entry.bed_id) continue;
    if ((entry.entry_type ?? 'actual') === 'reserved') continue;
    if (entry.category !== 'planting' && entry.category !== 'harvesting') continue;

    const key = entry.bed_crop_id ?? entry.bed_id;
    const existing = map.get(key) ?? {};

    if (entry.category === 'planting') {
      if (!existing.planted || entry.date > existing.planted) {
        existing.planted = entry.date;
      }
    } else {
      if (!existing.harvested || entry.date > existing.harvested) {
        existing.harvested = entry.date;
      }
    }

    map.set(key, existing);
  }

  return map;
}

// ── Event dot map (#297) ──────────────────────────────────────────

/** Dot data for a single diary event on the Gantt chart */
export interface EventDot {
  date: string;
  category: string;
  color: string;
  id: string;
}

/**
 * Group diary entries into dot arrays for Gantt event rendering, keyed by
 * `bed_crop_id ?? bed_id` (same cascade as `buildActualDatesMap`). Excludes
 * entries without `bed_id`; all 9 categories are included; dots are sorted
 * by date within each bucket. Callers do `map.get(row.cropId ?? row.bedId)`.
 */
export function buildEventDotMap(
  entries: DiaryEntryResponse[],
): Map<string, EventDot[]> {
  const map = new Map<string, EventDot[]>();

  for (const entry of entries) {
    if (!entry.bed_id) continue;

    const meta = CATEGORY_META[entry.category] ?? CATEGORY_META['other'];
    const dot: EventDot = {
      date: entry.date,
      category: entry.category,
      color: meta.color,
      id: entry.id,
    };

    const key = entry.bed_crop_id ?? entry.bed_id;
    const existing = map.get(key);
    if (existing) {
      existing.push(dot);
    } else {
      map.set(key, [dot]);
    }
  }

  // Sort dots by date within each bucket
  for (const dots of map.values()) {
    dots.sort((a, b) => a.date.localeCompare(b.date));
  }

  return map;
}

// ── Formatting helpers ─────────────────────────────────────────────

/**
 * Format a monetary amount with currency symbol.
 * JPY: integer with ¥ prefix; USD: 2 decimal places with $ prefix.
 */
export function formatCurrency(amount: number, currency: string): string {
  if (currency === 'JPY') return `¥${amount.toLocaleString()}`;
  return `$${amount.toFixed(2)}`;
}

/**
 * Group diary entries by date.
 * Returns a Map<date, entries[]> with groups in newest-first order.
 * The Map insertion order reflects the sort (newest date key first).
 */
export function groupByDate(entries: DiaryEntryResponse[]): Map<string, DiaryEntryResponse[]> {
  const map = new Map<string, DiaryEntryResponse[]>();
  for (const entry of entries) {
    const group = map.get(entry.date);
    if (group) {
      group.push(entry);
    } else {
      map.set(entry.date, [entry]);
    }
  }
  // Re-build with sorted keys (newest first)
  const sorted = [...map.entries()].sort(([a], [b]) => b.localeCompare(a));
  return new Map(sorted);
}

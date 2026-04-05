/**
 * diary-utils — Beta-7: Farm Diary
 *
 * Pure utility functions extracted from diary components for testability.
 * No side effects, no DOM access, no i18n calls.
 */

import type { DiaryEntryResponse } from './api';
import { CATEGORY_META } from './diary';

// ── Date formatting ────────────────────────────────────────────────

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
 * Extract actual planting/harvesting dates from diary entries, grouped by bed_id.
 * For each bed, returns the latest planting and latest harvesting diary entry dates.
 * Used by CropTimeline to render "actual" bars alongside "reserved" bars.
 */
export function buildActualDatesMap(
  entries: DiaryEntryResponse[],
): Map<string, { planted?: string; harvested?: string }> {
  const map = new Map<string, { planted?: string; harvested?: string }>();

  for (const entry of entries) {
    if (!entry.bed_id) continue;
    if ((entry.entry_type ?? 'actual') === 'reserved') continue;
    if (entry.category !== 'planting' && entry.category !== 'harvesting') continue;

    const existing = map.get(entry.bed_id) ?? {};

    if (entry.category === 'planting') {
      if (!existing.planted || entry.date > existing.planted) {
        existing.planted = entry.date;
      }
    } else {
      if (!existing.harvested || entry.date > existing.harvested) {
        existing.harvested = entry.date;
      }
    }

    map.set(entry.bed_id, existing);
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

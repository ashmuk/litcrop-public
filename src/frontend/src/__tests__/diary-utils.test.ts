/**
 * diary-utils — P1 pure function tests (Beta-7)
 */

import { describe, it, expect } from 'vitest';
import {
  parseDate,
  toDateString,
  buildCalendarCells,
  buildDotMap,
  computeBarPosition,
  formatCurrency,
  groupByDate,
  buildActualDatesMap,
  buildEventDotMap,
} from '../lib/diary-utils';
import type { DiaryEntryResponse } from '../lib/api';

// ── Helpers ────────────────────────────────────────────────────────

function makeEntry(
  overrides: Partial<DiaryEntryResponse> & { date: string; category: string },
): DiaryEntryResponse {
  const { date, category } = overrides;
  return {
    id: 'entry-uuid',
    farm_id: 'farm-uuid',
    entry_type: 'actual' as const,
    description: 'Test entry',
    time_spent_minutes: null,
    bed_id: null,
    bed_name: null,
    bed_crop_id: null,
    photo_ids: [],
    costs: [],
    cost_total: 0,
    created_by: 'user-uuid',
    created_by_name: null,
    created_at: `${date}T09:00:00Z`,
    updated_at: `${date}T09:00:00Z`,
    harvest_amount: null,
    harvest_unit: null,
    revenue: null,
    revenue_currency: null,
    ...overrides,
    date,
    category,
  };
}

// ── parseDate ─────────────────────────────────────────────────────

describe('parseDate', () => {
  it('parses YYYY-MM-DD to Date at midnight local time', () => {
    const d = parseDate('2026-04-06');
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(3); // 0-based
    expect(d.getDate()).toBe(6);
    expect(d.getHours()).toBe(0);
  });

  it('handles month boundaries correctly', () => {
    const d = parseDate('2026-01-31');
    expect(d.getDate()).toBe(31);
    expect(d.getMonth()).toBe(0);
  });

  it('handles leap year Feb 29', () => {
    const d = parseDate('2024-02-29');
    expect(d.getDate()).toBe(29);
    expect(d.getMonth()).toBe(1);
  });
});

// ── toDateString ───────────────────────────────────────────────────

describe('toDateString', () => {
  it('formats a known date as YYYY-MM-DD', () => {
    expect(toDateString(new Date(2026, 3, 3))).toBe('2026-04-03');
  });

  it('zero-pads single-digit month and day', () => {
    expect(toDateString(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

// ── buildCalendarCells ─────────────────────────────────────────────

describe('buildCalendarCells', () => {
  it('March 2026 (starts Sunday) — first cell is March 1, no leading padding', () => {
    // March 1 2026 is a Sunday → DOW = 0, so startDow = 0, no leading cells
    const cells = buildCalendarCells(2026, 2); // month 2 = March
    expect(cells[0].date).toBe('2026-03-01');
    expect(cells[0].outside).toBe(false);
  });

  it('April 2026 (starts Wednesday) — first 3 cells are from previous month', () => {
    // April 1 2026 is a Wednesday → DOW = 3 → 3 leading cells from March
    const cells = buildCalendarCells(2026, 3); // month 3 = April
    expect(cells[0].outside).toBe(true);
    expect(cells[1].outside).toBe(true);
    expect(cells[2].outside).toBe(true);
    expect(cells[3].outside).toBe(false);
    expect(cells[3].date).toBe('2026-04-01');
  });

  it('February 2024 (leap year) — 29 in-month days', () => {
    const cells = buildCalendarCells(2024, 1); // month 1 = February
    const inMonth = cells.filter((c) => !c.outside);
    expect(inMonth).toHaveLength(29);
  });

  it('February 2025 (non-leap) — 28 in-month days', () => {
    const cells = buildCalendarCells(2025, 1);
    const inMonth = cells.filter((c) => !c.outside);
    expect(inMonth).toHaveLength(28);
  });

  it('total cells are always a multiple of 7', () => {
    // Test several months
    for (const [year, month] of [
      [2026, 0],
      [2026, 1],
      [2026, 2],
      [2026, 3],
      [2024, 1],
      [2025, 1],
    ] as [number, number][]) {
      const cells = buildCalendarCells(year, month);
      expect(cells.length % 7).toBe(0);
    }
  });

  it('January 2026 (starts Thursday) — last cells are from next month', () => {
    // Jan 31 2026 is a Saturday → DOW = 6 → 0 trailing cells
    // Jan 1 2026 is a Thursday → DOW = 4 → 4 leading cells
    // Total: 4 + 31 = 35 = 5 rows × 7
    const cells = buildCalendarCells(2026, 0); // month 0 = January
    // First 4 should be outside (from Dec 2025)
    expect(cells[0].outside).toBe(true);
    expect(cells[3].outside).toBe(true);
    expect(cells[4].outside).toBe(false);
    expect(cells[4].date).toBe('2026-01-01');
    // Jan 31 is Saturday (DOW 6) → no trailing outside cells
    const last = cells[cells.length - 1];
    expect(last.date).toBe('2026-01-31');
    expect(last.outside).toBe(false);
  });
});

// ── buildDotMap ────────────────────────────────────────────────────

describe('buildDotMap', () => {
  it('single entry — map has 1 date with 1 color', () => {
    const entries = [makeEntry({ date: '2026-04-03', category: 'planting' })];
    const map = buildDotMap(entries);
    expect(map.size).toBe(1);
    expect(map.get('2026-04-03')).toHaveLength(1);
  });

  it('multiple entries same date, different categories — multiple colors', () => {
    const entries = [
      makeEntry({ date: '2026-04-03', category: 'planting' }),
      makeEntry({ date: '2026-04-03', category: 'watering' }),
    ];
    const map = buildDotMap(entries);
    expect(map.get('2026-04-03')).toHaveLength(2);
  });

  it('same category twice on same day — only 1 dot (deduplicated)', () => {
    const entries = [
      makeEntry({ id: 'e1', date: '2026-04-03', category: 'planting' }),
      makeEntry({ id: 'e2', date: '2026-04-03', category: 'planting' }),
    ];
    const map = buildDotMap(entries);
    expect(map.get('2026-04-03')).toHaveLength(1);
  });

  it('more than 3 categories on one day — capped at 3 colors', () => {
    const entries = [
      makeEntry({ id: 'e1', date: '2026-04-03', category: 'planting' }),
      makeEntry({ id: 'e2', date: '2026-04-03', category: 'watering' }),
      makeEntry({ id: 'e3', date: '2026-04-03', category: 'harvesting' }),
      makeEntry({ id: 'e4', date: '2026-04-03', category: 'weeding' }),
    ];
    const map = buildDotMap(entries);
    expect(map.get('2026-04-03')).toHaveLength(3);
  });

  it('empty entries array — empty map', () => {
    const map = buildDotMap([]);
    expect(map.size).toBe(0);
  });
});

// ── computeBarPosition ────────────────────────────────────────────

describe('computeBarPosition', () => {
  const monthStart = new Date(2026, 3, 1, 0, 0, 0);  // Apr 1
  const monthEnd   = new Date(2026, 3, 30, 23, 59, 59); // Apr 30

  it('bar entirely within month — left > 0, width > 0', () => {
    const planted  = new Date(2026, 3, 10);
    const harvest  = new Date(2026, 3, 20);
    const pos = computeBarPosition(planted, harvest, monthStart, monthEnd);
    expect(pos).not.toBeNull();
    expect(pos!.left).toBeGreaterThan(0);
    expect(pos!.width).toBeGreaterThan(0);
  });

  it('bar entirely before month start — returns null', () => {
    const planted = new Date(2026, 1, 1);  // Feb 1
    const harvest = new Date(2026, 2, 31); // Mar 31
    expect(computeBarPosition(planted, harvest, monthStart, monthEnd)).toBeNull();
  });

  it('bar entirely after month end — returns null', () => {
    const planted = new Date(2026, 4, 1);  // May 1
    const harvest = new Date(2026, 4, 31); // May 31
    expect(computeBarPosition(planted, harvest, monthStart, monthEnd)).toBeNull();
  });

  it('bar spans entire month — left ≈ 0, width ≈ 100', () => {
    const planted = new Date(2026, 2, 1);  // Mar 1 (before month)
    const harvest = new Date(2026, 4, 31); // May 31 (after month)
    const pos = computeBarPosition(planted, harvest, monthStart, monthEnd);
    expect(pos).not.toBeNull();
    expect(pos!.left).toBe(0);
    expect(pos!.width).toBeCloseTo(100, 0);
  });

  it('planted === harvest (same day) — returns min-width bar', () => {
    const d = new Date(2026, 3, 15);
    const pos = computeBarPosition(d, d, monthStart, monthEnd);
    expect(pos).not.toBeNull();
    expect(pos!.width).toBe(0.5); // minimum width floor
  });

  it('bar partially overlaps (starts before month, ends during month) — left = 0, width > 0', () => {
    const planted = new Date(2026, 2, 1);  // Mar 1 (before month)
    const harvest = new Date(2026, 3, 15); // Apr 15 (mid-month)
    const pos = computeBarPosition(planted, harvest, monthStart, monthEnd);
    expect(pos).not.toBeNull();
    expect(pos!.left).toBe(0);
    expect(pos!.width).toBeGreaterThan(0);
    expect(pos!.width).toBeLessThan(100);
  });

  it('zero-width range (start === end) — returns null', () => {
    const d = new Date(2026, 3, 15);
    expect(computeBarPosition(d, d, d, d)).toBeNull();
  });

  it('multi-month range: 6-month window works correctly (#297)', () => {
    const rangeStart = new Date(2026, 0, 1);  // Jan 1
    const rangeEnd   = new Date(2026, 5, 30); // Jun 30
    const planted    = new Date(2026, 2, 15); // Mar 15
    const harvest    = new Date(2026, 4, 20); // May 20
    const pos = computeBarPosition(planted, harvest, rangeStart, rangeEnd);
    expect(pos).not.toBeNull();
    expect(pos!.left).toBeGreaterThan(10);
    expect(pos!.left).toBeLessThan(50);
    expect(pos!.width).toBeGreaterThan(10);
    expect(pos!.width).toBeLessThan(50);
  });
});

// ── formatCurrency ────────────────────────────────────────────────

describe('formatCurrency', () => {
  it('JPY 500 — ¥500 with no decimals', () => {
    expect(formatCurrency(500, 'JPY')).toBe('¥500');
  });

  it('USD 10.5 — $10.50 with 2 decimal places', () => {
    expect(formatCurrency(10.5, 'USD')).toBe('$10.50');
  });

  it('zero amount — formats correctly for each currency', () => {
    expect(formatCurrency(0, 'JPY')).toBe('¥0');
    expect(formatCurrency(0, 'USD')).toBe('$0.00');
  });
});

// ── groupByDate ───────────────────────────────────────────────────

describe('groupByDate', () => {
  it('multiple entries, 2 dates — 2 groups, newest date first', () => {
    const entries = [
      makeEntry({ id: 'e1', date: '2026-04-01', category: 'planting' }),
      makeEntry({ id: 'e2', date: '2026-04-03', category: 'watering' }),
      makeEntry({ id: 'e3', date: '2026-04-01', category: 'weeding' }),
    ];
    const map = groupByDate(entries);
    expect(map.size).toBe(2);
    const keys = [...map.keys()];
    expect(keys[0]).toBe('2026-04-03');
    expect(keys[1]).toBe('2026-04-01');
    expect(map.get('2026-04-01')).toHaveLength(2);
  });

  it('single entry — 1 group', () => {
    const entries = [makeEntry({ date: '2026-04-03', category: 'planting' })];
    const map = groupByDate(entries);
    expect(map.size).toBe(1);
    expect(map.get('2026-04-03')).toHaveLength(1);
  });

  it('empty array — empty map', () => {
    const map = groupByDate([]);
    expect(map.size).toBe(0);
  });
});

// ── buildActualDatesMap (#276) ────────────────────────────────────

describe('buildActualDatesMap', () => {
  const makeEntry = (overrides: Partial<DiaryEntryResponse>): DiaryEntryResponse => ({
    id: 'e1',
    farm_id: 'f1',
    date: '2026-04-10',
    category: 'planting',
    entry_type: 'actual' as const,
    description: 'test',
    time_spent_minutes: null,
    bed_id: 'bed-1',
    bed_name: 'A1',
    bed_crop_id: null,
    photo_ids: [],
    costs: [],
    cost_total: 0,
    created_by: 'u1',
    created_by_name: null,
    created_at: '2026-04-10T00:00:00Z',
    updated_at: '2026-04-10T00:00:00Z',
    harvest_amount: null,
    harvest_unit: null,
    revenue: null,
    revenue_currency: null,
    ...overrides,
  });

  it('extracts planting date for bed', () => {
    const map = buildActualDatesMap([makeEntry({ bed_id: 'bed-1', category: 'planting', date: '2026-04-10' })]);
    expect(map.get('bed-1')).toEqual({ planted: '2026-04-10' });
  });

  it('extracts harvesting date for bed', () => {
    const map = buildActualDatesMap([makeEntry({ bed_id: 'bed-1', category: 'harvesting', date: '2026-07-15' })]);
    expect(map.get('bed-1')).toEqual({ harvested: '2026-07-15' });
  });

  it('extracts both planting and harvesting for same bed', () => {
    const map = buildActualDatesMap([
      makeEntry({ bed_id: 'bed-1', category: 'planting', date: '2026-04-01' }),
      makeEntry({ id: 'e2', bed_id: 'bed-1', category: 'harvesting', date: '2026-07-01' }),
    ]);
    expect(map.get('bed-1')).toEqual({ planted: '2026-04-01', harvested: '2026-07-01' });
  });

  it('uses latest date when multiple planting entries exist', () => {
    const map = buildActualDatesMap([
      makeEntry({ bed_id: 'bed-1', category: 'planting', date: '2026-03-01' }),
      makeEntry({ id: 'e2', bed_id: 'bed-1', category: 'planting', date: '2026-04-15' }),
    ]);
    expect(map.get('bed-1')?.planted).toBe('2026-04-15');
  });

  it('uses latest date when multiple harvesting entries exist', () => {
    const map = buildActualDatesMap([
      makeEntry({ bed_id: 'bed-1', category: 'harvesting', date: '2026-06-01' }),
      makeEntry({ id: 'e2', bed_id: 'bed-1', category: 'harvesting', date: '2026-07-20' }),
    ]);
    expect(map.get('bed-1')?.harvested).toBe('2026-07-20');
  });

  it('ignores entries without bed_id', () => {
    const map = buildActualDatesMap([makeEntry({ bed_id: null })]);
    expect(map.size).toBe(0);
  });

  it('ignores non-planting/harvesting categories', () => {
    const map = buildActualDatesMap([makeEntry({ category: 'watering' })]);
    expect(map.size).toBe(0);
  });

  it('handles multiple beds independently', () => {
    const map = buildActualDatesMap([
      makeEntry({ bed_id: 'bed-1', category: 'planting', date: '2026-04-01' }),
      makeEntry({ id: 'e2', bed_id: 'bed-2', category: 'planting', date: '2026-04-05' }),
    ]);
    expect(map.size).toBe(2);
    expect(map.get('bed-1')?.planted).toBe('2026-04-01');
    expect(map.get('bed-2')?.planted).toBe('2026-04-05');
  });

  it('returns empty map for empty entries', () => {
    expect(buildActualDatesMap([]).size).toBe(0);
  });

  it('excludes reserved entries from actual dates map', () => {
    const map = buildActualDatesMap([
      makeEntry({ bed_id: 'bed-1', category: 'planting', date: '2026-05-01', entry_type: 'reserved' as const }),
    ]);
    expect(map.size).toBe(0);
  });

  it('includes actual entries and excludes reserved — mixed input', () => {
    const map = buildActualDatesMap([
      makeEntry({ id: 'e1', bed_id: 'bed-1', category: 'planting', date: '2026-04-01', entry_type: 'actual' as const }),
      makeEntry({ id: 'e2', bed_id: 'bed-1', category: 'planting', date: '2026-05-15', entry_type: 'reserved' as const }),
    ]);
    expect(map.get('bed-1')?.planted).toBe('2026-04-01');
  });

  it('treats entries without entry_type as actual (backward compat)', () => {
    const entry = makeEntry({ bed_id: 'bed-1', category: 'planting', date: '2026-04-01' });
    delete (entry as Record<string, unknown>)['entry_type'];
    const map = buildActualDatesMap([entry]);
    expect(map.get('bed-1')?.planted).toBe('2026-04-01');
  });
});

// ── buildEventDotMap (#297) ──────────────────────────────────────

describe('buildEventDotMap', () => {
  const makeEntry = (overrides: Partial<DiaryEntryResponse>): DiaryEntryResponse => ({
    id: 'e1',
    farm_id: 'f1',
    date: '2026-04-10',
    category: 'planting',
    entry_type: 'actual' as const,
    description: 'test',
    time_spent_minutes: null,
    bed_id: 'bed-1',
    bed_name: 'A1',
    bed_crop_id: null,
    photo_ids: [],
    costs: [],
    cost_total: 0,
    created_by: 'u1',
    created_by_name: null,
    created_at: '2026-04-10T00:00:00Z',
    updated_at: '2026-04-10T00:00:00Z',
    harvest_amount: null,
    harvest_unit: null,
    revenue: null,
    revenue_currency: null,
    ...overrides,
  });

  it('groups entries by bed_id with correct dot data', () => {
    const map = buildEventDotMap([
      makeEntry({ id: 'e1', bed_id: 'bed-1', category: 'planting', date: '2026-04-10' }),
    ]);
    expect(map.size).toBe(1);
    const dots = map.get('bed-1')!;
    expect(dots).toHaveLength(1);
    expect(dots[0]).toEqual({ date: '2026-04-10', category: 'planting', color: '#22c55e', id: 'e1' });
  });

  it('excludes entries without bed_id', () => {
    const map = buildEventDotMap([
      makeEntry({ bed_id: null }),
    ]);
    expect(map.size).toBe(0);
  });

  it('includes all 9 categories', () => {
    const categories = ['planting', 'watering', 'fertilizing', 'harvesting', 'weeding', 'pest_control', 'maintenance', 'purchase', 'other'];
    const entries = categories.map((cat, i) =>
      makeEntry({ id: `e${i}`, bed_id: 'bed-1', category: cat, date: `2026-04-${String(i + 1).padStart(2, '0')}` }),
    );
    const map = buildEventDotMap(entries);
    const dots = map.get('bed-1')!;
    expect(dots).toHaveLength(9);
    // Each has a distinct color (except 'other' which shares gray)
    const colors = dots.map((d) => d.color);
    expect(colors).toContain('#22c55e'); // planting
    expect(colors).toContain('#3b82f6'); // watering
    expect(colors).toContain('#ef4444'); // pest_control
    expect(colors).toContain('#9ca3af'); // other
  });

  it('groups multiple beds independently', () => {
    const map = buildEventDotMap([
      makeEntry({ id: 'e1', bed_id: 'bed-1', category: 'planting', date: '2026-04-01' }),
      makeEntry({ id: 'e2', bed_id: 'bed-2', category: 'watering', date: '2026-04-05' }),
      makeEntry({ id: 'e3', bed_id: 'bed-1', category: 'harvesting', date: '2026-07-01' }),
    ]);
    expect(map.size).toBe(2);
    expect(map.get('bed-1')).toHaveLength(2);
    expect(map.get('bed-2')).toHaveLength(1);
  });

  it('sorts dots by date within each bed', () => {
    const map = buildEventDotMap([
      makeEntry({ id: 'e1', bed_id: 'bed-1', category: 'harvesting', date: '2026-07-01' }),
      makeEntry({ id: 'e2', bed_id: 'bed-1', category: 'planting', date: '2026-04-01' }),
      makeEntry({ id: 'e3', bed_id: 'bed-1', category: 'watering', date: '2026-05-15' }),
    ]);
    const dots = map.get('bed-1')!;
    expect(dots[0].date).toBe('2026-04-01');
    expect(dots[1].date).toBe('2026-05-15');
    expect(dots[2].date).toBe('2026-07-01');
  });

  it('returns empty map for empty input', () => {
    expect(buildEventDotMap([]).size).toBe(0);
  });

  it('unknown category falls back to "other" color', () => {
    const map = buildEventDotMap([
      makeEntry({ id: 'e1', bed_id: 'bed-1', category: 'unknown_category', date: '2026-04-10' }),
    ]);
    const dots = map.get('bed-1')!;
    expect(dots[0].color).toBe('#9ca3af'); // CATEGORY_META.other.color
  });

  it('includes both reserved and actual entries', () => {
    const map = buildEventDotMap([
      makeEntry({ id: 'e1', bed_id: 'bed-1', category: 'planting', entry_type: 'reserved' as const }),
      makeEntry({ id: 'e2', bed_id: 'bed-1', category: 'planting', entry_type: 'actual' as const, date: '2026-04-11' }),
    ]);
    expect(map.get('bed-1')).toHaveLength(2);
  });
});

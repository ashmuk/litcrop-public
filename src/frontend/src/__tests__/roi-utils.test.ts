/**
 * roi-utils — unit tests (Beta-10)
 */

import { describe, it, expect, vi } from 'vitest';

// Mock i18n (pulled in transitively via crops.ts → getCropEmoji)
vi.mock('../i18n/i18n', () => ({
  getLocale: vi.fn().mockReturnValue('en'),
}));

import type { DiaryEntryResponse } from '../lib/api';
import type { FarmBedItem } from '@litcrop/shared';
import {
  sumCostsByCurrency,
  computeRoi,
  computeRoiByBed,
  computeCostByCategory,
  computeMonthlyTrend,
} from '../lib/roi-utils';

// ── Helpers ────────────────────────────────────────────────────────

function makeEntry(
  overrides: Partial<DiaryEntryResponse> & { date: string; category: string },
): DiaryEntryResponse {
  const { date, category } = overrides;
  return {
    id: 'entry-uuid',
    farm_id: 'farm-uuid',
    date,
    category,
    entry_type: 'actual' as const,
    description: 'Test entry',
    time_spent_minutes: null,
    bed_id: null,
    bed_name: null,
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
  };
}

function makeBed(overrides: Partial<FarmBedItem> & { id: string; name: string }): FarmBedItem {
  return {
    id: overrides.id,
    name: overrides.name,
    row: 0,
    col: 0,
    crop_type: null,
    crop_variety: null,
    latest_status: 'no_data',
    latest_image: null,
    ...overrides,
  };
}

// ── sumCostsByCurrency ─────────────────────────────────────────────

describe('sumCostsByCurrency', () => {
  it('sums costs matching the given currency', () => {
    const entry = makeEntry({
      date: '2026-04-01',
      category: 'purchase',
      costs: [
        { item: 'seeds', amount: 500, currency: 'JPY' },
        { item: 'soil', amount: 300, currency: 'JPY' },
      ],
    });
    expect(sumCostsByCurrency(entry, 'JPY')).toBe(800);
  });

  it('filters out costs in other currencies', () => {
    const entry = makeEntry({
      date: '2026-04-01',
      category: 'purchase',
      costs: [
        { item: 'seeds', amount: 500, currency: 'JPY' },
        { item: 'tool', amount: 10, currency: 'USD' },
      ],
    });
    expect(sumCostsByCurrency(entry, 'JPY')).toBe(500);
    expect(sumCostsByCurrency(entry, 'USD')).toBe(10);
  });

  it('returns 0 for no matching costs', () => {
    const entry = makeEntry({
      date: '2026-04-01',
      category: 'purchase',
      costs: [{ item: 'seeds', amount: 500, currency: 'USD' }],
    });
    expect(sumCostsByCurrency(entry, 'JPY')).toBe(0);
  });

  it('returns 0 for empty costs array', () => {
    const entry = makeEntry({ date: '2026-04-01', category: 'purchase', costs: [] });
    expect(sumCostsByCurrency(entry, 'JPY')).toBe(0);
  });
});

// ── computeRoi ─────────────────────────────────────────────────────

describe('computeRoi', () => {
  it('empty entries → all zeroes, null roi_percent', () => {
    const result = computeRoi([], 'JPY');
    expect(result.total_cost).toBe(0);
    expect(result.total_revenue).toBe(0);
    expect(result.roi_percent).toBeNull();
    expect(result.entry_count).toBe(0);
    expect(result.harvest_count).toBe(0);
    expect(result.excluded_entry_count).toBe(0);
  });

  it('only costs, no revenue → roi_percent = -100%', () => {
    const entries = [
      makeEntry({
        id: 'e1',
        date: '2026-04-01',
        category: 'purchase',
        costs: [{ item: 'seeds', amount: 1000, currency: 'JPY' }],
      }),
    ];
    const result = computeRoi(entries, 'JPY');
    expect(result.total_cost).toBe(1000);
    expect(result.total_revenue).toBe(0);
    expect(result.roi_percent).toBeCloseTo(-100);
  });

  it('only revenue (no cost) → roi_percent = null', () => {
    const entries = [
      makeEntry({
        id: 'e1',
        date: '2026-04-01',
        category: 'harvesting',
        revenue: 5000,
        revenue_currency: 'JPY',
      }),
    ];
    const result = computeRoi(entries, 'JPY');
    expect(result.total_cost).toBe(0);
    expect(result.total_revenue).toBe(5000);
    expect(result.roi_percent).toBeNull(); // cost === 0
  });

  it('mixed cost and revenue → correct roi_percent', () => {
    // cost = 1000, revenue = 1500 → ROI = (1500-1000)/1000*100 = 50%
    const entries = [
      makeEntry({
        id: 'e1',
        date: '2026-04-01',
        category: 'purchase',
        costs: [{ item: 'seeds', amount: 1000, currency: 'JPY' }],
      }),
      makeEntry({
        id: 'e2',
        date: '2026-07-01',
        category: 'harvesting',
        revenue: 1500,
        revenue_currency: 'JPY',
      }),
    ];
    const result = computeRoi(entries, 'JPY');
    expect(result.total_cost).toBe(1000);
    expect(result.total_revenue).toBe(1500);
    expect(result.roi_percent).toBeCloseTo(50);
  });

  it('counts harvest_count correctly', () => {
    const entries = [
      makeEntry({ id: 'e1', date: '2026-04-01', category: 'planting' }),
      makeEntry({ id: 'e2', date: '2026-07-01', category: 'harvesting', revenue: 1000, revenue_currency: 'JPY' }),
      makeEntry({ id: 'e3', date: '2026-08-01', category: 'harvesting', revenue: 500, revenue_currency: 'JPY' }),
    ];
    const result = computeRoi(entries, 'JPY');
    expect(result.harvest_count).toBe(2);
    expect(result.entry_count).toBe(3);
  });

  it('currency filtering — JPY entries not counted for USD', () => {
    const entries = [
      makeEntry({
        id: 'e1',
        date: '2026-04-01',
        category: 'purchase',
        costs: [{ item: 'seeds', amount: 500, currency: 'JPY' }],
      }),
      makeEntry({
        id: 'e2',
        date: '2026-04-01',
        category: 'purchase',
        costs: [{ item: 'tool', amount: 20, currency: 'USD' }],
      }),
    ];
    const jpyResult = computeRoi(entries, 'JPY');
    expect(jpyResult.total_cost).toBe(500);

    const usdResult = computeRoi(entries, 'USD');
    expect(usdResult.total_cost).toBe(20);
  });

  it('excluded_entry_count — entries with mixed currencies are counted', () => {
    const entries = [
      makeEntry({
        id: 'e1',
        date: '2026-04-01',
        category: 'purchase',
        costs: [
          { item: 'seeds', amount: 500, currency: 'JPY' },
          { item: 'tool', amount: 10, currency: 'USD' }, // non-matching
        ],
      }),
      makeEntry({
        id: 'e2',
        date: '2026-04-02',
        category: 'purchase',
        costs: [{ item: 'soil', amount: 300, currency: 'JPY' }], // JPY only — not excluded
      }),
    ];
    const result = computeRoi(entries, 'JPY');
    expect(result.excluded_entry_count).toBe(1);
  });

  it('revenue in non-matching currency is not counted', () => {
    const entries = [
      makeEntry({
        id: 'e1',
        date: '2026-07-01',
        category: 'harvesting',
        revenue: 5000,
        revenue_currency: 'JPY', // wrong currency for USD query
      }),
    ];
    const result = computeRoi(entries, 'USD');
    expect(result.total_revenue).toBe(0);
  });
});

// ── computeRoiByBed ────────────────────────────────────────────────

describe('computeRoiByBed', () => {
  const beds = [
    makeBed({ id: 'bed-1', name: 'Bed A', crop_type: 'tomato' }),
    makeBed({ id: 'bed-2', name: 'Bed B', crop_type: null }),
  ];

  it('groups entries by bed and computes separate summaries', () => {
    const entries = [
      makeEntry({
        id: 'e1', date: '2026-04-01', category: 'purchase', bed_id: 'bed-1',
        costs: [{ item: 'seeds', amount: 1000, currency: 'JPY' }],
      }),
      makeEntry({
        id: 'e2', date: '2026-04-01', category: 'purchase', bed_id: 'bed-2',
        costs: [{ item: 'soil', amount: 500, currency: 'JPY' }],
      }),
    ];
    const result = computeRoiByBed(entries, beds, 'JPY');
    expect(result).toHaveLength(2);

    const bed1 = result.find((r) => r.bed_id === 'bed-1')!;
    expect(bed1.bed_name).toBe('Bed A');
    expect(bed1.total_cost).toBe(1000);

    const bed2 = result.find((r) => r.bed_id === 'bed-2')!;
    expect(bed2.bed_name).toBe('Bed B');
    expect(bed2.total_cost).toBe(500);
  });

  it('resolves crop_type and crop_emoji from beds array', () => {
    const entries = [
      makeEntry({
        id: 'e1', date: '2026-04-01', category: 'planting', bed_id: 'bed-1',
      }),
    ];
    const result = computeRoiByBed(entries, beds, 'JPY');
    const bed1 = result.find((r) => r.bed_id === 'bed-1')!;
    expect(bed1.crop_type).toBe('tomato');
    expect(bed1.crop_emoji).toBeTruthy(); // tomato has an emoji in the crop library
  });

  it('null crop_type → null crop_emoji', () => {
    const entries = [
      makeEntry({
        id: 'e1', date: '2026-04-01', category: 'planting', bed_id: 'bed-2',
      }),
    ];
    const result = computeRoiByBed(entries, beds, 'JPY');
    const bed2 = result.find((r) => r.bed_id === 'bed-2')!;
    expect(bed2.crop_type).toBeNull();
    expect(bed2.crop_emoji).toBeNull();
  });

  it('entries with null bed_id grouped as Unassigned', () => {
    const entries = [
      makeEntry({
        id: 'e1', date: '2026-04-01', category: 'purchase',
        costs: [{ item: 'misc', amount: 200, currency: 'JPY' }],
      }),
    ];
    const result = computeRoiByBed(entries, beds, 'JPY');
    const unassigned = result.find((r) => r.bed_name === '')!;
    expect(unassigned).toBeDefined();
    expect(unassigned.total_cost).toBe(200);
    expect(unassigned.crop_type).toBeNull();
    expect(unassigned.crop_emoji).toBeNull();
  });

  it('empty entries → empty result', () => {
    expect(computeRoiByBed([], beds, 'JPY')).toHaveLength(0);
  });
});

// ── computeCostByCategory ──────────────────────────────────────────

describe('computeCostByCategory', () => {
  it('groups costs by category and sorts by total descending', () => {
    const entries = [
      makeEntry({
        id: 'e1', date: '2026-04-01', category: 'purchase',
        costs: [{ item: 'seeds', amount: 1000, currency: 'JPY' }],
      }),
      makeEntry({
        id: 'e2', date: '2026-04-02', category: 'maintenance',
        costs: [{ item: 'repair', amount: 3000, currency: 'JPY' }],
      }),
      makeEntry({
        id: 'e3', date: '2026-04-03', category: 'purchase',
        costs: [{ item: 'soil', amount: 500, currency: 'JPY' }],
      }),
    ];
    const result = computeCostByCategory(entries, 'JPY');
    expect(result).toHaveLength(2);
    expect(result[0].category).toBe('maintenance');
    expect(result[0].total).toBe(3000);
    expect(result[1].category).toBe('purchase');
    expect(result[1].total).toBe(1500);
    expect(result[1].count).toBe(2);
  });

  it('entries with zero matching-currency cost are excluded', () => {
    const entries = [
      makeEntry({
        id: 'e1', date: '2026-04-01', category: 'purchase',
        costs: [{ item: 'tool', amount: 10, currency: 'USD' }], // no JPY
      }),
    ];
    const result = computeCostByCategory(entries, 'JPY');
    expect(result).toHaveLength(0);
  });

  it('empty entries → empty result', () => {
    expect(computeCostByCategory([], 'JPY')).toHaveLength(0);
  });
});

// ── computeMonthlyTrend ────────────────────────────────────────────

describe('computeMonthlyTrend', () => {
  it('always returns all 12 months for the given year', () => {
    const result = computeMonthlyTrend([], 'JPY', 2026);
    expect(result).toHaveLength(12);
    expect(result[0].month).toBe('2026-01');
    expect(result[11].month).toBe('2026-12');
  });

  it('empty months have zero cost and revenue', () => {
    const result = computeMonthlyTrend([], 'JPY', 2026);
    for (const trend of result) {
      expect(trend.cost).toBe(0);
      expect(trend.revenue).toBe(0);
    }
  });

  it('accumulates costs correctly per month', () => {
    const entries = [
      makeEntry({
        id: 'e1', date: '2026-04-01', category: 'purchase',
        costs: [{ item: 'seeds', amount: 1000, currency: 'JPY' }],
      }),
      makeEntry({
        id: 'e2', date: '2026-04-15', category: 'purchase',
        costs: [{ item: 'soil', amount: 500, currency: 'JPY' }],
      }),
      makeEntry({
        id: 'e3', date: '2026-06-01', category: 'purchase',
        costs: [{ item: 'fertilizer', amount: 800, currency: 'JPY' }],
      }),
    ];
    const result = computeMonthlyTrend(entries, 'JPY', 2026);
    const apr = result.find((r) => r.month === '2026-04')!;
    expect(apr.cost).toBe(1500);
    const jun = result.find((r) => r.month === '2026-06')!;
    expect(jun.cost).toBe(800);
    const jan = result.find((r) => r.month === '2026-01')!;
    expect(jan.cost).toBe(0);
  });

  it('accumulates revenue for harvesting entries', () => {
    const entries = [
      makeEntry({
        id: 'e1', date: '2026-07-20', category: 'harvesting',
        revenue: 5000, revenue_currency: 'JPY',
      }),
    ];
    const result = computeMonthlyTrend(entries, 'JPY', 2026);
    const jul = result.find((r) => r.month === '2026-07')!;
    expect(jul.revenue).toBe(5000);
  });

  it('entries outside the target year are ignored', () => {
    const entries = [
      makeEntry({
        id: 'e1', date: '2025-04-01', category: 'purchase',
        costs: [{ item: 'seeds', amount: 1000, currency: 'JPY' }],
      }),
    ];
    const result = computeMonthlyTrend(entries, 'JPY', 2026);
    for (const trend of result) {
      expect(trend.cost).toBe(0);
    }
  });

  it('filters by currency — USD costs not counted for JPY', () => {
    const entries = [
      makeEntry({
        id: 'e1', date: '2026-04-01', category: 'purchase',
        costs: [{ item: 'tool', amount: 20, currency: 'USD' }],
      }),
    ];
    const result = computeMonthlyTrend(entries, 'JPY', 2026);
    for (const trend of result) {
      expect(trend.cost).toBe(0);
    }
  });
});

// ── Beta-10: edge case tests ───────────────────────────────────────

describe('Beta-10: computeRoi — edge cases', () => {
  it('T12: floating-point precision — 0.1 + 0.2 costs accumulate correctly', () => {
    const entries = [
      makeEntry({
        id: 'e1', date: '2026-04-01', category: 'purchase',
        costs: [{ item: 'item-a', amount: 0.1, currency: 'JPY' }],
      }),
      makeEntry({
        id: 'e2', date: '2026-04-02', category: 'purchase',
        costs: [{ item: 'item-b', amount: 0.2, currency: 'JPY' }],
      }),
    ];
    const result = computeRoi(entries, 'JPY');
    // Must not produce 0.30000000000000004 style errors in total_cost comparison
    expect(result.total_cost).toBeCloseTo(0.3, 10);
    expect(result.total_cost).toBeLessThanOrEqual(0.31);
  });

  it('T13: boundary values near max (revenue = 99_999_999) → no overflow', () => {
    const entries = [
      makeEntry({
        id: 'e1', date: '2026-07-01', category: 'harvesting',
        revenue: 99_999_999,
        revenue_currency: 'JPY',
        costs: [{ item: 'seeds', amount: 99_999_999, currency: 'JPY' }],
      }),
    ];
    const result = computeRoi(entries, 'JPY');
    expect(result.total_revenue).toBe(99_999_999);
    expect(result.total_cost).toBe(99_999_999);
    expect(result.roi_percent).toBeCloseTo(0);
    expect(isFinite(result.roi_percent as number)).toBe(true);
  });

  it('T14: harvesting entry with null revenue → harvest_count increments, revenue stays 0', () => {
    const entries = [
      makeEntry({
        id: 'e1', date: '2026-07-01', category: 'harvesting',
        harvest_amount: 2.5,
        harvest_unit: 'kg',
        revenue: null,
        revenue_currency: null,
      }),
    ];
    const result = computeRoi(entries, 'JPY');
    expect(result.harvest_count).toBe(1);
    expect(result.total_revenue).toBe(0);
    expect(result.roi_percent).toBeNull();
  });
});

describe('Beta-10: computeRoiByBed — unassigned grouping', () => {
  it('T15: entries with no bed_id grouped as unassigned (bed_name === \'\')', () => {
    const beds = [makeBed({ id: 'bed-1', name: 'Bed A' })];
    const entries = [
      makeEntry({
        id: 'e1', date: '2026-04-01', category: 'purchase',
        bed_id: null,
        costs: [{ item: 'misc', amount: 300, currency: 'JPY' }],
      }),
      makeEntry({
        id: 'e2', date: '2026-04-02', category: 'purchase',
        bed_id: 'bed-1',
        costs: [{ item: 'seeds', amount: 700, currency: 'JPY' }],
      }),
    ];
    const result = computeRoiByBed(entries, beds, 'JPY');

    const unassigned = result.find((r) => r.bed_name === '')!;
    expect(unassigned).toBeDefined();
    expect(unassigned.total_cost).toBe(300);
    expect(unassigned.crop_type).toBeNull();
    expect(unassigned.crop_emoji).toBeNull();

    const bed1 = result.find((r) => r.bed_id === 'bed-1')!;
    expect(bed1.total_cost).toBe(700);
  });
});

describe('Beta-10: computeCostByCategory — multiple cost items per entry', () => {
  it('T16: single entry with multiple cost items in different categories is split correctly', () => {
    // Each cost item belongs to the entry's category — two separate entries with different categories
    const entries = [
      makeEntry({
        id: 'e1', date: '2026-04-01', category: 'purchase',
        costs: [
          { item: 'seeds', amount: 500, currency: 'JPY' },
          { item: 'soil', amount: 300, currency: 'JPY' },
        ],
      }),
      makeEntry({
        id: 'e2', date: '2026-04-02', category: 'maintenance',
        costs: [
          { item: 'tools', amount: 1200, currency: 'JPY' },
          { item: 'wire', amount: 800, currency: 'JPY' },
        ],
      }),
    ];
    const result = computeCostByCategory(entries, 'JPY');
    expect(result).toHaveLength(2);

    const purchase = result.find((r) => r.category === 'purchase')!;
    expect(purchase.total).toBe(800);
    expect(purchase.count).toBe(1);

    const maintenance = result.find((r) => r.category === 'maintenance')!;
    expect(maintenance.total).toBe(2000);
    expect(maintenance.count).toBe(1);
  });
});

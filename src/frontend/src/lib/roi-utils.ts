/**
 * roi-utils — Beta-10: ROI Dashboard
 *
 * Pure aggregation functions for computing ROI metrics from diary entries.
 * No side effects, no DOM access, no i18n calls (except getCropEmoji).
 */

import type { DiaryEntryResponse } from './api';
import type { FarmBedItem, BedCrop } from '@litcrop/shared';
import { getCropEmoji } from './crops';

// ── Result types ───────────────────────────────────────────────────

export interface RoiSummary {
  total_cost: number;
  total_revenue: number;
  roi_percent: number | null; // null when total_cost === 0
  entry_count: number;
  harvest_count: number;
  excluded_entry_count: number; // entries with costs in non-default currency
}

export interface BedRoiSummary extends RoiSummary {
  bed_id: string;
  bed_name: string;
  crop_type: string | null;
  crop_emoji: string | null;
}

export type RoiScope = 'farm' | 'bed' | 'crop';

/**
 * Row-level ROI summary for the per-crop table (Wave D-5). One row per
 * (scope, target) tuple: one `farm` row when any entries have no bed_id,
 * one `bed` row per bed that holds bed-level or legacy entries (bed_crop_id
 * null), and one `crop` row per real BedCrop that has entries.
 */
export interface BedCropRoiSummary extends RoiSummary {
  key: string;                    // stable row id
  scope: RoiScope;
  bed_id: string | null;          // null only when scope === 'farm'
  bed_name: string;               // '' when scope === 'farm'
  bed_crop_id: string | null;     // set only when scope === 'crop'
  crop_type: string | null;
  crop_emoji: string | null;
}

export interface CategoryCostSummary {
  category: string;
  total: number;
  count: number;
}

export interface MonthlyTrend {
  month: string; // YYYY-MM
  cost: number;
  revenue: number;
}

// ── Internal helpers ───────────────────────────────────────────────

/**
 * Sum costs[] items filtered by currency.
 * Do NOT use cost_total — it mixes currencies.
 */
export function sumCostsByCurrency(
  entry: DiaryEntryResponse,
  currency: string,
): number {
  let sum = 0;
  for (const c of entry.costs) {
    if (c.currency === currency) {
      sum += c.amount;
    }
  }
  return sum;
}

/**
 * Returns the revenue for a harvesting entry when it matches the given
 * currency, or 0 otherwise. Centralises the repeated harvesting-revenue guard.
 */
function harvestRevenue(entry: DiaryEntryResponse, currency: string): number {
  if (
    entry.category === 'harvesting' &&
    entry.revenue != null &&
    entry.revenue_currency === currency
  ) {
    return entry.revenue;
  }
  return 0;
}

/**
 * Returns true when an entry has at least one cost item in a currency other
 * than the requested currency. Used to detect "excluded" entries.
 */
function hasNonMatchingCurrency(entry: DiaryEntryResponse, currency: string): boolean {
  return entry.costs.some((c) => c.currency !== currency);
}

// ── computeRoi ─────────────────────────────────────────────────────

/**
 * Compute farm-wide ROI across all diary entries for the given currency.
 *
 * - total_cost: sum of all costs[] items matching currency
 * - total_revenue: sum of revenue field from harvesting entries where revenue_currency matches
 * - roi_percent: ((revenue - cost) / cost) * 100, null when cost === 0
 * - excluded_entry_count: entries that contain any cost item in a non-matching currency
 */
export function computeRoi(
  entries: DiaryEntryResponse[],
  currency: string,
): RoiSummary {
  let total_cost = 0;
  let total_revenue = 0;
  let harvest_count = 0;
  let excluded_entry_count = 0;

  for (const entry of entries) {
    total_cost += sumCostsByCurrency(entry, currency);

    if (entry.category === 'harvesting') {
      harvest_count += 1;
      total_revenue += harvestRevenue(entry, currency);
    }

    if (hasNonMatchingCurrency(entry, currency)) {
      excluded_entry_count += 1;
    }
  }

  const roi_percent =
    total_cost === 0
      ? null
      : ((total_revenue - total_cost) / total_cost) * 100;

  return {
    total_cost,
    total_revenue,
    roi_percent,
    entry_count: entries.length,
    harvest_count,
    excluded_entry_count,
  };
}

// ── computeRoiByBed ────────────────────────────────────────────────

const UNASSIGNED_BED_ID = '__unassigned__';

/**
 * Compute per-bed ROI summaries.
 *
 * Entries with null bed_id are grouped under an "Unassigned" pseudo-bed.
 * Bed metadata (name, crop_type, emoji) is resolved from the beds array.
 */
export function computeRoiByBed(
  entries: DiaryEntryResponse[],
  beds: FarmBedItem[],
  currency: string,
): BedRoiSummary[] {
  // Build a bed lookup map
  const bedMap = new Map<string, FarmBedItem>();
  for (const bed of beds) {
    bedMap.set(bed.id, bed);
  }

  // Group entries by bed_id
  const groups = new Map<string, DiaryEntryResponse[]>();
  for (const entry of entries) {
    const key = entry.bed_id ?? UNASSIGNED_BED_ID;
    const group = groups.get(key);
    if (group) {
      group.push(entry);
    } else {
      groups.set(key, [entry]);
    }
  }

  const results: BedRoiSummary[] = [];

  for (const [bedId, group] of groups) {
    const summary = computeRoi(group, currency);

    const bed = bedMap.get(bedId);
    const isUnassigned = bedId === UNASSIGNED_BED_ID;
    const crop_type = isUnassigned ? null : (bed?.crop_type ?? null);

    results.push({
      ...summary,
      bed_id: bedId,
      bed_name: isUnassigned ? '' : (bed?.name ?? bedId),
      crop_type,
      crop_emoji: crop_type ? getCropEmoji(crop_type) : null,
    });
  }

  // Default sort: highest cost first
  results.sort((a, b) => b.total_cost - a.total_cost);

  return results;
}

// ── computeRoiByBedCrop ────────────────────────────────────────────

const FARM_SCOPE_KEY = '__farm__';

/** Identity + display metadata for a bucket; filled once at bucket creation. */
type BucketMeta = Omit<BedCropRoiSummary, keyof RoiSummary>;

/**
 * Compute per-(bed, crop) ROI summaries — Wave D-5.
 *
 * Bucketing:
 *   - entry.bed_crop_id set AND matches a real BedCrop → crop-scope row
 *     (one per bed_crop_id); crop_type/emoji sourced from BedCrop.
 *   - entry.bed_crop_id null, entry.bed_id set → bed-scope row (one per bed).
 *     crop_type falls back to bed.crop_type (legacy) so the label carries
 *     meaning for pre-Wave-D data; null otherwise.
 *   - entry.bed_id null → single farm-scope row.
 *   - entry.bed_crop_id points to a crop missing from bedCropsMap → graceful
 *     degradation to bed-scope bucket under the entry's bed_id (matches the
 *     "failure degrades to bed-only" pattern in DiaryEntryForm).
 */
export function computeRoiByBedCrop(
  entries: DiaryEntryResponse[],
  beds: FarmBedItem[],
  bedCropsMap: Record<string, BedCrop[]>,
  currency: string,
): BedCropRoiSummary[] {
  const bedMap = new Map<string, FarmBedItem>();
  for (const bed of beds) bedMap.set(bed.id, bed);

  const cropMap = new Map<string, BedCrop>();
  for (const crops of Object.values(bedCropsMap)) {
    for (const c of crops) cropMap.set(c.id, c);
  }

  function metaFor(entry: DiaryEntryResponse): BucketMeta {
    const crop = entry.bed_crop_id ? cropMap.get(entry.bed_crop_id) : undefined;

    if (crop) {
      const bed = bedMap.get(crop.bed_id);
      return {
        key: `crop:${crop.id}`,
        scope: 'crop',
        bed_id: crop.bed_id,
        bed_name: bed?.name ?? crop.bed_id,
        bed_crop_id: crop.id,
        crop_type: crop.crop_type,
        crop_emoji: getCropEmoji(crop.crop_type),
      };
    }

    if (entry.bed_id) {
      const bed = bedMap.get(entry.bed_id);
      // If the bed has any active/planned BedCrops, show "(All)" (crop_type null)
      // to match the D4 DiaryEntryForm label. Only fall back to bed.crop_type for
      // true legacy beds that have never had a BedCrop record.
      const bedCrops = bedCropsMap[entry.bed_id];
      const hasActiveCrops = bedCrops?.some(
        (c) => c.status === 'active' || c.status === 'planned',
      ) ?? false;
      const legacyCropType = hasActiveCrops ? null : (bed?.crop_type ?? null);
      return {
        key: `bed:${entry.bed_id}`,
        scope: 'bed',
        bed_id: entry.bed_id,
        bed_name: bed?.name ?? entry.bed_id,
        bed_crop_id: null,
        crop_type: legacyCropType,
        crop_emoji: legacyCropType ? getCropEmoji(legacyCropType) : null,
      };
    }

    return {
      key: FARM_SCOPE_KEY,
      scope: 'farm',
      bed_id: null,
      bed_name: '',
      bed_crop_id: null,
      crop_type: null,
      crop_emoji: null,
    };
  }

  const groups = new Map<string, { entries: DiaryEntryResponse[]; meta: BucketMeta }>();
  for (const entry of entries) {
    const meta = metaFor(entry);
    const existing = groups.get(meta.key);
    if (existing) {
      existing.entries.push(entry);
    } else {
      groups.set(meta.key, { entries: [entry], meta });
    }
  }

  const results: BedCropRoiSummary[] = [];
  for (const { entries: group, meta } of groups.values()) {
    results.push({ ...computeRoi(group, currency), ...meta });
  }

  results.sort((a, b) => b.total_cost - a.total_cost);

  return results;
}

// ── computeCostByCategory ──────────────────────────────────────────

/**
 * Group costs by diary entry category and sort by total descending.
 */
export function computeCostByCategory(
  entries: DiaryEntryResponse[],
  currency: string,
): CategoryCostSummary[] {
  const map = new Map<string, { total: number; count: number }>();

  for (const entry of entries) {
    const cost = sumCostsByCurrency(entry, currency);
    if (cost === 0) continue;

    const existing = map.get(entry.category);
    if (existing) {
      existing.total += cost;
      existing.count += 1;
    } else {
      map.set(entry.category, { total: cost, count: 1 });
    }
  }

  return [...map.entries()]
    .map(([category, { total, count }]) => ({ category, total, count }))
    .sort((a, b) => b.total - a.total);
}

// ── computeMonthlyTrend ────────────────────────────────────────────

/**
 * Group diary costs and revenue by calendar month.
 * All 12 months of the given year are included (empty months get 0s).
 */
export function computeMonthlyTrend(
  entries: DiaryEntryResponse[],
  currency: string,
  year: number,
): MonthlyTrend[] {
  // Seed all 12 months with zeros
  const months = new Map<string, MonthlyTrend>();
  for (let m = 1; m <= 12; m++) {
    const month = `${year}-${String(m).padStart(2, '0')}`;
    months.set(month, { month, cost: 0, revenue: 0 });
  }

  for (const entry of entries) {
    // entry.date is YYYY-MM-DD; extract YYYY-MM
    const month = entry.date.slice(0, 7);
    const trend = months.get(month);
    if (!trend) continue; // outside target year

    trend.cost += sumCostsByCurrency(entry, currency);
    trend.revenue += harvestRevenue(entry, currency);
  }

  return [...months.values()];
}

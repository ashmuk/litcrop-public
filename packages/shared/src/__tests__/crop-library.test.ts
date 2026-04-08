import { describe, it, expect } from 'vitest';
import { CROPS, CROP_MAP, getCropMeta, estimateHarvestDate } from '../crop-library';
import type { CropEntry } from '../crop-library';

describe('CROPS data', () => {
  it('has 100 entries', () => {
    expect(CROPS).toHaveLength(100);
  });

  it('every entry has required base fields', () => {
    for (const c of CROPS) {
      expect(c.id).toBeTruthy();
      expect(c.emoji).toBeTruthy();
      expect(c.category).toBeTruthy();
      expect(c.en).toBeTruthy();
      expect(c.ja).toBeTruthy();
    }
  });

  it('most entries have growing metadata', () => {
    const withMeta = CROPS.filter((c) => c.days_to_harvest_min != null);
    expect(withMeta.length).toBeGreaterThanOrEqual(95);
  });

  it('days_to_harvest_min <= days_to_harvest_max for all entries', () => {
    for (const c of CROPS) {
      if (c.days_to_harvest_min != null && c.days_to_harvest_max != null) {
        expect(c.days_to_harvest_min).toBeLessThanOrEqual(c.days_to_harvest_max);
      }
    }
  });

  it('37 entries have seed-to-seedling data', () => {
    const withSeed = CROPS.filter((c) => c.days_seed_to_seedling_min != null);
    expect(withSeed.length).toBe(37);
  });

  it('days_seed_to_seedling_min <= max for all entries', () => {
    for (const c of CROPS) {
      if (c.days_seed_to_seedling_min != null && c.days_seed_to_seedling_max != null) {
        expect(c.days_seed_to_seedling_min).toBeLessThanOrEqual(c.days_seed_to_seedling_max);
      }
    }
  });

  it('seed-to-seedling fields are paired (both or neither)', () => {
    for (const c of CROPS) {
      const hasMin = c.days_seed_to_seedling_min != null;
      const hasMax = c.days_seed_to_seedling_max != null;
      expect(hasMin).toBe(hasMax);
    }
  });

  it('season values are valid', () => {
    const valid = new Set(['spring', 'summer', 'fall', 'winter']);
    for (const c of CROPS) {
      if (c.season) {
        for (const s of c.season) {
          expect(valid.has(s)).toBe(true);
        }
      }
    }
  });

  it('companion refs are valid crop ids', () => {
    const ids = new Set(CROPS.map((c) => c.id));
    for (const c of CROPS) {
      if (c.companions) {
        for (const comp of c.companions) {
          expect(ids.has(comp)).toBe(true);
        }
      }
    }
  });
});

describe('CROP_MAP', () => {
  it('has same count as CROPS', () => {
    expect(CROP_MAP.size).toBe(CROPS.length);
  });

  it('lookups return correct entries', () => {
    const tomato = CROP_MAP.get('tomato');
    expect(tomato).toBeDefined();
    expect(tomato!.en).toBe('Tomato');
    expect(tomato!.emoji).toBe('🍅');
  });
});

describe('getCropMeta', () => {
  it('returns entry for known crop', () => {
    const meta = getCropMeta('tomato');
    expect(meta).toBeDefined();
    expect(meta!.days_to_harvest_min).toBeGreaterThan(0);
    expect(meta!.days_to_harvest_max).toBeGreaterThan(meta!.days_to_harvest_min!);
    expect(meta!.season).toContain('spring');
  });

  it('returns undefined for unknown crop', () => {
    expect(getCropMeta('unicorn_fruit')).toBeUndefined();
  });

  it('returns undefined for empty string', () => {
    expect(getCropMeta('')).toBeUndefined();
  });

  it('returns entry without metadata for "other"', () => {
    const other = getCropMeta('other');
    expect(other).toBeDefined();
    expect(other!.days_to_harvest_min).toBeUndefined();
  });
});

describe('estimateHarvestDate', () => {
  it('calculates harvest date for known crop', () => {
    // tomato: days_to_harvest_max = 85
    expect(estimateHarvestDate('2026-04-01', 'tomato')).toBe('2026-06-25');
  });

  it('returns null for unknown crop', () => {
    expect(estimateHarvestDate('2026-04-01', 'unicorn_fruit')).toBeNull();
  });

  it('returns null for crop without harvest data (other)', () => {
    expect(estimateHarvestDate('2026-04-01', 'other')).toBeNull();
  });

  it('returns null for crop without harvest data (tea)', () => {
    expect(estimateHarvestDate('2026-04-01', 'tea')).toBeNull();
  });

  it('handles month boundary correctly', () => {
    // rice: days_to_harvest_max = 150
    const result = estimateHarvestDate('2026-01-01', 'rice');
    expect(result).toBe('2026-05-31');
  });

  it('handles year boundary', () => {
    // cabbage: days_to_harvest_max = 90
    const result = estimateHarvestDate('2026-11-01', 'cabbage');
    expect(result).toBe('2027-01-30');
  });
});

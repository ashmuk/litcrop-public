import { describe, it, expect } from 'vitest';
import { CROPS, CROP_MAP, getCropMeta } from '../crop-library';
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

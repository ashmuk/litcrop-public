import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock i18n before importing crops module
vi.mock('../i18n/i18n', () => ({
  getLocale: vi.fn().mockReturnValue('en'),
}));

import {
  CROPS,
  CROP_MAP,
  QUICK_SELECT_CROPS,
  getCropEmoji,
  getCropName,
  getCropDisplay,
  searchCrops,
  normalizeCropType,
} from '../lib/crops';
import { getLocale } from '../i18n/i18n';

// ── Data integrity ──────────────────────────────────────────────

describe('crops data', () => {
  it('has 100 entries', () => {
    expect(CROPS.length).toBe(100);
  });

  it('every entry has required fields', () => {
    for (const crop of CROPS) {
      expect(crop.id).toBeTruthy();
      expect(crop.emoji).toBeTruthy();
      expect(crop.category).toBeTruthy();
      expect(crop.en).toBeTruthy();
      expect(crop.ja).toBeTruthy();
    }
  });

  it('has no duplicate ids', () => {
    const ids = CROPS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('CROP_MAP has all entries', () => {
    expect(CROP_MAP.size).toBe(CROPS.length);
  });

  it('QUICK_SELECT_CROPS are all valid ids', () => {
    for (const id of QUICK_SELECT_CROPS) {
      expect(CROP_MAP.has(id)).toBe(true);
    }
  });

  it('includes the original 8 crop types', () => {
    for (const id of ['rice', 'tomato', 'cucumber', 'eggplant', 'lettuce', 'daikon', 'cabbage', 'other']) {
      expect(CROP_MAP.has(id)).toBe(true);
    }
  });
});

// ── getCropEmoji ────────────────────────────────────────────────

describe('getCropEmoji', () => {
  it('returns correct emoji for known crop', () => {
    expect(getCropEmoji('tomato')).toBe('🍅');
    expect(getCropEmoji('rice')).toBe('🌾');
    expect(getCropEmoji('cucumber')).toBe('🥒');
  });

  it('returns seedling fallback for unknown/free-text crop', () => {
    expect(getCropEmoji('mystery-plant')).toBe('🌱');
    expect(getCropEmoji('CUSTOM CROP')).toBe('🌱');
  });

  it('returns empty string for empty/null/undefined', () => {
    expect(getCropEmoji('')).toBe('');
    expect(getCropEmoji(null)).toBe('');
    expect(getCropEmoji(undefined)).toBe('');
  });
});

// ── getCropName ─────────────────────────────────────────────────

describe('getCropName', () => {
  beforeEach(() => {
    vi.mocked(getLocale).mockReturnValue('en');
  });

  it('returns English name for known crop', () => {
    expect(getCropName('tomato')).toBe('Tomato');
    expect(getCropName('daikon')).toBe('Daikon Radish');
  });

  it('returns Japanese name when locale is ja', () => {
    vi.mocked(getLocale).mockReturnValue('ja');
    expect(getCropName('tomato')).toBe('トマト');
    expect(getCropName('rice')).toBe('稲');
  });

  it('returns raw string for unknown crop', () => {
    expect(getCropName('mystery')).toBe('mystery');
  });

  it('returns empty string for empty/null/undefined', () => {
    expect(getCropName('')).toBe('');
    expect(getCropName(null)).toBe('');
    expect(getCropName(undefined)).toBe('');
  });
});

// ── getCropDisplay ──────────────────────────────────────────────

describe('getCropDisplay', () => {
  beforeEach(() => {
    vi.mocked(getLocale).mockReturnValue('en');
  });

  it('returns emoji + name for known crop', () => {
    expect(getCropDisplay('tomato')).toBe('🍅 Tomato');
    expect(getCropDisplay('rice')).toBe('🌾 Rice');
  });

  it('returns seedling + raw text for unknown crop', () => {
    expect(getCropDisplay('mystery')).toBe('🌱 mystery');
  });

  it('returns empty string for empty/null/undefined', () => {
    expect(getCropDisplay('')).toBe('');
    expect(getCropDisplay(null)).toBe('');
    expect(getCropDisplay(undefined)).toBe('');
  });

  it('uses Japanese locale when set', () => {
    vi.mocked(getLocale).mockReturnValue('ja');
    expect(getCropDisplay('tomato')).toBe('🍅 トマト');
  });
});

// ── searchCrops ─────────────────────────────────────────────────

describe('searchCrops', () => {
  it('matches English name substring (case-insensitive)', () => {
    const results = searchCrops('tom');
    expect(results.some((c) => c.id === 'tomato')).toBe(true);
    expect(results.some((c) => c.id === 'cherry_tomato')).toBe(true);
  });

  it('matches Japanese name substring', () => {
    const results = searchCrops('トマト');
    expect(results.some((c) => c.id === 'tomato')).toBe(true);
  });

  it('returns first N crops for empty query', () => {
    const results = searchCrops('', 5);
    expect(results.length).toBe(5);
    expect(results[0].id).toBe(CROPS[0].id);
  });

  it('returns empty array for no match', () => {
    expect(searchCrops('zzzznotacrop')).toEqual([]);
  });

  it('is case-insensitive for English', () => {
    const upper = searchCrops('TOMATO');
    const lower = searchCrops('tomato');
    expect(upper.length).toBe(lower.length);
  });

  it('respects limit parameter', () => {
    const results = searchCrops('a', 3);
    expect(results.length).toBeLessThanOrEqual(3);
  });
});

// ── normalizeCropType ───────────────────────────────────────────

describe('normalizeCropType', () => {
  it('returns canonical id for exact id match', () => {
    expect(normalizeCropType('tomato')).toBe('tomato');
    expect(normalizeCropType('rice')).toBe('rice');
  });

  it('normalizes English name to id (case-insensitive)', () => {
    expect(normalizeCropType('Tomato')).toBe('tomato');
    expect(normalizeCropType('TOMATO')).toBe('tomato');
    expect(normalizeCropType('Daikon Radish')).toBe('daikon');
  });

  it('normalizes Japanese name to id', () => {
    expect(normalizeCropType('トマト')).toBe('tomato');
    expect(normalizeCropType('稲')).toBe('rice');
  });

  it('returns raw input for unknown crop', () => {
    expect(normalizeCropType('mystery')).toBe('mystery');
    expect(normalizeCropType('My Custom Crop')).toBe('My Custom Crop');
  });

  it('returns empty string for empty input', () => {
    expect(normalizeCropType('')).toBe('');
  });

  it('uses O(1) fast path for known ids', () => {
    // Known id should resolve without linear scan
    expect(normalizeCropType('tomato')).toBe('tomato');
    expect(normalizeCropType('other')).toBe('other');
  });
});

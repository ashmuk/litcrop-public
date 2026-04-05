/**
 * City library tests — search, display, normalization.
 * Mirrors the pattern of crops.test.ts.
 */
import { describe, it, expect } from 'vitest';
import { CITIES, CITY_MAP, searchCities, getCityDisplay, getCityName, normalizeCityInput } from '../lib/cities';

describe('CITIES data', () => {
  it('has entries', () => {
    expect(CITIES.length).toBeGreaterThan(100);
  });

  it('every entry has required fields', () => {
    for (const c of CITIES) {
      expect(c.id).toBeTruthy();
      expect(c.en).toBeTruthy();
      expect(c.ja).toBeTruthy();
      expect(c.region).toBeTruthy();
      expect(c.country).toBeTruthy();
      expect(typeof c.lat).toBe('number');
      expect(typeof c.lng).toBe('number');
    }
  });

  it('CITY_MAP has same count', () => {
    expect(CITY_MAP.size).toBe(CITIES.length);
  });

  it('covers all 47 Japan prefectures', () => {
    const jpCities = CITIES.filter((c) => c.country === 'JP');
    const regions = new Set(jpCities.map((c) => c.region));
    expect(regions.size).toBe(47);
  });
});

describe('searchCities', () => {
  it('returns limited results for empty query', () => {
    const results = searchCities('', 5);
    expect(results.length).toBe(5);
  });

  it('finds by EN name', () => {
    const results = searchCities('Chichibu');
    expect(results.some((c) => c.id === 'jp-chichibu')).toBe(true);
  });

  it('finds by JA name', () => {
    const results = searchCities('秩父');
    expect(results.some((c) => c.id === 'jp-chichibu')).toBe(true);
  });

  it('finds by region', () => {
    const results = searchCities('Saitama');
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((c) => c.region === 'Saitama')).toBe(true);
  });

  it('returns empty for no match', () => {
    const results = searchCities('zzzzzzzzz');
    expect(results.length).toBe(0);
  });
});

describe('getCityDisplay', () => {
  it('returns city, region for known id', () => {
    expect(getCityDisplay('jp-chichibu')).toMatch(/Chichibu.*Saitama/);
  });

  it('returns input for unknown id', () => {
    expect(getCityDisplay('some-place')).toBe('some-place');
  });

  it('returns empty for null', () => {
    expect(getCityDisplay(null)).toBe('');
  });
});

describe('getCityName', () => {
  it('returns name for known id', () => {
    expect(getCityName('jp-tokyo')).toBeTruthy();
  });

  it('returns input for unknown', () => {
    expect(getCityName('custom')).toBe('custom');
  });
});

describe('normalizeCityInput', () => {
  it('normalizes EN name to id', () => {
    expect(normalizeCityInput('Chichibu')).toBe('jp-chichibu');
  });

  it('normalizes JA name to id', () => {
    expect(normalizeCityInput('秩父市')).toBe('jp-chichibu');
  });

  it('returns input for unknown', () => {
    expect(normalizeCityInput('My Village')).toBe('My Village');
  });

  it('returns empty for empty', () => {
    expect(normalizeCityInput('')).toBe('');
  });
});

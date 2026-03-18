import { describe, it, expect } from 'vitest';
import {
  PLOT_STATUS_VALUES,
  TAG_VALUES,
  MAX_IMAGE_SIZE_BYTES,
  DDB_KEY_PREFIXES,
  TRIGGER_TYPES,
  LOCALE_OPTIONS,
  THEME_OPTIONS,
} from '../constants';

describe('PLOT_STATUS_VALUES', () => {
  it('is non-empty', () => expect(PLOT_STATUS_VALUES.length).toBeGreaterThan(0));
  it('contains no_data', () => expect(PLOT_STATUS_VALUES).toContain('no_data'));
  it('contains healthy', () => expect(PLOT_STATUS_VALUES).toContain('healthy'));
});

describe('TAG_VALUES', () => {
  it('is non-empty', () => expect(TAG_VALUES.length).toBeGreaterThan(0));
  it('does not contain no_data (tag-only subset of statuses)', () => {
    expect(TAG_VALUES).not.toContain('no_data');
  });
  it('contains healthy', () => expect(TAG_VALUES).toContain('healthy'));
});

describe('TRIGGER_TYPES', () => {
  it('contains scheduled', () => expect(TRIGGER_TYPES).toContain('scheduled'));
  it('contains motion', () => expect(TRIGGER_TYPES).toContain('motion'));
  it('has exactly 2 values', () => expect(TRIGGER_TYPES.length).toBe(2));
});

describe('MAX_IMAGE_SIZE_BYTES', () => {
  it('is greater than 0', () => expect(MAX_IMAGE_SIZE_BYTES).toBeGreaterThan(0));
  it('equals 2MB (2097152)', () => expect(MAX_IMAGE_SIZE_BYTES).toBe(2 * 1024 * 1024));
});

describe('DDB_KEY_PREFIXES', () => {
  it('has FARM key', () => expect(DDB_KEY_PREFIXES.FARM).toBe('FARM#'));
  it('has PLOT key', () => expect(DDB_KEY_PREFIXES.PLOT).toBe('PLOT#'));
  it('has IMG key', () => expect(DDB_KEY_PREFIXES.IMG).toBe('IMG#'));
  it('has TAG key', () => expect(DDB_KEY_PREFIXES.TAG).toBe('TAG#'));
  it('has FIELD key', () => expect(DDB_KEY_PREFIXES.FIELD).toBe('FIELD#'));
  it('has BED key', () => expect(DDB_KEY_PREFIXES.BED).toBe('BED#'));
  it('has META key', () => expect(DDB_KEY_PREFIXES.META).toBe('#META'));
});

describe('LOCALE_OPTIONS', () => {
  it('contains en', () => expect(LOCALE_OPTIONS).toContain('en'));
  it('contains ja', () => expect(LOCALE_OPTIONS).toContain('ja'));
});

describe('THEME_OPTIONS', () => {
  it('contains system', () => expect(THEME_OPTIONS).toContain('system'));
  it('is non-empty', () => expect(THEME_OPTIONS.length).toBeGreaterThan(0));
});

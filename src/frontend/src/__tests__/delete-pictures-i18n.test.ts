/**
 * i18n coverage tests for #478 delete-picture UI keys.
 *
 * Catches translation drift early: if a future PR forgets the {count} or
 * {date} placeholder in either locale, the BedDetail UI silently displays
 * literal "{count}" to users. Cheap regex test guards against that.
 */

import { describe, it, expect } from 'vitest';
import { createTranslator } from '../i18n/i18n';

const en = createTranslator('en');
const ja = createTranslator('ja');

describe('delete_pictures.* — placeholder integrity', () => {
  it('day_action carries {count} in both locales', () => {
    expect(en('delete_pictures.day_action')).toContain('{count}');
    expect(ja('delete_pictures.day_action')).toContain('{count}');
  });

  it('confirm_bulk_body carries {count} and {date} in both locales', () => {
    for (const tr of [en, ja]) {
      const body = tr('delete_pictures.confirm_bulk_body');
      expect(body).toContain('{count}');
      expect(body).toContain('{date}');
    }
  });

  it('success_bulk carries {count} in both locales', () => {
    expect(en('delete_pictures.success_bulk')).toContain('{count}');
    expect(ja('delete_pictures.success_bulk')).toContain('{count}');
  });

  it('non-interpolated keys resolve to non-empty strings in both locales', () => {
    const noPlaceholderKeys = [
      'delete_pictures.confirm_single_title',
      'delete_pictures.confirm_single_body',
      'delete_pictures.confirm_bulk_title',
      'delete_pictures.success_single',
      'delete_pictures.error',
      'buttons.delete',
    ];
    for (const key of noPlaceholderKeys) {
      expect(en(key)).not.toBe(key);
      expect(en(key).length).toBeGreaterThan(0);
      expect(ja(key)).not.toBe(key);
      expect(ja(key).length).toBeGreaterThan(0);
    }
  });
});

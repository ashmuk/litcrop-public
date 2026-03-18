/**
 * LitCrop i18n — T-FE-03
 *
 * Usage:
 *   import { t } from '../i18n/i18n';
 *   t('nav.farm')           // "Farm" (en) | "農場" (ja)
 *   t('status.slow_growth') // "Slow Growth"
 */

import type { Locale } from '@litcrop/shared';
import en from './en.json';
import ja from './ja.json';

type TranslationTree = { [key: string]: string | TranslationTree };

const translations: Record<Locale, TranslationTree> = { en, ja };

/** Resolve locale from <html data-locale> attribute or localStorage, fallback to 'en'. */
function detectLocale(): Locale {
  if (typeof document !== 'undefined') {
    const attr = document.documentElement.getAttribute('data-locale');
    if (attr === 'en' || attr === 'ja') return attr;
    try {
      const stored = localStorage.getItem('litcrop-locale');
      if (stored === 'en' || stored === 'ja') return stored;
    } catch {
      // localStorage may be unavailable in some environments
    }
  }
  return 'en';
}

/** Walk nested object using dot-separated keys. Returns undefined if not found. */
function resolvePath(obj: TranslationTree, keys: string[]): string | undefined {
  let current: string | TranslationTree = obj;
  for (const key of keys) {
    if (typeof current !== 'object' || current === null) return undefined;
    current = (current as TranslationTree)[key];
  }
  return typeof current === 'string' ? current : undefined;
}

/**
 * Translate a dot-separated key.
 *
 * @param key - Dot-separated path, e.g. 'nav.farm', 'status.slow_growth'
 * @returns Translated string, falling back to English, then the key itself.
 */
export function t(key: string): string {
  const locale = detectLocale();
  const keys = key.split('.');

  const localeResult = resolvePath(translations[locale], keys);
  if (localeResult !== undefined) return localeResult;

  // Fall back to English when the key is missing in the active locale
  if (locale !== 'en') {
    const enResult = resolvePath(translations.en, keys);
    if (enResult !== undefined) return enResult;
  }

  // Last resort: return the key so missing translations are visible
  return key;
}

/**
 * Return a translation function bound to a specific locale.
 * Useful for SSR where locale is known at render time.
 */
export function createTranslator(locale: Locale): (key: string) => string {
  return (key: string) => {
    const keys = key.split('.');
    const result = resolvePath(translations[locale], keys);
    if (result !== undefined) return result;
    if (locale !== 'en') {
      const enResult = resolvePath(translations.en, keys);
      if (enResult !== undefined) return enResult;
    }
    return key;
  };
}

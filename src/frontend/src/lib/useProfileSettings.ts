/**
 * useProfileSettings — owns locale + tempUnit for the Profile page and
 * coordinates the three-way sync between localStorage, the API
 * (`getMySettings` / `updateMySettings`), and the `<html>` attributes
 * that drive theme and locale rendering.
 *
 * On mount:
 *   1. Seed `locale` and `tempUnit` from localStorage, falling back to
 *      `<html data-locale>` if nothing is stored.
 *   2. Push any pending pre-login settings (litcrop-pendingLocale /
 *      litcrop-pendingTempUnit) via `updateMySettings`, then clear
 *      those pending keys on success.
 *   3. Re-fetch canonical settings via `getMySettings`, writing them
 *      into state, localStorage, `<html>` attributes, and dispatching
 *      `litcrop:locale-changed` / `litcrop:settings-synced`.
 *
 * The `settingsDirty` ref gates step 3: if the user calls `applyLocale`
 * before the re-fetch resolves, the user's choice wins.
 *
 * Mutators returned to the caller:
 *   - applyLocale(next)               — user-driven locale change
 *   - applyTempUnit(next)             — user-driven temperature unit
 *   - applyFarmLocaleIfUnset(locale)  — opportunistic default from the
 *     active farm when the user has no stored locale preference yet.
 */

import { useState, useEffect, useRef } from 'preact/hooks';
import type { Locale } from '@litcrop/shared';
import { LOCALE_OPTIONS, DEFAULT_THEME } from '@litcrop/shared';
import { getMySettings, updateMySettings } from './api';
import { t } from '../i18n/i18n';
import { showToast } from '../components/Toast';

const LOCALE_STORAGE_KEY = 'litcrop-locale';
const TEMP_UNIT_STORAGE_KEY = 'litcrop-temp-unit';
const THEME_STORAGE_KEY = 'litcrop-theme';

function isValidLocale(value: string): value is Locale {
  return (LOCALE_OPTIONS as ReadonlyArray<string>).includes(value);
}

function translateNavLabels(): void {
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    if (key) el.textContent = t(key);
  });
}

export interface ProfileSettings {
  locale: Locale;
  tempUnit: 'C' | 'F';
  applyLocale: (next: Locale) => void;
  applyTempUnit: (next: 'C' | 'F') => void;
  applyFarmLocaleIfUnset: (maybeLocale: string | undefined) => void;
}

export function useProfileSettings(): ProfileSettings {
  const [locale, setLocale] = useState<Locale>('en');
  const [tempUnit, setTempUnit] = useState<'C' | 'F'>('C');
  const settingsDirty = useRef(false);

  useEffect(() => {
    try {
      const storedLocale = localStorage.getItem(LOCALE_STORAGE_KEY);
      if (storedLocale && isValidLocale(storedLocale)) {
        setLocale(storedLocale);
      } else {
        const attr = document.documentElement.getAttribute('data-locale');
        if (attr && isValidLocale(attr)) setLocale(attr);
      }
      const storedUnit = localStorage.getItem(TEMP_UNIT_STORAGE_KEY);
      if (storedUnit === 'C' || storedUnit === 'F') setTempUnit(storedUnit);
    } catch {}

    const pendingLocale = localStorage.getItem('litcrop-pendingLocale');
    const pendingTempUnit = localStorage.getItem('litcrop-pendingTempUnit');
    const hasPending = pendingLocale || pendingTempUnit;
    const settingsToSync: Record<string, string> = {};
    if (pendingLocale && isValidLocale(pendingLocale)) settingsToSync['locale'] = pendingLocale;
    if (pendingTempUnit && (pendingTempUnit === 'C' || pendingTempUnit === 'F')) settingsToSync['temp_unit'] = pendingTempUnit;
    if (hasPending) settingsToSync['theme'] = DEFAULT_THEME;
    const pendingSettingsPromise = Object.keys(settingsToSync).length > 0
      ? updateMySettings(settingsToSync).then(() => {
          localStorage.removeItem('litcrop-pendingLocale');
          localStorage.removeItem('litcrop-pendingTempUnit');
        }).catch(() => {})
      : Promise.resolve();

    const initialLocale = document.documentElement.getAttribute('data-locale') || 'en';
    pendingSettingsPromise.then(() => getMySettings()).then((s) => {
      if (settingsDirty.current) return;
      if (s.locale && isValidLocale(s.locale)) {
        setLocale(s.locale);
        document.documentElement.setAttribute('data-locale', s.locale);
        document.documentElement.setAttribute('lang', s.locale === 'ja' ? 'ja' : 'en');
        try { localStorage.setItem(LOCALE_STORAGE_KEY, s.locale); } catch {}
        if (s.locale !== initialLocale) {
          translateNavLabels();
          window.dispatchEvent(new CustomEvent('litcrop:locale-changed'));
        }
      }
      if (s.temp_unit === 'C' || s.temp_unit === 'F') {
        setTempUnit(s.temp_unit);
        try { localStorage.setItem(TEMP_UNIT_STORAGE_KEY, s.temp_unit); } catch {}
      }
      if (s.theme) {
        document.documentElement.setAttribute('data-theme', s.theme);
        try { localStorage.setItem(THEME_STORAGE_KEY, s.theme); } catch {}
      }
      window.dispatchEvent(new CustomEvent('litcrop:settings-synced'));
    }).catch((err) => console.error('[settings] sync failed — API may not be deployed', err));
  }, []);

  function applyLocale(next: Locale) {
    settingsDirty.current = true;
    setLocale(next);
    document.documentElement.setAttribute('data-locale', next);
    document.documentElement.setAttribute('lang', next === 'ja' ? 'ja' : 'en');
    try { localStorage.setItem(LOCALE_STORAGE_KEY, next); } catch {}
    updateMySettings({ locale: next }).catch((err) => console.error('[settings] locale save failed', err));
    translateNavLabels();
    window.dispatchEvent(new CustomEvent('litcrop:locale-changed'));
    showToast(t('settings.save_success'), 'success');
  }

  function applyTempUnit(next: 'C' | 'F') {
    settingsDirty.current = true;
    setTempUnit(next);
    try { localStorage.setItem(TEMP_UNIT_STORAGE_KEY, next); } catch {}
    updateMySettings({ temp_unit: next }).catch((err) => console.error('[settings] temp_unit save failed', err));
    showToast(t('settings.save_success'), 'success');
  }

  function applyFarmLocaleIfUnset(maybeLocale: string | undefined) {
    if (!maybeLocale || !isValidLocale(maybeLocale)) return;
    if (localStorage.getItem(LOCALE_STORAGE_KEY)) return;
    setLocale(maybeLocale);
    try { localStorage.setItem(LOCALE_STORAGE_KEY, maybeLocale); } catch {}
    document.documentElement.setAttribute('data-locale', maybeLocale);
  }

  return { locale, tempUnit, applyLocale, applyTempUnit, applyFarmLocaleIfUnset };
}

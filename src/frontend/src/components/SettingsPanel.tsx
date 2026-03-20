/**
 * Settings Panel Island — T-FE-12
 * Manages locale and temperature unit preferences.
 * Persists all values to localStorage and reflects on <html> attributes.
 */

import { useState, useEffect } from 'preact/hooks';
import type { Locale } from '@litcrop/shared';
import { LOCALE_OPTIONS } from '@litcrop/shared';
import { t } from '../i18n/i18n';
import { showToast } from './Toast';
import { signOut, getCurrentUser } from '../lib/auth';

const LOCALE_STORAGE_KEY = 'litcrop-locale';
const TEMP_UNIT_STORAGE_KEY = 'litcrop-temp-unit';

export default function SettingsPanel() {
  const [locale, setLocale] = useState<Locale>('en');
  const [tempUnit, setTempUnit] = useState<'C' | 'F'>('C');
  const [userEmail, setUserEmail] = useState<string | null>(null);

  // Load persisted values on mount
  useEffect(() => {
    try {
      const storedLocale = localStorage.getItem(LOCALE_STORAGE_KEY) as Locale | null;
      if (storedLocale && (LOCALE_OPTIONS as ReadonlyArray<string>).includes(storedLocale)) {
        setLocale(storedLocale);
      } else {
        const attr = document.documentElement.getAttribute('data-locale') as Locale | null;
        if (attr) setLocale(attr);
      }

      const storedUnit = localStorage.getItem(TEMP_UNIT_STORAGE_KEY);
      if (storedUnit === 'C' || storedUnit === 'F') {
        setTempUnit(storedUnit);
      }
    } catch {
      // localStorage may be unavailable
    }

    // Show logged-in user email
    const user = getCurrentUser();
    if (user) setUserEmail(user.email);
  }, []);

  function applyLocale(next: Locale) {
    setLocale(next);
    document.documentElement.setAttribute('data-locale', next);
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, next);
    } catch {
      // localStorage may be unavailable
    }
    showToast(t('settings.save_success'), 'success');
  }

  function applyTempUnit(next: 'C' | 'F') {
    setTempUnit(next);
    try {
      localStorage.setItem(TEMP_UNIT_STORAGE_KEY, next);
    } catch {
      // localStorage may be unavailable
    }
    showToast(t('settings.save_success'), 'success');
  }

  function handleLogout() {
    signOut();
    showToast(t('auth.logout_confirm'), 'success');
    setTimeout(() => {
      window.location.replace('/login');
    }, 800);
  }

  return (
    <>
      <div class="form-group">
        <label class="form-label" for="locale-select">
          {t('settings.locale')}
        </label>
        <select
          id="locale-select"
          class="form-select"
          value={locale}
          onChange={(e) => applyLocale((e.target as HTMLSelectElement).value as Locale)}
          aria-label="Language selection"
        >
          {LOCALE_OPTIONS.map((loc) => (
            <option key={loc} value={loc}>
              {t(`settings.locales.${loc}`)}
            </option>
          ))}
        </select>
      </div>

      <div class="form-group">
        <label class="form-label" for="temp-select">
          {t('settings.temp_unit')}
        </label>
        <select
          id="temp-select"
          class="form-select"
          value={tempUnit}
          onChange={(e) => applyTempUnit((e.target as HTMLSelectElement).value as 'C' | 'F')}
          aria-label="Temperature unit"
        >
          <option value="C">{t('settings.temp_units.C')}</option>
          <option value="F">{t('settings.temp_units.F')}</option>
        </select>
      </div>

      {/* Account section */}
      <div
        style="border-top: var(--border-default); padding-top: var(--space-5); margin-top: var(--space-2);"
      >
        {userEmail && (
          <div
            style="font-size: var(--font-size-sm); color: var(--color-gray-700); margin-bottom: var(--space-4);"
          >
            Signed in as <strong>{userEmail}</strong>
          </div>
        )}
        <button
          type="button"
          class="btn-secondary"
          style="width: 100%"
          onClick={handleLogout}
        >
          {t('auth.logout')}
        </button>
      </div>
    </>
  );
}

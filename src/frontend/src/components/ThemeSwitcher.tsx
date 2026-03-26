/**
 * Theme Switcher — T-FE-04
 * Dropdown to select Light / Dark / Earthy / System theme.
 * Updates data-theme on <html> and persists to localStorage.
 */

import { useState, useEffect } from 'preact/hooks';
import type { Theme } from '@litcrop/shared';
import { THEME_OPTIONS } from '@litcrop/shared';
import { t } from '../i18n/i18n';
import { updateMySettings } from '../lib/api';

const STORAGE_KEY = 'litcrop-theme';

export default function ThemeSwitcher() {
  const [current, setCurrent] = useState<Theme>('system');

  useEffect(() => {
    function syncFromStorage() {
      try {
        const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
        if (stored && (THEME_OPTIONS as ReadonlyArray<string>).includes(stored)) {
          setCurrent(stored);
          return;
        }
      } catch {}
      const attr = document.documentElement.getAttribute('data-theme') as Theme | null;
      if (attr) setCurrent(attr);
    }
    syncFromStorage();
    // Re-sync when settings are loaded from API (ProfilePage sets localStorage + fires event)
    window.addEventListener('litcrop:settings-synced', syncFromStorage);
    return () => window.removeEventListener('litcrop:settings-synced', syncFromStorage);
  }, []);

  function applyTheme(theme: Theme) {
    setCurrent(theme);
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // localStorage may be unavailable
    }
    updateMySettings({ theme }).catch((err) => console.error('[settings] theme save failed', err));
  }

  return (
    <div class="form-group">
      <label class="form-label" for="theme-select">
        {t('settings.theme')}
      </label>
      <select
        id="theme-select"
        class="form-select"
        value={current}
        onChange={(e) => applyTheme((e.target as HTMLSelectElement).value as Theme)}
      >
        {THEME_OPTIONS.map((theme) => (
          <option key={theme} value={theme}>
            {t(`settings.themes.${theme}`)}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * Auth Guard Island — T-FE-AUTH-06
 *
 * Renders a loading overlay on top of all page content while checking auth.
 * If the user is not authenticated (no valid access token and no usable refresh token),
 * they are redirected to /login with a ?return= query for post-login redirect.
 *
 * Usage: add <AuthGuard client:load /> to BaseLayout (protects all pages using it).
 * Auth pages (login, register, reset) use AuthLayout and skip this guard.
 */

import { useEffect, useState } from 'preact/hooks';
import { getAccessToken } from '../lib/auth';
import { getMyProfile, getMySettings } from '../lib/api';
import { setCachedIsAdmin } from '../lib/hooks';
import { THEME_OPTIONS, LOCALE_OPTIONS } from '@litcrop/shared';
import type { Theme, Locale } from '@litcrop/shared';

export default function AuthGuard() {
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    async function check() {
      const token = await getAccessToken();
      if (!token) {
        // Save intended destination so we can redirect back after login
        try {
          sessionStorage.setItem('litcrop_return_url', window.location.pathname + window.location.search);
        } catch {
          // ignore
        }
        window.location.replace('/login/');
        return;
      }
      setChecking(false);
      // Cache admin flag for nav components (non-blocking, deduped by setCachedIsAdmin change guard)
      getMyProfile().then(p => setCachedIsAdmin(p.is_admin === true)).catch(() => {});
      // Sync settings from API so theme/locale/temp_unit apply on every page, not just Profile
      getMySettings().then(s => {
        const validTheme = THEME_OPTIONS.includes(s.theme as Theme);
        const validLocale = LOCALE_OPTIONS.includes(s.locale as Locale);
        const validUnit = s.temp_unit === 'C' || s.temp_unit === 'F';
        let themeChanged = false;
        let localeChanged = false;
        try {
          if (validTheme && localStorage.getItem('litcrop-theme') !== s.theme) {
            localStorage.setItem('litcrop-theme', s.theme);
            themeChanged = true;
          }
          if (validLocale && localStorage.getItem('litcrop-locale') !== s.locale) {
            localStorage.setItem('litcrop-locale', s.locale);
            localeChanged = true;
          }
          if (validUnit && localStorage.getItem('litcrop-temp-unit') !== s.temp_unit) {
            localStorage.setItem('litcrop-temp-unit', s.temp_unit);
          }
        } catch {}
        if (themeChanged) document.documentElement.setAttribute('data-theme', s.theme);
        if (localeChanged) {
          document.documentElement.setAttribute('data-locale', s.locale);
          document.documentElement.setAttribute('lang', s.locale === 'ja' ? 'ja' : 'en');
        }
        if (themeChanged) window.dispatchEvent(new CustomEvent('litcrop:settings-synced'));
        if (localeChanged) window.dispatchEvent(new CustomEvent('litcrop:locale-changed'));
      }).catch(err => console.error('[settings] sync failed', err));
    }
    check();
  }, []);

  if (!checking) return null;

  return (
    <div class="auth-guard-overlay" role="status" aria-label="Checking authentication…">
      <div class="auth-guard-spinner" aria-hidden="true" />
    </div>
  );
}

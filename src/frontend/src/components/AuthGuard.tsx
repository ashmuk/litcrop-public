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
import { getMyProfile } from '../lib/api';
import { setCachedIsAdmin } from '../lib/hooks';

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
      // Cache admin flag on every page load (non-blocking)
      getMyProfile().then(p => setCachedIsAdmin(p.is_admin === true)).catch(() => {});
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

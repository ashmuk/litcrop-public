/**
 * F-12 Security Tests
 *
 * Covers:
 *  1. Unauthenticated access redirects to login
 *  2. Content-Security-Policy header presence (soft check — dev server may omit it)
 *  3. XSS: script injection via URL param does not execute
 *  4. Sensitive tokens absent from rendered HTML source
 *  5. Strict-Transport-Security header presence (soft check — dev server may omit it)
 */

import { test, expect } from '../../fixtures/auth';
import {
  profileResponse,
  farmResponse,
  bedsResponse,
  myFarmsResponse,
  API_FARM,
} from '../../fixtures/mock-data';

// Tests 1–3 and 5 use the plain `page` fixture; test 4 uses `authenticatedPage`.
// The extended `test` from fixtures/auth provides both.

test.describe('Security', () => {
  // 1. Unauthenticated access ──────────────────────────────────────
  test('unauthenticated access to / redirects to login', async ({ page }) => {
    await page.goto('/');
    // SSG page loads, then Preact islands detect missing auth and redirect
    await page.waitForURL(/\/login/, { timeout: 8000 }).catch(() => {});
    // Either redirected to /login OR login elements are visible on the page
    const onLogin = page.url().includes('/login');
    const hasLoginField = await page.locator('#login-email').isVisible().catch(() => false);
    expect(onLogin || hasLoginField).toBe(true);
  });

  // 2. Content-Security-Policy header (soft) ───────────────────────
  test('login page returns CSP header or report-only header', async ({ page }) => {
    const response = await page.goto('/login');
    expect(response).not.toBeNull();

    const headers = response!.headers();
    const csp = headers['content-security-policy'];
    const cspReportOnly = headers['content-security-policy-report-only'];

    // Dev server may not set CSP — log a warning rather than hard-fail
    if (!csp && !cspReportOnly) {
      console.warn(
        '[security] No CSP header found on /login — acceptable in dev, required in production',
      );
    } else {
      // If present, ensure it is non-empty
      const value = (csp ?? cspReportOnly)!;
      expect(value.length).toBeGreaterThan(0);
    }
  });

  // 3. XSS via URL param ───────────────────────────────────────────
  test('script injection via URL param does not execute', async ({ page }) => {
    let dialogFired = false;
    page.on('dialog', async (dialog) => {
      dialogFired = true;
      await dialog.dismiss();
    });

    // Navigate with a URL param containing a script tag
    await page.goto('/?farm=<script>alert(1)</script>', { waitUntil: 'networkidle' }).catch(() => {
      // Ignore navigation errors caused by the malformed URL in some browsers
    });

    // Give any synchronous script injection a chance to fire
    await page.waitForTimeout(500);

    expect(dialogFired).toBe(false);
  });

  // 4. Sensitive tokens absent from HTML source ────────────────────
  test('authenticated dashboard HTML does not expose refresh token value', async ({
    authenticatedPage,
    mockApi,
  }) => {
    await mockApi.onGet('farms', { data: [{ ...API_FARM, role: 'owner' as const }] });
    await mockApi.onGet(`farms/farm-e2e-001`, farmResponse());
    await mockApi.onGet('me/profile', profileResponse());
    await mockApi.onGet(`farms/farm-e2e-001/beds`, bedsResponse());

    await authenticatedPage.goto('/');

    // Wait for initial hydration to complete
    await authenticatedPage.waitForLoadState('networkidle').catch(() => {});

    const source = await authenticatedPage.content();

    // The actual token value must not appear in the rendered HTML
    expect(source).not.toContain('mock-refresh-token-e2e');
    // No raw AWS secret patterns
    expect(source).not.toMatch(/AKIA[0-9A-Z]{16}/);
  });

  // 5. HSTS header (soft) ──────────────────────────────────────────
  test('login page returns Strict-Transport-Security header in production-like environments', async ({
    page,
  }) => {
    const response = await page.goto('/login');
    expect(response).not.toBeNull();

    const hsts = response!.headers()['strict-transport-security'];

    if (!hsts) {
      console.warn(
        '[security] No HSTS header on /login — acceptable in dev (HTTP), required in production (HTTPS)',
      );
    } else {
      expect(hsts).toContain('max-age=');
    }
  });
});

/**
 * E2E — Profile Tab refactor: E-11 (/whats-new redirect)
 *
 * Verifies that navigating to /whats-new ends up at /history via the
 * meta http-equiv="refresh" redirect defined in whats-new.astro.
 *
 * This test does NOT require authentication — /whats-new and /history
 * are public pages.  We use the base Playwright test rather than the
 * auth fixture to keep the test simple.
 */

import { test, expect } from '@playwright/test';

test.describe('/whats-new redirect', () => {
  /**
   * E-11: /whats-new responds with a meta-refresh redirect to /history.
   * Playwright follows meta http-equiv="refresh" automatically; we assert
   * the final URL ends with /history.
   */
  test('E-11: /whats-new redirects to /history via meta refresh', async ({ page }) => {
    await page.goto('/whats-new', { waitUntil: 'networkidle' });

    // After the meta refresh fires and the new page loads, the URL must be /history
    expect(page.url()).toMatch(/\/history\/?$/);
  });
});

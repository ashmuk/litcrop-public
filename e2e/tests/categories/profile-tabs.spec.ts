/**
 * E2E — Profile Tab refactor: E-11 (/whats-new redirect) + A-1..A-4 (a11y)
 *
 * Public tests: E-11 verifies the meta-refresh redirect from /whats-new → /history.
 *
 * Authenticated tests: A-1..A-4 verify the Profile shell's ARIA contract
 * against a real browser.  Focus delivery (A-4) cannot be tested at the
 * vitest/node layer because it requires the browser's focus stack.
 */

import { test as basePublic, expect } from '@playwright/test';
import { test as authTest } from '../../fixtures/auth';
import { API_FARMS_LIST, API_ME } from '../../fixtures/mock-data';

// ── E-11: public redirect (existing) ──────────────────────────────

basePublic.describe('/whats-new redirect', () => {
  /**
   * E-11: /whats-new responds with a meta-refresh redirect to /history.
   * Playwright follows meta http-equiv="refresh" automatically; we assert
   * the final URL ends with /history.
   */
  basePublic('E-11: /whats-new redirects to /history via meta refresh', async ({ page }) => {
    await page.goto('/whats-new', { waitUntil: 'networkidle' });

    // After the meta refresh fires and the new page loads, the URL must be /history
    expect(page.url()).toMatch(/\/history\/?$/);
  });
});

// ── A-1..A-4: tablist accessibility contract ─────────────────────

authTest.describe('Profile tablist a11y', () => {
  authTest.beforeEach(async ({ authenticatedPage, mockApi }) => {
    // Minimal stubs so ProfilePage renders without network noise.  The
    // tab shell is state-driven, not data-driven, so only the three
    // base endpoints need real bodies.
    await mockApi.onGet('me/profile', API_ME);
    await mockApi.onGet('me/settings', {
      locale: 'en',
      temp_unit: 'C',
      theme: 'light',
      updated_at: '2026-01-01T00:00:00Z',
    });
    await mockApi.onGet('farms', API_FARMS_LIST);
    // Owner farms trigger join-request lookup — stub empty to avoid 404
    await mockApi.onGet('farms/*/join-requests', { data: [] });

    await authenticatedPage.goto('/profile/');
    // Wait for the tablist to mount before assertions
    await authenticatedPage.waitForSelector('[role="tablist"]', { timeout: 10_000 });
  });

  /**
   * A-1: The tablist container carries an accessible label so screen
   * readers announce the region correctly.
   */
  authTest('A-1: tablist has aria-label="Profile sections"', async ({ authenticatedPage }) => {
    const tablist = authenticatedPage.locator('[role="tablist"]');
    await expect(tablist).toHaveAttribute('aria-label', 'Profile sections');
  });

  /**
   * A-2: Each tab button's aria-controls must resolve to a real tabpanel
   * element in the DOM — otherwise screen readers announce "no panel"
   * and keyboard nav into the panel fails.  Only the active panel is
   * mounted, so we activate each tab in turn and verify the pair.
   */
  authTest('A-2: every aria-controls points to a real tabpanel', async ({ authenticatedPage }) => {
    for (const tab of ['farms', 'you', 'system']) {
      await authenticatedPage.locator(`#tab-${tab}`).click();
      const tabBtn = authenticatedPage.locator(`#tab-${tab}`);
      const controlsId = await tabBtn.getAttribute('aria-controls');
      expect(controlsId).toBe(`panel-${tab}`);
      await expect(authenticatedPage.locator(`#${controlsId}`)).toHaveAttribute('role', 'tabpanel');
    }
  });

  /**
   * A-3: The active tabpanel must be focusable (tabindex="0") so
   * keyboard users can Tab from the tablist into the panel content.
   */
  authTest('A-3: active tabpanel has tabindex="0"', async ({ authenticatedPage }) => {
    const activePanel = authenticatedPage.locator('[role="tabpanel"]');
    await expect(activePanel).toHaveAttribute('tabindex', '0');
  });

  /**
   * A-4: Roving focus — ArrowRight on tab-farms moves keyboard focus
   * to tab-you.  Verified by reading document.activeElement's id after
   * the keydown fires.  This asserts the ARIA APG tabs pattern
   * (focus follows selection on Left/Right arrow keys).
   */
  authTest('A-4: ArrowRight on tab-farms moves focus to tab-you', async ({ authenticatedPage }) => {
    await authenticatedPage.locator('#tab-farms').focus();
    await authenticatedPage.keyboard.press('ArrowRight');

    // Focus shift is driven by a useEffect that runs AFTER Preact's re-render
    // completes, so the post-ArrowRight focus state is observable but may
    // arrive a tick later. Playwright's toBeFocused auto-waits for the
    // focus to settle — the preferred assertion style over manual
    // document.activeElement polling.
    await expect(authenticatedPage.locator('#tab-you')).toBeFocused({ timeout: 5000 });

    // Sanity: aria-selected also reflects the new active tab
    await expect(authenticatedPage.locator('#tab-you')).toHaveAttribute('aria-selected', 'true');
    await expect(authenticatedPage.locator('#tab-farms')).toHaveAttribute('aria-selected', 'false');
  });
});

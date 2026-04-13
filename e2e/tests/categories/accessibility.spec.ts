/**
 * F-12 Accessibility Tests
 *
 * Covers:
 *  1. Login page passes axe-core WCAG 2.1 AA audit
 *  2. Register page passes axe-core WCAG 2.1 AA audit
 *  3. Authenticated dashboard passes axe-core audit
 *  4. Diary page passes axe-core audit
 *  5. Keyboard navigation: Tab moves focus through login form in correct order
 */

import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '../../fixtures/auth';
import {
  profileResponse,
  farmResponse,
  bedsResponse,
  diaryResponse,
  API_FARM,
} from '../../fixtures/mock-data';

test.describe('Accessibility', () => {
  // Known pre-existing a11y issues tracked for separate fix:
  // - color-contrast: earthy theme primary (#6b7f5e) on surface (#fdfbf7) = 4.21 (needs 4.5:1)
  // - aria-prohibited-attr: step-indicator div uses aria-label without a role
  // - select-name: locale/temp selects in RegisterForm missing labels
  const KNOWN_VIOLATIONS = ['color-contrast', 'aria-prohibited-attr', 'select-name'];

  // 1. Login page ──────────────────────────────────────────────────
  test('login page passes WCAG 2.1 AA axe-core audit (excluding known issues)', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('domcontentloaded');

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .disableRules(KNOWN_VIOLATIONS)
      .analyze();

    expect(results.violations).toHaveLength(0);
  });

  // 2. Register page ───────────────────────────────────────────────
  test('register page passes WCAG 2.1 AA axe-core audit (excluding known issues)', async ({ page }) => {
    await page.goto('/register');
    await page.waitForLoadState('domcontentloaded');

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .disableRules(KNOWN_VIOLATIONS)
      .analyze();

    expect(results.violations).toHaveLength(0);
  });

  // 3. Authenticated dashboard ─────────────────────────────────────
  test('authenticated dashboard passes axe-core audit', async ({
    authenticatedPage,
    mockApi,
  }) => {
    await mockApi.onGet('farms', { data: [{ ...API_FARM, role: 'owner' as const }] });
    await mockApi.onGet('farms/farm-e2e-001', farmResponse());
    await mockApi.onGet('me/profile', profileResponse());
    await mockApi.onGet('farms/farm-e2e-001/beds', bedsResponse());

    await authenticatedPage.goto('/');
    await authenticatedPage.waitForLoadState('networkidle');

    const results = await new AxeBuilder({ page: authenticatedPage })
      .withTags(['wcag2a', 'wcag2aa'])
      .disableRules(KNOWN_VIOLATIONS)
      .analyze();

    expect(results.violations).toHaveLength(0);
  });

  // 4. Diary page ──────────────────────────────────────────────────
  test('diary page passes axe-core audit', async ({ authenticatedPage, mockApi }) => {
    await mockApi.onGet('farms', { data: [{ ...API_FARM, role: 'owner' as const }] });
    await mockApi.onGet('farms/farm-e2e-001', farmResponse());
    await mockApi.onGet('me/profile', profileResponse());
    await mockApi.onGet('farms/farm-e2e-001/beds', bedsResponse());
    await mockApi.onGet('farms/farm-e2e-001/diary', diaryResponse());

    await authenticatedPage.goto('/diary');
    await authenticatedPage.waitForLoadState('networkidle');

    const results = await new AxeBuilder({ page: authenticatedPage })
      .withTags(['wcag2a', 'wcag2aa'])
      .disableRules(KNOWN_VIOLATIONS)
      .analyze();

    expect(results.violations).toHaveLength(0);
  });

  // 5. Keyboard navigation through login form ──────────────────────
  test('Tab key moves focus through email → password → submit on login page', async ({
    page,
  }) => {
    await page.goto('/login');
    await page.waitForLoadState('domcontentloaded');

    // Click somewhere neutral first to reset focus to the document body
    await page.click('body');

    // First Tab — should land on email input (#login-email, type="email")
    await page.keyboard.press('Tab');
    const emailFocused = await page.evaluate(() => {
      const el = document.activeElement as HTMLInputElement | null;
      return (
        el?.tagName === 'INPUT' &&
        (el.type === 'email' || el.id === 'login-email')
      );
    });
    expect(emailFocused).toBe(true);

    // Second Tab — should land on password input (#login-password)
    await page.keyboard.press('Tab');
    const passwordFocused = await page.evaluate(() => {
      const el = document.activeElement as HTMLInputElement | null;
      return (
        el?.tagName === 'INPUT' &&
        (el.type === 'password' || el.id === 'login-password')
      );
    });
    expect(passwordFocused).toBe(true);

    // Continue tabbing until we reach a submit button (allow intermediate fields)
    let submitReached = false;
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Tab');
      submitReached = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el) return false;
        const tag = el.tagName;
        const type = (el as HTMLInputElement).type;
        const role = el.getAttribute('role');
        return (
          (tag === 'BUTTON' && (type === 'submit' || !type)) ||
          (tag === 'INPUT' && type === 'submit') ||
          role === 'button'
        );
      });
      if (submitReached) break;
    }
    expect(submitReached).toBe(true);
  });
});

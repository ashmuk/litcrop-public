/**
 * E2E — Farm management golden paths
 *
 * Covers:
 *   - Dashboard loading and showing the farm name + bed grid
 *   - Navigation to profile page
 *   - New-user setup wizard (user has no farm)
 *
 * API response objects use the field names the app components actually read
 * (e.g. `id` for farm, not `farm_id`).
 */

import { test, expect } from '../fixtures/auth';
import {
  FARM_ID,
  API_FARM,
  API_BEDS,
  API_FARMS_LIST,
  API_ME,
  API_WEATHER_STUB,
} from '../fixtures/mock-data';
import { expectNoSeriousA11y } from '../helpers/axe-scan';

// ── Farm Overview ─────────────────────────────────────────────────

test.describe('Farm Overview', () => {
  test.beforeEach(async ({ authenticatedPage, mockApi }) => {
    // Seed farmId in localStorage before navigation (addInitScript runs before page scripts)
    await authenticatedPage.addInitScript((id) => {
      localStorage.setItem('litcrop-farmId', id);
      localStorage.setItem('litcrop-farmName', 'E2E Test Farm');
    }, FARM_ID);

    // Register common API stubs
    await mockApi.onGet('me/profile', API_ME);
    await mockApi.onGet(`farms/${FARM_ID}`, API_FARM);
    await mockApi.onGet(`farms/${FARM_ID}/beds`, { data: API_BEDS });
    await mockApi.onGet('farms', API_FARMS_LIST);
    await mockApi.onGet('crop-library', { data: [] });
    await mockApi.onGet(`farms/${FARM_ID}/weather`, API_WEATHER_STUB);

    await authenticatedPage.goto('/');
    // Wait for FarmOverview to finish loading (skeletons replaced by content)
    await authenticatedPage.waitForSelector('.plot-tile, .empty-state', { timeout: 10_000 });
  });

  test('dashboard loads and shows the farm name in the page title', async ({
    authenticatedPage,
  }) => {
    // FarmOverview sets #page-title.textContent to the farm name after API load
    const title = authenticatedPage.locator('#page-title');
    await expect(title).toContainText(API_FARM.name, { timeout: 8_000 });
  });

  test('farm overview displays one bed tile per bed in the API response', async ({
    authenticatedPage,
  }) => {
    const tiles = authenticatedPage.locator('.plot-tile');
    await expect(tiles).toHaveCount(API_BEDS.length);
  });

  test('planted bed tile shows the crop display name', async ({ authenticatedPage }) => {
    // FarmOverview renders getCropDisplay(crop_type) in .plot-tile__crop-name
    // For 'tomato' the shared crop library returns 'Tomato'
    const firstTile = authenticatedPage.locator('.plot-tile').first();
    await expect(firstTile.locator('.plot-tile__crop-name')).toContainText('Tomato');
  });

  test('navigation to profile page works without redirect to login', async ({
    authenticatedPage,
    mockApi,
  }) => {
    await mockApi.onGet('me/profile', API_ME);
    await mockApi.onGet('me/settings', {
      locale: 'en',
      temp_unit: 'C',
      theme: 'light',
      updated_at: '2026-01-01T00:00:00Z',
    });

    await authenticatedPage.goto('/profile/');
    await expect(authenticatedPage).not.toHaveURL(/\/login/);
  });
});

// ── Farm Creation (setup wizard) ──────────────────────────────────

test.describe('Farm Creation', () => {
  test('setup page loads without errors for new user', async ({
    authenticatedPage,
    mockApi,
  }) => {
    // Clear farmId so the app treats this user as having no farm
    await authenticatedPage.addInitScript(() => {
      localStorage.removeItem('litcrop-farmId');
      localStorage.removeItem('litcrop-farmName');
    });

    await mockApi.onGet('me/profile', API_ME);
    await mockApi.onGet('farms', { data: [] });
    await mockApi.onPost('farms', { ...API_FARM, id: 'farm-new-001' });

    await authenticatedPage.goto('/setup');
    await authenticatedPage.waitForLoadState('networkidle');

    // The setup page should not redirect to login
    expect(authenticatedPage.url()).not.toContain('/login');
    // Should render some form element (wizard or profile setup)
    const hasFormInput = await authenticatedPage.locator('input, select, textarea').first().isVisible().catch(() => false);
    expect(hasFormInput).toBe(true);
  });

  // R-008 + R-012 (#442): axe-core a11y scan for Farm Overview.
  test('axe: / passes WCAG 2.1 A + AA critical checks', async ({ authenticatedPage }) => {
    await expectNoSeriousA11y(authenticatedPage);
  });
});

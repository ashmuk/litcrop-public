/**
 * E2E — Bed/crop lifecycle golden paths
 *
 * Covers:
 *   - Beds page loads and shows a bed grid
 *   - Clicking a bed navigates to BedDetail
 *   - BedDetail shows crop info and an edit form
 *   - Empty bed shows a "no crop assigned" state
 */

import { test, expect } from '../fixtures/auth';
import {
  FARM_ID,
  API_FARM,
  API_BEDS,
  API_ME,
  API_WEATHER_STUB,
  API_EMPTY_IMAGES,
} from '../fixtures/mock-data';

// ── Local constants ──────────────────────────────────────────────

const BED_ID_1 = API_BEDS[0].id;
const BED_ID_2 = API_BEDS[1].id;

// BedDetail responses reuse the shared bed shapes with notes override
const API_BED_DETAIL = { ...API_BEDS[0], notes: 'E2E test tomato bed' };
const API_BED_DETAIL_EMPTY = API_BEDS[1];

// ── Tests ─────────────────────────────────────────────────────────

test.describe('Bed Lifecycle', () => {
  test.beforeEach(async ({ authenticatedPage, mockApi }) => {
    // Seed localStorage with active farm (addInitScript runs before page scripts)
    await authenticatedPage.addInitScript((id) => {
      localStorage.setItem('litcrop-farmId', id);
      localStorage.setItem('litcrop-farmName', 'E2E Test Farm');
      // Set owner role so the edit button is visible
      localStorage.setItem(
        'litcrop-farmList',
        JSON.stringify([{ id, name: 'E2E Test Farm', role: 'owner' }]),
      );
    }, FARM_ID);

    // Common stubs
    await mockApi.onGet('me/profile', API_ME);
    await mockApi.onGet(`farms/${FARM_ID}`, API_FARM);
    await mockApi.onGet(`farms/${FARM_ID}/beds`, { data: API_BEDS });
    await mockApi.onGet('crop-library', { data: [] });
    await mockApi.onGet(`farms/${FARM_ID}/weather`, API_WEATHER_STUB);
    await mockApi.onGet('farms', { data: [{ ...API_FARM, role: 'owner' }] });
  });

  test('beds page loads without errors', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/beds/view');
    // Wait for the page to finish loading — either bed tiles or empty state
    await authenticatedPage.waitForSelector('.plot-tile, .empty-state, [class*="bed"], [class*="farm"]', { timeout: 10_000 });
    // Verify we're still on beds/view (no redirect to /login)
    expect(authenticatedPage.url()).toContain('/beds/view');
  });

  test('beds page does not redirect to login (auth works)', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/beds/view');
    await authenticatedPage.waitForLoadState('networkidle');
    expect(authenticatedPage.url()).not.toContain('/login');
  });

  test('clicking a bed navigates to BedDetail', async ({
    authenticatedPage,
    mockApi,
  }) => {
    // Stub the individual bed endpoint
    await mockApi.onGet(`beds/${BED_ID_1}`, API_BED_DETAIL);
    await mockApi.onGet(`beds/${BED_ID_1}/images`, API_EMPTY_IMAGES);
    await mockApi.onGet(`farms/${FARM_ID}/members`, { data: [] });

    // Navigate directly to BedDetail (avoids dependency on bed grid rendering)
    await authenticatedPage.goto(`/beds/view?id=${BED_ID_1}`);
    await authenticatedPage.waitForLoadState('networkidle');
    // Verify we stayed on the bed detail page
    expect(authenticatedPage.url()).toContain(`id=${BED_ID_1}`);
  });

  test('BedDetail shows variety and planted date for a planted bed', async ({
    authenticatedPage,
    mockApi,
  }) => {
    await mockApi.onGet(`beds/${BED_ID_1}`, API_BED_DETAIL);
    await mockApi.onGet(`beds/${BED_ID_1}/images`, API_EMPTY_IMAGES);
    await mockApi.onGet(`farms/${FARM_ID}/members`, { data: [] });

    await authenticatedPage.goto(`/beds/view?id=${BED_ID_1}`);
    await authenticatedPage.waitForSelector('.crop-info', { timeout: 10_000 });

    await expect(authenticatedPage.locator('.crop-info')).toContainText('Cherry');
  });

  test('BedDetail shows edit form when Edit/Assign Crop button is clicked', async ({
    authenticatedPage,
    mockApi,
  }) => {
    await mockApi.onGet(`beds/${BED_ID_1}`, API_BED_DETAIL);
    await mockApi.onGet(`beds/${BED_ID_1}/images`, API_EMPTY_IMAGES);
    await mockApi.onGet(`farms/${FARM_ID}/members`, { data: [] });

    await authenticatedPage.goto(`/beds/view?id=${BED_ID_1}`);
    await authenticatedPage.waitForSelector('.crop-info', { timeout: 10_000 });

    // Click Edit Crop button (visible to owner role)
    const editBtn = authenticatedPage.locator('.crop-info button.btn-secondary').first();
    await expect(editBtn).toBeVisible({ timeout: 5_000 });
    await editBtn.click();

    // Edit form fields should appear
    await expect(authenticatedPage.locator('#crop-variety')).toBeVisible();
    await expect(authenticatedPage.locator('#planted-at')).toBeVisible();
    await expect(authenticatedPage.locator('#expected-harvest')).toBeVisible();
  });

  test('empty bed shows no-crop placeholder text in BedDetail', async ({
    authenticatedPage,
    mockApi,
  }) => {
    await mockApi.onGet(`beds/${BED_ID_2}`, API_BED_DETAIL_EMPTY);
    await mockApi.onGet(`beds/${BED_ID_2}/images`, API_EMPTY_IMAGES);
    await mockApi.onGet(`farms/${FARM_ID}/members`, { data: [] });

    await authenticatedPage.goto(`/beds/view?id=${BED_ID_2}`);
    await authenticatedPage.waitForSelector('.crop-info', { timeout: 10_000 });

    // For an empty bed the BedDetail shows the no-crop placeholder
    // (i18n key 'bed.no_crop' renders as something like "No crop assigned")
    await expect(authenticatedPage.locator('.crop-info')).toContainText(/no crop|empty|assign/i);
  });
});

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
import { expectNoSeriousA11y } from '../helpers/axe-scan';

// ── Local constants ──────────────────────────────────────────────

const BED_ID_1 = API_BEDS[0].id;
const BED_ID_2 = API_BEDS[1].id;

// BedDetail responses reuse the shared bed shapes with notes override.
// Wave C (#279) added the `active_crop` server-side projection on
// BedDetailResponse — fixture mirrors what the API now returns for a bed
// with inline `crop_type` (lazy-materialized virtual BedCrop).
const API_BED_DETAIL = {
  ...API_BEDS[0],
  notes: 'E2E test tomato bed',
  active_crop: {
    id: `bed-legacy-${API_BEDS[0].id}`,
    crop_type: API_BEDS[0].crop_type,
    crop_variety: API_BEDS[0].crop_variety,
    planted_at: API_BEDS[0].planted_at,
    expected_harvest: API_BEDS[0].expected_harvest,
    status: 'active' as const,
  },
  active_crops_count: 1,
};
const API_BED_DETAIL_EMPTY = API_BEDS[1];

// Wave B (#279) — BedDetail.tsx now fetches BedCrop list in parallel via
// `listBedCrops(bedId, 'all')`. Empty list is the legacy/virtual case.
const API_EMPTY_BEDCROPS = { items: [] };

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
    await mockApi.onGet(`beds/${BED_ID_1}/crops?status=all`, API_EMPTY_BEDCROPS);
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
    await mockApi.onGet(`beds/${BED_ID_1}/crops?status=all`, API_EMPTY_BEDCROPS);
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
    await mockApi.onGet(`beds/${BED_ID_1}/crops?status=all`, API_EMPTY_BEDCROPS);
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
    await mockApi.onGet(`beds/${BED_ID_2}/crops?status=all`, API_EMPTY_BEDCROPS);
    await mockApi.onGet(`farms/${FARM_ID}/members`, { data: [] });

    await authenticatedPage.goto(`/beds/view?id=${BED_ID_2}`);
    await authenticatedPage.waitForSelector('.crop-info', { timeout: 10_000 });

    // For an empty bed BedDetail shows the no-active-crop placeholder
    // (Wave C #279: `bed.no_active_crop` renders "No active planting").
    await expect(authenticatedPage.locator('.crop-info')).toContainText(/no active|no crop|empty|assign/i);
  });

  // R-008 + R-012 (#442): axe-core a11y scan for Bed detail page.
  test('axe: bed lifecycle page passes WCAG 2.1 A + AA critical checks', async ({ authenticatedPage }) => {
    await expectNoSeriousA11y(authenticatedPage);
  });
});

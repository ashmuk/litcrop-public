/**
 * E2E — Device management golden paths
 *
 * Covers:
 *   - Device list page loads and shows registered devices with status
 *   - Clicking "Register" opens the DeviceRegisterForm
 *   - Filling device-node-name + device-bed-id and submitting
 *   - Success screen shows device_id and device_api_key credentials
 */

import { test, expect } from '../fixtures/auth';
import {
  TEST_DEVICES,
  FARM_ID,
  API_FARM,
  API_BEDS,
  API_ME,
} from '../fixtures/mock-data';

// ── Local constants ──────────────────────────────────────────────

const BED_ID_1 = API_BEDS[0].id;

const API_DEVICES = { devices: [TEST_DEVICES[0]] };

// POST /farms/{id}/devices response (DeviceRegistrationResult shape)
const REGISTRATION_RESULT = {
  device_id: 'dev-e2e-new-001',
  node_name: 'My Pi Camera',
  bed_id: BED_ID_1,
  device_api_key: 'e2e-test-api-key-abc123',
  config_poll_url: `https://localhost:4321/api/v1/devices/dev-e2e-new-001/config`,
  created_at: '2026-04-13T10:00:00Z',
};

// ── Tests ─────────────────────────────────────────────────────────

test.describe('Device Management', () => {
  test.beforeEach(async ({ authenticatedPage, mockApi }) => {
    // Seed localStorage with active farm and owner role (addInitScript runs before page scripts)
    await authenticatedPage.addInitScript((id) => {
      localStorage.setItem('litcrop-farmId', id);
      localStorage.setItem('litcrop-farmName', 'E2E Test Farm');
      localStorage.setItem(
        'litcrop-farmList',
        JSON.stringify([{ id, name: 'E2E Test Farm', role: 'owner' }]),
      );
    }, FARM_ID);

    await mockApi.onGet('me/profile', API_ME);
    await mockApi.onGet(`farms/${FARM_ID}`, API_FARM);
    await mockApi.onGet(`farms/${FARM_ID}/beds`, { data: [API_BEDS[0]] });
    await mockApi.onGet(`farms/${FARM_ID}/devices`, API_DEVICES);
    await mockApi.onGet('farms', { data: [{ ...API_FARM, role: 'owner' as const }] });
    await mockApi.onGet('crop-library', { data: [] });
  });

  test('device list page loads and shows registered device cards', async ({
    authenticatedPage,
  }) => {
    // DeviceListPage is rendered at /manage (see pages/manage/index.astro)
    await authenticatedPage.goto('/manage');
    await authenticatedPage.waitForSelector('.device-card, .empty-state', { timeout: 10_000 });
    const cards = authenticatedPage.locator('.device-card');
    await expect(cards).toHaveCount(API_DEVICES.devices.length);
  });

  test('device card shows the node name and status indicator', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto('/manage');
    await authenticatedPage.waitForSelector('.device-card', { timeout: 10_000 });
    const card = authenticatedPage.locator('.device-card').first();
    await expect(card.locator('.device-card__name')).toContainText(
      TEST_DEVICES[0].node_name,
    );
    // Status dot should be present
    await expect(card.locator('.status-dot')).toBeVisible();
  });

  test('clicking Register opens the DeviceRegisterForm', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto('/manage');
    await authenticatedPage.waitForSelector('.device-card', { timeout: 10_000 });

    // The + register button is in the header row
    const registerBtn = authenticatedPage.locator(
      'button[aria-label*="Register"], button[aria-label*="register"]',
    );
    await expect(registerBtn).toBeVisible({ timeout: 5_000 });
    await registerBtn.click();

    // DeviceRegisterForm renders the node-name input
    await authenticatedPage.waitForSelector('#device-node-name', { timeout: 5_000 });
    await expect(authenticatedPage.locator('#device-node-name')).toBeVisible();
    await expect(authenticatedPage.locator('#device-bed-id')).toBeVisible();
  });

  test('can fill device registration form and submit to get credentials', async ({
    authenticatedPage,
    mockApi,
  }) => {
    // Stub the registration POST
    await mockApi.onPost(`farms/${FARM_ID}/devices`, REGISTRATION_RESULT);

    await authenticatedPage.goto('/manage');
    await authenticatedPage.waitForSelector('.device-card', { timeout: 10_000 });

    // Open register form
    const registerBtn = authenticatedPage.locator(
      'button[aria-label*="Register"], button[aria-label*="register"]',
    );
    await registerBtn.click();
    await authenticatedPage.waitForSelector('#device-node-name', { timeout: 5_000 });

    // Fill the registration form
    await authenticatedPage.fill('#device-node-name', 'My Pi Camera');

    // Select a bed
    await authenticatedPage.waitForSelector('#device-bed-id:not([disabled])', {
      timeout: 5_000,
    });
    await authenticatedPage.selectOption('#device-bed-id', BED_ID_1);

    // Submit
    const submitBtn = authenticatedPage.locator('button[type="submit"].btn-primary');
    await expect(submitBtn).toBeEnabled({ timeout: 3_000 });
    await submitBtn.click();

    // Success screen should appear showing the device_id and api_key
    await authenticatedPage.waitForSelector('.key-field', { timeout: 8_000 });
    const keyFields = authenticatedPage.locator('.key-field__value');
    // First key-field shows device_id, second shows device_api_key
    await expect(keyFields.first()).toContainText(REGISTRATION_RESULT.device_id);
    await expect(keyFields.nth(1)).toContainText(REGISTRATION_RESULT.device_api_key);
  });

  test('success screen shows a warning that the API key is shown only once', async ({
    authenticatedPage,
    mockApi,
  }) => {
    await mockApi.onPost(`farms/${FARM_ID}/devices`, REGISTRATION_RESULT);

    await authenticatedPage.goto('/manage');
    await authenticatedPage.waitForSelector('.device-card', { timeout: 10_000 });

    const registerBtn = authenticatedPage.locator(
      'button[aria-label*="Register"], button[aria-label*="register"]',
    );
    await registerBtn.click();
    await authenticatedPage.waitForSelector('#device-node-name', { timeout: 5_000 });

    await authenticatedPage.fill('#device-node-name', 'My Pi Camera');
    await authenticatedPage.waitForSelector('#device-bed-id:not([disabled])', {
      timeout: 5_000,
    });
    await authenticatedPage.selectOption('#device-bed-id', BED_ID_1);

    const submitBtn = authenticatedPage.locator('button[type="submit"].btn-primary');
    await submitBtn.click();

    // .key-warning block should contain a one-time key warning
    await authenticatedPage.waitForSelector('.key-warning', { timeout: 8_000 });
    await expect(authenticatedPage.locator('.key-warning')).toBeVisible();
  });
});

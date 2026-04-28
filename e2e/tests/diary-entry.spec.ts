/**
 * E2E — Diary workflow golden paths
 *
 * Covers:
 *   - Diary page loads with existing entries visible
 *   - "Add Entry" opens the bottom sheet form
 *   - Fill in diary form and submit (POST /farms/{farmId}/diary)
 *   - Calendar view toggle switches to calendar layout
 */

import { test, expect } from '../fixtures/auth';
import {
  TEST_USER,
  TEST_DIARY_ENTRIES,
  FARM_ID,
  API_FARM,
  API_BEDS,
  API_ME,
} from '../fixtures/mock-data';
import { expectNoSeriousA11y } from '../helpers/axe-scan';

// ── Local constants ──────────────────────────────────────────────

const BED_ID_1 = API_BEDS[0].id;

const API_DIARY = {
  data: TEST_DIARY_ENTRIES,
  meta: {
    count: TEST_DIARY_ENTRIES.length,
    limit: 50,
    next_cursor: null,
  },
};

// Created entry returned by POST /farms/{id}/diary
const CREATED_DIARY_ENTRY = {
  id: 'diary-e2e-new-001',
  farm_id: FARM_ID,
  date: '2026-04-13',
  category: 'planting',
  entry_type: 'actual',
  description: 'E2E test diary entry — planted seeds',
  time_spent_minutes: null,
  bed_id: BED_ID_1,
  bed_name: 'Bed A1',
  photo_ids: [],
  costs: [],
  cost_total: 0,
  created_by: TEST_USER.sub,
  created_by_name: TEST_USER.displayName,
  created_at: '2026-04-13T10:00:00Z',
  updated_at: '2026-04-13T10:00:00Z',
  harvest_amount: null,
  harvest_unit: null,
  revenue: null,
  revenue_currency: null,
};

// ── Tests ─────────────────────────────────────────────────────────

test.describe('Diary Page', () => {
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
    await mockApi.onGet(`farms/${FARM_ID}/beds`, { data: API_BEDS });
    await mockApi.onGet(`farms/${FARM_ID}/diary`, API_DIARY);
    await mockApi.onGet('farms', { data: [{ ...API_FARM, role: 'owner' as const }] });
    await mockApi.onGet('crop-library', { data: [] });

    await authenticatedPage.goto('/diary');
    // Wait for diary list to render (or empty state)
    await authenticatedPage.waitForSelector('.diary-list, .diary-page', { timeout: 10_000 });
  });

  test('diary page loads and shows existing entries', async ({ authenticatedPage }) => {
    // Wait for at least one diary entry card to appear
    await authenticatedPage.waitForSelector('.diary-entry', { timeout: 8_000 });
    const entries = authenticatedPage.locator('.diary-entry');
    await expect(entries).toHaveCount(TEST_DIARY_ENTRIES.length);
  });

  test('diary entries show description text from at least one entry', async ({ authenticatedPage }) => {
    await authenticatedPage.waitForSelector('.diary-entry', { timeout: 8_000 });
    // Entries are sorted by date DESC — last entry (harvesting) appears first
    const lastEntry = TEST_DIARY_ENTRIES[TEST_DIARY_ENTRIES.length - 1];
    const allEntries = authenticatedPage.locator('.diary-entry');
    await expect(allEntries.first()).toContainText(lastEntry.description);
  });

  test('clicking Add Entry opens the diary bottom sheet form', async ({ authenticatedPage }) => {
    // DiaryPage renders the add button with aria-label matching diary.add translation
    const addBtn = authenticatedPage.locator('button[aria-label], button.btn--primary').filter({
      hasText: '+',
    });
    await expect(addBtn).toBeVisible({ timeout: 5_000 });
    await addBtn.click();

    // The bottom sheet dialog should appear
    await expect(authenticatedPage.locator('[role="dialog"]')).toBeVisible({ timeout: 5_000 });
    await expect(authenticatedPage.locator('#diary-category')).toBeVisible();
    await expect(authenticatedPage.locator('#diary-description')).toBeVisible();
  });

  test('can fill diary form and submit a new entry', async ({ authenticatedPage, mockApi }) => {
    // Stub the POST for diary entry creation
    await mockApi.onPost(`farms/${FARM_ID}/diary`, CREATED_DIARY_ENTRY);

    // Stub the GET after save (DiaryPage reloads entries after onSave)
    const updatedDiary = {
      ...API_DIARY,
      data: [...API_DIARY.data, CREATED_DIARY_ENTRY],
      meta: { ...API_DIARY.meta, count: API_DIARY.data.length + 1 },
    };
    await mockApi.onGet(`farms/${FARM_ID}/diary`, updatedDiary);

    // Wave D D4 (#279) — DiaryEntryForm fan-outs `listBedCrops(bedId, 'all')`
    // per bed to populate the per-crop dropdown options. Mocked-empty here
    // since the test only exercises the bed-only attribution path.
    for (const bed of API_BEDS) {
      await mockApi.onGet(`beds/${bed.id}/crops?status=all`, { items: [] });
    }

    // Open the form
    const addBtn = authenticatedPage.locator('button').filter({ hasText: '+' }).first();
    await addBtn.click();
    await authenticatedPage.waitForSelector('[role="dialog"]', { timeout: 5_000 });

    // Fill in the diary form
    await authenticatedPage.fill('#diary-date', '2026-04-13');
    await authenticatedPage.selectOption('#diary-category', 'planting');
    await authenticatedPage.fill('#diary-description', 'E2E test diary entry — planted seeds');
    // Wave D D4 (#279): #diary-bed option values are encoded as
    // `<bedId>|<cropId?>`. Empty cropId after the pipe = bed-only attribution.
    await authenticatedPage.selectOption('#diary-bed', `${BED_ID_1}|`);

    // Submit
    const submitBtn = authenticatedPage.locator('button[type="submit"][form="diary-form"]');
    await expect(submitBtn).toBeVisible();
    await submitBtn.click();

    // Bottom sheet should close after successful save
    await authenticatedPage.waitForSelector('[role="dialog"]', {
      state: 'hidden',
      timeout: 8_000,
    });
  });

  test('calendar view toggle switches active state when clicked', async ({ authenticatedPage }) => {
    // Select the Calendar button specifically by its title attribute
    const calBtn = authenticatedPage.locator('button[title="Calendar"]');
    await expect(calBtn).toBeVisible({ timeout: 5_000 });
    // Before click: Calendar button should not be active
    await expect(calBtn).not.toHaveAttribute('aria-pressed', 'true');
    await calBtn.click();
    // After click: Calendar button should become active
    await expect(calBtn).toHaveAttribute('aria-pressed', 'true', { timeout: 5_000 });
  });

  // R-008 + R-012 (#442): axe-core a11y scan for Diary page.
  test('axe: /diary passes WCAG 2.1 A + AA critical checks', async ({ authenticatedPage }) => {
    await expectNoSeriousA11y(authenticatedPage);
  });
});

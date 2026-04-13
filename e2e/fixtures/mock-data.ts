/**
 * LitCrop E2E Mock Data
 *
 * Canonical test constants and API response helpers used across all E2E
 * tests.  Import what you need — nothing here has side-effects.
 */

// ── Test user ──────────────────────────────────────────────────────

export const TEST_USER = {
  sub: 'test-user-sub-123',
  email: 'test@litcrop.com',
  displayName: 'Test Farmer',
};

// ── Farm ──────────────────────────────────────────────────────────

export const TEST_FARM = {
  farm_id: 'farm-e2e-001',
  name: 'E2E Test Farm',
  description: 'Farm for E2E testing',
  owner_id: TEST_USER.sub,
  location: 'Tokyo, Japan',
  location_lat: 35.6762,
  location_lon: 139.6503,
  grid_rows: 2,
  grid_cols: 3,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-04-13T00:00:00Z',
};

// ── Beds (2 rows × 3 cols = 6 beds) ──────────────────────────────

export const TEST_BEDS = [
  {
    bed_id: 'bed-e2e-a1',
    farm_id: TEST_FARM.farm_id,
    bed_name: 'A1',
    row_index: 0,
    col_index: 0,
    crop_id: 'tomato',
    crop_name: 'Tomato',
    crop_emoji: '🍅',
    planted_at: '2026-03-01',
    expected_harvest_at: '2026-05-20',
    notes: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-04-13T00:00:00Z',
  },
  {
    bed_id: 'bed-e2e-a2',
    farm_id: TEST_FARM.farm_id,
    bed_name: 'A2',
    row_index: 0,
    col_index: 1,
    crop_id: 'cucumber',
    crop_name: 'Cucumber',
    crop_emoji: '🥒',
    planted_at: '2026-03-10',
    expected_harvest_at: '2026-05-09',
    notes: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-04-13T00:00:00Z',
  },
  {
    bed_id: 'bed-e2e-a3',
    farm_id: TEST_FARM.farm_id,
    bed_name: 'A3',
    row_index: 0,
    col_index: 2,
    crop_id: null,
    crop_name: null,
    crop_emoji: null,
    planted_at: null,
    expected_harvest_at: null,
    notes: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-04-13T00:00:00Z',
  },
  {
    bed_id: 'bed-e2e-b1',
    farm_id: TEST_FARM.farm_id,
    bed_name: 'B1',
    row_index: 1,
    col_index: 0,
    crop_id: null,
    crop_name: null,
    crop_emoji: null,
    planted_at: null,
    expected_harvest_at: null,
    notes: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-04-13T00:00:00Z',
  },
  {
    bed_id: 'bed-e2e-b2',
    farm_id: TEST_FARM.farm_id,
    bed_name: 'B2',
    row_index: 1,
    col_index: 1,
    crop_id: null,
    crop_name: null,
    crop_emoji: null,
    planted_at: null,
    expected_harvest_at: null,
    notes: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-04-13T00:00:00Z',
  },
  {
    bed_id: 'bed-e2e-b3',
    farm_id: TEST_FARM.farm_id,
    bed_name: 'B3',
    row_index: 1,
    col_index: 2,
    crop_id: null,
    crop_name: null,
    crop_emoji: null,
    planted_at: null,
    expected_harvest_at: null,
    notes: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-04-13T00:00:00Z',
  },
];

// ── Diary entries ─────────────────────────────────────────────────

export const TEST_DIARY_ENTRIES = [
  {
    id: 'diary-e2e-001',
    farm_id: TEST_FARM.farm_id,
    date: '2026-03-01',
    category: 'planting',
    entry_type: 'actual' as const,
    description: 'Planted tomato seedlings in A1.',
    time_spent_minutes: 45,
    bed_id: 'bed-e2e-a1',
    bed_name: 'A1',
    photo_ids: [],
    costs: [{ item: 'Seedlings', amount: 800, currency: 'JPY' as const }],
    cost_total: 800,
    created_by: TEST_USER.sub,
    created_by_name: TEST_USER.displayName,
    created_at: '2026-03-01T08:00:00Z',
    updated_at: '2026-03-01T08:00:00Z',
    harvest_amount: null,
    harvest_unit: null,
    revenue: null,
    revenue_currency: null,
  },
  {
    id: 'diary-e2e-002',
    farm_id: TEST_FARM.farm_id,
    date: '2026-03-15',
    category: 'watering',
    entry_type: 'actual' as const,
    description: 'Watered all beds.',
    time_spent_minutes: 20,
    bed_id: null,
    bed_name: null,
    photo_ids: [],
    costs: [],
    cost_total: 0,
    created_by: TEST_USER.sub,
    created_by_name: TEST_USER.displayName,
    created_at: '2026-03-15T07:30:00Z',
    updated_at: '2026-03-15T07:30:00Z',
    harvest_amount: null,
    harvest_unit: null,
    revenue: null,
    revenue_currency: null,
  },
  {
    id: 'diary-e2e-003',
    farm_id: TEST_FARM.farm_id,
    date: '2026-05-20',
    category: 'harvesting',
    entry_type: 'actual' as const,
    description: 'Harvested tomatoes from A1.',
    time_spent_minutes: 60,
    bed_id: 'bed-e2e-a1',
    bed_name: 'A1',
    photo_ids: [],
    costs: [],
    cost_total: 0,
    created_by: TEST_USER.sub,
    created_by_name: TEST_USER.displayName,
    created_at: '2026-05-20T09:00:00Z',
    updated_at: '2026-05-20T09:00:00Z',
    harvest_amount: 3.2,
    harvest_unit: 'kg',
    revenue: 1500,
    revenue_currency: 'JPY' as const,
  },
];

// ── Devices ───────────────────────────────────────────────────────

export const TEST_DEVICES = [
  {
    device_id: 'dev-e2e-001',
    farm_id: TEST_FARM.farm_id,
    bed_id: TEST_BEDS[0].bed_id,
    bed_name: TEST_BEDS[0].bed_name,
    node_name: 'Garden Cam',
    status: 'online' as const,
    capture_interval: 3600,
    resolution: '1920x1080',
    jpeg_quality: 85,
    active_window: { start: '06:00', end: '18:00' },
    trigger_type: 'scheduled' as const,
    last_seen_at: '2026-04-13T10:00:00Z',
    battery_level: 78,
    wifi_signal_dbm: -55,
    storage_status: 'ok' as const,
    capabilities: {
      resolutions: ['1920x1080', '1280x720'],
      has_battery_sensor: true,
      has_pir_sensor: false,
    },
    test_shot_requested: false,
    created_at: '2026-01-15T00:00:00Z',
    updated_at: '2026-04-13T10:00:00Z',
  },
];

// ── Farm members ──────────────────────────────────────────────────

export const TEST_MEMBERS = [
  {
    user_id: TEST_USER.sub,
    farm_id: TEST_FARM.farm_id,
    role: 'owner' as const,
    email: TEST_USER.email,
    display_name: TEST_USER.displayName,
    profile_picture_thumb_url: null,
  },
];

// ── Crop library subset ───────────────────────────────────────────

export const TEST_CROPS = [
  {
    crop_id: 'tomato',
    name: 'Tomato',
    name_ja: 'トマト',
    emoji: '🍅',
    days_to_harvest: 80,
    category: 'fruit',
  },
  {
    crop_id: 'cucumber',
    name: 'Cucumber',
    name_ja: 'きゅうり',
    emoji: '🥒',
    days_to_harvest: 60,
    category: 'fruit',
  },
  {
    crop_id: 'carrot',
    name: 'Carrot',
    name_ja: 'にんじん',
    emoji: '🥕',
    days_to_harvest: 75,
    category: 'root',
  },
];

// ── API-shaped constants ─────────────────────────────────────────
// The frontend components consume slightly different field names than
// the TEST_* constants above (e.g. `id` vs `farm_id`).  These "API_*"
// shapes match what the real backend returns and are shared across the
// golden-path E2E tests so each spec file doesn't re-declare them.

export const FARM_ID = 'farm-e2e-001';

/** Farm object as returned by GET /farms/{id} */
export const API_FARM = {
  id: FARM_ID,
  user_id: TEST_USER.sub,
  name: 'E2E Test Farm',
  description: 'Farm used for E2E testing',
  location_text: 'Tokyo, Japan',
  latitude: 35.6762,
  longitude: 139.6503,
  locale: 'en',
  theme: 'light',
  grid_rows: 2,
  grid_cols: 3,
  created_at: '2026-01-01T00:00:00Z',
  default_currency: 'JPY',
};

/** Profile object as returned by GET /me/profile */
export const API_ME = {
  user_id: TEST_USER.sub,
  display_name: TEST_USER.displayName,
  preferred_role: 'owner' as const,
  created_at: '2026-01-01T00:00:00Z',
  is_admin: false,
  profile_picture_url: null,
  profile_picture_thumb_url: null,
};

/** Bed shape as returned by GET /farms/{id}/beds */
export const API_BEDS = [
  {
    id: 'bed-e2e-a1',
    farm_id: FARM_ID,
    row: 0,
    col: 0,
    name: 'Bed A1',
    crop_type: 'tomato',
    crop_variety: 'Cherry',
    planted_at: '2026-03-01',
    expected_harvest: '2026-07-01',
    notes: 'E2E test bed',
    latest_status: 'healthy',
    latest_image: null,
  },
  {
    id: 'bed-e2e-a2',
    farm_id: FARM_ID,
    row: 0,
    col: 1,
    name: 'Bed A2',
    crop_type: null,
    crop_variety: null,
    planted_at: null,
    expected_harvest: null,
    notes: null,
    latest_status: 'no_data',
    latest_image: null,
  },
];

/** Farms list as returned by GET /farms */
export const API_FARMS_LIST = {
  data: [{ ...API_FARM, role: 'owner' as const }],
};

/** Stub for GET /farms/{id}/weather (non-critical, prevents 404 noise) */
export const API_WEATHER_STUB = {
  current: { temperature: 20, humidity: 60, wind_speed: 10, condition_icon: 'sunny' },
  today: { high: 22, low: 15, rain_probability: 5 },
  daily: [],
};

/** Empty images list — used by BedDetail image gallery stubs */
export const API_EMPTY_IMAGES = {
  data: [],
  meta: { count: 0, limit: 20, next_cursor: null },
};

// ── Standard API response wrappers ────────────────────────────────

/** GET /api/v1/farms/{farmId} */
export function farmResponse(farm = API_FARM) {
  return { data: farm };
}

/** GET /api/v1/farms/{farmId}/beds */
export function bedsResponse(beds = API_BEDS) {
  return { data: beds };
}

/** GET /api/v1/farms/{farmId}/diary */
export function diaryResponse(
  entries = TEST_DIARY_ENTRIES,
  opts: { limit?: number; next_cursor?: string | null } = {},
) {
  return {
    data: entries,
    meta: {
      count: entries.length,
      limit: opts.limit ?? 50,
      next_cursor: opts.next_cursor ?? null,
    },
  };
}

/** GET /api/v1/farms/{farmId}/devices */
export function devicesResponse(devices = TEST_DEVICES) {
  return { devices };
}

/** GET /api/v1/farms/{farmId}/members */
export function membersResponse(members = TEST_MEMBERS) {
  return { data: members };
}

/** GET /api/v1/crop-library (or equivalent static endpoint) */
export function cropsResponse(crops = TEST_CROPS) {
  return { data: crops };
}

/** GET /api/v1/me — profile + farm membership summary */
export function meResponse() {
  return {
    data: {
      sub: TEST_USER.sub,
      email: TEST_USER.email,
      display_name: TEST_USER.displayName,
      preferred_role: 'owner' as const,
      is_admin: false,
      profile_picture_url: null,
      profile_picture_thumb_url: null,
      farms: [
        {
          farm_id: TEST_FARM.farm_id,
          name: TEST_FARM.name,
          role: 'owner' as const,
        },
      ],
    },
  };
}

/** GET /api/v1/me/profile */
export function profileResponse() {
  return {
    user_id: TEST_USER.sub,
    display_name: TEST_USER.displayName,
    preferred_role: 'owner' as const,
    created_at: '2026-01-01T00:00:00Z',
    is_admin: false,
    profile_picture_url: null,
    profile_picture_thumb_url: null,
  };
}

/** GET /api/v1/me/settings */
export function settingsResponse() {
  return {
    locale: 'en' as const,
    temp_unit: 'C' as const,
    theme: 'system' as const,
    updated_at: '2026-01-01T00:00:00Z',
  };
}

/** GET /api/v1/farms — my farms list (used by api.getMyFarms) */
export function myFarmsResponse(farm = TEST_FARM) {
  return {
    data: [{ ...farm, role: 'owner' as const }],
  };
}

/** Empty farms list — for new-user / setup-wizard tests */
export function emptyFarmsListResponse() {
  return { data: [] };
}

/**
 * @litcrop/shared — Zod schemas for all API response shapes.
 *
 * These schemas mirror the actual wire-format responses from each route,
 * which may include extra fields not declared in the TypeScript types
 * (e.g. cached_at, apparent_temperature). Use these for contract tests
 * and runtime validation at API boundaries.
 *
 * Updated: Phase D — Farm→Bed flattening (ADR-20260322)
 */

import { z } from 'zod';

// ── Enum schemas ─────────────────────────────────────────────────

export const BedStatusSchema = z.enum([
  'healthy',
  'slow_growth',
  'issue',
  'animal_intrusion',
  'no_data',
]);

/** @deprecated Use BedStatusSchema */
export const PlotStatusSchema = BedStatusSchema;

export const TriggerTypeSchema = z.enum(['scheduled', 'motion']);

export const TagValueSchema = z.enum([
  'healthy',
  'slow_growth',
  'issue',
  'animal_intrusion',
]);

export const LocaleSchema = z.enum(['en', 'ja']);

export const ThemeSchema = z.enum(['light', 'dark', 'earthy', 'system']);

export const FarmRoleSchema = z.enum(['admin', 'owner', 'staff']);

// ── Farm schemas ─────────────────────────────────────────────────

export const CurrencySchema = z.enum(['JPY', 'USD']);

export const FarmVisibilitySchema = z.enum(['public', 'private']);

/** farmToResponse() shape — base farm fields without beds */
export const FarmBaseSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  location_text: z.string(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  elevation_m: z.number().nullable(),
  climate_zone: z.string().nullable(),
  locale: LocaleSchema,
  theme: ThemeSchema,
  grid_rows: z.number().int().min(1).max(5),
  grid_cols: z.number().int().min(1).max(5),
  created_at: z.string(),
  default_currency: CurrencySchema.default('JPY'),
  visibility: FarmVisibilitySchema.optional(),
});

/** Bed summary within GET /farms/:farmId response */
export const FarmBedSchema = z.object({
  id: z.string(),
  row: z.number().int().min(1).max(5),
  col: z.number().int().min(1).max(5),
  name: z.string(),
  crop_type: z.string().nullable(),
  crop_variety: z.string().nullable(),
  latest_status: BedStatusSchema,
  planted_at: z.string().nullable().optional(),
  expected_harvest: z.string().nullable().optional(),
  completed_at: z.string().nullable().optional(),
});

/** GET /api/v1/farms/:farmId — farm with flat beds array */
export const FarmResponseSchema = FarmBaseSchema.extend({
  beds: z.array(FarmBedSchema),
});

/** POST /api/v1/farms and PATCH /api/v1/farms/:farmId */
export const FarmWriteResponseSchema = FarmBaseSchema;

// ── Farm request schemas (input validation) ──────────────────────

const FarmFieldsSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().max(500).nullable().optional(),
  location_text: z.string().trim().min(1).max(200),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  elevation_m: z.number().min(0).max(9000).nullable().optional(),
  locale: LocaleSchema.optional(),
  theme: ThemeSchema.optional(),
  grid_rows: z.number().int().min(1).max(5).optional(),
  grid_cols: z.number().int().min(1).max(5).optional(),
  default_currency: CurrencySchema.optional(),
  visibility: FarmVisibilitySchema.optional(),
});

export const CreateFarmRequestSchema = FarmFieldsSchema;
export const UpdateFarmRequestSchema = FarmFieldsSchema.partial();

/** FarmMember — represents a user's membership in a farm */
export const FarmMemberSchema = z.object({
  user_id: z.string(),
  farm_id: z.string(),
  role: FarmRoleSchema,
  joined_at: z.string(),
});

/** GET /api/v1/farms — list of farm summaries with role */
export const FarmsListResponseSchema = z.object({
  data: z.array(FarmBaseSchema.extend({
    role: FarmRoleSchema,
  })),
});

// ── Bed list schemas ─────────────────────────────────────────────

const LatestImageThumbnailSchema = z.object({
  id: z.string(),
  thumbnail_url: z.string().nullable(),
  captured_at: z.string(),
  trigger: TriggerTypeSchema,
});

/** GET /api/v1/farms/:farmId/beds — each item */
export const FarmBedItemSchema = z.object({
  id: z.string(),
  row: z.number().int(),
  col: z.number().int(),
  name: z.string(),
  crop_type: z.string().nullable(),
  crop_variety: z.string().nullable(),
  latest_status: BedStatusSchema,
  latest_image: LatestImageThumbnailSchema.nullable(),
  planted_at: z.string().nullable().optional(),
  expected_harvest: z.string().nullable().optional(),
  completed_at: z.string().nullable().optional(),
});

/** GET /api/v1/farms/:farmId/beds — envelope */
export const FarmBedsResponseSchema = z.object({
  data: z.array(FarmBedItemSchema),
});

// ── Tag in image schema (shared by bed detail + image detail) ────

const TagInImageSchema = z.object({
  id: z.string(),
  tag: TagValueSchema,
  note: z.string().nullable(),
  created_at: z.string(),
});

// ── Bed detail schema ────────────────────────────────────────────

/** Full image shape for bed detail — includes signed URL and tags */
const BedDetailImageSchema = z.object({
  id: z.string(),
  thumbnail_url: z.string().nullable(),
  url: z.string(),
  captured_at: z.string(),
  trigger: TriggerTypeSchema,
  tags: z.array(TagInImageSchema),
});

/** GET /api/v1/beds/:bedId */
export const BedDetailResponseSchema = FarmBedSchema.extend({
  farm_id: z.string(),
  planted_at: z.string().nullable(),
  expected_harvest: z.string().nullable(),
  completed_at: z.string().nullable(),
  notes: z.string().nullable(),
  latest_image: BedDetailImageSchema.nullable(),
});

/** PATCH /api/v1/beds/:bedId — request body */
export const UpdateBedRequestSchema = z.object({
  crop_type: z.string().min(1).max(100).nullable().optional(),
  crop_variety: z.string().min(1).max(100).nullable().optional(),
  planted_at: z.string().nullable().optional(),
  expected_harvest: z.string().nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
  completed_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

// ── Image list schema ─────────────────────────────────────────────

const ImageListItemSchema = z.object({
  id: z.string(),
  thumbnail_url: z.string().nullable(),
  captured_at: z.string(),
  trigger: TriggerTypeSchema,
  node_id: z.string(),
  size_bytes: z.number(),
  latest_tag: TagValueSchema.nullable(),
});

/** GET /api/v1/beds/:bedId/images — paginated envelope */
export const ImageListResponseSchema = z.object({
  data: z.array(ImageListItemSchema),
  meta: z.object({
    count: z.number(),
    limit: z.number(),
    next_cursor: z.string().nullable(),
  }),
});

// ── Image upload schema ───────────────────────────────────────────

/** POST /api/v1/beds/:bedId/images (201) */
export const ImageUploadResponseSchema = z.object({
  id: z.string(),
  url: z.string(),
  captured_at: z.string(),
  uploaded_at: z.string(),
  trigger: TriggerTypeSchema,
  size_bytes: z.number(),
});

// ── Image detail schema ───────────────────────────────────────────

/** GET /api/v1/images/:imageId */
export const ImageDetailResponseSchema = z.object({
  id: z.string(),
  bed_id: z.string(),
  node_id: z.string(),
  captured_at: z.string(),
  uploaded_at: z.string(),
  url: z.string(),
  thumbnail_url: z.string().nullable(),
  trigger: TriggerTypeSchema,
  content_type: z.string(),
  size_bytes: z.number(),
  metadata: z.record(z.unknown()).nullable(),
  tags: z.array(TagInImageSchema),
});

// ── Tag create schema ─────────────────────────────────────────────

/** POST /api/v1/images/:imageId/tags (201) */
export const TagCreateResponseSchema = z.object({
  id: z.string(),
  image_id: z.string(),
  tag: TagValueSchema,
  note: z.string().nullable(),
  created_at: z.string(),
  bed_status_updated: z.boolean(),
});

// ── Weather schemas ───────────────────────────────────────────────

const HourlyForecastSchema = z.object({
  time: z.string(),
  temperature: z.number(),
  rain_probability: z.number(),
  condition_icon: z.string(),
});

const DailyForecastSchema = z.object({
  date: z.string(),
  high: z.number(),
  low: z.number(),
  rain_probability: z.number(),
  rain_sum_mm: z.number(),
  condition: z.string(),
  condition_icon: z.string(),
});

const WeatherAlertSchema = z.object({
  type: z.enum(['frost', 'heavy_rain', 'extreme_heat']),
  severity: z.enum(['warning', 'danger']),
  message: z.string(),
});

const CropImpactCardSchema = z.object({
  severity: z.enum(['danger', 'warning', 'good', 'info']),
  title: z.string(),
  description: z.string(),
  affected_beds: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      crop_type: z.string(),
    }),
  ),
});

/**
 * GET /api/v1/farms/:farmId/weather
 *
 * NOTE: The route returns extra fields not declared in the WeatherResponse type:
 *   - current.apparent_temperature, current.weather_code (internal Open-Meteo fields)
 *   - cached_at (cache metadata)
 * The schema uses .passthrough() on `current` to allow these extras through.
 */
export const WeatherResponseSchema = z.object({
  current: z
    .object({
      temperature: z.number(),
      condition: z.string(),
      condition_icon: z.string(),
      humidity: z.number(),
      wind_speed: z.number(),
      wind_direction: z.string(),
    })
    .passthrough(), // allows apparent_temperature, weather_code, etc.
  today: z.object({
    high: z.number(),
    low: z.number(),
    rain_probability: z.number(),
    rain_sum_mm: z.number(),
    sunrise: z.string(),
    sunset: z.string(),
  }),
  hourly: z.array(HourlyForecastSchema),
  daily: z.array(DailyForecastSchema),
  alerts: z.array(WeatherAlertSchema),
  crop_impact: z.array(CropImpactCardSchema),
  cached_at: z.string(),
});

// ── Chat schema ───────────────────────────────────────────────────

/**
 * POST /api/v1/chat
 *
 * NOTE: The route appends conversation_id which is not in the ChatResponse type.
 */
export const ChatResponseSchema = z.object({
  reply: z.string(),
  suggestions: z.array(z.string()),
  conversation_id: z.string(),
  tool_calls: z.array(z.object({
    name: z.string(),
    input: z.record(z.unknown()),
  })).optional(),
});

// ── Profile schema ────────────────────────────────────────────────

/** PATCH /api/v1/me/profile — request body */
export const UpdateProfileRequestSchema = z.object({
  display_name: z.string().min(1).max(100).optional(),
  preferred_role: z.enum(['owner', 'staff']).optional(),
});

// ── Settings schema ──────────────────────────────────────────────

export const TempUnitSchema = z.enum(['C', 'F']);

/** PATCH /api/v1/me/settings — request body (at least one field required) */
export const UpdateSettingsRequestSchema = z.object({
  locale: LocaleSchema.optional(),
  temp_unit: TempUnitSchema.optional(),
  theme: ThemeSchema.optional(),
}).refine(obj => Object.keys(obj).length > 0, {
  message: 'At least one setting field is required',
});

/** GET|PATCH /api/v1/me/settings — response */
export const UserSettingsResponseSchema = z.object({
  locale: LocaleSchema,
  temp_unit: TempUnitSchema,
  theme: ThemeSchema,
  updated_at: z.string(),
});

// ── Usage schema (MVP: AI budget status) ─────────────────────────

const UserBudgetSchema = z.object({
  input_tokens_used: z.number(),
  input_tokens_limit: z.number(),
  output_tokens_used: z.number(),
  output_tokens_limit: z.number(),
  messages_sent: z.number(),
  messages_limit: z.number(),
});

const GlobalBudgetSchema = z.object({
  input_tokens_used: z.number(),
  input_tokens_limit: z.number(),
  output_tokens_used: z.number(),
  output_tokens_limit: z.number(),
  utilization_pct: z.number(),
});

/** GET /api/v1/usage */
export const UsageResponseSchema = z.object({
  user_id: z.string(),
  period: z.literal('daily'),
  period_start: z.string(),
  reset_at: z.string(),
  user_budget: UserBudgetSchema,
  global_budget: GlobalBudgetSchema,
});

// ── Device schemas (Beta-5) ──────────────────────────────────────

import {
  MAX_NODE_NAME_LENGTH,
  MIN_CAPTURE_INTERVAL,
  MAX_CAPTURE_INTERVAL,
} from '../constants';

export const DeviceStatusSchema = z.enum(['online', 'offline', 'inactive']);
export const StorageStatusSchema = z.enum(['ok', 'low', 'full']);

const NodeNameSchema = z.string().min(1).max(MAX_NODE_NAME_LENGTH);

export const DeviceCapabilitiesSchema = z.object({
  resolutions: z.array(z.string()),
  has_battery_sensor: z.boolean(),
  has_pir_sensor: z.boolean(),
});

const TimeOfDaySchema = z.string().regex(/^\d{2}:\d{2}$/, 'Must be HH:MM format');

const ActiveWindowSchema = z.object({
  start: TimeOfDaySchema,
  end: TimeOfDaySchema,
});

/** GET /api/v1/farms/:farmId/devices — each device in the list */
export const DeviceListItemSchema = z.object({
  device_id: z.string(),
  farm_id: z.string(),
  bed_id: z.string(),
  bed_name: z.string(),
  node_name: NodeNameSchema,
  status: DeviceStatusSchema,
  capture_interval: z.number().int(),
  resolution: z.string(),
  jpeg_quality: z.number().int().min(50).max(100),
  active_window: ActiveWindowSchema,
  trigger_type: z.literal('scheduled'),
  last_seen_at: z.string().nullable(),
  battery_level: z.number().nullable(),
  wifi_signal_dbm: z.number().nullable(),
  storage_status: StorageStatusSchema.nullable(),
  capabilities: DeviceCapabilitiesSchema.nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

/** GET /api/v1/farms/:farmId/devices — envelope */
export const DeviceListResponseSchema = z.object({
  devices: z.array(DeviceListItemSchema),
});

/** POST /api/v1/farms/:farmId/devices (201) — includes one-time API key */
export const DeviceRegistrationResponseSchema = z.object({
  device_id: z.string(),
  node_name: NodeNameSchema,
  bed_id: z.string(),
  device_api_key: z.string(),
  config_poll_url: z.string(),
  created_at: z.string(),
});

/** GET /api/v1/devices/:deviceId/config — Pi-facing config */
export const DeviceConfigResponseSchema = z.object({
  capture_interval: z.number(),
  resolution: z.string(),
  jpeg_quality: z.number(),
  active_window: ActiveWindowSchema,
  trigger_type: z.literal('scheduled'),
  bed_id: z.string(),
  upload_url: z.string(),
  test_shot_requested: z.boolean(),
});

/** POST /api/v1/farms/:farmId/devices — request body */
export const RegisterDeviceRequestSchema = z.object({
  node_name: NodeNameSchema,
  bed_id: z.string().min(1),
});

/** PATCH /api/v1/farms/:farmId/devices/:deviceId — request body */
export const UpdateDeviceRequestSchema = z.object({
  node_name: NodeNameSchema.optional(),
  bed_id: z.string().min(1).optional(),
  capture_interval: z.number().int().min(MIN_CAPTURE_INTERVAL).max(MAX_CAPTURE_INTERVAL).optional(),
  resolution: z.string().optional(),
  jpeg_quality: z.number().int().min(50).max(100).optional(),
  active_window: ActiveWindowSchema.optional(),
});

/** POST /api/v1/devices/:deviceId/heartbeat — request body */
export const DeviceHeartbeatRequestSchema = z.object({
  battery_level: z.number().int().min(0).max(100).nullable().optional(),
  wifi_signal_dbm: z.number().min(-120).max(0).nullable().optional(),
  storage_status: StorageStatusSchema.optional(),
  capabilities: DeviceCapabilitiesSchema.optional(),
});

// ── Diary schemas (Beta-7) ───────────────────────────────────────

export const DiaryCategorySchema = z.enum([
  'seeding', 'planting', 'watering', 'fertilizing', 'harvesting',
  'weeding', 'pest_control', 'maintenance', 'purchase', 'other',
]);

export const DiaryEntryTypeSchema = z.enum(['reserved', 'actual']);

export const CostItemSchema = z.object({
  item: z.string().min(1).max(100).trim(),
  amount: z.number().min(0).max(99_999_999),
  currency: CurrencySchema,
});

/** Base diary entry fields (shared between create and update schemas) */
const DiaryEntryFieldsSchema = z.object({
  date: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD')
    .refine(s => !isNaN(Date.parse(s)), { message: 'Invalid calendar date' })
    .refine(s => {
      const y = parseInt(s.slice(0, 4), 10);
      return y >= 2020 && y <= 2100;
    }, { message: 'Date year must be between 2020 and 2100' }),
  category: DiaryCategorySchema,
  entry_type: DiaryEntryTypeSchema.optional().default('actual'),
  description: z.string().min(1).max(1000).trim(),
  time_spent_minutes: z.number().int().min(1).max(1440).nullable().optional(),
  bed_id: z.string().uuid().nullable().optional(),
  photo_ids: z.array(z.string().uuid()).max(5).default([]),
  costs: z.array(CostItemSchema).max(10).default([]),
  // Beta-10: Harvest & revenue fields
  harvest_amount: z.number().min(0).max(999_999).nullable().optional(),
  harvest_unit: z.string().min(1).max(20).trim().nullable().optional(),
  revenue: z.number().min(0).max(99_999_999).nullable().optional(),
  revenue_currency: CurrencySchema.nullable().optional(),
});

/** Returns false when harvest/revenue fields are set on a non-harvesting entry */
function harvestFieldsRefine(data: {
  category?: string;
  harvest_amount?: number | null;
  harvest_unit?: string | null;
  revenue?: number | null;
  revenue_currency?: string | null;
}): boolean {
  if (data.category && data.category !== 'harvesting') {
    return data.harvest_amount == null && data.harvest_unit == null &&
           data.revenue == null && data.revenue_currency == null;
  }
  return true;
}

const harvestRefineOptions = {
  message: 'Harvest and revenue fields are only allowed when category is harvesting',
  path: ['category'] as (string | number)[],
};

/** POST /api/v1/farms/:farmId/diary — request body */
export const CreateDiaryEntrySchema = DiaryEntryFieldsSchema
  .refine(harvestFieldsRefine, harvestRefineOptions);

/** PATCH /api/v1/farms/:farmId/diary/:entryId — request body */
export const UpdateDiaryEntrySchema = DiaryEntryFieldsSchema
  .omit({ date: true })
  .partial()
  .refine(harvestFieldsRefine, harvestRefineOptions);

/** GET /api/v1/farms/:farmId/diary — query params */
export const DiaryListQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  category: DiaryCategorySchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
}).refine(data => {
  if (data.from && data.to) {
    const diff = (Date.parse(data.to) - Date.parse(data.from)) / 86_400_000;
    return diff >= 0 && diff <= 400;
  }
  return true;
}, { message: 'Date range must be 0-400 days' });

/** Diary entry response shape — for contract tests */
export const DiaryEntryResponseSchema = z.object({
  id: z.string(),
  farm_id: z.string(),
  date: z.string(),
  category: DiaryCategorySchema,
  entry_type: DiaryEntryTypeSchema,
  description: z.string(),
  time_spent_minutes: z.number().nullable(),
  bed_id: z.string().nullable(),
  bed_name: z.string().nullable(),
  photo_ids: z.array(z.string()),
  costs: z.array(CostItemSchema),
  cost_total: z.number(),
  created_by: z.string(),
  created_by_name: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  // Beta-10: Harvest & revenue fields
  harvest_amount: z.number().nullable(),
  harvest_unit: z.string().nullable(),
  revenue: z.number().nullable(),
  revenue_currency: CurrencySchema.nullable(),
});

/** Paginated diary list response */
export const DiaryListResponseSchema = z.object({
  data: z.array(DiaryEntryResponseSchema),
  meta: z.object({
    count: z.number(),
    limit: z.number(),
    next_cursor: z.string().nullable(),
  }),
});

// ── Profile picture schemas (Beta-5) ─────────────────────────────

/** POST /api/v1/me/profile-picture (201) */
export const ProfilePictureResponseSchema = z.object({
  profile_picture_url: z.string(),
  profile_picture_thumb_url: z.string(),
});

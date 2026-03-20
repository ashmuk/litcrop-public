/**
 * @litcrop/shared — Zod schemas for all API response shapes.
 *
 * These schemas mirror the actual wire-format responses from each route,
 * which may include extra fields not declared in the TypeScript types
 * (e.g. cached_at, apparent_temperature). Use these for contract tests
 * and runtime validation at API boundaries.
 */

import { z } from 'zod';

// ── Enum schemas ─────────────────────────────────────────────────

export const PlotStatusSchema = z.enum([
  'healthy',
  'slow_growth',
  'issue',
  'animal_intrusion',
  'no_data',
]);

export const TriggerTypeSchema = z.enum(['scheduled', 'motion']);

export const TagValueSchema = z.enum([
  'healthy',
  'slow_growth',
  'issue',
  'animal_intrusion',
]);

export const LocaleSchema = z.enum(['en', 'ja']);

export const ThemeSchema = z.enum(['light', 'dark', 'earthy', 'system']);

// ── Farm schemas ─────────────────────────────────────────────────

/** farmToResponse() shape — base farm fields without nested relations */
export const FarmBaseSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  latitude: z.number(),
  longitude: z.number(),
  elevation_m: z.number().nullable(),
  climate_zone: z.string().nullable(),
  locale: LocaleSchema,
  theme: ThemeSchema,
  created_at: z.string(),
});

/** Minimal plot summary nested inside GET /farms/:farmId */
const NestedPlotSchema = z.object({
  id: z.string(),
  label: z.string(),
  crop_type: z.string(),
  crop_variety: z.string(),
  latest_status: PlotStatusSchema,
});

/** GET /api/v1/farms/:farmId — full farm with field/bed/plot tree */
export const FarmResponseSchema = FarmBaseSchema.extend({
  fields: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      position: z.number(),
      beds: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          position: z.number(),
          plots: z.array(NestedPlotSchema),
        }),
      ),
    }),
  ),
});

/** POST /api/v1/farms and PATCH /api/v1/farms/:farmId */
export const FarmWriteResponseSchema = FarmBaseSchema;

// ── Plot list schemas ─────────────────────────────────────────────

const LatestImageThumbnailSchema = z.object({
  id: z.string(),
  thumbnail_url: z.string().nullable(),
  captured_at: z.string(),
  trigger: TriggerTypeSchema,
});

/** GET /api/v1/farms/:farmId/plots — each item */
export const FarmPlotItemSchema = z.object({
  id: z.string(),
  label: z.string(),
  bed_id: z.string(),
  field_id: z.string().optional(),  // populated when bed lookup succeeds
  crop_type: z.string(),
  crop_variety: z.string(),
  latest_status: PlotStatusSchema,
  latest_image: LatestImageThumbnailSchema.nullable(),
  field_name: z.string(),
  bed_name: z.string(),
});

/** GET /api/v1/farms/:farmId/plots — envelope */
export const FarmPlotsResponseSchema = z.object({
  data: z.array(FarmPlotItemSchema),
});

// ── Plot detail schema ────────────────────────────────────────────

/** GET /api/v1/plots/:plotId */
export const PlotDetailResponseSchema = z.object({
  id: z.string(),
  label: z.string(),
  crop_type: z.string(),
  crop_variety: z.string(),
  planted_at: z.string(),
  expected_harvest: z.string(),
  notes: z.string().nullable(),
  latest_status: PlotStatusSchema,
  field_name: z.string(),
  bed_name: z.string(),
  farm_id: z.string(),
  latest_image: LatestImageThumbnailSchema.nullable(),
});

// ── Image list schema ─────────────────────────────────────────────

const ImageListItemSchema = z.object({
  id: z.string(),
  thumbnail_url: z.string().nullable(),
  captured_at: z.string(),
  trigger: TriggerTypeSchema,
  size_bytes: z.number(),
  latest_tag: TagValueSchema.nullable(),
});

/** GET /api/v1/plots/:plotId/images — paginated envelope */
export const ImageListResponseSchema = z.object({
  data: z.array(ImageListItemSchema),
  meta: z.object({
    count: z.number(),
    limit: z.number(),
    next_cursor: z.string().nullable(),
  }),
});

// ── Image upload schema ───────────────────────────────────────────

/** POST /api/v1/plots/:plotId/images (201) */
export const ImageUploadResponseSchema = z.object({
  id: z.string(),
  url: z.string(),
  captured_at: z.string(),
  uploaded_at: z.string(),
  storage_key: z.string(),
  trigger: TriggerTypeSchema,
  size_bytes: z.number(),
});

// ── Image detail schema ───────────────────────────────────────────

const TagInImageSchema = z.object({
  id: z.string(),
  tag: TagValueSchema,
  note: z.string().nullable(),
  created_at: z.string(),
});

/** GET /api/v1/images/:imageId */
export const ImageDetailResponseSchema = z.object({
  id: z.string(),
  plot_id: z.string(),
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
  plot_status_updated: z.boolean(),
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
  affected_plots: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
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
  cached_at: z.string(), // present in wire format even though not in WeatherResponse type
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
  model: z.string(),
});

/**
 * LitCrop API response and error types
 * Source of truth: docs/SYSTEM-DESIGN.md §2.2 and docs/API-CONTRACTS.md
 */

import type { Farm, Field, Bed, Plot, Image, Tag, PlotStatus, TriggerType, TagValue } from './domain';

// ── Response Envelopes ───────────────────────────────────────────

export interface ApiResponse<T> {
  data: T;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    count: number;
    limit: number;
    next_cursor: string | null;
  };
}

export interface ApiError {
  error: {
    code: ErrorCode;
    message: string;
    details?: Record<string, unknown>;
  };
}

export type ErrorCode =
  | 'BAD_REQUEST'
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'PAYLOAD_TOO_LARGE'
  | 'UNSUPPORTED_MEDIA_TYPE'
  | 'UNAUTHORIZED'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'BUDGET_EXCEEDED'
  | 'INTERNAL_ERROR'
  | 'SERVICE_UNAVAILABLE'
  | 'BAD_CURSOR'
  | 'UPSTREAM_ERROR';

// ── Endpoint-Specific Response Types ────────────────────────────

/** GET /api/v1/farms/{farmId} */
export interface FarmResponse extends Farm {
  fields: (Field & {
    beds: Bed[];
  })[];
}

/** GET /api/v1/farms/{farmId}/plots — each item */
export interface FarmPlotItem {
  id: string;
  label: string;
  bed_id: string;
  field_id: string;
  crop_type: string;
  crop_variety: string;
  latest_status: PlotStatus;
  latest_image: {
    id: string;
    captured_at: string;
    trigger: TriggerType;
    thumbnail_url: string;
  } | null;
}

/** GET /api/v1/plots/{plotId} */
export interface PlotDetailResponse extends Plot {
  latest_image: {
    id: string;
    captured_at: string;
    trigger: TriggerType;
    url: string;
    tags: Tag[];
  } | null;
}

/** GET /api/v1/plots/{plotId}/images — each item */
export interface ImageListItem {
  id: string;
  captured_at: string;
  trigger: TriggerType;
  thumbnail_url: string;
  latest_tag: TagValue | null;
}

/** POST /api/v1/plots/{plotId}/images */
export interface ImageUploadResponse {
  id: string;
  url: string;
  captured_at: string;
  uploaded_at: string;
  trigger: TriggerType;
  size_bytes: number;
}

/** GET /api/v1/images/{imageId} */
export interface ImageDetailResponse extends Omit<Image, 'storage_key'> {
  url: string;
  tags: Tag[];
}

/** POST /api/v1/images/{imageId}/tags */
export interface TagCreateResponse extends Tag {
  image_id: string;
  plot_status_updated: boolean;
}

// ── Weather Types ────────────────────────────────────────────────

/** GET /api/v1/farms/{farmId}/weather */
export interface WeatherResponse {
  current: {
    temperature: number;
    apparent_temperature: number;
    weather_code: number;
    condition: string;
    condition_icon: string;
    humidity: number;
    wind_speed: number;
    wind_direction: string;
  };
  today: {
    high: number;
    low: number;
    rain_probability: number;
    rain_sum_mm: number;
    sunrise: string;
    sunset: string;
  };
  hourly: HourlyForecast[];
  daily: DailyForecast[];
  alerts: WeatherAlert[];
  crop_impact: CropImpactCard[];
  cached_at: string;
}

export interface HourlyForecast {
  time: string; // ISO 8601
  temperature: number;
  rain_probability: number;
  condition_icon: string;
}

export interface DailyForecast {
  date: string; // ISO 8601 date
  high: number;
  low: number;
  rain_probability: number;
  rain_sum_mm: number;
  condition: string;
  condition_icon: string;
}

export interface WeatherAlert {
  type: 'frost' | 'heavy_rain' | 'extreme_heat';
  severity: 'warning' | 'danger';
  message: string;
}

export interface CropImpactCard {
  severity: 'danger' | 'warning' | 'good' | 'info';
  title: string;
  description: string;
  affected_plots: { id: string; label: string; crop_type: string }[];
}

// ── Chat Types ───────────────────────────────────────────────────

/** POST /api/v1/chat */
export interface ChatRequest {
  message: string;
  farm_id?: string;
  conversation_id?: string;
}

export interface ChatResponse {
  reply: string;
  suggestions: string[];
  conversation_id: string;
}

// ── Usage Types ───────────────────────────────────────────────────

/** GET /api/v1/usage */
export interface UsageResponse {
  user_id: string;
  period: 'daily';
  period_start: string;
  reset_at: string;
  user_budget: {
    input_tokens_used: number;
    input_tokens_limit: number;
    output_tokens_used: number;
    output_tokens_limit: number;
    messages_sent: number;
    messages_limit: number;
  };
  global_budget: {
    input_tokens_used: number;
    input_tokens_limit: number;
    output_tokens_used: number;
    output_tokens_limit: number;
    utilization_pct: number;
  };
}

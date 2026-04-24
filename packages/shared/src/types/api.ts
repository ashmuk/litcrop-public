/**
 * LitCrop API response and error types
 * Source of truth: docs/SYSTEM-DESIGN.md §2.2 and docs/API-CONTRACTS.md
 * Updated: Phase D — Farm→Bed flattening (ADR-20260322)
 */

import type { Farm, Bed, Image, Tag, BedStatus, BedCropStatus, TriggerType, TagValue } from './domain';

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
  | 'GONE'
  | 'PAYLOAD_TOO_LARGE'
  | 'UNSUPPORTED_MEDIA_TYPE'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'BUDGET_EXCEEDED'
  | 'INTERNAL_ERROR'
  | 'SERVICE_UNAVAILABLE'
  | 'BAD_CURSOR'
  | 'UPSTREAM_ERROR';

// ── Endpoint-Specific Response Types ────────────────────────────

/** Projection of the bed's active BedCrop — Wave B compat shim (#279). */
export interface BedActiveCropSummary {
  id: string;
  status: BedCropStatus;
  crop_type: string;
  crop_variety?: string;
  planted_at?: string;
  expected_harvest?: string;
}

/** Bed summary within GET /api/v1/farms/{farmId} response */
export interface FarmBed {
  id: string;
  row: number;
  col: number;
  name: string;
  crop_type: string | null;
  crop_variety: string | null;
  latest_status: BedStatus;
  planted_at?: string | null;
  expected_harvest?: string | null;
  completed_at?: string | null;
  /**
   * Wave B (#279) — canonical reference to the bed's active BedCrop. Inline
   * crop fields above stay populated from this same source during the shim
   * window (Wave B → D) and are removed in Wave E. Present on every response;
   * null when the bed has no active or planned crop.
   */
  active_crop?: BedActiveCropSummary | null;
  /**
   * Wave C (#279) — count of active+planned BedCrops for this bed, including
   * any legacy inline active crop. Tile-view UIs render "+N" from this count.
   */
  active_crops_count?: number;
}

/** GET /api/v1/farms/{farmId} */
export interface FarmResponse extends Farm {
  beds: FarmBed[];
}

/** GET /api/v1/farms/{farmId}/beds — each item */
export interface FarmBedItem extends FarmBed {
  latest_image: {
    id: string;
    captured_at: string;
    trigger: TriggerType;
    url: string;
    thumbnail_url: string | null;
  } | null;
}

/** GET /api/v1/beds/{bedId} */
export interface BedDetailResponse extends Bed {
  /** #279 Wave B — canonical reference to the bed's active BedCrop; null when no active/planned crop. */
  active_crop?: BedActiveCropSummary | null;
  /** #279 Wave C — count of active+planned BedCrops plus any legacy inline active crop; used to gate the 5-cap UI. */
  active_crops_count?: number;
  latest_image: {
    id: string;
    captured_at: string;
    trigger: TriggerType;
    url: string;
    thumbnail_url: string | null;
    tags: Tag[];
  } | null;
}

/** GET /api/v1/beds/{bedId}/images — each item */
export interface ImageListItem {
  id: string;
  captured_at: string;
  trigger: TriggerType;
  node_id: string;
  url: string;
  thumbnail_url: string | null;
  size_bytes: number;
  latest_tag: TagValue | null;
}

/** POST /api/v1/beds/{bedId}/images */
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
  thumbnail_url: string | null;
  tags: Tag[];
}

/** POST /api/v1/images/{imageId}/tags */
export interface TagCreateResponse extends Tag {
  image_id: string;
  bed_status_updated: boolean;
}

// ── Weather Types ────────────────────────────────────────────────

/** GET /api/v1/farms/{farmId}/weather */
export interface WeatherResponse {
  latitude: number;
  longitude: number;
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

/**
 * Structured parameters for weather impact messages. The API emits numeric
 * + date values here so the frontend can interpolate them into either
 * locale's translated template, rather than shipping a pre-formatted
 * English string that loses information on translation.
 */
export interface WeatherImpactParams {
  low?: number;
  high?: number;
  mm?: number;
  date?: string; // ISO YYYY-MM-DD
}

export interface WeatherAlert {
  type: 'frost' | 'heavy_rain' | 'extreme_heat';
  severity: 'warning' | 'danger';
  message: string; // Legacy English text — kept for backward compat.
  params?: WeatherImpactParams;
}

export interface CropImpactCard {
  severity: 'danger' | 'warning' | 'good' | 'info';
  title: string;
  description: string; // Legacy English text — kept for backward compat.
  params?: WeatherImpactParams;
  affected_beds: { id: string; name: string; crop_type: string }[];
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

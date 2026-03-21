/**
 * LitCrop API request validation types
 * Source of truth: docs/SYSTEM-DESIGN.md §2.3
 */

import type { Locale, Theme, TagValue, TempUnit } from './domain';

/** POST /api/v1/farms — Create Farm */
export interface CreateFarmRequest {
  name: string;
  latitude: number;
  longitude: number;
  description?: string;
  elevation_m?: number;
  locale?: Locale;
  theme?: Theme;
}

/** PATCH /api/v1/farms/{farmId} — Update Farm */
export interface UpdateFarmRequest {
  name?: string;
  description?: string;
  locale?: Locale;
  theme?: Theme;
  temp_unit?: TempUnit;
}

/** POST /api/v1/images/{imageId}/tags */
export interface CreateTagRequest {
  tag: TagValue;
  note?: string;
}

/** POST /api/v1/farms/{farmId}/plots — Create Plot */
export interface CreatePlotRequest {
  crop_type: string;
  crop_variety: string;
  label?: string;
  planted_at?: string; // ISO 8601 date; defaults to today on the server
}

/** POST /api/v1/chat */
export interface ChatMessageRequest {
  message: string;
  farm_id?: string;
}

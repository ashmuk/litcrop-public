/**
 * LitCrop API request validation types
 * Source of truth: docs/SYSTEM-DESIGN.md §2.3
 * Updated: Phase D — Farm→Bed flattening (ADR-20260322)
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
  grid_rows?: number; // 1-5, default 1
  grid_cols?: number; // 1-5, default 1
}

/** PATCH /api/v1/farms/{farmId} — Update Farm */
export interface UpdateFarmRequest {
  name?: string;
  description?: string;
  latitude?: number;
  longitude?: number;
  elevation_m?: number;
  locale?: Locale;
  theme?: Theme;
  temp_unit?: TempUnit;
  grid_rows?: number; // 1-5
  grid_cols?: number; // 1-5
}

/** PATCH /api/v1/beds/{bedId} — Assign/Update Crop */
export interface UpdateBedRequest {
  crop_type?: string | null;     // 1-100 chars; null to clear
  crop_variety?: string | null;  // 1-100 chars; null to clear
  planted_at?: string | null;    // ISO 8601 date; null to clear
  expected_harvest?: string | null;
  notes?: string | null;         // max 500 chars; null to clear
}

/** POST /api/v1/images/{imageId}/tags */
export interface CreateTagRequest {
  tag: TagValue;
  note?: string;
}

/** POST /api/v1/chat */
export interface ChatMessageRequest {
  message: string;
  farm_id?: string;
}

/** PATCH /api/v1/me/profile */
export interface UpdateProfileRequest {
  display_name?: string;
  preferred_role?: 'owner' | 'staff';
}

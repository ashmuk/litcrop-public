/**
 * LitCrop domain entity types and enums
 * Source of truth: docs/SYSTEM-DESIGN.md §2.1
 */

// ── Enums ────────────────────────────────────────────────────────

/** Plot health status, derived from the most recent tag */
export type PlotStatus = 'healthy' | 'slow_growth' | 'issue' | 'animal_intrusion' | 'no_data';

/** Image capture trigger type */
export type TriggerType = 'scheduled' | 'motion';

/** Tag values — subset of PlotStatus, excludes 'no_data' */
export type TagValue = Exclude<PlotStatus, 'no_data'>;

/** Supported locales */
export type Locale = 'en' | 'ja';

/** Theme options */
export type Theme = 'light' | 'dark' | 'earthy' | 'system';

/** Temperature unit preference */
export type TempUnit = 'C' | 'F';

/** Farm membership role */
export type FarmRole = 'admin' | 'manager' | 'observer';

/** Farm membership record — links a user to a farm with a role */
export interface FarmMember {
  user_id: string;
  farm_id: string;
  role: FarmRole;
  joined_at: string; // ISO 8601
}

// ── Entity Types ─────────────────────────────────────────────────

export interface Farm {
  id: string;
  user_id: string; // Cognito sub — owner of this farm
  name: string;
  description?: string;
  latitude: number;
  longitude: number;
  elevation_m?: number;
  climate_zone?: string;
  locale: Locale;
  theme: Theme;
  created_at: string; // ISO 8601
}

export interface Field {
  id: string;
  farm_id: string;
  name: string;
  position: number;
}

export interface Bed {
  id: string;
  field_id: string;
  name: string;
  position: number;
}

export interface Plot {
  id: string;
  bed_id: string;
  label: string;
  crop_type: string;
  crop_variety: string;
  planted_at: string;       // ISO 8601 date
  expected_harvest: string; // ISO 8601 date
  notes?: string;
  latest_status: PlotStatus;
  farm_id: string; // denormalized for DynamoDB GSI2
}

export interface Image {
  id: string;
  plot_id: string;
  bed_id: string;    // SF-4: denormalized at write time to avoid GSI lookup in createTag
  node_id: string;
  captured_at: string;  // ISO 8601
  uploaded_at: string;  // ISO 8601
  storage_key: string;
  thumbnail_key?: string; // Set async by thumbnail Lambda after processing
  trigger: TriggerType;
  content_type: string;
  size_bytes: number;
  metadata?: Record<string, unknown>;
}

export interface Tag {
  id: string;
  image_id: string;
  tag: TagValue;
  note?: string;
  created_at: string; // ISO 8601
}

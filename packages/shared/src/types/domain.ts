/**
 * LitCrop domain entity types and enums
 * Source of truth: docs/SYSTEM-DESIGN.md §2.1, §10.3
 * Updated: Phase D — Farm→Bed flattening (ADR-20260322)
 */

// ── Enums ────────────────────────────────────────────────────────

/** Bed health status, derived from the most recent tag */
export type BedStatus = 'healthy' | 'slow_growth' | 'issue' | 'animal_intrusion' | 'no_data';

/** @deprecated Use BedStatus — alias kept for one version */
export type PlotStatus = BedStatus;

/** Image capture trigger type */
export type TriggerType = 'scheduled' | 'motion';

/** Tag values — subset of BedStatus, excludes 'no_data' */
export type TagValue = Exclude<BedStatus, 'no_data'>;

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
  grid_rows: number; // 1-5, bed grid dimensions
  grid_cols: number; // 1-5, bed grid dimensions
  created_at: string; // ISO 8601
}

/** Bed — primary crop unit (replaces Field + Bed + Plot from PoC) */
export interface Bed {
  id: string;
  farm_id: string;
  row: number;      // 1-based grid row (1-5)
  col: number;      // 1-based grid column (1-5)
  name: string;     // auto-generated: "A1", "B2", etc.
  crop_type?: string;
  crop_variety?: string;
  planted_at?: string;       // ISO 8601 date
  expected_harvest?: string; // ISO 8601 date
  notes?: string;
  latest_status: BedStatus;
}

export interface Image {
  id: string;
  bed_id: string;
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

/**
 * LitCrop domain entity types and enums
 * Source of truth: docs/SYSTEM-DESIGN.md §2.1, §10.3
 * Updated: Phase D — Farm→Bed flattening (ADR-20260322)
 */

// ── Enums ────────────────────────────────────────────────────────

/**
 * Bed health status, derived from the most recent tag.
 * Intentionally kept as 5 values (not reduced to 4 as originally planned in D-01).
 * Reason: TagValue is `Exclude<BedStatus, 'no_data'>` — changing status values
 * would break the tagging system. All 5 values are used consistently across
 * types, schemas, constants, i18n, and frontend status maps.
 */
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
export type FarmRole = 'admin' | 'owner' | 'staff';

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
  location_text: string;
  latitude?: number;
  longitude?: number;
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

/** Per-user profile record — display preferences and role hint */
export interface UserProfile {
  user_id: string;
  display_name: string;
  preferred_role: 'owner' | 'staff';
  created_at: string; // ISO 8601
  profile_picture_key?: string;
  profile_picture_thumb_key?: string;
}

// ── Device Management ────────────────────────────────────────────

/** Device status — derived from last_seen_at vs capture_interval */
export type DeviceStatus = 'online' | 'offline' | 'inactive';

/** Device storage status */
export type StorageStatus = 'ok' | 'low' | 'full';

/** Device hardware capabilities — reported via first heartbeat */
export interface DeviceCapabilities {
  resolutions: string[];
  has_battery_sensor: boolean;
  has_pir_sensor: boolean;
}

/**
 * Device entity — API-facing shape.
 * DynamoDB stores active_window as flat fields (active_window_start, active_window_end).
 * The DynamoDB service layer transforms to/from this nested shape for API responses.
 */
export interface Device {
  device_id: string;
  farm_id: string;
  bed_id: string;
  node_name: string;
  status: DeviceStatus;
  capture_interval: number;
  resolution: string;
  jpeg_quality: number;
  active_window: { start: string; end: string };
  trigger_type: 'scheduled';
  last_seen_at: string | null;
  battery_level: number | null;
  wifi_signal_dbm: number | null;
  storage_status: StorageStatus | null;
  capabilities: DeviceCapabilities | null;
  test_shot_requested: boolean;
  created_at: string;
  updated_at: string;
}

/** Device registration response — includes one-time API key */
export interface DeviceRegistrationResponse {
  device_id: string;
  node_name: string;
  bed_id: string;
  device_api_key: string;
  config_poll_url: string;
  created_at: string;
}

/** Config poll response — Pi-facing, minimal fields */
export interface DeviceConfigResponse {
  capture_interval: number;
  resolution: string;
  jpeg_quality: number;
  active_window: { start: string; end: string };
  trigger_type: 'scheduled';
  bed_id: string;
  upload_url: string;
  test_shot_requested: boolean;
}

/** Device list item — includes bed_name for display */
export interface DeviceListItem extends Device {
  bed_name: string;
}

// ── Join Requests ─────────────────────────────────────────────────

export type JoinRequestStatus = 'pending' | 'approved' | 'rejected';

export interface JoinRequest {
  farm_id: string;
  user_id: string;
  status: JoinRequestStatus;
  display_name: string;
  requested_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
}

// ── Diary (Beta-7) ──────────────────────────────────────────────

/** Diary entry work category */
export type DiaryCategory =
  | 'planting' | 'watering' | 'fertilizing' | 'harvesting'
  | 'weeding' | 'pest_control' | 'maintenance' | 'purchase' | 'other';

/** Diary entry type — reserved (planned) or actual (logged) */
export type DiaryEntryType = 'reserved' | 'actual';

/** Cost item embedded in a diary entry */
export interface CostItem {
  item: string;
  amount: number;
  currency: 'JPY' | 'USD';
}

/** Diary entry — daily farm work log */
export interface DiaryEntry {
  id: string;
  farm_id: string;
  date: string;           // YYYY-MM-DD (farm local date)
  category: DiaryCategory;
  entry_type: DiaryEntryType; // reserved (plan) or actual (log) — default 'actual'
  description: string;
  time_spent_minutes: number | null;
  bed_id: string | null;
  photo_ids: string[];
  costs: CostItem[];
  created_by: string;
  created_at: string;     // ISO 8601
  updated_at: string;     // ISO 8601
}

/** Diary entry response — includes resolved bed_name and cost_total */
export interface DiaryEntryResponse extends DiaryEntry {
  bed_name: string | null;
  cost_total: number;
}

export interface DiscoverableFarm {
  id: string;
  name: string;
  description: string | null;
  location_text: string;
  latitude?: number;
  longitude?: number;
  member_count: number;
  has_pending_request: boolean;
}

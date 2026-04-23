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

/** Plant method — seed (direct sow) or seedling (transplant) */
export type PlantMethod = 'seed' | 'seedling';

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
  default_currency: 'JPY' | 'USD'; // Beta-10: default 'JPY' for existing farms
  visibility?: 'public' | 'private'; // #403: default 'public' for backward compat
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
  completed_at?: string;     // ISO 8601 date — current crop cycle done
}

/**
 * BedCrop status (#279 Wave B) — lifecycle state of a single crop cycle.
 * `planned` and `active` count toward the 5-cap; `harvested` and `failed` are history.
 */
export type BedCropStatus = 'planned' | 'active' | 'harvested' | 'failed';

/**
 * BedCrop — one crop cycle attached to a bed (#279).
 *
 * Replaces the 1:1 crop fields on `Bed` with a 1:N association. Intercropping
 * (concurrent crops on the same bed) and succession (sequential crops across
 * time) both use this model — differentiation is via date overlap, not entity
 * variants. See `docs/design/DESIGN-279-bed-crop-1n.md` §3.1.
 */
export interface BedCrop {
  id: string;
  bed_id: string;               // FK → Bed.id
  farm_id: string;              // FK → Farm.id (denormalized for auth + query)
  crop_type: string;            // canonical id from CROP_LIBRARY
  crop_variety?: string;
  planted_at?: string;          // ISO 8601 date
  expected_harvest?: string;    // ISO 8601 date
  completed_at?: string;        // ISO 8601 date — set when status → harvested/failed
  status: BedCropStatus;
  notes?: string;               // crop-cycle-specific (separate from Bed.notes)
  created_by: string;
  created_at: string;
  updated_at: string;
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
  /**
   * Cognito sub of whichever user's JWT authenticated the upload. For MVP
   * Pi uploads this is the shared service-user JWT provisioned on the device
   * (per `scripts/camera-node/capture.sh`) — NOT necessarily the user who
   * ran Register Device. Phase 3 `/me/activity` must therefore reconcile by
   * combining `uploaded_by = me` OR `bed belongs to a device where
   * registered_by = me`. Null on pre-v0.99.7.3 records. Revisit when
   * per-device M2M credentials ship.
   */
  uploaded_by?: string | null;
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
  email?: string;
  preferred_role: 'owner' | 'staff';
  created_at: string; // ISO 8601
  profile_picture_key?: string;
  profile_picture_thumb_key?: string;
}

// ── In-app Notifications ─────────────────────────────────────────

export type NotificationType = 'join_submitted' | 'join_approved' | 'join_rejected' | 'role_changed';

export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  body: string;
  farm_id?: string;
  farm_name?: string;
  read: boolean;
  created_at: string; // ISO 8601
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
 * Runtime-effective config echoed by the Pi in its heartbeat (#406).
 * Distinguishes "what the UI asked for" from "what the device is actually
 * running" so the UI can surface drift and freshness.
 */
export interface EffectiveConfig {
  resolution?: string;
  jpeg_quality?: number;
  capture_interval?: number | null;
  active_window?: { start: string; end: string };
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
  // #457: quantitative storage — optional on the interface so older Pi
  // records and pre-upgrade fixtures still satisfy Device. API emits
  // these as numbers or null on heartbeat-capable devices.
  storage_used_pct?: number | null;
  storage_free_bytes?: number | null;
  storage_total_bytes?: number | null;
  capabilities: DeviceCapabilities | null;
  test_shot_requested: boolean;
  // --- #406 config-propagation visibility ---
  // Optional on the interface so existing fixtures and pre-#406 Pi records
  // still satisfy Device. API emits these as either an ISO string / object
  // or null; never omitted from the response envelope.
  last_config_polled_at?: string | null;
  effective_config?: EffectiveConfig | null;
  /** Cognito sub of the user who ran Register Device. Null on pre-v0.99.7.3 records. */
  registered_by?: string | null;
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
  | 'seeding' | 'planting' | 'watering' | 'fertilizing' | 'harvesting'
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
  // Beta-10: Harvest & revenue fields (only when category === 'harvesting')
  harvest_amount: number | null;
  harvest_unit: string | null;
  revenue: number | null;
  revenue_currency: 'JPY' | 'USD' | null;
}

/** Diary entry response — includes resolved bed_name, cost_total, and creator name */
export interface DiaryEntryResponse extends DiaryEntry {
  bed_name: string | null;
  cost_total: number;
  created_by_name: string | null;
}

// ── #462 Phase 3: User Activity Feed ─────────────────────────────

/**
 * Discriminator for ActivityItem. The feed chronologically merges three
 * sources the authenticated user owns: diary entries they authored, devices
 * they registered, and images attributed to them (manual uploads or Pi
 * captures from beds whose device they registered — see #462 issue comment
 * chain for the Pi-auth reality that drives the OR predicate).
 */
export type ActivityItemType = 'diary' | 'device' | 'image';

interface ActivityItemBase {
  /** Stable compound id: `<type>:<sourceId>` — unique across the feed, safe for list keys */
  id: string;
  type: ActivityItemType;
  /** ISO 8601; drives the DESC merge across sources */
  timestamp: string;
  farm_id: string;
  farm_name: string | null;
  /** Cognito sub of the acting user (self by definition; included for display-name resolution + future audit) */
  actor_id: string | null;
  actor_name: string | null;
  /** Client-facing relative URL for the feature's deep-link target */
  deep_link: string;
}

export interface DiaryActivityItem extends ActivityItemBase {
  type: 'diary';
  diary_category: DiaryCategory;
  diary_entry_type: DiaryEntryType;
  /** Short — callers may truncate for list display */
  description: string;
  bed_id: string | null;
  bed_name: string | null;
}

export interface DeviceActivityItem extends ActivityItemBase {
  type: 'device';
  device_id: string;
  node_name: string;
  bed_id: string;
  bed_name: string | null;
}

export interface ImageActivityItem extends ActivityItemBase {
  type: 'image';
  image_id: string;
  bed_id: string;
  bed_name: string | null;
  trigger: TriggerType;
  thumbnail_key: string | null;
}

export type ActivityItem = DiaryActivityItem | DeviceActivityItem | ImageActivityItem;

/** Response envelope for GET /api/v1/me/activity */
export interface ActivityFeedResponse {
  items: ActivityItem[];
  next_cursor: string | null;
  total_count: number;
}

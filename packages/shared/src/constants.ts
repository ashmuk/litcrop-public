/**
 * LitCrop shared constants
 * Updated: Phase D — Farm→Bed flattening (ADR-20260322)
 */

import type { BedStatus, TriggerType, TagValue, Theme, Locale } from './types/domain';

// ── Bed Status ──────────────────────────────────────────────────

export const BED_STATUS = {
  healthy: 'healthy',
  slow_growth: 'slow_growth',
  issue: 'issue',
  animal_intrusion: 'animal_intrusion',
  no_data: 'no_data',
} as const satisfies Record<BedStatus, BedStatus>;

export const BED_STATUS_VALUES: BedStatus[] = [
  'healthy',
  'slow_growth',
  'issue',
  'animal_intrusion',
  'no_data',
];

/** @deprecated Use BED_STATUS */
export const PLOT_STATUS = BED_STATUS;
/** @deprecated Use BED_STATUS_VALUES */
export const PLOT_STATUS_VALUES = BED_STATUS_VALUES;

// ── Tag Values ───────────────────────────────────────────────────

export const TAG_VALUES: TagValue[] = [
  'healthy',
  'slow_growth',
  'issue',
  'animal_intrusion',
];

// ── Trigger Types ────────────────────────────────────────────────

export const TRIGGER_TYPES: TriggerType[] = ['scheduled', 'motion'];

// ── Theme Options ────────────────────────────────────────────────

export const THEME_OPTIONS: Theme[] = ['light', 'dark', 'earthy', 'system'];
export const DEFAULT_THEME: Theme = 'earthy';

// ── Locale Options ───────────────────────────────────────────────

export const LOCALE_OPTIONS: Locale[] = ['en', 'ja'];
export const DEFAULT_LOCALE: Locale = 'en';

// ── Image Limits ─────────────────────────────────────────────────

/** Maximum image upload size: 2 MB */
export const MAX_IMAGE_SIZE_BYTES = 2 * 1024 * 1024; // 2,097,152 bytes

/** Accepted image content type */
export const ACCEPTED_IMAGE_CONTENT_TYPE = 'image/jpeg';

// ── Pagination ───────────────────────────────────────────────────

export const DEFAULT_PAGE_LIMIT = 20;
export const MAX_PAGE_LIMIT = 100;
export const MIN_PAGE_LIMIT = 1;

// ── Cache TTLs (seconds) ─────────────────────────────────────────

/** Weather data cache TTL: 15 minutes */
export const WEATHER_CACHE_TTL_SECONDS = 15 * 60;

/** S3 signed URL expiry: 15 minutes */
export const SIGNED_URL_EXPIRY_SECONDS = 15 * 60;

// ── Grid Limits ──────────────────────────────────────────────────

export const MIN_GRID_SIZE = 1;
export const MAX_GRID_SIZE = 5;

// ── Demo Farm ───────────────────────────────────────────────────

export const DEMO_FARM_ID = 'demo-farm';

// ── Free Plan Limits ────────────────────────────────────────────

export const FREE_PLAN_MAX_OWNED_FARMS = 2;
export const FREE_PLAN_MAX_MEMBERSHIPS = 3;

// ── Crop Types ──────────────────────────────────────────────────

export const CROP_TYPES = ['rice', 'tomato', 'cucumber', 'eggplant', 'lettuce', 'daikon', 'cabbage', 'other'] as const;
export type CropType = typeof CROP_TYPES[number];

// ── Admin Designation ───────────────────────────────────────────
export const ENV_ADMIN_EMAILS = 'ADMIN_EMAILS';

// ── DynamoDB Key Prefixes ────────────────────────────────────────

export const DDB_KEY_PREFIXES = {
  FARM: 'FARM#',
  BED: 'BED#',
  IMG: 'IMG#',
  TAG: 'TAG#',
  CONV: 'CONV#',
  META: '#META',
  USER: 'USER#',
  FARM_MEMBER: 'FARM_MEMBER#',
  MEMBER: 'MEMBER#',
  SETTINGS: '#SETTINGS',
  JOIN_REQUEST: 'JOIN_REQUEST#',
  ACTIVITY: 'ACTIVITY#',
  DEVICE: 'DEVICE#',
  DIARY: 'DIARY#',
} as const;

/** Activity log TTL retention period in days */
export const ACTIVITY_TTL_DAYS = 90;

// ── Device Management (Beta-5) ──────────────────────────────────

export const DEVICE_STATUS_VALUES = ['online', 'offline', 'inactive'] as const;
export const STORAGE_STATUS_VALUES = ['ok', 'low', 'full'] as const;

export const MAX_NODE_NAME_LENGTH = 64;
export const MIN_CAPTURE_INTERVAL = 300;   // 5 minutes
export const MAX_CAPTURE_INTERVAL = 86400; // 24 hours

/** S3 key prefix for profile picture avatars */
export const S3_AVATAR_PREFIX = 'images/avatars/';

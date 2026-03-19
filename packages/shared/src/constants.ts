/**
 * LitCrop shared constants
 */

import type { PlotStatus, TriggerType, TagValue, Theme, Locale } from './types/domain';

// ── Plot Status ──────────────────────────────────────────────────

export const PLOT_STATUS: Record<PlotStatus, PlotStatus> = {
  healthy: 'healthy',
  slow_growth: 'slow_growth',
  issue: 'issue',
  animal_intrusion: 'animal_intrusion',
  no_data: 'no_data',
} as const;

export const PLOT_STATUS_VALUES: PlotStatus[] = [
  'healthy',
  'slow_growth',
  'issue',
  'animal_intrusion',
  'no_data',
];

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
export const DEFAULT_THEME: Theme = 'system';

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

// ── DynamoDB Key Prefixes ────────────────────────────────────────

export const DDB_KEY_PREFIXES = {
  FARM: 'FARM#',
  FIELD: 'FIELD#',
  BED: 'BED#',
  PLOT: 'PLOT#',
  IMG: 'IMG#',
  TAG: 'TAG#',
  META: '#META',
} as const;

/**
 * LitCrop default configuration values
 * Runtime config is injected via environment variables; these are the defaults/fallbacks.
 */

import type { TempUnit } from './types/domain';
import {
  MAX_IMAGE_SIZE_BYTES,
  ACCEPTED_IMAGE_CONTENT_TYPE,
  SIGNED_URL_EXPIRY_SECONDS,
  WEATHER_CACHE_TTL_SECONDS,
  DEFAULT_PAGE_LIMIT,
  MAX_PAGE_LIMIT,
  DEFAULT_THEME,
  DEFAULT_LOCALE,
} from './constants';

export const DEFAULT_CONFIG = {
  // API
  apiBaseUrl: 'http://localhost:3000',

  // AWS
  awsRegion: 'ap-northeast-1',
  dynamoTableName: 'litcrop-poc',
  s3ImageBucket: 'litcrop-poc-images',
  s3StaticBucket: 'litcrop-poc-static',

  // Image upload
  maxImageSizeBytes: MAX_IMAGE_SIZE_BYTES,
  acceptedContentType: ACCEPTED_IMAGE_CONTENT_TYPE,

  // Signed URL
  signedUrlExpirySeconds: SIGNED_URL_EXPIRY_SECONDS,

  // Weather cache
  weatherCacheTtlSeconds: WEATHER_CACHE_TTL_SECONDS,

  // Pagination
  defaultPageLimit: DEFAULT_PAGE_LIMIT,
  maxPageLimit: MAX_PAGE_LIMIT,

  // UI defaults
  defaultTheme: DEFAULT_THEME,
  defaultLocale: DEFAULT_LOCALE,
  defaultTempUnit: 'C' as TempUnit,

  // Simulator defaults
  simulatorIntervalMs: 60 * 60 * 1000, // 1 hour (periodic)
  simulatorMotionChance: 0.1,           // 10% chance of motion trigger per check
} as const;

export type AppConfig = typeof DEFAULT_CONFIG;

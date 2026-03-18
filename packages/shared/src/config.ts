/**
 * LitCrop default configuration values
 * Runtime config is injected via environment variables; these are the defaults/fallbacks.
 */

import type { Theme, Locale, TempUnit } from './types/domain';

export const DEFAULT_CONFIG = {
  // API
  apiBaseUrl: 'http://localhost:3000',

  // AWS
  awsRegion: 'ap-northeast-1',
  dynamoTableName: 'litcrop-poc',
  s3ImageBucket: 'litcrop-poc-images',
  s3StaticBucket: 'litcrop-poc-static',

  // Image upload
  maxImageSizeBytes: 2 * 1024 * 1024, // 2 MB
  acceptedContentType: 'image/jpeg',

  // Signed URL
  signedUrlExpirySeconds: 15 * 60, // 15 minutes

  // Weather cache
  weatherCacheTtlSeconds: 15 * 60, // 15 minutes

  // Pagination
  defaultPageLimit: 20,
  maxPageLimit: 100,

  // UI defaults
  defaultTheme: 'system' as Theme,
  defaultLocale: 'en' as Locale,
  defaultTempUnit: 'C' as TempUnit,

  // Simulator defaults
  simulatorIntervalMs: 60 * 60 * 1000, // 1 hour (periodic)
  simulatorMotionChance: 0.1,           // 10% chance of motion trigger per check
} as const;

export type AppConfig = typeof DEFAULT_CONFIG;

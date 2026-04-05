/**
 * Crop library — locale-aware display helpers for the frontend.
 * Data sourced from @litcrop/shared (static bundle).
 */

import { CROP_LIBRARY, CROP_LIBRARY_MAP } from '@litcrop/shared';
import type { CropEntry } from '@litcrop/shared';
import { getLocale } from '../i18n/i18n';

export type { CropEntry };

/** Full crop list, re-exported from shared. */
export const CROPS: CropEntry[] = CROP_LIBRARY;

/** O(1) lookup by crop id. */
export const CROP_MAP: Map<string, CropEntry> = CROP_LIBRARY_MAP;

/** Quick-select chip crops (top 7, excluding "other"). */
export const QUICK_SELECT_CROPS = ['rice', 'tomato', 'cucumber', 'eggplant', 'lettuce', 'daikon', 'cabbage'] as const;

/** Get emoji for a crop_type string. Returns seedling for unknown/free-text crops. */
export function getCropEmoji(cropType: string | undefined | null): string {
  if (!cropType) return '';
  return CROP_MAP.get(cropType)?.emoji ?? '🌱';
}

/** Get localized name for a crop_type string. Locale auto-detected. */
export function getCropName(cropType: string | undefined | null): string {
  if (!cropType) return '';
  const locale = getLocale();
  return CROP_MAP.get(cropType)?.[locale] ?? cropType;
}

/** Combined display string: "emoji Name". Returns '' if no crop. */
export function getCropDisplay(cropType: string | undefined | null): string {
  if (!cropType) return '';
  const entry = CROP_MAP.get(cropType);
  if (!entry) return `🌱 ${cropType}`;
  const locale = getLocale();
  return `${entry.emoji} ${entry[locale]}`;
}

/**
 * Search crops by substring match on EN or JA name.
 * Empty query returns the first `limit` crops.
 */
export function searchCrops(query: string, limit = 10): CropEntry[] {
  if (!query) return CROPS.slice(0, limit);
  const q = query.toLowerCase();
  return CROPS.filter((c) => c.en.toLowerCase().includes(q) || c.ja.includes(q)).slice(0, limit);
}

/** Case-insensitive match: normalize free-text to canonical id if possible. */
export function normalizeCropType(input: string): string {
  if (!input) return '';
  const lower = input.toLowerCase();
  if (CROP_MAP.has(lower)) return lower;
  const match = CROPS.find(
    (c) => c.en.toLowerCase() === lower || c.ja === input,
  );
  return match?.id ?? input;
}

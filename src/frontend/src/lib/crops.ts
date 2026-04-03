/**
 * Crop library — lookup helpers, search, and emoji display.
 * Data is bundled from crops.json at build time (zero runtime fetch).
 */

import cropsData from '../data/crops.json';
import { getLocale } from '../i18n/i18n';

export interface CropEntry {
  id: string;
  emoji: string;
  category: string;
  en: string;
  ja: string;
}

/** Full crop list, imported once at bundle time. */
export const CROPS: CropEntry[] = cropsData;

/** O(1) lookup by crop id. */
export const CROP_MAP: Map<string, CropEntry> = new Map(cropsData.map((c) => [c.id, c]));

/** Quick-select chip crops (top 7, excluding "other"). */
export const QUICK_SELECT_CROPS = ['rice', 'tomato', 'cucumber', 'eggplant', 'lettuce', 'daikon', 'cabbage'] as const;

/** Get emoji for a crop_type string. Returns '🌱' for unknown/free-text crops. */
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

/** Combined display string: "🍅 Tomato". Returns '' if no crop. */
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
 * Romaji-to-kana transliteration is out of scope for v1.
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
  if (CROP_MAP.has(lower)) return lower; // O(1) fast path for known ids
  const match = CROPS.find(
    (c) => c.en.toLowerCase() === lower || c.ja === input,
  );
  return match?.id ?? input;
}

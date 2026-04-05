/**
 * Crop library — shared types, data, and lookup helpers.
 * Static data bundled at build time (zero runtime fetch).
 * Used by both API and frontend.
 */

import cropData from './data/crop-library.json';

export interface CropEntry {
  id: string;
  emoji: string;
  category: string;
  en: string;
  ja: string;
  days_to_harvest_min?: number;
  days_to_harvest_max?: number;
  season?: string[];
  companions?: string[];
}

/** Full crop list (100 entries). */
export const CROPS: CropEntry[] = cropData as CropEntry[];

/** O(1) lookup by crop id. */
export const CROP_MAP: Map<string, CropEntry> = new Map(CROPS.map((c) => [c.id, c]));

/** Get crop metadata by id. Returns undefined for unknown/free-text crops. */
export function getCropMeta(cropId: string): CropEntry | undefined {
  return CROP_MAP.get(cropId);
}

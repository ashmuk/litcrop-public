/**
 * Crop library — shared types, data, and lookup helpers.
 * Static data bundled at build time (zero runtime fetch).
 * Used by both API and frontend.
 */

import cropData from './data/crop-library.json';
import type { PlantMethod } from './types/domain';

export interface CropEntry {
  id: string;
  emoji: string;
  category: string;
  en: string;
  ja: string;
  days_to_harvest_min?: number;
  days_to_harvest_max?: number;
  days_seed_to_seedling_min?: number;
  days_seed_to_seedling_max?: number;
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

/**
 * Estimate harvest date from a planting date and crop type.
 * Uses days_to_harvest_max from the crop library.
 * When plantMethod is 'seed', adds days_seed_to_seedling_max to account
 * for nursery time before transplanting.
 * Returns null if the crop is unknown or has no harvest data.
 */
export function estimateHarvestDate(
  plantedDate: string,
  cropId: string,
  plantMethod?: PlantMethod,
): string | null {
  const meta = getCropMeta(cropId);
  if (!meta?.days_to_harvest_max) return null;
  let totalDays = meta.days_to_harvest_max;
  if (plantMethod === 'seed' && meta.days_seed_to_seedling_max) {
    totalDays += meta.days_seed_to_seedling_max;
  }
  const d = new Date(plantedDate);
  if (isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + totalDays);
  return d.toISOString().split('T')[0];
}

/**
 * BedCrop helpers — shims used while Wave B → D keep the legacy inline
 * crop fields populated alongside the canonical BedCrop entity. See
 * docs/design/DESIGN-279-bed-crop-1n.md §4.3 + §7.
 */

import type { BedCrop } from './types/domain';
import type { BedActiveCropSummary } from './types/api';

/**
 * Type guard: the bed has a non-empty active crop.
 *
 * Accepts anything with an optional or nullable `crop_type` field — `Bed`,
 * `FarmBed`, `FarmBedItem`, `BedDetailResponse`, or DDB row fragments — and
 * narrows `crop_type` from `string | null | undefined` to `string` for
 * downstream consumers.
 *
 * Pre-Wave B: reads `bed.crop_type` directly.
 * Post-Wave B: will look up the active `BedCrop` record (signature unchanged).
 */
export function hasActiveCrop<T extends { crop_type?: string | null }>(
  bed: T,
): bed is T & { crop_type: string } {
  return typeof bed.crop_type === 'string' && bed.crop_type.length > 0;
}

/**
 * Project a BedCrop to the compact `active_crop` shape served on FarmBed /
 * FarmBedItem / BedDetailResponse. Returns null when no active crop exists
 * (or the input is null/undefined).
 */
export function toBedActiveCropSummary(
  bc: BedCrop | null | undefined,
): BedActiveCropSummary | null {
  if (!bc) return null;
  return {
    id: bc.id,
    crop_type: bc.crop_type,
    crop_variety: bc.crop_variety,
    planted_at: bc.planted_at,
    expected_harvest: bc.expected_harvest,
  };
}

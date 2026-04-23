/**
 * BedCrop helpers — pre-Wave B shims that read inline Bed crop fields today.
 * Post-Wave B (see docs/design/DESIGN-279-bed-crop-1n.md §7), these helpers
 * will resolve against the BedCrop entity instead, without changing their
 * caller-side signatures.
 */

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

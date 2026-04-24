/**
 * Wave E step 1 — promote virtual legacy crops to persisted BedCrop rows.
 * See DESIGN-279 §6 step 1. Split: pure predicate + pure builder + DDB
 * orchestrator; the CLI wrapper lives at
 * `scripts/migrate-wave-e-promote-legacy-crops.ts`.
 */

import type { Bed, BedCrop } from '@litcrop/shared';
import { listBedCropsByBed, createBedCrop } from '../repositories/bed-crops';

/**
 * Deterministic id for a promoted legacy crop. Intentionally distinct from
 * the virtual-legacy projection's `bed-legacy-<bedId>` sentinel so D3's
 * harvest auto-default (which skips ids starting with `bed-legacy-`) treats
 * promoted rows as real BedCrops. Making the id deterministic also collapses
 * a concurrent-runs race to an idempotent overwrite with identical content
 * (R-E1-001).
 */
export function promotedCropId(bedId: string): string {
  return `promoted-${bedId}`;
}

export type SkipReason =
  | 'no-inline-crop'       // bed.crop_type is empty/absent
  | 'bed-completed'        // bed.completed_at is set (cycle already closed)
  | 'already-has-legacy'   // a prior migration run already promoted this bed
  | 'has-real-bedcrops';   // bed has ≥1 user-created BedCrop (opted out of legacy)

export type PromoteResult =
  | { action: 'promoted'; bedId: string; bedCropId: string }
  | { action: 'skipped'; bedId: string; reason: SkipReason };

/**
 * Pure predicate. `existingRealCrops` must be the persisted rows only
 * (no virtual-legacy projection). Idempotency check comes before the
 * real-crops check so repeat runs always resolve to `already-has-legacy`.
 */
export function shouldPromoteBed(
  bed: Pick<Bed, 'id' | 'crop_type' | 'completed_at'>,
  existingRealCrops: BedCrop[],
): { needed: true } | { needed: false; reason: SkipReason } {
  if (!bed.crop_type) return { needed: false, reason: 'no-inline-crop' };
  if (bed.completed_at) return { needed: false, reason: 'bed-completed' };
  if (existingRealCrops.some((c) => c.created_from_legacy === true)) {
    return { needed: false, reason: 'already-has-legacy' };
  }
  if (existingRealCrops.length > 0) {
    return { needed: false, reason: 'has-real-bedcrops' };
  }
  return { needed: true };
}

/** Pure builder. `bedCropId` and `now` are injected so tests can pin them. */
export function buildPromotedCrop(
  bed: Pick<Bed, 'id' | 'farm_id' | 'crop_type' | 'crop_variety' | 'planted_at' | 'expected_harvest'>,
  bedCropId: string,
  now: string,
): BedCrop {
  return {
    id: bedCropId,
    bed_id: bed.id,
    farm_id: bed.farm_id,
    crop_type: bed.crop_type as string,
    crop_variety: bed.crop_variety,
    planted_at: bed.planted_at,
    expected_harvest: bed.expected_harvest,
    status: 'active',
    created_by: 'system',
    created_at: now,
    updated_at: now,
    created_from_legacy: true,
  };
}

/**
 * Promote one bed if it qualifies. Idempotent in two layers: (1) the
 * `shouldPromoteBed` predicate skips any bed that already has a BedCrop with
 * `created_from_legacy: true`, covering single-process repeat runs; (2) the
 * default id is deterministic (`promoted-<bedId>`), so two concurrent runs
 * against the same bed would PutItem to identical PK+SK with identical
 * content — last-writer-wins is safe. Dry-run skips the write but still
 * returns `action: 'promoted'`.
 */
export async function promoteLegacyCropForBed(
  bed: Bed,
  options: { dryRun: boolean; now?: Date; idFactory?: () => string },
): Promise<PromoteResult> {
  const existing = await listBedCropsByBed(bed.id);
  const decision = shouldPromoteBed(bed, existing);

  if (!decision.needed) {
    return { action: 'skipped', bedId: bed.id, reason: decision.reason };
  }

  const id = options.idFactory ? options.idFactory() : promotedCropId(bed.id);
  const now = (options.now ?? new Date()).toISOString();

  if (!options.dryRun) {
    await createBedCrop(buildPromotedCrop(bed, id, now));
  }

  return { action: 'promoted', bedId: bed.id, bedCropId: id };
}

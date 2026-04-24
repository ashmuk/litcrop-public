/** Wave E step 1 — promote-legacy-crops migration unit tests. */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Bed, BedCrop } from '@litcrop/shared';

vi.mock('../../../services/repositories/bed-crops', () => ({
  listBedCropsByBed: vi.fn(),
  createBedCrop: vi.fn(),
}));

import * as bedCropsRepo from '../../../services/repositories/bed-crops';
import {
  shouldPromoteBed,
  buildPromotedCrop,
  promoteLegacyCropForBed,
  promotedCropId,
} from '../../../services/migrations/wave-e-promote-legacy';

const mockListBedCropsByBed = vi.mocked(bedCropsRepo.listBedCropsByBed);
const mockCreateBedCrop = vi.mocked(bedCropsRepo.createBedCrop);

// ── Fixtures ─────────────────────────────────────────────────────

const bedFixture: Bed = {
  id: 'bed-001',
  farm_id: 'farm-001',
  row: 0,
  col: 0,
  name: 'D1',
  crop_type: 'tomato',
  crop_variety: 'Roma',
  planted_at: '2026-04-01',
  expected_harvest: '2026-07-01',
  latest_status: 'healthy',
};

const realBedCropFixture: BedCrop = {
  id: 'crop-001',
  bed_id: 'bed-001',
  farm_id: 'farm-001',
  crop_type: 'lettuce',
  status: 'active',
  created_by: 'user-001',
  created_at: '2026-04-01T00:00:00Z',
  updated_at: '2026-04-01T00:00:00Z',
};

const legacyMigratedFixture: BedCrop = {
  ...realBedCropFixture,
  id: 'crop-legacy-001',
  created_from_legacy: true,
};

beforeEach(() => {
  vi.resetAllMocks();
  mockListBedCropsByBed.mockResolvedValue([]);
  mockCreateBedCrop.mockImplementation(async (c) => c);
});

// ── shouldPromoteBed ─────────────────────────────────────────────

describe('shouldPromoteBed', () => {
  it('returns needed=true for a bed with crop_type set, no completed_at, no real BedCrops', () => {
    expect(shouldPromoteBed(bedFixture, [])).toEqual({ needed: true });
  });

  it('skips beds without inline crop_type (null → no legacy to migrate)', () => {
    const bed = { ...bedFixture, crop_type: undefined };
    expect(shouldPromoteBed(bed, [])).toEqual({ needed: false, reason: 'no-inline-crop' });
  });

  it('skips beds with empty-string crop_type', () => {
    const bed = { ...bedFixture, crop_type: '' };
    expect(shouldPromoteBed(bed, [])).toEqual({ needed: false, reason: 'no-inline-crop' });
  });

  it('skips beds with completed_at set (cycle already over)', () => {
    const bed = { ...bedFixture, completed_at: '2026-04-10' };
    expect(shouldPromoteBed(bed, [])).toEqual({ needed: false, reason: 'bed-completed' });
  });

  it('skips beds that already have a created_from_legacy BedCrop (idempotent re-run)', () => {
    expect(shouldPromoteBed(bedFixture, [legacyMigratedFixture])).toEqual({
      needed: false,
      reason: 'already-has-legacy',
    });
  });

  it('skips beds with a real (non-legacy) BedCrop — user opted out of legacy path', () => {
    expect(shouldPromoteBed(bedFixture, [realBedCropFixture])).toEqual({
      needed: false,
      reason: 'has-real-bedcrops',
    });
  });

  it('idempotency-marker takes precedence over real-bedcrop check when both are present', () => {
    // Bed was previously promoted; later the user added another real crop.
    // We still skip for the "already-has-legacy" reason so re-running is safe.
    expect(shouldPromoteBed(bedFixture, [legacyMigratedFixture, realBedCropFixture])).toEqual({
      needed: false,
      reason: 'already-has-legacy',
    });
  });
});

// ── buildPromotedCrop ────────────────────────────────────────────

describe('buildPromotedCrop', () => {
  it('copies inline fields verbatim and stamps the idempotency marker', () => {
    const built = buildPromotedCrop(bedFixture, 'crop-new-001', '2026-04-24T12:00:00Z');
    expect(built).toEqual({
      id: 'crop-new-001',
      bed_id: 'bed-001',
      farm_id: 'farm-001',
      crop_type: 'tomato',
      crop_variety: 'Roma',
      planted_at: '2026-04-01',
      expected_harvest: '2026-07-01',
      status: 'active',
      created_by: 'system',
      created_at: '2026-04-24T12:00:00Z',
      updated_at: '2026-04-24T12:00:00Z',
      created_from_legacy: true,
    });
  });

  it('handles beds missing optional inline fields (crop_variety, planted_at, expected_harvest)', () => {
    const minimal = {
      ...bedFixture,
      crop_variety: undefined,
      planted_at: undefined,
      expected_harvest: undefined,
    };
    const built = buildPromotedCrop(minimal, 'crop-new-002', '2026-04-24T12:00:00Z');
    expect(built.crop_variety).toBeUndefined();
    expect(built.planted_at).toBeUndefined();
    expect(built.expected_harvest).toBeUndefined();
    expect(built.created_from_legacy).toBe(true);
    expect(built.status).toBe('active');
  });
});

// ── promoteLegacyCropForBed (orchestrator) ───────────────────────

describe('promoteLegacyCropForBed', () => {
  it('calls createBedCrop in live mode when promotion is needed', async () => {
    const result = await promoteLegacyCropForBed(bedFixture, {
      dryRun: false,
      idFactory: () => 'crop-fixed-id',
      now: new Date('2026-04-24T12:00:00Z'),
    });

    expect(result).toEqual({ action: 'promoted', bedId: 'bed-001', bedCropId: 'crop-fixed-id' });
    expect(mockCreateBedCrop).toHaveBeenCalledOnce();
    expect(mockCreateBedCrop).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'crop-fixed-id',
        bed_id: 'bed-001',
        created_by: 'system',
        created_from_legacy: true,
        status: 'active',
      }),
    );
  });

  it('default id is deterministic (promoted-<bedId>) — safe under concurrent runs', async () => {
    // Two back-to-back invocations without an idFactory override produce
    // identical PK+SK writes; if a real race occurred against DDB, the
    // second PUT would overwrite the first with identical content.
    const first = await promoteLegacyCropForBed(bedFixture, { dryRun: true });
    const second = await promoteLegacyCropForBed(bedFixture, { dryRun: true });
    expect(first).toEqual({ action: 'promoted', bedId: 'bed-001', bedCropId: 'promoted-bed-001' });
    expect(second).toEqual({ action: 'promoted', bedId: 'bed-001', bedCropId: 'promoted-bed-001' });
  });

  it('deterministic id does NOT start with bed-legacy- (D3 auto-default compatibility)', () => {
    // D3 skips auto-attribution for ids starting with 'bed-legacy-' (virtual
    // projection sentinel). Promoted rows must be real from D3's view.
    expect(promotedCropId('bed-xyz').startsWith('bed-legacy-')).toBe(false);
    expect(promotedCropId('bed-xyz')).toBe('promoted-bed-xyz');
  });

  it('does NOT write in dry-run mode but still returns a promoted result', async () => {
    const result = await promoteLegacyCropForBed(bedFixture, {
      dryRun: true,
      idFactory: () => 'crop-fixed-id',
      now: new Date('2026-04-24T12:00:00Z'),
    });

    expect(result).toEqual({ action: 'promoted', bedId: 'bed-001', bedCropId: 'crop-fixed-id' });
    expect(mockCreateBedCrop).not.toHaveBeenCalled();
  });

  it('is idempotent: a second run on a bed already migrated skips with already-has-legacy', async () => {
    mockListBedCropsByBed.mockResolvedValue([legacyMigratedFixture]);

    const result = await promoteLegacyCropForBed(bedFixture, { dryRun: false });

    expect(result).toEqual({ action: 'skipped', bedId: 'bed-001', reason: 'already-has-legacy' });
    expect(mockCreateBedCrop).not.toHaveBeenCalled();
  });

  it('skips beds with real non-legacy BedCrops (does not interfere with user-created crops)', async () => {
    mockListBedCropsByBed.mockResolvedValue([realBedCropFixture]);

    const result = await promoteLegacyCropForBed(bedFixture, { dryRun: false });

    expect(result).toEqual({ action: 'skipped', bedId: 'bed-001', reason: 'has-real-bedcrops' });
    expect(mockCreateBedCrop).not.toHaveBeenCalled();
  });

  it('skips beds with no inline crop_type', async () => {
    const bed = { ...bedFixture, crop_type: undefined };
    const result = await promoteLegacyCropForBed(bed, { dryRun: false });
    expect(result).toEqual({ action: 'skipped', bedId: 'bed-001', reason: 'no-inline-crop' });
    expect(mockCreateBedCrop).not.toHaveBeenCalled();
  });

  it('skips beds with completed_at set', async () => {
    const bed = { ...bedFixture, completed_at: '2026-04-10' };
    const result = await promoteLegacyCropForBed(bed, { dryRun: false });
    expect(result).toEqual({ action: 'skipped', bedId: 'bed-001', reason: 'bed-completed' });
    expect(mockCreateBedCrop).not.toHaveBeenCalled();
  });

  // T-E1-01 — listBedCropsByBed rejection bubbles out (CLI contract)
  it('T-E1-01: listBedCropsByBed rejection bubbles out (not silently skipped)', async () => {
    // A future try/catch refactor that turned a read failure into a synthetic
    // 'skipped' result would pass every other test but break the CLI's
    // per-bed log+continue semantics in scripts/migrate-wave-e-promote-legacy-crops.ts.
    mockListBedCropsByBed.mockRejectedValue(new Error('DDB read failed'));

    await expect(
      promoteLegacyCropForBed(bedFixture, { dryRun: false }),
    ).rejects.toThrow('DDB read failed');
    expect(mockCreateBedCrop).not.toHaveBeenCalled();
  });

  // T-E1-02 — createBedCrop rejection bubbles out (CLI contract, symmetric)
  it('T-E1-02: createBedCrop rejection bubbles out on live writes (no internal retries)', async () => {
    mockCreateBedCrop.mockRejectedValue(new Error('DDB write failed'));

    await expect(
      promoteLegacyCropForBed(bedFixture, { dryRun: false }),
    ).rejects.toThrow('DDB write failed');
  });
});

import { describe, it, expect } from 'vitest';
import { hasActiveCrop, toBedActiveCropSummary } from '../bed-crop';
import type { BedCrop } from '../types/domain';

describe('hasActiveCrop', () => {
  it('returns true when crop_type is a non-empty string', () => {
    expect(hasActiveCrop({ crop_type: 'tomato' })).toBe(true);
  });

  it('returns false when crop_type is undefined', () => {
    expect(hasActiveCrop({})).toBe(false);
    expect(hasActiveCrop({ crop_type: undefined })).toBe(false);
  });

  it('returns false when crop_type is null', () => {
    expect(hasActiveCrop({ crop_type: null })).toBe(false);
  });

  it('returns false when crop_type is an empty string', () => {
    expect(hasActiveCrop({ crop_type: '' })).toBe(false);
  });

  it('preserves extra fields on narrowed type', () => {
    const bed = { id: 'bed-1', crop_type: 'tomato', notes: 'south' };
    if (hasActiveCrop(bed)) {
      // After the guard, TypeScript knows crop_type is `string`, not `string | undefined`.
      const cropType: string = bed.crop_type;
      expect(cropType).toBe('tomato');
      expect(bed.id).toBe('bed-1');
      expect(bed.notes).toBe('south');
    } else {
      throw new Error('type guard should have matched');
    }
  });
});

describe('toBedActiveCropSummary', () => {
  const validCrop: BedCrop = {
    id: 'crop-1',
    bed_id: 'bed-1',
    farm_id: 'farm-1',
    crop_type: 'tomato',
    crop_variety: 'san marzano',
    planted_at: '2026-04-01',
    expected_harvest: '2026-07-15',
    status: 'active',
    notes: 'south row — full sun',
    created_by: 'user-1',
    created_at: '2026-04-01T00:00:00Z',
    updated_at: '2026-04-10T00:00:00Z',
  };

  it('returns null for null input', () => {
    expect(toBedActiveCropSummary(null)).toBeNull();
  });

  it('returns null for undefined input', () => {
    expect(toBedActiveCropSummary(undefined)).toBeNull();
  });

  it('projects the BedCrop to a summary with exactly the exposed fields', () => {
    expect(toBedActiveCropSummary(validCrop)).toEqual({
      id: 'crop-1',
      status: 'active',
      crop_type: 'tomato',
      crop_variety: 'san marzano',
      planted_at: '2026-04-01',
      expected_harvest: '2026-07-15',
    });
  });

  it('preserves status across all four BedCropStatus values (#279 Wave C)', () => {
    const statuses = ['planned', 'active', 'harvested', 'failed'] as const;
    for (const status of statuses) {
      const summary = toBedActiveCropSummary({ ...validCrop, status });
      expect(summary?.status).toBe(status);
    }
  });

  it('omits internal fields not on BedActiveCropSummary', () => {
    const summary = toBedActiveCropSummary(validCrop);
    expect(summary).not.toHaveProperty('notes');
    expect(summary).not.toHaveProperty('created_by');
    expect(summary).not.toHaveProperty('created_at');
    expect(summary).not.toHaveProperty('updated_at');
    expect(summary).not.toHaveProperty('bed_id');
    expect(summary).not.toHaveProperty('farm_id');
    expect(summary).not.toHaveProperty('completed_at');
  });
});

import { describe, it, expect } from 'vitest';
import { hasActiveCrop } from '../bed-crop';

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

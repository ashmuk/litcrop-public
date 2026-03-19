import { describe, it, expect } from 'vitest';
import {
  isValidImageContentType,
  isValidImageSize,
  isValidTagValue,
  isValidPlotStatus,
  isValidTriggerType,
  isValidLatLng,
  isValidFarmId,
  isValidPlotId,
  isValidImageId,
} from '../validation';
import { MAX_IMAGE_SIZE_BYTES } from '../constants';

describe('isValidImageContentType', () => {
  it('accepts image/jpeg', () => {
    expect(isValidImageContentType('image/jpeg')).toBe(true);
  });
  it('rejects image/png', () => {
    expect(isValidImageContentType('image/png')).toBe(false);
  });
  it('rejects empty string', () => {
    expect(isValidImageContentType('')).toBe(false);
  });
  it('rejects image/jpg (non-canonical)', () => {
    expect(isValidImageContentType('image/jpg')).toBe(false);
  });
});

describe('isValidImageSize', () => {
  it('rejects 0 bytes', () => {
    expect(isValidImageSize(0)).toBe(false);
  });
  it('accepts 1 byte', () => {
    expect(isValidImageSize(1)).toBe(true);
  });
  it('accepts exactly MAX_IMAGE_SIZE_BYTES', () => {
    expect(isValidImageSize(MAX_IMAGE_SIZE_BYTES)).toBe(true);
  });
  it('rejects MAX_IMAGE_SIZE_BYTES + 1', () => {
    expect(isValidImageSize(MAX_IMAGE_SIZE_BYTES + 1)).toBe(false);
  });
  it('rejects non-integer (float)', () => {
    expect(isValidImageSize(1024.5)).toBe(false);
  });
  it('rejects negative', () => {
    expect(isValidImageSize(-1)).toBe(false);
  });
});

describe('isValidTagValue', () => {
  it('accepts healthy', () => expect(isValidTagValue('healthy')).toBe(true));
  it('accepts slow_growth', () => expect(isValidTagValue('slow_growth')).toBe(true));
  it('accepts issue', () => expect(isValidTagValue('issue')).toBe(true));
  it('accepts animal_intrusion', () => expect(isValidTagValue('animal_intrusion')).toBe(true));
  it('rejects unknown', () => expect(isValidTagValue('unknown')).toBe(false));
  it('rejects no_data (status-only value)', () => expect(isValidTagValue('no_data')).toBe(false));
  it('rejects empty string', () => expect(isValidTagValue('')).toBe(false));
});

describe('isValidPlotStatus', () => {
  it('accepts no_data', () => expect(isValidPlotStatus('no_data')).toBe(true));
  it('accepts healthy', () => expect(isValidPlotStatus('healthy')).toBe(true));
  it('accepts slow_growth', () => expect(isValidPlotStatus('slow_growth')).toBe(true));
  it('accepts issue', () => expect(isValidPlotStatus('issue')).toBe(true));
  it('accepts animal_intrusion', () => expect(isValidPlotStatus('animal_intrusion')).toBe(true));
  it('rejects invalid', () => expect(isValidPlotStatus('invalid')).toBe(false));
  it('rejects empty string', () => expect(isValidPlotStatus('')).toBe(false));
});

describe('isValidTriggerType', () => {
  it('accepts scheduled', () => expect(isValidTriggerType('scheduled')).toBe(true));
  it('accepts motion', () => expect(isValidTriggerType('motion')).toBe(true));
  it('rejects manual', () => expect(isValidTriggerType('manual')).toBe(false));
  it('rejects empty string', () => expect(isValidTriggerType('')).toBe(false));
  it('rejects uppercase SCHEDULED', () => expect(isValidTriggerType('SCHEDULED')).toBe(false));
});

describe('isValidLatLng', () => {
  it('accepts valid coordinates', () => {
    expect(isValidLatLng(36.0, 138.3)).toBe(true);
  });
  it('accepts boundary: lat=-90, lng=-180', () => {
    expect(isValidLatLng(-90, -180)).toBe(true);
  });
  it('accepts boundary: lat=90, lng=180', () => {
    expect(isValidLatLng(90, 180)).toBe(true);
  });
  it('rejects lat > 90', () => {
    expect(isValidLatLng(91, 0)).toBe(false);
  });
  it('rejects lat < -90', () => {
    expect(isValidLatLng(-91, 0)).toBe(false);
  });
  it('rejects lng > 180', () => {
    expect(isValidLatLng(0, 181)).toBe(false);
  });
  it('rejects lng < -180', () => {
    expect(isValidLatLng(0, -181)).toBe(false);
  });
});

describe('isValidFarmId / isValidPlotId / isValidImageId', () => {
  const validUuid = 'f0000000-0000-4000-8000-000000000001';

  it('accepts a valid UUID v4', () => {
    expect(isValidFarmId(validUuid)).toBe(true);
    expect(isValidPlotId(validUuid)).toBe(true);
    expect(isValidImageId(validUuid)).toBe(true);
  });
  it('rejects empty string', () => {
    expect(isValidFarmId('')).toBe(false);
  });
  it('rejects UUID without hyphens', () => {
    expect(isValidFarmId('f000000000004000800000000000001')).toBe(false);
  });
  it('rejects truncated UUID', () => {
    expect(isValidFarmId('f0000000-0000-4000')).toBe(false);
  });
  it('accepts UUID with lowercase hex', () => {
    expect(isValidFarmId('a1b2c3d4-e5f6-7890-abcd-ef1234567890')).toBe(true);
  });
});

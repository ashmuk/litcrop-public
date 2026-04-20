import { describe, it, expect } from 'vitest';
import {
  BedStatusSchema,
  FarmBaseSchema,
  FarmBedSchema,
  FarmResponseSchema,
  BedDetailResponseSchema,
  UpdateBedRequestSchema,
  ImageDetailResponseSchema,
  TagCreateResponseSchema,
  DeviceListItemSchema,
} from '../schemas/index';

// ── BedStatusSchema ───────────────────────────────────────────────

describe('BedStatusSchema', () => {
  it('accepts all valid statuses', () => {
    const values = ['healthy', 'slow_growth', 'issue', 'animal_intrusion', 'no_data'];
    for (const v of values) {
      expect(BedStatusSchema.safeParse(v).success).toBe(true);
    }
  });

  it('rejects unknown status', () => {
    expect(BedStatusSchema.safeParse('unknown').success).toBe(false);
  });

  it('rejects empty string', () => {
    expect(BedStatusSchema.safeParse('').success).toBe(false);
  });
});

// ── FarmBaseSchema ────────────────────────────────────────────────

const validFarmBase = {
  id: 'farm-1',
  user_id: 'user-1',
  name: 'Nagano Farm',
  description: null,
  location_text: 'Nagano, Japan',
  latitude: 36.65,
  longitude: 138.18,
  elevation_m: null,
  climate_zone: null,
  locale: 'ja',
  theme: 'system',
  grid_rows: 3,
  grid_cols: 3,
  created_at: '2026-01-01T00:00:00Z',
};

describe('FarmBaseSchema', () => {
  it('accepts a valid farm', () => {
    expect(FarmBaseSchema.safeParse(validFarmBase).success).toBe(true);
  });

  it('rejects missing required field name', () => {
    const { name: _n, ...rest } = validFarmBase;
    expect(FarmBaseSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects grid_rows of 0 (below min)', () => {
    expect(FarmBaseSchema.safeParse({ ...validFarmBase, grid_rows: 0 }).success).toBe(false);
  });

  it('rejects grid_rows of 6 (above max)', () => {
    expect(FarmBaseSchema.safeParse({ ...validFarmBase, grid_rows: 6 }).success).toBe(false);
  });

  it('accepts grid_rows at boundary values 1 and 5', () => {
    expect(FarmBaseSchema.safeParse({ ...validFarmBase, grid_rows: 1 }).success).toBe(true);
    expect(FarmBaseSchema.safeParse({ ...validFarmBase, grid_rows: 5 }).success).toBe(true);
  });

  it('rejects missing user_id', () => {
    const { user_id: _u, ...rest } = validFarmBase;
    expect(FarmBaseSchema.safeParse(rest).success).toBe(false);
  });
});

// ── FarmResponseSchema ────────────────────────────────────────────

describe('FarmResponseSchema', () => {
  it('accepts farm with empty beds array', () => {
    expect(FarmResponseSchema.safeParse({ ...validFarmBase, beds: [] }).success).toBe(true);
  });

  it('accepts farm with populated beds array', () => {
    const bed = {
      id: 'bed-1',
      row: 1,
      col: 1,
      name: 'Bed A',
      crop_type: null,
      crop_variety: null,
      latest_status: 'no_data',
    };
    expect(FarmResponseSchema.safeParse({ ...validFarmBase, beds: [bed] }).success).toBe(true);
  });

  it('rejects farm with missing beds field', () => {
    expect(FarmResponseSchema.safeParse(validFarmBase).success).toBe(false);
  });

  it('rejects farm where beds contains old fields array shape', () => {
    // Old shape: beds was a nested array (fields array) — must be flat
    expect(
      FarmResponseSchema.safeParse({ ...validFarmBase, beds: [[]] }).success,
    ).toBe(false);
  });
});

// ── FarmBedSchema ─────────────────────────────────────────────────

describe('FarmBedSchema', () => {
  const validBed = {
    id: 'bed-1',
    row: 2,
    col: 3,
    name: 'Tomatoes',
    crop_type: 'tomato',
    crop_variety: null,
    latest_status: 'healthy',
  };

  it('accepts a valid bed', () => {
    expect(FarmBedSchema.safeParse(validBed).success).toBe(true);
  });

  it('rejects row of 0', () => {
    expect(FarmBedSchema.safeParse({ ...validBed, row: 0 }).success).toBe(false);
  });

  it('rejects col of 6', () => {
    expect(FarmBedSchema.safeParse({ ...validBed, col: 6 }).success).toBe(false);
  });

  it('rejects invalid latest_status', () => {
    expect(FarmBedSchema.safeParse({ ...validBed, latest_status: 'dying' }).success).toBe(false);
  });
});

// ── BedDetailResponseSchema ───────────────────────────────────────

describe('BedDetailResponseSchema', () => {
  const validBedDetail = {
    id: 'bed-1',
    row: 1,
    col: 1,
    name: 'Bed A',
    crop_type: null,
    crop_variety: null,
    latest_status: 'no_data',
    farm_id: 'farm-1',
    planted_at: null,
    expected_harvest: null,
    completed_at: null,
    notes: null,
    latest_image: null,
  };

  it('accepts valid bed detail', () => {
    expect(BedDetailResponseSchema.safeParse(validBedDetail).success).toBe(true);
  });

  it('rejects missing farm_id', () => {
    const { farm_id: _f, ...rest } = validBedDetail;
    expect(BedDetailResponseSchema.safeParse(rest).success).toBe(false);
  });
});

// ── UpdateBedRequestSchema ────────────────────────────────────────

describe('UpdateBedRequestSchema', () => {
  it('accepts empty partial update', () => {
    expect(UpdateBedRequestSchema.safeParse({}).success).toBe(true);
  });

  it('accepts valid partial update', () => {
    expect(UpdateBedRequestSchema.safeParse({ crop_type: 'tomato', notes: 'Growing well' }).success).toBe(true);
  });

  it('accepts null values for optional fields', () => {
    expect(UpdateBedRequestSchema.safeParse({ crop_type: null, notes: null }).success).toBe(true);
  });

  it('rejects crop_type exceeding 100 chars', () => {
    expect(
      UpdateBedRequestSchema.safeParse({ crop_type: 'x'.repeat(101) }).success,
    ).toBe(false);
  });

  it('rejects notes exceeding 500 chars', () => {
    expect(
      UpdateBedRequestSchema.safeParse({ notes: 'x'.repeat(501) }).success,
    ).toBe(false);
  });

  it('accepts crop_type exactly 100 chars', () => {
    expect(
      UpdateBedRequestSchema.safeParse({ crop_type: 'x'.repeat(100) }).success,
    ).toBe(true);
  });

  it('accepts notes exactly 500 chars', () => {
    expect(
      UpdateBedRequestSchema.safeParse({ notes: 'x'.repeat(500) }).success,
    ).toBe(true);
  });

  it('accepts valid completed_at date (#297)', () => {
    expect(
      UpdateBedRequestSchema.safeParse({ completed_at: '2026-04-06' }).success,
    ).toBe(true);
  });

  it('accepts completed_at null to clear (#297)', () => {
    expect(
      UpdateBedRequestSchema.safeParse({ completed_at: null }).success,
    ).toBe(true);
  });

  it('rejects completed_at with invalid format (#297)', () => {
    expect(
      UpdateBedRequestSchema.safeParse({ completed_at: 'not-a-date' }).success,
    ).toBe(false);
  });
});

// ── ImageDetailResponseSchema ─────────────────────────────────────

describe('ImageDetailResponseSchema', () => {
  const validImageDetail = {
    id: 'img-1',
    bed_id: 'bed-1',
    node_id: 'node-1',
    captured_at: '2026-01-01T10:00:00Z',
    uploaded_at: '2026-01-01T10:01:00Z',
    url: 'https://example.com/img.jpg',
    thumbnail_url: null,
    trigger: 'scheduled',
    content_type: 'image/jpeg',
    size_bytes: 204800,
    metadata: null,
    tags: [],
  };

  it('accepts valid image detail with bed_id', () => {
    expect(ImageDetailResponseSchema.safeParse(validImageDetail).success).toBe(true);
  });

  it('rejects image with plot_id instead of bed_id', () => {
    const { bed_id: _b, ...rest } = validImageDetail;
    const withPlotId = { ...rest, plot_id: 'plot-1' };
    const result = ImageDetailResponseSchema.safeParse(withPlotId);
    expect(result.success).toBe(false);
  });

  it('rejects missing bed_id', () => {
    const { bed_id: _b, ...rest } = validImageDetail;
    expect(ImageDetailResponseSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects invalid trigger value', () => {
    expect(
      ImageDetailResponseSchema.safeParse({ ...validImageDetail, trigger: 'manual' }).success,
    ).toBe(false);
  });
});

// ── TagCreateResponseSchema ───────────────────────────────────────

describe('TagCreateResponseSchema', () => {
  const validTag = {
    id: 'tag-1',
    image_id: 'img-1',
    tag: 'healthy',
    note: null,
    created_at: '2026-01-01T10:00:00Z',
    bed_status_updated: true,
  };

  it('accepts valid tag create response with bed_status_updated true', () => {
    expect(TagCreateResponseSchema.safeParse(validTag).success).toBe(true);
  });

  it('accepts bed_status_updated false', () => {
    expect(TagCreateResponseSchema.safeParse({ ...validTag, bed_status_updated: false }).success).toBe(true);
  });

  it('rejects non-boolean bed_status_updated', () => {
    expect(
      TagCreateResponseSchema.safeParse({ ...validTag, bed_status_updated: 'yes' }).success,
    ).toBe(false);
  });

  it('rejects invalid tag value', () => {
    expect(
      TagCreateResponseSchema.safeParse({ ...validTag, tag: 'no_data' }).success,
    ).toBe(false);
  });
});

// ── #462 attribution fields — nullable().optional() contract ──────
//
// Guards the migration-shape contract for the two attribution fields.
// Both are declared .nullable().optional() so that:
//   - present-null  (legacy records) parses ✅
//   - absent        (pre-v0.99.7.3 DDB Items that have no attribute at all) parses ✅
//   - present-string (new records) parses ✅
// A future schema tightening to .optional() without .nullable() (or vice versa)
// would break one of the first two cases and must fail CI.

describe('#462 uploaded_by nullability — ImageDetailResponseSchema', () => {
  const validImageDetail = {
    id: 'img-1',
    bed_id: 'bed-1',
    node_id: 'node-1',
    captured_at: '2026-01-01T10:00:00Z',
    uploaded_at: '2026-01-01T10:01:00Z',
    url: 'https://example.com/img.jpg',
    thumbnail_url: null,
    trigger: 'scheduled',
    content_type: 'image/jpeg',
    size_bytes: 204800,
    metadata: null,
    tags: [],
  };

  it('accepts uploaded_by: null (legacy record, field present but null)', () => {
    expect(
      ImageDetailResponseSchema.safeParse({ ...validImageDetail, uploaded_by: null }).success,
    ).toBe(true);
  });

  it('accepts uploaded_by absent (pre-v0.99.7.3 DDB record, field not present)', () => {
    // validImageDetail has no uploaded_by key — omission must be valid
    expect(
      ImageDetailResponseSchema.safeParse(validImageDetail).success,
    ).toBe(true);
  });

  it('accepts uploaded_by as a non-empty string (new record)', () => {
    expect(
      ImageDetailResponseSchema.safeParse({ ...validImageDetail, uploaded_by: 'cognito-sub-abc' }).success,
    ).toBe(true);
  });
});

describe('#462 registered_by nullability — DeviceListItemSchema', () => {
  const validDevice = {
    device_id: 'dev-001',
    farm_id: 'farm-1',
    bed_id: 'bed-1',
    bed_name: 'A1',
    node_name: 'Test Cam',
    status: 'online',
    capture_interval: 1800,
    resolution: '1920x1080',
    jpeg_quality: 85,
    active_window: { start: '05:00', end: '20:00' },
    trigger_type: 'scheduled',
    last_seen_at: null,
    battery_level: null,
    wifi_signal_dbm: null,
    storage_status: null,
    capabilities: null,
    test_shot_requested: false,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };

  it('accepts registered_by: null (legacy record, field present but null)', () => {
    expect(
      DeviceListItemSchema.safeParse({ ...validDevice, registered_by: null }).success,
    ).toBe(true);
  });

  it('accepts registered_by absent (pre-v0.99.7.3 DDB record, field not present)', () => {
    // validDevice has no registered_by key — omission must be valid
    expect(
      DeviceListItemSchema.safeParse(validDevice).success,
    ).toBe(true);
  });

  it('accepts registered_by as a non-empty string (new record)', () => {
    expect(
      DeviceListItemSchema.safeParse({ ...validDevice, registered_by: 'cognito-sub-xyz' }).success,
    ).toBe(true);
  });
});

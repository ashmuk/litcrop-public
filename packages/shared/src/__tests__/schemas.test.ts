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
  ActivityItemSchema,
  ActivityFeedResponseSchema,
  DiaryActivityItemSchema,
  DeviceActivityItemSchema,
  ImageActivityItemSchema,
  BedActiveCropSummarySchema,
  BedCropStatusSchema,
  BedCropSchema,
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

// ── BedActiveCropSummarySchema (#279 Wave C) ──────────────────────

describe('BedActiveCropSummarySchema', () => {
  const validSummary = {
    id: 'crop-1',
    status: 'active',
    crop_type: 'tomato',
    crop_variety: null,
    planted_at: '2026-04-01',
    expected_harvest: '2026-07-15',
  };

  it('accepts a valid summary with all fields', () => {
    expect(BedActiveCropSummarySchema.safeParse(validSummary).success).toBe(true);
  });

  it('accepts a summary with only required fields (id, status, crop_type)', () => {
    expect(
      BedActiveCropSummarySchema.safeParse({
        id: 'crop-1',
        status: 'planned',
        crop_type: 'carrot',
      }).success,
    ).toBe(true);
  });

  it('rejects missing status — Wave C UI needs it to distinguish planned vs active', () => {
    const { status: _s, ...rest } = validSummary;
    expect(BedActiveCropSummarySchema.safeParse(rest).success).toBe(false);
  });

  it('rejects invalid status value', () => {
    expect(
      BedActiveCropSummarySchema.safeParse({ ...validSummary, status: 'ongoing' }).success,
    ).toBe(false);
  });

  it('accepts all four valid BedCropStatus values', () => {
    for (const status of ['planned', 'active', 'harvested', 'failed']) {
      expect(
        BedActiveCropSummarySchema.safeParse({ ...validSummary, status }).success,
      ).toBe(true);
    }
  });

  it('rejects missing id', () => {
    const { id: _i, ...rest } = validSummary;
    expect(BedActiveCropSummarySchema.safeParse(rest).success).toBe(false);
  });

  it('rejects missing crop_type', () => {
    const { crop_type: _c, ...rest } = validSummary;
    expect(BedActiveCropSummarySchema.safeParse(rest).success).toBe(false);
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

  // ── #279 Wave C — active_crop and active_crops_count ─────────────

  it('accepts detail with a populated active_crop (including required status)', () => {
    const withActive = {
      ...validBedDetail,
      crop_type: 'tomato',
      crop_variety: 'san marzano',
      planted_at: '2026-04-01',
      expected_harvest: '2026-07-15',
      active_crop: {
        id: 'crop-1',
        status: 'active',
        crop_type: 'tomato',
        crop_variety: 'san marzano',
        planted_at: '2026-04-01',
        expected_harvest: '2026-07-15',
      },
    };
    expect(BedDetailResponseSchema.safeParse(withActive).success).toBe(true);
  });

  it('accepts detail with active_crop: null (no active crop)', () => {
    expect(
      BedDetailResponseSchema.safeParse({ ...validBedDetail, active_crop: null }).success,
    ).toBe(true);
  });

  it('accepts non-negative integer active_crops_count', () => {
    expect(
      BedDetailResponseSchema.safeParse({ ...validBedDetail, active_crops_count: 3 }).success,
    ).toBe(true);
    expect(
      BedDetailResponseSchema.safeParse({ ...validBedDetail, active_crops_count: 0 }).success,
    ).toBe(true);
  });

  it('rejects negative active_crops_count', () => {
    expect(
      BedDetailResponseSchema.safeParse({ ...validBedDetail, active_crops_count: -1 }).success,
    ).toBe(false);
  });

  it('rejects non-integer active_crops_count', () => {
    expect(
      BedDetailResponseSchema.safeParse({ ...validBedDetail, active_crops_count: 2.5 }).success,
    ).toBe(false);
  });

  it('accepts active_crops_count absent (field is optional during shim window)', () => {
    // validBedDetail has no active_crops_count key — omission must be valid.
    expect(BedDetailResponseSchema.safeParse(validBedDetail).success).toBe(true);
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

// ── C1: ActivityItem schema stability (#462 Phase 3) ──────────────
//
// These tests assert the discriminated-union shape is stable. A rename of
// the discriminant key ('type') or removal of a required field must fail
// CI rather than silently breaking the frontend consumer.

describe('C1 — ActivityItemSchema: discriminated-union stability', () => {
  const baseFields = {
    id: 'diary:diary-abc-001',
    timestamp: '2026-03-01T08:00:00Z',
    farm_id: 'farm-001',
    farm_name: 'Test Farm',
    actor_id: 'user-abc',
    actor_name: 'Alice',
    deep_link: '/diary?farm=farm-001&entry=diary-abc-001',
  };

  const validDiary = {
    ...baseFields,
    type: 'diary',
    diary_category: 'watering',
    diary_entry_type: 'actual',
    description: 'Watered beds A1 and A2',
    bed_id: 'bed-001',
    bed_name: 'A1',
  };

  const validDevice = {
    ...baseFields,
    id: 'device:dev-001',
    type: 'device',
    deep_link: '/devices?farm=farm-001&device=dev-001',
    device_id: 'dev-001',
    node_name: 'Pi-Cam-1',
    bed_id: 'bed-001',
    bed_name: 'A1',
  };

  const validImage = {
    ...baseFields,
    id: 'image:img-001',
    type: 'image',
    deep_link: '/beds/bed-001?image=img-001',
    image_id: 'img-001',
    bed_id: 'bed-001',
    bed_name: 'A1',
    trigger: 'scheduled',
    thumbnail_key: null,
  };

  it('accepts a valid diary ActivityItem', () => {
    expect(ActivityItemSchema.safeParse(validDiary).success).toBe(true);
  });

  it('accepts a valid device ActivityItem', () => {
    expect(ActivityItemSchema.safeParse(validDevice).success).toBe(true);
  });

  it('accepts a valid image ActivityItem', () => {
    expect(ActivityItemSchema.safeParse(validImage).success).toBe(true);
  });

  it('rejects an item with unknown type', () => {
    expect(ActivityItemSchema.safeParse({ ...validDiary, type: 'crop' }).success).toBe(false);
  });

  it('rejects a diary item missing diary_category', () => {
    const { diary_category: _dc, ...rest } = validDiary;
    expect(DiaryActivityItemSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects a device item missing node_name', () => {
    const { node_name: _nn, ...rest } = validDevice;
    expect(DeviceActivityItemSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects an image item missing trigger', () => {
    const { trigger: _t, ...rest } = validImage;
    expect(ImageActivityItemSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects an image item with invalid trigger value', () => {
    expect(ImageActivityItemSchema.safeParse({ ...validImage, trigger: 'manual' }).success).toBe(false);
  });

  it('accepts actor_id as null (nullability contract)', () => {
    expect(ActivityItemSchema.safeParse({ ...validDiary, actor_id: null }).success).toBe(true);
  });

  it('accepts farm_name as null (nullability contract)', () => {
    expect(ActivityItemSchema.safeParse({ ...validDiary, farm_name: null }).success).toBe(true);
  });

  it('accepts bed_name as null on diary item', () => {
    expect(DiaryActivityItemSchema.safeParse({ ...validDiary, bed_name: null }).success).toBe(true);
  });

  it('accepts bed_id as null on diary item', () => {
    expect(DiaryActivityItemSchema.safeParse({ ...validDiary, bed_id: null }).success).toBe(true);
  });

  it('rejects a diary item missing the timestamp field', () => {
    const { timestamp: _ts, ...rest } = validDiary;
    expect(ActivityItemSchema.safeParse(rest).success).toBe(false);
  });
});

// ── C2: ActivityFeedResponse schema stability (#462 Phase 3) ──────
//
// Guards the top-level response envelope shape. Frontend code reads
// items, next_cursor, and total_count directly — a field rename must fail CI.

describe('C2 — ActivityFeedResponseSchema: response envelope stability', () => {
  const baseFields = {
    id: 'diary:diary-c2-001',
    timestamp: '2026-04-01T10:00:00Z',
    farm_id: 'farm-c2',
    farm_name: 'C2 Farm',
    actor_id: 'user-c2',
    actor_name: 'Bob',
    deep_link: '/diary?farm=farm-c2&entry=diary-c2-001',
    type: 'diary',
    diary_category: 'seeding',
    diary_entry_type: 'actual',
    description: 'Seeded row A',
    bed_id: null,
    bed_name: null,
  };

  it('accepts a valid response with items, next_cursor, total_count', () => {
    const feed = {
      items: [baseFields],
      next_cursor: null,
      total_count: 1,
    };
    expect(ActivityFeedResponseSchema.safeParse(feed).success).toBe(true);
  });

  it('accepts an empty items array', () => {
    expect(ActivityFeedResponseSchema.safeParse({ items: [], next_cursor: null, total_count: 0 }).success).toBe(true);
  });

  it('accepts a non-null next_cursor string', () => {
    const cursor = Buffer.from(JSON.stringify({ user_id: 'u', ts: '2026-04-01T10:00:00Z', type: 'diary', id: 'diary:x' })).toString('base64url');
    expect(
      ActivityFeedResponseSchema.safeParse({ items: [], next_cursor: cursor, total_count: 5 }).success,
    ).toBe(true);
  });

  it('rejects a missing next_cursor field', () => {
    expect(ActivityFeedResponseSchema.safeParse({ items: [], total_count: 0 }).success).toBe(false);
  });

  it('rejects a missing total_count field', () => {
    expect(ActivityFeedResponseSchema.safeParse({ items: [], next_cursor: null }).success).toBe(false);
  });

  it('rejects a missing items field', () => {
    expect(ActivityFeedResponseSchema.safeParse({ next_cursor: null, total_count: 0 }).success).toBe(false);
  });

  it('rejects negative total_count', () => {
    expect(ActivityFeedResponseSchema.safeParse({ items: [], next_cursor: null, total_count: -1 }).success).toBe(false);
  });

  it('rejects a non-integer total_count', () => {
    expect(ActivityFeedResponseSchema.safeParse({ items: [], next_cursor: null, total_count: 1.5 }).success).toBe(false);
  });

  it('rejects items that fail discriminated-union validation', () => {
    const badItem = { ...baseFields, type: 'unknown_type' };
    expect(
      ActivityFeedResponseSchema.safeParse({ items: [badItem], next_cursor: null, total_count: 1 }).success,
    ).toBe(false);
  });

  it('accepts all three ActivityItem types in a single items array', () => {
    const deviceItem = {
      id: 'device:dev-c2',
      timestamp: '2026-03-15T12:00:00Z',
      farm_id: 'farm-c2',
      farm_name: 'C2 Farm',
      actor_id: 'user-c2',
      actor_name: 'Bob',
      deep_link: '/devices?farm=farm-c2&device=dev-c2',
      type: 'device',
      device_id: 'dev-c2',
      node_name: 'Pi-2',
      bed_id: 'bed-c2',
      bed_name: 'B1',
    };
    const imageItem = {
      id: 'image:img-c2',
      timestamp: '2026-03-20T06:00:00Z',
      farm_id: 'farm-c2',
      farm_name: 'C2 Farm',
      actor_id: 'user-c2',
      actor_name: 'Bob',
      deep_link: '/beds/bed-c2?image=img-c2',
      type: 'image',
      image_id: 'img-c2',
      bed_id: 'bed-c2',
      bed_name: 'B1',
      trigger: 'scheduled',
      thumbnail_key: null,
    };
    const result = ActivityFeedResponseSchema.safeParse({
      items: [imageItem, baseFields, deviceItem],
      next_cursor: null,
      total_count: 3,
    });
    expect(result.success).toBe(true);
  });
});

// ── BedCrop schemas (#279 Wave B) ────────────────────────────────

describe('BedCropStatusSchema', () => {
  it('accepts all four lifecycle statuses', () => {
    for (const v of ['planned', 'active', 'harvested', 'failed']) {
      expect(BedCropStatusSchema.safeParse(v).success).toBe(true);
    }
  });

  it('rejects unknown status strings', () => {
    expect(BedCropStatusSchema.safeParse('growing').success).toBe(false);
    expect(BedCropStatusSchema.safeParse('').success).toBe(false);
  });

  it('rejects non-string values', () => {
    expect(BedCropStatusSchema.safeParse(null).success).toBe(false);
    expect(BedCropStatusSchema.safeParse(0).success).toBe(false);
  });
});

describe('BedCropSchema', () => {
  const validActive = {
    id: 'crop-1',
    bed_id: 'bed-a1',
    farm_id: 'farm-1',
    crop_type: 'tomato',
    crop_variety: 'Brandywine',
    planted_at: '2026-04-01',
    expected_harvest: '2026-07-15',
    completed_at: null,
    status: 'active',
    notes: null,
    created_by: 'user-1',
    created_at: '2026-04-01T10:00:00Z',
    updated_at: '2026-04-01T10:00:00Z',
  };

  it('accepts a fully-populated active BedCrop', () => {
    expect(BedCropSchema.safeParse(validActive).success).toBe(true);
  });

  it('accepts a minimal BedCrop with only required fields', () => {
    const minimal = {
      id: 'crop-1',
      bed_id: 'bed-a1',
      farm_id: 'farm-1',
      crop_type: 'lettuce',
      status: 'planned',
      created_by: 'user-1',
      created_at: '2026-04-01T10:00:00Z',
      updated_at: '2026-04-01T10:00:00Z',
    };
    expect(BedCropSchema.safeParse(minimal).success).toBe(true);
  });

  it('rejects empty crop_type', () => {
    expect(BedCropSchema.safeParse({ ...validActive, crop_type: '' }).success).toBe(false);
  });

  it('rejects crop_type longer than 100 chars', () => {
    expect(BedCropSchema.safeParse({ ...validActive, crop_type: 'x'.repeat(101) }).success).toBe(false);
  });

  it('rejects unknown status', () => {
    expect(BedCropSchema.safeParse({ ...validActive, status: 'growing' }).success).toBe(false);
  });

  it('accepts harvested crop with completed_at set', () => {
    const harvested = { ...validActive, status: 'harvested', completed_at: '2026-07-15' };
    expect(BedCropSchema.safeParse(harvested).success).toBe(true);
  });

  it('rejects missing required keys', () => {
    const { bed_id: _omit, ...missing_bed_id } = validActive;
    expect(BedCropSchema.safeParse(missing_bed_id).success).toBe(false);
  });
});

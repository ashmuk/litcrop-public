import type { Farm, Bed, Image, Tag } from '@litcrop/shared';
import { TEST_USER_ID } from '../helpers/auth';

// ── IDs ─────────────────────────────────────────────────────────

export const FARM_ID = 'f0000000-0000-0000-0000-000000000001';
export const BED_ID = 'bd000000-0000-0000-0000-000000000001';
export const IMAGE_ID = 'im000000-0000-0000-0000-000000000001';
export const TAG_ID = 'tg000000-0000-0000-0000-000000000001';
export const DEVICE_ID = 'dv000000-0000-0000-0000-000000000001';
export const ENTRY_ID = 'de000000-0000-0000-0000-000000000001';

// ── Entity fixtures ─────────────────────────────────────────────

export const farmFixture: Farm = {
  id: FARM_ID,
  user_id: TEST_USER_ID,
  name: 'Test Farm',
  description: null,
  location_text: 'Test Location',
  latitude: 36.0,
  longitude: 138.3,
  elevation_m: null,
  climate_zone: null,
  locale: 'en',
  theme: 'system',
  grid_rows: 1,
  grid_cols: 1,
  created_at: '2026-03-17T00:00:00.000Z',
  default_currency: 'JPY',
};

export const bedFixture: Bed = {
  id: BED_ID,
  farm_id: FARM_ID,
  row: 1,
  col: 1,
  name: 'A1',
  crop_type: 'tomato',
  crop_variety: 'Cherry',
  planted_at: '2026-03-01',
  expected_harvest: '2026-06-01',
  notes: 'Test notes',
  latest_status: 'healthy',
};

export const imageFixture: Image = {
  id: IMAGE_ID,
  bed_id: BED_ID,
  node_id: 'node-01',
  captured_at: '2026-03-20T10:00:00.000Z',
  uploaded_at: '2026-03-20T10:01:00.000Z',
  storage_key: 'farms/f0/beds/bd0/img.jpg',
  thumbnail_key: 'farms/f0/beds/bd0/img_thumb.jpg',
  trigger: 'scheduled',
  content_type: 'image/jpeg',
  size_bytes: 102400,
};

export const tagFixture: Tag = {
  id: TAG_ID,
  image_id: IMAGE_ID,
  tag: 'healthy',
  note: undefined,
  created_at: '2026-03-20T11:00:00.000Z',
};

export const membershipFixture = {
  user_id: TEST_USER_ID,
  farm_id: FARM_ID,
  role: 'owner' as const,
  joined_at: '2026-03-17T00:00:00.000Z',
};

export const staffMembershipFixture = {
  ...membershipFixture,
  role: 'staff' as const,
};

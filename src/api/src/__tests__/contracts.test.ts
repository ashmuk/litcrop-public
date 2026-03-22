/**
 * Contract Tests — verify that actual route responses match shared TypeScript type shapes.
 *
 * Each test mocks DynamoDB with seed-like data, calls app.request(), and asserts:
 *   1. All expected fields are present with the correct types.
 *   2. No unexpected internal fields leak into responses (e.g., storage_key).
 *
 * Updated: Phase D — Farm→Bed flattening (ADR-20260322)
 */

import { TEST_USER_ID, authHeaders } from './helpers/auth';
import { createSdkMock } from './helpers/anthropic';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── SDK mock (replaces vi.stubGlobal('fetch') for chat route) ─────

const { mockCreate: contractsMockCreate } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
}));

vi.mock('@anthropic-ai/sdk', () => createSdkMock(contractsMockCreate));
import app from '../app';
import { dynamoRepo } from '../services/dynamodb';
import { getSignedImageUrl, getSignedThumbnailUrl, uploadImage } from '../services/s3';
import { NotFoundError } from '../errors';
import {
  FarmResponseSchema,
  FarmWriteResponseSchema,
  FarmBedsResponseSchema,
  BedDetailResponseSchema,
  ImageListResponseSchema,
  ImageUploadResponseSchema,
  ImageDetailResponseSchema,
  TagCreateResponseSchema,
  WeatherResponseSchema,
  ChatResponseSchema,
  UsageResponseSchema,
} from '@litcrop/shared';

vi.mock('../services/dynamodb', () => ({
  dynamoRepo: {
    getFarm: vi.fn(),
    getFarmsForUser: vi.fn(),
    getFarmMembership: vi.fn(),
    addFarmMember: vi.fn(),
    createFarm: vi.fn(),
    updateFarm: vi.fn(),
    getBedsForFarm: vi.fn(),
    getBedById: vi.fn(),
    getLatestImageForBed: vi.fn(),
    getImagesForBed: vi.fn(),
    getTagsForImage: vi.fn(),
    createImage: vi.fn(),
    getImageById: vi.fn(),
    createTag: vi.fn(),
    getConversationHistory: vi.fn().mockResolvedValue([]),
    saveConversationHistory: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../services/s3', () => ({
  getSignedImageUrl: vi.fn(),
  getSignedThumbnailUrl: vi.fn(),
  uploadImage: vi.fn(),
  deleteImage: vi.fn(),
}));

vi.mock('../services/budget', () => ({
  checkBudget: vi.fn().mockResolvedValue({ allowed: true }),
  recordUsage: vi.fn().mockResolvedValue(undefined),
  getUsage: vi.fn(),
  MESSAGES_PER_HOUR_LIMIT: 20,
  CHAT_MODEL: 'claude-haiku-4-5-20251001',
  todayUtc: vi.fn().mockReturnValue('2026-03-20'),
  nextMidnightUtc: vi.fn().mockReturnValue('2026-03-21T00:00:00.000Z'),
  todayStartUtc: vi.fn().mockReturnValue('2026-03-20T00:00:00.000Z'),
  checkRateLimit: vi.fn(),
}));


// ── Seed fixtures ────────────────────────────────────────────────

const FARM_ID   = 'cf000000-0000-0000-0000-000000000001';
const BED_ID    = 'cf000000-0000-0000-0000-000000000003';
const IMAGE_ID  = 'cf000000-0000-0000-0000-000000000005';

const farmSeed = {
  id: FARM_ID,
  user_id: TEST_USER_ID,
  name: 'Contract Test Farm',
  description: 'A test farm',
  latitude: 35.6762,
  longitude: 139.6503,
  elevation_m: 40,
  climate_zone: 'temperate',
  locale: 'en' as const,
  theme: 'system' as const,
  grid_rows: 2,
  grid_cols: 2,
  created_at: '2026-01-01T00:00:00.000Z',
};

const bedSeed = {
  id: BED_ID,
  farm_id: FARM_ID,
  row: 1,
  col: 1,
  name: 'A1',
  crop_type: 'tomato',
  crop_variety: 'Cherry',
  planted_at: '2026-03-01',
  expected_harvest: '2026-07-01',
  notes: undefined as string | undefined,
  latest_status: 'healthy' as const,
};

const imageSeed = {
  id: IMAGE_ID,
  bed_id: BED_ID,
  node_id: 'cam-001',
  captured_at: '2026-03-17T10:00:00.000Z',
  uploaded_at: '2026-03-17T10:00:05.000Z',
  storage_key: `images/${FARM_ID}/${BED_ID}/2026/03/17/${IMAGE_ID}.jpg`,
  trigger: 'scheduled' as const,
  content_type: 'image/jpeg',
  size_bytes: 102400,
};

const tagSeed = {
  id: 'cf000000-0000-0000-0000-000000000006',
  image_id: IMAGE_ID,
  tag: 'healthy' as const,
  created_at: '2026-03-17T11:00:00.000Z',
};

const membershipSeed = {
  user_id: TEST_USER_ID,
  farm_id: FARM_ID,
  role: 'manager' as const,
  joined_at: '2026-01-01T00:00:00.000Z',
  farm_name: 'Contract Test Farm',
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSignedImageUrl).mockResolvedValue('https://cdn.example.com/signed-url');
  vi.mocked(getSignedThumbnailUrl).mockResolvedValue('https://cdn.example.com/thumb-signed-url');
  vi.mocked(uploadImage).mockResolvedValue(`images/${FARM_ID}/${BED_ID}/2026/03/17/${IMAGE_ID}.jpg`);
  // Ownership chain defaults
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.mocked(dynamoRepo.getFarm).mockResolvedValue(farmSeed as any);
  vi.mocked(dynamoRepo.getFarmMembership).mockResolvedValue(membershipSeed);
  vi.mocked(dynamoRepo.getBedById).mockResolvedValue(bedSeed);
});

// ── GET /api/v1/farms/:farmId ─────────────────────────────────────

describe('contract: GET /api/v1/farms/:farmId → FarmResponse', () => {
  it('has all top-level FarmResponse fields with flat beds', async () => {
    vi.mocked(dynamoRepo.getFarm).mockResolvedValue(farmSeed);
    vi.mocked(dynamoRepo.getBedsForFarm).mockResolvedValue([bedSeed]);

    const res = await app.request(`/api/v1/farms/${FARM_ID}`, { headers: authHeaders() });
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;

    expect(body).toMatchObject({
      id: FARM_ID,
      name: 'Contract Test Farm',
      description: 'A test farm',
      latitude: 35.6762,
      longitude: 139.6503,
      locale: 'en',
      theme: 'system',
      grid_rows: 2,
      grid_cols: 2,
      created_at: '2026-01-01T00:00:00.000Z',
    });
    expect(Array.isArray(body['beds'])).toBe(true);
    const beds = body['beds'] as Array<Record<string, unknown>>;
    expect(beds).toHaveLength(1);
    expect(beds[0]['id']).toBe(BED_ID);
    expect(beds[0]['name']).toBe('A1');
    expect(beds[0]['crop_type']).toBe('tomato');
    expect(beds[0]['latest_status']).toBe('healthy');
  });
});

// ── GET /api/v1/farms/:farmId/beds ──────────────────────────────

describe('contract: GET /api/v1/farms/:farmId/beds → FarmBedItem[]', () => {
  it('has all FarmBedItem fields including latest_image', async () => {
    vi.mocked(dynamoRepo.getFarm).mockResolvedValue(farmSeed);
    vi.mocked(dynamoRepo.getBedsForFarm).mockResolvedValue([bedSeed]);
    vi.mocked(dynamoRepo.getLatestImageForBed).mockResolvedValue(null);

    const res = await app.request(`/api/v1/farms/${FARM_ID}/beds`, { headers: authHeaders() });
    expect(res.status).toBe(200);
    const body = await res.json() as { data: Array<Record<string, unknown>> };

    expect(body).toHaveProperty('data');
    expect(body.data).toHaveLength(1);

    const item = body.data[0];
    expect(item['id']).toBe(BED_ID);
    expect(item['row']).toBe(1);
    expect(item['col']).toBe(1);
    expect(item['name']).toBe('A1');
    expect(item['crop_type']).toBe('tomato');
    expect(item['crop_variety']).toBe('Cherry');
    expect(item['latest_status']).toBe('healthy');
    expect(item['latest_image']).toBeNull();
  });

  it('latest_image has thumbnail_url: null when no thumbnail generated yet', async () => {
    vi.mocked(dynamoRepo.getFarm).mockResolvedValue(farmSeed);
    vi.mocked(dynamoRepo.getBedsForFarm).mockResolvedValue([bedSeed]);
    vi.mocked(dynamoRepo.getLatestImageForBed).mockResolvedValue(imageSeed);

    const res = await app.request(`/api/v1/farms/${FARM_ID}/beds`, { headers: authHeaders() });
    const body = await res.json() as { data: Array<Record<string, unknown>> };
    const img = body.data[0]['latest_image'] as Record<string, unknown>;

    expect(img).not.toBeNull();
    expect(img['thumbnail_url']).toBeNull();  // null when thumbnail_key absent
    expect(img['storage_key']).toBeUndefined();   // must not leak internal path
    expect(img['id']).toBe(IMAGE_ID);
    expect(img['captured_at']).toBe('2026-03-17T10:00:00.000Z');
    expect(img['trigger']).toBe('scheduled');
  });

  it('latest_image has thumbnail_url when thumbnail_key present', async () => {
    vi.mocked(dynamoRepo.getFarm).mockResolvedValue(farmSeed);
    vi.mocked(dynamoRepo.getBedsForFarm).mockResolvedValue([bedSeed]);
    vi.mocked(dynamoRepo.getLatestImageForBed).mockResolvedValue({
      ...imageSeed,
      thumbnail_key: `thumbnails/${FARM_ID}/${BED_ID}/2026/03/17/${IMAGE_ID}.jpg`,
    });

    const res = await app.request(`/api/v1/farms/${FARM_ID}/beds`, { headers: authHeaders() });
    const body = await res.json() as { data: Array<Record<string, unknown>> };
    const img = body.data[0]['latest_image'] as Record<string, unknown>;

    expect(img['thumbnail_url']).toBe('https://cdn.example.com/thumb-signed-url');
  });

  it('returns 404 when farm does not exist', async () => {
    vi.mocked(dynamoRepo.getFarm).mockRejectedValue(new NotFoundError('Farm not found'));
    const res = await app.request(`/api/v1/farms/${FARM_ID}/beds`, { headers: authHeaders() });
    expect(res.status).toBe(404);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('NOT_FOUND');
  });
});

// ── GET /api/v1/beds/:bedId ─────────────────────────────────────

describe('contract: GET /api/v1/beds/:bedId → BedDetailResponse', () => {
  it('has all BedDetailResponse fields with latest_image: null', async () => {
    vi.mocked(dynamoRepo.getBedById).mockResolvedValue(bedSeed);
    vi.mocked(dynamoRepo.getLatestImageForBed).mockResolvedValue(null);

    const res = await app.request(`/api/v1/beds/${BED_ID}`, { headers: authHeaders() });
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;

    expect(body['id']).toBe(BED_ID);
    expect(body['farm_id']).toBe(FARM_ID);
    expect(body['row']).toBe(1);
    expect(body['col']).toBe(1);
    expect(body['name']).toBe('A1');
    expect(body['crop_type']).toBe('tomato');
    expect(body['crop_variety']).toBe('Cherry');
    expect(body['latest_status']).toBe('healthy');
    expect(body['latest_image']).toBeNull();
  });
});

// ── GET /api/v1/farms/:farmId/weather ────────────────────────────

describe('contract: GET /api/v1/farms/:farmId/weather → WeatherResponse', () => {
  const WEATHER_FARM_ID = 'cf000000-0000-0000-0000-000000000099';

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(makeOpenMeteoResponse()),
    }));
    vi.mocked(dynamoRepo.getFarm).mockResolvedValue({ ...farmSeed, id: WEATHER_FARM_ID });
    vi.mocked(dynamoRepo.getBedsForFarm).mockResolvedValue([]);
  });

  it('has all top-level WeatherResponse fields', async () => {
    const res = await app.request(`/api/v1/farms/${WEATHER_FARM_ID}/weather`, { headers: authHeaders() });
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;

    // Required top-level fields per WeatherResponse type
    expect(body).toHaveProperty('current');
    expect(body).toHaveProperty('today');
    expect(body).toHaveProperty('hourly');
    expect(body).toHaveProperty('daily');
    expect(body).toHaveProperty('alerts');
    expect(Array.isArray(body['alerts'])).toBe(true);
  });

  it('current has all required fields', async () => {
    const res = await app.request(`/api/v1/farms/${WEATHER_FARM_ID}/weather`, { headers: authHeaders() });
    const body = await res.json() as { current: Record<string, unknown> };
    const current = body.current;

    expect(typeof current['temperature']).toBe('number');
    expect(typeof current['condition']).toBe('string');
    expect(typeof current['condition_icon']).toBe('string');
    expect(typeof current['humidity']).toBe('number');
    expect(typeof current['wind_speed']).toBe('number');
    expect(typeof current['wind_direction']).toBe('string');
  });

  it('today has high, low, rain_probability, rain_sum_mm, sunrise, sunset', async () => {
    const res = await app.request(`/api/v1/farms/${WEATHER_FARM_ID}/weather`, { headers: authHeaders() });
    const body = await res.json() as { today: Record<string, unknown> };
    const today = body.today;

    expect(typeof today['high']).toBe('number');
    expect(typeof today['low']).toBe('number');
    expect(typeof today['rain_probability']).toBe('number');
    expect(typeof today['rain_sum_mm']).toBe('number');
    expect(typeof today['sunrise']).toBe('string');
    expect(typeof today['sunset']).toBe('string');
  });

  it('hourly items have time, temperature, rain_probability, condition_icon', async () => {
    const res = await app.request(`/api/v1/farms/${WEATHER_FARM_ID}/weather`, { headers: authHeaders() });
    const body = await res.json() as { hourly: Array<Record<string, unknown>> };

    expect(body.hourly.length).toBeGreaterThan(0);
    const h = body.hourly[0];
    expect(typeof h['time']).toBe('string');
    expect(typeof h['temperature']).toBe('number');
    expect(typeof h['rain_probability']).toBe('number');
    expect(typeof h['condition_icon']).toBe('string');
  });

  it('daily items have date, high, low, rain_probability, rain_sum_mm, condition, condition_icon', async () => {
    const res = await app.request(`/api/v1/farms/${WEATHER_FARM_ID}/weather`, { headers: authHeaders() });
    const body = await res.json() as { daily: Array<Record<string, unknown>> };

    expect(body.daily).toHaveLength(7);
    const d = body.daily[0];
    expect(typeof d['date']).toBe('string');
    expect(typeof d['high']).toBe('number');
    expect(typeof d['low']).toBe('number');
    expect(typeof d['rain_probability']).toBe('number');
    expect(typeof d['rain_sum_mm']).toBe('number');
    expect(typeof d['condition']).toBe('string');
    expect(typeof d['condition_icon']).toBe('string');
  });
});

// ══════════════════════════════════════════════════════════════════
// Zod-based Contract Tests — one per API endpoint
//
// Each test: mock the repo with seed data, call the route, parse the
// response with the corresponding Zod schema. If the wire shape ever
// drifts from the shared type, ZodError is thrown and the test fails.
// ══════════════════════════════════════════════════════════════════

// Helper to build a minimal valid Open-Meteo payload
function makeOpenMeteoResponse() {
  return {
    current: {
      temperature_2m: 22.5,
      apparent_temperature: 21.0,
      relative_humidity_2m: 65,
      wind_speed_10m: 10.2,
      wind_direction_10m: 180,
      weather_code: 2,
    },
    hourly: {
      time: Array.from({ length: 24 }, (_, i) => `2026-03-17T${String(i).padStart(2, '0')}:00`),
      temperature_2m: Array(24).fill(20),
      relative_humidity_2m: Array(24).fill(60),
      precipitation_probability: Array(24).fill(5),
      precipitation: Array(24).fill(0),
      weather_code: Array(24).fill(2),
      wind_speed_10m: Array(24).fill(8),
    },
    daily: {
      time: ['2026-03-17', '2026-03-18', '2026-03-19', '2026-03-20', '2026-03-21', '2026-03-22', '2026-03-23'],
      temperature_2m_max: [25, 24, 23, 22, 21, 20, 19],
      temperature_2m_min: [15, 14, 13, 12, 11, 10, 9],
      precipitation_sum: [0, 0, 0, 0, 0, 0, 0],
      precipitation_probability_max: Array(7).fill(10),
      weather_code: Array(7).fill(2),
      sunrise: Array(7).fill('2026-03-17T05:45'),
      sunset: Array(7).fill('2026-03-17T18:15'),
    },
  };
}

// 1 ── GET /api/v1/farms/:farmId
describe('zod contract: GET /api/v1/farms/:farmId', () => {
  it('response parses against FarmResponseSchema', async () => {
    vi.mocked(dynamoRepo.getFarm).mockResolvedValue(farmSeed);
    vi.mocked(dynamoRepo.getBedsForFarm).mockResolvedValue([bedSeed]);

    const res = await app.request(`/api/v1/farms/${FARM_ID}`, { headers: authHeaders() });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(() => FarmResponseSchema.parse(body)).not.toThrow();
  });
});

// 2 ── POST /api/v1/farms
describe('zod contract: POST /api/v1/farms', () => {
  it('response parses against FarmWriteResponseSchema', async () => {
    vi.mocked(dynamoRepo.createFarm).mockResolvedValue(farmSeed);

    const res = await app.request('/api/v1/farms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ name: 'New Farm', latitude: 35.68, longitude: 139.69 }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(() => FarmWriteResponseSchema.parse(body)).not.toThrow();
  });
});

// 3 ── PATCH /api/v1/farms/:farmId
describe('zod contract: PATCH /api/v1/farms/:farmId', () => {
  it('response parses against FarmWriteResponseSchema', async () => {
    vi.mocked(dynamoRepo.updateFarm).mockResolvedValue(undefined);
    vi.mocked(dynamoRepo.getFarm).mockResolvedValue({ ...farmSeed, name: 'Updated Farm' });

    const res = await app.request(`/api/v1/farms/${FARM_ID}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ name: 'Updated Farm' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(() => FarmWriteResponseSchema.parse(body)).not.toThrow();
  });
});

// 4 ── GET /api/v1/farms/:farmId/beds
describe('zod contract: GET /api/v1/farms/:farmId/beds', () => {
  it('response parses against FarmBedsResponseSchema', async () => {
    vi.mocked(dynamoRepo.getFarm).mockResolvedValue(farmSeed);
    vi.mocked(dynamoRepo.getBedsForFarm).mockResolvedValue([bedSeed]);
    vi.mocked(dynamoRepo.getLatestImageForBed).mockResolvedValue(null);

    const res = await app.request(`/api/v1/farms/${FARM_ID}/beds`, { headers: authHeaders() });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(() => FarmBedsResponseSchema.parse(body)).not.toThrow();
  });
});

// 5 ── GET /api/v1/beds/:bedId
describe('zod contract: GET /api/v1/beds/:bedId', () => {
  it('response parses against BedDetailResponseSchema', async () => {
    vi.mocked(dynamoRepo.getBedById).mockResolvedValue(bedSeed);
    vi.mocked(dynamoRepo.getLatestImageForBed).mockResolvedValue(null);

    const res = await app.request(`/api/v1/beds/${BED_ID}`, { headers: authHeaders() });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(() => BedDetailResponseSchema.parse(body)).not.toThrow();
  });
});

// 6 ── GET /api/v1/beds/:bedId/images
describe('zod contract: GET /api/v1/beds/:bedId/images', () => {
  it('response parses against ImageListResponseSchema', async () => {
    vi.mocked(dynamoRepo.getBedById).mockResolvedValue(bedSeed);
    vi.mocked(dynamoRepo.getImagesForBed).mockResolvedValue({ items: [imageSeed], nextCursor: null });
    vi.mocked(dynamoRepo.getTagsForImage).mockResolvedValue([tagSeed]);

    const res = await app.request(`/api/v1/beds/${BED_ID}/images`, { headers: authHeaders() });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(() => ImageListResponseSchema.parse(body)).not.toThrow();
  });
});

// 7 ── POST /api/v1/beds/:bedId/images
describe('zod contract: POST /api/v1/beds/:bedId/images', () => {
  it('response parses against ImageUploadResponseSchema', async () => {
    vi.mocked(dynamoRepo.getBedById).mockResolvedValue(bedSeed);
    vi.mocked(dynamoRepo.createImage).mockResolvedValue(imageSeed);

    // Minimal valid JPEG: magic bytes + padding
    const jpegBytes = new Uint8Array([0xff, 0xd8, 0xff, ...Array(100).fill(0)]);
    const formData = new FormData();
    formData.append('image', new File([jpegBytes], 'test.jpg', { type: 'image/jpeg' }));
    formData.append('captured_at', '2026-03-17T10:00:00.000Z');
    formData.append('node_id', 'cam-001');
    formData.append('trigger', 'scheduled');

    const res = await app.request(`/api/v1/beds/${BED_ID}/images`, {
      method: 'POST',
      headers: authHeaders(),
      body: formData,
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(() => ImageUploadResponseSchema.parse(body)).not.toThrow();
  });
});

// 8 ── GET /api/v1/images/:imageId
describe('zod contract: GET /api/v1/images/:imageId', () => {
  it('response parses against ImageDetailResponseSchema', async () => {
    vi.mocked(dynamoRepo.getImageById).mockResolvedValue(imageSeed);
    vi.mocked(dynamoRepo.getTagsForImage).mockResolvedValue([tagSeed]);

    const res = await app.request(`/api/v1/images/${IMAGE_ID}`, { headers: authHeaders() });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(() => ImageDetailResponseSchema.parse(body)).not.toThrow();
  });
});

// 9 ── POST /api/v1/images/:imageId/tags
describe('zod contract: POST /api/v1/images/:imageId/tags', () => {
  it('response parses against TagCreateResponseSchema', async () => {
    vi.mocked(dynamoRepo.getImageById).mockResolvedValue(imageSeed);
    vi.mocked(dynamoRepo.createTag).mockResolvedValue(tagSeed);

    const res = await app.request(`/api/v1/images/${IMAGE_ID}/tags`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ tag: 'healthy' }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(() => TagCreateResponseSchema.parse(body)).not.toThrow();
  });
});

// 10 ── GET /api/v1/farms/:farmId/weather
describe('zod contract: GET /api/v1/farms/:farmId/weather', () => {
  const ZSCHEMA_FARM_ID = 'cf000000-0000-0000-0000-000000000077';

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(makeOpenMeteoResponse()),
    }));
    vi.mocked(dynamoRepo.getFarm).mockResolvedValue({ ...farmSeed, id: ZSCHEMA_FARM_ID });
    vi.mocked(dynamoRepo.getBedsForFarm).mockResolvedValue([]);
  });

  it('response parses against WeatherResponseSchema', async () => {
    const res = await app.request(`/api/v1/farms/${ZSCHEMA_FARM_ID}/weather`, { headers: authHeaders() });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(() => WeatherResponseSchema.parse(body)).not.toThrow();
  });
});

// 11 ── POST /api/v1/chat
describe('zod contract: POST /api/v1/chat', () => {
  beforeEach(() => {
    // Use SDK mock so the chat route doesn't hit the real Anthropic API.
    process.env['LLM_API_KEY'] = 'test-key';
    contractsMockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'Plant tomatoes!\nSUGGESTIONS: ["When to water?", "Best fertiliser?"]' }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 100, output_tokens: 40 },
    });
  });

  afterEach(() => {
    delete process.env['LLM_API_KEY'];
    contractsMockCreate.mockReset();
  });

  it('response parses against ChatResponseSchema', async () => {
    const res = await app.request('/api/v1/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ message: 'What should I plant?' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(() => ChatResponseSchema.parse(body)).not.toThrow();
  });
});

// 12 ── GET /api/v1/usage
import { getUsage } from '../services/budget';

describe('zod contract: GET /api/v1/usage', () => {
  it('response parses against UsageResponseSchema', async () => {
    vi.mocked(getUsage).mockResolvedValue({
      user_id: TEST_USER_ID,
      period: 'daily',
      period_start: '2026-03-20T00:00:00.000Z',
      reset_at: '2026-03-21T00:00:00.000Z',
      user_budget: {
        input_tokens_used: 100,
        input_tokens_limit: 50000,
        output_tokens_used: 50,
        output_tokens_limit: 10000,
        messages_sent: 1,
        messages_limit: 20,
      },
      global_budget: {
        input_tokens_used: 5000,
        input_tokens_limit: 500000,
        output_tokens_used: 1000,
        output_tokens_limit: 100000,
        utilization_pct: 1,
      },
    });

    const res = await app.request('/api/v1/usage', { headers: authHeaders() });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(() => UsageResponseSchema.parse(body)).not.toThrow();
  });
});

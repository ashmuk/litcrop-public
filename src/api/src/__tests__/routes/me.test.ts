import { TEST_USER_ID, authHeaders } from '../helpers/auth';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import app from '../../app';
import { dynamoRepo } from '../../services/dynamodb';

vi.mock('../../services/dynamodb', () => ({
  dynamoRepo: {
    getUserProfile: vi.fn(),
    upsertUserProfile: vi.fn(),
    getUserSettings: vi.fn(),
    upsertUserSettings: vi.fn(),
    getMyJoinRequests: vi.fn(),
  },
  DEFAULT_SETTINGS: { locale: 'en', temp_unit: 'C', theme: 'system' },
}));

const mockRepo = vi.mocked(dynamoRepo);

const settingsFixture = {
  locale: 'en' as const,
  temp_unit: 'C' as const,
  theme: 'system' as const,
  updated_at: '2026-03-27T00:00:00.000Z',
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/v1/me/settings', () => {
  it('returns saved settings', async () => {
    mockRepo.getUserSettings.mockResolvedValue(settingsFixture);
    const res = await app.request('/api/v1/me/settings', { headers: authHeaders() });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.locale).toBe('en');
    expect(body.theme).toBe('system');
  });

  it('returns defaults when no settings exist', async () => {
    mockRepo.getUserSettings.mockResolvedValue(null);
    const res = await app.request('/api/v1/me/settings', { headers: authHeaders() });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ locale: 'en', temp_unit: 'C', theme: 'system', updated_at: '' });
  });
});

describe('PATCH /api/v1/me/settings', () => {
  it.each([
    ['theme', 'earthy'],
    ['locale', 'ja'],
    ['temp_unit', 'F'],
  ] as const)('updates %s only', async (field, value) => {
    mockRepo.upsertUserSettings.mockResolvedValue({ ...settingsFixture, [field]: value });
    const res = await app.request('/api/v1/me/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ [field]: value }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body[field]).toBe(value);
    expect(mockRepo.upsertUserSettings).toHaveBeenCalledWith(TEST_USER_ID, { [field]: value });
  });

  it('updates multiple fields at once', async () => {
    mockRepo.upsertUserSettings.mockResolvedValue({ ...settingsFixture, theme: 'dark', locale: 'ja' });
    const res = await app.request('/api/v1/me/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ theme: 'dark', locale: 'ja' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.theme).toBe('dark');
    expect(body.locale).toBe('ja');
    expect(mockRepo.upsertUserSettings).toHaveBeenCalledWith(TEST_USER_ID, { theme: 'dark', locale: 'ja' });
  });

  it('returns 500 when upsert fails', async () => {
    mockRepo.upsertUserSettings.mockRejectedValue(new Error('DynamoDB error'));
    const res = await app.request('/api/v1/me/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ theme: 'earthy' }),
    });
    expect(res.status).toBe(500);
  });

  it('rejects empty body', async () => {
    const res = await app.request('/api/v1/me/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it('rejects invalid theme value', async () => {
    const res = await app.request('/api/v1/me/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ theme: 'neon' }),
    });
    expect(res.status).toBe(400);
  });
});

import { TEST_USER_ID, authHeaders, makeAuthHeaders } from '../helpers/auth';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Set ADMIN_EMAILS before auth module loads (isAdmin derived from ADMIN_EMAILS)
const ADMIN_EMAIL = 'admin@litcrop.test';
const ADMIN_USER_ID = 'admin-cognito-sub-001';
vi.hoisted(() => {
  process.env['ADMIN_EMAILS'] = 'admin@litcrop.test';
});

import app from '../../app';
import { dynamoRepo } from '../../services/dynamodb';

vi.mock('../../services/dynamodb', () => ({
  dynamoRepo: {
    getUserProfile: vi.fn(),
    upsertUserProfile: vi.fn(),
    getUserSettings: vi.fn(),
    upsertUserSettings: vi.fn(),
    getMyJoinRequests: vi.fn(),
    deleteAccount: vi.fn(),
    getNotificationPrefs: vi.fn(),
    upsertNotificationPrefs: vi.fn(),
  },
  DEFAULT_SETTINGS: { locale: 'en', temp_unit: 'C', theme: 'earthy' },
}));

vi.mock('../../services/s3', () => ({
  uploadAvatar: vi.fn().mockResolvedValue({ originalKey: 'images/avatars/test/original.jpg', thumbKey: 'images/avatars/test/thumb.jpg' }),
  deleteAvatar: vi.fn().mockResolvedValue(undefined),
  getSignedAvatarUrls: vi.fn().mockImplementation((origKey?: string, thumbKey?: string) =>
    Promise.resolve({
      url: origKey ? 'https://signed-original' : null,
      thumbUrl: thumbKey ? 'https://signed-thumb' : null,
    }),
  ),
}));

vi.mock('sharp', () => ({
  default: vi.fn(() => ({
    resize: vi.fn().mockReturnThis(),
    jpeg: vi.fn().mockReturnThis(),
    toBuffer: vi.fn().mockResolvedValue(Buffer.from([0xFF, 0xD8, 0xFF])),
  })),
}));

const mockRepo = vi.mocked(dynamoRepo);

const adminHeaders = () => makeAuthHeaders(ADMIN_USER_ID, ADMIN_EMAIL);

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
    expect(body).toEqual({ locale: 'en', temp_unit: 'C', theme: 'earthy', updated_at: '' });
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

  it('syncs all registration preferences in one call (locale + temp_unit + theme)', async () => {
    const synced = { ...settingsFixture, locale: 'ja' as const, temp_unit: 'F' as const, theme: 'earthy' as const };
    mockRepo.upsertUserSettings.mockResolvedValue(synced);
    const res = await app.request('/api/v1/me/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ locale: 'ja', temp_unit: 'F', theme: 'earthy' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.locale).toBe('ja');
    expect(body.temp_unit).toBe('F');
    expect(body.theme).toBe('earthy');
    expect(mockRepo.upsertUserSettings).toHaveBeenCalledWith(
      TEST_USER_ID,
      { locale: 'ja', temp_unit: 'F', theme: 'earthy' },
    );
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

describe('DELETE /api/v1/me', () => {
  const summaryFixture = {
    farms_deleted: ['farm-aaa'],
    farms_left: ['farm-bbb'],
    farms_transferred: [{ farm_id: 'farm-ccc', new_admin: 'user-ddd' }],
    join_requests_deleted: 1,
    profile_deleted: true,
    settings_deleted: true,
  };

  it('returns 200 with summary on success', async () => {
    mockRepo.getUserProfile.mockResolvedValue(null);
    mockRepo.deleteAccount.mockResolvedValue(summaryFixture);
    const res = await app.request('/api/v1/me', {
      method: 'DELETE',
      headers: authHeaders(),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { deleted: boolean; summary: typeof summaryFixture };
    expect(body.deleted).toBe(true);
    expect(body.summary.farms_deleted).toContain('farm-aaa');
    expect(body.summary.farms_transferred[0].new_admin).toBe('user-ddd');
    expect(mockRepo.deleteAccount).toHaveBeenCalledWith(TEST_USER_ID);
  });

  it('returns 500 when deleteAccount throws', async () => {
    mockRepo.getUserProfile.mockResolvedValue(null);
    mockRepo.deleteAccount.mockRejectedValue(new Error('DynamoDB error'));
    const res = await app.request('/api/v1/me', {
      method: 'DELETE',
      headers: authHeaders(),
    });
    expect(res.status).toBe(500);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/Account deletion failed/);
  });

  it('returns 401 without auth token', async () => {
    const res = await app.request('/api/v1/me', { method: 'DELETE' });
    expect(res.status).toBe(401);
  });
});

// ── Notification preferences ──────────────────────────────────────

describe('GET /api/v1/me/notification-preferences', () => {
  it('returns 403 for non-admin', async () => {
    const res = await app.request('/api/v1/me/notification-preferences', {
      headers: authHeaders(),
    });
    expect(res.status).toBe(403);
  });

  it('returns defaults when no prefs stored (admin)', async () => {
    mockRepo.getNotificationPrefs.mockResolvedValue(null);
    const res = await app.request('/api/v1/me/notification-preferences', {
      headers: adminHeaders(),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { prefs: Record<string, boolean>; updated_at: string };
    expect(body.prefs['user.signup']).toBe(true);
    expect(body.prefs['farm.created']).toBe(true);
    expect(body.prefs['account.deleted']).toBe(true);
    expect(body.updated_at).toBe('');
  });

  it('returns stored prefs (admin)', async () => {
    const storedPrefs = {
      prefs: {
        'user.signup': true,
        'farm.created': false,
        'farm.deleted': true,
        'join_request.submitted': true,
        'join_request.approved': false,
        'join_request.rejected': false,
        'account.deleted': true,
      },
      updated_at: '2026-04-01T10:00:00.000Z',
    };
    mockRepo.getNotificationPrefs.mockResolvedValue(storedPrefs);
    const res = await app.request('/api/v1/me/notification-preferences', {
      headers: adminHeaders(),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { prefs: Record<string, boolean>; updated_at: string };
    expect(body.prefs['farm.created']).toBe(false);
    expect(body.prefs['join_request.approved']).toBe(false);
    expect(body.updated_at).toBe('2026-04-01T10:00:00.000Z');
  });
});

describe('PATCH /api/v1/me/notification-preferences', () => {
  it('returns 403 for non-admin', async () => {
    const res = await app.request('/api/v1/me/notification-preferences', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ prefs: { 'farm.created': false } }),
    });
    expect(res.status).toBe(403);
  });

  it('partial update merges with existing prefs (admin)', async () => {
    const existing = {
      prefs: {
        'user.signup': true,
        'farm.created': true,
        'farm.deleted': true,
        'join_request.submitted': true,
        'join_request.approved': true,
        'join_request.rejected': true,
        'account.deleted': true,
      },
      updated_at: '2026-04-01T09:00:00.000Z',
    };
    const updated = {
      prefs: { ...existing.prefs, 'farm.created': false, 'join_request.approved': false },
      updated_at: '2026-04-01T10:00:00.000Z',
    };
    mockRepo.getNotificationPrefs.mockResolvedValue(existing);
    mockRepo.upsertNotificationPrefs.mockResolvedValue(updated);

    const res = await app.request('/api/v1/me/notification-preferences', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...adminHeaders() },
      body: JSON.stringify({ prefs: { 'farm.created': false, 'join_request.approved': false } }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { prefs: Record<string, boolean>; updated_at: string };
    expect(body.prefs['farm.created']).toBe(false);
    expect(body.prefs['join_request.approved']).toBe(false);
    // Other keys are preserved
    expect(body.prefs['user.signup']).toBe(true);
    expect(mockRepo.upsertNotificationPrefs).toHaveBeenCalledWith(
      ADMIN_USER_ID,
      expect.objectContaining({ 'farm.created': false, 'join_request.approved': false }),
    );
  });

  it('rejects unknown event type key (400)', async () => {
    const res = await app.request('/api/v1/me/notification-preferences', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...adminHeaders() },
      body: JSON.stringify({ prefs: { 'unknown.event': true } }),
    });
    expect(res.status).toBe(400);
  });

  it('rejects non-boolean value (400)', async () => {
    const res = await app.request('/api/v1/me/notification-preferences', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...adminHeaders() },
      body: JSON.stringify({ prefs: { 'farm.created': 'yes' } }),
    });
    expect(res.status).toBe(400);
  });

  it('rejects missing prefs field (400)', async () => {
    const res = await app.request('/api/v1/me/notification-preferences', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...adminHeaders() },
      body: JSON.stringify({ notPrefs: {} }),
    });
    expect(res.status).toBe(400);
  });
});

// ── T-B5-21: Profile avatar URLs ────────────────────────────────

describe('GET /api/v1/me/profile (avatar URLs)', () => {
  it('returns signed avatar URLs when profile has picture keys', async () => {
    mockRepo.getUserProfile.mockResolvedValue({
      user_id: TEST_USER_ID,
      display_name: 'Test User',
      preferred_role: 'owner' as const,
      created_at: '2026-04-01T00:00:00Z',
      profile_picture_key: 'images/avatars/test/original.jpg',
      profile_picture_thumb_key: 'images/avatars/test/thumb.jpg',
    });
    const res = await app.request('/api/v1/me/profile', { headers: authHeaders() });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.profile_picture_url).toBe('https://signed-original');
    expect(body.profile_picture_thumb_url).toBe('https://signed-thumb');
    // Raw S3 keys should NOT be in response
    expect(body.profile_picture_key).toBeUndefined();
    expect(body.profile_picture_thumb_key).toBeUndefined();
  });

  it('returns null avatar URLs when no profile picture', async () => {
    mockRepo.getUserProfile.mockResolvedValue({
      user_id: TEST_USER_ID,
      display_name: 'Test User',
      preferred_role: 'owner' as const,
      created_at: '2026-04-01T00:00:00Z',
    });
    const res = await app.request('/api/v1/me/profile', { headers: authHeaders() });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.profile_picture_url).toBeNull();
    expect(body.profile_picture_thumb_url).toBeNull();
  });

  it('excludes internal email field from GET /profile response (#391)', async () => {
    mockRepo.getUserProfile.mockResolvedValue({
      user_id: TEST_USER_ID,
      display_name: 'Test User',
      email: 'test@example.com',
      preferred_role: 'owner' as const,
      created_at: '2026-04-01T00:00:00Z',
    });
    const res = await app.request('/api/v1/me/profile', { headers: authHeaders() });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.email).toBeUndefined();
    expect(body.display_name).toBe('Test User');
  });
});

describe('PATCH /api/v1/me/profile — email sync (#391)', () => {
  it('syncs JWT email to DynamoDB profile on update', async () => {
    mockRepo.getUserProfile.mockResolvedValue({
      user_id: TEST_USER_ID,
      display_name: 'Old Name',
      preferred_role: 'staff' as const,
      created_at: '2026-01-01T00:00:00Z',
    });
    mockRepo.upsertUserProfile.mockResolvedValue({
      user_id: TEST_USER_ID,
      display_name: 'New Name',
      email: 'test@example.com',
      preferred_role: 'staff' as const,
      created_at: '2026-01-01T00:00:00Z',
    });

    const res = await app.request('/api/v1/me/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ display_name: 'New Name' }),
    });
    expect(res.status).toBe(200);

    // Verify upsertUserProfile was called with email from JWT (default test email)
    expect(mockRepo.upsertUserProfile).toHaveBeenCalledWith(TEST_USER_ID, {
      display_name: 'New Name',
      email: 'test@example.com',
    });
  });

  it('excludes email from PATCH /profile response body (#391)', async () => {
    mockRepo.getUserProfile.mockResolvedValue({
      user_id: TEST_USER_ID,
      display_name: 'Existing',
      preferred_role: 'staff' as const,
      created_at: '2026-01-01T00:00:00Z',
    });
    mockRepo.upsertUserProfile.mockResolvedValue({
      user_id: TEST_USER_ID,
      display_name: 'Updated',
      email: 'test@example.com',
      preferred_role: 'staff' as const,
      created_at: '2026-01-01T00:00:00Z',
    });

    const res = await app.request('/api/v1/me/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ display_name: 'Updated' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.email).toBeUndefined();
    expect(body.display_name).toBe('Updated');
  });
});

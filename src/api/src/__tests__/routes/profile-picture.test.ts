import { TEST_USER_ID, authHeaders } from '../helpers/auth';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.hoisted(() => {
  process.env['AWS_REGION'] = 'ap-northeast-1';
  process.env['S3_IMAGES_BUCKET'] = 'test-images-bucket';
});

import app from '../../app';
import { dynamoRepo } from '../../services/dynamodb';
import * as s3Service from '../../services/s3';

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
  uploadAvatar: vi.fn(),
  deleteAvatar: vi.fn(),
  getSignedAvatarUrls: vi.fn(),
}));

vi.mock('sharp', () => ({
  default: vi.fn(() => ({
    resize: vi.fn().mockReturnThis(),
    jpeg: vi.fn().mockReturnThis(),
    toBuffer: vi.fn().mockResolvedValue(Buffer.from([0xFF, 0xD8, 0xFF])),
  })),
}));

const mockRepo = vi.mocked(dynamoRepo);
const mockUploadAvatar = vi.mocked(s3Service.uploadAvatar);
const mockDeleteAvatar = vi.mocked(s3Service.deleteAvatar);
const mockGetSignedAvatarUrls = vi.mocked(s3Service.getSignedAvatarUrls);

// Minimal valid magic bytes
const JPEG_BYTES = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00]);
const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
const INVALID_BYTES = new Uint8Array([0x00, 0x01, 0x02, 0x03]);

const SIGNED_URLS = {
  url: 'https://s3.example.com/avatars/test-user/original.jpg?sig=abc',
  thumbUrl: 'https://s3.example.com/avatars/test-user/thumb.jpg?sig=xyz',
};

const AVATAR_KEYS = {
  originalKey: `avatars/${TEST_USER_ID}/original.jpg`,
  thumbKey: `avatars/${TEST_USER_ID}/thumb.jpg`,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockUploadAvatar.mockResolvedValue(AVATAR_KEYS);
  mockGetSignedAvatarUrls.mockResolvedValue(SIGNED_URLS);
  mockRepo.upsertUserProfile.mockResolvedValue(undefined as never);
  mockDeleteAvatar.mockResolvedValue(undefined);
});

// ── POST /api/v1/me/profile-picture ──────────────────────────────

describe('POST /api/v1/me/profile-picture', () => {
  it('returns 201 with signed URLs when uploading a valid JPEG', async () => {
    const formData = new FormData();
    const blob = new Blob([JPEG_BYTES], { type: 'image/jpeg' });
    formData.append('image', blob, 'photo.jpg');

    const res = await app.request('/api/v1/me/profile-picture', {
      method: 'POST',
      headers: authHeaders(),
      body: formData,
    });

    expect(res.status).toBe(201);
    const body = await res.json() as { profile_picture_url: string; profile_picture_thumb_url: string };
    expect(body.profile_picture_url).toBe(SIGNED_URLS.url);
    expect(body.profile_picture_thumb_url).toBe(SIGNED_URLS.thumbUrl);
  });

  it('returns 201 when uploading a valid PNG', async () => {
    const formData = new FormData();
    const blob = new Blob([PNG_BYTES], { type: 'image/png' });
    formData.append('image', blob, 'photo.png');

    const res = await app.request('/api/v1/me/profile-picture', {
      method: 'POST',
      headers: authHeaders(),
      body: formData,
    });

    expect(res.status).toBe(201);
  });

  it('returns 413 when the file exceeds 1MB', async () => {
    const largeBuffer = new Uint8Array(1024 * 1024 + 1).fill(0xFF);
    // Set JPEG magic bytes so it passes format check if size check were skipped
    largeBuffer[0] = 0xFF;
    largeBuffer[1] = 0xD8;
    largeBuffer[2] = 0xFF;

    const formData = new FormData();
    const blob = new Blob([largeBuffer], { type: 'image/jpeg' });
    formData.append('image', blob, 'large.jpg');

    const res = await app.request('/api/v1/me/profile-picture', {
      method: 'POST',
      headers: authHeaders(),
      body: formData,
    });

    expect(res.status).toBe(413);
  });

  it('returns 400 when the file has invalid magic bytes (not JPEG or PNG)', async () => {
    const formData = new FormData();
    const blob = new Blob([INVALID_BYTES], { type: 'application/octet-stream' });
    formData.append('image', blob, 'file.bin');

    const res = await app.request('/api/v1/me/profile-picture', {
      method: 'POST',
      headers: authHeaders(),
      body: formData,
    });

    expect(res.status).toBe(400);
  });

  it('returns 400 when the image field is missing', async () => {
    const formData = new FormData();
    formData.append('other', 'value');

    const res = await app.request('/api/v1/me/profile-picture', {
      method: 'POST',
      headers: authHeaders(),
      body: formData,
    });

    expect(res.status).toBe(400);
  });

  it('calls upsertUserProfile with the picture keys after upload', async () => {
    const formData = new FormData();
    const blob = new Blob([JPEG_BYTES], { type: 'image/jpeg' });
    formData.append('image', blob, 'photo.jpg');

    await app.request('/api/v1/me/profile-picture', {
      method: 'POST',
      headers: authHeaders(),
      body: formData,
    });

    expect(mockRepo.upsertUserProfile).toHaveBeenCalledWith(
      TEST_USER_ID,
      expect.objectContaining({
        profile_picture_key: AVATAR_KEYS.originalKey,
        profile_picture_thumb_key: AVATAR_KEYS.thumbKey,
      }),
    );
  });

  it('calls uploadAvatar with the correct userId and content type', async () => {
    const formData = new FormData();
    const blob = new Blob([JPEG_BYTES], { type: 'image/jpeg' });
    formData.append('image', blob, 'photo.jpg');

    await app.request('/api/v1/me/profile-picture', {
      method: 'POST',
      headers: authHeaders(),
      body: formData,
    });

    expect(mockUploadAvatar).toHaveBeenCalledWith(
      TEST_USER_ID,
      expect.any(Uint8Array),
      expect.any(Uint8Array),
      'image/jpeg',
    );
  });
});

// ── DELETE /api/v1/me/profile-picture ────────────────────────────

describe('DELETE /api/v1/me/profile-picture', () => {
  it('returns 200 with { deleted: true }', async () => {
    const res = await app.request('/api/v1/me/profile-picture', {
      method: 'DELETE',
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const body = await res.json() as { deleted: boolean };
    expect(body.deleted).toBe(true);
  });

  it('calls deleteAvatar with the authenticated userId', async () => {
    await app.request('/api/v1/me/profile-picture', {
      method: 'DELETE',
      headers: authHeaders(),
    });

    expect(mockDeleteAvatar).toHaveBeenCalledWith(TEST_USER_ID);
  });

  it('calls upsertUserProfile to clear the picture keys', async () => {
    await app.request('/api/v1/me/profile-picture', {
      method: 'DELETE',
      headers: authHeaders(),
    });

    expect(mockRepo.upsertUserProfile).toHaveBeenCalledWith(
      TEST_USER_ID,
      expect.objectContaining({
        profile_picture_key: undefined,
        profile_picture_thumb_key: undefined,
      }),
    );
  });
});

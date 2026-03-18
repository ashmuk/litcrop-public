import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { buildStorageKey, uploadImage, getSignedImageUrl, deleteImage } from '../../services/s3';

// Mock getSignedUrl before importing s3 (hoisted by vitest)
vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn().mockResolvedValue('https://s3.example.com/signed?expires=900'),
}));

const s3Mock = mockClient(S3Client);

beforeEach(() => {
  s3Mock.reset();
});

// ── buildStorageKey (pure function) ──────────────────────────────

describe('buildStorageKey', () => {
  it('produces the correct path format', () => {
    const key = buildStorageKey('farm-001', 'plot-a1', 'img-001', '2026-03-17T10:30:00.000Z');
    expect(key).toBe('images/farm-001/plot-a1/2026/03/17/img-001.jpg');
  });

  it('zero-pads month to 2 digits (January = 01)', () => {
    const key = buildStorageKey('f', 'p', 'i', '2026-01-05T00:00:00.000Z');
    expect(key).toMatch(/\/2026\/01\/05\//);
  });

  it('uses UTC date (not local date)', () => {
    // 2026-03-17T23:30:00.000Z — UTC date is 17, not 18
    const key = buildStorageKey('f', 'p', 'i', '2026-03-17T23:30:00.000Z');
    expect(key).toContain('/2026/03/17/');
  });

  it('always appends .jpg extension', () => {
    const key = buildStorageKey('f', 'p', 'img-xyz', '2026-06-15T12:00:00.000Z');
    expect(key).toMatch(/img-xyz\.jpg$/);
  });

  it('is deterministic (same input = same output)', () => {
    const args = ['farm-001', 'plot-001', 'img-001', '2026-03-17T00:00:00.000Z'] as const;
    expect(buildStorageKey(...args)).toBe(buildStorageKey(...args));
  });
});

// ── uploadImage (mocked S3) ──────────────────────────────────────

describe('uploadImage', () => {
  it('calls PutObjectCommand with correct bucket and key', async () => {
    s3Mock.on(PutObjectCommand).resolves({});

    const storageKey = await uploadImage(
      'farm-001',
      'plot-a1',
      'img-001',
      '2026-03-17T10:00:00.000Z',
      new Uint8Array([0xff, 0xd8, 0xff]),
      'image/jpeg',
    );

    const calls = s3Mock.commandCalls(PutObjectCommand);
    expect(calls).toHaveLength(1);
    const input = calls[0].args[0].input;
    expect(input.Key).toBe('images/farm-001/plot-a1/2026/03/17/img-001.jpg');
    expect(input.ContentType).toBe('image/jpeg');
    expect(storageKey).toBe('images/farm-001/plot-a1/2026/03/17/img-001.jpg');
  });

  it('returned storageKey matches buildStorageKey output', async () => {
    s3Mock.on(PutObjectCommand).resolves({});
    const returned = await uploadImage('f', 'p', 'i', '2026-06-01T00:00:00.000Z', new Uint8Array(), 'image/jpeg');
    expect(returned).toBe(buildStorageKey('f', 'p', 'i', '2026-06-01T00:00:00.000Z'));
  });
});

// ── getSignedImageUrl ─────────────────────────────────────────────

describe('getSignedImageUrl', () => {
  it('returns a URL string', async () => {
    const url = await getSignedImageUrl('images/farm-001/plot-a1/2026/03/17/img-001.jpg');
    expect(typeof url).toBe('string');
    expect(url).toMatch(/^https?:\/\//);
  });
});

// ── deleteImage (mocked S3) ──────────────────────────────────────

describe('deleteImage', () => {
  it('calls DeleteObjectCommand', async () => {
    s3Mock.on(DeleteObjectCommand).resolves({});
    await deleteImage('images/farm-001/plot-a1/2026/03/17/img-001.jpg');
    expect(s3Mock.commandCalls(DeleteObjectCommand)).toHaveLength(1);
  });
});

/**
 * Contract tests — Beta-5 Zod schema validation
 * Verifies device and profile picture response shapes match their schemas.
 */

import { describe, it, expect } from 'vitest';
import {
  DeviceListResponseSchema,
  DeviceRegistrationResponseSchema,
  DeviceConfigResponseSchema,
  ProfilePictureResponseSchema,
  DeviceHeartbeatRequestSchema,
  RegisterDeviceRequestSchema,
  UpdateDeviceRequestSchema,
} from '@litcrop/shared';

describe('Beta-5 Contract Tests', () => {
  describe('DeviceListResponseSchema', () => {
    it('validates a valid device list response', () => {
      const data = {
        devices: [{
          device_id: 'dev-abc12345',
          farm_id: 'farm-001',
          bed_id: 'bed-a1',
          bed_name: 'A1 — Cherry Tomato',
          node_name: 'Kitchen Cam',
          status: 'online',
          capture_interval: 1800,
          resolution: '1920x1080',
          jpeg_quality: 85,
          active_window: { start: '05:00', end: '20:00' },
          trigger_type: 'scheduled',
          last_seen_at: '2026-04-02T10:00:00Z',
          battery_level: 85,
          wifi_signal_dbm: -42,
          storage_status: 'ok',
          capabilities: { resolutions: ['1920x1080'], has_battery_sensor: true, has_pir_sensor: false },
          created_at: '2026-04-01T00:00:00Z',
          updated_at: '2026-04-02T10:00:00Z',
        }],
      };
      expect(DeviceListResponseSchema.safeParse(data).success).toBe(true);
    });
  });

  describe('DeviceRegistrationResponseSchema', () => {
    it('validates a valid registration response', () => {
      const data = {
        device_id: 'dev-abc12345',
        node_name: 'Kitchen Cam',
        bed_id: 'bed-a1',
        device_api_key: 'dk_abcdef1234567890abcdef1234567890abcdef12345678',
        config_poll_url: 'https://api.example.com/api/v1/devices/dev-abc12345/config',
        created_at: '2026-04-01T00:00:00Z',
      };
      expect(DeviceRegistrationResponseSchema.safeParse(data).success).toBe(true);
    });
  });

  describe('DeviceConfigResponseSchema', () => {
    it('validates a valid config poll response', () => {
      const data = {
        capture_interval: 1800,
        resolution: '1920x1080',
        jpeg_quality: 85,
        active_window: { start: '05:00', end: '20:00' },
        trigger_type: 'scheduled',
        bed_id: 'bed-a1',
        upload_url: '/api/v1/beds/bed-a1/images',
        test_shot_requested: false,
      };
      expect(DeviceConfigResponseSchema.safeParse(data).success).toBe(true);
    });

    // T-395-04: the three Phase-0 round-trip fields must be required, not
    // optional. If any becomes optional the Pi falls back silently.
    it('rejects payload missing resolution (#395)', () => {
      const data = {
        capture_interval: 1800,
        jpeg_quality: 85,
        active_window: { start: '05:00', end: '20:00' },
        trigger_type: 'scheduled',
        bed_id: 'bed-a1',
        upload_url: '/api/v1/beds/bed-a1/images',
        test_shot_requested: false,
      };
      expect(DeviceConfigResponseSchema.safeParse(data).success).toBe(false);
    });

    it('rejects payload missing active_window (#395)', () => {
      const data = {
        capture_interval: 1800,
        resolution: '1920x1080',
        jpeg_quality: 85,
        trigger_type: 'scheduled',
        bed_id: 'bed-a1',
        upload_url: '/api/v1/beds/bed-a1/images',
        test_shot_requested: false,
      };
      expect(DeviceConfigResponseSchema.safeParse(data).success).toBe(false);
    });

    it('rejects payload missing capture_interval (#395)', () => {
      const data = {
        resolution: '1920x1080',
        jpeg_quality: 85,
        active_window: { start: '05:00', end: '20:00' },
        trigger_type: 'scheduled',
        bed_id: 'bed-a1',
        upload_url: '/api/v1/beds/bed-a1/images',
        test_shot_requested: false,
      };
      expect(DeviceConfigResponseSchema.safeParse(data).success).toBe(false);
    });
  });

  describe('ProfilePictureResponseSchema', () => {
    it('validates a valid profile picture response', () => {
      const data = {
        profile_picture_url: 'https://signed-url-original',
        profile_picture_thumb_url: 'https://signed-url-thumb',
      };
      expect(ProfilePictureResponseSchema.safeParse(data).success).toBe(true);
    });
  });

  describe('Request schema validation', () => {
    it('DeviceHeartbeatRequestSchema accepts valid heartbeat', () => {
      const data = { battery_level: 85, wifi_signal_dbm: -42, storage_status: 'ok' };
      expect(DeviceHeartbeatRequestSchema.safeParse(data).success).toBe(true);
    });

    it('DeviceHeartbeatRequestSchema accepts null wifi_signal_dbm (#337)', () => {
      // capture.sh sends null when iwconfig is unavailable or returns non-numeric
      const data = { battery_level: 85, wifi_signal_dbm: null, storage_status: 'ok' };
      expect(DeviceHeartbeatRequestSchema.safeParse(data).success).toBe(true);
    });

    it('DeviceHeartbeatRequestSchema accepts null battery_level (#337)', () => {
      // Devices without a battery HAT report null battery_level
      const data = { battery_level: null, wifi_signal_dbm: -42, storage_status: 'ok' };
      expect(DeviceHeartbeatRequestSchema.safeParse(data).success).toBe(true);
    });

    it('DeviceHeartbeatRequestSchema accepts capabilities payload (#337)', () => {
      const data = {
        battery_level: null,
        wifi_signal_dbm: null,
        storage_status: 'ok',
        capabilities: {
          has_battery_sensor: false,
          has_pir_sensor: false,
          resolutions: ['1920x1080', '1280x720'],
        },
      };
      expect(DeviceHeartbeatRequestSchema.safeParse(data).success).toBe(true);
    });

    it('RegisterDeviceRequestSchema accepts valid registration', () => {
      const data = { node_name: 'Test Cam', bed_id: 'bed-a1' };
      expect(RegisterDeviceRequestSchema.safeParse(data).success).toBe(true);
    });

    it('UpdateDeviceRequestSchema accepts partial update', () => {
      const data = { capture_interval: 900 };
      expect(UpdateDeviceRequestSchema.safeParse(data).success).toBe(true);
    });

    it('ActiveWindow rejects invalid time format', () => {
      const data = { active_window: { start: 'noon', end: '20:00' } };
      const result = UpdateDeviceRequestSchema.safeParse(data);
      expect(result.success).toBe(false);
    });
  });
});

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

    // T-395-04 remediation: the previous /^\d{2}:\d{2}$/ regex accepted
    // out-of-range values like "25:99". A bad end value silently extends
    // the active window on-Pi via lexicographic string compare.
    it('ActiveWindow rejects out-of-range hour 25:99 (#395)', () => {
      const data = { active_window: { start: '05:00', end: '25:99' } };
      expect(UpdateDeviceRequestSchema.safeParse(data).success).toBe(false);
    });

    it('ActiveWindow rejects out-of-range minute 12:60 (#395)', () => {
      const data = { active_window: { start: '12:60', end: '20:00' } };
      expect(UpdateDeviceRequestSchema.safeParse(data).success).toBe(false);
    });

    it('ActiveWindow accepts boundary 00:00 and 23:59 (#395)', () => {
      const data = { active_window: { start: '00:00', end: '23:59' } };
      expect(UpdateDeviceRequestSchema.safeParse(data).success).toBe(true);
    });

    // #406: effective_config — Pi echoes its runtime config in heartbeat.
    // All fields optional so a pre-#406 Pi (no effective_config block at
    // all) still passes the schema, and a booting Pi with partial state
    // can report what it has.
    it('heartbeat accepts a full effective_config block (#406)', () => {
      const data = {
        battery_level: 80,
        effective_config: {
          resolution: '1280x720',
          jpeg_quality: 85,
          capture_interval: 1800,
          active_window: { start: '05:00', end: '20:00' },
        },
      };
      expect(DeviceHeartbeatRequestSchema.safeParse(data).success).toBe(true);
    });

    it('heartbeat accepts a partial effective_config (mid-boot state) (#406)', () => {
      const data = {
        effective_config: { resolution: '1920x1080' },
      };
      expect(DeviceHeartbeatRequestSchema.safeParse(data).success).toBe(true);
    });

    it('heartbeat accepts effective_config with null capture_interval (#406)', () => {
      // Pi sends null when INTERVAL_SECONDS is unset — advisory field
      // under systemd per DESIGNS-395 §2.3.1.
      const data = {
        effective_config: { resolution: '1280x720', capture_interval: null },
      };
      expect(DeviceHeartbeatRequestSchema.safeParse(data).success).toBe(true);
    });

    it('heartbeat rejects effective_config with malformed active_window (#406)', () => {
      // Defense-in-depth — same regex tightening as the saved-config path.
      const data = {
        effective_config: { active_window: { start: '05:00', end: '25:99' } },
      };
      expect(DeviceHeartbeatRequestSchema.safeParse(data).success).toBe(false);
    });

    // Resolution bounds were added during cc-review remediation to prevent
    // a compromised or buggy Pi from persisting arbitrary strings into the
    // DynamoDB device record. Regex enforces WIDTHxHEIGHT shape, max 5 digits
    // each — roomy enough for future displays but not for log injection.
    it('heartbeat rejects effective_config with oversized resolution (#406 remediation)', () => {
      const data = {
        effective_config: { resolution: 'A'.repeat(4000) },
      };
      expect(DeviceHeartbeatRequestSchema.safeParse(data).success).toBe(false);
    });

    it('heartbeat rejects effective_config with non-pattern resolution (#406 remediation)', () => {
      const data = {
        effective_config: { resolution: '1920X1080' },  // capital X not allowed
      };
      expect(DeviceHeartbeatRequestSchema.safeParse(data).success).toBe(false);
    });

    it('heartbeat accepts effective_config with well-formed resolution (#406 remediation)', () => {
      const data = {
        effective_config: { resolution: '1920x1080' },
      };
      expect(DeviceHeartbeatRequestSchema.safeParse(data).success).toBe(true);
    });

    it('heartbeat without effective_config is still valid (backward compat) (#406)', () => {
      // Pre-#406 Pi: payload has no effective_config key at all.
      const data = { battery_level: 80, storage_status: 'ok' };
      expect(DeviceHeartbeatRequestSchema.safeParse(data).success).toBe(true);
    });
  });
});

/**
 * device-config-status — unit tests (#406)
 */

import { describe, it, expect } from 'vitest';
import type { DeviceListItemResponse } from '../lib/api';
import { getConfigStatus } from '../lib/device-config-status';

function baseDevice(overrides: Partial<DeviceListItemResponse> = {}): DeviceListItemResponse {
  const base: DeviceListItemResponse = {
    device_id: 'dev-1',
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
    last_seen_at: '2026-04-15T10:00:00Z',
    battery_level: 80,
    wifi_signal_dbm: -50,
    storage_status: 'ok',
    capabilities: null,
    test_shot_requested: false,
    last_config_polled_at: '2026-04-15T10:00:00Z',
    effective_config: {
      resolution: '1920x1080',
      jpeg_quality: 85,
      active_window: { start: '05:00', end: '20:00' },
    },
    created_at: '2026-04-01T00:00:00Z',
    updated_at: '2026-04-15T09:00:00Z',
  };
  return { ...base, ...overrides };
}

describe('getConfigStatus', () => {
  it('returns unknown for offline devices', () => {
    expect(getConfigStatus(baseDevice({ status: 'offline' }))).toBe('unknown');
    expect(getConfigStatus(baseDevice({ status: 'inactive' }))).toBe('unknown');
  });

  it('returns pending when device has never polled', () => {
    expect(getConfigStatus(baseDevice({ last_config_polled_at: null }))).toBe('pending');
    expect(getConfigStatus(baseDevice({ last_config_polled_at: undefined }))).toBe('pending');
  });

  it('returns pending when no effective_config is present', () => {
    expect(getConfigStatus(baseDevice({ effective_config: null }))).toBe('pending');
    expect(getConfigStatus(baseDevice({ effective_config: undefined }))).toBe('pending');
  });

  it('returns applied when effective matches saved and poll is recent', () => {
    expect(getConfigStatus(baseDevice())).toBe('applied');
  });

  it('returns pending when saved config was updated AFTER last poll', () => {
    // Save at 10:05, Pi last polled at 10:00 → the new save hasn't propagated
    expect(getConfigStatus(baseDevice({
      updated_at: '2026-04-15T10:05:00Z',
      last_config_polled_at: '2026-04-15T10:00:00Z',
    }))).toBe('pending');
  });

  it('returns pending when effective resolution differs', () => {
    expect(getConfigStatus(baseDevice({
      effective_config: {
        resolution: '1280x720',
        jpeg_quality: 85,
        active_window: { start: '05:00', end: '20:00' },
      },
    }))).toBe('pending');
  });

  it('returns pending when effective jpeg_quality differs', () => {
    expect(getConfigStatus(baseDevice({
      effective_config: {
        resolution: '1920x1080',
        jpeg_quality: 75,
        active_window: { start: '05:00', end: '20:00' },
      },
    }))).toBe('pending');
  });

  it('returns pending when effective active_window differs', () => {
    expect(getConfigStatus(baseDevice({
      effective_config: {
        resolution: '1920x1080',
        jpeg_quality: 85,
        active_window: { start: '06:00', end: '18:00' },
      },
    }))).toBe('pending');
  });

  it('IGNORES capture_interval drift (advisory under systemd)', () => {
    // Saved capture_interval=1800, device reports 900 — still "applied"
    // because the timer cadence on-Pi is source of truth, not the saved value.
    expect(getConfigStatus(baseDevice({
      capture_interval: 1800,
      effective_config: {
        resolution: '1920x1080',
        jpeg_quality: 85,
        capture_interval: 900,
        active_window: { start: '05:00', end: '20:00' },
      },
    }))).toBe('applied');
  });

  it('returns pending when effective_config partial (missing active_window)', () => {
    // Mid-boot Pi — some fields not yet populated
    expect(getConfigStatus(baseDevice({
      effective_config: { resolution: '1920x1080', jpeg_quality: 85 },
    }))).toBe('pending');
  });
});

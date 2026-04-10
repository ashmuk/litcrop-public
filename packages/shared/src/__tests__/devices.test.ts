import { describe, it, expect } from 'vitest';
import { getDeviceClass } from '../devices';
import type { DeviceCapabilities } from '../types/domain';

function caps(has_battery_sensor: boolean, has_pir_sensor: boolean): DeviceCapabilities {
  return {
    resolutions: ['1920x1080', '1280x720'],
    has_battery_sensor,
    has_pir_sensor,
  };
}

describe('getDeviceClass', () => {
  it('returns 1 for basic camera (no sensors)', () => {
    expect(getDeviceClass(caps(false, false))).toBe(1);
  });

  it('returns 2 for battery-only (power-managed)', () => {
    expect(getDeviceClass(caps(true, false))).toBe(2);
  });

  it('returns 3 for full sensor suite (battery + PIR)', () => {
    expect(getDeviceClass(caps(true, true))).toBe(3);
  });

  it('returns 3 for PIR-only (PIR is the discriminator, promoted)', () => {
    // Edge case: PIR without battery is still Class 3 — PIR is the discriminator
    // See docs/REQUIREMENTS-337.md §11 #2
    expect(getDeviceClass(caps(false, true))).toBe(3);
  });

  it('returns "unknown" for null capabilities (no heartbeat yet)', () => {
    expect(getDeviceClass(null)).toBe('unknown');
  });

  it('returns "unknown" for undefined capabilities', () => {
    expect(getDeviceClass(undefined)).toBe('unknown');
  });
});

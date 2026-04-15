/**
 * #406: derive a config-propagation status from what the UI saved vs what
 * the Pi is actually running (echoed in heartbeat.effective_config).
 *
 * Extracted to a lib/ module so the logic can be unit-tested without
 * mounting the DeviceListPage component.
 */

import type { DeviceListItemResponse } from './api';

export type ConfigStatus = 'applied' | 'pending' | 'unknown';

/**
 * 'applied' — device's runtime matches the saved config AND the device
 *             polled AFTER the last save, so we know it actively saw it
 * 'pending' — mismatch, or the save is newer than the last poll, or
 *             the device has never polled, or no effective_config yet
 * 'unknown' — device is offline; config propagation state is unknowable
 *
 * capture_interval is EXCLUDED from the match — it's advisory under
 * systemd (DESIGNS-395 §2.3.1) and a Pi whose timer drives cadence may
 * legitimately run with a different interval than the saved value.
 */
export function getConfigStatus(device: DeviceListItemResponse): ConfigStatus {
  if (device.status !== 'online') return 'unknown';
  const eff = device.effective_config;
  const polled = device.last_config_polled_at;
  if (!eff || !polled) return 'pending';

  const savedAfterPoll = new Date(device.updated_at).getTime() > new Date(polled).getTime();
  if (savedAfterPoll) return 'pending';

  const matches =
    eff.resolution === device.resolution &&
    eff.jpeg_quality === device.jpeg_quality &&
    eff.active_window?.start === device.active_window.start &&
    eff.active_window?.end === device.active_window.end;
  return matches ? 'applied' : 'pending';
}

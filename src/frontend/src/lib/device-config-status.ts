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
 * 'applied' — device's runtime matches the saved config (the device has
 *             seen and applied the values, whether it got them this poll
 *             or the previous one)
 * 'pending' — mismatch, no poll yet, or no effective_config
 * 'unknown' — device is offline; config propagation state is unknowable
 *
 * capture_interval is EXCLUDED from the match — it's advisory under
 * systemd (DESIGNS-395 §2.3.1) and a Pi whose timer drives cadence may
 * legitimately run with a different interval than the saved value.
 *
 * Design note: an earlier revision gated this on `updated_at > polled_at`
 * to detect "save is in-flight". That was wrong — `updated_at` is bumped
 * by every heartbeat, not only by PATCH /config, so the badge oscillated
 * Applied → Pending after each heartbeat for no good reason. The value
 * equality check alone correctly detects drift and in-flight saves: if
 * the new value differs from what the device reports, matches = false →
 * pending. Reverted by review of #406.
 */
export function getConfigStatus(device: DeviceListItemResponse): ConfigStatus {
  if (device.status !== 'online') return 'unknown';
  const eff = device.effective_config;
  if (!eff || !device.last_config_polled_at) return 'pending';

  const matches =
    eff.resolution === device.resolution &&
    eff.jpeg_quality === device.jpeg_quality &&
    eff.active_window?.start === device.active_window.start &&
    eff.active_window?.end === device.active_window.end;
  return matches ? 'applied' : 'pending';
}

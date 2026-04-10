/**
 * Device tier derivation — shared helper for BF (frontend) and BE (API).
 *
 * The tier is derived from reported DeviceCapabilities rather than stored
 * as a separate field, so capabilities remain the single source of truth.
 *
 * See docs/REQUIREMENTS-337.md for the tier matrix and design rationale.
 */

import type { DeviceCapabilities } from './types/domain';

/** Camera-node device tier. `'unknown'` when capabilities haven't been reported yet. */
export type DeviceClass = 1 | 2 | 3 | 'unknown';

/**
 * Derive the device tier from reported capabilities.
 *
 * Tier matrix:
 * - Class 1: basic camera (no sensors)
 * - Class 2: battery sensor present, no PIR
 * - Class 3: PIR sensor present (with OR without battery — PIR is the discriminator)
 * - 'unknown': no capabilities reported yet (null/undefined — device hasn't heartbeat'd)
 *
 * Order matters: the PIR check must come before the battery check so that
 * a PIR-without-battery device correctly promotes to Class 3.
 */
export function getDeviceClass(caps: DeviceCapabilities | null | undefined): DeviceClass {
  if (!caps) return 'unknown';
  if (caps.has_pir_sensor) return 3;
  if (caps.has_battery_sensor) return 2;
  return 1;
}

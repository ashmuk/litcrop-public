/**
 * Device key verification — Beta-5 (T-B5-03)
 *
 * Extracts X-Device-Key header and verifies against the bcrypt hash
 * stored on the DEVICE# entity. Uses a dummy hash when the device is
 * not found to prevent timing side-channel leakage.
 */

import { compare } from 'bcryptjs';
import { dynamoRepo } from '../services/dynamodb';
import type { Device } from '@litcrop/shared';

// Pre-computed dummy hash (bcrypt of a random string) — used when device
// not found so bcrypt.compare always runs, preventing timing oracle.
const DUMMY_HASH = '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';

export interface DeviceAuthResult {
  valid: boolean;
  device?: Device & { device_api_key_hash: string };
}

/**
 * Verify a device API key against its stored bcrypt hash.
 * Always performs a bcrypt comparison (even for missing devices) to
 * prevent timing-based device enumeration.
 */
export async function verifyDeviceKey(
  deviceId: string,
  headerKey: string,
): Promise<DeviceAuthResult> {
  const device = await dynamoRepo.getDeviceById(deviceId);
  const hashToCompare = device?.device_api_key_hash ?? DUMMY_HASH;
  const valid = await compare(headerKey, hashToCompare);

  return {
    valid: valid && device !== null,
    device: valid && device ? device : undefined,
  };
}

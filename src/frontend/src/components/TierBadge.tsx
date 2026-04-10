/**
 * TierBadge — displays device tier (Class 1/2/3/Unknown) as a colored pill.
 *
 * Derives tier from DeviceCapabilities via the shared getDeviceClass() helper.
 * Color-coded per tier using the existing --color-status-* design tokens.
 *
 * TIER_PRESENTATION is exported so other surfaces (e.g., DeviceConfigForm
 * banner) can reuse the same tier→color/label mapping without drift.
 */

import type { DeviceClass } from '@litcrop/shared';
import { t } from '../i18n/i18n';

interface TierBadgeProps {
  deviceClass: DeviceClass;
  size?: 'sm' | 'md';
}

/** Visual presentation per device tier — single source of truth. */
export const TIER_PRESENTATION: Record<
  DeviceClass,
  { bg: string; fg: string; labelKey: string; bannerKey: string }
> = {
  1: {
    bg: 'var(--color-gray-200)',
    fg: 'var(--color-gray-700)',
    labelKey: 'device.class_1',
    bannerKey: 'device.tier_banner_1',
  },
  2: {
    bg: 'var(--color-primary-light)',
    fg: 'var(--color-primary-dark)',
    labelKey: 'device.class_2',
    bannerKey: 'device.tier_banner_2',
  },
  3: {
    bg: 'var(--color-status-healthy-bg)',
    fg: 'var(--color-status-healthy)',
    labelKey: 'device.class_3',
    bannerKey: 'device.tier_banner_3',
  },
  unknown: {
    bg: 'var(--color-status-no-data-bg)',
    fg: 'var(--color-status-no-data)',
    labelKey: 'device.class_unknown',
    bannerKey: 'device.tier_banner_unknown',
  },
};

export default function TierBadge({ deviceClass, size = 'md' }: TierBadgeProps) {
  const { bg, fg, labelKey } = TIER_PRESENTATION[deviceClass];
  const label = t(labelKey);
  const padding = size === 'sm' ? '1px 6px' : '2px 8px';
  const fontSize = size === 'sm' ? 'var(--font-size-xs)' : 'var(--font-size-sm)';
  return (
    <span
      class="tier-badge"
      style={`display:inline-block;padding:${padding};border-radius:var(--radius-sm);font-size:${fontSize};font-weight:var(--font-weight-semibold);background:${bg};color:${fg};line-height:1.4`}
      aria-label={label}
    >
      {label}
    </span>
  );
}

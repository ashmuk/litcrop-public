/**
 * TierBadge — displays device tier (Class 1/2/3/Pending) as a colored pill.
 *
 * Derives tier from DeviceCapabilities via the shared getDeviceClass() helper.
 * Color-coded per tier with an accessible label.
 */

import type { DeviceClass } from '@litcrop/shared';
import { t } from '../i18n/i18n';

interface TierBadgeProps {
  deviceClass: DeviceClass;
  size?: 'sm' | 'md';
}

const TIER_COLORS: Record<DeviceClass, { bg: string; fg: string }> = {
  1: { bg: 'var(--color-gray-200)', fg: 'var(--color-gray-700)' },
  2: { bg: 'var(--color-primary-light)', fg: 'var(--color-primary-dark)' },
  3: { bg: 'var(--color-success-light, #dcfce7)', fg: 'var(--color-success-dark, #166534)' },
  unknown: { bg: 'var(--color-warning-light, #fef3c7)', fg: 'var(--color-warning-dark, #92400e)' },
};

const TIER_LABEL_KEY: Record<DeviceClass, string> = {
  1: 'device.class_1',
  2: 'device.class_2',
  3: 'device.class_3',
  unknown: 'device.class_pending',
};

export default function TierBadge({ deviceClass, size = 'md' }: TierBadgeProps) {
  const { bg, fg } = TIER_COLORS[deviceClass];
  const padding = size === 'sm' ? '1px 6px' : '2px 8px';
  const fontSize = size === 'sm' ? 'var(--font-size-xs)' : 'var(--font-size-sm)';
  return (
    <span
      class="tier-badge"
      style={`display:inline-block;padding:${padding};border-radius:var(--radius-sm);font-size:${fontSize};font-weight:var(--font-weight-semibold);background:${bg};color:${fg};line-height:1.4`}
      aria-label={t(TIER_LABEL_KEY[deviceClass])}
    >
      {t(TIER_LABEL_KEY[deviceClass])}
    </span>
  );
}

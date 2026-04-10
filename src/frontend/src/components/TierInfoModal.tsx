/**
 * TierInfoModal — reference pane explaining the four device tier classes.
 *
 * Used by DeviceListPage and DeviceConfigForm to give users context for the
 * otherwise-opaque "Class 1/2/3/Pending" badges. Content is a stacked card
 * layout (hardware / does / can't) so it stays readable at mobile widths
 * without a 4-column table overflowing.
 */

import type { DeviceClass } from '@litcrop/shared';
import { t } from '../i18n/i18n';
import Modal from './Modal';
import { TIER_PRESENTATION } from './TierBadge';

export interface TierInfoModalProps {
  open: boolean;
  onClose: () => void;
}

// Display order — keep Class 1 → 2 → 3 → unknown for progressive disclosure.
const TIER_ROW_ORDER: DeviceClass[] = [1, 2, 3, 'unknown'];

// i18n key suffix per tier — mirrors DeviceClass union.
const TIER_KEY: Record<DeviceClass, string> = {
  1: '1',
  2: '2',
  3: '3',
  unknown: 'unknown',
};

interface TierRowProps {
  deviceClass: DeviceClass;
}

function TierRow({ deviceClass }: TierRowProps) {
  const { bg, fg, labelKey } = TIER_PRESENTATION[deviceClass];
  const keySuffix = TIER_KEY[deviceClass];

  return (
    <div
      style={`border:1px solid var(--color-gray-100);border-left:4px solid ${fg};border-radius:var(--radius-md);padding:var(--space-3);display:flex;flex-direction:column;gap:var(--space-2)`}
    >
      <div style="display:flex;align-items:center;gap:var(--space-2)">
        <span
          style={`display:inline-block;padding:2px 8px;border-radius:var(--radius-sm);font-size:var(--font-size-xs);font-weight:var(--font-weight-semibold);background:${bg};color:${fg};line-height:1.4`}
        >
          {t(labelKey)}
        </span>
        <span style="color:var(--color-gray-500);font-size:var(--font-size-xs)">
          {t(`device.tier_info_${keySuffix}_subtitle`)}
        </span>
      </div>

      <TierAttribute label={t('device.tier_info_col_hardware')} value={t(`device.tier_info_${keySuffix}_hw`)} />
      <TierAttribute label={t('device.tier_info_col_does')} value={t(`device.tier_info_${keySuffix}_does`)} />
      <TierAttribute label={t('device.tier_info_col_cant')} value={t(`device.tier_info_${keySuffix}_cant`)} />
    </div>
  );
}

function TierAttribute({ label, value }: { label: string; value: string }) {
  return (
    <div style="display:grid;grid-template-columns:80px 1fr;gap:var(--space-2);font-size:var(--font-size-xs);color:var(--color-gray-700)">
      <span style="color:var(--color-gray-500);text-transform:uppercase;font-size:10px;letter-spacing:0.04em">
        {label}
      </span>
      <span>{value}</span>
    </div>
  );
}

export default function TierInfoModal({ open, onClose }: TierInfoModalProps) {
  return (
    <Modal open={open} onClose={onClose} title={t('device.tier_info_title')} size="md">
      <div style="display:flex;flex-direction:column;gap:var(--space-3)">
        {TIER_ROW_ORDER.map((cls) => (
          <TierRow key={cls} deviceClass={cls} />
        ))}
      </div>
      <div
        style="margin-top:var(--space-4);padding-top:var(--space-3);border-top:1px solid var(--color-gray-100);font-size:var(--font-size-xs);color:var(--color-gray-500);line-height:var(--line-height-relaxed)"
      >
        {t('device.tier_info_footer')}
      </div>
    </Modal>
  );
}

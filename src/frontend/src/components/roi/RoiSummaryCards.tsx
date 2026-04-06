/**
 * RoiSummaryCards — Beta-10: ROI Dashboard
 *
 * 4-card summary grid: Total Cost, Revenue, ROI %, Harvests.
 * 2x2 on mobile, 4-across on desktop.
 */

import { t } from '../../i18n/i18n';
import { formatCurrency } from '../../lib/diary-utils';
import type { RoiSummary } from '../../lib/roi-utils';

interface Props {
  summary: RoiSummary;
  currency: 'JPY' | 'USD';
}

function roiCardModifier(roi: number | null): string {
  if (roi === null) return '';
  return roi >= 0 ? ' roi-summary-card--positive' : ' roi-summary-card--negative';
}

function roiDisplay(roi: number | null): string {
  if (roi === null) return '—';
  return `${roi >= 0 ? '+' : ''}${roi.toFixed(1)}%`;
}

export default function RoiSummaryCards({ summary, currency }: Props) {
  return (
    <div class="roi-summary-cards">
      <div class="roi-summary-card">
        <div class="roi-summary-card__icon" aria-hidden="true">💸</div>
        <div class="roi-summary-card__label">{t('roi.total_cost')}</div>
        <div class="roi-summary-card__value">{formatCurrency(summary.total_cost, currency)}</div>
      </div>
      <div class="roi-summary-card">
        <div class="roi-summary-card__icon" aria-hidden="true">💰</div>
        <div class="roi-summary-card__label">{t('roi.total_revenue')}</div>
        <div class="roi-summary-card__value">{formatCurrency(summary.total_revenue, currency)}</div>
      </div>
      <div class={`roi-summary-card${roiCardModifier(summary.roi_percent)}`}>
        <div class="roi-summary-card__icon" aria-hidden="true">📊</div>
        <div class="roi-summary-card__label">{t('roi.roi_percent')}</div>
        <div class="roi-summary-card__value">{roiDisplay(summary.roi_percent)}</div>
      </div>
      <div class="roi-summary-card">
        <div class="roi-summary-card__icon" aria-hidden="true">🌾</div>
        <div class="roi-summary-card__label">{t('roi.harvest_count')}</div>
        <div class="roi-summary-card__value">{summary.harvest_count}</div>
      </div>
    </div>
  );
}

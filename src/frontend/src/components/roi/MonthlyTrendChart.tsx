/**
 * MonthlyTrendChart — Beta-10: ROI Dashboard
 *
 * 12-column CSS grid with stacked bars (cost bottom red, revenue top green).
 * Month labels: J,F,M,A,M,J,J,A,S,O,N,D (en) or 1-12 (ja).
 * Current month highlighted with outline.
 * Hidden sr-only table for accessibility.
 */

import { t } from '../../i18n/i18n';
import { formatCurrency } from '../../lib/diary-utils';
import { getLocale } from '../../lib/diary';
import type { MonthlyTrend } from '../../lib/roi-utils';

interface Props {
  data: MonthlyTrend[];
  currency: 'JPY' | 'USD';
  currentMonth: string; // YYYY-MM
}

const MONTH_LABELS_EN = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

export default function MonthlyTrendChart({ data, currency, currentMonth }: Props) {
  const locale = getLocale();
  const maxValue = Math.max(...data.map((d) => Math.max(d.cost, d.revenue)), 1);

  return (
    <div class="roi-section">
      <h3 class="roi-section__title">{t('roi.monthly_trend')}</h3>

      <div class="roi-legend">
        <span class="roi-legend__item">
          <span class="roi-legend__dot roi-legend__dot--cost" />
          {t('roi.month_cost')}
        </span>
        <span class="roi-legend__item">
          <span class="roi-legend__dot roi-legend__dot--revenue" />
          {t('roi.month_revenue')}
        </span>
      </div>

      <div class="roi-trend-grid" role="presentation">
        {data.map((month, i) => {
          const costPct = (month.cost / maxValue) * 100;
          const revPct = (month.revenue / maxValue) * 100;
          const isCurrent = month.month === currentMonth;
          const label = locale === 'ja' ? String(i + 1) : MONTH_LABELS_EN[i];

          return (
            <div
              key={month.month}
              class={`roi-trend-col${isCurrent ? ' roi-trend-col--current' : ''}`}
            >
              <div class="roi-trend-col__bars">
                {revPct > 0 && (
                  <div
                    class="roi-trend-col__bar roi-trend-col__bar--revenue"
                    style={{ height: `${revPct}%` }}
                    title={`${t('roi.month_revenue')}: ${formatCurrency(month.revenue, currency)}`}
                  />
                )}
                {costPct > 0 && (
                  <div
                    class="roi-trend-col__bar roi-trend-col__bar--cost"
                    style={{ height: `${costPct}%` }}
                    title={`${t('roi.month_cost')}: ${formatCurrency(month.cost, currency)}`}
                  />
                )}
              </div>
              <div class="roi-trend-col__label">{label}</div>
            </div>
          );
        })}
      </div>

      {/* Accessible data table (sr-only) */}
      <table class="sr-only">
        <caption>{t('roi.monthly_trend')}</caption>
        <thead>
          <tr>
            <th>{t('diary.date')}</th>
            <th>{t('roi.month_cost')}</th>
            <th>{t('roi.month_revenue')}</th>
          </tr>
        </thead>
        <tbody>
          {data.map((month, i) => (
            <tr key={month.month}>
              <td>{locale === 'ja' ? `${i + 1}月` : MONTH_LABELS_EN[i]}</td>
              <td>{formatCurrency(month.cost, currency)}</td>
              <td>{formatCurrency(month.revenue, currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

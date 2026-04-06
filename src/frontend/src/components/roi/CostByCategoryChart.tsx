/**
 * CostByCategoryChart — Beta-10: ROI Dashboard
 *
 * Horizontal bar chart showing cost breakdown by diary category.
 * Uses CSS percentage widths for bars. Category icons and colors from CATEGORY_META.
 */

import { t } from '../../i18n/i18n';
import { formatCurrency } from '../../lib/diary-utils';
import { CATEGORY_META } from '../../lib/diary';
import type { CategoryCostSummary } from '../../lib/roi-utils';

interface Props {
  data: CategoryCostSummary[];
  currency: 'JPY' | 'USD';
}

export default function CostByCategoryChart({ data, currency }: Props) {
  if (data.length === 0) {
    return (
      <div class="roi-section">
        <h3 class="roi-section__title">{t('roi.cost_by_category')}</h3>
        <p class="roi-section__empty">{t('roi.no_costs')}</p>
      </div>
    );
  }

  const maxTotal = data[0]?.total ?? 1; // data is sorted descending
  const grandTotal = data.reduce((sum, d) => sum + d.total, 0);

  return (
    <div class="roi-section">
      <h3 class="roi-section__title">{t('roi.cost_by_category')}</h3>
      <div class="roi-category-chart">
        {data.map((item) => {
          const meta = CATEGORY_META[item.category] ?? CATEGORY_META.other;
          const pct = maxTotal > 0 ? (item.total / maxTotal) * 100 : 0;
          const ofTotal = grandTotal > 0 ? ((item.total / grandTotal) * 100).toFixed(0) : '0';

          return (
            <div key={item.category} class="roi-category-bar">
              <div class="roi-category-bar__label">
                <span aria-hidden="true">{meta.icon}</span>
                <span>{t(`diary.categories.${item.category}`)}</span>
              </div>
              <div class="roi-category-bar__track">
                <div
                  class="roi-category-bar__fill"
                  style={{ width: `${pct}%`, backgroundColor: meta.color }}
                  role="presentation"
                />
              </div>
              <div class="roi-category-bar__amount">
                <span>{formatCurrency(item.total, currency)}</span>
                <span class="roi-category-bar__pct">{ofTotal}%</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

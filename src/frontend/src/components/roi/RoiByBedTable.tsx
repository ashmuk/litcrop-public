/**
 * RoiByBedTable — Beta-10: ROI Dashboard
 *
 * Desktop: sortable table with aria-sort on headers.
 * Mobile: card list with sort dropdown.
 * ROI column: green/red color coding. Footer row with totals.
 */

import { useState, useMemo } from 'preact/hooks';
import { t } from '../../i18n/i18n';
import { formatCurrency } from '../../lib/diary-utils';
import type { BedRoiSummary } from '../../lib/roi-utils';

interface Props {
  data: BedRoiSummary[];
  currency: 'JPY' | 'USD';
}

type SortKey = 'bed_name' | 'total_cost' | 'total_revenue' | 'roi_percent' | 'entry_count';
type SortDir = 'asc' | 'desc';

function roiClass(roi: number | null): string {
  if (roi === null) return '';
  return roi >= 0 ? 'roi-positive' : 'roi-negative';
}

function roiDisplay(roi: number | null): string {
  if (roi === null) return '—';
  return `${roi >= 0 ? '+' : ''}${roi.toFixed(1)}%`;
}

export default function RoiByBedTable({ data, currency }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('total_cost');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const sorted = useMemo(() => {
    return [...data].sort((a, b) => {
      let av: number | string;
      let bv: number | string;

      switch (sortKey) {
        case 'bed_name':
          av = a.bed_name.toLowerCase();
          bv = b.bed_name.toLowerCase();
          break;
        case 'roi_percent':
          av = a.roi_percent ?? -Infinity;
          bv = b.roi_percent ?? -Infinity;
          break;
        default:
          av = a[sortKey];
          bv = b[sortKey];
      }

      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [data, sortKey, sortDir]);

  // Totals
  const totals = useMemo(() => {
    const cost = data.reduce((s, d) => s + d.total_cost, 0);
    const revenue = data.reduce((s, d) => s + d.total_revenue, 0);
    const entries = data.reduce((s, d) => s + d.entry_count, 0);
    const roi = cost > 0 ? ((revenue - cost) / cost) * 100 : null;
    return { cost, revenue, entries, roi };
  }, [data]);

  if (data.length === 0) {
    return (
      <div class="roi-section">
        <h3 class="roi-section__title">{t('roi.roi_by_bed')}</h3>
        <p class="roi-section__empty">{t('roi.no_data')}</p>
      </div>
    );
  }

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  }

  function ariaSort(key: SortKey): 'ascending' | 'descending' | 'none' {
    if (sortKey !== key) return 'none';
    return sortDir === 'asc' ? 'ascending' : 'descending';
  }

  return (
    <div class="roi-section">
      <h3 class="roi-section__title">{t('roi.roi_by_bed')}</h3>

      {/* Mobile: sort dropdown */}
      <div class="roi-bed-sort-mobile">
        <label>
          {t('roi.sort_by')}:
          <select
            class="form-select"
            value={`${sortKey}:${sortDir}`}
            onChange={(e) => {
              const [k, d] = (e.target as HTMLSelectElement).value.split(':');
              setSortKey(k as SortKey);
              setSortDir(d as SortDir);
            }}
          >
            <option value="total_cost:desc">{t('roi.costs_column')} ↓</option>
            <option value="total_cost:asc">{t('roi.costs_column')} ↑</option>
            <option value="total_revenue:desc">{t('roi.revenue_column')} ↓</option>
            <option value="total_revenue:asc">{t('roi.revenue_column')} ↑</option>
            <option value="roi_percent:desc">{t('roi.roi_column')} ↓</option>
            <option value="roi_percent:asc">{t('roi.roi_column')} ↑</option>
            <option value="bed_name:asc">{t('roi.bed_column')} A-Z</option>
          </select>
        </label>
      </div>

      {/* Mobile: card list */}
      <div class="roi-bed-cards">
        {sorted.map((bed) => (
          <div key={bed.bed_id} class="roi-bed-card">
            <div class="roi-bed-card__name">
              {bed.crop_emoji && <span aria-hidden="true">{bed.crop_emoji}</span>}
              {bed.bed_name || t('roi.unassigned')}
            </div>
            <div class="roi-bed-card__stats">
              <div>
                <span class="roi-bed-card__label">{t('roi.costs_column')}</span>
                <span>{formatCurrency(bed.total_cost, currency)}</span>
              </div>
              <div>
                <span class="roi-bed-card__label">{t('roi.revenue_column')}</span>
                <span>{formatCurrency(bed.total_revenue, currency)}</span>
              </div>
              <div>
                <span class="roi-bed-card__label">{t('roi.roi_column')}</span>
                <span class={roiClass(bed.roi_percent)}>{roiDisplay(bed.roi_percent)}</span>
              </div>
              <div>
                <span class="roi-bed-card__label">{t('roi.entries_column')}</span>
                <span>{bed.entry_count}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Desktop: table */}
      <div class="roi-bed-table-wrap">
        <table class="roi-bed-table">
          <thead>
            <tr>
              <th
                aria-sort={ariaSort('bed_name')}
                onClick={() => handleSort('bed_name')}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSort('bed_name'); } }}
                role="button"
                tabIndex={0}
                class="roi-bed-table__sortable"
              >
                {t('roi.bed_column')}
              </th>
              <th
                aria-sort={ariaSort('total_cost')}
                onClick={() => handleSort('total_cost')}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSort('total_cost'); } }}
                role="button"
                tabIndex={0}
                class="roi-bed-table__sortable roi-bed-table__num"
              >
                {t('roi.costs_column')}
              </th>
              <th
                aria-sort={ariaSort('total_revenue')}
                onClick={() => handleSort('total_revenue')}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSort('total_revenue'); } }}
                role="button"
                tabIndex={0}
                class="roi-bed-table__sortable roi-bed-table__num"
              >
                {t('roi.revenue_column')}
              </th>
              <th
                aria-sort={ariaSort('roi_percent')}
                onClick={() => handleSort('roi_percent')}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSort('roi_percent'); } }}
                role="button"
                tabIndex={0}
                class="roi-bed-table__sortable roi-bed-table__num"
              >
                {t('roi.roi_column')}
              </th>
              <th
                aria-sort={ariaSort('entry_count')}
                onClick={() => handleSort('entry_count')}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSort('entry_count'); } }}
                role="button"
                tabIndex={0}
                class="roi-bed-table__sortable roi-bed-table__num"
              >
                {t('roi.entries_column')}
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((bed) => (
              <tr key={bed.bed_id}>
                <td>
                  {bed.crop_emoji && <span aria-hidden="true">{bed.crop_emoji} </span>}
                  {bed.bed_name || t('roi.unassigned')}
                </td>
                <td class="roi-bed-table__num">{formatCurrency(bed.total_cost, currency)}</td>
                <td class="roi-bed-table__num">{formatCurrency(bed.total_revenue, currency)}</td>
                <td class={`roi-bed-table__num ${roiClass(bed.roi_percent)}`}>
                  {roiDisplay(bed.roi_percent)}
                </td>
                <td class="roi-bed-table__num">{bed.entry_count}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr class="roi-bed-table__total">
              <td>{t('roi.total_row')}</td>
              <td class="roi-bed-table__num">{formatCurrency(totals.cost, currency)}</td>
              <td class="roi-bed-table__num">{formatCurrency(totals.revenue, currency)}</td>
              <td class={`roi-bed-table__num ${roiClass(totals.roi)}`}>
                {roiDisplay(totals.roi)}
              </td>
              <td class="roi-bed-table__num">{totals.entries}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

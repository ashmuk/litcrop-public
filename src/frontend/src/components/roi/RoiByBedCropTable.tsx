/**
 * RoiByBedCropTable — Wave D-5 (#279)
 *
 * Per-(bed, crop) ROI view. One row per crop cycle, with a bed-level row
 * for unattributed/legacy entries and a farm-wide row for entries without
 * a bed. Uses D4's label vocabulary ("Farm-wide", "(All)", "— {crop}") so
 * the hierarchy stays consistent across the app.
 *
 * Desktop: sortable table. Mobile: card list with sort dropdown.
 */

import { useState, useMemo } from 'preact/hooks';
import { t } from '../../i18n/i18n';
import { formatCurrency } from '../../lib/diary-utils';
import { getCropName } from '../../lib/crops';
import type { BedCropRoiSummary } from '../../lib/roi-utils';

interface Props {
  data: BedCropRoiSummary[];
  currency: 'JPY' | 'USD';
}

type SortKey = 'label' | 'total_cost' | 'total_revenue' | 'roi_percent' | 'entry_count';
type SortDir = 'asc' | 'desc';

interface SortHeaderProps {
  sortBy: SortKey;
  label: string;
  numeric?: boolean;
  activeKey: SortKey;
  activeDir: SortDir;
  onSort: (k: SortKey) => void;
}

function SortHeader({ sortBy, label, numeric = false, activeKey, activeDir, onSort }: SortHeaderProps) {
  const cls = `roi-bed-table__sortable${numeric ? ' roi-bed-table__num' : ''}`;
  const ariaSort: 'ascending' | 'descending' | 'none' =
    activeKey !== sortBy ? 'none' : activeDir === 'asc' ? 'ascending' : 'descending';
  return (
    <th
      aria-sort={ariaSort}
      onClick={() => onSort(sortBy)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSort(sortBy); } }}
      role="button"
      tabIndex={0}
      class={cls}
    >
      {label}
    </th>
  );
}

function roiClass(roi: number | null): string {
  if (roi === null) return '';
  return roi >= 0 ? 'roi-positive' : 'roi-negative';
}

function roiDisplay(roi: number | null): string {
  if (roi === null) return '—';
  return `${roi >= 0 ? '+' : ''}${roi.toFixed(1)}%`;
}

function rowLabel(row: BedCropRoiSummary): string {
  if (row.scope === 'farm') return t('roi.farm_wide');
  if (row.scope === 'crop') {
    return `${row.bed_name} — ${getCropName(row.crop_type ?? '')}`;
  }
  // scope === 'bed': legacy bed with inline crop_type keeps the pre-Wave-D
  // shim label; modern bed (no legacy crop_type) uses the "(All)" suffix.
  if (row.crop_type) return `${row.bed_name} — ${getCropName(row.crop_type)}`;
  return `${row.bed_name} (${t('diary.bed_all')})`;
}

export default function RoiByBedCropTable({ data, currency }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('total_cost');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const decorated = useMemo(
    () => data.map((row) => ({ row, label: rowLabel(row) })),
    [data],
  );

  const sorted = useMemo(() => {
    return [...decorated].sort((a, b) => {
      let av: number | string;
      let bv: number | string;

      switch (sortKey) {
        case 'label':
          av = a.label.toLowerCase();
          bv = b.label.toLowerCase();
          break;
        case 'roi_percent':
          av = a.row.roi_percent ?? -Infinity;
          bv = b.row.roi_percent ?? -Infinity;
          break;
        default:
          av = a.row[sortKey];
          bv = b.row[sortKey];
      }

      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [decorated, sortKey, sortDir]);

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
        <h3 class="roi-section__title">{t('roi.roi_by_crop')}</h3>
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

  return (
    <div class="roi-section">
      <h3 class="roi-section__title">{t('roi.roi_by_crop')}</h3>

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
            <option value="label:asc">{t('roi.bed_crop_column')} A-Z</option>
          </select>
        </label>
      </div>

      {/* Mobile: card list */}
      <div class="roi-bed-cards">
        {sorted.map(({ row, label }) => (
          <div key={row.key} class="roi-bed-card">
            <div class="roi-bed-card__name">
              {row.crop_emoji && <span aria-hidden="true">{row.crop_emoji}</span>}
              {label}
            </div>
            <div class="roi-bed-card__stats">
              <div>
                <span class="roi-bed-card__label">{t('roi.costs_column')}</span>
                <span>{formatCurrency(row.total_cost, currency)}</span>
              </div>
              <div>
                <span class="roi-bed-card__label">{t('roi.revenue_column')}</span>
                <span>{formatCurrency(row.total_revenue, currency)}</span>
              </div>
              <div>
                <span class="roi-bed-card__label">{t('roi.roi_column')}</span>
                <span class={roiClass(row.roi_percent)}>{roiDisplay(row.roi_percent)}</span>
              </div>
              <div>
                <span class="roi-bed-card__label">{t('roi.entries_column')}</span>
                <span>{row.entry_count}</span>
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
              <SortHeader sortBy="label" label={t('roi.bed_crop_column')} activeKey={sortKey} activeDir={sortDir} onSort={handleSort} />
              <SortHeader sortBy="total_cost" label={t('roi.costs_column')} numeric activeKey={sortKey} activeDir={sortDir} onSort={handleSort} />
              <SortHeader sortBy="total_revenue" label={t('roi.revenue_column')} numeric activeKey={sortKey} activeDir={sortDir} onSort={handleSort} />
              <SortHeader sortBy="roi_percent" label={t('roi.roi_column')} numeric activeKey={sortKey} activeDir={sortDir} onSort={handleSort} />
              <SortHeader sortBy="entry_count" label={t('roi.entries_column')} numeric activeKey={sortKey} activeDir={sortDir} onSort={handleSort} />
            </tr>
          </thead>
          <tbody>
            {sorted.map(({ row, label }) => (
              <tr key={row.key}>
                <td>
                  {row.crop_emoji && <span aria-hidden="true">{row.crop_emoji} </span>}
                  {label}
                </td>
                <td class="roi-bed-table__num">{formatCurrency(row.total_cost, currency)}</td>
                <td class="roi-bed-table__num">{formatCurrency(row.total_revenue, currency)}</td>
                <td class={`roi-bed-table__num ${roiClass(row.roi_percent)}`}>
                  {roiDisplay(row.roi_percent)}
                </td>
                <td class="roi-bed-table__num">{row.entry_count}</td>
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

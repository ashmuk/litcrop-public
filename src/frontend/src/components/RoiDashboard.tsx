/**
 * RoiDashboard — Beta-10: ROI Dashboard (T4.3)
 *
 * Container component: fetches diary entries for a selected year,
 * computes ROI aggregates, and renders summary + chart sub-components.
 *
 * State:
 *   - year:          selected year (default current)
 *   - entries:       diary entries for the year
 *   - loading:       fetch in progress
 *   - error:         fetch error message
 *   - farmCurrency:  farm's default_currency ('JPY' | 'USD')
 */

import { useState, useEffect, useMemo, useCallback } from 'preact/hooks';
import type { FarmBedItem } from '@litcrop/shared';
import { getDiaryEntries, getFarm, type DiaryEntryResponse } from '../lib/api';
import { t } from '../i18n/i18n';
import {
  computeRoi,
  computeRoiByBed,
  computeCostByCategory,
  computeMonthlyTrend,
} from '../lib/roi-utils';
import { toDateString } from '../lib/diary-utils';
import RoiSummaryCards from './roi/RoiSummaryCards';
import CostByCategoryChart from './roi/CostByCategoryChart';
import MonthlyTrendChart from './roi/MonthlyTrendChart';
import RoiByBedTable from './roi/RoiByBedTable';

// ── Types ─────────────────────────────────────────────────────────

interface Props {
  farmId: string;
  beds: FarmBedItem[];
}

// ── Component ─────────────────────────────────────────────────────

export default function RoiDashboard({ farmId, beds }: Props) {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [retryCount, setRetryCount] = useState(0);
  const [entries, setEntries] = useState<DiaryEntryResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [farmCurrency, setFarmCurrency] = useState<'JPY' | 'USD'>('JPY');

  const handleRetry = useCallback(() => setRetryCount((c) => c + 1), []);

  // Fetch farm data to get default_currency
  useEffect(() => {
    let cancelled = false;
    getFarm(farmId)
      .then((farm) => {
        if (!cancelled && farm.default_currency) {
          setFarmCurrency(farm.default_currency as 'JPY' | 'USD');
        }
      })
      .catch(() => { /* fallback to JPY */ });
    return () => { cancelled = true; };
  }, [farmId]);

  // Fetch diary entries for the selected year (auto-paginate)
  useEffect(() => {
    let cancelled = false;

    async function fetchAll() {
      setLoading(true);
      setError(null);

      const from = `${year}-01-01`;
      const to = `${year}-12-31`;
      const allEntries: DiaryEntryResponse[] = [];
      let cursor: string | undefined;

      try {
        do {
          const res = await getDiaryEntries(farmId, { from, to, limit: 100, cursor });
          if (cancelled) return;
          allEntries.push(...res.data);
          cursor = res.meta.next_cursor ?? undefined;
        } while (cursor);

        setEntries(allEntries);
      } catch {
        if (!cancelled) setError(t('diary.error_loading'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchAll();
    return () => { cancelled = true; };
  }, [farmId, year, retryCount]);

  // Compute aggregates (memoized)
  const summary = useMemo(
    () => computeRoi(entries, farmCurrency),
    [entries, farmCurrency],
  );

  const byBed = useMemo(
    () => computeRoiByBed(entries, beds, farmCurrency),
    [entries, beds, farmCurrency],
  );

  const byCategory = useMemo(
    () => computeCostByCategory(entries, farmCurrency),
    [entries, farmCurrency],
  );

  const monthly = useMemo(
    () => computeMonthlyTrend(entries, farmCurrency, year),
    [entries, farmCurrency, year],
  );

  const currentMonth = toDateString(new Date()).slice(0, 7);

  // ── Render ────────────────────────────────────────────────────

  return (
    <div class="roi-dashboard">
      {/* Year selector */}
      <div class="roi-year-selector" role="group" aria-label={t('roi.year_selector')}>
        <button
          type="button"
          class="roi-year-selector__btn"
          onClick={() => setYear((y) => y - 1)}
          aria-label={t('roi.prev_year')}
        >
          &lt;
        </button>
        <span class="roi-year-selector__label">{year}</span>
        <button
          type="button"
          class="roi-year-selector__btn"
          onClick={() => setYear((y) => y + 1)}
          disabled={year >= currentYear}
          aria-label={t('roi.next_year')}
        >
          &gt;
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <div class="roi-loading">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} class="skeleton-tile" style={{ height: '80px' }} />
          ))}
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div class="empty-state" style={{ padding: 'var(--space-8) var(--space-4)' }}>
          <p class="empty-state__heading" style={{ color: 'var(--color-error)' }}>{error}</p>
          <button
            type="button"
            class="btn btn--primary"
            style={{ marginTop: 'var(--space-4)' }}
            onClick={handleRetry}
          >
            {t('buttons.retry')}
          </button>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && entries.length === 0 && (
        <div class="empty-state" style={{ padding: 'var(--space-8) var(--space-4)' }}>
          <div class="empty-state__icon" aria-hidden="true">📊</div>
          <p class="empty-state__heading">
            {t('roi.no_data_title').replace('{{year}}', String(year))}
          </p>
          <p class="empty-state__body">{t('roi.no_data_body')}</p>
          <a
            href="/diary"
            class="btn btn--primary"
            style={{ marginTop: 'var(--space-4)', display: 'inline-block' }}
          >
            {t('roi.no_data_cta')}
          </a>
        </div>
      )}

      {/* Dashboard content */}
      {!loading && !error && entries.length > 0 && (
        <>
          <RoiSummaryCards summary={summary} currency={farmCurrency} />

          {summary.excluded_entry_count > 0 && (
            <div class="roi-excluded-notice" role="status">
              {t('roi.currency_excluded')
                .replace('{{count}}', String(summary.excluded_entry_count))
                // NOTE: Assumes exactly 2 currencies (JPY, USD). If a third currency is added,
                // this should list all non-default currencies found in excluded entries.
                .replace('{{currency}}', farmCurrency === 'JPY' ? 'USD' : 'JPY')}
            </div>
          )}

          {summary.harvest_count === 0 && (
            <p class="roi-harvest-hint">{t('roi.harvest_hint')}</p>
          )}

          <CostByCategoryChart data={byCategory} currency={farmCurrency} />
          <MonthlyTrendChart data={monthly} currency={farmCurrency} currentMonth={currentMonth} />
          <RoiByBedTable data={byBed} currency={farmCurrency} />
        </>
      )}
    </div>
  );
}

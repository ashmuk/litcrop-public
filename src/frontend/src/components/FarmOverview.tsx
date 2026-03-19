/**
 * Farm Overview Island — T-FE-06
 * Fetches farm plots sorted by severity, filterable status pills, weather strip.
 */

import { useState, useEffect } from 'preact/hooks';
import type { FarmPlotItem, WeatherResponse, PlotStatus } from '@litcrop/shared';
import { getFarm, getPlots, getWeather } from '../lib/api';
import { t } from '../i18n/i18n';
import { STATUS_CSS, STATUS_ICONS } from '../lib/status';
import { useLocalFarmId, formatTemp } from '../lib/hooks';

// Most critical first
const STATUS_SEVERITY: Record<PlotStatus, number> = {
  issue: 0,
  animal_intrusion: 1,
  slow_growth: 2,
  healthy: 3,
  no_data: 4,
};

const STATUS_ORDER: PlotStatus[] = [
  'issue',
  'animal_intrusion',
  'slow_growth',
  'healthy',
  'no_data',
];

function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export interface Props {
  farmId: string;
}

export default function FarmOverview({ farmId }: Props) {
  const [plots, setPlots] = useState<FarmPlotItem[]>([]);
  const [weather, setWeather] = useState<WeatherResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<PlotStatus | 'all'>('all');

  // Allow setup page to override farmId via localStorage
  const effectiveFarmId = useLocalFarmId(farmId);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [farmData, plotData, weatherData] = await Promise.all([
          getFarm(effectiveFarmId).catch(() => null),
          getPlots(effectiveFarmId),
          getWeather(effectiveFarmId).catch(() => null),
        ]);
        if (cancelled) return;
        if (farmData) {
          // Store farmId for other islands
          try { localStorage.setItem('litcrop-farmId', farmData.id); } catch {}
        }
        setPlots(plotData);
        if (weatherData) setWeather(weatherData);
      } catch {
        if (!cancelled) setError(t('farm.error_loading'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [effectiveFarmId]);

  if (loading) {
    return (
      <>
        <div class="status-summary-bar">
          {[0, 1, 2].map((i) => (
            <div key={i} class="skeleton skeleton-badge" style="flex-shrink:0" />
          ))}
        </div>
        <div style="padding:var(--space-3);display:flex;flex-direction:column;gap:var(--space-3)">
          {[0, 1, 2, 3].map((i) => <div key={i} class="skeleton skeleton-tile" />)}
        </div>
      </>
    );
  }

  if (error) {
    return (
      <div class="empty-state">
        <span class="empty-state__icon">⚠️</span>
        <p class="empty-state__heading">{t('farm.error_loading')}</p>
        <p class="empty-state__body">{t('farm.error_body')}</p>
        <button class="btn-primary mt-4" onClick={() => location.reload()}>
          {t('buttons.retry')}
        </button>
      </div>
    );
  }

  const sorted = [...plots].sort(
    (a, b) => STATUS_SEVERITY[a.latest_status] - STATUS_SEVERITY[b.latest_status],
  );
  const filtered =
    filterStatus === 'all' ? sorted : sorted.filter((p) => p.latest_status === filterStatus);

  const statusCounts = plots.reduce((acc, p) => {
    acc[p.latest_status] = (acc[p.latest_status] ?? 0) + 1;
    return acc;
  }, {} as Partial<Record<PlotStatus, number>>);

  return (
    <>
      {/* Weather strip */}
      {weather && (
        <div
          class="offline-banner"
          style="background-color:var(--color-primary-light);color:var(--color-primary-dark);border-bottom-color:var(--color-primary)"
          aria-label="Current weather summary"
        >
          <span aria-hidden="true">{weather.current.condition_icon}</span>
          <span style="font-weight:var(--font-weight-semibold)">
            {formatTemp(weather.current.temperature)}
          </span>
          <span>{weather.current.condition}</span>
          <span style="margin-left:auto;font-size:var(--font-size-xs)">
            💧{weather.current.humidity}% · 💨{Math.round(weather.current.wind_speed)} km/h
          </span>
        </div>
      )}

      {/* Status summary / filter bar */}
      <div class="status-summary-bar" role="group" aria-label="Filter plots by status">
        <button
          class={`summary-pill ${filterStatus === 'all' ? 'status-healthy' : 'status-nodata'}`}
          style="cursor:pointer;border:none;font-family:inherit"
          onClick={() => setFilterStatus('all')}
          aria-pressed={filterStatus === 'all'}
        >
          All {plots.length}
        </button>
        {STATUS_ORDER.filter((s) => statusCounts[s]).map((status) => (
          <button
            key={status}
            class={`summary-pill ${STATUS_CSS[status]}`}
            style="cursor:pointer;border:none;font-family:inherit"
            onClick={() => setFilterStatus(filterStatus === status ? 'all' : status)}
            aria-pressed={filterStatus === status}
          >
            {STATUS_ICONS[status]} {t(`status.${status}`)} {statusCounts[status]}
          </button>
        ))}
      </div>

      {/* Plot list */}
      {filtered.length === 0 ? (
        <div class="empty-state">
          <span class="empty-state__icon">🌱</span>
          <p class="empty-state__heading">{t('farm.no_plots')}</p>
          <p class="empty-state__body">{t('farm.no_plots_body')}</p>
        </div>
      ) : (
        <div style="padding:var(--space-3);display:flex;flex-direction:column;gap:var(--space-3)">
          {filtered.map((plot) => (
            <a
              key={plot.id}
              href={`/plots/view?id=${plot.id}`}
              class="plot-tile"
              aria-label={`${plot.crop_type} ${plot.crop_variety}, ${t(`status.${plot.latest_status}`)}`}
            >
              <div class="plot-tile__thumb">
                {plot.latest_image ? (
                  <img src={plot.latest_image.thumbnail_url} alt="" loading="lazy" />
                ) : (
                  <span aria-hidden="true">📷</span>
                )}
              </div>
              <div class="plot-tile__info">
                <div class="plot-tile__crop-name">{plot.crop_type}</div>
                <div class="plot-tile__plot-label">{plot.crop_variety}</div>
                {plot.latest_image && (
                  <div
                    class="plot-tile__plot-label"
                    style="font-size:var(--font-size-xs);color:var(--color-gray-500)"
                  >
                    {formatRelativeTime(plot.latest_image.captured_at)}
                  </div>
                )}
              </div>
              <div class="plot-tile__badges">
                <span class={`badge ${STATUS_CSS[plot.latest_status]}`}>
                  <span class="badge-icon" aria-hidden="true">
                    {STATUS_ICONS[plot.latest_status]}
                  </span>
                  {t(`status.${plot.latest_status}`)}
                </span>
                {plot.latest_image?.trigger === 'motion' && (
                  <span class="badge-motion-sm">🏃 {t('motion.motion')}</span>
                )}
              </div>
            </a>
          ))}
        </div>
      )}
    </>
  );
}

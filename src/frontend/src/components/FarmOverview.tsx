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
import { translateCondition, formatRelativeTime } from '../lib/format';

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
          // Store farmId + name for other islands and page headers
          try {
            localStorage.setItem('litcrop-farmId', farmData.id);
            localStorage.setItem('litcrop-farmName', farmData.name);
          } catch {}
          // Patch page title in case localStorage was empty on first load
          const titleEl = document.getElementById('page-title');
          if (titleEl && farmData.name) {
            titleEl.textContent = (titleEl.dataset.prefix ?? '') + farmData.name;
          }
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
    <div class="farm-layout">
      {/* ── Main column: filter bar + plot grid ────────────────── */}
      <div class="farm-main">
        {/* Mobile weather strip (hidden at desktop — sidebar used instead) */}
        {weather && (
          <div
            class="offline-banner farm-weather-strip"
            style="background-color:var(--color-primary-light);color:var(--color-primary-dark);border-bottom-color:var(--color-primary)"
            aria-label="Current weather summary"
          >
            <span aria-hidden="true">{weather.current.condition_icon}</span>
            <span style="font-weight:var(--font-weight-semibold)">
              {formatTemp(weather.current.temperature)}
            </span>
            <span>{translateCondition(weather.current.condition_icon)}</span>
            <span style="margin-left:auto;font-size:var(--font-size-xs)">
              💧{weather.current.humidity}% · 💨{Math.round(weather.current.wind_speed)} km/h
            </span>
          </div>
        )}

        {/* Status filter bar */}
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
            {plots.length === 0 && (
              <a
                href="/plots/add/"
                class="btn-primary"
                style="margin-top:var(--space-4);text-decoration:none"
              >
                {t('add_plot.add_first_plot')}
              </a>
            )}
          </div>
        ) : (
          <div
            class="plot-list"
            style="padding:var(--space-3);display:flex;flex-direction:column;gap:var(--space-3)"
          >
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
      </div>

      {/* ── Desktop weather sidebar (hidden on mobile via CSS) ──── */}
      {weather && (
        <aside class="farm-sidebar" aria-label="Weather overview" style="position:relative">
          {/* Current conditions */}
          <div class="farm-sidebar-card">
            <div class="farm-sidebar-card__title">{t('weather.temperature')}</div>
            <div class="farm-sidebar-current">
              <span class="farm-sidebar-current__icon" aria-hidden="true">
                {weather.current.condition_icon}
              </span>
              <div>
                <div class="farm-sidebar-current__temp">
                  {formatTemp(weather.current.temperature)}
                </div>
                <div class="farm-sidebar-current__cond">
                  {translateCondition(weather.current.condition_icon)}
                </div>
              </div>
            </div>
            <div
              style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-2);font-size:var(--font-size-sm)"
            >
              <div>
                <div style="color:var(--color-gray-500);font-size:var(--font-size-xs)">
                  {t('weather.humidity')}
                </div>
                <div style="font-weight:var(--font-weight-semibold)">
                  {weather.current.humidity}%
                </div>
              </div>
              <div>
                <div style="color:var(--color-gray-500);font-size:var(--font-size-xs)">
                  {t('weather.wind')}
                </div>
                <div style="font-weight:var(--font-weight-semibold)">
                  {Math.round(weather.current.wind_speed)} km/h
                </div>
              </div>
              <div>
                <div style="color:var(--color-gray-500);font-size:var(--font-size-xs)">
                  {t('weather.high')} / {t('weather.low')}
                </div>
                <div style="font-weight:var(--font-weight-semibold)">
                  {formatTemp(weather.today.high)} / {formatTemp(weather.today.low)}
                </div>
              </div>
              <div>
                <div style="color:var(--color-gray-500);font-size:var(--font-size-xs)">
                  {t('weather.rain_probability')}
                </div>
                <div style="font-weight:var(--font-weight-semibold)">
                  {weather.today.rain_probability}%
                </div>
              </div>
            </div>
          </div>

          {/* Mini 7-day forecast */}
          <div class="farm-sidebar-card">
            <div class="farm-sidebar-card__title">{t('weather.weekly')}</div>
            {weather.daily.slice(0, 5).map((day, i) => (
              <div key={i} class="farm-sidebar-day-row">
                <span class="farm-sidebar-day-row__date">
                  {i === 0
                    ? t('weather.today')
                    : new Date(day.date).toLocaleDateString(undefined, { weekday: 'short' })}
                </span>
                <span class="farm-sidebar-day-row__icon" aria-hidden="true">
                  {day.condition_icon}
                </span>
                <div class="farm-sidebar-day-row__temps">
                  <span class="farm-sidebar-day-row__high">{formatTemp(day.high)}</span>
                  <span class="farm-sidebar-day-row__low">{formatTemp(day.low)}</span>
                </div>
              </div>
            ))}
          </div>
        </aside>
      )}
    </div>
    {plots.length > 0 && (
      <a
        href="/plots/add/"
        class="btn-primary"
        aria-label={t('add_plot.add_plot')}
        style="position:fixed;bottom:calc(64px + var(--space-4));right:var(--space-4);z-index:50;border-radius:50%;width:56px;height:56px;display:flex;align-items:center;justify-content:center;font-size:1.5rem;box-shadow:0 4px 12px rgba(0,0,0,0.15);text-decoration:none;padding:0"
      >
        +
      </a>
    )}
    </>
  );
}

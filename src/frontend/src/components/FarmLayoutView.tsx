/**
 * Farm Layout View Island — T-FE-07
 * Spatial grid: Field → Bed → Plot (status-colored cells), read-only.
 */

import { useState, useEffect } from 'preact/hooks';
import type { FarmResponse, FarmPlotItem, PlotStatus } from '@litcrop/shared';
import { getFarm, getPlots } from '../lib/api';
import { t } from '../i18n/i18n';

const STATUS_CSS: Record<PlotStatus, string> = {
  issue: 'status-issue',
  animal_intrusion: 'status-intrusion',
  slow_growth: 'status-slow',
  healthy: 'status-healthy',
  no_data: 'status-nodata',
};

const STATUS_ICONS: Record<PlotStatus, string> = {
  issue: '⚠',
  animal_intrusion: '🦌',
  slow_growth: '⏱',
  healthy: '✓',
  no_data: '—',
};

export interface Props {
  farmId: string;
}

export default function FarmLayoutView({ farmId }: Props) {
  const [farm, setFarm] = useState<FarmResponse | null>(null);
  const [plots, setPlots] = useState<FarmPlotItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const effectiveFarmId =
    (typeof window !== 'undefined' && localStorage.getItem('litcrop-farmId')) || farmId;

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [farmData, plotData] = await Promise.all([
          getFarm(effectiveFarmId),
          getPlots(effectiveFarmId),
        ]);
        if (cancelled) return;
        setFarm(farmData);
        setPlots(plotData);
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
      <div style="padding:var(--space-4);display:flex;flex-direction:column;gap:var(--space-4)">
        {[0, 1].map((i) => (
          <div key={i}>
            <div class="skeleton skeleton-text-long mb-2" />
            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:var(--space-2)">
              {[0, 1, 2, 3, 4, 5].map((j) => (
                <div key={j} class="skeleton skeleton-thumb" />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error || !farm) {
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

  // Map bedId → plots
  const plotsByBed = plots.reduce((acc, p) => {
    if (!acc[p.bed_id]) acc[p.bed_id] = [];
    acc[p.bed_id].push(p);
    return acc;
  }, {} as Record<string, FarmPlotItem[]>);

  if (farm.fields.length === 0) {
    return (
      <div class="empty-state">
        <span class="empty-state__icon">🌱</span>
        <p class="empty-state__heading">{t('farm.no_plots')}</p>
        <p class="empty-state__body">{t('farm.no_plots_body')}</p>
      </div>
    );
  }

  return (
    <div style="padding:var(--space-4) var(--space-4) var(--space-8);display:flex;flex-direction:column;gap:var(--space-6)">
      {farm.fields.map((field) => (
        <section key={field.id} aria-labelledby={`field-${field.id}`}>
          <h2
            id={`field-${field.id}`}
            style="font-size:var(--font-size-lg);font-weight:var(--font-weight-bold);margin-bottom:var(--space-3);color:var(--color-text)"
          >
            🌾 {field.name}
          </h2>
          <div style="display:flex;flex-direction:column;gap:var(--space-4)">
            {field.beds.map((bed) => {
              const bedPlots = plotsByBed[bed.id] ?? [];
              return (
                <div key={bed.id}>
                  <div
                    style="font-size:var(--font-size-sm);font-weight:var(--font-weight-semibold);color:var(--color-gray-700);margin-bottom:var(--space-2)"
                  >
                    {bed.name}
                  </div>
                  {bedPlots.length === 0 ? (
                    <div
                      style="font-size:var(--font-size-sm);color:var(--color-gray-500);padding:var(--space-2) var(--space-3);background:var(--color-gray-100);border-radius:var(--radius-md)"
                    >
                      — No plots
                    </div>
                  ) : (
                    <div
                      style="display:grid;grid-template-columns:repeat(auto-fill,minmax(88px,1fr));gap:var(--space-2)"
                    >
                      {bedPlots.map((plot) => (
                        <a
                          key={plot.id}
                          href={`/plots/view?id=${plot.id}`}
                          class={STATUS_CSS[plot.latest_status]}
                          style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:80px;border-radius:var(--radius-md);padding:var(--space-2);text-decoration:none;gap:var(--space-1);border:2px solid transparent"
                          aria-label={`${plot.crop_type}, ${t(`status.${plot.latest_status}`)}`}
                        >
                          <span style="font-size:20px;line-height:1" aria-hidden="true">
                            {STATUS_ICONS[plot.latest_status]}
                          </span>
                          <span
                            style="font-size:var(--font-size-xs);font-weight:var(--font-weight-semibold);text-align:center;line-height:1.2"
                          >
                            {plot.crop_type}
                          </span>
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

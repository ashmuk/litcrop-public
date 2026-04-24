/**
 * Farm Layout View Island — T-FE-07
 * Spatial grid: beds rendered in a rows x cols grid, status-colored cells.
 * Updated: Phase D — flat bed grid replaces Field/Bed/Plot hierarchy (ADR-20260322)
 */

import { useState, useEffect } from 'preact/hooks';
import type { FarmResponse } from '@litcrop/shared';
import { getFarm } from '../lib/api';
import { t } from '../i18n/i18n';
import { STATUS_CSS, STATUS_ICONS } from '../lib/status';
import { getCropDisplay, getCropName } from '../lib/crops';
import { useLocalFarmId } from '../lib/hooks';

export interface Props {
  farmId: string;
}

export default function FarmLayoutView({ farmId }: Props) {
  const [farm, setFarm] = useState<FarmResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const effectiveFarmId = useLocalFarmId(farmId);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const farmData = await getFarm(effectiveFarmId);
        if (cancelled) return;
        setFarm(farmData);
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

  if (farm.beds.length === 0) {
    return (
      <div class="empty-state">
        <span class="empty-state__icon">🌱</span>
        <p class="empty-state__heading">{t('farm.no_beds')}</p>
        <p class="empty-state__body">{t('farm.no_beds_body')}</p>
      </div>
    );
  }

  // Build grid: beds indexed by (row, col)
  const bedGrid: Record<string, typeof farm.beds[0]> = {};
  for (const bed of farm.beds) {
    bedGrid[`${bed.row}-${bed.col}`] = bed;
  }

  const rows = farm.grid_rows;
  const cols = farm.grid_cols;

  return (
    <div style="padding:var(--space-4) var(--space-4) var(--space-8);display:flex;flex-direction:column;gap:var(--space-4)">
      <h2
        style="font-size:var(--font-size-lg);font-weight:var(--font-weight-bold);color:var(--color-text)"
      >
        🌾 {farm.name} ({rows} x {cols})
      </h2>
      <div
        style={`display:grid;grid-template-columns:repeat(${cols},1fr);gap:var(--space-2)`}
      >
        {Array.from({ length: rows }, (_, r) =>
          Array.from({ length: cols }, (_, c) => {
            const bed = bedGrid[`${r + 1}-${c + 1}`];
            if (!bed) {
              return (
                <div
                  key={`${r}-${c}`}
                  style="min-height:80px;border-radius:var(--radius-md);padding:var(--space-2);background:var(--color-gray-100);display:flex;align-items:center;justify-content:center;color:var(--color-gray-400);font-size:var(--font-size-sm)"
                >
                  —
                </div>
              );
            }
            // Wave C (#279) — prefer canonical active_crop; shim mirrors legacy until Wave E.
            const cropType = bed.active_crop?.crop_type ?? bed.crop_type;
            return (
              <a
                key={bed.id}
                href={`/beds/view?id=${bed.id}`}
                class={STATUS_CSS[bed.latest_status]}
                style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:80px;border-radius:var(--radius-md);padding:var(--space-2);text-decoration:none;gap:var(--space-1);border:2px solid transparent"
                aria-label={`${bed.name}${cropType ? ` — ${getCropName(cropType)}` : ''}, ${t(`status.${bed.latest_status}`)}`}
              >
                <span style="font-size:20px;line-height:1" aria-hidden="true">
                  {STATUS_ICONS[bed.latest_status]}
                </span>
                <span
                  style="font-size:var(--font-size-xs);font-weight:var(--font-weight-bold);text-align:center;line-height:1.2"
                >
                  {bed.name}
                </span>
                <span
                  style="font-size:var(--font-size-xs);text-align:center;line-height:1.2;color:var(--color-gray-700)"
                >
                  {getCropDisplay(cropType) || t('bed.empty')}
                </span>
              </a>
            );
          }),
        )}
      </div>
    </div>
  );
}

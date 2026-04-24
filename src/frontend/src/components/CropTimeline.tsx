/**
 * CropTimeline — Dual-bar Gantt chart (#276)
 *
 * Shows reserved (planned) and actual (diary-logged) bars per bed.
 * Reserved = amber dashed (from bed.planted_at / expected_harvest)
 * Actual   = green solid (from planting/harvesting diary entries)
 */

import { t } from '../i18n/i18n';
import { parseDate, computeBarPosition, buildActualDatesMap, toDateString } from '../lib/diary-utils';
import { getCropName } from '../lib/crops';
import type { DiaryEntryResponse } from '../lib/api';

/**
 * Wave C (#279) — One row per crop cycle. `cropId` is null for the legacy
 * virtual projection (bed has inline crop fields but no real BedCrop row).
 */
interface TimelineRow {
  id: string;              // `${bedId}:${cropId ?? 'legacy'}`
  bedId: string;
  bedName: string;
  cropId: string | null;
  cropType: string | null;
  planted_at?: string | null;
  expected_harvest?: string | null;
}

interface Props {
  rows: TimelineRow[];
  entries?: DiaryEntryResponse[];
  year: number;
  month: number; // 0-based
}

export default function CropTimeline({ rows, entries = [], year, month }: Props) {
  const actualMap = buildActualDatesMap(entries);

  // Show rows that have reserved dates OR actual (diary-derived) dates.
  const eligible = rows.filter((r) => {
    const hasReserved = r.planted_at && r.expected_harvest;
    const hasActual = actualMap.has(r.cropId ?? r.bedId);
    return hasReserved || hasActual;
  });

  if (eligible.length === 0) {
    if (rows.length === 0) return null;
    return (
      <div class="crop-timeline">
        <div class="crop-timeline__title">{t('diary.crop_timeline')}</div>
        <p class="crop-timeline__empty">{t('diary.crop_timeline_empty')}</p>
      </div>
    );
  }

  const monthStart = new Date(year, month, 1, 0, 0, 0);
  const monthEnd = new Date(year, month + 1, 0, 23, 59, 59);

  const now = new Date();
  const todayPct =
    now >= monthStart && now <= monthEnd
      ? ((now.getTime() - monthStart.getTime()) / (monthEnd.getTime() - monthStart.getTime())) * 100
      : null;

  const rowPositions = eligible
    .map((row) => {
      // Reserved bar position
      let reservedPos: { left: number; width: number } | null = null;
      if (row.planted_at && row.expected_harvest) {
        reservedPos = computeBarPosition(
          parseDate(row.planted_at), parseDate(row.expected_harvest), monthStart, monthEnd,
        );
      }

      // Actual bar + dots keyed per-crop (falls back to bed when cropId=null,
      // matching the cascade in buildActualDatesMap / buildEventDotMap).
      let actualPos: { left: number; width: number } | null = null;
      const actual = actualMap.get(row.cropId ?? row.bedId);
      if (actual?.planted) {
        const actualEnd = actual.harvested ?? toDateString(new Date());
        actualPos = computeBarPosition(
          parseDate(actual.planted), parseDate(actualEnd), monthStart, monthEnd,
        );
      }

      if (!reservedPos && !actualPos) return null;
      return { row, reservedPos, actualPos, actual };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (rowPositions.length === 0) return null;

  // Month + weekly grid (#294)
  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const jaMonthNames = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
  const locale = typeof window !== 'undefined' ? (localStorage.getItem('litcrop-locale') ?? 'en') : 'en';
  const mNames = locale === 'ja' ? jaMonthNames : monthNames;
  const daysInMonth = monthEnd.getDate();
  // Weekly grid: lines at every 7 days
  const weekTicks = [7, 14, 21, 28].filter((d) => d < daysInMonth).map((d) => (d / daysInMonth) * 100);

  return (
    <div class="crop-timeline">
      <div class="crop-timeline__title">{t('diary.crop_timeline')} — {mNames[month]} {year}</div>
      {/* Month label + weekly grid header */}
      <div class="crop-timeline__markers" style={{ paddingLeft: 'var(--crop-timeline-label-w, 80px)' }}>
        <span class="crop-timeline__marker-label" style={{ left: '0%' }}>{mNames[month]}</span>
        {weekTicks.map((pct, i) => (
          <span key={i} class="crop-timeline__marker-label crop-timeline__marker-label--week" style={{ left: `${pct}%` }}>W{i + 2}</span>
        ))}
      </div>
      {rowPositions.map(({ row, reservedPos, actualPos, actual }) => (
        <div key={row.id} class="crop-timeline__row">
          <div
            class="crop-timeline__label"
            title={`${row.bedName}${row.cropType ? ` — ${getCropName(row.cropType)}` : ''}`}
          >
            {row.bedName}
            {row.cropType && (
              <span class="crop-timeline__label-crop">{` ${getCropName(row.cropType)}`}</span>
            )}
          </div>
          <div class="crop-timeline__track">
            {/* Week tick lines */}
            {weekTicks.map((pct) => (
              <div key={pct} class="crop-timeline__week-tick" style={{ left: `${pct}%` }} aria-hidden="true" />
            ))}
            {todayPct !== null && (
              <div class="crop-timeline__today" style={{ left: `${todayPct}%` }} aria-hidden="true" />
            )}
            {/* Reserved bar (amber dashed, background layer) */}
            {reservedPos && (
              <div
                class="crop-timeline__bar crop-timeline__bar--reserved"
                style={{ left: `${reservedPos.left}%`, width: `${reservedPos.width}%` }}
                title={`${t('timeline.reserved')}: ${row.planted_at} → ${row.expected_harvest}`}
              />
            )}
            {/* Actual bar (green solid, foreground layer) */}
            {actualPos && (
              <a
                href={`/beds/view?id=${row.bedId}`}
                class="crop-timeline__bar crop-timeline__bar--actual"
                style={{ left: `${actualPos.left}%`, width: `${actualPos.width}%` }}
                title={`${t('timeline.actual')}: ${actual?.planted} → ${actual?.harvested ?? t('timeline.in_progress')}`}
                aria-label={`${row.bedName} timeline`}
              />
            )}
            {/* Fallback: if only reserved bar, still make it clickable */}
            {reservedPos && !actualPos && (
              <a
                href={`/beds/view?id=${row.bedId}`}
                class="crop-timeline__bar--overlay"
                style={{ left: `${reservedPos.left}%`, width: `${reservedPos.width}%` }}
                aria-label={`${row.bedName} timeline`}
              />
            )}
          </div>
        </div>
      ))}
      {/* Legend */}
      <div class="crop-timeline__legend">
        <span class="crop-timeline__legend-item">
          <span class="crop-timeline__swatch crop-timeline__swatch--reserved" />
          {t('timeline.reserved')}
        </span>
        <span class="crop-timeline__legend-item">
          <span class="crop-timeline__swatch crop-timeline__swatch--actual" />
          {t('timeline.actual')}
        </span>
        <span class="crop-timeline__legend-item">
          <span class="crop-timeline__swatch crop-timeline__swatch--today" />
          {t('timeline.today')}
        </span>
      </div>
    </div>
  );
}

/**
 * GanttChart — Multi-month Gantt with diary event dots (#297)
 *
 * Renders bed timelines across a 6-month (mobile) or 12-month (desktop) range.
 * Features: reserved/actual bars, diary event dots, active/obsolete bed panes.
 * Separate from CropTimeline (single-month calendar embed).
 */

import { useState, useMemo, useEffect, useRef } from 'preact/hooks';
import { t } from '../i18n/i18n';
import { parseDate, computeBarPosition, buildActualDatesMap, buildEventDotMap, toDateString } from '../lib/diary-utils';
import { getCropName, getCropEmoji } from '../lib/crops';
import { CATEGORY_META } from '../lib/diary';
import type { DiaryEntryResponse } from '../lib/api';
import type { EventDot } from '../lib/diary-utils';

// ── Types ────────────────────────────────────────────────────────

/**
 * Wave C (#279) — One row per crop cycle (not per bed). Multi-crop beds
 * produce multiple rows. `cropId` is null for the legacy virtual projection
 * (bed has inline crop fields but no real BedCrop row yet).
 */
interface GanttRow {
  id: string;              // stable row key: `${bedId}:${cropId ?? 'legacy'}`
  bedId: string;
  bedName: string;
  cropId: string | null;   // null ⇒ virtual legacy; handlers dispatch to legacy PATCH
  cropType: string | null;
  planted_at?: string | null;
  expected_harvest?: string | null;
  completed_at?: string | null;
}

interface Props {
  rows: GanttRow[];
  entries: DiaryEntryResponse[];
  onDotClick?: (date: string, entryId: string) => void;
  onMarkDone?: (bedId: string, cropId: string | null) => void;
  onUndoDone?: (bedId: string, cropId: string | null) => void;
}

// ── Helpers ──────────────────────────────────────────────────────

const LS_DONE_COLLAPSED = 'litcrop-gantt-done-collapsed';

/** Build month headers for the visible range */
function buildMonthHeaders(rangeStart: Date, rangeEnd: Date): Array<{ label: string; left: number; width: number }> {
  const totalMs = rangeEnd.getTime() - rangeStart.getTime();
  if (totalMs <= 0) return [];

  const headers: Array<{ label: string; left: number; width: number }> = [];
  const locale = typeof window !== 'undefined' ? (localStorage.getItem('litcrop-locale') ?? 'en') : 'en';

  const cursor = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1);
  while (cursor < rangeEnd) {
    const monthStart = new Date(Math.max(cursor.getTime(), rangeStart.getTime()));
    const nextMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    const monthEnd = new Date(Math.min(nextMonth.getTime(), rangeEnd.getTime()));

    const left = ((monthStart.getTime() - rangeStart.getTime()) / totalMs) * 100;
    const width = ((monthEnd.getTime() - monthStart.getTime()) / totalMs) * 100;

    const label = cursor.toLocaleDateString(locale === 'ja' ? 'ja-JP' : 'en-US', { month: 'short' });
    headers.push({ label, left, width });

    cursor.setMonth(cursor.getMonth() + 1);
  }

  return headers;
}

// ── Component ────────────────────────────────────────────────────

export default function GanttChart({ rows, entries, onDotClick, onMarkDone, onUndoDone }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [doneCollapsed, setDoneCollapsed] = useState(() => {
    try { return localStorage.getItem(LS_DONE_COLLAPSED) === 'true'; } catch { return false; }
  });

  // Responsive: 6 months mobile, 12 months desktop
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
  const monthsAhead = isMobile ? 3 : 9;
  const monthsBack = 3;

  const now = new Date();
  const rangeStart = new Date(now.getFullYear(), now.getMonth() - monthsBack, 1);
  const rangeEnd = new Date(now.getFullYear(), now.getMonth() + monthsAhead + 1, 0, 23, 59, 59);
  const totalMs = rangeEnd.getTime() - rangeStart.getTime();

  // Today indicator position
  const todayPct = ((now.getTime() - rangeStart.getTime()) / totalMs) * 100;

  // Month headers (deps use primitives to avoid stale closure — range is stable per mount)
  const monthHeaders = useMemo(
    () => buildMonthHeaders(rangeStart, rangeEnd),
    [rangeStart.getTime(), rangeEnd.getTime()],
  );

  // Diary data maps
  const actualMap = useMemo(() => buildActualDatesMap(entries), [entries]);
  const dotMap = useMemo(() => buildEventDotMap(entries), [entries]);

  // Split active vs done rows (completed_at drives the divide for both real
  // BedCrops and the legacy virtual fallback — unified predicate).
  const activeRows = useMemo(() => rows.filter((r) => !r.completed_at), [rows]);
  const doneRows = useMemo(() => rows.filter((r) => !!r.completed_at), [rows]);

  // Auto-scroll to center today on mount
  useEffect(() => {
    if (scrollRef.current) {
      const container = scrollRef.current;
      const todayOffset = (todayPct / 100) * container.scrollWidth;
      container.scrollLeft = todayOffset - container.clientWidth / 2;
    }
  }, []);

  function toggleDoneCollapsed() {
    setDoneCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem(LS_DONE_COLLAPSED, String(next)); } catch {}
      return next;
    });
  }

  function renderRow(row: GanttRow, isDone: boolean) {
    // Reserved bar
    let reservedPos: { left: number; width: number } | null = null;
    if (row.planted_at && row.expected_harvest) {
      reservedPos = computeBarPosition(parseDate(row.planted_at), parseDate(row.expected_harvest), rangeStart, rangeEnd);
    }

    // Actual bar + dots keyed per-crop (falls back to bed when cropId=null,
    // matching the cascade in buildActualDatesMap / buildEventDotMap).
    let actualPos: { left: number; width: number } | null = null;
    const diaryKey = row.cropId ?? row.bedId;
    const actual = actualMap.get(diaryKey);
    if (actual?.planted) {
      const actualEnd = actual.harvested ?? toDateString(new Date());
      actualPos = computeBarPosition(parseDate(actual.planted), parseDate(actualEnd), rangeStart, rangeEnd);
    }

    const dots = dotMap.get(diaryKey) ?? [];

    const label = `${row.bedName}${row.cropType ? ` — ${getCropName(row.cropType)}` : ''}`;

    return (
      <div key={row.id} class={`gantt__row${isDone ? ' gantt__row--done' : ''}`}>
        <div class="gantt__label" title={label}>
          <span class="gantt__label-text">
            {row.cropType && <span class="gantt__label-emoji">{getCropEmoji(row.cropType)}</span>}
            {row.bedName}
          </span>
          {!isDone && onMarkDone && (
            <button
              type="button"
              class="gantt__done-btn"
              onClick={(e) => { e.stopPropagation(); onMarkDone(row.bedId, row.cropId); }}
              title={t('gantt.mark_done')}
              aria-label={`${t('gantt.mark_done')}: ${label}`}
            >✓</button>
          )}
          {isDone && onUndoDone && (
            <button
              type="button"
              class="gantt__undo-btn"
              onClick={(e) => { e.stopPropagation(); onUndoDone(row.bedId, row.cropId); }}
              title={t('gantt.undo_done')}
              aria-label={`${t('gantt.undo_done')}: ${label}`}
            >↺</button>
          )}
        </div>
        <div class="gantt__track">
          {/* Month grid lines */}
          {monthHeaders.map((mh, i) => (
            <div key={i} class="gantt__month-line" style={{ left: `${mh.left}%` }} aria-hidden="true" />
          ))}
          {/* Today line */}
          <div class="gantt__today" style={{ left: `${todayPct}%` }} aria-hidden="true" />
          {/* Reserved bar */}
          {reservedPos && (
            <div
              class="gantt__bar gantt__bar--reserved"
              style={{ left: `${reservedPos.left}%`, width: `${reservedPos.width}%` }}
              title={`${t('timeline.reserved')}: ${row.planted_at} → ${row.expected_harvest}`}
            />
          )}
          {/* Actual bar */}
          {actualPos && (
            <div
              class="gantt__bar gantt__bar--actual"
              style={{ left: `${actualPos.left}%`, width: `${actualPos.width}%` }}
              title={`${t('timeline.actual')}: ${actual?.planted} → ${actual?.harvested ?? t('timeline.in_progress')}`}
            />
          )}
          {/* Event dots */}
          {dots.map((dot) => {
            const dotDate = parseDate(dot.date);
            if (dotDate < rangeStart || dotDate > rangeEnd) return null;
            const dotPct = ((dotDate.getTime() - rangeStart.getTime()) / totalMs) * 100;
            return (
              <button
                key={dot.id}
                type="button"
                class="gantt__dot"
                style={{ left: `${dotPct}%`, backgroundColor: dot.color }}
                title={`${CATEGORY_META[dot.category]?.icon ?? '📝'} ${dot.date}`}
                onClick={(e) => { e.stopPropagation(); onDotClick?.(dot.date, dot.id); }}
                aria-label={`${t(`diary.categories.${dot.category}`)} ${dot.date}`}
              />
            );
          })}
        </div>
      </div>
    );
  }

  const hasActive = activeRows.length > 0;
  const hasDone = doneRows.length > 0;

  if (!hasActive && !hasDone) {
    return (
      <div class="gantt">
        <div class="empty-state">
          <span class="empty-state__icon">📊</span>
          <p class="empty-state__heading">{t('gantt.empty')}</p>
          <p class="empty-state__body">Add crop dates to beds to see them here.</p>
        </div>
      </div>
    );
  }

  return (
    <div class="gantt">
      {/* Scroll container: header + rows scroll together */}
      <div class="gantt__scroll" ref={scrollRef}>
        {/* Header with month columns */}
        <div class="gantt__header">
          <div class="gantt__label gantt__label--header" />
          <div class="gantt__track gantt__track--header">
            {monthHeaders.map((mh, i) => (
              <div
                key={i}
                class={`gantt__month-header${mh.left <= todayPct && todayPct < mh.left + mh.width ? ' gantt__month-header--current' : ''}`}
                style={{ left: `${mh.left}%`, width: `${mh.width}%` }}
              >
                {mh.label}
              </div>
            ))}
          </div>
        </div>

        {/* Active rows (one per active crop; legacy virtual collapses to one) */}
        {activeRows.map((row) => renderRow(row, false))}

        {/* Done divider */}
        {hasDone && (
          <button
            type="button"
            class="gantt__divider"
            onClick={toggleDoneCollapsed}
            aria-expanded={!doneCollapsed}
          >
            <span class="gantt__divider-arrow">{doneCollapsed ? '▶' : '▼'}</span>
            {t('gantt.done_section')} ({doneRows.length})
          </button>
        )}

        {/* Done rows */}
        {hasDone && !doneCollapsed && doneRows.map((row) => renderRow(row, true))}
      </div>

      {/* Legend */}
      <div class="gantt__legend">
        <span class="gantt__legend-item">
          <span class="gantt__swatch gantt__swatch--reserved" />
          {t('timeline.reserved')}
        </span>
        <span class="gantt__legend-item">
          <span class="gantt__swatch gantt__swatch--actual" />
          {t('timeline.actual')}
        </span>
        <span class="gantt__legend-item">
          <span class="gantt__swatch gantt__swatch--today" />
          {t('timeline.today')}
        </span>
        {Object.entries(CATEGORY_META).slice(0, 5).map(([key, meta]) => (
          <span key={key} class="gantt__legend-item">
            <span class="gantt__swatch" style={{ backgroundColor: meta.color }} />
            {meta.icon}
          </span>
        ))}
      </div>
    </div>
  );
}

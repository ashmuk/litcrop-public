/**
 * DiaryCalendar — Beta-7: Farm Diary (T3.2)
 *
 * Monthly calendar grid with category dots per day.
 * Pure CSS/Preact — no external libraries.
 *
 * AC-3: Full keyboard navigation (arrow keys + Enter/Space).
 */

import { useRef, useMemo } from 'preact/hooks';
import type { DiaryEntryResponse } from '../lib/api';
import { CATEGORY_META, getLocale } from '../lib/diary';

// ── Helpers ───────────────────────────────────────────────────────

/** Format YYYY-MM-DD from a Date object */
function toDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Today as YYYY-MM-DD */
function todayString(): string {
  return toDateString(new Date());
}

/** Day-of-week abbreviated labels for the given locale (Sun-first or Mon-first per locale) */
function getDayLabels(locale: string): string[] {
  // Build 7 labels starting from Sunday (index 0)
  const labels: string[] = [];
  const base = new Date(2023, 0, 1); // Sunday Jan 1 2023
  for (let i = 0; i < 7; i++) {
    const d = new Date(base);
    d.setDate(1 + i);
    labels.push(d.toLocaleDateString(locale, { weekday: 'short' }));
  }
  return labels;
}

/** Build the calendar grid cells for a given year/month.
 *  Returns an array of { date: YYYY-MM-DD | null, outside: boolean } objects.
 *  null cells are padding slots at start/end. */
function buildCalendarCells(year: number, month: number): Array<{ date: string; outside: boolean }> {
  // First day of month
  const firstDay = new Date(year, month, 1);
  // Last day of month
  const lastDay = new Date(year, month + 1, 0);

  const cells: Array<{ date: string; outside: boolean }> = [];

  // Leading days from previous month (0 = Sunday, fill until first weekday matches)
  const startDow = firstDay.getDay(); // 0=Sun
  for (let i = startDow - 1; i >= 0; i--) {
    const d = new Date(year, month, -i);
    cells.push({ date: toDateString(d), outside: true });
  }

  // Days in current month
  for (let d = 1; d <= lastDay.getDate(); d++) {
    cells.push({ date: toDateString(new Date(year, month, d)), outside: false });
  }

  // Trailing days from next month
  const endDow = lastDay.getDay(); // 0=Sun
  const trailingCount = endDow === 6 ? 0 : 6 - endDow;
  for (let i = 1; i <= trailingCount; i++) {
    const d = new Date(year, month + 1, i);
    cells.push({ date: toDateString(d), outside: true });
  }

  return cells;
}

/** Build map of date → unique category colors (max 3) */
function buildDotMap(entries: DiaryEntryResponse[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const entry of entries) {
    const existing = map.get(entry.date);
    const meta = CATEGORY_META[entry.category] ?? CATEGORY_META.other;
    if (!existing) {
      map.set(entry.date, [meta.color]);
    } else {
      if (!existing.includes(meta.color) && existing.length < 3) {
        existing.push(meta.color);
      }
    }
  }
  return map;
}

// ── Props ─────────────────────────────────────────────────────────

interface Props {
  entries: DiaryEntryResponse[];
  year: number;
  month: number; // 0-based (JavaScript Date month)
  onDaySelect: (date: string) => void; // YYYY-MM-DD
  selectedDate: string | null;
  onPrevMonth: () => void;
  onNextMonth: () => void;
}

// ── Component ─────────────────────────────────────────────────────

export default function DiaryCalendar({ entries, year, month, onDaySelect, selectedDate, onPrevMonth, onNextMonth }: Props) {
  const locale = getLocale();
  const today = todayString();
  const cells = useMemo(() => buildCalendarCells(year, month), [year, month]);
  const dotMap = useMemo(() => buildDotMap(entries), [entries]);
  const dayLabels = useMemo(() => getDayLabels(locale), [locale]);
  const gridRef = useRef<HTMLDivElement>(null);

  // Format month header label
  const headerDate = new Date(year, month, 1);
  const headerLabel = headerDate.toLocaleDateString(locale, { month: 'long', year: 'numeric' });

  // Keyboard navigation within the grid
  function handleKeyDown(e: KeyboardEvent) {
    const grid = gridRef.current;
    if (!grid) return;

    const focused = document.activeElement as HTMLElement | null;
    if (!focused) return;

    // Only navigate between in-month cells (skip outside-month padding)
    const allCells = Array.from(grid.querySelectorAll<HTMLElement>('[data-date]:not(.calendar__cell--outside)'));
    const idx = allCells.indexOf(focused);
    if (idx === -1) return;

    let next = idx;
    if (e.key === 'ArrowRight') { next = idx + 1; }
    else if (e.key === 'ArrowLeft') { next = idx - 1; }
    else if (e.key === 'ArrowDown') { next = idx + 7; }
    else if (e.key === 'ArrowUp') { next = idx - 7; }
    else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const date = focused.getAttribute('data-date');
      if (date) onDaySelect(date);
      return;
    } else {
      return;
    }

    e.preventDefault();
    if (next >= 0 && next < allCells.length) {
      allCells[next].focus();
    }
  }

  return (
    <div class="calendar" style={{ padding: 'var(--space-4)' }}>
      {/* Month header */}
      <div class="calendar__header">
        <button
          type="button"
          class="btn btn--secondary btn--sm"
          onClick={onPrevMonth}
          aria-label="Previous month"
        >
          ◀
        </button>
        <span style={{ fontWeight: 'var(--font-weight-semibold)', fontSize: 'var(--font-size-base)' }}>
          {headerLabel}
        </span>
        <button
          type="button"
          class="btn btn--secondary btn--sm"
          onClick={onNextMonth}
          aria-label="Next month"
        >
          ▶
        </button>
      </div>

      {/* Day-of-week labels */}
      <div class="calendar__grid" style={{ marginTop: 'var(--space-3)' }}>
        {dayLabels.map((label) => (
          <div key={label} class="calendar__day-label" aria-hidden="true">
            {label}
          </div>
        ))}

        {/* Day cells — keyboard nav grid */}
        <div
          ref={gridRef}
          style={{ display: 'contents' }}
          role="grid"
          aria-label={headerLabel}
          onKeyDown={handleKeyDown}
        >
          {cells.map(({ date, outside }) => {
            const isSelected = date === selectedDate;
            const isToday = date === today;
            const dots = dotMap.get(date) ?? [];

            let cellClass = 'calendar__cell';
            if (outside) cellClass += ' calendar__cell--outside';
            if (isToday) cellClass += ' calendar__cell--today';
            if (isSelected) cellClass += ' calendar__cell--selected';

            const dayNum = parseInt(date.slice(8), 10);

            return (
              <div
                key={date}
                class={cellClass}
                data-date={date}
                role="gridcell"
                tabIndex={isSelected || (!selectedDate && !outside && date === today) ? 0 : -1}
                aria-selected={isSelected}
                aria-label={date}
                onClick={() => onDaySelect(date)}
              >
                <span style={{ fontSize: 'var(--font-size-sm)' }}>{dayNum}</span>
                {dots.length > 0 && (
                  <div class="calendar__dots" aria-hidden="true">
                    {dots.map((color, i) => (
                      <span key={i} class="calendar__dot" style={{ background: color }} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

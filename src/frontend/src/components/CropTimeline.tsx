/**
 * CropTimeline — Beta-7: Farm Diary (T3.3)
 *
 * Horizontal bars showing planted_at → expected_harvest per bed,
 * positioned relative to the visible month.
 */

import { t } from '../i18n/i18n';

// ── Types ─────────────────────────────────────────────────────────

interface BedTimelineItem {
  id: string;
  name: string;
  crop_type: string | null;
  planted_at?: string | null;
  expected_harvest?: string | null;
}

interface Props {
  beds: BedTimelineItem[];
  year: number;
  month: number; // 0-based
}

// ── Helpers ───────────────────────────────────────────────────────

/** Parse a YYYY-MM-DD string into a Date (local midnight). */
function parseDate(s: string): Date {
  return new Date(s + 'T00:00:00');
}

/**
 * Compute left% and width% for a bar that spans [start, end]
 * relative to the visible month [monthStart, monthEnd].
 * Returns null if there is no overlap with the month.
 */
function computeBarPosition(
  planted: Date,
  harvest: Date,
  monthStart: Date,
  monthEnd: Date,
): { left: number; width: number } | null {
  // Clamp bar to visible month
  const barStart = planted < monthStart ? monthStart : planted;
  const barEnd = harvest > monthEnd ? monthEnd : harvest;

  if (barStart >= barEnd) return null; // >= catches planted === harvest (zero-width)

  const totalMs = monthEnd.getTime() - monthStart.getTime();
  if (totalMs <= 0) return null;

  const left = ((barStart.getTime() - monthStart.getTime()) / totalMs) * 100;
  const width = ((barEnd.getTime() - barStart.getTime()) / totalMs) * 100;

  return { left: Math.max(0, left), width: Math.max(0.5, width) }; // min 0.5% visible
}

// ── Component ─────────────────────────────────────────────────────

export default function CropTimeline({ beds, year, month }: Props) {
  // Only beds with both planted_at and expected_harvest
  const eligible = beds.filter((b) => b.planted_at && b.expected_harvest);
  if (eligible.length === 0) return null;

  // Month boundaries
  const monthStart = new Date(year, month, 1, 0, 0, 0);
  const monthEnd = new Date(year, month + 1, 0, 23, 59, 59); // last day of month

  // Today marker position within the month
  const now = new Date();
  const todayPct =
    now >= monthStart && now <= monthEnd
      ? ((now.getTime() - monthStart.getTime()) / (monthEnd.getTime() - monthStart.getTime())) * 100
      : null;

  // Rows with bar positions
  const rows = eligible
    .map((bed) => {
      const planted = parseDate(bed.planted_at!);
      const harvest = parseDate(bed.expected_harvest!);
      const pos = computeBarPosition(planted, harvest, monthStart, monthEnd);
      return { bed, pos };
    })
    .filter((r) => r.pos !== null);

  if (rows.length === 0) return null;

  return (
    <div class="crop-timeline" style={{ padding: '0 var(--space-4)' }}>
      <div class="crop-timeline__title">{t('diary.crop_timeline')}</div>
      {rows.map(({ bed, pos }) => (
        <div key={bed.id} class="crop-timeline__row">
          <div
            class="crop-timeline__label"
            title={`${bed.name}${bed.crop_type ? ` — ${bed.crop_type}` : ''}`}
          >
            {bed.name}
            {bed.crop_type && (
              <span style={{ color: 'var(--color-text-secondary, #6b7280)', marginLeft: '2px' }}>
                {` ${bed.crop_type}`}
              </span>
            )}
          </div>
          <div class="crop-timeline__track">
            {/* Today marker */}
            {todayPct !== null && (
              <div
                class="crop-timeline__today"
                style={{ left: `${todayPct}%` }}
                aria-hidden="true"
              />
            )}
            {/* Bed bar */}
            <a
              href={`/beds/view?id=${bed.id}`}
              class="crop-timeline__bar"
              style={{ left: `${pos!.left}%`, width: `${pos!.width}%` }}
              aria-label={`${bed.name} timeline`}
              title={`${bed.planted_at} → ${bed.expected_harvest}`}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

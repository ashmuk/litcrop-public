/**
 * DeviceHealthIndicators — #453, #457 (v0.99.6.2)
 *
 * Small presentational primitives for the device-card health grid. Split
 * into their own module so the render logic can be unit-tested in
 * isolation and reused by future device-detail views without pulling in
 * DeviceListPage's action callbacks.
 *
 *   WifiBars   — 4-bar SVG signal indicator (≈ mobile radio icon).
 *   StorageBar — horizontal progress bar with percent fill.
 *
 * Both components accept null/unknown inputs and render a neutral empty
 * state — they never throw, so callers can pass raw heartbeat fields
 * directly without null-guards.
 */

export type WifiLevel = 0 | 1 | 2 | 3 | 4;

/**
 * Map a WiFi dBm reading to 0–4 bars. Thresholds match the industry-wide
 * signal-quality tiers so a -55 dBm Pi lights all 4 bars (as a phone
 * would). Null / out-of-range → 0 bars.
 */
export function wifiBarCount(dbm: number | null | undefined): WifiLevel {
  if (dbm === null || dbm === undefined || !Number.isFinite(dbm)) return 0;
  if (dbm >= -55) return 4;
  if (dbm >= -65) return 3;
  if (dbm >= -75) return 2;
  if (dbm >= -85) return 1;
  return 0;
}

interface WifiBarsProps {
  dbm: number | null | undefined;
  /** Tailwind/utility class for color ("var(--color-...)"). Applied to lit bars only. */
  colorVar?: string;
  size?: number;
}

/**
 * SVG 4-bar indicator. Unlit bars render in a neutral gray (--color-
 * gray-300) so the strength reading is readable against the
 * existing card background. The aria-label combines qualitative
 * (bar count) and quantitative (dBm) information for screen readers.
 */
export function WifiBars({ dbm, colorVar = 'var(--color-gray-800)', size = 18 }: WifiBarsProps) {
  const bars = wifiBarCount(dbm);
  const unlitColor = 'var(--color-gray-300)';
  const barWidth = 3;
  const barGap = 2;
  const totalBars = 4;
  const viewBoxWidth = totalBars * (barWidth + barGap);

  return (
    <svg
      viewBox={`0 0 ${viewBoxWidth} 16`}
      width={size}
      height={Math.round((size * 16) / viewBoxWidth)}
      role="img"
      aria-label={`WiFi signal ${bars} of 4 bars${dbm != null ? `, ${dbm} dBm` : ', no reading'}`}
      style="flex-shrink:0"
    >
      {Array.from({ length: totalBars }, (_, i) => {
        const heightPx = 4 + i * 4;
        return (
          <rect
            key={i}
            x={i * (barWidth + barGap)}
            y={16 - heightPx}
            width={barWidth}
            height={heightPx}
            rx={0.5}
            fill={bars > i ? colorVar : unlitColor}
          />
        );
      })}
    </svg>
  );
}

interface StorageBarProps {
  usedPct: number | null | undefined;
  /** 'healthy' | 'warning' | 'critical' — drives fill color */
  variant: 'healthy' | 'warning' | 'critical' | 'unknown';
}

/**
 * Horizontal progress bar clamped 0–100%. Null → empty track, same
 * visual weight as 0%. The variant arg maps to the existing health-cell
 * color palette so the bar stays consistent with the cell-background
 * coloring applied by DeviceListPage's storageHealthClass.
 */
function storageBarFillColor(variant: StorageBarProps['variant']): string {
  switch (variant) {
    case 'critical':
      return 'var(--color-status-issue)';
    case 'warning':
      return 'var(--color-status-warning, #b45309)';
    case 'unknown':
      return 'var(--color-gray-400)';
    default:
      return 'var(--color-status-healthy)';
  }
}

export function StorageBar({ usedPct, variant }: StorageBarProps) {
  const pct = usedPct != null && Number.isFinite(usedPct)
    ? Math.max(0, Math.min(100, usedPct))
    : 0;
  const fillColor = storageBarFillColor(variant);

  // a11y: when usedPct is unknown, the track is still rendered (as an empty
  // 0-width bar) so the grid doesn't jump height between known/unknown rows,
  // but we drop `role="progressbar"` + aria attributes entirely so screen
  // readers don't falsely announce "0% used" for a reading we don't have.
  const hasReading = usedPct != null && Number.isFinite(usedPct);

  return (
    <div
      role={hasReading ? 'progressbar' : undefined}
      aria-valuemin={hasReading ? 0 : undefined}
      aria-valuemax={hasReading ? 100 : undefined}
      aria-valuenow={hasReading ? usedPct : undefined}
      aria-label={hasReading ? `Storage ${usedPct}% used` : undefined}
      aria-hidden={hasReading ? undefined : 'true'}
      style="width:100%;height:4px;background:var(--color-gray-200);border-radius:2px;overflow:hidden;margin-top:2px"
    >
      <div
        style={`width:${pct}%;height:100%;background:${fillColor};transition:width 200ms ease`}
        aria-hidden="true"
      />
    </div>
  );
}

import { t } from '../i18n/i18n';

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Format a date as short month + day, e.g. "Mar 15" */
export function formatDateShort(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Format a timestamp as weekday + time, e.g. "Mon 06:15" */
export function formatFrameTime(iso: string): string {
  const d = new Date(iso);
  const day = d.toLocaleDateString(undefined, { weekday: 'short' });
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
  return `${day} ${time}`;
}

/** Translate a weather condition slug (e.g. 'clear_sky') via i18n, with title-case fallback. */
export function translateCondition(condition: string): string {
  const key = `weather_conditions.${condition}`;
  const translated = t(key);
  return translated === key ? condition.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : translated;
}

/** Convert wind direction degrees to 8-point cardinal abbreviation (N, NE, E, SE, S, SW, W, NW). */
export function degreeToCardinal(degrees: number): string {
  if (!Number.isFinite(degrees)) return '—';
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return dirs[((Math.round(degrees / 45) % 8) + 8) % 8];
}

/** Format an ISO timestamp as a relative time string (e.g. '5m ago', '2h ago', '3d ago'). */
export function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

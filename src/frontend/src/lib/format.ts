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

/** Translate a weather condition slug (e.g. 'clear_sky') via i18n, with title-case fallback. */
export function translateCondition(condition: string): string {
  const key = `weather_conditions.${condition}`;
  const translated = t(key);
  return translated === key ? condition.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : translated;
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

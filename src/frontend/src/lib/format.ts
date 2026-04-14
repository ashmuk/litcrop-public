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

/** Map a weather condition slug to an emoji icon. */
const CONDITION_EMOJI: Record<string, string> = {
  clear_sky: '☀️',
  mainly_clear: '🌤️',
  partly_cloudy: '⛅',
  overcast: '☁️',
  fog: '🌫️',
  drizzle: '🌦️',
  freezing_drizzle: '🌧️',
  rain: '🌧️',
  freezing_rain: '🌧️',
  snow: '🌨️',
  snow_grains: '🌨️',
  rain_showers: '🌦️',
  snow_showers: '🌨️',
  thunderstorm: '⛈️',
  thunderstorm_hail: '⛈️',
};

export function conditionToEmoji(condition: string): string {
  return CONDITION_EMOJI[condition] ?? '🌡️';
}

/** Translate a weather condition slug (e.g. 'clear_sky') via i18n, with title-case fallback. */
export function translateCondition(condition: string, translator: (key: string) => string = t): string {
  const key = `weather_conditions.${condition}`;
  const translated = translator(key);
  return translated === key ? condition.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : translated;
}

/** Convert wind direction degrees to 8-point cardinal abbreviation (N, NE, E, SE, S, SW, W, NW). */
export function degreeToCardinal(degrees: number): string {
  if (!Number.isFinite(degrees)) return '—';
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return dirs[((Math.round(degrees / 45) % 8) + 8) % 8];
}

/** Extract the YYYY-MM-DD date key from an ISO timestamp or Date (local timezone). */
export function toDateKey(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Format a UTC date key as "Today", "Yesterday", or short date (e.g. "Apr 11") */
export function formatDateLabel(dateKey: string): string {
  const now = new Date();
  const today = toDateKey(now);
  const yesterday = toDateKey(new Date(now.getTime() - 86400000));
  if (dateKey === today) return t('history.today');
  if (dateKey === yesterday) return t('history.yesterday');
  return formatDateShort(dateKey);
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

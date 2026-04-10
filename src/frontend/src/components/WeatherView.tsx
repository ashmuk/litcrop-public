/**
 * Weather View Island — T-FE-10
 * Current conditions, hourly forecast, 7-day forecast, crop impact, alerts.
 */

import { useState, useEffect } from 'preact/hooks';
import type { WeatherResponse, CropImpactCard } from '@litcrop/shared';
import { getWeather, ApiError } from '../lib/api';
import { createTranslator } from '../i18n/i18n';
import { useLocalFarmId, formatTemp } from '../lib/hooks';
import { degreeToCardinal, conditionToEmoji, translateCondition } from '../lib/format';
import { getCropName } from '../lib/crops';
import FarmLocationMap from './FarmLocationMap';

// Cache reverse geocode results across mount/unmount cycles
const geocodeCache = new Map<string, string | null>();

const IMPACT_CSS: Record<CropImpactCard['severity'], string> = {
  danger: 'status-issue',
  warning: 'status-slow',
  good: 'status-healthy',
  info: 'status-nodata',
};

/** Maps for translating weather impact titles, descriptions, and alert messages. */
const IMPACT_I18N: Record<string, { title: string; desc: string }> = {
  'Frost Risk': { title: 'weather.impact_frost_risk', desc: 'weather.impact_frost_desc' },
  'Heat Stress': { title: 'weather.impact_heat_stress', desc: 'weather.impact_heat_desc' },
  'Heavy Rain': { title: 'weather.impact_heavy_rain', desc: 'weather.impact_rain_desc' },
};

const ALERT_I18N: Record<string, string> = {
  frost: 'weather.alert_frost',
  heat: 'weather.alert_heat',
  rain: 'weather.alert_rain',
};

/**
 * Translate a string using an i18n key. If the key is not found in the map
 * or the translation returns the key itself (missing), fall back to the original text.
 */
function translateWithFallback(i18nKey: string | undefined, fallback: string, tl: (key: string) => string): string {
  if (!i18nKey) return fallback;
  const translated = tl(i18nKey);
  return translated === i18nKey ? fallback : translated;
}

function formatHour(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', hour12: false });
}

/** Format an ISO 8601 datetime as HH:MM (drops year/month/day). */
function formatTimeOnly(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function formatWeekday(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function getInitialLocale(): 'en' | 'ja' {
  try {
    const stored = localStorage.getItem('litcrop-locale');
    if (stored === 'en' || stored === 'ja') return stored;
  } catch {}
  return 'en';
}

export interface Props {
  farmId: string;
}

export default function WeatherView({ farmId }: Props) {
  const [weather, setWeather] = useState<WeatherResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [locale] = useState<'en' | 'ja'>(getInitialLocale);
  const [locationName, setLocationName] = useState<string | null>(null);

  const effectiveFarmId = useLocalFarmId(farmId);
  const tl = createTranslator(locale);

  const [needsCoordinates, setNeedsCoordinates] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getWeather(effectiveFarmId)
      .then((data) => { if (!cancelled) setWeather(data); })
      .catch((err) => {
        if (!cancelled) {
          if (err instanceof ApiError && err.statusCode === 400) {
            setNeedsCoordinates(true);
          } else {
            setError(tl('farm.error_loading'));
          }
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [effectiveFarmId]);

  // Reverse geocode when weather data (with coordinates) is available
  useEffect(() => {
    if (!weather) return;
    const { latitude, longitude } = weather;
    const cacheKey = `${latitude},${longitude},${locale}`;
    if (geocodeCache.has(cacheKey)) {
      setLocationName(geocodeCache.get(cacheKey)!);
      return;
    }
    const controller = new AbortController();
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&zoom=10`;
    fetch(url, {
      headers: { 'Accept-Language': locale, 'User-Agent': 'LitCrop/1.0' },
      signal: controller.signal,
    })
      .then((r) => r.json())
      .then((data: Record<string, unknown>) => {
        const addr = data['address'] as Record<string, string> | undefined;
        const name =
          (addr?.['state'] ?? addr?.['county'] ?? addr?.['city'] ?? addr?.['town'] ?? addr?.['village']) || null;
        geocodeCache.set(cacheKey, name);
        setLocationName(name);
      })
      .catch(() => {/* non-fatal */});
    return () => { controller.abort(); };
  }, [weather?.latitude, weather?.longitude, locale]);

  // Auto-scroll hourly pane to center the current hour
  useEffect(() => {
    if (!weather) return;
    const timer = setTimeout(() => {
      const currentHour = new Date().getHours();
      const card = document.getElementById(`hourly-card-${currentHour}`);
      if (card) {
        card.scrollIntoView({ behavior: 'instant', block: 'nearest', inline: 'center' });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [weather]);

  const xlat = (cond: string) => translateCondition(cond, tl);

  if (loading) {
    return (
      <div style="padding:var(--space-4);display:flex;flex-direction:column;gap:var(--space-4)">
        <div class="skeleton" style="height:160px;border-radius:var(--radius-lg)" />
        <div class="skeleton" style="height:120px;border-radius:var(--radius-lg)" />
        <div class="skeleton" style="height:200px;border-radius:var(--radius-lg)" />
      </div>
    );
  }

  if (needsCoordinates) {
    return (
      <div class="empty-state">
        <span class="empty-state__icon">⛅</span>
        <p class="empty-state__heading">{tl('weather.needs_coordinates')}</p>
        <p class="empty-state__body">{tl('weather.add_coordinates_hint')}</p>
      </div>
    );
  }

  if (error || !weather) {
    return (
      <div class="empty-state">
        <span class="empty-state__icon">⛅</span>
        <p class="empty-state__heading">{tl('farm.error_loading')}</p>
        <p class="empty-state__body">{tl('farm.error_body')}</p>
        <button class="btn-primary mt-4" onClick={() => location.reload()}>
          {tl('buttons.retry')}
        </button>
      </div>
    );
  }

  const { current, today, hourly, daily, alerts, crop_impact } = weather;

  return (
    <div>
      {/* Weather alerts (full width — above both columns) */}
      {alerts.map((alert, i) => (
        <div
          key={i}
          class="offline-banner"
          style={
            alert.severity === 'danger'
              ? 'background-color:#FFEBEE;color:#C62828;border-bottom-color:#EF9A9A'
              : 'background-color:#FFF8E1;color:#795B00;border-bottom-color:#F9DE7A'
          }
          role="alert"
          aria-live="assertive"
        >
          <span aria-hidden="true">{alert.severity === 'danger' ? '🚨' : '⚠️'}</span>
          <span>{translateWithFallback(ALERT_I18N[alert.type], alert.message, tl)}</span>
        </div>
      ))}

      {/* Desktop 2-column grid: left = current + hourly, right = 7-day + crop impact */}
      <div class="weather-desktop-grid">
        {/* Left column: current conditions + hourly */}
        <div class="weather-col-left">
          {/* Current conditions */}
          <div
            style="padding:var(--space-4);background:var(--color-surface);border-bottom:var(--border-default)"
          >
            <div style="display:flex;align-items:center;gap:var(--space-4)">
              <span style="font-size:64px;line-height:1" aria-hidden="true">
                {conditionToEmoji(current.condition_icon)}
              </span>
              <div>
                <div
                  style="font-size:48px;font-weight:var(--font-weight-bold);line-height:1;color:var(--color-text)"
                >
                  {formatTemp(current.temperature)}
                </div>
                <div style="font-size:var(--font-size-base);color:var(--color-gray-700)">
                  {xlat(current.condition_icon)}
                </div>
                {locationName && (
                  <div style="font-size:var(--font-size-sm);color:var(--color-gray-500);margin-top:2px">
                    📍 {locationName}
                  </div>
                )}
              </div>
            </div>
            <div
              style="display:grid;grid-template-columns:repeat(3,1fr);gap:var(--space-3);margin-top:var(--space-4);padding-top:var(--space-4);border-top:var(--border-default)"
            >
              <div style="text-align:center">
                <div style="font-size:var(--font-size-xs);color:var(--color-gray-500)">
                  {tl('weather.humidity')}
                </div>
                <div style="font-weight:var(--font-weight-semibold)">{current.humidity}%</div>
              </div>
              <div style="text-align:center">
                <div style="font-size:var(--font-size-xs);color:var(--color-gray-500)">
                  {tl('weather.wind')}
                </div>
                <div style="font-weight:var(--font-weight-semibold)">
                  {Math.round(current.wind_speed)} km/h {degreeToCardinal(parseFloat(current.wind_direction))}
                </div>
              </div>
              <div style="text-align:center">
                <div style="font-size:var(--font-size-xs);color:var(--color-gray-500)">
                  {tl('weather.rain_probability')}
                </div>
                <div style="font-weight:var(--font-weight-semibold)">{today.rain_probability}%</div>
              </div>
            </div>
            <div
              style="display:flex;justify-content:space-between;margin-top:var(--space-3);font-size:var(--font-size-sm);color:var(--color-gray-700)"
            >
              <span>↑ {formatTemp(today.high)}  ↓ {formatTemp(today.low)}</span>
              <span style="display:inline-flex;align-items:center;gap:var(--space-2)">
                <span title={tl('weather.sunrise')}>🌅 {formatTimeOnly(today.sunrise)}</span>
                <span title={tl('weather.sunset')}>🌇 {formatTimeOnly(today.sunset)}</span>
              </span>
            </div>
          </div>

          {/* Hourly forecast */}
          <div class="section-heading">{tl('weather.hourly')}</div>
          <div
            style="overflow-x:auto;scrollbar-width:thin;padding:var(--space-3) var(--space-4);max-width:100%"
          >
            <div style="display:flex;gap:var(--space-3)" role="list" aria-label="Hourly forecast">
              {hourly.slice(0, 24).map((h, i) => (
                <div
                  key={i}
                  id={`hourly-card-${i}`}
                  role="listitem"
                  style="display:flex;flex-direction:column;align-items:center;gap:4px;min-width:60px;padding:var(--space-2);background:var(--color-surface);border:var(--border-default);border-radius:var(--radius-md);flex-shrink:0"
                >
                  <div style="font-size:var(--font-size-xs);color:var(--color-gray-500)">
                    {formatHour(h.time)}
                  </div>
                  <div style="font-size:24px" aria-hidden="true">{conditionToEmoji(h.condition_icon)}</div>
                  <div style="font-weight:var(--font-weight-semibold)">{formatTemp(h.temperature)}</div>
                  {h.rain_probability > 20 && (
                    <div style="font-size:var(--font-size-xs);color:#1565C0">
                      💧{h.rain_probability}%
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right column: 7-day + crop impact */}
        <div class="weather-col-right">
          {/* 7-day forecast */}
          <div class="section-heading">{tl('weather.weekly')}</div>
          <div
            style="padding:0 var(--space-4);display:flex;flex-direction:column;gap:var(--space-2)"
            role="list"
            aria-label="7-day forecast"
          >
            {daily.map((day, i) => (
              <div
                key={i}
                role="listitem"
                style="display:flex;align-items:center;gap:var(--space-3);padding:var(--space-3);background:var(--color-surface);border:var(--border-default);border-radius:var(--radius-md)"
              >
                <div
                  style="min-width:80px;font-size:var(--font-size-sm);font-weight:var(--font-weight-medium)"
                >
                  {i === 0 ? tl('weather.today') : formatWeekday(day.date)}
                </div>
                <span style="font-size:24px" aria-hidden="true">{conditionToEmoji(day.condition_icon)}</span>
                <div style="flex:1;font-size:var(--font-size-sm);color:var(--color-gray-700)">
                  {xlat(day.condition_icon)}
                </div>
                <div style="display:flex;gap:var(--space-2);font-size:var(--font-size-sm)">
                  {day.rain_probability > 20 && (
                    <span style="color:#1565C0">💧{day.rain_probability}%</span>
                  )}
                  <span style="font-weight:var(--font-weight-semibold)">{formatTemp(day.high)}</span>
                  <span style="color:var(--color-gray-500)">{formatTemp(day.low)}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Crop impact — always shown */}
          <div class="section-heading">{tl('weather.crop_impact')}</div>
          <div
            style="padding:0 var(--space-4) var(--space-4);display:flex;flex-direction:column;gap:var(--space-3)"
          >
            {crop_impact.length > 0 ? (
              crop_impact.map((card, i) => (
                <div
                  key={i}
                  class={IMPACT_CSS[card.severity]}
                  style="padding:var(--space-3);border-radius:var(--radius-md)"
                  role="region"
                  aria-label={card.title}
                >
                  <div style="font-weight:var(--font-weight-semibold)">{translateWithFallback(IMPACT_I18N[card.title]?.title, card.title, tl)}</div>
                  <div style="font-size:var(--font-size-sm);margin-top:var(--space-1)">
                    {translateWithFallback(IMPACT_I18N[card.title]?.desc, card.description, tl)}
                  </div>
                  {card.affected_beds.length > 0 && (
                    <div style="font-size:var(--font-size-xs);margin-top:var(--space-2);opacity:0.9">
                      {card.affected_beds.map((b: { id: string; name: string; crop_type: string }) => getCropName(b.crop_type)).filter(Boolean).join(', ')}
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div style="padding:var(--space-3);border-radius:var(--radius-md);background:var(--color-status-healthy-bg);color:var(--color-status-healthy);font-size:var(--font-size-sm)">
                &#x2705; {tl('weather.no_crop_impact')}
              </div>
            )}
          </div>
        </div>


      </div>

      {/* Farm location map — full width, outside the 2-column grid */}
      <div style="padding:var(--space-4);padding-bottom:80px">
        <div style="font-size:var(--font-size-sm);font-weight:var(--font-weight-semibold);color:var(--color-gray-500);margin-bottom:var(--space-2)">
          {locationName ?? `${weather.latitude.toFixed(4)}, ${weather.longitude.toFixed(4)}`}
        </div>
        <FarmLocationMap
          latitude={weather.latitude}
          longitude={weather.longitude}
          farmName={locationName ?? tl('weather.farm_location')}
        />
      </div>

    </div>
  );
}

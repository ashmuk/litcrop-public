/**
 * Weather-impact i18n helpers.
 *
 * Keeps the pure template/interpolation logic out of the Preact island so it
 * can be unit-tested without DOM.
 *
 * @see docs/decisions (no dedicated ADR — follows the structured-params
 *      pattern introduced for #463 weather i18n fix).
 */

import type { WeatherImpactParams } from '@litcrop/shared';

/**
 * Map API alert `type` discriminators to i18n keys. Keyed by the exact
 * values `WeatherAlert.type` can take (frost | extreme_heat | heavy_rain),
 * not by old short aliases — an earlier mismatch is what caused #463.
 */
export const ALERT_I18N: Readonly<Record<string, string>> = Object.freeze({
  frost: 'weather.alert_frost',
  extreme_heat: 'weather.alert_heat',
  heavy_rain: 'weather.alert_rain',
});

/**
 * Map API crop-impact card `title` values (which are the English display
 * strings the backend emits today) to their title/desc i18n key pair.
 */
export const IMPACT_I18N: Readonly<Record<string, { title: string; desc: string }>> = Object.freeze({
  'Frost Risk': { title: 'weather.impact_frost_risk', desc: 'weather.impact_frost_desc' },
  'Heat Stress': { title: 'weather.impact_heat_stress', desc: 'weather.impact_heat_desc' },
  'Heavy Rain': { title: 'weather.impact_heavy_rain', desc: 'weather.impact_rain_desc' },
});

/**
 * Interpolate `{placeholder}` tokens in a template with values from params.
 * The `date` key is formatted locale-aware (ja-JP vs en-US) so Japanese
 * users see `4月23日` instead of a raw ISO `2026-04-23`.
 *
 * Unknown placeholders are left literal (e.g. `{foo}` stays as `{foo}`) so a
 * translation template that drifts from API params fails visibly, not silently.
 */
export function interpolateWeatherTemplate(
  template: string,
  params: WeatherImpactParams | undefined,
  locale: 'en' | 'ja',
): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    const val = params[key as keyof WeatherImpactParams];
    if (val == null) return match;
    if (key === 'date' && typeof val === 'string') {
      return new Date(val).toLocaleDateString(locale === 'ja' ? 'ja-JP' : 'en-US', {
        month: 'short',
        day: 'numeric',
      });
    }
    return String(val);
  });
}

/**
 * Resolve an i18n key with optional `{placeholder}` interpolation. Falls
 * back to the API's pre-formatted `fallback` string if the key is missing
 * or the translator returned the raw key.
 */
export function translateWithInterpolation(
  i18nKey: string | undefined,
  fallback: string,
  tl: (key: string) => string,
  params: WeatherImpactParams | undefined,
  locale: 'en' | 'ja',
): string {
  if (!i18nKey) return fallback;
  const translated = tl(i18nKey);
  if (translated === i18nKey) return fallback;
  return interpolateWeatherTemplate(translated, params, locale);
}

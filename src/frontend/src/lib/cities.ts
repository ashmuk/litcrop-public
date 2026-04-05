import citiesData from '../data/cities.json';
import { getLocale } from '../i18n/i18n';

export interface CityEntry {
  id: string;
  en: string;
  ja: string;
  region: string;
  country: string;
  lat: number;
  lng: number;
}

/** Full city list, imported once at bundle time. */
export const CITIES: CityEntry[] = citiesData;

/** O(1) lookup by city id. */
export const CITY_MAP: Map<string, CityEntry> = new Map(citiesData.map((c) => [c.id, c as CityEntry]));

/** Quick-select chip cities (top 7 Japan cities). */
export const QUICK_SELECT_CITIES = ['jp-tokyo', 'jp-osaka', 'jp-sapporo', 'jp-fukuoka', 'jp-nagoya', 'jp-sendai', 'jp-naha'] as const;

/** Get localized display string: "Chichibu, Saitama" or "秩父市, 埼玉". */
export function getCityDisplay(cityId: string | undefined | null): string {
  if (!cityId) return '';
  const entry = CITY_MAP.get(cityId);
  if (!entry) return cityId; // free-text fallback
  const locale = getLocale();
  return `${entry[locale]}, ${entry.region}`;
}

/** Get city name only (no region). */
export function getCityName(cityId: string | undefined | null): string {
  if (!cityId) return '';
  const locale = getLocale();
  return CITY_MAP.get(cityId)?.[locale] ?? cityId;
}

/**
 * Search cities by substring match on EN or JA name, region, or country.
 * Empty query returns the first `limit` cities.
 */
export function searchCities(query: string, limit = 10): CityEntry[] {
  if (!query) return CITIES.slice(0, limit);
  const q = query.toLowerCase();
  return CITIES.filter(
    (c) =>
      c.en.toLowerCase().includes(q) ||
      c.ja.includes(q) ||
      c.region.toLowerCase().includes(q) ||
      c.country.toLowerCase().includes(q),
  ).slice(0, limit);
}

/** Case-insensitive match: normalize free-text to canonical id if possible. */
export function normalizeCityInput(input: string): string {
  if (!input) return '';
  if (CITY_MAP.has(input)) return input;
  const lower = input.toLowerCase();
  const match = CITIES.find(
    (c) => c.en.toLowerCase() === lower || c.ja === input,
  );
  return match?.id ?? input;
}

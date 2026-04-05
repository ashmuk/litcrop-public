import { Hono } from 'hono';
import { dynamoRepo } from '../services/dynamodb';
import { UpstreamError } from '../errors';
import { getAuthContext } from '../middleware/auth';
import { WEATHER_CACHE_TTL_SECONDS } from '@litcrop/shared';
import type { Farm, Bed, HourlyForecast, DailyForecast, WeatherAlert, CropImpactCard } from '@litcrop/shared';
import { assertFarmAccess } from './_helpers';

const router = new Hono();

// ── In-memory weather cache ───────────────────────────────────────

interface CacheEntry {
  data: WeatherData;
  cachedAt: number; // ms epoch
}

const weatherCache = new Map<string, CacheEntry>();
const WEATHER_CACHE_MAX_SIZE = 100;

// ── WMO weather code mapping ──────────────────────────────────────

function wmoToLabel(code: number): string {
  if (code === 0) return 'Clear sky';
  if (code <= 3) return 'Partly cloudy';
  if (code === 45 || code === 48) return 'Foggy';
  if (code >= 51 && code <= 55) return 'Drizzle';
  if (code >= 56 && code <= 57) return 'Freezing drizzle';
  if (code >= 61 && code <= 65) return 'Rain';
  if (code >= 66 && code <= 67) return 'Freezing rain';
  if (code >= 71 && code <= 77) return 'Snowfall';
  if (code >= 80 && code <= 82) return 'Rain showers';
  if (code >= 85 && code <= 86) return 'Snow showers';
  if (code === 95) return 'Thunderstorm';
  if (code === 96 || code === 99) return 'Thunderstorm with hail';
  return 'Unknown';
}

const CARDINAL_DIRECTIONS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'] as const;

function degreeToCardinal(deg: number): string {
  if (typeof deg !== 'number' || isNaN(deg)) return 'N';
  const idx = Math.round(((deg % 360 + 360) % 360) / 22.5) % 16;
  return CARDINAL_DIRECTIONS[idx];
}

function wmoToIcon(code: number): string {
  if (code === 0) return 'clear_sky';
  if (code === 1) return 'mainly_clear';
  if (code === 2) return 'partly_cloudy';
  if (code === 3) return 'overcast';
  if (code === 45 || code === 48) return 'fog';
  if (code >= 51 && code <= 55) return 'drizzle';
  if (code >= 56 && code <= 57) return 'freezing_drizzle';
  if (code >= 61 && code <= 65) return 'rain';
  if (code >= 66 && code <= 67) return 'freezing_rain';
  if (code >= 71 && code <= 75) return 'snow';
  if (code === 77) return 'snow_grains';
  if (code >= 80 && code <= 82) return 'rain_showers';
  if (code >= 85 && code <= 86) return 'snow_showers';
  if (code === 95) return 'thunderstorm';
  if (code === 96 || code === 99) return 'thunderstorm_hail';
  return 'unknown';
}

// ── Crop tolerance table ──────────────────────────────────────────

interface CropTolerance {
  minTemp: number;   // °C — frost threshold
  maxTemp: number;   // °C — heat stress threshold
  frostSensitive: boolean;
}

const CROP_TOLERANCES: Record<string, CropTolerance> = {
  tomato: { minTemp: 10, maxTemp: 35, frostSensitive: true },
  basil: { minTemp: 15, maxTemp: 35, frostSensitive: true },
  cucumber: { minTemp: 15, maxTemp: 32, frostSensitive: true },
  lettuce: { minTemp: -2, maxTemp: 25, frostSensitive: false },
  strawberry: { minTemp: -3, maxTemp: 28, frostSensitive: true },
  eggplant: { minTemp: 15, maxTemp: 35, frostSensitive: true },
};

function getCropTolerance(cropType: string): CropTolerance {
  const key = cropType.toLowerCase().replace(/\s+/g, '');
  for (const [k, v] of Object.entries(CROP_TOLERANCES)) {
    if (key.includes(k)) return v;
  }
  // Default: moderate sensitivity
  return { minTemp: 5, maxTemp: 35, frostSensitive: false };
}

// ── Response types ────────────────────────────────────────────────

interface WeatherData {
  latitude: number;
  longitude: number;
  current: {
    temperature: number;
    apparent_temperature: number;
    humidity: number;
    wind_speed: number;
    wind_direction: string;
    weather_code: number;
    condition: string;
    condition_icon: string;
  };
  today: {
    high: number;
    low: number;
    rain_probability: number;
    rain_sum_mm: number;
    sunrise: string;
    sunset: string;
  };
  hourly: HourlyForecast[];
  daily: DailyForecast[];
  alerts: WeatherAlert[];
  crop_impact: CropImpactCard[];
  cached_at: string;
}

// ── Open-Meteo fetch ──────────────────────────────────────────────

async function fetchOpenMeteo(lat: number, lng: number): Promise<Record<string, unknown>> {
  const params = new URLSearchParams({
    latitude: lat.toString(),
    longitude: lng.toString(),
    current: 'temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m',
    hourly: 'temperature_2m,relative_humidity_2m,precipitation_probability,precipitation,weather_code,wind_speed_10m',
    daily: 'temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,weather_code,sunrise,sunset',
    timezone: 'auto', // Open-Meteo resolves from coordinates
    forecast_days: '7',
  });

  const url = `https://api.open-meteo.com/v1/forecast?${params.toString()}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });

  if (!response.ok) {
    throw new UpstreamError('Weather service temporarily unavailable');
  }

  return response.json() as Promise<Record<string, unknown>>;
}

// ── Transform Open-Meteo response ─────────────────────────────────

function transformWeather(raw: Record<string, unknown>, beds: Bed[], cachedAt: string, lat: number, lng: number): WeatherData {
  const current = raw['current'] as Record<string, unknown>;
  const hourly = raw['hourly'] as Record<string, unknown[]>;
  const daily = raw['daily'] as Record<string, unknown[]>;

  // Current conditions
  const weatherCode = current['weather_code'] as number;
  const currentWeather = {
    temperature: current['temperature_2m'] as number,
    apparent_temperature: current['apparent_temperature'] as number,
    humidity: current['relative_humidity_2m'] as number,
    wind_speed: current['wind_speed_10m'] as number,
    wind_direction: degreeToCardinal(current['wind_direction_10m'] as number),
    weather_code: weatherCode,
    condition: wmoToLabel(weatherCode),
    condition_icon: wmoToIcon(weatherCode),
  };

  // Hourly (next 24 hours) — aligned to shared HourlyForecast type
  const hourlyTimes = hourly['time'] as string[];
  const hourlyForecasts: HourlyForecast[] = hourlyTimes.slice(0, 24).map((time, i) => ({
    time,
    temperature: (hourly['temperature_2m'] as number[])[i],
    rain_probability: (hourly['precipitation_probability'] as number[])[i] ?? 0,
    condition_icon: wmoToIcon((hourly['weather_code'] as number[])[i]),
  }));

  // Daily (7 days) — aligned to shared DailyForecast type
  const dailyTimes = daily['time'] as string[];
  const dailyForecasts: DailyForecast[] = dailyTimes.map((date, i) => ({
    date,
    high: (daily['temperature_2m_max'] as number[])[i],
    low: (daily['temperature_2m_min'] as number[])[i],
    rain_probability: (daily['precipitation_probability_max'] as number[])[i] ?? 0,
    rain_sum_mm: (daily['precipitation_sum'] as number[])[i] ?? 0,
    condition: wmoToLabel((daily['weather_code'] as number[])[i]),
    condition_icon: wmoToIcon((daily['weather_code'] as number[])[i]),
  }));

  // Today summary from first daily entry + raw sunrise/sunset
  if (dailyForecasts.length === 0) {
    throw new UpstreamError('No forecast data available from weather service');
  }
  const today = {
    high: dailyForecasts[0].high,
    low: dailyForecasts[0].low,
    rain_probability: dailyForecasts[0].rain_probability,
    rain_sum_mm: dailyForecasts[0].rain_sum_mm,
    sunrise: (daily['sunrise'] as string[])[0],
    sunset: (daily['sunset'] as string[])[0],
  };

  // Crop impact analysis
  const { impacts, alerts } = computeCropImpact(beds, dailyForecasts);

  return {
    latitude: lat,
    longitude: lng,
    current: currentWeather,
    today,
    hourly: hourlyForecasts,
    daily: dailyForecasts,
    alerts,
    crop_impact: impacts,
    cached_at: cachedAt,
  };
}

// ── Crop impact analysis ──────────────────────────────────────────

function computeCropImpact(
  beds: Bed[],
  daily: DailyForecast[],
): { impacts: CropImpactCard[]; alerts: WeatherAlert[] } {
  const impacts: CropImpactCard[] = [];
  const alerts: WeatherAlert[] = [];

  // Only consider beds that have a crop assigned
  const croppedBeds = beds.filter((b) => b.crop_type);

  // Check frost risk
  for (const day of daily) {
    if (day.low < 2) {
      const affectedBeds = croppedBeds.filter((b) => {
        const tol = getCropTolerance(b.crop_type!);
        return tol.frostSensitive && day.low < tol.minTemp;
      });
      if (affectedBeds.length > 0) {
        const severity = day.low < 0 ? 'danger' : 'warning';
        const message = `Frost-sensitive crops are at risk. Expected low: ${day.low}°C on ${day.date}.`;
        impacts.push({
          severity,
          title: 'Frost Risk',
          description: message,
          affected_beds: affectedBeds.map((b) => ({
            id: b.id,
            name: b.name,
            crop_type: b.crop_type!,
          })),
        });
        alerts.push({ type: 'frost', severity, message });
        break; // report first occurrence only
      }
    }
  }

  // Check heat stress
  for (const day of daily) {
    if (day.high > 35) {
      const affectedBeds = croppedBeds.filter((b) => {
        const tol = getCropTolerance(b.crop_type!);
        return day.high > tol.maxTemp;
      });
      if (affectedBeds.length > 0) {
        const message = `High temperatures may stress crops. Expected high: ${day.high}°C on ${day.date}.`;
        impacts.push({
          severity: 'warning',
          title: 'Heat Stress',
          description: message,
          affected_beds: affectedBeds.map((b) => ({
            id: b.id,
            name: b.name,
            crop_type: b.crop_type!,
          })),
        });
        alerts.push({ type: 'extreme_heat', severity: 'warning', message });
        break;
      }
    }
  }

  // Check heavy rain
  for (const day of daily) {
    if (day.rain_sum_mm > 30) {
      const message = `Heavy rainfall expected: ${day.rain_sum_mm}mm on ${day.date}.`;
      impacts.push({
        severity: 'warning',
        title: 'Heavy Rain',
        description: message,
        affected_beds: croppedBeds.map((b) => ({
          id: b.id,
          name: b.name,
          crop_type: b.crop_type!,
        })),
      });
      alerts.push({ type: 'heavy_rain', severity: 'warning', message });
      break;
    }
  }

  return { impacts, alerts };
}

// ── 5.10 GET /api/v1/farms/:farmId/weather ────────────────────────

router.get('/:farmId/weather', async (c) => {
  const { farmId } = c.req.param();
  const { userId, isAdmin } = getAuthContext(c);

  // Verify farm exists and caller is a member
  const { farm } = await assertFarmAccess(farmId, userId, undefined, isAdmin);

  // Guard: coordinates required for weather (must run before cache check — #277)
  if (farm.latitude == null || farm.longitude == null) {
    return c.json({
      error: 'coordinates_required',
      message: 'Weather requires farm coordinates. Update your farm location to enable weather.',
    }, 400);
  }

  // Check cache
  const now = Date.now();
  const cached = weatherCache.get(farmId);
  if (cached && now - cached.cachedAt < WEATHER_CACHE_TTL_SECONDS * 1000) {
    c.res.headers.set('Cache-Control', `max-age=${WEATHER_CACHE_TTL_SECONDS}`);
    return c.json(cached.data);
  }

  // Fetch from Open-Meteo
  let rawWeather: Record<string, unknown>;
  try {
    rawWeather = await fetchOpenMeteo(farm.latitude, farm.longitude);
  } catch (err) {
    // Serve stale cache if available
    if (cached) {
      c.res.headers.set('Cache-Control', 'max-age=0');
      return c.json(cached.data);
    }
    if (err instanceof UpstreamError) throw err;
    throw new UpstreamError('Weather service temporarily unavailable');
  }

  // Get beds for crop impact analysis
  let beds: Bed[] = [];
  try {
    beds = await dynamoRepo.getBedsForFarm(farmId);
  } catch {
    // Non-fatal: proceed without crop impact
  }

  const cachedAt = new Date().toISOString();
  const weatherData = transformWeather(rawWeather, beds, cachedAt, farm.latitude, farm.longitude);

  // Store in cache — evict oldest entry if at capacity
  if (weatherCache.size >= WEATHER_CACHE_MAX_SIZE) {
    const oldest = weatherCache.keys().next().value;
    if (oldest !== undefined) weatherCache.delete(oldest);
  }
  weatherCache.set(farmId, { data: weatherData, cachedAt: now });

  c.res.headers.set('Cache-Control', `max-age=${WEATHER_CACHE_TTL_SECONDS}`);
  return c.json(weatherData);
});

export default router;

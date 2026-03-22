/**
 * MapPicker — Phase D
 * Simple Preact component for picking a farm location.
 * Lazy-loads Leaflet; falls back to text inputs if Leaflet fails.
 * Calls onLocationChange when the user sets lat/lng.
 * Auto-fetches elevation from Open-Meteo API.
 */

import { useState, useEffect, useRef } from 'preact/hooks';
import { t } from '../i18n/i18n';

export interface LatLng {
  lat: number;
  lng: number;
}

export interface MapPickerProps {
  initialLat?: number;
  initialLng?: number;
  onLocationChange: (location: LatLng) => void;
  onElevationChange?: (elevation: number) => void;
}

/** Fetch elevation from Open-Meteo given lat/lng */
async function fetchElevation(lat: number, lng: number): Promise<number | null> {
  try {
    const res = await fetch(
      `https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lng}`,
    );
    if (!res.ok) return null;
    const data = await res.json() as { elevation?: number[] };
    return data.elevation?.[0] ?? null;
  } catch {
    return null;
  }
}

export default function MapPicker({
  initialLat,
  initialLng,
  onLocationChange,
  onElevationChange,
}: MapPickerProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMap = useRef<unknown>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapError, setMapError] = useState(false);
  const [lat, setLat] = useState(initialLat?.toString() ?? '');
  const [lng, setLng] = useState(initialLng?.toString() ?? '');
  const [elevStatus, setElevStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');

  // Debounce timer for elevation fetch
  const elevTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleElevation(latitude: number, longitude: number) {
    if (elevTimer.current) clearTimeout(elevTimer.current);
    setElevStatus('loading');
    elevTimer.current = setTimeout(async () => {
      const elev = await fetchElevation(latitude, longitude);
      if (elev !== null) {
        setElevStatus('done');
        onElevationChange?.(elev);
      } else {
        setElevStatus('error');
      }
    }, 500);
  }

  // Try to load Leaflet dynamically
  useEffect(() => {
    let cancelled = false;

    async function loadLeaflet() {
      try {
        // Dynamic import of Leaflet
        const L = await import('leaflet');

        // Load Leaflet CSS
        if (!document.querySelector('link[href*="leaflet"]')) {
          const link = document.createElement('link');
          link.rel = 'stylesheet';
          link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
          document.head.appendChild(link);
        }

        if (cancelled || !mapRef.current) return;

        const defaultLat = initialLat ?? 35.6762;
        const defaultLng = initialLng ?? 139.6503;

        const map = L.map(mapRef.current).setView([defaultLat, defaultLng], 13);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; OpenStreetMap contributors',
          maxZoom: 19,
        }).addTo(map);

        // Center crosshair marker
        const marker = L.marker([defaultLat, defaultLng]).addTo(map);

        // On map move, update the marker and notify parent
        map.on('moveend', () => {
          const center = map.getCenter();
          marker.setLatLng(center);
          const newLat = parseFloat(center.lat.toFixed(6));
          const newLng = parseFloat(center.lng.toFixed(6));
          setLat(newLat.toString());
          setLng(newLng.toString());
          onLocationChange({ lat: newLat, lng: newLng });
          handleElevation(newLat, newLng);
        });

        leafletMap.current = map;
        setMapLoaded(true);

        // Trigger initial location + elevation
        onLocationChange({ lat: defaultLat, lng: defaultLng });
        handleElevation(defaultLat, defaultLng);
      } catch {
        if (!cancelled) setMapError(true);
      }
    }

    loadLeaflet();
    return () => {
      cancelled = true;
      if (leafletMap.current) (leafletMap.current as { remove: () => void }).remove();
      if (elevTimer.current) clearTimeout(elevTimer.current);
    };
  }, []);

  function handleGPS() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const newLat = parseFloat(pos.coords.latitude.toFixed(6));
        const newLng = parseFloat(pos.coords.longitude.toFixed(6));
        setLat(newLat.toString());
        setLng(newLng.toString());
        onLocationChange({ lat: newLat, lng: newLng });
        handleElevation(newLat, newLng);

        // Pan map if loaded
        if (leafletMap.current) {
          const map = leafletMap.current as { setView: (latlng: [number, number], zoom: number) => void };
          map.setView([newLat, newLng], 15);
        }
      },
      () => {
        // GPS failed - silently ignore, user can type manually
      },
    );
  }

  function handleManualInput() {
    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);
    if (isNaN(latitude) || isNaN(longitude)) return;
    onLocationChange({ lat: latitude, lng: longitude });
    handleElevation(latitude, longitude);

    // Pan map if loaded
    if (leafletMap.current) {
      const map = leafletMap.current as { setView: (latlng: [number, number], zoom: number) => void };
      map.setView([latitude, longitude], 13);
    }
  }

  return (
    <div style="display:flex;flex-direction:column;gap:var(--space-3)">
      <div style="font-size:var(--font-size-sm);font-weight:var(--font-weight-semibold);color:var(--color-text)">
        {t('map.title')}
      </div>
      <div style="font-size:var(--font-size-xs);color:var(--color-gray-500)">
        {t('map.instruction')}
      </div>

      {/* Map container */}
      {!mapError && (
        <div
          ref={mapRef}
          style="width:100%;height:300px;border-radius:var(--radius-md);overflow:hidden;background:var(--color-gray-100);position:relative"
          aria-label="Location map"
        >
          {!mapLoaded && (
            <div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--color-gray-500)">
              Loading map...
            </div>
          )}
        </div>
      )}

      {/* GPS button */}
      <button
        type="button"
        class="btn-secondary"
        onClick={handleGPS}
        style="font-size:var(--font-size-sm)"
      >
        📍 {t('map.gps_button')}
      </button>

      {/* Manual lat/lng inputs (always shown as supplement to map) */}
      <div style="display:flex;gap:var(--space-2)">
        <input
          type="number"
          class="form-input"
          value={lat}
          onInput={(e) => setLat((e.target as HTMLInputElement).value)}
          onBlur={handleManualInput}
          placeholder={t('setup.latitude')}
          step="0.000001"
          min="-90"
          max="90"
          aria-label={t('setup.latitude')}
        />
        <input
          type="number"
          class="form-input"
          value={lng}
          onInput={(e) => setLng((e.target as HTMLInputElement).value)}
          onBlur={handleManualInput}
          placeholder={t('setup.longitude')}
          step="0.000001"
          min="-180"
          max="180"
          aria-label={t('setup.longitude')}
        />
      </div>

      {/* Elevation status */}
      <div style="font-size:var(--font-size-xs);color:var(--color-gray-500)">
        {(elevStatus === 'loading' || elevStatus === 'done') && t('map.elevation_auto')}
        {elevStatus === 'error' && t('map.elevation_failed')}
      </div>

      {mapError && (
        <div style="font-size:var(--font-size-xs);color:var(--color-gray-500);font-style:italic">
          {t('map.fallback')}
        </div>
      )}
    </div>
  );
}

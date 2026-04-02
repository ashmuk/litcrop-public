/**
 * FarmLocationMap — Beta-5 (#227)
 *
 * Read-only Leaflet map showing the farm's location pin.
 * Lazy-loads Leaflet to avoid bundle impact on pages that don't use it.
 * Reuses the Leaflet dependency already bundled for the farm creation wizard.
 */

import { useEffect, useRef } from 'preact/hooks';

interface Props {
  latitude: number;
  longitude: number;
  elevation?: number | null;
  farmName: string;
}

export default function FarmLocationMap({ latitude, longitude, elevation, farmName }: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<unknown>(null);

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    // Lazy-load Leaflet
    import('leaflet').then((L) => {
      if (!mapRef.current) return;

      const map = L.map(mapRef.current, {
        center: [latitude, longitude],
        zoom: 14,
        zoomControl: true,
        attributionControl: true,
        dragging: true,
        scrollWheelZoom: false,
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 18,
      }).addTo(map);

      // Build popup with text nodes to prevent XSS via farmName
      const container = document.createElement('div');
      const nameEl = document.createElement('strong');
      nameEl.textContent = farmName;
      container.appendChild(nameEl);
      container.appendChild(document.createElement('br'));
      container.appendChild(document.createTextNode(`${latitude.toFixed(4)}, ${longitude.toFixed(4)}`));
      if (elevation != null) {
        container.appendChild(document.createElement('br'));
        container.appendChild(document.createTextNode(`${Math.round(elevation)}m`));
      }

      L.marker([latitude, longitude])
        .addTo(map)
        .bindPopup(container);

      mapInstanceRef.current = map;
    }).catch(() => {
      // Leaflet failed to load — degrade gracefully (coordinates shown below)
    });

    return () => {
      if (mapInstanceRef.current) {
        (mapInstanceRef.current as { remove: () => void }).remove();
        mapInstanceRef.current = null;
      }
    };
  }, [latitude, longitude, elevation, farmName]);

  return (
    <div
      ref={mapRef}
      style="width:100%;height:200px;border-radius:var(--radius-lg);border:var(--border-default);overflow:hidden;background:var(--color-gray-100)"
      role="img"
      aria-label={`Map showing ${farmName} at ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`}
    />
  );
}

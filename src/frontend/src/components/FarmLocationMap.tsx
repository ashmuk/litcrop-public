/**
 * FarmLocationMap — Beta-5 (#227)
 *
 * Read-only Leaflet map showing the farm's location pin.
 * Lazy-loads Leaflet + CSS to avoid bundle impact on pages that don't use it.
 * Follows the same CDN pattern as MapPicker.tsx.
 */

import { useEffect, useRef } from 'preact/hooks';

const LEAFLET_CDN = 'https://unpkg.com/leaflet@1.9.4/dist';

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

    import('leaflet').then((L) => {
      if (!mapRef.current) return;

      // Load Leaflet CSS (same pattern as MapPicker)
      if (!document.querySelector('link[href*="leaflet"]')) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = `${LEAFLET_CDN}/leaflet.css`;
        document.head.appendChild(link);
      }

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

      // Fix default marker icon (bundled Leaflet can't resolve icon paths)
      const DefaultIcon = L.icon({
        iconUrl: `${LEAFLET_CDN}/images/marker-icon.png`,
        iconRetinaUrl: `${LEAFLET_CDN}/images/marker-icon-2x.png`,
        shadowUrl: `${LEAFLET_CDN}/images/marker-shadow.png`,
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        shadowSize: [41, 41],
      });

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

      L.marker([latitude, longitude], { icon: DefaultIcon })
        .addTo(map)
        .bindPopup(container);

      // Invalidate size after CSS loads to fix tile alignment
      setTimeout(() => map.invalidateSize(), 200);

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
      style="width:100%;height:300px;border-radius:var(--radius-lg);border:var(--border-default);overflow:hidden;background:var(--color-gray-100)"
      role="img"
      aria-label={`Map showing ${farmName} at ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`}
    />
  );
}

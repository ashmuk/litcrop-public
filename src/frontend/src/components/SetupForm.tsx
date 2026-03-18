/**
 * Farm Setup Form Island — T-FE-11 (setup form section)
 * Reads/writes farm name and coordinates from/to localStorage.
 * Optionally calls createFarm/updateFarm API.
 */

import { useState, useEffect } from 'preact/hooks';
import { showToast } from './Toast';
import { t } from '../i18n/i18n';

interface FarmConfig {
  name: string;
  latitude: string;
  longitude: string;
  elevation: string;
  description: string;
}

const EMPTY: FarmConfig = {
  name: '',
  latitude: '',
  longitude: '',
  elevation: '',
  description: '',
};

export default function SetupForm() {
  const [form, setForm] = useState<FarmConfig>(EMPTY);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('litcrop-setup');
      if (saved) setForm(JSON.parse(saved) as FarmConfig);
    } catch {}
  }, []);

  function update(field: keyof FarmConfig, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleGPS() {
    if (!navigator.geolocation) {
      showToast('Geolocation not supported', 'error');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setForm((prev) => ({
          ...prev,
          latitude: pos.coords.latitude.toFixed(6),
          longitude: pos.coords.longitude.toFixed(6),
        }));
        showToast('Location detected', 'success');
      },
      () => showToast('Could not detect location', 'error'),
    );
  }

  async function handleSave(e: Event) {
    e.preventDefault();
    if (!form.name.trim()) {
      showToast('Farm name is required', 'error');
      return;
    }
    setSaving(true);
    try {
      localStorage.setItem('litcrop-setup', JSON.stringify(form));
      // Farm ID is kept in litcrop-farmId; don't overwrite it here
      showToast(t('setup.save_success'), 'success');
    } catch {
      showToast(t('farm.error_loading'), 'error');
    } finally {
      setSaving(false);
    }
  }

  // Derive a rough climate zone hint from latitude
  function climateHint(): string {
    const lat = parseFloat(form.latitude);
    if (isNaN(lat)) return '—';
    const abs = Math.abs(lat);
    if (abs < 23.5) return 'Tropical';
    if (abs < 35) return 'Subtropical';
    if (abs < 55) return 'Temperate';
    return 'Boreal / Polar';
  }

  return (
    <form onSubmit={handleSave} noValidate>
      <div class="form-group">
        <label class="form-label" for="farm-name">{t('setup.farm_name')}</label>
        <input
          id="farm-name"
          type="text"
          class="form-input"
          value={form.name}
          onInput={(e) => update('name', (e.target as HTMLInputElement).value)}
          placeholder="My Farm"
          required
        />
      </div>

      <div class="form-group">
        <label class="form-label" for="farm-desc">{t('setup.description')}</label>
        <input
          id="farm-desc"
          type="text"
          class="form-input"
          value={form.description}
          onInput={(e) => update('description', (e.target as HTMLInputElement).value)}
          placeholder="Optional description"
        />
      </div>

      <div class="form-group">
        <label class="form-label">{t('setup.location')}</label>
        <div style="display:flex;gap:var(--space-2);margin-bottom:var(--space-2)">
          <input
            type="number"
            class="form-input"
            value={form.latitude}
            onInput={(e) => update('latitude', (e.target as HTMLInputElement).value)}
            placeholder={t('setup.latitude')}
            step="0.000001"
            min="-90"
            max="90"
            aria-label={t('setup.latitude')}
          />
          <input
            type="number"
            class="form-input"
            value={form.longitude}
            onInput={(e) => update('longitude', (e.target as HTMLInputElement).value)}
            placeholder={t('setup.longitude')}
            step="0.000001"
            min="-180"
            max="180"
            aria-label={t('setup.longitude')}
          />
        </div>
        <button
          type="button"
          class="btn-secondary"
          onClick={handleGPS}
          style="font-size:var(--font-size-sm)"
        >
          📍 Use GPS
        </button>
      </div>

      <div class="form-group">
        <label class="form-label" for="farm-elev">{t('setup.elevation')}</label>
        <input
          id="farm-elev"
          type="number"
          class="form-input"
          value={form.elevation}
          onInput={(e) => update('elevation', (e.target as HTMLInputElement).value)}
          placeholder="0"
          min="0"
        />
      </div>

      {/* Climate profile */}
      {form.latitude && (
        <div
          class="status-healthy"
          style="padding:var(--space-3);border-radius:var(--radius-md);margin-bottom:var(--space-5)"
        >
          <div style="font-size:var(--font-size-xs);font-weight:var(--font-weight-semibold)">
            {t('setup.climate_zone')}
          </div>
          <div style="font-size:var(--font-size-base);margin-top:2px">{climateHint()}</div>
        </div>
      )}

      <button
        type="submit"
        class="btn-primary"
        style="width:100%"
        disabled={saving}
        aria-busy={saving}
      >
        {saving ? '…' : t('buttons.save')}
      </button>
    </form>
  );
}

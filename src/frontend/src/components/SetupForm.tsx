/**
 * Farm Setup Form Island — T-FE-11 (setup form section)
 * Reads/writes farm name and coordinates from/to localStorage.
 * Optionally calls createFarm/updateFarm API.
 */

import { useState, useEffect } from 'preact/hooks';
import { showToast } from './Toast';
import { createFarm, updateFarm, ApiError } from '../lib/api';
import { LS_FARM_ID, LS_FARM_NAME } from '../lib/hooks';
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
      showToast(t('setup.gps_unsupported'), 'error');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setForm((prev) => ({
          ...prev,
          latitude: pos.coords.latitude.toFixed(6),
          longitude: pos.coords.longitude.toFixed(6),
        }));
        showToast(t('setup.gps_detected'), 'success');
      },
      () => showToast(t('setup.gps_failed'), 'error'),
    );
  }

  async function handleSave(e: Event) {
    e.preventDefault();
    if (!form.name.trim()) {
      showToast(t('setup.name_required'), 'error');
      return;
    }
    const lat = parseFloat(form.latitude);
    const lng = parseFloat(form.longitude);
    if (isNaN(lat) || isNaN(lng)) {
      showToast(t('setup.location_required'), 'error');
      return;
    }
    setSaving(true);
    try {
      const existingFarmId = localStorage.getItem(LS_FARM_ID);
      const payload = {
        name: form.name.trim(),
        latitude: lat,
        longitude: lng,
        ...(form.elevation && { elevation_m: parseFloat(form.elevation) }),
        ...(form.description.trim() && { description: form.description.trim() }),
      };

      if (existingFarmId) {
        // Update existing farm
        await updateFarm(existingFarmId, payload);
      } else {
        // Create new farm
        const farm = await createFarm(payload);
        localStorage.setItem(LS_FARM_ID, farm.id);
        localStorage.setItem(LS_FARM_NAME, farm.name);
      }
      localStorage.setItem('litcrop-setup', JSON.stringify(form));
      showToast(t('setup.save_success'), 'success');
      // Redirect to dashboard after short delay so user sees the toast
      setTimeout(() => { window.location.replace('/'); }, 800);
    } catch (err) {
      if (err instanceof ApiError && err.statusCode === 409) {
        // User already has a farm — redirect to dashboard
        showToast(t('setup.save_success'), 'success');
        setTimeout(() => { window.location.replace('/'); }, 800);
        return;
      }
      const msg = err instanceof Error ? err.message : t('farm.error_loading');
      showToast(msg, 'error');
    } finally {
      setSaving(false);
    }
  }

  // Derive a rough climate zone hint from latitude
  function climateHint(): string {
    const lat = parseFloat(form.latitude);
    if (isNaN(lat)) return '—';
    const abs = Math.abs(lat);
    if (abs < 23.5) return t('setup.climate_tropical');
    if (abs < 35) return t('setup.climate_subtropical');
    if (abs < 55) return t('setup.climate_temperate');
    return t('setup.climate_boreal');
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

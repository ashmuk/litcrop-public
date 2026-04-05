import { useState } from 'preact/hooks';
import { createFarm, ApiError } from '../lib/api';
import { setLocalFarmId, LS_FARM_NAME } from '../lib/hooks';
import { showToast } from './Toast';
import { t } from '../i18n/i18n';
import MapPicker from './MapPicker';
import LocationAutocomplete from './LocationAutocomplete';
import type { LatLng } from './MapPicker';

export interface FarmWizardProps {
  onComplete?: (farmId: string) => void;
  onCancel?: () => void;
}

export default function FarmWizard({ onComplete, onCancel }: FarmWizardProps) {
  const [step, setStep] = useState(1);

  // Step 1: Name + Description + Location text
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [locationText, setLocationText] = useState('');
  const [cityLat, setCityLat] = useState<number | null>(null);
  const [cityLng, setCityLng] = useState<number | null>(null);

  // Step 2: Precise coordinates (optional)
  const [location, setLocation] = useState<LatLng | null>(null);
  const [elevation, setElevation] = useState<number | null>(null);

  // Step 3: Grid
  const [gridRows, setGridRows] = useState(2);
  const [gridCols, setGridCols] = useState(2);

  // Submission
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  async function handleCreate() {
    if (!locationText.trim()) return;
    setSubmitError('');
    setSubmitting(true);
    try {
      const farm = await createFarm({
        name: name.trim(),
        location_text: locationText.trim(),
        ...(location && { latitude: location.lat, longitude: location.lng }),
        ...(description.trim() && { description: description.trim() }),
        ...(elevation !== null && { elevation_m: elevation }),
        grid_rows: gridRows,
        grid_cols: gridCols,
      });
      // Persist as active farm
      setLocalFarmId(farm.id);
      try { localStorage.setItem(LS_FARM_NAME, farm.name); } catch {}
      showToast(t('wizard.success'), 'success');
      onComplete?.(farm.id);
    } catch (err) {
      if (err instanceof ApiError && err.statusCode === 409) {
        showToast(t('wizard.success'), 'success');
        return;
      }
      setSubmitError(err instanceof Error ? err.message : t('farm.error_loading'));
    } finally {
      setSubmitting(false);
    }
  }

  function stepDotStyle(s: number): string {
    const base = 'width:10px;height:10px;border-radius:50%;box-sizing:border-box;';
    if (s === step) return base + 'background:var(--color-primary)';
    if (s < step) return base + 'background:var(--color-primary-light);border:2px solid var(--color-primary)';
    return base + 'background:transparent;border:2px solid var(--color-gray-400)';
  }

  const stepDots = (
    <div style="display:flex;gap:var(--space-2);justify-content:center;margin-bottom:var(--space-4)">
      {[1, 2, 3].map((s) => (
        <div
          key={s}
          style={stepDotStyle(s)}
          aria-label={`Step ${s} of 3${s === step ? ' (current)' : ''}`}
        />
      ))}
    </div>
  );

  // Step 1: Name + Description + Location
  if (step === 1) {
    return (
      <div style="padding:var(--space-4);display:flex;flex-direction:column;gap:var(--space-4)">
        {stepDots}
        <div style="color:var(--color-gray-500);font-size:var(--font-size-sm)">
          {t('wizard.step_name')} (1/3)
        </div>

        <div class="form-group">
          <label class="form-label" for="wizard-name">{t('setup.farm_name')}</label>
          <input
            id="wizard-name"
            type="text"
            class="form-input"
            value={name}
            onInput={(e) => setName((e.target as HTMLInputElement).value)}
            placeholder="My Farm"
            required
          />
        </div>

        <div class="form-group">
          <label class="form-label" for="wizard-desc">{t('setup.description')}</label>
          <input
            id="wizard-desc"
            type="text"
            class="form-input"
            value={description}
            onInput={(e) => setDescription((e.target as HTMLInputElement).value)}
            placeholder="Optional description"
          />
        </div>

        <div class="form-group">
          <label class="form-label">{t('setup.location_text')}</label>
          <LocationAutocomplete
            value={locationText}
            onChange={(text, lat, lng) => {
              setLocationText(text);
              setCityLat(lat);
              setCityLng(lng);
              if (lat != null && lng != null) {
                setLocation({ lat, lng });
              }
            }}
          />
        </div>

        <div style="display:flex;gap:var(--space-3)">
          {onCancel && (
            <button class="btn-secondary" style="flex:1" onClick={onCancel}>
              {t('buttons.cancel')}
            </button>
          )}
          <button
            class="btn-primary"
            style="flex:2"
            disabled={!name.trim() || !locationText.trim()}
            onClick={() => setStep(2)}
          >
            {t('wizard.next')} →
          </button>
        </div>
      </div>
    );
  }

  // Step 2: Location (MapPicker — optional)
  if (step === 2) {
    return (
      <div style="padding:var(--space-4);display:flex;flex-direction:column;gap:var(--space-4)">
        {stepDots}
        <div style="color:var(--color-gray-500);font-size:var(--font-size-sm)">
          {t('wizard.step_location')} (2/3)
        </div>

        <MapPicker
          initialLat={location?.lat ?? cityLat ?? undefined}
          initialLng={location?.lng ?? cityLng ?? undefined}
          onLocationChange={setLocation}
          onElevationChange={setElevation}
        />

        <div style="display:flex;gap:var(--space-3)">
          <button class="btn-secondary" style="flex:1" onClick={() => setStep(1)}>
            ← {t('buttons.back')}
          </button>
          <button
            class="btn-primary"
            style="flex:2"
            onClick={() => setStep(3)}
          >
            {t('wizard.next')} →
          </button>
        </div>
        <button
          type="button"
          style="background:none;border:none;color:var(--color-gray-500);font-size:var(--font-size-sm);cursor:pointer;text-align:center;padding:0"
          onClick={() => { setLocation(null); setElevation(null); setStep(3); }}
        >
          {t('wizard.skip_map')} →
        </button>
      </div>
    );
  }

  // Step 3: Grid + Review + Submit
  return (
    <div style="padding:var(--space-4);display:flex;flex-direction:column;gap:var(--space-4)">
      {stepDots}
      <div style="color:var(--color-gray-500);font-size:var(--font-size-sm)">
        {t('wizard.step_review')} (3/3)
      </div>

      {/* Grid size selectors */}
      <div style="display:flex;gap:var(--space-4)">
        <div class="form-group" style="flex:1">
          <label class="form-label" for="wizard-rows">{t('bed.grid_rows')}</label>
          <select
            id="wizard-rows"
            class="form-input"
            value={gridRows}
            onChange={(e) => setGridRows(parseInt((e.target as HTMLSelectElement).value, 10))}
          >
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>
        <div class="form-group" style="flex:1">
          <label class="form-label" for="wizard-cols">{t('bed.grid_cols')}</label>
          <select
            id="wizard-cols"
            class="form-input"
            value={gridCols}
            onChange={(e) => setGridCols(parseInt((e.target as HTMLSelectElement).value, 10))}
          >
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Grid preview */}
      <div
        style={`display:grid;grid-template-columns:repeat(${gridCols},1fr);gap:var(--space-1);max-width:200px`}
      >
        {Array.from({ length: gridRows * gridCols }, (_, i) => {
          const r = Math.floor(i / gridCols);
          const c = i % gridCols;
          const label = String.fromCharCode(65 + r) + (c + 1);
          return (
            <div
              key={i}
              style="background:var(--color-gray-100);border-radius:var(--radius-sm);padding:var(--space-1);text-align:center;font-size:var(--font-size-xs);color:var(--color-gray-600)"
            >
              {label}
            </div>
          );
        })}
      </div>

      {/* Review card */}
      <div style="background:var(--color-surface);border:var(--border-default);border-radius:var(--radius-md);padding:var(--space-4);display:flex;flex-direction:column;gap:var(--space-3)">
        <div>
          <div style="font-size:var(--font-size-xs);color:var(--color-gray-500)">{t('setup.farm_name')}</div>
          <div style="font-weight:var(--font-weight-semibold)">{name}</div>
        </div>
        {description && (
          <div>
            <div style="font-size:var(--font-size-xs);color:var(--color-gray-500)">{t('setup.description')}</div>
            <div style="font-weight:var(--font-weight-semibold)">{description}</div>
          </div>
        )}
        <div>
          <div style="font-size:var(--font-size-xs);color:var(--color-gray-500)">{t('setup.location')}</div>
          <div style="font-weight:var(--font-weight-semibold)">{locationText}</div>
        </div>
        {location && (
          <div>
            <div style="font-size:var(--font-size-xs);color:var(--color-gray-500)">{t('setup.coordinates_optional')}</div>
            <div style="font-weight:var(--font-weight-semibold)">
              {location.lat.toFixed(4)}, {location.lng.toFixed(4)}
            </div>
          </div>
        )}
        {elevation !== null && (
          <div>
            <div style="font-size:var(--font-size-xs);color:var(--color-gray-500)">{t('setup.elevation')}</div>
            <div style="font-weight:var(--font-weight-semibold)">{Math.round(elevation)} m</div>
          </div>
        )}
        <div>
          <div style="font-size:var(--font-size-xs);color:var(--color-gray-500)">Grid</div>
          <div style="font-weight:var(--font-weight-semibold)">{gridRows} x {gridCols} ({gridRows * gridCols} beds)</div>
        </div>
      </div>

      {submitError && (
        <div class="auth-server-error" role="alert">
          <span aria-hidden="true">⚠</span> {submitError}
        </div>
      )}

      <div style="display:flex;gap:var(--space-3)">
        <button
          class="btn-secondary"
          style="flex:1"
          onClick={() => setStep(2)}
          disabled={submitting}
        >
          ← {t('buttons.back')}
        </button>
        <button
          class="btn-primary"
          style="flex:2"
          onClick={handleCreate}
          disabled={submitting || !locationText.trim()}
          aria-busy={submitting}
        >
          {submitting ? '...' : t('wizard.create')}
        </button>
      </div>
    </div>
  );
}

/**
 * FarmWizard — Phase D
 * 3-step wizard for creating a new farm:
 *   Step 1: Name + Description
 *   Step 2: MapPicker (location)
 *   Step 3: Grid size (rows x cols) + Review + Submit
 */

import { useState } from 'preact/hooks';
import { createFarm, ApiError } from '../lib/api';
import { setLocalFarmId } from '../lib/hooks';
import { showToast } from './Toast';
import { t } from '../i18n/i18n';
import MapPicker from './MapPicker';
import type { LatLng } from './MapPicker';

export interface FarmWizardProps {
  onComplete?: (farmId: string) => void;
  onCancel?: () => void;
}

export default function FarmWizard({ onComplete, onCancel }: FarmWizardProps) {
  const [step, setStep] = useState(1);

  // Step 1: Name + Description
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  // Step 2: Location
  const [location, setLocation] = useState<LatLng | null>(null);
  const [elevation, setElevation] = useState<number | null>(null);

  // Step 3: Grid
  const [gridRows, setGridRows] = useState(2);
  const [gridCols, setGridCols] = useState(2);

  // Submission
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  async function handleCreate() {
    if (!location) return;
    setSubmitError('');
    setSubmitting(true);
    try {
      const farm = await createFarm({
        name: name.trim(),
        latitude: location.lat,
        longitude: location.lng,
        ...(description.trim() && { description: description.trim() }),
        ...(elevation !== null && { elevation_m: elevation }),
        grid_rows: gridRows,
        grid_cols: gridCols,
      });
      // Persist as active farm
      setLocalFarmId(farm.id);
      try { localStorage.setItem('litcrop-farmName', farm.name); } catch {}
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

  // Step dots indicator
  const stepDots = (
    <div style="display:flex;gap:var(--space-2);justify-content:center;margin-bottom:var(--space-4)">
      {[1, 2, 3].map((s) => (
        <div
          key={s}
          style={`width:10px;height:10px;border-radius:50%;${
            s === step
              ? 'background:var(--color-primary)'
              : s < step
                ? 'background:var(--color-primary-light);border:2px solid var(--color-primary)'
                : 'background:var(--color-gray-200)'
          }`}
          aria-label={`Step ${s} of 3${s === step ? ' (current)' : ''}`}
        />
      ))}
    </div>
  );

  // Step 1: Name + Description
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

        <div style="display:flex;gap:var(--space-3)">
          {onCancel && (
            <button class="btn-secondary" style="flex:1" onClick={onCancel}>
              {t('buttons.cancel')}
            </button>
          )}
          <button
            class="btn-primary"
            style="flex:2"
            disabled={!name.trim()}
            onClick={() => setStep(2)}
          >
            {t('wizard.next')} →
          </button>
        </div>
      </div>
    );
  }

  // Step 2: Location (MapPicker)
  if (step === 2) {
    return (
      <div style="padding:var(--space-4);display:flex;flex-direction:column;gap:var(--space-4)">
        {stepDots}
        <div style="color:var(--color-gray-500);font-size:var(--font-size-sm)">
          {t('wizard.step_location')} (2/3)
        </div>

        <MapPicker
          initialLat={location?.lat}
          initialLng={location?.lng}
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
            disabled={!location}
            onClick={() => setStep(3)}
          >
            {t('wizard.next')} →
          </button>
        </div>
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
          <div style="font-weight:var(--font-weight-semibold)">
            {location ? `${location.lat}, ${location.lng}` : '—'}
          </div>
        </div>
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
          disabled={submitting || !location}
          aria-busy={submitting}
        >
          {submitting ? '...' : t('wizard.create')}
        </button>
      </div>
    </div>
  );
}

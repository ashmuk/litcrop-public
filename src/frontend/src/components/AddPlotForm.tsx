/**
 * Add Plot Wizard — 3-step plot creation form
 *
 * Step 1: Crop type (dropdown + climate hints) + variety
 * Step 2: Plot name (auto-generated default) + planting date
 * Step 3: Confirmation card + submit
 *
 * On success → redirects to / (crops page).
 */

import { useState, useEffect } from 'preact/hooks';
import type { Farm } from '@litcrop/shared';
import { getMyFarm, createPlot } from '../lib/api';
import { t } from '../i18n/i18n';
import { useLocalFarmId } from '../lib/hooks';

export interface Props {
  defaultFarmId: string;
}

const CROP_TYPES = [
  'rice', 'tomato', 'cucumber', 'eggplant', 'lettuce', 'daikon', 'cabbage', 'other',
] as const;

type CropType = typeof CROP_TYPES[number];

function getClimateSuggestions(lat: number): CropType[] {
  const abs = Math.abs(lat);
  if (abs < 23.5) return ['rice', 'eggplant', 'cucumber', 'other'];
  if (abs < 35)   return ['tomato', 'eggplant', 'cucumber', 'daikon'];
  if (abs < 55)   return ['tomato', 'cucumber', 'lettuce', 'daikon', 'cabbage'];
  return ['lettuce', 'daikon', 'cabbage', 'other'];
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function AddPlotForm({ defaultFarmId }: Props) {
  const farmId = useLocalFarmId(defaultFarmId);

  const [farm, setFarm] = useState<Farm | null>(null);
  const [step, setStep] = useState(1);

  // Step 1 state
  const [cropType, setCropType] = useState<CropType | ''>('');
  const [cropVariety, setCropVariety] = useState('');

  // Step 2 state
  const [label, setLabel] = useState('');
  const [plantedAt, setPlantedAt] = useState(todayIso());

  // Submission
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  useEffect(() => {
    getMyFarm().then(setFarm).catch(() => {});
  }, []);

  const climateSuggestions = farm ? getClimateSuggestions(farm.latitude) : [];
  const autoLabel = cropType
    ? `${cropType.charAt(0).toUpperCase() + cropType.slice(1)} Plot`
    : '';
  const displayLabel = label.trim() || autoLabel;

  async function handleCreate() {
    setSubmitError('');
    setSubmitting(true);
    try {
      await createPlot(farmId, {
        crop_type: cropType as string,
        crop_variety: cropVariety,
        label: displayLabel || undefined,
        planted_at: plantedAt,
      });
      window.location.replace('/');
    } catch {
      setSubmitError(t('add_plot.error'));
    } finally {
      setSubmitting(false);
    }
  }

  // ── Step 1: Choose crop ─────────────────────────────────────────
  if (step === 1) {
    return (
      <div style="padding:var(--space-4);display:flex;flex-direction:column;gap:var(--space-4)">
        <div style="color:var(--color-gray-500);font-size:var(--font-size-sm)">
          {t('add_plot.step1_title')} (1/3)
        </div>

        {climateSuggestions.length > 0 && (
          <div style="background:var(--color-primary-light);color:var(--color-primary-dark);border-radius:var(--radius-md);padding:var(--space-3);font-size:var(--font-size-sm)">
            <div style="font-weight:var(--font-weight-semibold);margin-bottom:var(--space-1)">
              {t('add_plot.climate_hint')}
            </div>
            <div style="display:flex;flex-wrap:wrap;gap:var(--space-2)">
              {climateSuggestions.map((c) => (
                <button
                  key={c}
                  type="button"
                  class={cropType === c ? 'badge status-healthy' : 'badge status-nodata'}
                  style="cursor:pointer;border:none;font-family:inherit"
                  onClick={() => setCropType(c)}
                >
                  {t(`add_plot.crop_types.${c}`)}
                </button>
              ))}
            </div>
          </div>
        )}

        <div class="form-group">
          <label class="form-label" for="add-crop-type">
            {t('add_plot.crop_type_label')}
          </label>
          <select
            id="add-crop-type"
            class="form-input"
            value={cropType}
            onChange={(e) => setCropType((e.target as HTMLSelectElement).value as CropType)}
          >
            <option value="">—</option>
            {CROP_TYPES.map((c) => (
              <option key={c} value={c}>{t(`add_plot.crop_types.${c}`)}</option>
            ))}
          </select>
        </div>

        <div class="form-group">
          <label class="form-label" for="add-crop-variety">
            {t('add_plot.crop_variety_label')}
          </label>
          <input
            id="add-crop-variety"
            type="text"
            class="form-input"
            value={cropVariety}
            onInput={(e) => setCropVariety((e.target as HTMLInputElement).value)}
            maxlength={100}
          />
        </div>

        <button
          class="btn-primary"
          style="width:100%"
          disabled={!cropType || !cropVariety.trim()}
          onClick={() => setStep(2)}
        >
          {t('add_plot.next')} →
        </button>
      </div>
    );
  }

  // ── Step 2: Plot details ────────────────────────────────────────
  if (step === 2) {
    return (
      <div style="padding:var(--space-4);display:flex;flex-direction:column;gap:var(--space-4)">
        <div style="color:var(--color-gray-500);font-size:var(--font-size-sm)">
          {t('add_plot.step2_title')} (2/3)
        </div>

        <div class="form-group">
          <label class="form-label" for="add-plot-label">
            {t('add_plot.label_label')}
          </label>
          <input
            id="add-plot-label"
            type="text"
            class="form-input"
            value={label}
            onInput={(e) => setLabel((e.target as HTMLInputElement).value)}
            placeholder={autoLabel}
            maxlength={100}
          />
        </div>

        <div class="form-group">
          <label class="form-label" for="add-planted-at">
            {t('add_plot.planted_at_label')}
          </label>
          <input
            id="add-planted-at"
            type="date"
            class="form-input"
            value={plantedAt}
            onChange={(e) => setPlantedAt((e.target as HTMLInputElement).value)}
          />
        </div>

        <div style="display:flex;gap:var(--space-3)">
          <button class="btn-secondary" style="flex:1" onClick={() => setStep(1)}>
            ← {t('add_plot.back')}
          </button>
          <button
            class="btn-primary"
            style="flex:2"
            disabled={!plantedAt}
            onClick={() => setStep(3)}
          >
            {t('add_plot.next')} →
          </button>
        </div>
      </div>
    );
  }

  // ── Step 3: Confirm ─────────────────────────────────────────────
  return (
    <div style="padding:var(--space-4);display:flex;flex-direction:column;gap:var(--space-4)">
      <div style="color:var(--color-gray-500);font-size:var(--font-size-sm)">
        {t('add_plot.step3_title')} (3/3)
      </div>

      <div style="background:var(--color-surface);border:var(--border-default);border-radius:var(--radius-md);padding:var(--space-4);display:flex;flex-direction:column;gap:var(--space-3)">
        <div>
          <div style="font-size:var(--font-size-xs);color:var(--color-gray-500)">{t('add_plot.crop_type_label')}</div>
          <div style="font-weight:var(--font-weight-semibold)">{t(`add_plot.crop_types.${cropType}`)}</div>
        </div>
        <div>
          <div style="font-size:var(--font-size-xs);color:var(--color-gray-500)">{t('add_plot.crop_variety_label')}</div>
          <div style="font-weight:var(--font-weight-semibold)">{cropVariety}</div>
        </div>
        <div>
          <div style="font-size:var(--font-size-xs);color:var(--color-gray-500)">{t('add_plot.label_label')}</div>
          <div style="font-weight:var(--font-weight-semibold)">{displayLabel}</div>
        </div>
        <div>
          <div style="font-size:var(--font-size-xs);color:var(--color-gray-500)">{t('add_plot.planted_at_label')}</div>
          <div style="font-weight:var(--font-weight-semibold)">{plantedAt}</div>
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
          ← {t('add_plot.back')}
        </button>
        <button
          class="btn-primary"
          style="flex:2"
          onClick={handleCreate}
          disabled={submitting}
          aria-busy={submitting}
        >
          {submitting ? t('add_plot.creating') : t('add_plot.create')}
        </button>
      </div>
    </div>
  );
}

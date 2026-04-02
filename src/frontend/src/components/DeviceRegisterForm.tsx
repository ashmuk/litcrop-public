/**
 * DeviceRegisterForm — Beta-5: Device Registration (F-02)
 *
 * Two-step flow:
 *   Step 1 — Form: node_name + bed_id select → POST /farms/:id/devices
 *   Step 2 — Success: display device_id, api_key (once!), config_poll_url
 *            with per-field copy buttons; warn that key is shown only once.
 *
 * The API key is never stored in component state beyond the success display.
 * Once the user taps Done, the result is handed back to the parent via onSuccess.
 */

import { useState, useEffect } from 'preact/hooks';
import type { FarmBedItem } from '@litcrop/shared';
import { getBeds, registerDevice, type DeviceRegistrationResult } from '../lib/api';
import { t } from '../i18n/i18n';
import { showToast } from './Toast';

export interface Props {
  farmId: string;
  onSuccess: (result: DeviceRegistrationResult) => void;
  onCancel: () => void;
}

type Step = 'form' | 'success';

export default function DeviceRegisterForm({ farmId, onSuccess, onCancel }: Props) {
  const [step, setStep] = useState<Step>('form');
  const [result, setResult] = useState<DeviceRegistrationResult | null>(null);

  // ── Form state ─────────────────────────────────────────────────
  const [nodeName, setNodeName] = useState('');
  const [bedId, setBedId] = useState('');
  const [beds, setBeds] = useState<FarmBedItem[]>([]);
  const [bedsLoading, setBedsLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadBeds() {
      try {
        const list = await getBeds(farmId);
        if (!cancelled) {
          setBeds(list);
          if (list.length > 0) setBedId(list[0].id);
        }
      } catch {
        if (!cancelled) setFormError(t('device.error_loading_beds'));
      } finally {
        if (!cancelled) setBedsLoading(false);
      }
    }

    loadBeds();
    return () => { cancelled = true; };
  }, [farmId]);

  async function handleSubmit(e: Event) {
    e.preventDefault();
    if (!nodeName.trim()) {
      setFormError(t('device.error_name_required'));
      return;
    }
    if (!bedId) {
      setFormError(t('device.error_bed_required'));
      return;
    }

    setFormError(null);
    setSubmitting(true);
    try {
      const data = await registerDevice(farmId, { node_name: nodeName.trim(), bed_id: bedId });
      setResult(data);
      setStep('success');
    } catch {
      setFormError(t('device.error_register_failed'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCopy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      showToast(t('device.copied'), 'success');
    } catch {
      showToast(`${label}: ${value}`, 'info');
    }
  }

  // ── Step 2: Success display ────────────────────────────────────
  if (step === 'success' && result) {
    return (
      <div style="padding:var(--space-4);display:flex;flex-direction:column;gap:var(--space-4)">
        {/* Success hero */}
        <div style="text-align:center;padding:var(--space-4)">
          <div style="font-size:48px;margin-bottom:var(--space-2)">&#x2705;</div>
          <div
            style="font-size:var(--font-size-lg);font-weight:var(--font-weight-semibold);color:var(--color-gray-900)"
          >
            {result.node_name} {t('device.success_ready')}
          </div>
          <div style="font-size:var(--font-size-sm);color:var(--color-gray-500);margin-top:var(--space-2)">
            {t('device.success_copy_hint')}
          </div>
        </div>

        {/* Device ID */}
        <div
          class="form-group"
          style="display:flex;flex-direction:column;gap:var(--space-1)"
        >
          <div
            class="form-label"
            style="font-size:var(--font-size-sm);font-weight:var(--font-weight-semibold);color:var(--color-gray-900)"
          >
            {t('device.field_device_id')}
          </div>
          <div
            class="key-field"
            style="display:flex;align-items:center;gap:var(--space-2);padding:var(--space-3);background:var(--color-gray-100);border-radius:var(--radius-md);font-family:monospace;font-size:var(--font-size-sm);word-break:break-all;color:var(--color-gray-900)"
          >
            <span class="key-field__value" style="flex:1">{result.device_id}</span>
            <button
              class="btn-copy"
              style="display:inline-flex;align-items:center;justify-content:center;width:48px;height:32px;border:var(--border-default);border-radius:var(--radius-md);background:var(--color-surface);cursor:pointer;font-size:14px;flex-shrink:0"
              aria-label={t('device.copy_device_id')}
              onClick={() => handleCopy(result.device_id, t('device.field_device_id'))}
            >
              &#x1F4CB;
            </button>
          </div>
        </div>

        {/* API Key */}
        <div
          class="form-group"
          style="display:flex;flex-direction:column;gap:var(--space-1)"
        >
          <div
            class="form-label"
            style="font-size:var(--font-size-sm);font-weight:var(--font-weight-semibold);color:var(--color-gray-900)"
          >
            {t('device.field_api_key')}
          </div>
          <div
            class="key-field"
            style="display:flex;align-items:center;gap:var(--space-2);padding:var(--space-3);background:var(--color-gray-100);border-radius:var(--radius-md);font-family:monospace;font-size:var(--font-size-sm);word-break:break-all;color:var(--color-gray-900)"
          >
            <span class="key-field__value" style="flex:1">{result.device_api_key}</span>
            <button
              class="btn-copy"
              style="display:inline-flex;align-items:center;justify-content:center;width:48px;height:32px;border:var(--border-default);border-radius:var(--radius-md);background:var(--color-surface);cursor:pointer;font-size:14px;flex-shrink:0"
              aria-label={t('device.copy_api_key')}
              onClick={() => handleCopy(result.device_api_key, t('device.field_api_key'))}
            >
              &#x1F4CB;
            </button>
          </div>
        </div>

        {/* Config Poll URL */}
        <div
          class="form-group"
          style="display:flex;flex-direction:column;gap:var(--space-1)"
        >
          <div
            class="form-label"
            style="font-size:var(--font-size-sm);font-weight:var(--font-weight-semibold);color:var(--color-gray-900)"
          >
            {t('device.field_config_url')}
          </div>
          <div
            class="key-field"
            style="display:flex;align-items:center;gap:var(--space-2);padding:var(--space-3);background:var(--color-gray-100);border-radius:var(--radius-md);font-family:monospace;font-size:var(--font-size-sm);word-break:break-all;color:var(--color-gray-900)"
          >
            <span class="key-field__value" style="flex:1">{result.config_poll_url}</span>
            <button
              class="btn-copy"
              style="display:inline-flex;align-items:center;justify-content:center;width:48px;height:32px;border:var(--border-default);border-radius:var(--radius-md);background:var(--color-surface);cursor:pointer;font-size:14px;flex-shrink:0"
              aria-label={t('device.copy_config_url')}
              onClick={() => handleCopy(result.config_poll_url, t('device.field_config_url'))}
            >
              &#x1F4CB;
            </button>
          </div>
        </div>

        {/* Warning box */}
        <div
          class="key-warning"
          style="display:flex;align-items:flex-start;gap:var(--space-2);padding:var(--space-3);background:var(--color-status-slow-growth-bg);border-radius:var(--radius-md);font-size:var(--font-size-sm);color:var(--color-gray-700);line-height:var(--line-height-relaxed)"
        >
          <span style="flex-shrink:0">&#x26A0;&#xFE0F;</span>
          <span>{t('device.api_key_warning')}</span>
        </div>

        {/* Done */}
        <button
          class="btn-primary"
          style="width:100%"
          onClick={() => onSuccess(result)}
        >
          {t('device.done')}
        </button>
      </div>
    );
  }

  // ── Step 1: Registration form ──────────────────────────────────
  return (
    <div style="padding:var(--space-4);display:flex;flex-direction:column;gap:var(--space-4)">
      {/* Page header row */}
      <div style="display:flex;align-items:center;gap:var(--space-3)">
        <button
          style="background:none;border:none;cursor:pointer;font-size:var(--font-size-lg);color:var(--color-gray-700);padding:0;line-height:1"
          aria-label={t('buttons.back')}
          onClick={onCancel}
        >
          &#x2190;
        </button>
        <div
          style="font-size:var(--font-size-lg);font-weight:var(--font-weight-semibold);color:var(--color-gray-900)"
        >
          {t('device.register_title')}
        </div>
      </div>

      <form onSubmit={handleSubmit} style="display:flex;flex-direction:column;gap:var(--space-4)">
        {/* Node name */}
        <div
          class="form-group"
          style="display:flex;flex-direction:column;gap:var(--space-1)"
        >
          <label
            class="form-label"
            style="font-size:var(--font-size-sm);font-weight:var(--font-weight-semibold);color:var(--color-gray-900)"
            for="device-node-name"
          >
            {t('device.field_node_name')}
          </label>
          <input
            id="device-node-name"
            class="form-input"
            style="height:var(--touch-target-min);padding:0 var(--space-3);border:var(--border-default);border-radius:var(--radius-md);font-size:var(--font-size-base);font-family:var(--font-family);background:var(--color-surface);color:var(--color-gray-900)"
            type="text"
            maxLength={64}
            required
            placeholder={t('device.field_node_name_placeholder')}
            value={nodeName}
            onInput={(e) => setNodeName((e.target as HTMLInputElement).value)}
          />
        </div>

        {/* Bed select */}
        <div
          class="form-group"
          style="display:flex;flex-direction:column;gap:var(--space-1)"
        >
          <label
            class="form-label"
            style="font-size:var(--font-size-sm);font-weight:var(--font-weight-semibold);color:var(--color-gray-900)"
            for="device-bed-id"
          >
            {t('device.field_bed')}
          </label>
          {bedsLoading ? (
            <div
              class="skeleton"
              style="height:var(--touch-target-min);border-radius:var(--radius-md)"
            />
          ) : (
            <select
              id="device-bed-id"
              class="form-select"
              style="height:var(--touch-target-min);padding:0 var(--space-3);border:var(--border-default);border-radius:var(--radius-md);font-size:var(--font-size-base);font-family:var(--font-family);background:var(--color-surface);color:var(--color-gray-900)"
              required
              value={bedId}
              onChange={(e) => setBedId((e.target as HTMLSelectElement).value)}
            >
              {beds.length === 0 ? (
                <option value="" disabled>{t('device.no_beds')}</option>
              ) : (
                beds.map((bed) => (
                  <option key={bed.id} value={bed.id}>{bed.name}</option>
                ))
              )}
            </select>
          )}
        </div>

        {/* Form error */}
        {formError && (
          <div
            style="padding:var(--space-3);background:var(--color-status-issue-bg, #fff0f0);border-radius:var(--radius-md);font-size:var(--font-size-sm);color:var(--color-status-issue)"
            role="alert"
          >
            {formError}
          </div>
        )}

        {/* Actions */}
        <div style="display:flex;gap:var(--space-3)">
          <button
            type="button"
            class="btn-ghost"
            style="flex:1;height:var(--touch-target-min);border-radius:var(--radius-md);font-size:var(--font-size-base);font-weight:var(--font-weight-semibold);font-family:var(--font-family);color:var(--color-primary);background:transparent;border:var(--border-default);cursor:pointer"
            onClick={onCancel}
          >
            {t('buttons.cancel')}
          </button>
          <button
            type="submit"
            class="btn-primary"
            style="flex:1"
            disabled={submitting || bedsLoading || beds.length === 0}
          >
            {submitting ? t('device.registering') : t('device.register_button')}
          </button>
        </div>
      </form>
    </div>
  );
}

/**
 * DeviceConfigForm — Beta-5 (F-01: IoT Camera Node Management)
 *
 * Edit configuration for a registered camera device and optionally
 * deregister it. Capability-aware: disables/hides controls that are
 * not supported by the physical hardware.
 *
 * Props:
 *   farmId   — current farm
 *   device   — full device record (includes capabilities)
 *   onSave   — called after a successful save or deregister
 *   onCancel — called when the user dismisses without saving
 */

import { useState, useEffect } from 'preact/hooks';
import type { FarmBedItem } from '@litcrop/shared';
import { getDeviceClass } from '@litcrop/shared';
import type { DeviceClass } from '@litcrop/shared';
import { getBeds, updateDevice, deleteDevice } from '../lib/api';
import type { DeviceListItemResponse } from '../lib/api';
import { t } from '../i18n/i18n';
import { showToast } from './Toast';
import TierBadge from './TierBadge';

export interface Props {
  farmId: string;
  device: DeviceListItemResponse;
  onSave: () => void;
  onCancel: () => void;
}

const INTERVAL_OPTIONS: { label: string; value: number }[] = [
  { label: '15 min', value: 900 },
  { label: '30 min', value: 1800 },
  { label: '60 min', value: 3600 },
];

export default function DeviceConfigForm({ farmId, device, onSave, onCancel }: Props) {
  // Form state — initialised from current device values
  const [name, setName] = useState(device.node_name);
  const [bedId, setBedId] = useState(device.bed_id);
  const [captureInterval, setCaptureInterval] = useState(device.capture_interval);
  const [resolution, setResolution] = useState(device.resolution);
  const [jpegQuality, setJpegQuality] = useState(device.jpeg_quality);
  const [windowStart, setWindowStart] = useState(device.active_window.start);
  const [windowEnd, setWindowEnd] = useState(device.active_window.end);
  const [triggerType, setTriggerType] = useState<'scheduled'>(device.trigger_type);

  // Supporting data
  const [beds, setBeds] = useState<FarmBedItem[]>([]);
  const [bedsLoading, setBedsLoading] = useState(true);

  // UI state
  const [saving, setSaving] = useState(false);
  const [deregistering, setDeregistering] = useState(false);
  const [confirmDeregister, setConfirmDeregister] = useState(false);

  const hasPirSensor = device.capabilities?.has_pir_sensor ?? false;
  const deviceClass: DeviceClass = getDeviceClass(device.capabilities);

  const availableResolutions: string[] =
    device.capabilities?.resolutions?.length
      ? device.capabilities.resolutions
      : ['1920x1080', '1280x720'];

  useEffect(() => {
    let cancelled = false;

    async function loadBeds() {
      try {
        const result = await getBeds(farmId);
        if (!cancelled) setBeds(result);
      } catch {
        // Non-fatal: user can still save other fields
      } finally {
        if (!cancelled) setBedsLoading(false);
      }
    }

    loadBeds();
    return () => { cancelled = true; };
  }, [farmId]);

  async function handleSave(e: Event) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      await updateDevice(farmId, device.device_id, {
        node_name: name.trim(),
        bed_id: bedId,
        capture_interval: captureInterval,
        resolution,
        jpeg_quality: jpegQuality,
        active_window: { start: windowStart, end: windowEnd },
        trigger_type: triggerType,
      });
      showToast(t('device.save_success'), 'success');
      onSave();
    } catch {
      showToast(t('device.save_error'), 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeregister() {
    setDeregistering(true);
    try {
      await deleteDevice(farmId, device.device_id);
      showToast(t('device.deregister_success'), 'success');
      onSave();
    } catch {
      showToast(t('device.deregister_error'), 'error');
      setConfirmDeregister(false);
    } finally {
      setDeregistering(false);
    }
  }

  // ── Deregister confirm dialog ────────────────────────────────────
  if (confirmDeregister) {
    return (
      <div style="display:flex;flex-direction:column;gap:var(--space-4);padding:var(--space-4)">
        <div
          style="background:var(--color-surface);border:var(--border-default);border-radius:var(--radius-md);padding:var(--space-4);display:flex;flex-direction:column;gap:var(--space-3)"
        >
          <p style="font-weight:var(--font-weight-semibold);color:var(--color-danger)">
            {t('device.deregister_confirm_title')}
          </p>
          <p style="font-size:var(--font-size-sm);color:var(--color-gray-600)">
            {t('device.deregister_confirm_body')}
          </p>
          <div style="display:flex;gap:var(--space-2);justify-content:flex-end">
            <button
              class="btn-secondary"
              onClick={() => setConfirmDeregister(false)}
              disabled={deregistering}
            >
              {t('buttons.cancel')}
            </button>
            <button
              class="btn-danger"
              onClick={handleDeregister}
              disabled={deregistering}
            >
              {deregistering ? t('buttons.deregistering') : t('device.deregister_confirm_cta')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Main form ────────────────────────────────────────────────────
  const tierBannerKey =
    deviceClass === 'unknown' ? 'device.tier_banner_unknown' : `device.tier_banner_${deviceClass}`;
  const tierBannerColor =
    deviceClass === 'unknown'
      ? 'var(--color-warning-light, #fef3c7)'
      : deviceClass === 3
        ? 'var(--color-success-light, #dcfce7)'
        : deviceClass === 2
          ? 'var(--color-primary-light)'
          : 'var(--color-gray-100)';

  return (
    <form
      onSubmit={handleSave}
      style="display:flex;flex-direction:column;gap:var(--space-4);padding:var(--space-4)"
    >
      {/* Tier badge + informational banner */}
      <div style="display:flex;flex-direction:column;gap:var(--space-2)">
        <div style="display:flex;align-items:center;gap:var(--space-2)">
          <TierBadge deviceClass={deviceClass} size="md" />
        </div>
        <div
          role="note"
          style={`padding:var(--space-2) var(--space-3);border-radius:var(--radius-sm);font-size:var(--font-size-sm);background:${tierBannerColor};color:var(--color-gray-700)`}
        >
          {t(tierBannerKey)}
        </div>
      </div>

      {/* Device Name */}
      <div style="display:flex;flex-direction:column;gap:var(--space-1)">
        <label
          htmlFor="device-name"
          style="font-size:var(--font-size-sm);font-weight:var(--font-weight-semibold);color:var(--color-gray-700)"
        >
          {t('device.field_name')}
        </label>
        <input
          id="device-name"
          type="text"
          class="input"
          value={name}
          onInput={(e) => setName((e.target as HTMLInputElement).value)}
          maxLength={64}
          required
        />
      </div>

      {/* Assigned Bed */}
      <div style="display:flex;flex-direction:column;gap:var(--space-1)">
        <label
          htmlFor="device-bed"
          style="font-size:var(--font-size-sm);font-weight:var(--font-weight-semibold);color:var(--color-gray-700)"
        >
          {t('device.field_bed')}
        </label>
        {bedsLoading ? (
          <div class="skeleton" style="height:38px;border-radius:var(--radius-sm)" />
        ) : (
          <select
            id="device-bed"
            class="input"
            value={bedId}
            onChange={(e) => setBedId((e.target as HTMLSelectElement).value)}
          >
            {beds.map((bed) => (
              <option key={bed.id} value={bed.id}>{bed.name}</option>
            ))}
          </select>
        )}
      </div>

      {/* Capture Interval */}
      <div style="display:flex;flex-direction:column;gap:var(--space-1)">
        <label
          htmlFor="device-interval"
          style="font-size:var(--font-size-sm);font-weight:var(--font-weight-semibold);color:var(--color-gray-700)"
        >
          {t('device.field_interval')}
        </label>
        <select
          id="device-interval"
          class="input"
          value={String(captureInterval)}
          onChange={(e) => setCaptureInterval(Number((e.target as HTMLSelectElement).value))}
        >
          {INTERVAL_OPTIONS.map((opt) => (
            <option key={opt.value} value={String(opt.value)}>{opt.label}</option>
          ))}
        </select>
      </div>

      {/* Resolution */}
      <div style="display:flex;flex-direction:column;gap:var(--space-1)">
        <label
          htmlFor="device-resolution"
          style="font-size:var(--font-size-sm);font-weight:var(--font-weight-semibold);color:var(--color-gray-700)"
        >
          {t('device.field_resolution')}
        </label>
        {availableResolutions.length === 1 ? (
          <div
            style="padding:var(--space-2) var(--space-3);background:var(--color-gray-50);border:var(--border-default);border-radius:var(--radius-sm);font-size:var(--font-size-sm);color:var(--color-gray-700)"
          >
            {availableResolutions[0]}
          </div>
        ) : (
          <select
            id="device-resolution"
            class="input"
            value={resolution}
            onChange={(e) => setResolution((e.target as HTMLSelectElement).value)}
          >
            {availableResolutions.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        )}
      </div>

      {/* JPEG Quality */}
      <div style="display:flex;flex-direction:column;gap:var(--space-1)">
        <div style="display:flex;align-items:center;justify-content:space-between">
          <label
            htmlFor="device-quality"
            style="font-size:var(--font-size-sm);font-weight:var(--font-weight-semibold);color:var(--color-gray-700)"
          >
            {t('device.field_jpeg_quality')}
          </label>
          <span
            style="font-size:var(--font-size-sm);font-weight:var(--font-weight-semibold);color:var(--color-primary);min-width:2.5rem;text-align:right"
          >
            {jpegQuality}
          </span>
        </div>
        <input
          id="device-quality"
          type="range"
          min={50}
          max={100}
          value={jpegQuality}
          onInput={(e) => setJpegQuality(Number((e.target as HTMLInputElement).value))}
          style="width:100%;accent-color:var(--color-primary)"
        />
        <div style="display:flex;justify-content:space-between;font-size:var(--font-size-xs);color:var(--color-gray-400)">
          <span>50</span>
          <span>100</span>
        </div>
      </div>

      {/* Active Window */}
      <div style="display:flex;flex-direction:column;gap:var(--space-1)">
        <span
          style="font-size:var(--font-size-sm);font-weight:var(--font-weight-semibold);color:var(--color-gray-700)"
        >
          {t('device.field_active_window')}
        </span>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-2)">
          <div style="display:flex;flex-direction:column;gap:var(--space-1)">
            <label
              htmlFor="device-window-start"
              style="font-size:var(--font-size-xs);color:var(--color-gray-500)"
            >
              {t('device.field_window_start')}
            </label>
            <input
              id="device-window-start"
              type="time"
              class="input"
              value={windowStart}
              onInput={(e) => setWindowStart((e.target as HTMLInputElement).value)}
            />
          </div>
          <div style="display:flex;flex-direction:column;gap:var(--space-1)">
            <label
              htmlFor="device-window-end"
              style="font-size:var(--font-size-xs);color:var(--color-gray-500)"
            >
              {t('device.field_window_end')}
            </label>
            <input
              id="device-window-end"
              type="time"
              class="input"
              value={windowEnd}
              onInput={(e) => setWindowEnd((e.target as HTMLInputElement).value)}
            />
          </div>
        </div>
      </div>

      {/* Trigger Type */}
      <div style="display:flex;flex-direction:column;gap:var(--space-2)">
        <span
          style="font-size:var(--font-size-sm);font-weight:var(--font-weight-semibold);color:var(--color-gray-700)"
        >
          {t('device.field_trigger_type')}
        </span>
        <label style="display:flex;align-items:center;gap:var(--space-2);cursor:pointer">
          <input
            type="radio"
            name="trigger-type"
            value="scheduled"
            checked={triggerType === 'scheduled'}
            onChange={() => setTriggerType('scheduled')}
          />
          <span style="font-size:var(--font-size-sm)">{t('device.trigger_scheduled')}</span>
        </label>
        <label
          style={`display:flex;align-items:center;gap:var(--space-2);${hasPirSensor ? 'cursor:pointer' : 'cursor:not-allowed;opacity:0.5'}`}
        >
          <input
            type="radio"
            name="trigger-type"
            value="motion"
            disabled={!hasPirSensor}
            checked={false}
            onChange={() => { /* motion not supported */ }}
          />
          <span style="display:flex;flex-direction:column;gap:var(--space-0-5)">
            <span style="font-size:var(--font-size-sm)">{t('device.trigger_motion')}</span>
            {!hasPirSensor && (
              <span style="font-size:var(--font-size-xs);color:var(--color-gray-400)">
                {t('device.trigger_motion_not_supported')}
              </span>
            )}
          </span>
        </label>
      </div>

      {/* Form actions */}
      <div style="display:flex;gap:var(--space-2);justify-content:flex-end">
        <button
          type="button"
          class="btn-secondary"
          onClick={onCancel}
          disabled={saving}
        >
          {t('buttons.cancel')}
        </button>
        <button
          type="submit"
          class="btn-primary"
          disabled={saving || !name.trim()}
        >
          {saving ? t('buttons.saving') : t('buttons.save')}
        </button>
      </div>

      {/* Danger zone */}
      <div
        style="margin-top:var(--space-2);padding-top:var(--space-4);border-top:1px solid var(--color-danger-light)"
      >
        <div style="display:flex;flex-direction:column;gap:var(--space-2)">
          <span
            style="font-size:var(--font-size-xs);font-weight:var(--font-weight-semibold);color:var(--color-danger);text-transform:uppercase;letter-spacing:0.05em"
          >
            {t('device.danger_zone')}
          </span>
          <button
            type="button"
            onClick={() => setConfirmDeregister(true)}
            disabled={saving}
            style="align-self:flex-start;padding:var(--space-2) var(--space-3);font-size:var(--font-size-sm);font-weight:var(--font-weight-semibold);color:var(--color-danger);background:transparent;border:1px solid var(--color-danger);border-radius:var(--radius-sm);cursor:pointer"
          >
            {t('device.deregister_cta')}
          </button>
        </div>
      </div>
    </form>
  );
}

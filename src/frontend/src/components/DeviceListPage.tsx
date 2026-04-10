/**
 * DeviceListPage — Beta-5: Device Management (F-02)
 * Lists registered camera nodes with health indicators and action buttons.
 * Replaces ManagePage.tsx which derived node info from image records.
 *
 * Status logic:
 *   online  → green  (var(--color-status-healthy))
 *   offline → red    (var(--color-status-issue))
 *   inactive → gray  (var(--color-gray-400))
 *
 * Health grid shows N/A cells when a capability is absent from the
 * device's reported capabilities object.
 */

import { useState, useEffect } from 'preact/hooks';
import {
  getDevices,
  deleteDevice,
  requestTestShot,
  getMyFarms,
  type DeviceListItemResponse,
} from '../lib/api';
import { t } from '../i18n/i18n';
import { useLocalFarmId, getLocalFarmRole, setLocalFarmList } from '../lib/hooks';
import { showToast } from './Toast';
import { formatRelativeTime } from '../lib/format';
import DeviceRegisterForm from './DeviceRegisterForm';
import DeviceConfigForm from './DeviceConfigForm';
import type { DeviceRegistrationResult } from '../lib/api';

export interface Props {
  farmId: string;
}

// How many milliseconds before last_seen_at is considered stale (1 hour)
const STALE_THRESHOLD_MS = 60 * 60 * 1000;

function statusDotClass(status: DeviceListItemResponse['status']): string {
  if (status === 'online') return 'status-dot--online';
  if (status === 'offline') return 'status-dot--offline';
  return 'status-dot--inactive';
}

function statusDotStyle(status: DeviceListItemResponse['status']): string {
  if (status === 'online') return 'background-color:var(--color-status-healthy)';
  if (status === 'offline') return 'background-color:var(--color-status-issue)';
  return 'background-color:var(--color-gray-400)';
}

function batteryHealthClass(level: number | null): string {
  if (level === null) return 'health-cell--na';
  if (level <= 15) return 'health-cell--critical';
  if (level <= 30) return 'health-cell--warning';
  return '';
}

function wifiHealthClass(dbm: number | null): string {
  if (dbm === null) return 'health-cell--na';
  if (dbm <= -75) return 'health-cell--critical';
  if (dbm <= -60) return 'health-cell--warning';
  return '';
}

function storageHealthClass(status: DeviceListItemResponse['storage_status']): string {
  if (status === null) return 'health-cell--na';
  if (status === 'full') return 'health-cell--critical';
  if (status === 'low') return 'health-cell--warning';
  return '';
}

function isStale(lastSeenAt: string | null): boolean {
  if (!lastSeenAt) return true;
  return Date.now() - new Date(lastSeenAt).getTime() > STALE_THRESHOLD_MS;
}

// ── Device Card ───────────────────────────────────────────────────

interface DeviceCardProps {
  device: DeviceListItemResponse;
  canEdit: boolean;
  onConfigure: (deviceId: string) => void;
  onTestShot: (deviceId: string) => void;
  onDelete: (deviceId: string) => void;
}

function DeviceCard({ device, canEdit, onConfigure, onTestShot }: DeviceCardProps) {
  const hasBattery = device.capabilities?.has_battery_sensor ?? false;
  const stale = isStale(device.last_seen_at);
  const isOffline = device.status === 'offline' || device.status === 'inactive';

  const lastSeenText = device.last_seen_at
    ? formatRelativeTime(device.last_seen_at)
    : t('device.never_seen');

  const batteryValue = hasBattery && device.battery_level !== null
    ? `${device.battery_level}%`
    : 'N/A';

  const wifiValue = device.wifi_signal_dbm !== null
    ? `${device.wifi_signal_dbm} dBm`
    : 'N/A';

  const storageValue = device.storage_status !== null
    ? device.storage_status.toUpperCase()
    : 'N/A';

  return (
    <article
      class="device-card"
      role="article"
      aria-label={`${device.node_name}, status: ${device.status}`}
      style="background:var(--color-surface);border:var(--border-default);border-radius:var(--radius-lg);padding:var(--space-4);display:flex;flex-direction:column;gap:var(--space-3)"
    >
      {/* Header: name + status dot */}
      <div class="device-card__header" style="display:flex;align-items:center;justify-content:space-between">
        <div class="device-card__name-group" style="display:flex;align-items:center;gap:var(--space-2)">
          <span class="device-card__icon" style="font-size:20px" aria-hidden="true">📷</span>
          <span
            class="device-card__name"
            style="font-size:var(--font-size-base);font-weight:var(--font-weight-semibold);color:var(--color-gray-900)"
          >
            {device.node_name}
          </span>
        </div>
        <span
          class={`status-dot ${statusDotClass(device.status)}`}
          style={`width:12px;height:12px;border-radius:50%;flex-shrink:0;${statusDotStyle(device.status)}`}
          aria-hidden="true"
          title={device.status}
        />
      </div>

      {/* Bed assignment */}
      <div
        class="device-card__bed"
        style="font-size:var(--font-size-sm);color:var(--color-gray-700)"
      >
        {t('device.bed_label')}: {device.bed_name}
      </div>

      {/* Last seen */}
      <div
        class={`device-card__last-seen${stale ? ' device-card__last-seen--stale' : ''}`}
        style={`font-size:var(--font-size-sm);display:flex;align-items:center;gap:var(--space-1);${stale ? 'color:var(--color-status-issue)' : 'color:var(--color-gray-500)'}`}
      >
        {t('device.last_seen')}: {lastSeenText}
        {stale && <span aria-label={t('device.stale_warning')}> &#x26A0;&#xFE0F;</span>}
      </div>

      {/* Health grid */}
      <div
        class="health-grid"
        style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:var(--space-2)"
        aria-label={`${t('device.health_battery')} ${batteryValue}, ${t('device.health_wifi')} ${wifiValue}, ${t('device.health_storage')} ${storageValue}`}
      >
        {/* Battery */}
        <div
          class={`health-cell ${batteryHealthClass(hasBattery ? device.battery_level : null)}`}
          style="text-align:center;padding:var(--space-2);background:var(--color-gray-100);border-radius:var(--radius-md)"
        >
          <span class="health-cell__icon" style="font-size:16px;display:block;margin-bottom:2px" aria-hidden="true">🔋</span>
          <div
            class="health-cell__value"
            style="font-size:var(--font-size-xs);font-weight:var(--font-weight-semibold);color:var(--color-gray-900)"
          >
            {batteryValue}
          </div>
          <div class="health-cell__label" style="font-size:10px;color:var(--color-gray-500)">
            {t('device.health_battery')}
          </div>
        </div>

        {/* WiFi */}
        <div
          class={`health-cell ${wifiHealthClass(device.wifi_signal_dbm)}`}
          style="text-align:center;padding:var(--space-2);background:var(--color-gray-100);border-radius:var(--radius-md)"
        >
          <span class="health-cell__icon" style="font-size:16px;display:block;margin-bottom:2px" aria-hidden="true">📶</span>
          <div
            class="health-cell__value"
            style="font-size:var(--font-size-xs);font-weight:var(--font-weight-semibold);color:var(--color-gray-900)"
          >
            {wifiValue}
          </div>
          <div class="health-cell__label" style="font-size:10px;color:var(--color-gray-500)">
            {t('device.health_wifi')}
          </div>
        </div>

        {/* Storage */}
        <div
          class={`health-cell ${storageHealthClass(device.storage_status)}`}
          style="text-align:center;padding:var(--space-2);background:var(--color-gray-100);border-radius:var(--radius-md)"
        >
          <span class="health-cell__icon" style="font-size:16px;display:block;margin-bottom:2px" aria-hidden="true">💾</span>
          <div
            class="health-cell__value"
            style="font-size:var(--font-size-xs);font-weight:var(--font-weight-semibold);color:var(--color-gray-900)"
          >
            {storageValue}
          </div>
          <div class="health-cell__label" style="font-size:10px;color:var(--color-gray-500)">
            {t('device.health_storage')}
          </div>
        </div>
      </div>

      {/* Actions */}
      {canEdit && (
        <div
          class="device-card__actions"
          style="display:flex;gap:var(--space-2);justify-content:space-between"
        >
          <button
            class="btn-ghost"
            style="display:inline-flex;align-items:center;justify-content:center;height:40px;padding:0 var(--space-4);border-radius:var(--radius-md);font-size:var(--font-size-sm);font-weight:var(--font-weight-semibold);font-family:var(--font-family);color:var(--color-primary);background:transparent;border:var(--border-default);cursor:pointer;flex:1"
            onClick={() => onConfigure(device.device_id)}
          >
            {t('device.action_configure')}
          </button>
          <button
            class="btn-ghost"
            style={`display:inline-flex;align-items:center;justify-content:center;height:40px;padding:0 var(--space-4);border-radius:var(--radius-md);font-size:var(--font-size-sm);font-weight:var(--font-weight-semibold);font-family:var(--font-family);color:var(--color-primary);background:transparent;border:var(--border-default);cursor:pointer;flex:1${isOffline ? ';opacity:0.4;cursor:not-allowed;pointer-events:none' : ''}`}
            disabled={isOffline}
            aria-disabled={isOffline}
            title={isOffline ? t('device.test_shot_offline') : undefined}
            onClick={() => !isOffline && onTestShot(device.device_id)}
          >
            {t('device.action_test_shot')}
          </button>
        </div>
      )}
    </article>
  );
}

// ── DeviceListPage ────────────────────────────────────────────────

export default function DeviceListPage({ farmId }: Props) {
  const [devices, setDevices] = useState<DeviceListItemResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showRegister, setShowRegister] = useState(false);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);

  const effectiveFarmId = useLocalFarmId(farmId);
  const [canEdit, setCanEdit] = useState(() => {
    const role = getLocalFarmRole();
    return role === 'admin' || role === 'owner';
  });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [result, farms] = await Promise.all([
          getDevices(effectiveFarmId),
          getMyFarms().catch(() => null),
        ]);
        if (cancelled) return;
        if (farms) {
          setLocalFarmList(farms);
          const role = getLocalFarmRole();
          setCanEdit(role === 'admin' || role === 'owner');
        }
        setDevices(result.devices);
      } catch {
        if (!cancelled) setError(t('device.error_loading'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [effectiveFarmId]);

  async function handleTestShot(deviceId: string) {
    try {
      await requestTestShot(effectiveFarmId, deviceId);
      showToast(t('device.test_shot_queued'), 'success');
    } catch {
      showToast(t('device.test_shot_failed'), 'error');
    }
  }

  async function handleDelete(deviceId: string) {
    if (!confirm(t('device.confirm_delete'))) return;
    try {
      await deleteDevice(effectiveFarmId, deviceId);
      setDevices((prev) => prev.filter((d) => d.device_id !== deviceId));
      showToast(t('device.deleted'), 'success');
    } catch {
      showToast(t('device.delete_failed'), 'error');
    }
  }

  function handleConfigure(deviceId: string) {
    setSelectedDeviceId(deviceId);
  }

  function handleRegisterSuccess(result: DeviceRegistrationResult) {
    setShowRegister(false);
    // Re-fetch device list to include the newly registered device
    getDevices(effectiveFarmId)
      .then((res) => setDevices(res.devices))
      .catch(() => { /* non-fatal; device will appear on next reload */ });
    showToast(t('device.registered_success'), 'success');
    // Silence unused-variable lint for result — caller may need it later
    void result;
  }

  // ── Render: show registration form when requested ─────────────
  if (showRegister) {
    return (
      <DeviceRegisterForm
        farmId={effectiveFarmId}
        onSuccess={handleRegisterSuccess}
        onCancel={() => setShowRegister(false)}
      />
    );
  }

  // ── Render: loading skeletons ──────────────────────────────────
  if (loading) {
    return (
      <div style="padding:var(--space-4);display:flex;flex-direction:column;gap:var(--space-3)">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            class="skeleton"
            style="height:200px;border-radius:var(--radius-lg)"
          />
        ))}
      </div>
    );
  }

  // ── Render: error ──────────────────────────────────────────────
  if (error) {
    return (
      <div class="empty-state">
        <span class="empty-state__icon">⚠️</span>
        <p class="empty-state__heading">{t('device.error_loading')}</p>
        <p class="empty-state__body">{t('device.error_body')}</p>
        <button class="btn-primary mt-4" onClick={() => location.reload()}>
          {t('buttons.retry')}
        </button>
      </div>
    );
  }

  // ── Render: empty state ────────────────────────────────────────
  if (devices.length === 0) {
    return (
      <div style="padding:var(--space-4)">
        <div class="empty-state" style="padding:var(--space-8)">
          <span class="empty-state__icon">📡</span>
          <p class="empty-state__heading">{t('device.empty_title')}</p>
          <p class="empty-state__body">{t('device.empty_body')}</p>
          {canEdit && (
            <button class="btn-primary" onClick={() => setShowRegister(true)}>
              {t('device.empty_cta')}
            </button>
          )}
          <div
            style="background:var(--color-gray-100);border-radius:var(--radius-lg);padding:var(--space-4);margin-top:var(--space-4);text-align:left;width:100%"
          >
            <div
              style="font-size:var(--font-size-sm);font-weight:var(--font-weight-semibold);color:var(--color-gray-900);margin-bottom:var(--space-3)"
            >
              {t('device.setup_guide_title')}
            </div>
            {(['device.setup_step_1', 'device.setup_step_2', 'device.setup_step_3'] as const).map((key, idx) => (
              <div
                key={key}
                style="font-size:var(--font-size-sm);color:var(--color-gray-700);line-height:var(--line-height-relaxed);padding-left:var(--space-4);position:relative;margin-bottom:var(--space-2)"
              >
                <span
                  style="position:absolute;left:0;font-weight:var(--font-weight-semibold);color:var(--color-primary)"
                >
                  {idx + 1}.
                </span>
                {t(key)}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── Render: device list ────────────────────────────────────────
  return (
    <div style="padding:var(--space-4);display:flex;flex-direction:column;gap:var(--space-3)">
      <div style="display:flex;align-items:center;justify-content:space-between">
        <div class="section-heading">{t('device.title')}</div>
        {canEdit && (
          <button
            style="display:inline-flex;align-items:center;justify-content:center;width:40px;height:40px;border-radius:var(--radius-full);background-color:var(--color-primary);color:white;font-size:20px;border:none;cursor:pointer"
            aria-label={t('device.empty_cta')}
            onClick={() => setShowRegister(true)}
          >
            +
          </button>
        )}
      </div>
      {devices.map((device) => (
        <DeviceCard
          key={device.device_id}
          device={device}
          canEdit={canEdit}
          onConfigure={handleConfigure}
          onTestShot={handleTestShot}
          onDelete={handleDelete}
        />
      ))}
      {selectedDeviceId && (() => {
        const selectedDevice = devices.find(d => d.device_id === selectedDeviceId);
        if (!selectedDevice) return null;
        return (
          <DeviceConfigForm
            farmId={effectiveFarmId}
            device={selectedDevice}
            onSave={() => { setSelectedDeviceId(null); window.location.reload(); }}
            onCancel={() => setSelectedDeviceId(null)}
          />
        );
      })()}
    </div>
  );
}

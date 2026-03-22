/**
 * ProfilePage — Phase D
 * Two sections:
 *   1. Farm section: list of farms with switch/active, + New Farm opens wizard
 *   2. You section: email, locale, theme, temp unit
 */

import { useState, useEffect } from 'preact/hooks';
import type { Farm, FarmRole, Locale } from '@litcrop/shared';
import { LOCALE_OPTIONS } from '@litcrop/shared';
import { getMyFarms } from '../lib/api';
import { useLocalFarmId, setLocalFarmId, setLocalFarmList, LS_FARM_NAME } from '../lib/hooks';
import { t } from '../i18n/i18n';
import { showToast } from './Toast';
import { getCurrentUser, signOut } from '../lib/auth';
import FarmWizard from './FarmWizard';

interface FarmWithRole extends Farm {
  role: FarmRole;
}

const LOCALE_STORAGE_KEY = 'litcrop-locale';
const TEMP_UNIT_STORAGE_KEY = 'litcrop-temp-unit';

export default function ProfilePage() {
  const [farms, setFarms] = useState<FarmWithRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [showWizard, setShowWizard] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const activeFarmId = useLocalFarmId('');

  // Settings state
  const [locale, setLocale] = useState<Locale>('en');
  const [tempUnit, setTempUnit] = useState<'C' | 'F'>('C');

  function refreshFarms(): void {
    getMyFarms()
      .then((list) => {
        setFarms(list as FarmWithRole[]);
        setLocalFarmList(list);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    // Load farms
    refreshFarms();

    // Load user
    const user = getCurrentUser();
    if (user) setUserEmail(user.email);

    // Load settings
    try {
      const storedLocale = localStorage.getItem(LOCALE_STORAGE_KEY) as Locale | null;
      if (storedLocale && (LOCALE_OPTIONS as ReadonlyArray<string>).includes(storedLocale)) {
        setLocale(storedLocale);
      } else {
        const attr = document.documentElement.getAttribute('data-locale') as Locale | null;
        if (attr) setLocale(attr);
      }
      const storedUnit = localStorage.getItem(TEMP_UNIT_STORAGE_KEY);
      if (storedUnit === 'C' || storedUnit === 'F') setTempUnit(storedUnit);
    } catch {}
  }, []);

  function handleSwitchFarm(farmId: string) {
    setLocalFarmId(farmId);
    try {
      const farm = farms.find((f) => f.id === farmId);
      if (farm) localStorage.setItem(LS_FARM_NAME, farm.name);
    } catch {}
    window.location.reload();
  }

  function handleWizardComplete(farmId: string) {
    setShowWizard(false);
    // Ask user whether to switch
    const doSwitch = confirm(t('wizard.switch_prompt'));
    if (doSwitch) {
      setLocalFarmId(farmId);
      window.location.reload();
    } else {
      refreshFarms();
    }
  }

  function applyLocale(next: Locale) {
    setLocale(next);
    document.documentElement.setAttribute('data-locale', next);
    try { localStorage.setItem(LOCALE_STORAGE_KEY, next); } catch {}
    showToast(t('settings.save_success'), 'success');
  }

  function applyTempUnit(next: 'C' | 'F') {
    setTempUnit(next);
    try { localStorage.setItem(TEMP_UNIT_STORAGE_KEY, next); } catch {}
    showToast(t('settings.save_success'), 'success');
  }

  function handleLogout() {
    signOut();
    showToast(t('auth.logout_confirm'), 'success');
    setTimeout(() => { window.location.replace('/login/'); }, 800);
  }

  // Determine if user is observer on all farms (no create permission)
  const isObserverOnly = farms.length > 0 && farms.every((f) => f.role === 'observer');

  if (showWizard) {
    return (
      <FarmWizard
        onComplete={handleWizardComplete}
        onCancel={() => setShowWizard(false)}
      />
    );
  }

  return (
    <div style="display:flex;flex-direction:column;gap:var(--space-6);padding:var(--space-4) var(--space-4) var(--space-8)">
      {/* Farm Section */}
      <section>
        <h2 style="font-size:var(--font-size-lg);font-weight:var(--font-weight-bold);margin-bottom:var(--space-3);color:var(--color-text)">
          🌾 {t('profile.farms')}
        </h2>

        {loading ? (
          <div style="display:flex;flex-direction:column;gap:var(--space-2)">
            {[0, 1].map((i) => <div key={i} class="skeleton skeleton-tile" />)}
          </div>
        ) : farms.length === 0 ? (
          <div style="color:var(--color-gray-500);font-size:var(--font-size-sm);margin-bottom:var(--space-3)">
            {t('profile.no_farms')}
          </div>
        ) : (
          <div style="display:flex;flex-direction:column;gap:var(--space-2);margin-bottom:var(--space-3)">
            {farms.map((farm) => {
              const isActive = farm.id === activeFarmId;
              return (
                <div
                  key={farm.id}
                  style={`display:flex;align-items:center;gap:var(--space-3);padding:var(--space-3);border-radius:var(--radius-md);border:2px solid ${isActive ? 'var(--color-primary)' : 'var(--color-gray-200)'};background:${isActive ? 'var(--color-primary-light)' : 'var(--color-surface)'}`}
                >
                  <div style="flex:1;min-width:0">
                    <div style="font-weight:var(--font-weight-semibold);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
                      {farm.name}
                    </div>
                    <div style="display:flex;gap:var(--space-2);align-items:center;margin-top:2px">
                      <span
                        class="badge status-healthy"
                        style="font-size:var(--font-size-xs);padding:1px 6px"
                      >
                        {farm.role}
                      </span>
                      {isActive && (
                        <span style="font-size:var(--font-size-xs);color:var(--color-primary);font-weight:var(--font-weight-semibold)">
                          {t('profile.active')}
                        </span>
                      )}
                    </div>
                  </div>
                  {!isActive && (
                    <button
                      class="btn-secondary"
                      style="font-size:var(--font-size-sm);padding:var(--space-1) var(--space-3);min-width:auto"
                      onClick={() => handleSwitchFarm(farm.id)}
                    >
                      {t('profile.switch')}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {!isObserverOnly && (
          <button
            class="btn-primary"
            style="width:100%"
            onClick={() => setShowWizard(true)}
          >
            + {t('profile.new_farm')}
          </button>
        )}
      </section>

      {/* You Section */}
      <section>
        <h2 style="font-size:var(--font-size-lg);font-weight:var(--font-weight-bold);margin-bottom:var(--space-3);color:var(--color-text)">
          👤 {t('profile.you')}
        </h2>

        {userEmail && (
          <div
            style="font-size:var(--font-size-sm);color:var(--color-gray-700);margin-bottom:var(--space-4)"
          >
            Signed in as <strong>{userEmail}</strong>
          </div>
        )}

        <div class="form-group">
          <label class="form-label" for="profile-locale">
            {t('settings.locale')}
          </label>
          <select
            id="profile-locale"
            class="form-select"
            value={locale}
            onChange={(e) => applyLocale((e.target as HTMLSelectElement).value as Locale)}
            aria-label="Language selection"
          >
            {LOCALE_OPTIONS.map((loc) => (
              <option key={loc} value={loc}>
                {t(`settings.locales.${loc}`)}
              </option>
            ))}
          </select>
        </div>

        <div class="form-group">
          <label class="form-label" for="profile-temp">
            {t('settings.temp_unit')}
          </label>
          <select
            id="profile-temp"
            class="form-select"
            value={tempUnit}
            onChange={(e) => applyTempUnit((e.target as HTMLSelectElement).value as 'C' | 'F')}
            aria-label="Temperature unit"
          >
            <option value="C">{t('settings.temp_units.C')}</option>
            <option value="F">{t('settings.temp_units.F')}</option>
          </select>
        </div>

        <div style="border-top:var(--border-default);padding-top:var(--space-4);margin-top:var(--space-2)">
          <button
            type="button"
            class="btn-secondary"
            style="width:100%"
            onClick={handleLogout}
          >
            {t('auth.logout')}
          </button>
        </div>
      </section>
    </div>
  );
}

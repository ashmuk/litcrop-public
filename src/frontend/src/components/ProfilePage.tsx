/**
 * ProfilePage — Phase D
 * Two sections:
 *   1. Farm section: list of farms with switch/active, + New Farm opens wizard
 *   2. You section: email, locale, theme, temp unit
 */

import { useState, useEffect, useRef } from 'preact/hooks';
import type { Farm, FarmRole, Locale } from '@litcrop/shared';
import { LOCALE_OPTIONS, DEMO_FARM_ID, FREE_PLAN_MAX_OWNED_FARMS } from '@litcrop/shared';
import { getMyFarms, deleteFarm, leaveFarm, getFarmMembers, updateFarm, getMyProfile, updateMyProfile, getMySettings, updateMySettings, getJoinRequests } from '../lib/api';
import type { FarmMemberItem } from '../lib/api';
import { useLocalFarmId, setLocalFarmId, setLocalFarmList, setCachedIsAdmin, LS_FARM_NAME, LS_FARM_ID } from '../lib/hooks';
import { t } from '../i18n/i18n';
import { showToast } from './Toast';
import { getCurrentUser, signOut } from '../lib/auth';
import FarmWizard from './FarmWizard';
import ThemeSwitcher from './ThemeSwitcher';
import FarmDiscovery from './FarmDiscovery';
import JoinRequestList from './JoinRequestList';

interface FarmWithRole extends Farm {
  role: FarmRole;
}

const LOCALE_STORAGE_KEY = 'litcrop-locale';
const TEMP_UNIT_STORAGE_KEY = 'litcrop-temp-unit';
const THEME_STORAGE_KEY = 'litcrop-theme';

function isValidLocale(value: string): value is Locale {
  return (LOCALE_OPTIONS as ReadonlyArray<string>).includes(value);
}

/** Re-translate static [data-i18n] nav labels after locale change using the i18n system. */
function translateNavLabels(): void {
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    if (key) el.textContent = t(key);
  });
}

export default function ProfilePage() {
  const [farms, setFarms] = useState<FarmWithRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [showWizard, setShowWizard] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [confirmLeave, setConfirmLeave] = useState<string | null>(null);
  const [expandedFarm, setExpandedFarm] = useState<string | null>(null);
  const [farmMembers, setFarmMembers] = useState<FarmMemberItem[] | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [savingName, setSavingName] = useState(false);
  const [isSystemAdmin, setIsSystemAdmin] = useState(false);
  const [preferredRole, setPreferredRole] = useState<'manager' | 'observer' | null>(null);
  const [editingFarmName, setEditingFarmName] = useState<string | null>(null);
  const [farmNameDraft, setFarmNameDraft] = useState('');
  const [savingFarmName, setSavingFarmName] = useState(false);
  const [pendingCounts, setPendingCounts] = useState<Record<string, number>>({});
  const activeFarmId = useLocalFarmId('');

  // Settings state (settingsDirty prevents API overwriting user's in-flight changes)
  const settingsDirty = useRef(false);
  const [locale, setLocale] = useState<Locale>('en');
  const [tempUnit, setTempUnit] = useState<'C' | 'F'>('C');
  const currentUser = getCurrentUser();

  function refreshFarms(): void {
    getMyFarms()
      .then((list) => {
        setFarms(list as FarmWithRole[]);
        setLocalFarmList(list);
        // Sync locale from server only when no local preference exists (first login / cleared cache)
        const currentFarmId = localStorage.getItem(LS_FARM_ID) ?? '';
        const activeFarm = list.find((f) => f.id === currentFarmId) as FarmWithRole | undefined;
        const existingLocale = localStorage.getItem(LOCALE_STORAGE_KEY);
        if (activeFarm && !existingLocale && activeFarm.locale && isValidLocale(activeFarm.locale)) {
          setLocale(activeFarm.locale);
          try { localStorage.setItem(LOCALE_STORAGE_KEY, activeFarm.locale); } catch {}
          document.documentElement.setAttribute('data-locale', activeFarm.locale);
        }
        // Fetch pending join request counts for admin/manager farms (non-blocking)
        const adminFarms = (list as FarmWithRole[]).filter((f) => f.role === 'admin' || f.role === 'manager');
        if (adminFarms.length > 0) {
          Promise.all(
            adminFarms.map((f) => getJoinRequests(f.id).then((r) => [f.id, r.length] as const).catch(() => [f.id, 0] as const)),
          ).then((counts) => {
            const map: Record<string, number> = {};
            for (const [id, count] of counts) map[id] = count;
            setPendingCounts(map);
          });
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    // Load farms (also syncs settings from active farm)
    refreshFarms();

    // Load user email from already-resolved currentUser
    if (currentUser) setUserEmail(currentUser.email);

    // Load profile (non-blocking) + sync pending role from registration
    getMyProfile().then(p => {
      if (p.display_name) setDisplayName(p.display_name);
      if (p.preferred_role) setPreferredRole(p.preferred_role);
      if (p.is_admin) setIsSystemAdmin(true);
      setCachedIsAdmin(p.is_admin === true);
      // Sync pending role from registration (no auth token was available post-confirm)
      const pendingRole = localStorage.getItem('litcrop-pendingRole');
      if (pendingRole && (pendingRole === 'manager' || pendingRole === 'observer') && !p.created_at) {
        updateMyProfile({ preferred_role: pendingRole })
          .then(() => { localStorage.removeItem('litcrop-pendingRole'); })
          .catch(() => {});
      }
    }).catch(() => {});

    // Load settings from localStorage as initial state
    try {
      const storedLocale = localStorage.getItem(LOCALE_STORAGE_KEY);
      if (storedLocale && isValidLocale(storedLocale)) {
        setLocale(storedLocale);
      } else {
        const attr = document.documentElement.getAttribute('data-locale');
        if (attr && isValidLocale(attr)) setLocale(attr);
      }
      const storedUnit = localStorage.getItem(TEMP_UNIT_STORAGE_KEY);
      if (storedUnit === 'C' || storedUnit === 'F') setTempUnit(storedUnit);
    } catch {}

    // Sync settings from API (authoritative source after login clears localStorage)
    const initialLocale = document.documentElement.getAttribute('data-locale') || 'en';
    getMySettings().then(s => {
      if (settingsDirty.current) return; // user changed a setting while fetch was in-flight
      if (s.locale && isValidLocale(s.locale)) {
        setLocale(s.locale);
        document.documentElement.setAttribute('data-locale', s.locale);
        document.documentElement.setAttribute('lang', s.locale === 'ja' ? 'ja' : 'en');
        try { localStorage.setItem(LOCALE_STORAGE_KEY, s.locale); } catch {}
        // Reload page if locale changed from initial — ensures all islands re-render
        if (s.locale !== initialLocale) {
          translateNavLabels();
          window.dispatchEvent(new CustomEvent('litcrop:locale-changed'));
        }
      }
      if (s.temp_unit === 'C' || s.temp_unit === 'F') {
        setTempUnit(s.temp_unit);
        try { localStorage.setItem(TEMP_UNIT_STORAGE_KEY, s.temp_unit); } catch {}
      }
      if (s.theme) {
        document.documentElement.setAttribute('data-theme', s.theme);
        try { localStorage.setItem(THEME_STORAGE_KEY, s.theme); } catch {}
      }
      // Notify ThemeSwitcher to re-sync from localStorage
      window.dispatchEvent(new CustomEvent('litcrop:settings-synced'));
    }).catch((err) => console.error('[settings] sync failed — API may not be deployed', err));
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

  function applyFarmRemoval(farmId: string): FarmWithRole[] {
    const remaining = farms.filter(f => f.id !== farmId);
    setFarms(remaining);
    setLocalFarmList(remaining.map(f => ({ id: f.id, name: f.name, role: f.role })));
    if (activeFarmId === farmId) {
      if (remaining.length > 0) {
        setLocalFarmId(remaining[0].id);
        try { localStorage.setItem(LS_FARM_NAME, remaining[0].name); } catch {}
      } else {
        try { localStorage.removeItem(LS_FARM_ID); localStorage.removeItem(LS_FARM_NAME); } catch {}
      }
    }
    return remaining;
  }

  async function handleDeleteFarm(farmId: string) {
    try {
      await deleteFarm(farmId);
      applyFarmRemoval(farmId);
      setConfirmDelete(null);
      showToast(t('profile.farm_deleted'), 'success');
    } catch {
      setConfirmDelete(null);
      showToast(t('profile.delete_error'), 'error');
    }
  }

  async function handleLeaveFarm(farmId: string) {
    try {
      await leaveFarm(farmId);
      applyFarmRemoval(farmId);
      setConfirmLeave(null);
      showToast(t('profile.farm_left'), 'success');
    } catch {
      setConfirmLeave(null);
      showToast(t('profile.leave_error'), 'error');
    }
  }

  async function toggleFarmDetail(farmId: string) {
    if (expandedFarm === farmId) {
      setExpandedFarm(null);
      setFarmMembers(null);
      return;
    }
    setExpandedFarm(farmId);
    setFarmMembers(null);
    setDetailLoading(true);
    try {
      const [members, pending] = await Promise.all([
        getFarmMembers(farmId),
        getJoinRequests(farmId).catch(() => []),
      ]);
      setFarmMembers(members);
      setPendingCounts((prev) => ({ ...prev, [farmId]: pending.length }));
    } catch {
      setFarmMembers([]);
    } finally {
      setDetailLoading(false);
    }
  }

  function applyLocale(next: Locale) {
    settingsDirty.current = true;
    setLocale(next);
    document.documentElement.setAttribute('data-locale', next);
    document.documentElement.setAttribute('lang', next === 'ja' ? 'ja' : 'en');
    try { localStorage.setItem(LOCALE_STORAGE_KEY, next); } catch {}
    updateMySettings({ locale: next }).catch((err) => console.error('[settings] locale save failed', err));
    // Re-translate static nav labels (data-i18n elements) immediately
    translateNavLabels();
    // Notify Preact islands (DesktopNav) to re-render with new locale
    window.dispatchEvent(new CustomEvent('litcrop:locale-changed'));
    showToast(t('settings.save_success'), 'success');
  }

  function applyTempUnit(next: 'C' | 'F') {
    settingsDirty.current = true;
    setTempUnit(next);
    try { localStorage.setItem(TEMP_UNIT_STORAGE_KEY, next); } catch {}
    updateMySettings({ temp_unit: next }).catch((err) => console.error('[settings] temp_unit save failed', err));
    showToast(t('settings.save_success'), 'success');
  }

  async function handleSaveFarmName(farmId: string, name: string) {
    const trimmed = name.trim();
    if (!trimmed || trimmed === farms.find(f => f.id === farmId)?.name) {
      setEditingFarmName(null);
      return;
    }
    setSavingFarmName(true);
    try {
      await updateFarm(farmId, { name: trimmed });
      refreshFarms();
      setEditingFarmName(null);
      showToast(t('profile.name_saved'), 'success');
    } catch {
      showToast(t('profile.save_error'), 'error');
    } finally {
      setSavingFarmName(false);
    }
  }

  async function handleSaveName() {
    setSavingName(true);
    try {
      await updateMyProfile({ display_name: displayName.trim() });
      setEditingName(false);
      showToast(t('profile.name_saved'), 'success');
    } catch {
      showToast(t('profile.save_error'), 'error');
    } finally {
      setSavingName(false);
    }
  }

  function handleLogout() {
    signOut();
    showToast(t('auth.logout_confirm'), 'success');
    setTimeout(() => { window.location.replace('/login/'); }, 800);
  }

  // Determine if user should see farm creation UI
  // Always show when user has no farms (prevent dead-end with no escape)
  // Hide for observers who have farms (all observer-role) and didn't register as manager
  const isObserverOnly = farms.length > 0 && preferredRole !== 'manager' && farms.every((f) => f.role === 'observer');

  // Free plan: count owned farms (excluding demo), gate "New Farm" button
  const ownedCount = farms.filter(f => f.id !== DEMO_FARM_ID && (f.role === 'admin' || f.role === 'manager')).length;
  const atFarmLimit = ownedCount >= FREE_PLAN_MAX_OWNED_FARMS;

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
          <div style="margin-bottom:var(--space-3)">
            <div style="color:var(--color-gray-500);font-size:var(--font-size-sm)">
              {t('profile.no_farms')}
            </div>
            <FarmDiscovery />
          </div>
        ) : (
          <div style="display:flex;flex-direction:column;gap:var(--space-2);margin-bottom:var(--space-3)">
            {farms.map((farm) => {
              const isActive = farm.id === activeFarmId;
              const isAdmin = farm.role === 'admin' || farm.role === 'manager';
              const isDemoFarm = farm.id === DEMO_FARM_ID;
              const isConfirming = confirmDelete === farm.id;
              const isConfirmingLeave = confirmLeave === farm.id;
              return (
                <div key={farm.id}>
                <div
                  style={`cursor:pointer;border-radius:${expandedFarm === farm.id ? 'var(--radius-md) var(--radius-md) 0 0' : 'var(--radius-md)'};border:2px solid ${isActive ? 'var(--color-primary)' : 'var(--color-gray-200)'};background:${isActive ? 'var(--color-primary-light)' : 'var(--color-surface)'};overflow:hidden`}
                  onClick={() => toggleFarmDetail(farm.id)}
                >
                  <div style="display:flex;align-items:center;gap:var(--space-3);padding:var(--space-3)">
                    <div style="flex:1;min-width:0">
                      <div style="display:flex;align-items:center;gap:var(--space-1)">
                        {editingFarmName === farm.id ? (
                          <form
                            style="display:flex;gap:var(--space-1);align-items:center;flex:1;min-width:0"
                            onClick={(e) => e.stopPropagation()}
                            onSubmit={(e) => { e.preventDefault(); void handleSaveFarmName(farm.id, farmNameDraft); }}
                          >
                            <input
                              type="text"
                              value={farmNameDraft}
                              maxLength={100}
                              onInput={(e) => setFarmNameDraft((e.target as HTMLInputElement).value)}
                              style="font-size:var(--font-size-sm);padding:2px 6px;border:1px solid var(--color-primary);border-radius:var(--radius-sm);flex:1;min-width:0"
                              autoFocus
                            />
                            <button type="submit" disabled={savingFarmName} style="font-size:var(--font-size-xs);background:none;border:none;cursor:pointer">✓</button>
                            <button type="button" onClick={() => setEditingFarmName(null)} style="font-size:var(--font-size-xs);background:none;border:none;cursor:pointer">✕</button>
                          </form>
                        ) : (
                          <div style="font-weight:var(--font-weight-semibold);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1;min-width:0">
                            {farm.name}
                          </div>
                        )}
                        {isAdmin && !isDemoFarm && editingFarmName !== farm.id && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setEditingFarmName(farm.id); setFarmNameDraft(farm.name); }}
                            style="font-size:var(--font-size-xs);background:none;border:none;cursor:pointer;padding:0 2px;color:var(--color-gray-500)"
                            aria-label="Edit farm name"
                          >✏️</button>
                        )}
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
                        {!isDemoFarm && (
                          <span style="font-size:var(--font-size-xs);color:var(--color-gray-400);font-family:monospace">
                            {farm.id.slice(0, 8)}
                          </span>
                        )}
                      </div>
                      <div style="font-size:var(--font-size-xs);color:var(--color-gray-500);margin-top:2px">
                        {farm.elevation_m != null && `${Math.round(farm.elevation_m)}m ${t('profile.elevation_short')}`}
                        {farm.elevation_m != null && ' · '}
                        {farm.grid_rows}×{farm.grid_cols} {t('profile.beds')}
                        {isAdmin && pendingCounts[farm.id] > 0 && (
                          <span style="color:var(--color-primary);font-weight:var(--font-weight-semibold)">
                            {' · '}{pendingCounts[farm.id]} {t('join_requests.pending_count')}
                          </span>
                        )}
                      </div>
                    </div>
                    <div style="display:flex;align-items:center;gap:var(--space-2)">
                      {!isActive && (
                        <button
                          class="btn-secondary"
                          style="font-size:var(--font-size-sm);padding:var(--space-1) var(--space-3);min-width:auto"
                          onClick={(e) => { e.stopPropagation(); handleSwitchFarm(farm.id); }}
                        >
                          {t('profile.switch')}
                        </button>
                      )}
                      {isAdmin && !isDemoFarm && (
                        <button
                          type="button"
                          style="font-size:var(--font-size-sm);color:var(--color-error,#dc2626);background:none;border:none;cursor:pointer;padding:var(--space-1) var(--space-2)"
                          onClick={(e) => { e.stopPropagation(); setConfirmDelete(isConfirming ? null : farm.id); }}
                        >
                          {t('profile.delete_farm')}
                        </button>
                      )}
                      {!isDemoFarm && !isSystemAdmin && currentUser && farm.user_id !== currentUser.sub && (
                        <button
                          type="button"
                          style="font-size:var(--font-size-sm);color:var(--color-gray-600);background:none;border:none;cursor:pointer;padding:var(--space-1) var(--space-2)"
                          onClick={(e) => { e.stopPropagation(); setConfirmLeave(isConfirmingLeave ? null : farm.id); }}
                        >
                          {t('profile.leave_farm')}
                        </button>
                      )}
                    </div>
                  </div>
                  {isConfirming && (
                    <div style="padding:var(--space-2) var(--space-3) var(--space-3);border-top:var(--border-default);background:var(--color-surface)">
                      <div style="font-size:var(--font-size-sm);color:var(--color-error,#dc2626);margin-bottom:var(--space-2)">
                        {t('profile.confirm_delete')}
                      </div>
                      <div style="display:flex;gap:var(--space-2)">
                        <button
                          type="button"
                          class="btn-secondary"
                          style="font-size:var(--font-size-sm);padding:var(--space-1) var(--space-3);min-width:auto"
                          onClick={(e) => { e.stopPropagation(); setConfirmDelete(null); }}
                        >
                          {t('buttons.cancel')}
                        </button>
                        <button
                          type="button"
                          style="font-size:var(--font-size-sm);padding:var(--space-1) var(--space-3);background:var(--color-error,#dc2626);color:#fff;border:none;border-radius:var(--radius-sm);cursor:pointer"
                          onClick={(e) => { e.stopPropagation(); void handleDeleteFarm(farm.id); }}
                        >
                          {t('profile.delete_farm')}
                        </button>
                      </div>
                    </div>
                  )}
                  {isConfirmingLeave && (
                    <div style="padding:var(--space-2) var(--space-3) var(--space-3);border-top:var(--border-default);background:var(--color-surface)">
                      <div style="font-size:var(--font-size-sm);color:var(--color-gray-600);margin-bottom:var(--space-2)">
                        {t('profile.confirm_leave')}
                      </div>
                      <div style="display:flex;gap:var(--space-2)">
                        <button type="button" class="btn-secondary" style="font-size:var(--font-size-sm);padding:var(--space-1) var(--space-3);min-width:auto"
                          onClick={(e) => { e.stopPropagation(); setConfirmLeave(null); }}>
                          {t('buttons.cancel')}
                        </button>
                        <button type="button" class="btn-primary" style="font-size:var(--font-size-sm);padding:var(--space-1) var(--space-3);min-width:auto"
                          onClick={(e) => { e.stopPropagation(); void handleLeaveFarm(farm.id); }}>
                          {t('profile.leave_farm')}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                {expandedFarm === farm.id && (
                  <div style="padding:var(--space-3);border:var(--border-default);border-top:none;border-radius:0 0 var(--radius-md) var(--radius-md);background:var(--color-surface);display:flex;flex-direction:column;gap:var(--space-2);font-size:var(--font-size-sm)">
                    {detailLoading ? (
                      <div class="skeleton" style="height:60px;border-radius:var(--radius-sm)" />
                    ) : (
                      <>
                        <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-2)">
                          <div>
                            <div style="color:var(--color-gray-500);font-size:var(--font-size-xs)">{t('profile.location')}</div>
                            <div>{farm.latitude.toFixed(4)}, {farm.longitude.toFixed(4)}</div>
                          </div>
                          {farm.elevation_m !== undefined && farm.elevation_m !== null && (
                            <div>
                              <div style="color:var(--color-gray-500);font-size:var(--font-size-xs)">{t('profile.elevation')}</div>
                              <div>{Math.round(farm.elevation_m)} m</div>
                            </div>
                          )}
                          <div>
                            <div style="color:var(--color-gray-500);font-size:var(--font-size-xs)">{t('profile.grid')}</div>
                            <div>{farm.grid_rows} x {farm.grid_cols} ({farm.grid_rows * farm.grid_cols} {t('profile.beds')})</div>
                          </div>
                          <div>
                            <div style="color:var(--color-gray-500);font-size:var(--font-size-xs)">{t('profile.members')}</div>
                            <div>{farmMembers?.length ?? '—'}</div>
                          </div>
                        </div>
                        {farmMembers && farmMembers.length > 0 && (
                          <div style="border-top:var(--border-default);padding-top:var(--space-2);display:flex;flex-direction:column;gap:var(--space-1)">
                            {farmMembers.map((m) => (
                              <div key={m.user_id} style="display:flex;justify-content:space-between;align-items:center">
                                <span style="font-size:var(--font-size-sm);color:var(--color-text);overflow:hidden;text-overflow:ellipsis">
                                  {m.display_name || m.user_id.slice(0, 8) + '...'}
                                </span>
                                {m.role === 'manager' && (
                                  <span class="badge status-healthy" style="font-size:var(--font-size-xs);padding:1px 6px">Manager</span>
                                )}
                                {m.role === 'admin' && (
                                  <span class="badge status-healthy" style="font-size:var(--font-size-xs);padding:1px 6px">Admin</span>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                        {isAdmin && !isDemoFarm && (
                          <JoinRequestList farmId={farm.id} onMemberAdded={refreshFarms} />
                        )}
                      </>
                    )}
                  </div>
                )}
                </div>
              );
            })}
          </div>
        )}

        {!isObserverOnly && (
          <>
            <button
              class="btn-primary"
              style={`width:100%${atFarmLimit ? ';opacity:0.5;cursor:not-allowed' : ''}`}
              disabled={atFarmLimit}
              onClick={() => setShowWizard(true)}
            >
              + {t('profile.new_farm')}
            </button>
            {atFarmLimit && (
              <div style="font-size:var(--font-size-xs);color:var(--color-gray-500);margin-top:var(--space-1)">
                {t('profile.farm_limit')}
              </div>
            )}
          </>
        )}
      </section>

      {/* You Section */}
      <section>
        <h2 style="font-size:var(--font-size-lg);font-weight:var(--font-weight-bold);margin-bottom:var(--space-3);color:var(--color-text)">
          👤 {t('profile.you')}
        </h2>

        <div style="display:flex;align-items:center;gap:var(--space-2);margin-bottom:var(--space-3)">
          {editingName ? (
            <>
              <input
                type="text"
                class="form-input"
                style="flex:1"
                value={displayName}
                onInput={(e) => setDisplayName((e.target as HTMLInputElement).value)}
                placeholder={t('profile.name_placeholder')}
                maxLength={100}
              />
              <button class="btn-primary" style="font-size:var(--font-size-sm);padding:var(--space-1) var(--space-3)" onClick={handleSaveName} disabled={savingName}>
                {savingName ? '...' : t('buttons.save')}
              </button>
              <button class="btn-secondary" style="font-size:var(--font-size-sm);padding:var(--space-1) var(--space-3)" onClick={() => setEditingName(false)}>
                {t('buttons.cancel')}
              </button>
            </>
          ) : (
            <>
              <span style="font-weight:var(--font-weight-semibold);font-size:var(--font-size-base)">
                {displayName || t('profile.no_name')}
              </span>
              <button
                type="button"
                style="font-size:var(--font-size-xs);color:var(--color-primary);background:none;border:none;cursor:pointer;padding:var(--space-1)"
                onClick={() => setEditingName(true)}
              >
                {t('profile.edit_name')}
              </button>
            </>
          )}
        </div>

        {userEmail && (
          <div
            style="font-size:var(--font-size-sm);color:var(--color-gray-700);margin-bottom:var(--space-4)"
          >
            Signed in as <strong>{userEmail}</strong>
          </div>
        )}

        <ThemeSwitcher />

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

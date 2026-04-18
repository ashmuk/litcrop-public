/**
 * ProfilePage — tab shell
 * Holds all data-loading state and handlers; renders the tab bar
 * and delegates panel content to ProfileFarmsTab, ProfileYouTab,
 * ProfileSystemTab.
 */

import { useState, useEffect, useRef } from 'preact/hooks';
import type { FarmRole, Locale } from '@litcrop/shared';
import { LOCALE_OPTIONS, DEMO_FARM_ID, FREE_PLAN_MAX_OWNED_FARMS, DEFAULT_THEME } from '@litcrop/shared';
import { getMyFarms, deleteFarm, leaveFarm, getFarmMembers, updateFarm, getMyProfile, updateMyProfile, getMySettings, updateMySettings, getJoinRequests, changeMemberRole } from '../lib/api';
import type { FarmMemberItem } from '../lib/api';
import { useLocalFarmId, setLocalFarmId, setLocalFarmList, setCachedIsAdmin, LS_FARM_NAME, LS_FARM_ID } from '../lib/hooks';
import { t } from '../i18n/i18n';
import { showToast } from './Toast';
import { getCurrentUser, signOut } from '../lib/auth';
import type { FarmWithRole } from './FarmSwitcher';
import ProfileFarmsTab from './ProfileFarmsTab';
import ProfileYouTab from './ProfileYouTab';
import ProfileSystemTab from './ProfileSystemTab';

const LOCALE_STORAGE_KEY = 'litcrop-locale';
const TEMP_UNIT_STORAGE_KEY = 'litcrop-temp-unit';
const THEME_STORAGE_KEY = 'litcrop-theme';

type TabName = 'farms' | 'you' | 'system';

function isValidLocale(value: string): value is Locale {
  return (LOCALE_OPTIONS as ReadonlyArray<string>).includes(value);
}

function translateNavLabels(): void {
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    if (key) el.textContent = t(key);
  });
}

export default function ProfilePage() {
  const [activeTab, setActiveTab] = useState<TabName>('farms');
  const [farms, setFarms] = useState<FarmWithRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [showWizard, setShowWizard] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [confirmLeave, setConfirmLeave] = useState<string | null>(null);
  const [confirmRoleChange, setConfirmRoleChange] = useState<{ userId: string; action: 'promote' | 'demote' } | null>(null);
  const [expandedFarm, setExpandedFarm] = useState<string | null>(null);
  const [farmMembers, setFarmMembers] = useState<FarmMemberItem[] | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [profilePictureUrl, setProfilePictureUrl] = useState<string | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [savingName, setSavingName] = useState(false);
  const [isSystemAdmin, setIsSystemAdmin] = useState(false);
  const [preferredRole, setPreferredRole] = useState<'owner' | 'staff' | null>(null);
  const [pendingCounts, setPendingCounts] = useState<Record<string, number>>({});
  // Tracks a keyboard-driven tab switch so the focus shift can happen in a
  // useEffect AFTER Preact re-renders the tablist — decouples focus from
  // the keydown handler's race with the state flush. Null on initial
  // mount and after every settled focus shift.
  const [keyboardFocusTarget, setKeyboardFocusTarget] = useState<TabName | null>(null);
  const activeFarmId = useLocalFarmId('');

  const settingsDirty = useRef(false);
  const [locale, setLocale] = useState<Locale>('en');
  const [tempUnit, setTempUnit] = useState<'C' | 'F'>('C');
  const currentUser = getCurrentUser();

  // Read ?tab= from URL on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab') as TabName | null;
    if (tab && (tab === 'farms' || tab === 'you' || tab === 'system')) {
      setActiveTab(tab);
    }
  }, []);

  function switchTab(tab: TabName) {
    setActiveTab(tab);
    const url = new URL(window.location.href);
    url.searchParams.set('tab', tab);
    history.replaceState(null, '', url.toString());
  }

  function handleTabKeyDown(e: KeyboardEvent) {
    const tabs: TabName[] = ['farms', 'you', 'system'];
    const idx = tabs.indexOf(activeTab);
    let next: TabName | null = null;
    if (e.key === 'ArrowRight') {
      next = tabs[(idx + 1) % tabs.length];
    } else if (e.key === 'ArrowLeft') {
      next = tabs[(idx - 1 + tabs.length) % tabs.length];
    }
    if (next) {
      e.preventDefault();
      switchTab(next);
      // Ask the useEffect below to move focus AFTER the re-render.
      // Doing it synchronously (or via queueMicrotask) races with Preact's
      // pending state flush and the focus can get blurred by the subsequent
      // DOM patch.
      setKeyboardFocusTarget(next);
    }
  }

  // WAI-ARIA tablist pattern: focus follows selection on arrow keys.
  // Runs only when a keyboard handler has explicitly requested a focus
  // shift — NOT on initial mount or URL-driven deep-link tab changes.
  useEffect(() => {
    if (!keyboardFocusTarget) return;
    document.getElementById(`tab-${keyboardFocusTarget}`)?.focus();
    setKeyboardFocusTarget(null);
  }, [keyboardFocusTarget]);

  function refreshFarms(): void {
    getMyFarms()
      .then((list) => {
        setFarms(list as FarmWithRole[]);
        setLocalFarmList(list);
        const currentFarmId = localStorage.getItem(LS_FARM_ID) ?? '';
        const activeFarm = list.find((f) => f.id === currentFarmId) as FarmWithRole | undefined;
        const existingLocale = localStorage.getItem(LOCALE_STORAGE_KEY);
        if (activeFarm && !existingLocale && activeFarm.locale && isValidLocale(activeFarm.locale)) {
          setLocale(activeFarm.locale);
          try { localStorage.setItem(LOCALE_STORAGE_KEY, activeFarm.locale); } catch {}
          document.documentElement.setAttribute('data-locale', activeFarm.locale);
        }
        const adminFarms = (list as FarmWithRole[]).filter((f) => f.role === 'admin' || f.role === 'owner');
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
    refreshFarms();

    if (currentUser) setUserEmail(currentUser.email);

    const pendingRole = localStorage.getItem('litcrop-pendingRole');
    const pendingName = localStorage.getItem('litcrop-pendingName');
    getMyProfile().then(p => {
      if (p.display_name) setDisplayName(p.display_name);
      if (p.profile_picture_thumb_url) setProfilePictureUrl(p.profile_picture_thumb_url);
      if (p.is_admin) setIsSystemAdmin(true);
      setCachedIsAdmin(p.is_admin === true);
      if (pendingRole || pendingName) {
        const updates: Record<string, string> = {};
        if (pendingRole && (pendingRole === 'owner' || pendingRole === 'staff')) {
          setPreferredRole(pendingRole);
          updates['preferred_role'] = pendingRole;
        }
        if (pendingName) {
          setDisplayName(pendingName);
          updates['display_name'] = pendingName;
        }
        if (Object.keys(updates).length > 0) {
          updateMyProfile(updates)
            .then(() => {
              localStorage.removeItem('litcrop-pendingRole');
              localStorage.removeItem('litcrop-pendingName');
            })
            .catch(() => {});
        }
      } else if (p.preferred_role) {
        setPreferredRole(p.preferred_role);
      }
    }).catch(() => {});

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

    const pendingLocale = localStorage.getItem('litcrop-pendingLocale');
    const pendingTempUnit = localStorage.getItem('litcrop-pendingTempUnit');
    const hasPending = pendingLocale || pendingTempUnit;
    const settingsToSync: Record<string, string> = {};
    if (pendingLocale && isValidLocale(pendingLocale)) settingsToSync['locale'] = pendingLocale;
    if (pendingTempUnit && (pendingTempUnit === 'C' || pendingTempUnit === 'F')) settingsToSync['temp_unit'] = pendingTempUnit;
    if (hasPending) settingsToSync['theme'] = DEFAULT_THEME;
    const pendingSettingsPromise = Object.keys(settingsToSync).length > 0
      ? updateMySettings(settingsToSync).then(() => {
          localStorage.removeItem('litcrop-pendingLocale');
          localStorage.removeItem('litcrop-pendingTempUnit');
        }).catch(() => {})
      : Promise.resolve();

    const initialLocale = document.documentElement.getAttribute('data-locale') || 'en';
    pendingSettingsPromise.then(() => getMySettings()).then(s => {
      if (settingsDirty.current) return;
      if (s.locale && isValidLocale(s.locale)) {
        setLocale(s.locale);
        document.documentElement.setAttribute('data-locale', s.locale);
        document.documentElement.setAttribute('lang', s.locale === 'ja' ? 'ja' : 'en');
        try { localStorage.setItem(LOCALE_STORAGE_KEY, s.locale); } catch {}
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
    translateNavLabels();
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
      return;
    }
    try {
      await updateFarm(farmId, { name: trimmed });
      refreshFarms();
      showToast(t('profile.name_saved'), 'success');
    } catch {
      showToast(t('profile.save_error'), 'error');
    }
  }

  async function handleChangeMemberRole(farmId: string, userId: string, role: FarmRole) {
    await changeMemberRole(farmId, userId, role as 'owner' | 'staff');
    setFarmMembers((prev) => prev?.map((fm) =>
      fm.user_id === userId ? { ...fm, role } : fm
    ) ?? null);
  }

  async function handleUpdateFarmVisibility(farmId: string, visibility: 'public' | 'private') {
    await updateFarm(farmId, { visibility });
    refreshFarms();
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

  const hasOwnerRole = farms.some((f) => f.role === 'admin' || f.role === 'owner');
  const canCreateFarm = preferredRole === 'owner' || isSystemAdmin || hasOwnerRole;
  const ownedCount = farms.filter(f => f.id !== DEMO_FARM_ID && (f.role === 'admin' || f.role === 'owner')).length;
  const atFarmLimit = ownedCount >= FREE_PLAN_MAX_OWNED_FARMS;

  const tabBtnBase = 'flex:1;padding:8px 12px;border:none;border-radius:var(--radius-full);background:transparent;font-family:inherit;font-size:var(--font-size-sm);font-weight:var(--font-weight-semibold);color:var(--color-gray-500);cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;white-space:nowrap';
  const tabBtnActive = `${tabBtnBase};background:var(--color-surface);color:var(--color-primary-dark);box-shadow:var(--shadow-sm)`;

  return (
    <div>
      {/* Tab bar */}
      <div
        style="display:flex;gap:4px;padding:var(--space-3) var(--space-4);background:var(--color-surface);border-bottom:var(--border-default);position:sticky;top:56px;z-index:99"
        role="tablist"
        aria-label={t('profile.sections_label') || 'Profile sections'}
        onKeyDown={handleTabKeyDown}
      >
        <div style="display:flex;gap:4px;width:100%;max-width:480px;margin:0 auto;background:var(--color-gray-100);border-radius:var(--radius-full);padding:3px">
          <button
            role="tab"
            id="tab-farms"
            aria-selected={activeTab === 'farms'}
            aria-controls="panel-farms"
            style={activeTab === 'farms' ? tabBtnActive : tabBtnBase}
            onClick={() => switchTab('farms')}
          >
            <span aria-hidden="true" style="font-size:16px">🌾</span>
            {t('profile.tab_farms')}
          </button>
          <button
            role="tab"
            id="tab-you"
            aria-selected={activeTab === 'you'}
            aria-controls="panel-you"
            style={activeTab === 'you' ? tabBtnActive : tabBtnBase}
            onClick={() => switchTab('you')}
          >
            <span aria-hidden="true" style="font-size:16px">👤</span>
            {t('profile.tab_you')}
          </button>
          <button
            role="tab"
            id="tab-system"
            aria-selected={activeTab === 'system'}
            aria-controls="panel-system"
            style={activeTab === 'system' ? tabBtnActive : tabBtnBase}
            onClick={() => switchTab('system')}
          >
            <span aria-hidden="true" style="font-size:16px">⚙</span>
            {t('profile.tab_system')}
          </button>
        </div>
      </div>

      {/* Tab panels */}
      {activeTab === 'farms' && (
        <div
          role="tabpanel"
          id="panel-farms"
          aria-labelledby="tab-farms"
          tabIndex={0}
          style="padding:var(--space-4)"
        >
          <ProfileFarmsTab
            farms={farms}
            loading={loading}
            activeFarmId={activeFarmId}
            pendingCounts={pendingCounts}
            canCreateFarm={canCreateFarm}
            atFarmLimit={atFarmLimit}
            showWizard={showWizard}
            onShowWizard={setShowWizard}
            onSwitchFarm={handleSwitchFarm}
            onDeleteFarm={handleDeleteFarm}
            onLeaveFarm={handleLeaveFarm}
            onWizardComplete={handleWizardComplete}
            onSaveFarmName={handleSaveFarmName}
            onToggleFarmDetail={toggleFarmDetail}
            onChangeMemberRole={handleChangeMemberRole}
            onUpdateFarmVisibility={handleUpdateFarmVisibility}
            expandedFarm={expandedFarm}
            farmMembers={farmMembers}
            detailLoading={detailLoading}
            confirmDelete={confirmDelete}
            setConfirmDelete={setConfirmDelete}
            confirmLeave={confirmLeave}
            setConfirmLeave={setConfirmLeave}
            confirmRoleChange={confirmRoleChange}
            setConfirmRoleChange={setConfirmRoleChange}
            currentUser={currentUser}
            isSystemAdmin={isSystemAdmin}
          />
        </div>
      )}

      {activeTab === 'you' && (
        <div
          role="tabpanel"
          id="panel-you"
          aria-labelledby="tab-you"
          tabIndex={0}
          style="padding:var(--space-4)"
        >
          <ProfileYouTab
            userEmail={userEmail}
            displayName={displayName}
            profilePictureUrl={profilePictureUrl}
            editingName={editingName}
            savingName={savingName}
            farms={farms}
            onEditName={setEditingName}
            onDisplayNameChange={setDisplayName}
            onSaveName={handleSaveName}
            onLogout={handleLogout}
          />
        </div>
      )}

      {activeTab === 'system' && (
        <div
          role="tabpanel"
          id="panel-system"
          aria-labelledby="tab-system"
          tabIndex={0}
          style="padding:var(--space-4)"
        >
          <ProfileSystemTab
            locale={locale}
            tempUnit={tempUnit}
            onLocaleChange={applyLocale}
            onTempUnitChange={applyTempUnit}
          />
        </div>
      )}
    </div>
  );
}

/**
 * AdminDashboard — #179
 *
 * 4-tab admin interface: System, Users, Farms, Notifications.
 * (Activity tab will be inserted as tab 4 in Wave 3, shifting Notifications to tab 5.)
 * Data fetched lazily per tab. URL hash routing for bookmarkability.
 */

import type { JSX } from 'preact';
import { useState, useEffect, useRef } from 'preact/hooks';
import { getAdminStats, getAdminUsers, getAdminFarms, getNotificationPrefs, updateNotificationPrefs, ApiError } from '../lib/api';
import type { AdminStatsResponse, AdminUserItem, AdminFarmItem, NotificationPrefsResponse } from '../lib/api';
import { t } from '../i18n/i18n';

type AdminTab = 'system' | 'users' | 'farms' | 'notifications';

// Ordered list of Wave 2 notification event keys
const NOTIFICATION_EVENT_KEYS = [
  'user.signup',
  'account.deleted',
  'farm.created',
  'farm.deleted',
  'join_request.submitted',
  'join_request.approved',
  'join_request.rejected',
] as const;

const DEFAULT_PREFS: Record<string, boolean> = Object.fromEntries(
  NOTIFICATION_EVENT_KEYS.map((k) => [k, true]),
);

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState<AdminTab>(() => {
    if (typeof window === 'undefined') return 'system';
    const hash = window.location.hash.slice(1);
    return ['system', 'users', 'farms', 'notifications'].includes(hash) ? hash as AdminTab : 'system';
  });

  // Data caches
  const [stats, setStats] = useState<AdminStatsResponse | null>(null);
  const [users, setUsers] = useState<AdminUserItem[] | null>(null);
  const [farms, setFarms] = useState<AdminFarmItem[] | null>(null);
  const [notifPrefs, setNotifPrefs] = useState<NotificationPrefsResponse | null>(null);

  // Loading/error states
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState(false);
  const [farmsLoading, setFarmsLoading] = useState(false);
  const [farmsError, setFarmsError] = useState(false);
  const [notifLoading, setNotifLoading] = useState(false);
  const [notifError, setNotifError] = useState(false);
  const [notifSaving, setNotifSaving] = useState(false);
  const [notifSaved, setNotifSaved] = useState(false);
  const [notifSaveError, setNotifSaveError] = useState(false);

  // Local edits to notification prefs (before save)
  const [localPrefs, setLocalPrefs] = useState<Record<string, boolean>>(DEFAULT_PREFS);
  const savedToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch stats on mount (also gates 403), then lazy-load the active tab's data
  useEffect(() => {
    getAdminStats()
      .then((data) => {
        setStats(data);
        setLoading(false);
        // If the URL hash pointed to a lazy tab, trigger its fetch now
        if (activeTab === 'users') fetchUsers();
        if (activeTab === 'farms') fetchFarms();
        if (activeTab === 'notifications') fetchNotifPrefs();
      })
      .catch((err) => {
        if (err instanceof ApiError && err.statusCode === 403) setForbidden(true);
        setLoading(false);
      });
  }, []);

  function switchTab(tab: AdminTab) {
    setActiveTab(tab);
    window.location.hash = tab;
    if (tab === 'users' && users === null) fetchUsers();
    if (tab === 'farms' && farms === null) fetchFarms();
    if (tab === 'notifications' && notifPrefs === null) fetchNotifPrefs();
  }

  async function fetchUsers() {
    setUsersLoading(true);
    setUsersError(false);
    try {
      const data = await getAdminUsers();
      setUsers(data.users);
    } catch {
      setUsersError(true);
    } finally {
      setUsersLoading(false);
    }
  }

  async function fetchFarms() {
    setFarmsLoading(true);
    setFarmsError(false);
    try {
      const data = await getAdminFarms();
      setFarms(data.farms);
    } catch {
      setFarmsError(true);
    } finally {
      setFarmsLoading(false);
    }
  }

  async function fetchNotifPrefs() {
    setNotifLoading(true);
    setNotifError(false);
    try {
      const data = await getNotificationPrefs();
      setNotifPrefs(data);
      setLocalPrefs({ ...DEFAULT_PREFS, ...data.prefs });
    } catch {
      setNotifError(true);
    } finally {
      setNotifLoading(false);
    }
  }

  function togglePref(key: string) {
    setLocalPrefs((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  async function saveNotifPrefs() {
    setNotifSaving(true);
    setNotifSaveError(false);
    setNotifSaved(false);
    try {
      const result = await updateNotificationPrefs(localPrefs);
      setNotifPrefs(result);
      setLocalPrefs({ ...DEFAULT_PREFS, ...result.prefs });
      setNotifSaved(true);
      if (savedToastTimer.current) clearTimeout(savedToastTimer.current);
      savedToastTimer.current = setTimeout(() => setNotifSaved(false), 3000);
    } catch {
      setNotifSaveError(true);
      // Revert to server state on error
      if (notifPrefs) setLocalPrefs({ ...DEFAULT_PREFS, ...notifPrefs.prefs });
    } finally {
      setNotifSaving(false);
    }
  }

  if (forbidden) {
    return (
      <div style="padding:var(--space-6);text-align:center;color:var(--color-gray-500)">
        <p style="font-size:var(--font-size-lg)">Not authorized</p>
        <p style="font-size:var(--font-size-sm);margin-top:var(--space-2)">Admin access required.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div style="padding:var(--space-4);display:flex;flex-direction:column;gap:var(--space-3)">
        {[0, 1, 2].map((i) => <div key={i} class="skeleton skeleton-tile" />)}
      </div>
    );
  }

  const TABS: { key: AdminTab; label: string }[] = [
    { key: 'system', label: t('admin.system') },
    { key: 'users', label: t('admin.users') },
    { key: 'farms', label: t('admin.farms') },
    { key: 'notifications', label: t('admin.notifications') },
  ];

  return (
    <div>
      {/* Tab bar */}
      <div role="tablist" style="display:flex;border-bottom:var(--border-default);background:var(--color-surface)">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            role="tab"
            aria-selected={activeTab === key}
            aria-controls={`panel-${key}`}
            onClick={() => switchTab(key)}
            style={`flex:1;padding:var(--space-3) var(--space-4);cursor:pointer;border:none;background:none;font-size:var(--font-size-sm);border-bottom:2px solid ${activeTab === key ? 'var(--color-primary)' : 'transparent'};color:${activeTab === key ? 'var(--color-primary)' : 'var(--color-gray-500)'};font-weight:${activeTab === key ? 'var(--font-weight-semibold)' : 'normal'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tab panels */}
      <div role="tabpanel" id={`panel-${activeTab}`} aria-live="polite" style="padding:var(--space-4)">
        {activeTab === 'system' && stats && <SystemPanel stats={stats} />}
        {activeTab === 'users' && renderDataPanel(usersLoading, usersError, users, (u) => <UsersPanel users={u} />)}
        {activeTab === 'farms' && renderDataPanel(farmsLoading, farmsError, farms, (f) => <FarmsPanel farms={f} />)}
        {activeTab === 'notifications' && (
          <NotificationsPanel
            isLoading={notifLoading}
            hasError={notifError}
            localPrefs={localPrefs}
            isSaving={notifSaving}
            isSaved={notifSaved}
            hasSaveError={notifSaveError}
            onToggle={togglePref}
            onSave={saveNotifPrefs}
          />
        )}
      </div>
    </div>
  );
}

function SkeletonRows() {
  return (
    <div style="display:flex;flex-direction:column;gap:var(--space-2)">
      {[0, 1, 2].map((i) => <div key={i} class="skeleton" style="height:64px;border-radius:var(--radius-md)" />)}
    </div>
  );
}

/** Renders a loading skeleton, error message, data panel, or nothing based on fetch state. */
function renderDataPanel<T>(isLoading: boolean, hasError: boolean, data: T | null, render: (data: T) => JSX.Element): JSX.Element | null {
  if (isLoading) return <SkeletonRows />;
  if (hasError) {
    return (
      <div style="color:var(--color-gray-500);text-align:center;padding:var(--space-6)">
        Failed to load data. Please try again later.
      </div>
    );
  }
  if (data) return render(data);
  return null;
}

function SystemPanel({ stats }: { stats: AdminStatsResponse }) {
  return (
    <div style="display:grid;gap:var(--space-3);grid-template-columns:repeat(auto-fit,minmax(200px,1fr))">
      <StatCard label={t('admin.farms')} value={stats.entity_counts.farms} />
      <StatCard label={t('admin.users')} value={stats.entity_counts.users} />
      <StatCard label="Beds" value={stats.entity_counts.beds} />
      {stats.global_budget && (
        <StatCard
          label="Budget"
          value={`${Math.round(stats.global_budget.utilization_pct)}%`}
        />
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div style="background:var(--color-surface);border:var(--border-default);border-radius:var(--radius-md);padding:var(--space-4)">
      <div style="font-size:var(--font-size-xs);color:var(--color-gray-500);text-transform:uppercase;letter-spacing:0.05em">{label}</div>
      <div style="font-size:var(--font-size-2xl);font-weight:var(--font-weight-bold);margin-top:var(--space-1)">{value}</div>
    </div>
  );
}

function UsersPanel({ users }: { users: AdminUserItem[] }) {
  if (users.length === 0) {
    return <div style="color:var(--color-gray-500);text-align:center;padding:var(--space-6)">{t('admin.no_users')}</div>;
  }
  return (
    <div style="display:flex;flex-direction:column;gap:var(--space-2)">
      {users.map((user) => (
        <div key={user.user_id} style="display:flex;justify-content:space-between;align-items:center;padding:var(--space-3);background:var(--color-surface);border:var(--border-default);border-radius:var(--radius-md)">
          <div>
            <div style="font-weight:var(--font-weight-semibold)">{user.display_name || user.user_id.slice(0, 8) + '...'}</div>
            <div style="font-size:var(--font-size-xs);color:var(--color-gray-400);font-family:monospace">{user.user_id.slice(0, 8)}</div>
          </div>
          <div style="font-size:var(--font-size-xs);color:var(--color-gray-400)">
            {user.created_at ? new Date(user.created_at).toLocaleDateString() : '—'}
          </div>
        </div>
      ))}
    </div>
  );
}

function FarmsPanel({ farms }: { farms: AdminFarmItem[] }) {
  if (farms.length === 0) {
    return <div style="color:var(--color-gray-500);text-align:center;padding:var(--space-6)">{t('admin.no_farms')}</div>;
  }
  return (
    <div style="display:flex;flex-direction:column;gap:var(--space-2)">
      {farms.map((farm) => (
        <div key={farm.id} style="display:flex;justify-content:space-between;align-items:center;padding:var(--space-3);background:var(--color-surface);border:var(--border-default);border-radius:var(--radius-md)">
          <div style="flex:1;min-width:0">
            <div style="font-weight:var(--font-weight-semibold);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{farm.name}</div>
            <div style="font-size:var(--font-size-xs);color:var(--color-gray-500)">
              {farm.grid_rows}×{farm.grid_cols} · {farm.member_count} {t('admin.members')}
            </div>
          </div>
          <div style="font-size:var(--font-size-xs);color:var(--color-gray-400);font-family:monospace">
            {farm.id.slice(0, 8)}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Notification group definitions ────────────────────────────────

const NOTIF_GROUPS: Array<{ sectionKey: string; keys: string[] }> = [
  {
    sectionKey: 'admin.notifications_section_user',
    keys: ['user.signup', 'account.deleted'],
  },
  {
    sectionKey: 'admin.notifications_section_farm',
    keys: ['farm.created', 'farm.deleted'],
  },
  {
    sectionKey: 'admin.notifications_section_join',
    keys: ['join_request.submitted', 'join_request.approved', 'join_request.rejected'],
  },
];

// Map event key → i18n key suffix
const NOTIF_LABEL_KEYS: Record<string, string> = {
  'user.signup': 'admin.notifications_user_signup',
  'account.deleted': 'admin.notifications_account_deleted',
  'farm.created': 'admin.notifications_farm_created',
  'farm.deleted': 'admin.notifications_farm_deleted',
  'join_request.submitted': 'admin.notifications_join_request_submitted',
  'join_request.approved': 'admin.notifications_join_request_approved',
  'join_request.rejected': 'admin.notifications_join_request_rejected',
};

interface NotificationsPanelProps {
  isLoading: boolean;
  hasError: boolean;
  localPrefs: Record<string, boolean>;
  isSaving: boolean;
  isSaved: boolean;
  hasSaveError: boolean;
  onToggle: (key: string) => void;
  onSave: () => void;
}

function NotificationsPanel({
  isLoading,
  hasError,
  localPrefs,
  isSaving,
  isSaved,
  hasSaveError,
  onToggle,
  onSave,
}: NotificationsPanelProps) {
  if (isLoading) return <SkeletonRows />;
  if (hasError) {
    return (
      <div style="color:var(--color-gray-500);text-align:center;padding:var(--space-6)">
        Failed to load notification preferences. Please try again later.
      </div>
    );
  }

  return (
    <div style="max-width:560px">
      <div style="margin-bottom:var(--space-5)">
        <h2 style="font-size:var(--font-size-base);font-weight:var(--font-weight-semibold);margin-bottom:var(--space-1)">
          {t('admin.notifications_title')}
        </h2>
        <p style="font-size:var(--font-size-sm);color:var(--color-gray-500)">
          {t('admin.notifications_description')}
        </p>
      </div>

      {NOTIF_GROUPS.map(({ sectionKey, keys }) => (
        <div key={sectionKey} style="margin-bottom:var(--space-5)">
          <div style="font-size:var(--font-size-xs);font-weight:var(--font-weight-semibold);text-transform:uppercase;letter-spacing:0.05em;color:var(--color-gray-500);margin-bottom:var(--space-2)">
            {t(sectionKey)}
          </div>
          <div style="background:var(--color-surface);border:var(--border-default);border-radius:var(--radius-md);overflow:hidden">
            {keys.map((key, idx) => (
              <div
                key={key}
                style={`display:flex;justify-content:space-between;align-items:center;padding:var(--space-3) var(--space-4);${idx > 0 ? 'border-top:var(--border-default);' : ''}`}
              >
                <span style="font-size:var(--font-size-sm)">{t(NOTIF_LABEL_KEYS[key] ?? key)}</span>
                <button
                  role="switch"
                  aria-checked={localPrefs[key] ?? true}
                  onClick={() => onToggle(key)}
                  style={`
                    position:relative;display:inline-flex;align-items:center;
                    width:44px;height:24px;border-radius:12px;border:none;cursor:pointer;
                    padding:2px;transition:background 0.2s;
                    background:${(localPrefs[key] ?? true) ? 'var(--color-primary)' : 'var(--color-gray-300)'};
                  `}
                  aria-label={t(NOTIF_LABEL_KEYS[key] ?? key)}
                >
                  <span style={`
                    display:block;width:20px;height:20px;border-radius:50%;
                    background:white;transition:transform 0.2s;
                    transform:${(localPrefs[key] ?? true) ? 'translateX(20px)' : 'translateX(0)'};
                    box-shadow:0 1px 3px rgba(0,0,0,0.2);
                  `} />
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}

      <div style="display:flex;align-items:center;gap:var(--space-3);margin-top:var(--space-4)">
        <button
          onClick={onSave}
          disabled={isSaving}
          style={`
            padding:var(--space-2) var(--space-5);border-radius:var(--radius-md);border:none;
            cursor:${isSaving ? 'default' : 'pointer'};
            background:var(--color-primary);color:white;
            font-size:var(--font-size-sm);font-weight:var(--font-weight-semibold);
            opacity:${isSaving ? '0.7' : '1'};
          `}
        >
          {isSaving ? '…' : t('admin.notifications_save')}
        </button>
        {isSaved && (
          <span style="font-size:var(--font-size-sm);color:var(--color-success,#22c55e)">
            {t('admin.notifications_saved')}
          </span>
        )}
        {hasSaveError && (
          <span style="font-size:var(--font-size-sm);color:var(--color-error,#ef4444)">
            {t('admin.notifications_save_error')}
          </span>
        )}
      </div>
    </div>
  );
}

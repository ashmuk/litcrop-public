/**
 * AdminDashboard — #179
 *
 * 5-tab admin interface: System, Users, Farms, Activity, Notifications.
 * Data fetched lazily per tab. URL hash routing for bookmarkability.
 */

import type { JSX } from 'preact';
import { useState, useEffect, useRef } from 'preact/hooks';
import { getAdminStats, getAdminUsers, getAdminFarms, getNotificationPrefs, updateNotificationPrefs, getAdminActivities, adminDeleteUser, adminTestNotification, ApiError } from '../lib/api';
import type { AdminStatsResponse, AdminUserItem, AdminFarmItem, NotificationPrefsResponse, ActivityItem, ActivityResponse } from '../lib/api';
import { t } from '../i18n/i18n';
import { showToast } from './Toast';
import { getCurrentUser } from '../lib/auth';

type AdminTab = 'system' | 'users' | 'farms' | 'activity' | 'notifications';

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

// ── Default activity date range (last 7 days) ─────────────────────

function defaultFromDate(): string {
  const d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10); // "YYYY-MM-DD"
}

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState<AdminTab>(() => {
    if (typeof window === 'undefined') return 'system';
    const hash = window.location.hash.slice(1);
    return ['system', 'users', 'farms', 'activity', 'notifications'].includes(hash) ? hash as AdminTab : 'system';
  });

  // Data caches
  const [stats, setStats] = useState<AdminStatsResponse | null>(null);
  const [users, setUsers] = useState<AdminUserItem[] | null>(null);
  const [farms, setFarms] = useState<AdminFarmItem[] | null>(null);
  const [notifPrefs, setNotifPrefs] = useState<NotificationPrefsResponse | null>(null);

  // Activity state
  const [activities, setActivities] = useState<ActivityItem[] | null>(null);
  const [activityCursor, setActivityCursor] = useState<string | undefined>(undefined);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityError, setActivityError] = useState(false);
  const [activityLoadingMore, setActivityLoadingMore] = useState(false);
  // Activity filters
  const [activityFrom, setActivityFrom] = useState(defaultFromDate);
  const [activityTo, setActivityTo] = useState(todayDate);
  const [activityEventType, setActivityEventType] = useState('');
  const [activitySearch, setActivitySearch] = useState('');

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
        if (activeTab === 'activity') fetchActivities(true);
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
    if (tab === 'activity' && activities === null) fetchActivities(true);
    if (tab === 'notifications' && notifPrefs === null) fetchNotifPrefs();
  }

  async function fetchActivities(reset: boolean) {
    if (reset) {
      setActivityLoading(true);
      setActivityError(false);
      setActivities(null);
      setActivityCursor(undefined);
    } else {
      setActivityLoadingMore(true);
    }
    try {
      const data: ActivityResponse = await getAdminActivities({
        from: activityFrom ? `${activityFrom}T00:00:00.000Z` : undefined,
        to: activityTo ? `${activityTo}T23:59:59.999Z` : undefined,
        event_type: activityEventType || undefined,
        q: activitySearch || undefined,
        cursor: reset ? undefined : activityCursor,
        limit: 50,
      });
      if (reset) {
        setActivities(data.activities);
      } else {
        setActivities((prev) => [...(prev ?? []), ...data.activities]);
      }
      setActivityCursor(data.next_cursor);
    } catch {
      setActivityError(true);
    } finally {
      setActivityLoading(false);
      setActivityLoadingMore(false);
    }
  }

  function resetActivityFilters() {
    setActivityFrom(defaultFromDate());
    setActivityTo(todayDate());
    setActivityEventType('');
    setActivitySearch('');
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
    { key: 'activity', label: t('admin.activity') },
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
        {activeTab === 'users' && renderDataPanel(usersLoading, usersError, users, (u) => <UsersPanel users={u} onReload={fetchUsers} />)}
        {activeTab === 'farms' && renderDataPanel(farmsLoading, farmsError, farms, (f) => <FarmsPanel farms={f} />)}
        {activeTab === 'activity' && (
          <ActivityPanel
            activities={activities}
            isLoading={activityLoading}
            hasError={activityError}
            nextCursor={activityCursor}
            isLoadingMore={activityLoadingMore}
            filterFrom={activityFrom}
            filterTo={activityTo}
            filterEventType={activityEventType}
            filterSearch={activitySearch}
            onFilterFromChange={setActivityFrom}
            onFilterToChange={setActivityTo}
            onFilterEventTypeChange={setActivityEventType}
            onFilterSearchChange={setActivitySearch}
            onApplyFilters={() => fetchActivities(true)}
            onLoadMore={() => fetchActivities(false)}
            onResetFilters={() => {
              resetActivityFilters();
            }}
          />
        )}
        {activeTab === 'notifications' && (
          <>
          {stats && stats.notifications_enabled === false && (
            <div style="background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.3);border-radius:var(--radius-md);padding:var(--space-3);margin-bottom:var(--space-3);font-size:var(--font-size-sm);color:#92400e">
              {t('admin.notifications_disabled')}
            </div>
          )}
          <TestEmailButton />
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
          </>
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

function UsersPanel({ users, onReload }: { users: AdminUserItem[]; onReload: () => void }) {
  const currentUser = getCurrentUser();
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete(userId: string) {
    setDeleting(true);
    try {
      await adminDeleteUser(userId);
      showToast(t('admin.user_deleted'), 'success');
      setConfirmingId(null);
      onReload();
    } catch {
      showToast(t('admin.delete_failed'), 'error');
    } finally {
      setDeleting(false);
    }
  }

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
          <div style="display:flex;align-items:center;gap:var(--space-2)">
            <div style="font-size:var(--font-size-xs);color:var(--color-gray-400)">
              {user.created_at ? new Date(user.created_at).toLocaleDateString() : '—'}
            </div>
            {currentUser?.sub !== user.user_id && (
              confirmingId === user.user_id ? (
                <div style="display:flex;gap:var(--space-1)">
                  <button
                    class="btn btn--danger btn--sm"
                    onClick={() => handleDelete(user.user_id)}
                    disabled={deleting}
                    style="font-size:var(--font-size-xs)"
                  >
                    {deleting ? '…' : t('admin.confirm_delete')}
                  </button>
                  <button
                    class="btn btn--secondary btn--sm"
                    onClick={() => setConfirmingId(null)}
                    disabled={deleting}
                    style="font-size:var(--font-size-xs)"
                  >
                    {t('buttons.cancel')}
                  </button>
                </div>
              ) : (
                <button
                  class="btn btn--secondary btn--sm"
                  onClick={() => setConfirmingId(user.user_id)}
                  disabled={deleting}
                  style="font-size:var(--font-size-xs);color:var(--color-error)"
                  title={t('admin.delete_user')}
                >
                  {t('admin.delete_user')}
                </button>
              )
            )}
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

// ── Activity event type metadata ──────────────────────────────────

const EVENT_LABELS: Record<string, { labelKey: string; color: string }> = {
  'user.signup':               { labelKey: 'admin.activity_event_user_signup',               color: '#34d399' },
  'farm.created':              { labelKey: 'admin.activity_event_farm_created',              color: '#6c8cff' },
  'farm.deleted':              { labelKey: 'admin.activity_event_farm_deleted',              color: '#f87171' },
  'farm.updated':              { labelKey: 'admin.activity_event_farm_updated',              color: '#60a5fa' },
  'bed.updated':               { labelKey: 'admin.activity_event_bed_updated',               color: '#a78bfa' },
  'image.uploaded':            { labelKey: 'admin.activity_event_image_uploaded',            color: '#fbbf24' },
  'tag.created':               { labelKey: 'admin.activity_event_tag_created',               color: '#f59e0b' },
  'member.joined':             { labelKey: 'admin.activity_event_member_joined',             color: '#34d399' },
  'member.removed':            { labelKey: 'admin.activity_event_member_removed',            color: '#fb923c' },
  'join_request.submitted':    { labelKey: 'admin.activity_event_join_request_submitted',    color: '#818cf8' },
  'join_request.approved':     { labelKey: 'admin.activity_event_join_request_approved',     color: '#4ade80' },
  'join_request.rejected':     { labelKey: 'admin.activity_event_join_request_rejected',     color: '#f87171' },
  'account.deleted':           { labelKey: 'admin.activity_event_account_deleted',           color: '#ef4444' },
  'user.profile_updated':      { labelKey: 'admin.activity_event_user_profile_updated',      color: '#94a3b8' },
};

const ALL_EVENT_TYPE_KEYS = Object.keys(EVENT_LABELS);

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

interface ActivityPanelProps {
  activities: ActivityItem[] | null;
  isLoading: boolean;
  hasError: boolean;
  nextCursor?: string;
  isLoadingMore: boolean;
  filterFrom: string;
  filterTo: string;
  filterEventType: string;
  filterSearch: string;
  onFilterFromChange: (v: string) => void;
  onFilterToChange: (v: string) => void;
  onFilterEventTypeChange: (v: string) => void;
  onFilterSearchChange: (v: string) => void;
  onApplyFilters: () => void;
  onLoadMore: () => void;
  onResetFilters: () => void;
}

function ActivityPanel({
  activities,
  isLoading,
  hasError,
  nextCursor,
  isLoadingMore,
  filterFrom,
  filterTo,
  filterEventType,
  filterSearch,
  onFilterFromChange,
  onFilterToChange,
  onFilterEventTypeChange,
  onFilterSearchChange,
  onApplyFilters,
  onLoadMore,
  onResetFilters,
}: ActivityPanelProps) {
  // Submit on Enter in search
  function handleSearchKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter') onApplyFilters();
  }

  return (
    <div>
      <h2 style="font-size:var(--font-size-base);font-weight:var(--font-weight-semibold);margin-bottom:var(--space-4)">
        {t('admin.activity_title')}
      </h2>

      {/* Filter bar */}
      <div style="display:flex;flex-wrap:wrap;gap:var(--space-2);margin-bottom:var(--space-4);align-items:flex-end">
        <div style="display:flex;flex-direction:column;gap:var(--space-1)">
          <label style="font-size:var(--font-size-xs);color:var(--color-gray-500)">{t('admin.activity_filter_from')}</label>
          <input
            type="date"
            value={filterFrom}
            onInput={(e) => onFilterFromChange((e.target as HTMLInputElement).value)}
            style="padding:var(--space-1) var(--space-2);border:var(--border-default);border-radius:var(--radius-sm);font-size:var(--font-size-sm);background:var(--color-surface)"
          />
        </div>
        <div style="display:flex;flex-direction:column;gap:var(--space-1)">
          <label style="font-size:var(--font-size-xs);color:var(--color-gray-500)">{t('admin.activity_filter_to')}</label>
          <input
            type="date"
            value={filterTo}
            onInput={(e) => onFilterToChange((e.target as HTMLInputElement).value)}
            style="padding:var(--space-1) var(--space-2);border:var(--border-default);border-radius:var(--radius-sm);font-size:var(--font-size-sm);background:var(--color-surface)"
          />
        </div>
        <div style="display:flex;flex-direction:column;gap:var(--space-1)">
          <label style="font-size:var(--font-size-xs);color:var(--color-gray-500)">{t('admin.activity_filter_type')}</label>
          <select
            value={filterEventType}
            onChange={(e) => onFilterEventTypeChange((e.target as HTMLSelectElement).value)}
            style="padding:var(--space-1) var(--space-2);border:var(--border-default);border-radius:var(--radius-sm);font-size:var(--font-size-sm);background:var(--color-surface)"
          >
            <option value="">All types</option>
            {ALL_EVENT_TYPE_KEYS.map((key) => (
              <option key={key} value={key}>{t(EVENT_LABELS[key].labelKey)}</option>
            ))}
          </select>
        </div>
        <div style="display:flex;flex-direction:column;gap:var(--space-1);flex:1;min-width:160px">
          <label style="font-size:var(--font-size-xs);color:var(--color-gray-500)">{t('admin.activity_filter_search')}</label>
          <input
            type="text"
            value={filterSearch}
            placeholder={t('admin.activity_filter_search')}
            onInput={(e) => onFilterSearchChange((e.target as HTMLInputElement).value)}
            onKeyDown={handleSearchKeyDown}
            style="padding:var(--space-1) var(--space-2);border:var(--border-default);border-radius:var(--radius-sm);font-size:var(--font-size-sm);background:var(--color-surface)"
          />
        </div>
        <button
          onClick={onApplyFilters}
          style="padding:var(--space-1) var(--space-3);border-radius:var(--radius-sm);border:none;background:var(--color-primary);color:white;font-size:var(--font-size-sm);cursor:pointer"
        >
          Apply
        </button>
      </div>

      {/* Log content */}
      {isLoading && <SkeletonRows />}
      {hasError && (
        <div style="color:var(--color-gray-500);text-align:center;padding:var(--space-6)">
          Failed to load activity. Please try again later.
        </div>
      )}
      {!isLoading && !hasError && activities !== null && activities.length === 0 && (
        <div class="empty-state">
          <span class="empty-state__icon">📋</span>
          <p class="empty-state__heading">{t('admin.activity_empty')}</p>
          <button
            onClick={onResetFilters}
            style="margin-top:var(--space-2);font-size:var(--font-size-sm);color:var(--color-primary);background:none;border:none;cursor:pointer;text-decoration:underline"
          >
            {t('admin.activity_filter_reset')}
          </button>
        </div>
      )}
      {!isLoading && !hasError && activities !== null && activities.length > 0 && (
        <div style="display:flex;flex-direction:column;gap:var(--space-1)">
          {activities.map((item) => (
            <ActivityRow key={`${item.id}-${item.created_at}`} item={item} />
          ))}
        </div>
      )}

      {/* Load more */}
      {nextCursor && !isLoading && !hasError && (
        <div style="text-align:center;margin-top:var(--space-4)">
          <button
            onClick={onLoadMore}
            disabled={isLoadingMore}
            style={`padding:var(--space-2) var(--space-5);border-radius:var(--radius-md);border:var(--border-default);background:var(--color-surface);font-size:var(--font-size-sm);cursor:${isLoadingMore ? 'default' : 'pointer'};opacity:${isLoadingMore ? '0.6' : '1'}`}
          >
            {isLoadingMore ? '…' : t('admin.activity_load_more')}
          </button>
        </div>
      )}
    </div>
  );
}

function ActivityRow({ item }: { item: ActivityItem }) {
  const meta = EVENT_LABELS[item.event_type] ?? { labelKey: item.event_type, color: '#94a3b8' };
  const label = t(meta.labelKey);

  return (
    <div style="display:grid;grid-template-columns:auto 1fr auto;gap:var(--space-3);align-items:center;padding:var(--space-2) var(--space-3);background:var(--color-surface);border:var(--border-default);border-radius:var(--radius-md)">
      {/* Event badge */}
      <span style={`display:inline-block;padding:2px 8px;border-radius:9999px;font-size:11px;font-weight:600;white-space:nowrap;background:${meta.color}22;color:${meta.color}`}>
        {label}
      </span>

      {/* Details */}
      <div style="min-width:0">
        <div style="font-size:var(--font-size-sm);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
          {item.actor_email || item.actor_id.slice(0, 8)}
          {item.target_name ? <span style="color:var(--color-gray-500)"> → {item.target_name}</span> : null}
        </div>
        {(item.details || item.farm_id) && (
          <div style="font-size:11px;color:var(--color-gray-400);font-family:monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
            {item.details ? JSON.stringify(item.details) : null}
            {/* farm_name is not denormalized on bed/tag/image events — show farm_id as fallback */}
            {item.farm_id && !(item.details as Record<string, unknown> | undefined)?.['farm_id'] ? ` farm:${item.farm_id.slice(0, 8)}` : null}
          </div>
        )}
      </div>

      {/* Time */}
      <div
        title={item.created_at}
        style="font-size:var(--font-size-xs);color:var(--color-gray-400);white-space:nowrap"
      >
        {formatRelativeTime(item.created_at)}
      </div>
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

function TestEmailButton() {
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ success: boolean; error?: string } | null>(null);

  async function handleTest() {
    setSending(true);
    setResult(null);
    try {
      const res = await adminTestNotification();
      setResult(res);
      if (res.success) {
        showToast(t('admin.test_email_sent'), 'success');
      } else {
        showToast(res.error ?? t('admin.test_email_failed'), 'error');
      }
    } catch {
      setResult({ success: false, error: 'Network error' });
      showToast(t('admin.test_email_failed'), 'error');
    } finally {
      setSending(false);
    }
  }

  return (
    <div style="margin-bottom:var(--space-3);display:flex;align-items:center;gap:var(--space-3)">
      <button
        class="btn btn--secondary btn--sm"
        onClick={handleTest}
        disabled={sending}
        style="font-size:var(--font-size-sm)"
      >
        {sending ? '...' : t('admin.test_email')}
      </button>
      {result && (
        <span style={`font-size:var(--font-size-xs);color:${result.success ? '#16a34a' : 'var(--color-error)'}`}>
          {result.success ? t('admin.test_email_success') : (result.error ?? t('admin.test_email_failed'))}
        </span>
      )}
    </div>
  );
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

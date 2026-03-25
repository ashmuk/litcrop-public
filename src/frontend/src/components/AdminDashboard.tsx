/**
 * AdminDashboard — #179
 *
 * 3-tab admin interface: System, Users, Farms.
 * Read-only for Beta-2. Data fetched lazily per tab.
 * URL hash routing for bookmarkability.
 */

import type { JSX } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import { getAdminStats, getAdminUsers, getAdminFarms, ApiError } from '../lib/api';
import type { AdminStatsResponse, AdminUserItem, AdminFarmItem } from '../lib/api';
import { t } from '../i18n/i18n';

type AdminTab = 'system' | 'users' | 'farms';

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState<AdminTab>(() => {
    if (typeof window === 'undefined') return 'system';
    const hash = window.location.hash.slice(1);
    return ['system', 'users', 'farms'].includes(hash) ? hash as AdminTab : 'system';
  });

  // Data caches
  const [stats, setStats] = useState<AdminStatsResponse | null>(null);
  const [users, setUsers] = useState<AdminUserItem[] | null>(null);
  const [farms, setFarms] = useState<AdminFarmItem[] | null>(null);

  // Loading/error states
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState(false);
  const [farmsLoading, setFarmsLoading] = useState(false);
  const [farmsError, setFarmsError] = useState(false);

  // Fetch stats on mount (also gates 403), then lazy-load the active tab's data
  useEffect(() => {
    getAdminStats()
      .then((data) => {
        setStats(data);
        setLoading(false);
        // If the URL hash pointed to users/farms, trigger their lazy fetch now
        if (activeTab === 'users') fetchUsers();
        if (activeTab === 'farms') fetchFarms();
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

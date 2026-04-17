/**
 * Admin Stats Island
 *
 * Displays entity counts and global budget usage for operators.
 * Handles 403 gracefully (non-admin users see "Not authorized").
 * Auto-refreshes every 60 seconds.
 *
 * Accessed via direct URL /admin/ — no nav tab link.
 */

import { useState, useEffect } from 'preact/hooks';
import { getAdminStats, ApiError } from '../lib/api';
import type { AdminStatsResponse } from '../lib/api';

export default function AdminStats() {
  const [stats, setStats] = useState<AdminStatsResponse | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  async function fetchStats(refresh = false) {
    try {
      const data = await getAdminStats(refresh);
      setStats(data);
      setLastRefresh(new Date());
      setError(false);
    } catch (err) {
      if (err instanceof ApiError && err.statusCode === 403) {
        setForbidden(true);
      } else {
        setError(true);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 60_000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div style="padding:var(--space-6);display:flex;flex-direction:column;gap:var(--space-4)">
        {[0, 1, 2].map((i) => <div key={i} class="skeleton" style="height:80px;border-radius:var(--radius-md)" />)}
      </div>
    );
  }

  if (forbidden) {
    return (
      <div class="empty-state">
        <span class="empty-state__icon">🔒</span>
        <p class="empty-state__heading">Not Authorized</p>
        <p class="empty-state__body">This page is restricted to administrators.</p>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div class="empty-state">
        <span class="empty-state__icon">⚠️</span>
        <p class="empty-state__heading">Could not load stats</p>
        <p class="empty-state__body">Check your connection and try again.</p>
        <button class="btn-primary" style="margin-top:var(--space-4)" onClick={fetchStats}>
          Retry
        </button>
      </div>
    );
  }

  const { entity_counts, global_budget, period_start, reset_at } = stats;
  const inputPct = Math.min(
    100,
    Math.round((global_budget.input_tokens_used / global_budget.input_tokens_limit) * 100),
  );
  const outputPct = Math.min(
    100,
    Math.round((global_budget.output_tokens_used / global_budget.output_tokens_limit) * 100),
  );

  const periodDate = new Date(period_start).toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
  });
  const resetTime = new Date(reset_at).toLocaleTimeString(undefined, {
    hour: '2-digit', minute: '2-digit',
  });

  return (
    <div style="padding:var(--space-4);display:flex;flex-direction:column;gap:var(--space-5)">

      {/* ── Entity counts ─────────────────────────────────────── */}
      <section>
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--space-3)">
          <h2 style="font-size:var(--font-size-base);font-weight:var(--font-weight-semibold);color:var(--color-gray-500);margin:0">
            ENTITIES
          </h2>
          <div style="display:flex;align-items:center;gap:var(--space-2)">
            {lastRefresh && (
              <span style="font-size:var(--font-size-xs);color:var(--color-gray-400)">
                {lastRefresh.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
            <button
              type="button"
              onClick={() => fetchStats(true)}
              style="font-size:var(--font-size-xs);padding:4px 10px;border:1px solid var(--color-gray-300);border-radius:var(--radius-full);background:var(--color-surface);color:var(--color-gray-600);cursor:pointer"
              title="Refresh stats (skip cache)"
            >
              Refresh
            </button>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:var(--space-3)">
          {([
            { label: 'Users', value: entity_counts.users, icon: '👤' },
            { label: 'Farms', value: entity_counts.farms, icon: '🏡' },
            { label: 'Beds', value: entity_counts.beds, icon: '🌱' },
          ] as const).map(({ label, value, icon }) => (
            <div
              key={label}
              style="background:var(--color-surface);border:var(--border-default);border-radius:var(--radius-md);padding:var(--space-4);text-align:center"
            >
              <div style="font-size:1.5rem;margin-bottom:var(--space-1)">{icon}</div>
              <div style="font-size:var(--font-size-2xl);font-weight:var(--font-weight-bold)">{value}</div>
              <div style="font-size:var(--font-size-xs);color:var(--color-gray-500)">{label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Global budget ─────────────────────────────────────── */}
      <section>
        <h2 style="font-size:var(--font-size-base);font-weight:var(--font-weight-semibold);color:var(--color-gray-500);margin-bottom:var(--space-3)">
          GLOBAL BUDGET TODAY — {periodDate}
        </h2>
        <div style="background:var(--color-surface);border:var(--border-default);border-radius:var(--radius-md);padding:var(--space-4);display:flex;flex-direction:column;gap:var(--space-4)">

          {/* Input tokens */}
          <div>
            <div style="display:flex;justify-content:space-between;font-size:var(--font-size-sm);margin-bottom:var(--space-1)">
              <span>Input tokens</span>
              <span style="font-weight:var(--font-weight-semibold)">
                {global_budget.input_tokens_used.toLocaleString()} / {global_budget.input_tokens_limit.toLocaleString()}
              </span>
            </div>
            <div style="background:var(--color-gray-200);border-radius:9999px;height:8px;overflow:hidden">
              <div
                style={`height:100%;border-radius:9999px;background:${inputPct > 80 ? 'var(--color-danger, #e53e3e)' : 'var(--color-primary)'};width:${inputPct}%`}
              />
            </div>
            <div style="font-size:var(--font-size-xs);color:var(--color-gray-500);margin-top:2px">{inputPct}% used</div>
          </div>

          {/* Output tokens */}
          <div>
            <div style="display:flex;justify-content:space-between;font-size:var(--font-size-sm);margin-bottom:var(--space-1)">
              <span>Output tokens</span>
              <span style="font-weight:var(--font-weight-semibold)">
                {global_budget.output_tokens_used.toLocaleString()} / {global_budget.output_tokens_limit.toLocaleString()}
              </span>
            </div>
            <div style="background:var(--color-gray-200);border-radius:9999px;height:8px;overflow:hidden">
              <div
                style={`height:100%;border-radius:9999px;background:${outputPct > 80 ? 'var(--color-danger, #e53e3e)' : 'var(--color-primary)'};width:${outputPct}%`}
              />
            </div>
            <div style="font-size:var(--font-size-xs);color:var(--color-gray-500);margin-top:2px">{outputPct}% used</div>
          </div>

          <div style="font-size:var(--font-size-xs);color:var(--color-gray-500);border-top:var(--border-default);padding-top:var(--space-2)">
            Resets at {resetTime} UTC
          </div>
        </div>
      </section>

      {/* ── Footer ────────────────────────────────────────────── */}
      <div style="display:flex;justify-content:space-between;align-items:center;font-size:var(--font-size-xs);color:var(--color-gray-400)">
        <span>Auto-refreshes every 60s</span>
        {lastRefresh && <span>Last refresh: {lastRefresh.toLocaleTimeString()}</span>}
      </div>
    </div>
  );
}

/**
 * FarmDiscovery — Observer farm discovery and join request UI
 *
 * Shown in ProfilePage when observer has no farms.
 * Lists discoverable farms with "Request to Join" buttons.
 */

import { useState, useEffect } from 'preact/hooks';
import { getDiscoverableFarms, requestToJoinFarm } from '../lib/api';
import type { DiscoverableFarmItem } from '../lib/api';
import { t } from '../i18n/i18n';
import { showToast } from './Toast';

export default function FarmDiscovery() {
  const [farms, setFarms] = useState<DiscoverableFarmItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState<string | null>(null);

  useEffect(() => {
    getDiscoverableFarms()
      .then(setFarms)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleJoin(farmId: string) {
    setRequesting(farmId);
    try {
      await requestToJoinFarm(farmId);
      setFarms((prev) => prev.map((f) => f.id === farmId ? { ...f, has_pending_request: true } : f));
      showToast(t('discovery.request_sent'), 'success');
    } catch {
      showToast(t('profile.save_error'), 'error');
    } finally {
      setRequesting(null);
    }
  }

  if (loading) {
    return (
      <div style="margin-top:var(--space-4)">
        <h3 style="font-size:var(--font-size-md);font-weight:var(--font-weight-semibold);margin-bottom:var(--space-3)">
          {t('discovery.title')}
        </h3>
        <div style="display:flex;flex-direction:column;gap:var(--space-2)">
          {[0, 1].map((i) => <div key={i} class="skeleton skeleton-tile" />)}
        </div>
      </div>
    );
  }

  return (
    <div style="margin-top:var(--space-4)">
      <h3 style="font-size:var(--font-size-md);font-weight:var(--font-weight-semibold);margin-bottom:var(--space-3)">
        🔍 {t('discovery.title')}
      </h3>

      {farms.length === 0 ? (
        <div class="empty-state">
          <span class="empty-state__icon">🌾</span>
          <p class="empty-state__heading">{t('discovery.no_farms')}</p>
        </div>
      ) : (
        <div style="display:flex;flex-direction:column;gap:var(--space-2)">
          {farms.map((farm) => (
            <div
              key={farm.id}
              style="display:flex;justify-content:space-between;align-items:center;padding:var(--space-3);background:var(--color-surface);border:var(--border-default);border-radius:var(--radius-md)"
            >
              <div style="flex:1;min-width:0">
                <div style="font-weight:var(--font-weight-semibold);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
                  {farm.name}
                </div>
                <div style="font-size:var(--font-size-xs);color:var(--color-gray-500)">
                  {farm.member_count} {t('discovery.members')}
                  {farm.description && ` · ${farm.description}`}
                </div>
              </div>
              <div>
                {farm.has_pending_request ? (
                  <span
                    class="badge"
                    style="font-size:var(--font-size-xs);padding:2px 8px;background:var(--color-gray-200);color:var(--color-gray-600)"
                  >
                    {t('discovery.pending')}
                  </span>
                ) : (
                  <button
                    class="btn-primary"
                    style="font-size:var(--font-size-sm);padding:var(--space-1) var(--space-3);min-width:auto"
                    disabled={requesting === farm.id}
                    onClick={() => handleJoin(farm.id)}
                  >
                    {requesting === farm.id ? '...' : t('discovery.request_join')}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

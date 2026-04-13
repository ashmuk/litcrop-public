/**
 * JoinRequestList — Admin/manager approval UI for pending join requests
 *
 * Rendered inside farm detail expansion in ProfilePage.
 * Lists pending requests with Approve/Reject buttons.
 */

import { useState, useEffect } from 'preact/hooks';
import { getJoinRequests, resolveJoinRequest } from '../lib/api';
import type { JoinRequestItem } from '../lib/api';
import { t } from '../i18n/i18n';
import { showToast } from './Toast';

interface Props {
  farmId: string;
  onMemberAdded?: () => void;
}

export default function JoinRequestList({ farmId, onMemberAdded }: Props) {
  const [requests, setRequests] = useState<JoinRequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState<string | null>(null);

  useEffect(() => {
    getJoinRequests(farmId)
      .then(setRequests)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [farmId]);

  async function handleResolve(userId: string, action: 'approve' | 'reject') {
    setResolving(userId);
    try {
      await resolveJoinRequest(farmId, userId, action);
      setRequests((prev) => prev.filter((r) => r.user_id !== userId));
      showToast(t(action === 'approve' ? 'join_requests.approved' : 'join_requests.rejected'), 'success');
      if (action === 'approve' && onMemberAdded) onMemberAdded();
    } catch {
      showToast(t('profile.save_error'), 'error');
    } finally {
      setResolving(null);
    }
  }

  if (loading) {
    return <div class="skeleton" style="height:40px;border-radius:var(--radius-sm);margin-top:var(--space-2)" />;
  }

  if (requests.length === 0) {
    return (
      <div class="empty-state" style="padding:var(--space-4)">
        <span class="empty-state__icon">📬</span>
        <p class="empty-state__heading">{t('join_requests.empty')}</p>
      </div>
    );
  }

  return (
    <div style="margin-top:var(--space-3);padding-top:var(--space-2);border-top:var(--border-default)">
      <div style="font-size:var(--font-size-sm);font-weight:var(--font-weight-semibold);margin-bottom:var(--space-2)">
        {t('join_requests.title')} ({requests.length})
      </div>
      <div style="display:flex;flex-direction:column;gap:var(--space-2)">
        {requests.map((req) => (
          <div
            key={req.user_id}
            style="display:flex;justify-content:space-between;align-items:center;padding:var(--space-2);background:var(--color-surface);border:var(--border-default);border-radius:var(--radius-sm)"
          >
            <div>
              <div style="font-size:var(--font-size-sm);font-weight:var(--font-weight-semibold)">
                {req.display_name || req.user_id.slice(0, 8) + '...'}
              </div>
              <div style="font-size:var(--font-size-xs);color:var(--color-gray-400)">
                {new Date(req.requested_at).toLocaleDateString()}
              </div>
            </div>
            <div style="display:flex;gap:var(--space-1)">
              <button
                class="btn-primary"
                style="font-size:var(--font-size-xs);padding:2px 8px;min-width:auto"
                disabled={resolving === req.user_id}
                onClick={() => handleResolve(req.user_id, 'approve')}
              >
                {t('join_requests.approve')}
              </button>
              <button
                class="btn-secondary"
                style="font-size:var(--font-size-xs);padding:2px 8px;min-width:auto"
                disabled={resolving === req.user_id}
                onClick={() => handleResolve(req.user_id, 'reject')}
              >
                {t('join_requests.reject')}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

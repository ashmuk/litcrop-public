/**
 * NotificationBell — in-app notification bell with badge and dropdown (#391).
 *
 * Preact island loaded in DesktopNav and BaseLayout.
 * Polls unread count on mount, shows dropdown with recent notifications.
 * Supports mark-as-read (single) and mark-all-read.
 */

import { useState, useEffect, useRef } from 'preact/hooks';
import { getNotifications, getNotificationUnreadCount, markNotificationRead, markAllNotificationsRead } from '../lib/api';
import type { NotificationItem } from '../lib/api';
import { t } from '../i18n/i18n';

interface Props {
  /** 'desktop' shows full dropdown, 'mobile' shows compact overlay */
  variant?: 'desktop' | 'mobile';
}

export default function NotificationBell({ variant = 'desktop' }: Props) {
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Fetch unread count on mount
  useEffect(() => {
    let cancelled = false;
    getNotificationUnreadCount()
      .then((count) => { if (!cancelled) setUnreadCount(count); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Close dropdown on outside click/tap or Escape key
  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: Event) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('touchstart', onClickOutside);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('touchstart', onClickOutside);
      document.removeEventListener('keydown', onEscape);
    };
  }, [open]);

  async function handleOpen() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    setLoading(true);
    try {
      const items = await getNotifications(15);
      setNotifications(items);
      // Sync badge with fresh data to avoid stale count from mount-time fetch
      setUnreadCount(items.filter((n) => !n.read).length);
    } catch {
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  }

  async function handleMarkRead(notifId: string) {
    try {
      await markNotificationRead(notifId);
      setNotifications((prev) => prev.map((n) => n.id === notifId ? { ...n, read: true } : n));
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch {}
  }

  async function handleMarkAllRead() {
    try {
      await markAllNotificationsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch {}
  }

  function formatTime(iso: string): string {
    try {
      const d = new Date(iso);
      const now = new Date();
      const diffMs = now.getTime() - d.getTime();
      const diffMin = Math.floor(diffMs / 60000);
      if (diffMin < 1) return 'now';
      if (diffMin < 60) return `${diffMin}m`;
      const diffHr = Math.floor(diffMin / 60);
      if (diffHr < 24) return `${diffHr}h`;
      const diffDay = Math.floor(diffHr / 24);
      return `${diffDay}d`;
    } catch {
      return '';
    }
  }

  function renderDropdownContent() {
    if (loading) {
      return <div class="notif-bell__empty">...</div>;
    }
    if (notifications.length === 0) {
      return <div class="notif-bell__empty">{t('admin.notif_empty')}</div>;
    }
    return (
      <div>
        {notifications.map((n) => (
          <div
            key={n.id}
            class={`notif-bell__item${n.read ? '' : ' notif-bell__item--unread'}`}
            onClick={() => { if (!n.read) handleMarkRead(n.id); }}
            role={n.read ? undefined : 'button'}
            tabIndex={n.read ? undefined : 0}
            onKeyDown={(e) => { if (!n.read && (e.key === 'Enter' || e.key === ' ')) handleMarkRead(n.id); }}
          >
            <div class="notif-bell__item-row">
              <span class={`notif-bell__item-title${n.read ? '' : ' notif-bell__item-title--unread'}`}>
                {n.title}
              </span>
              <span class="notif-bell__item-time">
                {formatTime(n.created_at)}
              </span>
            </div>
            <div class="notif-bell__item-body">
              {n.body}
            </div>
          </div>
        ))}
      </div>
    );
  }

  const rootClass = variant === 'mobile' ? 'notif-bell notif-bell--mobile' : 'notif-bell';

  return (
    <div ref={ref} class={rootClass}>
      <button
        type="button"
        class="notif-bell__btn"
        onClick={handleOpen}
        aria-label={t('nav.notifications')}
        aria-expanded={open}
        aria-haspopup="true"
      >
        <span aria-hidden="true">🔔</span>
        {unreadCount > 0 && (
          <span class="notif-bell__badge" aria-label={`${unreadCount} unread`}>
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          class="notif-bell__dropdown"
          role="region"
          aria-label={t('nav.notifications')}
        >
          <div class="notif-bell__header">
            <strong class="notif-bell__title">{t('nav.notifications')}</strong>
            {unreadCount > 0 && (
              <button
                type="button"
                class="notif-bell__mark-all"
                onClick={handleMarkAllRead}
              >
                {t('admin.notif_mark_all_read')}
              </button>
            )}
          </div>
          {renderDropdownContent()}
        </div>
      )}
    </div>
  );
}

import { useMeActivity } from '../lib/useMeActivity';
import { t } from '../i18n/i18n';
import type { ActivityItem, DiaryCategory } from '@litcrop/shared';

// Icon per discriminant — emoji keeps the dep footprint zero and matches the
// existing project style (diary/device UI use emoji throughout).
const ICON_DIARY = '📔';
const ICON_DEVICE = '📡';
const ICON_IMAGE = '📷';

// Compact width-bounded timestamp — shape is `<n><unit>`, unit is i18n'd so
// JA renders `5分前` while EN renders `5m ago`. Prevents raw-English leak
// into the rendered text (F11 compliance).
function relativeTimeSuffix(iso: string): { n: number; unitKey: string } {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(Math.max(0, diffMs) / 60000);
  if (mins < 1) return { n: 0, unitKey: 'profile.activity.time.just_now' };
  if (mins < 60) return { n: mins, unitKey: 'profile.activity.time.m_ago' };
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return { n: hrs, unitKey: 'profile.activity.time.h_ago' };
  return { n: Math.floor(hrs / 24), unitKey: 'profile.activity.time.d_ago' };
}

function RelativeTime({ iso }: { iso: string }) {
  const { n, unitKey } = relativeTimeSuffix(iso);
  if (unitKey === 'profile.activity.time.just_now') {
    return <span class="activity-item__time">{t(unitKey)}</span>;
  }
  return (
    <span class="activity-item__time">
      {n}
      {t(unitKey)}
    </span>
  );
}

function iconFor(item: ActivityItem): string {
  if (item.type === 'diary') return ICON_DIARY;
  if (item.type === 'device') return ICON_DEVICE;
  return ICON_IMAGE;
}

function iconLabel(item: ActivityItem): string {
  if (item.type === 'diary') return t('profile.activity.item.diary.icon_label');
  if (item.type === 'device') return t('profile.activity.item.device.icon_label');
  return t('profile.activity.item.image.icon_label');
}

function summaryFor(item: ActivityItem): string {
  if (item.type === 'diary') {
    // Composition: `<category>: <description>`. Category label comes from
    // the existing diary namespace so we inherit the EN + JA keys already in
    // place (no new diary strings required here).
    const categoryLabel = t(`diary.categories.${item.diary_category as DiaryCategory}`);
    return `${categoryLabel}: ${item.description}`;
  }
  if (item.type === 'device') {
    // `Registered <node_name>` / `<node_name>を登録` — node_name is a raw
    // identifier (user-assigned), not translatable.
    return `${t('profile.activity.summary.device_registered')} ${item.node_name}`;
  }
  // Image — distinguish Pi vs manual via the trigger field.
  const bedLabel = item.bed_name ?? item.bed_id;
  if (item.trigger === 'scheduled') {
    return `${t('profile.activity.summary.image_scheduled')} ${bedLabel}`;
  }
  if (item.trigger === 'motion') {
    return `${t('profile.activity.summary.image_motion')} ${bedLabel}`;
  }
  return `${t('profile.activity.summary.image_manual')} ${bedLabel}`;
}

function ItemRow({ item }: { item: ActivityItem }) {
  return (
    <li class="activity-item" data-activity-type={item.type}>
      <a
        class="activity-item__link"
        href={item.deep_link}
        data-activity-id={item.id}
      >
        <span class="activity-item__icon" aria-label={iconLabel(item)} role="img">
          {iconFor(item)}
        </span>
        <div class="activity-item__body">
          <div class="activity-item__summary">{summaryFor(item)}</div>
          <div class="activity-item__meta">
            <RelativeTime iso={item.timestamp} />
            {item.farm_name && (
              <>
                <span class="activity-item__dot" aria-hidden="true">·</span>
                <span class="activity-item__farm">{item.farm_name}</span>
              </>
            )}
          </div>
        </div>
      </a>
    </li>
  );
}

export default function ProfileActivityList() {
  const { items, loading, initialLoading, error, hasMore, totalCount, loadMore, retry } = useMeActivity(20);

  return (
    <section
      class="profile-activity"
      style="margin-bottom:var(--space-4);padding:var(--space-3);border:var(--border-default);border-radius:var(--radius-md);background:var(--color-surface)"
      aria-labelledby="profile-activity-heading"
    >
      <h3
        id="profile-activity-heading"
        style="font-size:var(--font-size-base);font-weight:var(--font-weight-semibold);margin:0 0 var(--space-3) 0;color:var(--color-text)"
      >
        {t('profile.activity.title')}
      </h3>

      {initialLoading && (
        <div class="activity-skeleton" role="status" aria-live="polite">
          <div class="activity-skeleton__line" />
          <div class="activity-skeleton__line" />
          <div class="activity-skeleton__line" />
          <span class="sr-only">{t('profile.activity.loading')}</span>
        </div>
      )}

      {!initialLoading && error && (
        <div class="activity-error" role="alert">
          <span class="auth-server-error__icon" aria-hidden="true">⚠</span>
          <span style="margin-left:var(--space-2)">{t('profile.activity.error')}</span>
          <button
            type="button"
            class="btn-secondary"
            style="margin-left:var(--space-3);font-size:var(--font-size-sm);padding:var(--space-1) var(--space-3)"
            onClick={() => retry()}
          >
            {t('profile.activity.retry')}
          </button>
        </div>
      )}

      {!initialLoading && !error && items.length === 0 && (
        <div class="activity-empty" style="color:var(--color-gray-700);font-size:var(--font-size-sm);text-align:center;padding:var(--space-4) 0">
          {t('profile.activity.empty')}
        </div>
      )}

      {!initialLoading && !error && items.length > 0 && (
        <>
          <ul class="activity-list" style="list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:var(--space-2)">
            {items.map((item) => (
              <ItemRow key={item.id} item={item} />
            ))}
          </ul>

          <div
            class="activity-footer"
            style="display:flex;justify-content:space-between;align-items:center;margin-top:var(--space-3);font-size:var(--font-size-sm);color:var(--color-gray-700)"
          >
            <span class="activity-count">
              {items.length}
              {' / '}
              {totalCount}
            </span>
            {hasMore && (
              <button
                type="button"
                class="btn-secondary"
                style="font-size:var(--font-size-sm);padding:var(--space-1) var(--space-3)"
                onClick={() => loadMore()}
                disabled={loading}
                aria-busy={loading}
              >
                {loading ? '…' : t('profile.activity.load_more')}
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}

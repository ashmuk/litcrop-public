/**
 * DiaryPage — Beta-7: Farm Diary (T3.1)
 *
 * Main diary island with list/calendar view toggle.
 * Batch 2: implements list view only. Calendar view is Batch 3.
 *
 * State:
 *   - entries:      loaded diary entries
 *   - loading:      initial fetch in progress
 *   - error:        fetch error message
 *   - view:         'list' | 'calendar' (persisted to localStorage)
 *   - showForm:     whether DiaryEntryForm is open
 *   - editingEntry: entry being edited (null = create mode)
 *   - expandedId:   entry card currently expanded
 */

import { useState, useEffect, useMemo } from 'preact/hooks';
import { getDiaryEntries, deleteDiaryEntry, type DiaryEntryResponse } from '../lib/api';
import { t } from '../i18n/i18n';
import { showToast } from './Toast';
import DiaryEntryForm from './DiaryEntryForm';
import { CATEGORY_META } from '../lib/diary';

// ── Helpers ───────────────────────────────────────────────────────

const LS_VIEW_KEY = 'litcrop-diary-view';
const LS_FARM_ID = 'litcrop-farmId';

function formatCurrency(amount: number, currency: 'JPY' | 'USD'): string {
  if (currency === 'JPY') return `¥${amount.toLocaleString()}`;
  return `$${amount.toFixed(2)}`;
}

/** Group entries by date, sorted newest-first. */
function groupByDate(entries: DiaryEntryResponse[]): [string, DiaryEntryResponse[]][] {
  const map = new Map<string, DiaryEntryResponse[]>();
  for (const entry of entries) {
    const group = map.get(entry.date);
    if (group) {
      group.push(entry);
    } else {
      map.set(entry.date, [entry]);
    }
  }
  // Sort groups newest first
  return [...map.entries()].sort(([a], [b]) => b.localeCompare(a));
}

/** Format a YYYY-MM-DD date string into a readable label. */
function getLocale(): string {
  return document.documentElement.getAttribute('data-locale') || 'en';
}

function formatDateLabel(date: string): string {
  const d = new Date(date + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const locale = getLocale();

  if (d.getTime() === today.getTime()) {
    return `${t('diary.today')} — ${d.toLocaleDateString(locale, { month: 'long', day: 'numeric' })}`;
  }
  if (d.getTime() === yesterday.getTime()) {
    return `${t('diary.yesterday')} — ${d.toLocaleDateString(locale, { month: 'long', day: 'numeric' })}`;
  }
  return d.toLocaleDateString(locale, { weekday: 'long', month: 'long', day: 'numeric' });
}

// ── Types ─────────────────────────────────────────────────────────

type ViewMode = 'list' | 'calendar';

// ── DiaryEntryCard ────────────────────────────────────────────────

interface CardProps {
  entry: DiaryEntryResponse;
  expanded: boolean;
  onExpand: () => void;
  onCollapse: () => void;
  onEdit: () => void;
  onDeleted: () => void;
}

function DiaryEntryCard({ entry, expanded, onExpand, onCollapse, onEdit, onDeleted }: CardProps) {
  const [deleting, setDeleting] = useState(false);
  const meta = CATEGORY_META[entry.category] ?? CATEGORY_META.other;
  const categoryLabel = t(`diary.categories.${entry.category}`);

  // Format cost total for display
  const costDisplay = entry.cost_total > 0
    ? entry.costs[0]
      ? formatCurrency(entry.cost_total, entry.costs[0].currency)
      : `¥${entry.cost_total.toLocaleString()}`
    : null;

  async function handleDelete(e: MouseEvent) {
    e.stopPropagation();
    if (!confirm(t('diary.delete_confirm'))) return;
    setDeleting(true);
    try {
      await deleteDiaryEntry(entry.farm_id, entry.id);
      showToast(t('diary.delete_success'), 'success');
      onDeleted();
    } catch {
      showToast(t('diary.delete_error'), 'error');
      setDeleting(false);
    }
  }

  function handleEdit(e: MouseEvent) {
    e.stopPropagation();
    onEdit();
  }

  return (
    <div
      class={`diary-entry${expanded ? ' diary-entry--expanded' : ''}`}
      onClick={expanded ? onCollapse : onExpand}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          expanded ? onCollapse() : onExpand();
        }
      }}
      aria-expanded={expanded}
    >
      {/* Header row: category + cost */}
      <div class="diary-entry__header">
        <div class="diary-entry__category" style={{ color: meta.color }}>
          <span aria-hidden="true">{meta.icon}</span>
          <span>{categoryLabel}</span>
        </div>
        {costDisplay && (
          <span class="diary-entry__cost">{costDisplay}</span>
        )}
      </div>

      {/* Description (truncated in collapsed state) */}
      <p class="diary-entry__description">
        {expanded
          ? entry.description
          : entry.description.length > 100
            ? entry.description.slice(0, 100) + '…'
            : entry.description}
      </p>

      {/* Meta: time + photo count */}
      <div class="diary-entry__meta">
        {entry.time_spent_minutes != null && (
          <span>⏱ {entry.time_spent_minutes}{t('diary.time_minutes').replace('{{count}}', '').trim() === 'min' ? ' min' : '分'}</span>
        )}
        {entry.photo_ids.length > 0 && (
          <span>📷 {entry.photo_ids.length}</span>
        )}
        {entry.bed_name && (
          <span>🌿 {entry.bed_name}</span>
        )}
      </div>

      {/* Expanded: cost breakdown + actions */}
      {expanded && (
        <div class="diary-entry__expanded">
          {entry.costs.length > 0 && (
            <div class="diary-entry__costs">
              <div class="diary-entry__costs-label">{t('diary.costs')}</div>
              {entry.costs.map((cost, i) => (
                <div key={i} class="diary-entry__cost-row">
                  <span>{cost.item}</span>
                  <span>{formatCurrency(cost.amount, cost.currency)}</span>
                </div>
              ))}
            </div>
          )}
          <div class="diary-entry__actions">
            <button
              type="button"
              class="btn btn--secondary btn--sm"
              onClick={handleEdit}
            >
              {t('diary.edit')}
            </button>
            <button
              type="button"
              class="btn btn--danger btn--sm"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? '…' : t('diary.delete')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── DiaryPage ─────────────────────────────────────────────────────

export default function DiaryPage() {
  const [farmId, setFarmId] = useState<string | null>(null);
  const [entries, setEntries] = useState<DiaryEntryResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>('list');
  const [showForm, setShowForm] = useState(false);
  const [editingEntry, setEditingEntry] = useState<DiaryEntryResponse | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Initialise farmId and view from localStorage
  useEffect(() => {
    const storedFarmId = localStorage.getItem(LS_FARM_ID);
    setFarmId(storedFarmId);

    const storedView = localStorage.getItem(LS_VIEW_KEY);
    if (storedView === 'list' || storedView === 'calendar') {
      setView(storedView);
    }
  }, []);

  // Fetch entries when farmId is known
  async function loadEntries() {
    if (!farmId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await getDiaryEntries(farmId);
      setEntries(res.data);
    } catch {
      setError(t('diary.error_loading'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadEntries();
  }, [farmId]);

  function switchView(next: ViewMode) {
    setView(next);
    try { localStorage.setItem(LS_VIEW_KEY, next); } catch {}
  }

  function handleAdd() {
    setEditingEntry(null);
    setShowForm(true);
  }

  function handleEdit(entry: DiaryEntryResponse) {
    setEditingEntry(entry);
    setShowForm(true);
  }

  function handleFormSave() {
    setShowForm(false);
    setEditingEntry(null);
    loadEntries();
  }

  function handleFormCancel() {
    setShowForm(false);
    setEditingEntry(null);
  }

  function handleEntryDeleted(entryId: string) {
    setEntries((prev) => prev.filter((e) => e.id !== entryId));
    setExpandedId(null);
  }

  // ── Render states ───────────────────────────────────────────────

  const grouped = useMemo(() => groupByDate(entries), [entries]);

  return (
    <div class="diary-page">
      {/* Page header */}
      <div class="diary-header">
        <h1 class="diary-header__title">{t('diary.title')}</h1>
        <div class="diary-header__actions">
          {/* View toggle */}
          <div class="diary-header__toggle" role="group" aria-label="View mode">
            <button
              type="button"
              class={`diary-header__toggle-btn${view === 'list' ? ' diary-header__toggle-btn--active' : ''}`}
              aria-pressed={view === 'list'}
              onClick={() => switchView('list')}
              title={t('diary.list')}
            >
              📋
            </button>
            <button
              type="button"
              class={`diary-header__toggle-btn${view === 'calendar' ? ' diary-header__toggle-btn--active' : ''}`}
              aria-pressed={view === 'calendar'}
              onClick={() => switchView('calendar')}
              title={t('diary.calendar')}
            >
              📅
            </button>
          </div>
          {/* Add button */}
          <button
            type="button"
            class="btn btn--primary diary-header__add-btn"
            onClick={handleAdd}
            aria-label={t('diary.add')}
          >
            +
          </button>
        </div>
      </div>

      {/* Content area */}
      {loading && (
        <div class="diary-list">
          {[1, 2, 3].map((i) => (
            <div key={i} class="skeleton-tile" style={{ height: '80px', margin: '0 var(--space-4) var(--space-3)' }} />
          ))}
        </div>
      )}

      {!loading && error && (
        <div class="empty-state" style={{ padding: 'var(--space-8) var(--space-4)' }}>
          <p class="empty-state__title" style={{ color: 'var(--color-error)' }}>{error}</p>
          <p class="empty-state__body">{t('diary.error_body')}</p>
          <button
            type="button"
            class="btn btn--primary"
            style={{ marginTop: 'var(--space-4)' }}
            onClick={loadEntries}
          >
            {t('buttons.retry')}
          </button>
        </div>
      )}

      {!loading && !error && entries.length === 0 && (
        <div class="empty-state" style={{ padding: 'var(--space-8) var(--space-4)' }}>
          <div class="empty-state__icon" aria-hidden="true">📓</div>
          <p class="empty-state__title">{t('diary.empty')}</p>
          <button
            type="button"
            class="btn btn--primary"
            style={{ marginTop: 'var(--space-4)' }}
            onClick={handleAdd}
          >
            {t('diary.empty_cta')}
          </button>
        </div>
      )}

      {!loading && !error && entries.length > 0 && view === 'list' && (
        <div class="diary-list">
          {grouped.map(([date, dayEntries]) => (
            <div key={date} class="diary-group">
              <div class="diary-group__date">{formatDateLabel(date)}</div>
              {dayEntries.map((entry) => (
                <DiaryEntryCard
                  key={entry.id}
                  entry={entry}
                  expanded={expandedId === entry.id}
                  onExpand={() => setExpandedId(entry.id)}
                  onCollapse={() => setExpandedId(null)}
                  onEdit={() => handleEdit(entry)}
                  onDeleted={() => handleEntryDeleted(entry.id)}
                />
              ))}
            </div>
          ))}
          {/* End of list sentinel */}
          <div class="diary-list__end" aria-label="End of entries">
            <span aria-hidden="true">📓</span>
            <span>{t('diary.no_more_entries')}</span>
          </div>
        </div>
      )}

      {!loading && !error && entries.length > 0 && view === 'calendar' && (
        <div class="empty-state" style={{ padding: 'var(--space-8) var(--space-4)' }}>
          <div class="empty-state__icon" aria-hidden="true">📅</div>
          <p class="empty-state__title">{t('diary.calendar')}</p>
          <p class="empty-state__body">{t('diary.calendar_coming_soon')}</p>
        </div>
      )}

      {/* Diary entry form (bottom sheet) */}
      {showForm && farmId && (
        <DiaryEntryForm
          farmId={farmId}
          entry={editingEntry ?? undefined}
          onSave={handleFormSave}
          onCancel={handleFormCancel}
        />
      )}
    </div>
  );
}

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
 *   - view:         'list' | 'calendar' | 'gantt' (persisted to localStorage)
 *   - showForm:     whether DiaryEntryForm is open
 *   - editingEntry: entry being edited (null = create mode)
 *   - expandedId:   entry card currently expanded
 */

import { useState, useEffect, useMemo } from 'preact/hooks';
import { getDiaryEntries, getBeds, updateBed, deleteDiaryEntry, type DiaryEntryResponse } from '../lib/api';
import type { FarmBedItem } from '@litcrop/shared';
import { t } from '../i18n/i18n';
import { showToast } from './Toast';
import DiaryEntryForm from './DiaryEntryForm';
import DiaryCalendar from './DiaryCalendar';
import CropTimeline from './CropTimeline';
import GanttChart from './GanttChart';
import RoiDashboard from './RoiDashboard';
import { CATEGORY_META, CATEGORY_KEYS, BED_FILTER_NONE, getLocale } from '../lib/diary';
import { getCropName } from '../lib/crops';
import { formatCurrency, groupByDate, toDateString } from '../lib/diary-utils';
import { getCurrentUser } from '../lib/auth';
import { getLocalFarmRole, isWriteRole, getCachedIsAdmin, refreshFarmRoleCache } from '../lib/hooks';

// ── Helpers ───────────────────────────────────────────────────────

const LS_VIEW_KEY = 'litcrop-diary-view';
const LS_FARM_ID = 'litcrop-farmId';
const LS_FILTER_BED = 'litcrop-diary-filter-bed';
const LS_FILTER_CAT = 'litcrop-diary-filter-cat';


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

type ViewMode = 'list' | 'calendar' | 'gantt' | 'roi';

// ── DiaryEntryCard ────────────────────────────────────────────────

interface CardProps {
  entry: DiaryEntryResponse;
  expanded: boolean;
  canEdit: boolean;
  onExpand: () => void;
  onCollapse: () => void;
  onEdit: () => void;
  onDeleted: () => void;
}

function DiaryEntryCard({ entry, expanded, canEdit, onExpand, onCollapse, onEdit, onDeleted }: CardProps) {
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
      class={`diary-entry${expanded ? ' diary-entry--expanded' : ''} diary-entry--${entry.entry_type ?? 'actual'}`}
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
      {/* Header row: date + category + cost */}
      <div class="diary-entry__header">
        <div class="diary-entry__category" style={{ color: meta.color }}>
          <span aria-hidden="true">{meta.icon}</span>
          <span>{categoryLabel}</span>
          <span class="diary-entry__date">{new Date(entry.date + 'T00:00:00').toLocaleDateString(getLocale() === 'ja' ? 'ja-JP' : 'en-US', { month: 'numeric', day: 'numeric' })}</span>
        </div>
        <div class="diary-entry__header-end">
          <span class={`diary-entry__badge diary-entry__badge--${entry.entry_type ?? 'actual'}`}>
            {entry.entry_type === 'reserved' ? t('diary.tab_reserved') : t('diary.tab_actual')}
          </span>
          {costDisplay && (
            <span class="diary-entry__cost">{costDisplay}</span>
          )}
        </div>
      </div>

      {/* Description (truncated in collapsed state) */}
      <p class="diary-entry__description">
        {expanded
          ? entry.description
          : entry.description.length > 100
            ? entry.description.slice(0, 100) + '…'
            : entry.description}
      </p>

      {/* Meta: author + time + photo count */}
      <div class="diary-entry__meta">
        {entry.created_by_name && (
          <span>{entry.created_by_name}</span>
        )}
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
          {canEdit && (
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
          )}
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

  // Auth context for ownership-based access control
  const currentUser = getCurrentUser();
  const isAdmin = getCachedIsAdmin();
  const [canWrite, setCanWrite] = useState(isAdmin || isWriteRole(getLocalFarmRole()));
  const [showForm, setShowForm] = useState(false);
  const [editingEntry, setEditingEntry] = useState<DiaryEntryResponse | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [calYear, setCalYear] = useState(() => new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(() => new Date().getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [beds, setBeds] = useState<FarmBedItem[]>([]);
  const [filterBed, setFilterBed] = useState<string>(() => {
    try { return localStorage.getItem(LS_FILTER_BED) ?? ''; } catch { return ''; }
  });
  const [filterCategory, setFilterCategory] = useState<string>(() => {
    try { return localStorage.getItem(LS_FILTER_CAT) ?? ''; } catch { return ''; }
  });
  const [activeTab, setActiveTab] = useState<'all' | 'reserved' | 'actual'>('all');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');
  const [layout, setLayout] = useState<'tabs' | 'split'>(() => {
    try {
      const saved = localStorage.getItem('litcrop-diary-layout');
      if (saved === 'tabs' || saved === 'split') return saved;
    } catch {}
    return typeof window !== 'undefined' && window.innerWidth >= 768 ? 'split' : 'tabs';
  });

  // Initialise farmId and view from localStorage (synchronous-first)
  useEffect(() => {
    const storedFarmId = localStorage.getItem(LS_FARM_ID);
    setFarmId(storedFarmId);

    const storedView = localStorage.getItem(LS_VIEW_KEY);
    if (storedView === 'list' || storedView === 'calendar' || storedView === 'gantt' || storedView === 'roi') {
      setView(storedView);
    }

    // If no farmId stored, stop loading — show empty state
    if (!storedFarmId) setLoading(false);

    // Refresh role cache from API to prevent stale localStorage
    refreshFarmRoleCache()
      .then((role) => setCanWrite(isAdmin || isWriteRole(role)))
      .catch(() => {});
  }, []);

  // Fetch entries for list view
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

  // Fetch entries for calendar view (bounded to displayed month)
  async function loadCalendarEntries(showLoader = false) {
    if (!farmId) return;
    if (showLoader) setLoading(true);
    setError(null);
    const from = toDateString(new Date(calYear, calMonth, 1));
    const to = toDateString(new Date(calYear, calMonth + 1, 0));
    try {
      const res = await getDiaryEntries(farmId, { from, to });
      setEntries(res.data);
    } catch {
      setError(t('diary.error_loading'));
    } finally {
      setLoading(false);
    }
  }

  // Fetch entries for gantt view (wide date range: 3 months back → 9/3 months ahead)
  async function loadGanttEntries() {
    if (!farmId) return;
    setLoading(true);
    setError(null);
    const now = new Date();
    const from = toDateString(new Date(now.getFullYear(), now.getMonth() - 3, 1));
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
    const monthsAhead = isMobile ? 3 : 9;
    const to = toDateString(new Date(now.getFullYear(), now.getMonth() + monthsAhead + 1, 0));
    try {
      const res = await getDiaryEntries(farmId, { from, to, limit: 100 });
      setEntries(res.data);
    } catch {
      setError(t('diary.error_loading'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (farmId && view === 'list') loadEntries();
    if (farmId && view === 'gantt') loadGanttEntries();
  }, [farmId, view]);

  // Fetch beds for filter bar, calendar CropTimeline, and gantt
  useEffect(() => {
    if (!farmId) return;
    getBeds(farmId)
      .then(setBeds)
      .catch(() => setBeds([]));
  }, [farmId]);

  // Fetch the displayed month's entries when in calendar view
  useEffect(() => {
    if (view === 'calendar' && farmId) {
      loadCalendarEntries();
    }
  }, [view, farmId, calYear, calMonth]);

  function handlePrevMonth() {
    setSelectedDate(null);
    if (calMonth === 0) { setCalYear((y) => y - 1); setCalMonth(11); }
    else setCalMonth((m) => m - 1);
  }

  // Limit: 12 months ahead of current month (#299)
  const now = new Date();
  const maxCalYear = now.getFullYear() + 1;
  const maxCalMonth = now.getMonth();
  const canGoNext = calYear < maxCalYear || (calYear === maxCalYear && calMonth <= maxCalMonth);

  function handleNextMonth() {
    if (!canGoNext) return;
    setSelectedDate(null);
    if (calMonth === 11) { setCalYear((y) => y + 1); setCalMonth(0); }
    else setCalMonth((m) => m + 1);
  }

  function handleDaySelect(date: string) {
    setSelectedDate((prev) => (prev === date ? null : date));
  }

  function switchView(next: ViewMode) {
    setEntries([]);
    // ROI dashboard manages its own loading state
    if (next !== 'roi') setLoading(true);
    else setLoading(false);
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
    if (view === 'calendar') loadCalendarEntries();
    else if (view === 'gantt') loadGanttEntries();
    else loadEntries();
  }

  // Mark done / undo handlers for Gantt (#297)
  async function handleMarkDone(bedId: string) {
    if (!confirm(t('gantt.mark_done') + '?')) return;
    const today = toDateString(new Date());
    try {
      await updateBed(bedId, { completed_at: today });
      setBeds((prev) => prev.map((b) => b.id === bedId ? { ...b, completed_at: today } : b));
      showToast(t('gantt.mark_done'), 'success');
    } catch {
      showToast(t('diary.error_loading'), 'error');
    }
  }

  async function handleUndoDone(bedId: string) {
    try {
      await updateBed(bedId, { completed_at: null });
      setBeds((prev) => prev.map((b) => b.id === bedId ? { ...b, completed_at: undefined } : b));
      showToast(t('gantt.undo_done'), 'success');
    } catch {
      showToast(t('diary.error_loading'), 'error');
    }
  }

  function handleFormCancel() {
    setShowForm(false);
    setEditingEntry(null);
  }

  // Cross-reference: Gantt dot → Calendar view (#297)
  function handleGanttDotClick(date: string, _entryId: string) {
    const d = new Date(date + 'T00:00:00');
    setCalYear(d.getFullYear());
    setCalMonth(d.getMonth());
    setSelectedDate(date);
    switchView('calendar');
  }

  function handleEntryDeleted(entryId: string) {
    setEntries((prev) => prev.filter((e) => e.id !== entryId));
    setExpandedId(null);
  }

  // ── Filter helpers ──────────────────────────────────────────────

  function updateFilter(setter: (v: string) => void, key: string, value: string) {
    setter(value);
    try { localStorage.setItem(key, value); } catch {}
  }

  // ── Render states ───────────────────────────────────────────────

  // Pre-filter by bed + category (shared across all tabs)
  const preFiltered = useMemo(() => {
    return entries.filter((e) => {
      if (filterBed && (filterBed === BED_FILTER_NONE ? e.bed_id : e.bed_id !== filterBed)) return false;
      if (filterCategory && e.category !== filterCategory) return false;
      return true;
    });
  }, [entries, filterBed, filterCategory]);

  // Then filter by active tab
  const filteredEntries = useMemo(() => {
    if (activeTab === 'all') return preFiltered;
    return preFiltered.filter((e) => (e.entry_type ?? 'actual') === activeTab);
  }, [preFiltered, activeTab]);

  const reservedCount = useMemo(() => preFiltered.filter((e) => (e.entry_type ?? 'actual') === 'reserved').length, [preFiltered]);
  const actualCount = useMemo(() => preFiltered.filter((e) => (e.entry_type ?? 'actual') === 'actual').length, [preFiltered]);

  const grouped = useMemo(() => {
    const g = [...groupByDate(filteredEntries).entries()];
    return sortOrder === 'oldest' ? g.reverse() : g;
  }, [filteredEntries, sortOrder]);
  const selectedEntries = useMemo(
    () => (selectedDate ? entries.filter((e) => e.date === selectedDate) : []),
    [entries, selectedDate],
  );

  // Split-pane data (memoized for #291)
  const splitReserved = useMemo(() => preFiltered.filter((e) => (e.entry_type ?? 'actual') === 'reserved'), [preFiltered]);
  const splitActual = useMemo(() => preFiltered.filter((e) => (e.entry_type ?? 'actual') === 'actual'), [preFiltered]);
  const splitMonths = useMemo(() => {
    const set = new Set<string>();
    preFiltered.forEach((e) => set.add(e.date.slice(0, 7)));
    return [...set].sort((a, b) => sortOrder === 'oldest' ? a.localeCompare(b) : b.localeCompare(a));
  }, [preFiltered, sortOrder]);

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
            <button
              type="button"
              class={`diary-header__toggle-btn${view === 'gantt' ? ' diary-header__toggle-btn--active' : ''}`}
              aria-pressed={view === 'gantt'}
              onClick={() => switchView('gantt')}
              title={t('gantt.title')}
            >
              📊
            </button>
            <button
              type="button"
              class={`diary-header__toggle-btn${view === 'roi' ? ' diary-header__toggle-btn--active' : ''}`}
              aria-pressed={view === 'roi'}
              onClick={() => switchView('roi')}
              aria-label="ROI"
              title={t('roi.title')}
            >
              💰
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

      {/* Entry type tabs (#287) — read-only counters in split layout (#306) */}
      {view === 'list' && !loading && !error && entries.length > 0 && (
        <div class={`diary-pane-tabs${layout === 'split' ? ' diary-pane-tabs--readonly' : ''}`}>
          <button
            class={`diary-pane-tab diary-pane-tab--all${activeTab === 'all' ? ' diary-pane-tab--active' : ''}`}
            onClick={() => setActiveTab('all')}
            disabled={layout === 'split'}
          >
            {t('diary.tab_all')} <span class="diary-pane-tab__count">{preFiltered.length}</span>
          </button>
          <button
            class={`diary-pane-tab diary-pane-tab--reserved${activeTab === 'reserved' ? ' diary-pane-tab--active' : ''}`}
            onClick={() => { setActiveTab('reserved'); setSortOrder('oldest'); }}
            disabled={layout === 'split'}
          >
            {t('diary.tab_reserved')} <span class="diary-pane-tab__count">{reservedCount}</span>
          </button>
          <button
            class={`diary-pane-tab diary-pane-tab--actual${activeTab === 'actual' ? ' diary-pane-tab--active' : ''}`}
            onClick={() => { setActiveTab('actual'); setSortOrder('newest'); }}
            disabled={layout === 'split'}
          >
            {t('diary.tab_actual')} <span class="diary-pane-tab__count">{actualCount}</span>
          </button>
        </div>
      )}

      {/* Filter bar — list view only */}
      {view === 'list' && !loading && !error && entries.length > 0 && (
        <div class="diary-filter-bar">
          <select
            class="form-select diary-filter-bar__select"
            aria-label={t('diary.filter_by_bed')}
            value={filterBed}
            onChange={(e) => updateFilter(setFilterBed, LS_FILTER_BED, (e.target as HTMLSelectElement).value)}
          >
            <option value="">🌿 {t('diary.all_beds')}</option>
            <option value={BED_FILTER_NONE}>{t('diary.no_bed')}</option>
            {beds.map((bed) => (
              <option key={bed.id} value={bed.id}>{bed.name ?? bed.id}{bed.crop_type ? ` — ${getCropName(bed.crop_type)}` : ''}</option>
            ))}
          </select>
          <select
            class="form-select diary-filter-bar__select"
            aria-label={t('diary.filter_by_category')}
            value={filterCategory}
            onChange={(e) => updateFilter(setFilterCategory, LS_FILTER_CAT, (e.target as HTMLSelectElement).value)}
          >
            <option value="">{t('diary.all_categories')}</option>
            {CATEGORY_KEYS.map((key) => (
              <option key={key} value={key}>{CATEGORY_META[key].icon} {t(`diary.categories.${key}`)}</option>
            ))}
          </select>
          <button
            class="btn btn--secondary btn--sm"
            onClick={() => setSortOrder((s) => s === 'newest' ? 'oldest' : 'newest')}
            title={sortOrder === 'newest' ? t('diary.sort_oldest') : t('diary.sort_newest')}
            style="flex-shrink:0;font-size:var(--font-size-xs);padding:var(--space-1) var(--space-2)"
          >
            {sortOrder === 'newest' ? '↓ ' : '↑ '}{sortOrder === 'newest' ? t('diary.sort_newest') : t('diary.sort_oldest')}
          </button>
          <button
            class="btn btn--secondary btn--sm"
            onClick={() => {
              const next = layout === 'tabs' ? 'split' : 'tabs';
              setLayout(next);
              try { localStorage.setItem('litcrop-diary-layout', next); } catch {}
            }}
            title={layout === 'tabs' ? t('diary.layout_split') : t('diary.layout_tabs')}
            style="flex-shrink:0;font-size:var(--font-size-xs);padding:var(--space-1) var(--space-2)"
          >
            {layout === 'tabs' ? '⇄' : '≡'}
          </button>
        </div>
      )}

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
          <p class="empty-state__heading" style={{ color: 'var(--color-error)' }}>{error}</p>
          <p class="empty-state__body">{t('diary.error_body')}</p>
          <button
            type="button"
            class="btn btn--primary"
            style={{ marginTop: 'var(--space-4)' }}
            onClick={() => {
              if (view === 'calendar') loadCalendarEntries();
              else if (view === 'gantt') loadGanttEntries();
              else loadEntries();
            }}
          >
            {t('buttons.retry')}
          </button>
        </div>
      )}

      {!loading && !error && entries.length === 0 && view === 'list' && (
        <div class="empty-state" style={{ padding: 'var(--space-8) var(--space-4)' }}>
          <div class="empty-state__icon" aria-hidden="true">📓</div>
          <p class="empty-state__heading">{t('diary.empty')}</p>
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

      {!loading && !error && entries.length > 0 && view === 'list' && filteredEntries.length === 0 && (
        <div class="empty-state" style={{ padding: 'var(--space-8) var(--space-4)' }}>
          <p class="empty-state__heading">{t('diary.no_matches')}</p>
        </div>
      )}

      {!loading && !error && entries.length > 0 && view === 'list' && filteredEntries.length > 0 && layout === 'tabs' && (
        <div class="diary-list">
          {grouped.map(([date, dayEntries]) => (
            <div key={date} class="diary-group">
              <div class="diary-group__date">{formatDateLabel(date)}</div>
              {dayEntries.map((entry) => (
                <DiaryEntryCard
                  key={entry.id}
                  entry={entry}
                  expanded={expandedId === entry.id}
                  canEdit={canWrite || entry.created_by === currentUser?.sub}
                  onExpand={() => setExpandedId(entry.id)}
                  onCollapse={() => setExpandedId(null)}
                  onEdit={() => handleEdit(entry)}
                  onDeleted={() => handleEntryDeleted(entry.id)}
                />
              ))}
            </div>
          ))}
          <div class="diary-list__end" aria-label="End of entries">
            <span aria-hidden="true">📓</span>
            <span>{t('diary.no_more_entries')}</span>
          </div>
        </div>
      )}

      {/* Split-pane view: month-aligned reserved | actual (#291) */}
      {!loading && !error && entries.length > 0 && view === 'list' && preFiltered.length > 0 && layout === 'split' && (
        <div class="diary-split">
          <div class="diary-split__header">
            <div class="diary-split__month-col">{t('diary.date')}</div>
            <div class="diary-split__reserved-col">{t('diary.tab_reserved')} ({splitReserved.length})</div>
            <div class="diary-split__actual-col">{t('diary.tab_actual')} ({splitActual.length})</div>
          </div>
          {splitMonths.map((ym) => {
            const monthReserved = splitReserved.filter((e) => e.date.startsWith(ym));
            const monthActual = splitActual.filter((e) => e.date.startsWith(ym));
            const [y, m] = ym.split('-').map(Number);
            const loc = getLocale();
            const monthLabel = new Date(y, m - 1).toLocaleDateString(loc === 'ja' ? 'ja-JP' : 'en-US', { year: 'numeric', month: 'short' });
            return (
              <div key={ym} class="diary-split__row">
                <div class="diary-split__month-col diary-split__month-label">{monthLabel}</div>
                <div class="diary-split__reserved-col">
                  {monthReserved.length > 0 ? monthReserved.map((entry) => (
                    <DiaryEntryCard
                      key={entry.id} entry={entry}
                      expanded={expandedId === entry.id}
                      canEdit={canWrite || entry.created_by === currentUser?.sub}
                      onExpand={() => setExpandedId(entry.id)}
                      onCollapse={() => setExpandedId(null)}
                      onEdit={() => handleEdit(entry)}
                      onDeleted={() => handleEntryDeleted(entry.id)}
                    />
                  )) : <div class="diary-split__empty">{t('diary.no_entries')}</div>}
                </div>
                <div class="diary-split__actual-col">
                  {monthActual.length > 0 ? monthActual.map((entry) => (
                    <DiaryEntryCard
                      key={entry.id} entry={entry}
                      expanded={expandedId === entry.id}
                      canEdit={canWrite || entry.created_by === currentUser?.sub}
                      onExpand={() => setExpandedId(entry.id)}
                      onCollapse={() => setExpandedId(null)}
                      onEdit={() => handleEdit(entry)}
                      onDeleted={() => handleEntryDeleted(entry.id)}
                    />
                  )) : <div class="diary-split__empty">{t('diary.no_entries')}</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!loading && !error && view === 'calendar' && (
        <>
          <DiaryCalendar
            entries={entries}
            year={calYear}
            month={calMonth}
            onDaySelect={handleDaySelect}
            selectedDate={selectedDate}
            onPrevMonth={handlePrevMonth}
            onNextMonth={handleNextMonth}
            disableNext={!canGoNext}
          />
          <CropTimeline beds={beds} entries={entries} year={calYear} month={calMonth} />
          {selectedDate && (
            <div class="diary-list">
              <h3 class="diary-date-group__header" style={{ padding: '0 var(--space-4) var(--space-2)', fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-gray-500)' }}>
                {formatDateLabel(selectedDate)}
              </h3>
              {selectedEntries.map((entry) => (
                <DiaryEntryCard
                  key={entry.id}
                  entry={entry}
                  expanded={expandedId === entry.id}
                  canEdit={canWrite || entry.created_by === currentUser?.sub}
                  onExpand={() => setExpandedId(entry.id)}
                  onCollapse={() => setExpandedId(null)}
                  onEdit={() => handleEdit(entry)}
                  onDeleted={() => handleEntryDeleted(entry.id)}
                />
              ))}
              {selectedEntries.length === 0 && (
                <p style={{ padding: '0 var(--space-4)', color: 'var(--color-gray-500)', fontSize: 'var(--font-size-sm)' }}>
                  {t('diary.empty')}
                </p>
              )}
            </div>
          )}
        </>
      )}

      {/* Gantt chart view (#297) */}
      {!loading && !error && view === 'gantt' && (
        <GanttChart
          beds={beds}
          entries={entries}
          onDotClick={handleGanttDotClick}
          onMarkDone={canWrite ? handleMarkDone : undefined}
          onUndoDone={canWrite ? handleUndoDone : undefined}
        />
      )}

      {/* ROI dashboard view */}
      {!loading && !error && view === 'roi' && farmId && (
        <RoiDashboard farmId={farmId} beds={beds} />
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

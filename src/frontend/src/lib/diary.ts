/** Read active locale from DOM (set by BaseLayout) */
export function getLocale(): string {
  return document.documentElement.getAttribute('data-locale') || 'en';
}

/** Diary category metadata — shared by DiaryPage and DiaryEntryForm */
export const CATEGORY_META: Record<string, { icon: string; color: string; key: string }> = {
  planting:     { icon: '🌱', color: '#22c55e', key: 'planting' },
  watering:     { icon: '💧', color: '#3b82f6', key: 'watering' },
  fertilizing:  { icon: '🧪', color: '#a855f7', key: 'fertilizing' },
  harvesting:   { icon: '🌾', color: '#f59e0b', key: 'harvesting' },
  weeding:      { icon: '🌿', color: '#84cc16', key: 'weeding' },
  pest_control: { icon: '🐛', color: '#ef4444', key: 'pest_control' },
  maintenance:  { icon: '🔧', color: '#6b7280', key: 'maintenance' },
  purchase:     { icon: '🛒', color: '#f97316', key: 'purchase' },
  other:        { icon: '📝', color: '#9ca3af', key: 'other' },
};

export const CATEGORY_KEYS = Object.keys(CATEGORY_META);

/** Sentinel values for bed filter/selection (safe — bed IDs are UUIDs) */
export const BED_FILTER_NONE = '__none__';

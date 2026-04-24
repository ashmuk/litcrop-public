/**
 * DiaryEntryForm — Beta-7: Farm Diary (T3.2)
 *
 * Bottom sheet / modal for creating and editing diary entries.
 * - Mobile: bottom sheet sliding up from tab bar (z-index: 250)
 * - Desktop: centered dialog with focus trap
 *
 * Props:
 *   farmId      — active farm ID
 *   entry       — entry to edit (undefined = create mode)
 *   onSave      — called after successful save
 *   onCancel    — called when user cancels
 */

import { useState, useEffect, useRef } from 'preact/hooks';
import type { FarmBedItem, BedCrop } from '@litcrop/shared';
import {
  getBeds,
  createDiaryEntry,
  updateDiaryEntry,
  listBedCrops,
  type DiaryEntryResponse,
} from '../lib/api';
import { t } from '../i18n/i18n';
import { showToast } from './Toast';
import { CATEGORY_META, CATEGORY_KEYS } from '../lib/diary';
import { getCropName } from '../lib/crops';
import { estimateHarvestDate } from '@litcrop/shared';
import type { DiaryEntryType } from '@litcrop/shared';

// ── Types ─────────────────────────────────────────────────────────

interface CostRow {
  item: string;
  amount: string; // raw input; parsed to number on submit
  currency: 'JPY' | 'USD';
}

export interface Props {
  farmId: string;
  entry?: DiaryEntryResponse;
  onSave: () => void;
  onCancel: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────

function formatLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function todayIso(): string {
  return formatLocalDate(new Date());
}

function maxDateIso(): string {
  const now = new Date();
  const y = now.getFullYear() + 1;
  const m = now.getMonth();
  const d = new Date(y, m, now.getDate());
  if (d.getMonth() !== m) d.setDate(0); // clamp Feb 29 → Feb 28 on non-leap year
  return formatLocalDate(d);
}

// ── Component ─────────────────────────────────────────────────────

export default function DiaryEntryForm({ farmId, entry, onSave, onCancel }: Props) {
  const isEdit = !!entry;
  const sheetRef = useRef<HTMLDivElement>(null);
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;

  // ── Form state ────────────────────────────────────────────────
  const [date, setDate] = useState(entry?.date ?? todayIso());
  const [entryType, setEntryType] = useState<DiaryEntryType>(entry?.entry_type ?? 'actual');
  const [category, setCategory] = useState(entry?.category ?? 'planting');
  const [description, setDescription] = useState(entry?.description ?? '');
  const [timeSpent, setTimeSpent] = useState(
    entry?.time_spent_minutes != null ? String(entry.time_spent_minutes) : '',
  );
  const [bedId, setBedId] = useState(entry?.bed_id ?? '');
  // Wave D (#279) — per-crop attribution. Empty string = no crop (bed-only or
  // no-bed); a uuid = real BedCrop. Coerced to null on submit.
  const [bedCropId, setBedCropId] = useState(entry?.bed_crop_id ?? '');
  const [costs, setCosts] = useState<CostRow[]>(
    entry?.costs.length
      ? entry.costs.map((c) => ({ item: c.item, amount: String(c.amount), currency: c.currency }))
      : [],
  );

  // Harvest fields (Beta-10: shown when category === 'harvesting')
  const [harvestAmount, setHarvestAmount] = useState(
    entry?.harvest_amount != null ? String(entry.harvest_amount) : '',
  );
  const [harvestUnit, setHarvestUnit] = useState(entry?.harvest_unit ?? '');
  const [revenue, setRevenue] = useState(
    entry?.revenue != null ? String(entry.revenue) : '',
  );
  const [revenueCurrency, setRevenueCurrency] = useState<'JPY' | 'USD'>(
    entry?.revenue_currency ?? 'JPY',
  );

  // ── Beds ──────────────────────────────────────────────────────
  const [beds, setBeds] = useState<FarmBedItem[]>([]);
  const [bedsLoading, setBedsLoading] = useState(true);
  // Wave D (#279) — per-bed crops for the combined bed-crop selector.
  const [bedCropsMap, setBedCropsMap] = useState<Record<string, BedCrop[]>>({});

  // ── Submit state ──────────────────────────────────────────────
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Load beds on mount
  useEffect(() => {
    let cancelled = false;
    getBeds(farmId)
      .then((list) => { if (!cancelled) setBeds(list); })
      .catch(() => { /* ignore — bed dropdown becomes empty */ })
      .finally(() => { if (!cancelled) setBedsLoading(false); });
    return () => { cancelled = true; };
  }, [farmId]);

  // Wave D (#279) — load per-bed crops for the attribution selector.
  // Individual failures degrade to []; the user still sees a bed-only option.
  useEffect(() => {
    if (beds.length === 0) { setBedCropsMap({}); return; }
    let cancelled = false;
    Promise.all(
      beds.map((b) =>
        listBedCrops(b.id, 'all')
          .then((crops) => ({ bedId: b.id, crops }))
          .catch(() => ({ bedId: b.id, crops: [] as BedCrop[] })),
      ),
    ).then((results) => {
      if (cancelled) return;
      const map: Record<string, BedCrop[]> = {};
      for (const { bedId: bid, crops } of results) map[bid] = crops;
      setBedCropsMap(map);
    });
    return () => { cancelled = true; };
  }, [beds]);

  // Trap focus inside sheet and close on Escape
  useEffect(() => {
    const el = sheetRef.current;
    if (!el) return;

    // Focus first interactive element
    const focusable = el.querySelectorAll<HTMLElement>(
      'button, input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    if (focusable.length > 0) focusable[0].focus();

    // Escape → cancel
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancelRef.current();
    }
    document.addEventListener('keydown', handleEscape);

    // Scroll-lock on body
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = prev;
    };
  }, []);

  // ── Cost row helpers ──────────────────────────────────────────

  function addCostRow() {
    setCosts((prev) => [...prev, { item: '', amount: '', currency: 'JPY' }]);
  }

  function removeCostRow(index: number) {
    setCosts((prev) => prev.filter((_, i) => i !== index));
  }

  function updateCostRow(index: number, field: keyof CostRow, value: string) {
    setCosts((prev) =>
      prev.map((row, i) =>
        i === index ? { ...row, [field]: value } : row,
      ),
    );
  }

  // ── Submit ────────────────────────────────────────────────────

  async function handleSubmit(e: Event) {
    e.preventDefault();
    setFormError(null);

    // Validate
    if (!description.trim()) {
      setFormError(t('diary.error_description_required'));
      return;
    }
    if (description.trim().length > 1000) {
      setFormError(t('diary.error_description_too_long'));
      return;
    }
    if (!category) {
      setFormError(t('diary.error_category_required'));
      return;
    }

    // Parse costs
    const parsedCosts = costs
      .filter((c) => c.item.trim() && c.amount)
      .map((c) => ({
        item: c.item.trim(),
        amount: parseFloat(c.amount) || 0,
        currency: c.currency,
      }));

    const payload: Record<string, unknown> = {
      date,
      category,
      entry_type: entryType,
      description: description.trim(),
      time_spent_minutes: timeSpent ? parseInt(timeSpent, 10) || null : null,
      bed_id: bedId || null,
      bed_crop_id: bedCropId || null,
      photo_ids: entry?.photo_ids ?? [],
      costs: parsedCosts,
      // Harvest fields (Beta-10)
      // Treat NaN as null — don't send invalid numeric values to the API.
      harvest_amount: category === 'harvesting' && harvestAmount
        ? (isNaN(parseFloat(harvestAmount)) ? null : parseFloat(harvestAmount))
        : null,
      harvest_unit: category === 'harvesting' && harvestUnit ? harvestUnit.trim() : null,
      revenue: category === 'harvesting' && revenue
        ? (isNaN(parseFloat(revenue)) ? null : parseFloat(revenue))
        : null,
      revenue_currency: category === 'harvesting' && revenue && !isNaN(parseFloat(revenue)) ? revenueCurrency : null,
    };

    setSubmitting(true);
    try {
      if (isEdit && entry) {
        await updateDiaryEntry(farmId, entry.id, payload);
      } else {
        await createDiaryEntry(farmId, payload as Parameters<typeof createDiaryEntry>[1]);
      }
      showToast(t('diary.save_success'), 'success');
      onSave();
    } catch {
      showToast(t('diary.save_error'), 'error');
      setFormError(t('diary.save_error'));
    } finally {
      setSubmitting(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────

  return (
    <>
      {/* Backdrop */}
      <div
        class="bottom-sheet__backdrop"
        onClick={onCancel}
        aria-hidden="true"
      />

      {/* Sheet */}
      <div
        ref={sheetRef}
        class="bottom-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={isEdit ? t('diary.edit') : t('diary.add')}
      >
        <div class="bottom-sheet__content">
          {/* Handle bar */}
          <div class="bottom-sheet__handle" aria-hidden="true" />

          {/* Header */}
          <div class="bottom-sheet__header">
            <h2 class="bottom-sheet__title">
              {isEdit ? t('diary.edit') : t('diary.add')}
            </h2>
            <button
              type="button"
              class="bottom-sheet__close"
              onClick={onCancel}
              aria-label={t('diary.cancel')}
            >
              {t('diary.cancel')}
            </button>
          </div>

          {/* Form */}
          <form id="diary-form" class="bottom-sheet__form" onSubmit={handleSubmit} noValidate>
            {/* Date */}
            <div class="form-group">
              <label class="form-label" for="diary-date">{t('diary.date')}</label>
              <input
                id="diary-date"
                type="date"
                class="form-input"
                value={date}
                max={maxDateIso()}
                onInput={(e) => {
                  const newDate = (e.target as HTMLInputElement).value;
                  setDate(newDate);
                  if (!isEdit) {
                    setEntryType(newDate > todayIso() ? 'reserved' : 'actual');
                  }
                }}
                required
              />
            </div>

            {/* Entry Type Toggle (#287) */}
            <fieldset class="form-group" style={{ border: 'none', padding: 0, margin: 0 }}>
              <legend class="form-label">{t('diary.entry_type')}</legend>
              <div class="diary-radio-toggle" role="radiogroup">
                <button
                  type="button"
                  role="radio"
                  aria-checked={entryType === 'reserved'}
                  class={`diary-radio-toggle__option diary-radio-toggle__option--reserved${entryType === 'reserved' ? ' diary-radio-toggle__option--checked' : ''}`}
                  onClick={() => setEntryType('reserved')}
                >
                  <span class="diary-radio-toggle__dot" />
                  <span>
                    <span class="diary-radio-toggle__label">{t('diary.entry_reserved')}</span>
                    <span class="diary-radio-toggle__hint">{t('diary.entry_reserved_hint')}</span>
                  </span>
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={entryType === 'actual'}
                  class={`diary-radio-toggle__option diary-radio-toggle__option--actual${entryType === 'actual' ? ' diary-radio-toggle__option--checked' : ''}`}
                  onClick={() => setEntryType('actual')}
                >
                  <span class="diary-radio-toggle__dot" />
                  <span>
                    <span class="diary-radio-toggle__label">{t('diary.entry_actual')}</span>
                    <span class="diary-radio-toggle__hint">{t('diary.entry_actual_hint')}</span>
                  </span>
                </button>
              </div>
            </fieldset>

            {/* Category */}
            <div class="form-group">
              <label class="form-label" for="diary-category">
                {t('diary.category')} *
              </label>
              <select
                id="diary-category"
                class="form-select"
                value={category}
                onChange={(e) => {
                  const newCat = (e.target as HTMLSelectElement).value;
                  setCategory(newCat);
                  if (newCat !== 'harvesting') {
                    setHarvestAmount('');
                    setHarvestUnit('');
                    setRevenue('');
                    setRevenueCurrency('JPY');
                  }
                }}
                required
              >
                {CATEGORY_KEYS.map((key) => (
                  <option key={key} value={key}>
                    {CATEGORY_META[key].icon} {t(`diary.categories.${key}`)}
                  </option>
                ))}
              </select>
            </div>

            {/* Description */}
            <div class="form-group">
              <label class="form-label" for="diary-description">
                {t('diary.description')} *
              </label>
              <textarea
                id="diary-description"
                class="form-input"
                style={{ minHeight: '80px', resize: 'vertical' }}
                value={description}
                onInput={(e) => setDescription((e.target as HTMLTextAreaElement).value)}
                maxLength={1000}
                required
                placeholder={t('diary.description_placeholder')}
              />
            </div>

            {/* Harvest fields (Beta-10: shown when category === 'harvesting') */}
            <div
              class="diary-harvest-section"
              style={{ maxHeight: category === 'harvesting' ? '400px' : '0' }}
              aria-hidden={category !== 'harvesting'}
            >
              <fieldset class="form-group" style={{ border: 'none', padding: 0, margin: 0 }}>
                <legend class="form-label">{t('diary.harvest_section_label')}</legend>
                <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
                  <div style={{ flex: 1 }}>
                    <label class="form-label" for="diary-harvest-amount" style={{ fontSize: 'var(--font-size-xs)' }}>
                      {t('diary.harvest_amount')}
                    </label>
                    <input
                      id="diary-harvest-amount"
                      type="number"
                      class="form-input"
                      value={harvestAmount}
                      onInput={(e) => setHarvestAmount((e.target as HTMLInputElement).value)}
                      min="0"
                      step="any"
                      placeholder="0"
                      tabIndex={category === 'harvesting' ? 0 : -1}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label class="form-label" for="diary-harvest-unit" style={{ fontSize: 'var(--font-size-xs)' }}>
                      {t('diary.harvest_unit')}
                    </label>
                    <input
                      id="diary-harvest-unit"
                      type="text"
                      class="form-input"
                      value={harvestUnit}
                      onInput={(e) => setHarvestUnit((e.target as HTMLInputElement).value)}
                      list="harvest-units"
                      placeholder="kg"
                      tabIndex={category === 'harvesting' ? 0 : -1}
                    />
                    <datalist id="harvest-units">
                      <option value="kg" />
                      <option value="g" />
                      <option value="bunch" />
                      <option value="piece" />
                      <option value="bag" />
                      <option value="box" />
                    </datalist>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                  <div style={{ flex: 1 }}>
                    <label class="form-label" for="diary-revenue" style={{ fontSize: 'var(--font-size-xs)' }}>
                      {t('diary.harvest_revenue')}
                    </label>
                    <input
                      id="diary-revenue"
                      type="number"
                      class="form-input"
                      value={revenue}
                      onInput={(e) => setRevenue((e.target as HTMLInputElement).value)}
                      min="0"
                      step="any"
                      placeholder="0"
                      tabIndex={category === 'harvesting' ? 0 : -1}
                    />
                  </div>
                  <div style={{ flex: '0 0 100px' }}>
                    <label class="form-label" for="diary-revenue-currency" style={{ fontSize: 'var(--font-size-xs)' }}>
                      {t('diary.harvest_revenue_currency')}
                    </label>
                    <select
                      id="diary-revenue-currency"
                      class="form-select"
                      value={revenueCurrency}
                      onChange={(e) => setRevenueCurrency((e.target as HTMLSelectElement).value as 'JPY' | 'USD')}
                      tabIndex={category === 'harvesting' ? 0 : -1}
                    >
                      <option value="JPY">JPY</option>
                      <option value="USD">USD</option>
                    </select>
                  </div>
                </div>
              </fieldset>
            </div>

            {/* Bed + crop (optional) — Wave D #279 flat selector. Each option
                encodes "<bedId>|<cropId?>"; empty cropId = bed-only. */}
            <div class="form-group">
              <label class="form-label" for="diary-bed">{t('diary.bed_optional')}</label>
              <select
                id="diary-bed"
                class="form-select"
                value={bedId ? `${bedId}|${bedCropId}` : ''}
                onChange={(e) => {
                  const raw = (e.target as HTMLSelectElement).value;
                  if (!raw) { setBedId(''); setBedCropId(''); return; }
                  const [bid, cid] = raw.split('|');
                  setBedId(bid);
                  setBedCropId(cid || '');
                }}
                disabled={bedsLoading}
              >
                <option value="">{t('diary.farm_level')}</option>
                {beds.flatMap((bed) => {
                  const crops = bedCropsMap[bed.id] ?? [];
                  const activeCrops = crops.filter((c) => c.status === 'active' || c.status === 'planned');
                  const bedLabel = bed.name ?? bed.id;
                  // Bed-only option — always present. For legacy beds with no
                  // real BedCrops but an inline crop_type, show that name so
                  // the legacy UX is preserved.
                  const bedOnlyLabel = activeCrops.length === 0 && bed.crop_type
                    ? `${bedLabel} — ${getCropName(bed.crop_type)}`
                    : bedLabel;
                  return [
                    <option key={`${bed.id}|`} value={`${bed.id}|`}>
                      {bedOnlyLabel}
                    </option>,
                    ...activeCrops.map((c) => (
                      <option key={`${bed.id}|${c.id}`} value={`${bed.id}|${c.id}`}>
                        {bedLabel} — {getCropName(c.crop_type)}
                      </option>
                    )),
                  ];
                })}
              </select>
            </div>

            {/* Smart default hint (#287) — now uses the selected crop's type
                when a specific crop is picked, falling back to active_crop /
                legacy inline when only the bed is picked. */}
            {entryType === 'reserved' && (category === 'planting' || category === 'seeding') && bedId && (() => {
              const bed = beds.find((b) => b.id === bedId);
              const crops = bedCropsMap[bedId] ?? [];
              const selectedCrop = bedCropId ? crops.find((c) => c.id === bedCropId) : null;
              const cropType = selectedCrop?.crop_type ?? bed?.active_crop?.crop_type ?? bed?.crop_type;
              if (!cropType) return null;
              const plantingDate = selectedCrop?.planted_at ?? bed?.active_crop?.planted_at ?? bed?.planted_at ?? date;
              const plantMethod = category === 'seeding' ? 'seed' : 'seedling';
              const harvestDate = estimateHarvestDate(plantingDate, cropType, plantMethod);
              if (!harvestDate) return null;
              return (
                <div class="diary-smart-hint">
                  <span>💡</span>
                  <span>{cropType}: {t('diary.harvest_estimate')} <strong>{harvestDate}</strong></span>
                </div>
              );
            })()}

            {/* Time spent (optional) */}
            <div class="form-group">
              <label class="form-label" for="diary-time">{t('diary.time_spent')}</label>
              <input
                id="diary-time"
                type="number"
                class="form-input"
                value={timeSpent}
                onInput={(e) => setTimeSpent((e.target as HTMLInputElement).value)}
                min="1"
                max="1440"
                placeholder="minutes"
              />
            </div>

            {/* Costs */}
            <div class="form-group">
              <div class="cost-row cost-row--header">
                <span class="form-label">{t('diary.costs')}</span>
                <button
                  type="button"
                  class="btn btn--secondary btn--sm"
                  onClick={addCostRow}
                >
                  + {t('diary.cost_add')}
                </button>
              </div>

              {costs.map((cost, i) => (
                <div key={i} class="cost-row">
                  <input
                    type="text"
                    class="form-input cost-row__item"
                    value={cost.item}
                    onInput={(e) => updateCostRow(i, 'item', (e.target as HTMLInputElement).value)}
                    placeholder={t('diary.cost_item')}
                    aria-label={t('diary.cost_item')}
                    maxLength={100}
                  />
                  <input
                    type="number"
                    class="form-input cost-row__amount"
                    value={cost.amount}
                    onInput={(e) => updateCostRow(i, 'amount', (e.target as HTMLInputElement).value)}
                    placeholder={t('diary.cost_amount')}
                    aria-label={t('diary.cost_amount')}
                    min="0"
                  />
                  <select
                    class="form-select cost-row__currency"
                    value={cost.currency}
                    onChange={(e) => updateCostRow(i, 'currency', (e.target as HTMLSelectElement).value)}
                    aria-label={t('diary.cost_currency')}
                  >
                    <option value="JPY">JPY</option>
                    <option value="USD">USD</option>
                  </select>
                  <button
                    type="button"
                    class="btn btn--danger btn--sm"
                    onClick={() => removeCostRow(i)}
                    aria-label={t('diary.remove_cost')}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>

            {/* Form error */}
            {formError && (
              <p class="form-error" role="alert" style={{ color: 'var(--color-error)', marginBottom: 'var(--space-3)' }}>
                {formError}
              </p>
            )}
          </form>
        </div>

        {/* Sticky footer — always visible on iPhone */}
        <div class="bottom-sheet__footer">
          <button
            type="submit"
            form="diary-form"
            class="btn btn--primary btn--full"
            disabled={submitting}
          >
            {submitting
              ? '…'
              : t(entryType === 'reserved' ? 'diary.save_reserved' : 'diary.save_actual')}
          </button>
        </div>
      </div>
    </>
  );
}

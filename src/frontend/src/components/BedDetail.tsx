/**
 * Bed Detail Island — Phase D (replaces PlotDetail)
 * Sections: hero image, crop metadata, tag buttons (optimistic UI), image history.
 * Reads bedId from the URL query string at runtime (?id=<bedId>).
 */

import { useState, useEffect, useRef } from 'preact/hooks';
import type { BedDetailResponse, ImageListItem, TagValue, BedCrop } from '@litcrop/shared';
import { TAG_VALUES, MAX_IMAGE_SIZE_BYTES, MAX_ACTIVE_CROPS_PER_BED } from '@litcrop/shared';
import CropAutocomplete from './CropAutocomplete';
import Modal from './Modal';
import { getCropDisplay } from '../lib/crops';
import { CATEGORY_META } from '../lib/diary';
import { estimateHarvestDate, getCropPropagation } from '@litcrop/shared';
import type { PlantMethod } from '@litcrop/shared';
import {
  getBed, getImages, createTag, uploadImage, updateBed, createDiaryEntry, ApiError,
  listBedCrops, createBedCrop, updateBedCrop,
} from '../lib/api';
import { getLocalFarmRole, refreshFarmRoleCache } from '../lib/hooks';
import { LS_FARM_ID } from '../lib/hooks';
import { showToast } from './Toast';
import { t } from '../i18n/i18n';
import { displaySrc, fullSrc, isManualUpload, MANUAL_NODE_ID } from '../lib/image';
import { TAG_ICONS } from '../lib/status';
import { formatDate, formatDateShort, formatDateLabel, toDateKey } from '../lib/format';
import Lightbox from './Lightbox';
import TimeLapsePlayer from './TimeLapsePlayer';

const TAG_CSS: Record<TagValue, string> = {
  healthy: 'tag-btn--healthy',
  slow_growth: 'tag-btn--slow',
  issue: 'tag-btn--issue',
  animal_intrusion: 'tag-btn--animal',
};

// CSS class suffix for thumb-item status border
const TAG_THUMB_CSS: Record<TagValue, string> = {
  healthy: 'healthy',
  slow_growth: 'slow',
  issue: 'issue',
  animal_intrusion: 'animal',
};

const MAX_IMAGE_DIM = 4096;

interface DayGroup {
  dateKey: string;
  label: string;
  images: ImageListItem[];
  deviceCount: number;
  manualCount: number;
}

function groupByDay(images: ImageListItem[]): DayGroup[] {
  const map = new Map<string, ImageListItem[]>();
  for (const img of images) {
    const key = toDateKey(img.captured_at);
    const arr = map.get(key) ?? [];
    arr.push(img);
    map.set(key, arr);
  }
  // Already newest-first because images arrive newest-first from API
  return Array.from(map, ([dateKey, imgs]) => {
    const manualCount = imgs.filter(isManualUpload).length;
    return {
      dateKey,
      label: formatDateLabel(dateKey),
      images: imgs,
      deviceCount: imgs.length - manualCount,
      manualCount,
    };
  });
}

async function toJpegBlob(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const objUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objUrl);
      const scale = Math.min(1, MAX_IMAGE_DIM / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('Canvas not supported')); return; }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => blob ? resolve(blob) : reject(new Error('JPEG conversion failed')),
        'image/jpeg',
        0.85,
      );
    };
    img.onerror = () => { URL.revokeObjectURL(objUrl); reject(new Error('Image load failed')); };
    img.src = objUrl;
  });
}

export default function BedDetail() {
  const [bed, setBed] = useState<BedDetailResponse | null>(null);
  const [crops, setCrops] = useState<BedCrop[]>([]);
  const [images, setImages] = useState<ImageListItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [imagesLoading, setImagesLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTag, setActiveTag] = useState<TagValue | null>(null);
  const [tagging, setTagging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());
  const autoExpandedRef = useRef(false);
  // Wave C (#279) — modal-based add/edit replaces the inline editing toggle.
  const [cropModalMode, setCropModalMode] = useState<'closed' | 'add' | 'edit'>('closed');
  const [editingCropId, setEditingCropId] = useState<string | null>(null);
  const [cropForm, setCropForm] = useState({
    crop_type: '',
    crop_variety: '',
    planted_at: '',
    expected_harvest: '',
    notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [plantMethod, setPlantMethod] = useState<PlantMethod>('seedling');

  const bedId =
    typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('id') ?? ''
      : '';

  const [isCropReadOnly, setIsCropReadOnly] = useState(getLocalFarmRole() === 'staff');

  // Set i18n title immediately on mount (before API returns)
  useEffect(() => {
    const titleEl = document.getElementById('bed-title');
    if (titleEl) titleEl.textContent = t('screens.plot_detail');
  }, []);

  useEffect(() => {
    if (!bedId) return;
    let cancelled = false;

    async function load() {
      try {
        const [bedData, imagesData, cropsData] = await Promise.all([
          getBed(bedId),
          getImages(bedId),
          listBedCrops(bedId, 'all'),
        ]);
        if (cancelled) return;
        // Refresh role cache from API to prevent stale localStorage
        refreshFarmRoleCache()
          .then((role) => { if (!cancelled) setIsCropReadOnly(role === 'staff'); })
          .catch(() => {});
        setBed(bedData);
        setImages(imagesData.data);
        setNextCursor(imagesData.meta.next_cursor);
        setCrops(cropsData);
        // Update nav header title with bed name and i18n screen label
        const titleEl = document.getElementById('bed-title');
        if (titleEl) titleEl.textContent = bedData.name ?? t('screens.plot_detail');
        // Reflect most recent tag as active
        if (bedData.latest_image?.tags?.length) {
          const lastTag = bedData.latest_image.tags[bedData.latest_image.tags.length - 1];
          setActiveTag(lastTag.tag);
        }
      } catch {
        if (!cancelled) setError(t('farm.error_loading'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [bedId]);

  useEffect(() => {
    if (!autoExpandedRef.current && images.length > 0) {
      autoExpandedRef.current = true;
      const firstKey = toDateKey(images[0].captured_at);
      setExpandedDays(new Set([firstKey]));
    }
  }, [images.length]);

  function toggleDay(dateKey: string) {
    setExpandedDays(prev => {
      const next = new Set(prev);
      if (next.has(dateKey)) next.delete(dateKey);
      else next.add(dateKey);
      return next;
    });
  }

  async function loadMoreImages() {
    if (!nextCursor || imagesLoading) return;
    setImagesLoading(true);
    try {
      const data = await getImages(bedId, nextCursor);
      setImages((prev) => [...prev, ...data.data]);
      setNextCursor(data.meta.next_cursor);
    } catch {
      showToast(t('farm.error_loading'), 'error');
    } finally {
      setImagesLoading(false);
    }
  }

  async function handleTag(tag: TagValue) {
    if (!bed?.latest_image || tagging) return;
    const imageId = bed.latest_image.id;
    // Optimistic update -- show selected state immediately
    const previous = activeTag;
    setActiveTag(tag);
    setTagging(true);
    try {
      await createTag(imageId, { tag });
      showToast(`${t(`tags.${tag}`)} tagged`, 'success');
    } catch {
      // Revert on failure
      setActiveTag(previous);
      showToast(t('farm.error_loading'), 'error');
    } finally {
      setTagging(false);
    }
  }

  async function handleImageUpload(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      showToast(t('upload.too_large'), 'error');
      return;
    }
    setUploading(true);
    try {
      const jpegBlob = await toJpegBlob(file);
      if (jpegBlob.size > MAX_IMAGE_SIZE_BYTES) {
        showToast(t('upload.too_large'), 'error');
        return;
      }
      const formData = new FormData();
      formData.append('image', jpegBlob, 'photo.jpg');
      formData.append('captured_at', new Date().toISOString());
      formData.append('node_id', MANUAL_NODE_ID);
      formData.append('trigger', 'scheduled');
      await uploadImage(bedId, formData);
      showToast(t('upload.success'), 'success');
      const imagesData = await getImages(bedId);
      setImages(imagesData.data);
      setNextCursor(imagesData.meta.next_cursor);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : t('upload.error');
      showToast(msg, 'error');
    } finally {
      setUploading(false);
      // Reset input so the same file can be re-selected if needed
      (e.target as HTMLInputElement).value = '';
    }
  }

  function openAddModal() {
    setCropForm({ crop_type: '', crop_variety: '', planted_at: '', expected_harvest: '', notes: '' });
    setEditingCropId(null);
    setPlantMethod('seedling');
    setCropModalMode('add');
  }

  /**
   * Open the Edit modal for a specific crop (#279 Wave C).
   * Pass a real BedCrop to edit it via /beds/:id/crops/:cropId.
   * Pass null to edit the virtual legacy projection via /beds/:id.
   */
  function openEditModal(crop: BedCrop | null) {
    const active = crop ?? bed?.active_crop ?? null;
    if (!active) return;
    const isVirtual = !crop;
    setCropForm({
      crop_type: active.crop_type,
      crop_variety: active.crop_variety ?? '',
      planted_at: active.planted_at ?? '',
      expected_harvest: active.expected_harvest ?? '',
      notes: isVirtual ? (bed?.notes ?? '') : (crop?.notes ?? ''),
    });
    setEditingCropId(active.id);
    const propagation = getCropPropagation(active.crop_type);
    if (propagation !== 'both') setPlantMethod(propagation);
    setCropModalMode('edit');
  }

  function closeCropModal() {
    setCropModalMode('closed');
    setEditingCropId(null);
  }

  /** Update plantMethod and recalculate expected_harvest in a single batch. */
  function applyPlantMethod(method: PlantMethod): void {
    setPlantMethod(method);
    setCropForm((f) => {
      if (!f.planted_at || !f.crop_type) return f;
      const harvest = estimateHarvestDate(f.planted_at, f.crop_type, method);
      if (!harvest || harvest === f.expected_harvest) return f;
      return { ...f, expected_harvest: harvest };
    });
  }

  /** Render the plant-method form group — adaptive per crop propagation. */
  function renderPlantMethodField() {
    const propagation = getCropPropagation(cropForm.crop_type);
    if (propagation === 'both') {
      return (
        <div class="form-group">
          <label class="form-label">{t('bed.plant_method')}</label>
          <div style="display:flex;gap:var(--space-3)">
            <label style="display:flex;align-items:center;gap:var(--space-1);cursor:pointer">
              <input type="radio" name="plant-method" value="seed" checked={plantMethod === 'seed'} onChange={() => applyPlantMethod('seed')} />
              {CATEGORY_META.seeding.icon} {t('diary.categories.seeding')}
            </label>
            <label style="display:flex;align-items:center;gap:var(--space-1);cursor:pointer">
              <input type="radio" name="plant-method" value="seedling" checked={plantMethod === 'seedling'} onChange={() => applyPlantMethod('seedling')} />
              {CATEGORY_META.planting.icon} {t('diary.categories.planting')}
            </label>
          </div>
        </div>
      );
    }
    // Single-method crop: show static label instead of toggle
    const meta = propagation === 'seed' ? CATEGORY_META.seeding : CATEGORY_META.planting;
    const labelKey = propagation === 'seed' ? 'diary.categories.seeding' : 'diary.categories.planting';
    return (
      <div class="form-group">
        <label class="form-label">{t('bed.plant_method')}</label>
        <div style="display:flex;align-items:center;gap:var(--space-1);color:var(--color-gray-600);font-size:var(--font-size-sm)">
          {meta.icon} {t(labelKey)}
        </div>
      </div>
    );
  }

  /**
   * Save handler for the Add/Edit modal (#279 Wave C).
   *
   * Dispatch on mode + crop id:
   * - Add: POST /beds/:id/crops (always a real BedCrop).
   * - Edit real crop: PATCH /beds/:id/crops/:cropId.
   * - Edit virtual legacy crop (id prefix 'bed-legacy-'): PATCH /beds/:id
   *   (legacy path; shim continues to project these into active_crop).
   */
  async function handleSaveCrop() {
    if (!bedId) return;
    setSaving(true);
    const isAdd = cropModalMode === 'add';
    const editingId = editingCropId;
    const isVirtualEdit = !isAdd && !!editingId && editingId.startsWith('bed-legacy-');

    const crop_type = cropForm.crop_type.trim();
    const crop_variety = cropForm.crop_variety.trim();
    const planted_at = cropForm.planted_at || null;
    const expected_harvest = cropForm.expected_harvest || null;
    const notes = cropForm.notes.trim();

    // Capture pre-save dates to detect "new/changed" for reserved-diary gating.
    const prevCrop = !isAdd && !isVirtualEdit && editingId ? crops.find((c) => c.id === editingId) : null;
    const prevPlanted: string | null | undefined = isAdd ? null : (isVirtualEdit ? bed?.planted_at : prevCrop?.planted_at);
    const prevHarvest: string | null | undefined = isAdd ? null : (isVirtualEdit ? bed?.expected_harvest : prevCrop?.expected_harvest);

    try {
      let savedCropType = crop_type;
      const bedName = bed?.name ?? '';

      if (isAdd) {
        const created = await createBedCrop(bedId, {
          crop_type,
          crop_variety: crop_variety || undefined,
          planted_at,
          expected_harvest,
          status: planted_at ? 'active' : 'planned',
          notes: notes || undefined,
        });
        setCrops((prev) => [...prev, created]);
        savedCropType = created.crop_type;
        showToast(t('bed.crop_added'), 'success');
      } else if (isVirtualEdit) {
        const updated = await updateBed(bedId, {
          crop_type: crop_type || null,
          crop_variety: crop_variety || null,
          planted_at,
          expected_harvest,
          notes: notes || null,
        });
        setBed(updated);
        savedCropType = updated.crop_type ?? crop_type;
        showToast(t('bed.crop_saved'), 'success');
      } else if (editingId) {
        const updated = await updateBedCrop(bedId, editingId, {
          crop_type,
          crop_variety: crop_variety || null,
          planted_at,
          expected_harvest,
          notes: notes || null,
        });
        setCrops((prev) => prev.map((c) => (c.id === editingId ? updated : c)));
        savedCropType = updated.crop_type;
        showToast(t('bed.crop_saved'), 'success');
      }

      closeCropModal();

      // Re-fetch to resync active_crop + active_crops_count (skipped on virtual
      // edit since updateBed already returned a fresh BedDetailResponse).
      if (!isVirtualEdit) {
        const latest = await getBed(bedId);
        setBed(latest);
      }

      // Reserved diary entries when dates are set (Add) or changed (Edit).
      const farmId = typeof window !== 'undefined' ? localStorage.getItem(LS_FARM_ID) : null;
      if (farmId) {
        if (planted_at && planted_at !== prevPlanted) {
          createDiaryEntry(farmId, {
            date: planted_at,
            category: plantMethod === 'seed' ? 'seeding' : 'planting',
            entry_type: 'reserved',
            description: `${t('diary.entry_reserved')}: ${getCropDisplay(savedCropType)} → ${bedName}`,
            bed_id: bedId,
          }).catch(() => {});
        }
        if (expected_harvest && expected_harvest !== prevHarvest) {
          createDiaryEntry(farmId, {
            date: expected_harvest,
            category: 'harvesting',
            entry_type: 'reserved',
            description: `${t('diary.entry_reserved')}: ${getCropDisplay(savedCropType)} → ${bedName}`,
            bed_id: bedId,
          }).catch(() => {});
        }
      }
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : t('bed.save_error');
      showToast(msg, 'error');
    } finally {
      setSaving(false);
    }
  }

  /**
   * Complete a specific crop's cycle (#279 Wave C).
   * Pass a real BedCrop to PATCH status='harvested' (server auto-sets
   * completed_at via S5-1 remediation). Pass null to complete the virtual
   * legacy projection via PATCH /beds/:id.
   */
  async function handleCompleteCycle(crop: BedCrop | null) {
    if (!bedId) return;
    setCompleting(true);
    try {
      if (!crop) {
        const today = new Date().toISOString().slice(0, 10);
        const updated = await updateBed(bedId, { completed_at: today });
        setBed(updated);
      } else {
        const updated = await updateBedCrop(bedId, crop.id, { status: 'harvested' });
        setCrops((prev) => prev.map((c) => (c.id === crop.id ? updated : c)));
        const latest = await getBed(bedId);
        setBed(latest);
      }
      showToast(t('bed.cycle_completed'), 'success');
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : t('bed.save_error');
      showToast(msg, 'error');
    } finally {
      setCompleting(false);
    }
  }

  if (!bedId) {
    return (
      <div class="empty-state">
        <span class="empty-state__icon">🔍</span>
        <p class="empty-state__heading">{t('bed.no_selection')}</p>
        <a href="/" class="btn-primary mt-4">{t('buttons.back')}</a>
      </div>
    );
  }

  if (loading) {
    return (
      <>
        <div class="skeleton skeleton-hero" />
        <div style="padding:var(--space-4);display:flex;flex-direction:column;gap:var(--space-3)">
          <div class="skeleton skeleton-text-long" />
          <div class="skeleton skeleton-text-short" />
          <div class="skeleton skeleton-text-short" />
        </div>
        <div class="tag-area">
          <div class="tag-area__buttons">
            {[0, 1, 2, 3].map((i) => <div key={i} class="skeleton skeleton-tag-btn" />)}
          </div>
        </div>
        <div class="thumb-grid">
          {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} class="skeleton skeleton-thumb" />)}
        </div>
      </>
    );
  }

  if (error || !bed) {
    return (
      <div class="empty-state">
        <span class="empty-state__icon">⚠️</span>
        <p class="empty-state__heading">{t('farm.error_loading')}</p>
        <p class="empty-state__body">{t('farm.error_body')}</p>
        <a href="/" class="btn-primary mt-4">{t('buttons.back')}</a>
      </div>
    );
  }

  // Wave C (#279) — multi-crop rendering: iterate real active/planned BedCrops,
  // fall back to the virtual legacy projection (bed.active_crop) when no real
  // crops exist yet. primaryCrop drives the page title.
  const realActiveCrops = crops.filter((c) => c.status === 'active' || c.status === 'planned');
  const virtualActive = realActiveCrops.length === 0 && bed.active_crop ? bed.active_crop : null;
  const primaryCrop = realActiveCrops[0] ?? virtualActive ?? null;
  const historyCrops = crops.filter((c) => c.status === 'harvested' || c.status === 'failed');
  const activeCount = bed.active_crops_count ?? (primaryCrop ? 1 : 0);
  const canAddCrop = !isCropReadOnly && activeCount < MAX_ACTIVE_CROPS_PER_BED;
  const cropLabel = primaryCrop ? getCropDisplay(primaryCrop.crop_type) : t('bed.no_crop');
  // View-models for the card iteration. Virtual legacy case maps to a single
  // card whose Edit/Complete handlers route through the legacy path (crop=null).
  const activeCards = realActiveCrops.length > 0
    ? realActiveCrops.map((c) => ({
        key: c.id,
        status: c.status,
        crop_type: c.crop_type,
        crop_variety: c.crop_variety,
        planted_at: c.planted_at,
        expected_harvest: c.expected_harvest,
        notes: c.notes,
        onEdit: () => openEditModal(c),
        onComplete: () => handleCompleteCycle(c),
      }))
    : virtualActive
    ? [{
        key: virtualActive.id,
        status: virtualActive.status,
        crop_type: virtualActive.crop_type,
        crop_variety: virtualActive.crop_variety,
        planted_at: virtualActive.planted_at,
        expected_harvest: virtualActive.expected_harvest,
        notes: bed.notes,
        onEdit: () => openEditModal(null),
        onComplete: () => handleCompleteCycle(null),
      }]
    : [];
  const dayGroups = groupByDay(images);

  return (
    <>
      {/* -- Island 1: Hero Image -- */}
      <div class="hero-image-container">
        {bed.latest_image ? (
          <>
            <img
              src={bed.latest_image.url}
              alt={`Latest capture of ${cropLabel}`}
              style="width:100%;aspect-ratio:16/9;object-fit:cover;display:block"
              loading="eager"
            />
            <div class="overlay-badges">
              <span
                style="font-size:var(--font-size-xs);color:#FFFFFF;text-shadow:0 1px 3px rgba(0,0,0,0.8)"
              >
                {formatDate(bed.latest_image.captured_at)}
              </span>
              {bed.latest_image.trigger === 'motion' && (
                <span class="badge-motion">🏃 {t('motion.motion')}</span>
              )}
            </div>
          </>
        ) : (
          <div class="image-placeholder image-placeholder--hero" style="aspect-ratio:16/9">
            <span class="image-placeholder__icon" aria-hidden="true">📷</span>
            <span>{t('plot.no_images')}</span>
          </div>
        )}
      </div>

      {/* -- TimeLapse Player (F-14) -- */}
      <TimeLapsePlayer
        bedId={bedId}
        cropType={cropLabel}
        initialImages={images}
        initialCursor={nextCursor}
      />

      {/* -- Island 2: Bed/Crop Metadata (Wave C #279) -- */}
      <div class="crop-info">
        <h1 class="crop-info__title">{bed.name}{primaryCrop ? ` — ${cropLabel}` : ''}</h1>

        {activeCards.length > 0 ? (
          <div style="display:flex;flex-direction:column;gap:var(--space-3)">
            {activeCards.map((card) => (
              <div key={card.key} style="display:flex;flex-direction:column;gap:var(--space-2)">
                <div>
                  <span
                    class={`crop-status-pill crop-status-pill--${card.status}`}
                    style="display:inline-block;font-size:var(--font-size-xs);padding:2px 8px;border-radius:var(--radius-sm);background:var(--color-gray-100);color:var(--color-gray-700)"
                  >
                    {t(`bed.crop_status.${card.status}`)}
                  </span>
                </div>
                <dl>
                  <dt>{t('plot.crop_type')}</dt>
                  <dd>{getCropDisplay(card.crop_type)}</dd>
                  {card.crop_variety && (
                    <>
                      <dt>{t('plot.crop_variety')}</dt>
                      <dd>{card.crop_variety}</dd>
                    </>
                  )}
                  {card.planted_at && (
                    <>
                      <dt>{t('plot.planted')}</dt>
                      <dd>{formatDateShort(card.planted_at)}</dd>
                    </>
                  )}
                  {card.expected_harvest && (
                    <>
                      <dt>{t('plot.harvest')}</dt>
                      <dd>{formatDateShort(card.expected_harvest)}</dd>
                    </>
                  )}
                  {card.notes && (
                    <>
                      <dt>{t('plot.notes')}</dt>
                      <dd>{card.notes}</dd>
                    </>
                  )}
                </dl>
                {!isCropReadOnly && (
                  <div style="display:flex;gap:var(--space-2);margin-top:var(--space-1)">
                    <button class="btn-secondary" style="font-size:var(--font-size-sm)" onClick={card.onEdit}>
                      {t('bed.edit_crop')}
                    </button>
                    <button
                      class="btn-secondary"
                      style="font-size:var(--font-size-sm)"
                      onClick={card.onComplete}
                      disabled={completing}
                    >
                      {completing ? '...' : t('bed.complete_cycle')}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div style="color:var(--color-gray-500);font-style:italic;padding:var(--space-2) 0">
            {t('bed.no_active_crop')}
          </div>
        )}

        {!isCropReadOnly && (
          <button
            class="btn-primary"
            style={`margin-top:var(--space-3);font-size:var(--font-size-sm);opacity:${canAddCrop ? '1' : '0.5'}`}
            onClick={openAddModal}
            disabled={!canAddCrop}
            title={canAddCrop ? undefined : t('bed.cap_reached')}
          >
            {t('bed.add_new_planting')} ({activeCount}/{MAX_ACTIVE_CROPS_PER_BED})
          </button>
        )}

        {historyCrops.length > 0 && (
          <div style="margin-top:var(--space-3)">
            <button
              class="btn-secondary"
              style="font-size:var(--font-size-sm)"
              onClick={() => setShowHistory((x) => !x)}
              aria-expanded={showHistory}
            >
              {showHistory ? t('bed.hide_history') : t('bed.show_history')} ({historyCrops.length})
            </button>
            {showHistory && (
              <div style="margin-top:var(--space-2);display:flex;flex-direction:column;gap:var(--space-2)">
                {historyCrops.map((hc) => (
                  <div
                    key={hc.id}
                    style="padding:var(--space-2) var(--space-3);background:var(--color-gray-50);border-radius:var(--radius-md);display:flex;flex-direction:column;gap:var(--space-1)"
                  >
                    <div style="display:flex;align-items:center;justify-content:space-between;gap:var(--space-2)">
                      <strong>{getCropDisplay(hc.crop_type)}</strong>
                      <span
                        class={`crop-status-pill crop-status-pill--${hc.status}`}
                        style="font-size:var(--font-size-xs);padding:2px 6px;border-radius:var(--radius-sm);background:var(--color-gray-100);color:var(--color-gray-700)"
                      >
                        {t(`bed.crop_status.${hc.status}`)}
                      </span>
                    </div>
                    <div style="font-size:var(--font-size-xs);color:var(--color-gray-600)">
                      {hc.planted_at && `${t('plot.planted')}: ${formatDateShort(hc.planted_at)}`}
                      {hc.planted_at && hc.completed_at && ' · '}
                      {hc.completed_at && `${t('bed.completed_on')}: ${formatDateShort(hc.completed_at)}`}
                    </div>
                    {hc.notes && (
                      <div style="font-size:var(--font-size-xs);color:var(--color-gray-700)">{hc.notes}</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* -- Island 3: Tag Buttons -- */}
      {bed.latest_image && (
        <div class="tag-area">
          <div class="tag-area__heading">{t('plot.tag_this')}</div>
          <div class="tag-area__buttons" role="group" aria-label="Tag this image">
            {TAG_VALUES.map((tag) => (
              <button
                key={tag}
                class={`tag-btn ${TAG_CSS[tag]}${activeTag === tag ? ' tag-btn--active' : ''}`}
                onClick={() => handleTag(tag)}
                disabled={tagging}
                aria-pressed={activeTag === tag}
              >
                <span class="tag-icon" aria-hidden="true">{TAG_ICONS[tag]}</span>
                {t(`tags.${tag}`)}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* -- Island 4: Image History -- */}
      <div>
        <div class="section-heading" style="display:flex;align-items:center;justify-content:space-between">
          {t('plot.image_history')}
          <label
            class="btn-secondary"
            style={`cursor:${uploading ? 'not-allowed' : 'pointer'};display:inline-flex;align-items:center;gap:var(--space-2);opacity:${uploading ? '0.6' : '1'}`}
            aria-disabled={uploading}
          >
            <input
              type="file"
              accept="image/*"
              class="sr-only"
              disabled={uploading}
              onChange={handleImageUpload}
            />
            {uploading ? t('upload.uploading') : t('buttons.upload')}
          </label>
        </div>
        {images.length === 0 ? (
          <div class="empty-state" style="padding:var(--space-8)">
            <span class="empty-state__icon">📷</span>
            <p class="empty-state__heading">{t('plot.no_images')}</p>
            <p class="empty-state__body">{t('plot.no_images_body')}</p>
          </div>
        ) : (
          <>
            {dayGroups.map((group) => {
              const isOpen = expandedDays.has(group.dateKey);
              const bodyId = `day-body-${group.dateKey}`;
              return (
                <div key={group.dateKey} class="day-group">
                  <button
                    type="button"
                    class="day-group__header"
                    id={`day-header-${group.dateKey}`}
                    onClick={() => toggleDay(group.dateKey)}
                    aria-expanded={isOpen}
                    aria-controls={bodyId}
                  >
                    <span class={`day-group__chevron${isOpen ? ' day-group__chevron--open' : ''}`} aria-hidden="true">&#9654;</span>
                    <span class="day-group__label">{group.label}</span>
                    <span class="day-group__meta">
                      <span>{t('history.images_count').replace('{count}', String(group.images.length))}</span>
                      {group.deviceCount > 0 && <span class="day-group__source">📷{group.deviceCount}</span>}
                      {group.manualCount > 0 && <span class="day-group__source">📱{group.manualCount}</span>}
                    </span>
                  </button>
                  <div id={bodyId} class={`day-group__body${isOpen ? ' day-group__body--open' : ''}`} role="region" aria-labelledby={`day-header-${group.dateKey}`}>
                    <div class="thumb-grid">
                      {group.images.map((img) => (
                        <div
                          key={img.id}
                          class={`thumb-item${img.latest_tag ? ` thumb-item--tagged-${TAG_THUMB_CSS[img.latest_tag]}` : ''}`}
                          onClick={() => setLightboxSrc(fullSrc(img))}
                          style="cursor:pointer"
                          role="button"
                          tabIndex={0}
                          aria-label={`View image from ${formatDateShort(img.captured_at)}`}
                          onKeyDown={(e) => { if (e.key === 'Enter') setLightboxSrc(fullSrc(img)); }}
                        >
                          <img src={displaySrc(img)} alt="" loading="lazy" />
                          <div class="thumb-item__date">{formatDateShort(img.captured_at)}</div>
                          {img.trigger === 'motion' && (
                            <div class="thumb-item__motion">
                              <span class="badge-motion-sm">🏃</span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
            {nextCursor && (
              <div class="load-more">
                <button
                  class="load-more-btn"
                  onClick={loadMoreImages}
                  disabled={imagesLoading}
                  aria-busy={imagesLoading}
                >
                  {imagesLoading ? '...' : t('buttons.load_more')}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* -- Add/Edit Crop Modal (Wave C #279) -- */}
      <Modal
        open={cropModalMode !== 'closed'}
        onClose={closeCropModal}
        title={cropModalMode === 'add' ? t('bed.add_new_planting') : t('bed.edit_crop')}
        size="md"
      >
        <div style="display:flex;flex-direction:column;gap:var(--space-3)">
          <div class="form-group">
            <label class="form-label">{t('plot.crop_type')}</label>
            <CropAutocomplete
              value={cropForm.crop_type}
              onChange={(v) => {
                const propagation = getCropPropagation(v);
                const nextMethod: PlantMethod = propagation === 'both' ? plantMethod : propagation;
                if (nextMethod !== plantMethod) setPlantMethod(nextMethod);
                setCropForm((f) => {
                  const next = { ...f, crop_type: v };
                  if (next.planted_at) {
                    next.expected_harvest = estimateHarvestDate(next.planted_at, v, nextMethod) ?? next.expected_harvest;
                  }
                  return next;
                });
              }}
            />
          </div>
          <div class="form-group">
            <label class="form-label" for="crop-variety">{t('plot.crop_variety')}</label>
            <input id="crop-variety" type="text" class="form-input" value={cropForm.crop_variety} onInput={(e) => setCropForm({ ...cropForm, crop_variety: (e.target as HTMLInputElement).value })} placeholder="e.g. Cherry, Roma" />
          </div>
          {renderPlantMethodField()}
          <div class="form-group">
            <label class="form-label" for="planted-at">{plantMethod === 'seed' ? t('bed.seeding_date') : t('plot.planted')}</label>
            <input id="planted-at" type="date" class="form-input" value={cropForm.planted_at} onInput={(e) => {
              const planted = (e.target as HTMLInputElement).value;
              const next = { ...cropForm, planted_at: planted };
              if (planted && next.crop_type) {
                next.expected_harvest = estimateHarvestDate(planted, next.crop_type, plantMethod) ?? next.expected_harvest;
              }
              setCropForm(next);
            }} />
          </div>
          <div class="form-group">
            <label class="form-label" for="expected-harvest">{t('plot.harvest')}</label>
            <input id="expected-harvest" type="date" class="form-input" value={cropForm.expected_harvest} onInput={(e) => setCropForm({ ...cropForm, expected_harvest: (e.target as HTMLInputElement).value })} />
          </div>
          <div class="form-group">
            <label class="form-label" for="crop-notes">{t('plot.notes')}</label>
            <input id="crop-notes" type="text" class="form-input" value={cropForm.notes} onInput={(e) => setCropForm({ ...cropForm, notes: (e.target as HTMLInputElement).value })} maxLength={500} />
          </div>
          <div style="display:flex;gap:var(--space-3)">
            <button class="btn-secondary" style="flex:1" onClick={closeCropModal} disabled={saving}>{t('buttons.cancel')}</button>
            <button
              class="btn-primary"
              style="flex:2"
              onClick={handleSaveCrop}
              disabled={saving || !cropForm.crop_type.trim()}
            >
              {saving ? '...' : t('buttons.save')}
            </button>
          </div>
        </div>
      </Modal>

      {/* Lightbox overlay */}
      {lightboxSrc && (
        <Lightbox
          src={lightboxSrc}
          alt={`${cropLabel} image`}
          onClose={() => setLightboxSrc(null)}
        />
      )}

      {/* Bottom padding for tab bar */}
      <div style="height:80px" aria-hidden="true" />
    </>
  );
}

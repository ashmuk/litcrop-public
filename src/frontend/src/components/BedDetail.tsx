/**
 * Bed Detail Island — Phase D (replaces PlotDetail)
 * Sections: hero image, crop metadata, tag buttons (optimistic UI), image history.
 * Reads bedId from the URL query string at runtime (?id=<bedId>).
 */

import { useState, useEffect } from 'preact/hooks';
import type { BedDetailResponse, ImageListItem, TagValue } from '@litcrop/shared';
import { TAG_VALUES, MAX_IMAGE_SIZE_BYTES } from '@litcrop/shared';
import CropAutocomplete from './CropAutocomplete';
import { getCropDisplay } from '../lib/crops';
import { CATEGORY_META } from '../lib/diary';
import { estimateHarvestDate, getCropPropagation } from '@litcrop/shared';
import type { PlantMethod } from '@litcrop/shared';
import { getBed, getImages, createTag, uploadImage, updateBed, createDiaryEntry, ApiError } from '../lib/api';
import { getLocalFarmRole, refreshFarmRoleCache } from '../lib/hooks';
import { LS_FARM_ID } from '../lib/hooks';
import { showToast } from './Toast';
import { t } from '../i18n/i18n';
import { displaySrc, fullSrc } from '../lib/image';
import { TAG_ICONS } from '../lib/status';
import { formatDate, formatDateShort } from '../lib/format';
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
  const [images, setImages] = useState<ImageListItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [imagesLoading, setImagesLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTag, setActiveTag] = useState<TagValue | null>(null);
  const [tagging, setTagging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [cropForm, setCropForm] = useState({
    crop_type: '',
    crop_variety: '',
    planted_at: '',
    expected_harvest: '',
    notes: '',
  });
  const [saving, setSaving] = useState(false);
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
        const [bedData, imagesData] = await Promise.all([
          getBed(bedId),
          getImages(bedId),
        ]);
        if (cancelled) return;
        // Refresh role cache from API to prevent stale localStorage
        refreshFarmRoleCache()
          .then((role) => { if (!cancelled) setIsCropReadOnly(role === 'staff'); })
          .catch(() => {});
        setBed(bedData);
        setImages(imagesData.data);
        setNextCursor(imagesData.meta.next_cursor);
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
      formData.append('node_id', 'phone-camera');
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

  function startEditing() {
    setCropForm({
      crop_type: bed?.crop_type ?? '',
      crop_variety: bed?.crop_variety ?? '',
      planted_at: bed?.planted_at ?? '',
      expected_harvest: bed?.expected_harvest ?? '',
      notes: bed?.notes ?? '',
    });
    setEditing(true);
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

  async function handleSaveCrop() {
    setSaving(true);
    try {
      const data: Record<string, string | null> = {};
      const newCropType = cropForm.crop_type.trim() || null;
      const cropChanged = newCropType !== (bed?.crop_type ?? null);
      data.crop_type = newCropType;
      data.crop_variety = cropForm.crop_variety.trim() || null;
      // Clear lifecycle dates when crop changes, unless user set new dates (#321)
      data.planted_at = cropChanged && !cropForm.planted_at ? null : (cropForm.planted_at || null);
      data.expected_harvest = cropChanged && !cropForm.expected_harvest ? null : (cropForm.expected_harvest || null);
      data.notes = cropForm.notes.trim() || null;
      const updated = await updateBed(bedId, data);
      setBed(updated);
      setEditing(false);
      showToast(t('bed.crop_saved'), 'success');

      // Create reserved diary entries only when dates actually changed (#289)
      const farmId = localStorage.getItem(LS_FARM_ID);
      if (farmId) {
        if (data.planted_at && data.planted_at !== bed?.planted_at) {
          createDiaryEntry(farmId, {
            date: data.planted_at,
            category: plantMethod === 'seed' ? 'seeding' : 'planting',
            entry_type: 'reserved',
            description: `${t('diary.entry_reserved')}: ${getCropDisplay(data.crop_type ?? '')} → ${updated.name}`,
            bed_id: bedId,
          }).catch(() => {});
        }
        if (data.expected_harvest && data.expected_harvest !== bed?.expected_harvest) {
          createDiaryEntry(farmId, {
            date: data.expected_harvest,
            category: 'harvesting',
            entry_type: 'reserved',
            description: `${t('diary.entry_reserved')}: ${getCropDisplay(data.crop_type ?? '')} → ${updated.name}`,
            bed_id: bedId,
          }).catch(() => {});
        }
      }
    } catch {
      showToast(t('bed.save_error'), 'error');
    } finally {
      setSaving(false);
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

  const cropLabel = getCropDisplay(bed.crop_type) || t('bed.no_crop');

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

      {/* -- Island 2: Bed/Crop Metadata -- */}
      {editing && !isCropReadOnly ? (
        <div class="crop-info" style="display:flex;flex-direction:column;gap:var(--space-3)">
          <h2 style="font-size:var(--font-size-lg);font-weight:var(--font-weight-semibold)">{bed.crop_type ? t('bed.edit_crop') : t('bed.assign_crop')}</h2>
          <div class="form-group">
            <label class="form-label">{t('plot.crop_type')}</label>
            <CropAutocomplete
              value={cropForm.crop_type}
              onChange={(v) => {
                // Auto-sync plantMethod to the crop's default propagation method
                const propagation = getCropPropagation(v);
                const nextMethod: PlantMethod =
                  propagation === 'both' ? plantMethod : propagation;
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
            <button class="btn-secondary" style="flex:1" onClick={() => setEditing(false)} disabled={saving}>{t('buttons.cancel')}</button>
            <button class="btn-primary" style="flex:2" onClick={handleSaveCrop} disabled={saving}>{saving ? '...' : t('buttons.save')}</button>
          </div>
        </div>
      ) : (
        <div class="crop-info">
          <h1 class="crop-info__title">{bed.name} — {cropLabel}</h1>
          <dl>
            {bed.crop_type && (
              <>
                <dt>{t('plot.crop_type')}</dt>
                <dd>{getCropDisplay(bed.crop_type)}</dd>
              </>
            )}
            {bed.crop_variety && (
              <>
                <dt>{t('plot.crop_variety')}</dt>
                <dd>{bed.crop_variety}</dd>
              </>
            )}
            {bed.planted_at && (
              <>
                <dt>{t('plot.planted')}</dt>
                <dd>{formatDateShort(bed.planted_at)}</dd>
              </>
            )}
            {bed.expected_harvest && (
              <>
                <dt>{t('plot.harvest')}</dt>
                <dd>{formatDateShort(bed.expected_harvest)}</dd>
              </>
            )}
            {bed.notes && (
              <>
                <dt>{t('plot.notes')}</dt>
                <dd>{bed.notes}</dd>
              </>
            )}
            {!bed.crop_type && (
              <dd style="color:var(--color-gray-500);font-style:italic">{t('bed.no_crop')}</dd>
            )}
          </dl>
          {!isCropReadOnly && (
            <button class="btn-secondary" style="margin-top:var(--space-2);font-size:var(--font-size-sm)" onClick={startEditing}>
              {bed.crop_type ? t('bed.edit_crop') : t('bed.assign_crop')}
            </button>
          )}
        </div>
      )}

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
            <div class="thumb-grid">
              {images.map((img) => (
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

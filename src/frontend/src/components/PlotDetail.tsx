/**
 * Plot Detail Island — T-FE-08
 * Sections: hero image, crop metadata, tag buttons (optimistic UI), image history.
 * Reads plotId from the URL query string at runtime (?id=<plotId>).
 */

import { useState, useEffect } from 'preact/hooks';
import type { PlotDetailResponse, ImageListItem, TagValue } from '@litcrop/shared';
import { TAG_VALUES } from '@litcrop/shared';
import { getPlot, getImages, createTag, uploadImage } from '../lib/api';
import { showToast } from './Toast';
import { t } from '../i18n/i18n';
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

export default function PlotDetail() {
  const [plot, setPlot] = useState<PlotDetailResponse | null>(null);
  const [images, setImages] = useState<ImageListItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [imagesLoading, setImagesLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTag, setActiveTag] = useState<TagValue | null>(null);
  const [tagging, setTagging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  const plotId =
    typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('id') ?? ''
      : '';

  useEffect(() => {
    if (!plotId) return;
    let cancelled = false;

    async function load() {
      try {
        const [plotData, imagesData] = await Promise.all([
          getPlot(plotId),
          getImages(plotId),
        ]);
        if (cancelled) return;
        setPlot(plotData);
        setImages(imagesData.data);
        setNextCursor(imagesData.meta.next_cursor);
        // Reflect most recent tag as active
        if (plotData.latest_image?.tags?.length) {
          const lastTag = plotData.latest_image.tags[plotData.latest_image.tags.length - 1];
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
  }, [plotId]);

  async function loadMoreImages() {
    if (!nextCursor || imagesLoading) return;
    setImagesLoading(true);
    try {
      const data = await getImages(plotId, nextCursor);
      setImages((prev) => [...prev, ...data.data]);
      setNextCursor(data.meta.next_cursor);
    } catch {
      showToast(t('farm.error_loading'), 'error');
    } finally {
      setImagesLoading(false);
    }
  }

  async function handleTag(tag: TagValue) {
    if (!plot?.latest_image || tagging) return;
    const imageId = plot.latest_image.id;
    // Optimistic update — show selected state immediately
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
    if (file.size > 2 * 1024 * 1024) {
      showToast(t('upload.too_large'), 'error');
      return;
    }
    setUploading(true);
    const formData = new FormData();
    formData.append('image', file);
    formData.append('captured_at', new Date().toISOString());
    formData.append('node_id', 'phone-camera');
    formData.append('trigger', 'scheduled');
    try {
      await uploadImage(plotId, formData);
      showToast(t('upload.success'), 'success');
      const imagesData = await getImages(plotId);
      setImages(imagesData.data);
      setNextCursor(imagesData.meta.next_cursor);
    } catch {
      showToast(t('upload.error'), 'error');
    } finally {
      setUploading(false);
      // Reset input so the same file can be re-selected if needed
      (e.target as HTMLInputElement).value = '';
    }
  }

  if (!plotId) {
    return (
      <div class="empty-state">
        <span class="empty-state__icon">🔍</span>
        <p class="empty-state__heading">No plot selected</p>
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

  if (error || !plot) {
    return (
      <div class="empty-state">
        <span class="empty-state__icon">⚠️</span>
        <p class="empty-state__heading">{t('farm.error_loading')}</p>
        <p class="empty-state__body">{t('farm.error_body')}</p>
        <a href="/" class="btn-primary mt-4">{t('buttons.back')}</a>
      </div>
    );
  }

  return (
    <>
      {/* ── Island 1: Hero Image ─────────────────────────── */}
      <div class="hero-image-container">
        {plot.latest_image ? (
          <>
            <img
              src={plot.latest_image.url}
              alt={`Latest capture of ${plot.crop_type}`}
              style="width:100%;aspect-ratio:16/9;object-fit:cover;display:block"
              loading="eager"
            />
            <div class="overlay-badges">
              <span
                style="font-size:var(--font-size-xs);color:#FFFFFF;text-shadow:0 1px 3px rgba(0,0,0,0.8)"
              >
                {formatDate(plot.latest_image.captured_at)}
              </span>
              {plot.latest_image.trigger === 'motion' && (
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

      {/* ── TimeLapse Player (F-14) ────────────────────────── */}
      <TimeLapsePlayer
        plotId={plotId}
        cropType={plot.crop_type}
        initialImages={images}
        initialCursor={nextCursor}
      />

      {/* ── Island 2: Crop Metadata ──────────────────────── */}
      <div class="crop-info">
        <h1 class="crop-info__title">{plot.crop_type}</h1>
        <dl>
          <dt>{t('plot.crop_variety')}</dt>
          <dd>{plot.crop_variety}</dd>
          <dt>{t('plot.planted')}</dt>
          <dd>{formatDateShort(plot.planted_at)}</dd>
          <dt>{t('plot.harvest')}</dt>
          <dd>{formatDateShort(plot.expected_harvest)}</dd>
          {plot.notes && (
            <>
              <dt>{t('plot.notes')}</dt>
              <dd>{plot.notes}</dd>
            </>
          )}
        </dl>
      </div>

      {/* ── Island 3: Tag Buttons ────────────────────────── */}
      {plot.latest_image && (
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

      {/* ── Island 4: Image History ──────────────────────── */}
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
              accept="image/jpeg"
              capture="environment"
              style="display:none"
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
                  onClick={() => img.thumbnail_url && setLightboxSrc(img.thumbnail_url)}
                  style="cursor:pointer"
                  role="button"
                  tabIndex={0}
                  aria-label={`View image from ${formatDateShort(img.captured_at)}`}
                  onKeyDown={(e) => e.key === 'Enter' && img.thumbnail_url && setLightboxSrc(img.thumbnail_url)}
                >
                  {img.thumbnail_url ? (
                    <img src={img.thumbnail_url} alt="" loading="lazy" />
                  ) : (
                    <span style="font-size:24px" aria-hidden="true">📷</span>
                  )}
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
                  {imagesLoading ? '…' : t('buttons.load_more')}
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
          alt={`${plot.crop_type} image`}
          onClose={() => setLightboxSrc(null)}
        />
      )}

      {/* Bottom padding for tab bar */}
      <div style="height:80px" aria-hidden="true" />
    </>
  );
}

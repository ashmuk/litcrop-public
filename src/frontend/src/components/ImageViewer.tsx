/**
 * Image Viewer Island — T-FE-09
 * Full-size image viewer with navigation, metadata, and tags.
 * Reads imageId from URL query string: /images/view?id=<imageId>
 */

import { useState, useEffect, useCallback } from 'preact/hooks';
import type { ImageDetailResponse, ImageListItem, TagValue } from '@litcrop/shared';
import { getImage, getImages } from '../lib/api';
import { t } from '../i18n/i18n';

const TAG_ICONS: Record<TagValue, string> = {
  healthy: '✓',
  slow_growth: '⏱',
  issue: '⚠',
  animal_intrusion: '🦌',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ImageViewer() {
  const [image, setImage] = useState<ImageDetailResponse | null>(null);
  const [siblings, setSiblings] = useState<ImageListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [imageId, setImageId] = useState('');

  // Resolve imageId on client only
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('id') ?? '';
    setImageId(id);
  }, []);

  // Load image detail + sibling list for navigation
  useEffect(() => {
    if (!imageId) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const detail = await getImage(imageId);
        if (cancelled) return;
        setImage(detail);

        // Fetch sibling images for prev/next navigation
        const list = await getImages(detail.plot_id);
        if (cancelled) return;
        setSiblings(list.data);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load image');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [imageId]);

  const siblingIndex = siblings.findIndex((s) => s.id === imageId);
  const prevId = siblingIndex > 0 ? siblings[siblingIndex - 1].id : null;
  const nextId = siblingIndex < siblings.length - 1 ? siblings[siblingIndex + 1].id : null;

  const navigate = useCallback((id: string) => {
    window.location.search = `?id=${encodeURIComponent(id)}`;
  }, []);

  // Keyboard nav
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowLeft' && prevId) navigate(prevId);
      if (e.key === 'ArrowRight' && nextId) navigate(nextId);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [prevId, nextId, navigate]);

  if (!imageId) {
    return (
      <div class="empty-state" style="padding:var(--space-8)">
        <p>No image ID provided.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div class="empty-state" style="padding:var(--space-8);text-align:center">
        <p style="color:var(--color-text-muted)">Loading image…</p>
      </div>
    );
  }

  if (error || !image) {
    return (
      <div class="empty-state" style="padding:var(--space-8);text-align:center">
        <p style="color:var(--color-status-issue)">{error ?? 'Image not found'}</p>
        <button class="btn btn--secondary" style="margin-top:var(--space-4)" onClick={() => window.history.back()}>
          {t('buttons.back')}
        </button>
      </div>
    );
  }

  return (
    <div class="image-viewer">
      {/* ── Full-size image ── */}
      <div class="image-viewer__frame">
        <img
          src={image.url}
          alt={`Captured ${formatDate(image.captured_at)}`}
          class="image-viewer__img"
        />

        {/* Prev / Next overlay buttons */}
        {prevId && (
          <button
            class="image-viewer__nav image-viewer__nav--prev"
            onClick={() => navigate(prevId)}
            aria-label="Previous image"
          >
            ‹
          </button>
        )}
        {nextId && (
          <button
            class="image-viewer__nav image-viewer__nav--next"
            onClick={() => navigate(nextId)}
            aria-label="Next image"
          >
            ›
          </button>
        )}

        {/* Trigger badge */}
        <span
          class={`trigger-badge${image.trigger === 'motion' ? ' trigger-badge--motion' : ''}`}
          style="position:absolute;top:var(--space-3);right:var(--space-3)"
        >
          {image.trigger === 'motion' ? t('motion.motion') : t('motion.scheduled')}
        </span>
      </div>

      {/* ── Metadata ── */}
      <div class="image-viewer__meta">
        <dl class="meta-list">
          <div class="meta-list__row">
            <dt class="meta-list__label">{t('plot.captured')}</dt>
            <dd class="meta-list__value">{formatDate(image.captured_at)}</dd>
          </div>
          <div class="meta-list__row">
            <dt class="meta-list__label">Size</dt>
            <dd class="meta-list__value">{formatBytes(image.size_bytes)}</dd>
          </div>
          <div class="meta-list__row">
            <dt class="meta-list__label">Node</dt>
            <dd class="meta-list__value">{image.node_id}</dd>
          </div>
          {siblings.length > 0 && (
            <div class="meta-list__row">
              <dt class="meta-list__label">Position</dt>
              <dd class="meta-list__value">
                {siblingIndex + 1} / {siblings.length}
              </dd>
            </div>
          )}
        </dl>
      </div>

      {/* ── Tags ── */}
      {image.tags.length > 0 && (
        <div class="image-viewer__tags">
          <p style="font-size:var(--font-size-sm);color:var(--color-text-muted);margin-bottom:var(--space-2)">
            Tags
          </p>
          <div style="display:flex;flex-wrap:wrap;gap:var(--space-2)">
            {image.tags.map((tag) => (
              <span key={tag.id} class={`tag-chip tag-chip--${tag.tag.replace('_', '-')}`}>
                {TAG_ICONS[tag.tag]} {t(`tags.${tag.tag}`)}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── Navigation strip (thumbnail row) ── */}
      {siblings.length > 1 && (
        <div class="image-viewer__strip" role="list" aria-label="Image strip">
          {siblings.slice(0, 20).map((s) => (
            <button
              key={s.id}
              role="listitem"
              class={`image-viewer__thumb${s.id === imageId ? ' image-viewer__thumb--active' : ''}`}
              onClick={() => s.id !== imageId && navigate(s.id)}
              aria-label={`View image from ${formatDate(s.captured_at)}`}
              aria-current={s.id === imageId ? 'true' : undefined}
            >
              <img src={s.thumbnail_url} alt="" loading="lazy" />
            </button>
          ))}
        </div>
      )}

      {/* ── Back link ── */}
      <div style="padding:var(--space-4)">
        <a
          href={`/plots/view?id=${encodeURIComponent(image.plot_id)}`}
          class="btn btn--secondary"
          style="display:inline-flex;align-items:center;gap:var(--space-2)"
        >
          ← {t('buttons.back')}
        </a>
      </div>
    </div>
  );
}

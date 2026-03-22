/**
 * Lightbox Component — FR-3.5
 * Full-screen image overlay with zoom, ESC close, and focus trap.
 * Rendered as a portal into document.body.
 */

import { useState, useEffect, useRef, useCallback } from 'preact/hooks';
import { createPortal } from 'preact/compat';
import { t } from '../i18n/i18n';

export interface LightboxProps {
  src: string;
  alt: string;
  caption?: string;
  onClose: () => void;
}

export default function Lightbox({ src, alt, caption, onClose }: LightboxProps) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const closeRef = useRef<HTMLButtonElement>(null);
  const lastTapRef = useRef(0);
  const touchStartRef = useRef<{ dist: number; zoom: number } | null>(null);
  const panStartRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const closedViaPopstateRef = useRef(false);

  // Wrap close to clean up history entry when not triggered by back button
  const handleClose = useCallback(() => {
    if (!closedViaPopstateRef.current) {
      history.back(); // Remove the pushState entry
    }
    onCloseRef.current();
  }, []);

  // Lock body scroll and push history state on mount (runs once)
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    history.pushState({ lightbox: true }, '');

    const onPopState = () => {
      closedViaPopstateRef.current = true;
      onCloseRef.current();
    };
    window.addEventListener('popstate', onPopState);

    closeRef.current?.focus();

    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('popstate', onPopState);
    };
  }, []);

  // ESC key + focus trap
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleClose();
      }
      // Focus trap: keep Tab within the lightbox (only close button is focusable)
      if (e.key === 'Tab') {
        e.preventDefault();
        closeRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleClose]);

  const handleBackdropClick = useCallback((e: MouseEvent) => {
    if ((e.target as HTMLElement).classList.contains('lightbox-overlay')) {
      handleClose();
    }
  }, [handleClose]);

  // Double-tap to toggle zoom
  const handleDoubleTap = useCallback(() => {
    if (zoom === 1) {
      setZoom(2);
    } else {
      setZoom(1);
      setPan({ x: 0, y: 0 });
    }
  }, [zoom]);

  const handleClick = useCallback((e: MouseEvent) => {
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      handleDoubleTap();
    }
    lastTapRef.current = now;
    e.stopPropagation();
  }, [handleDoubleTap]);

  // Touch handlers for pinch-to-zoom and pan
  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      touchStartRef.current = { dist: Math.hypot(dx, dy), zoom };
    } else if (e.touches.length === 1 && zoom > 1) {
      panStartRef.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
        panX: pan.x,
        panY: pan.y,
      };
    }
  }, [zoom, pan]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (e.touches.length === 2 && touchStartRef.current) {
      e.preventDefault();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const scale = dist / touchStartRef.current.dist;
      const newZoom = Math.min(3, Math.max(1, touchStartRef.current.zoom * scale));
      setZoom(newZoom);
      if (newZoom === 1) setPan({ x: 0, y: 0 });
    } else if (e.touches.length === 1 && panStartRef.current && zoom > 1) {
      e.preventDefault();
      const dx = e.touches[0].clientX - panStartRef.current.x;
      const dy = e.touches[0].clientY - panStartRef.current.y;
      setPan({ x: panStartRef.current.panX + dx, y: panStartRef.current.panY + dy });
    }
  }, [zoom]);

  const handleTouchEnd = useCallback(() => {
    touchStartRef.current = null;
    panStartRef.current = null;
  }, []);

  const overlay = (
    <div
      class="lightbox-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      onClick={handleBackdropClick}
    >
      <button
        ref={closeRef}
        class="lightbox-close"
        onClick={handleClose}
        aria-label={t('lightbox.close')}
      >
        ×
      </button>

      <div class="lightbox-content">
        {!loaded && !error && (
          <div class="lightbox-spinner" aria-busy="true">
            <p>{t('lightbox.loading')}</p>
          </div>
        )}

        {error && (
          <div class="lightbox-error">
            <p>{t('lightbox.error')}</p>
          </div>
        )}

        <img
          src={src}
          alt={alt}
          class="lightbox-img"
          style={{
            transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
            opacity: loaded ? 1 : 0,
          }}
          onLoad={() => setLoaded(true)}
          onError={() => setError(true)}
          onClick={handleClick}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          draggable={false}
        />
      </div>

      {caption && loaded && (
        <div class="lightbox-caption">{caption}</div>
      )}
    </div>
  );

  return createPortal(overlay, document.body);
}

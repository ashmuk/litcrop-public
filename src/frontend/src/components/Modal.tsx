/**
 * Modal — portal-based reusable modal primitive.
 *
 * Handles: body scroll-lock, Escape to close, backdrop click, focus restoration
 * to the opener, and nested-modal stacking (Escape closes topmost only; scroll
 * unlocks only when depth returns to 0).
 *
 * Not yet used by Lightbox — Lightbox keeps its own implementation to avoid
 * mixing scopes in the #343/#344 PR. Refactor candidate for a follow-up.
 */

import { useEffect, useRef } from 'preact/hooks';
import { createPortal } from 'preact/compat';
import type { ComponentChildren } from 'preact';
import { t } from '../i18n/i18n';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  ariaLabel?: string;
  size?: 'sm' | 'md' | 'lg';
  children: ComponentChildren;
}

// Module-level stack state — shared across all Modal instances.
// Tracks nesting depth so body scroll-lock and Escape routing work with
// multiple concurrent modals (e.g. TierInfoModal opened from inside a
// DeviceConfigForm modal).
let modalStackDepth = 0;
let savedBodyOverflow: string | null = null;
const openInstanceIds: number[] = [];
let nextInstanceId = 0;

function lockBodyScroll() {
  if (modalStackDepth === 0) {
    savedBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  modalStackDepth += 1;
}

function unlockBodyScroll() {
  modalStackDepth = Math.max(0, modalStackDepth - 1);
  if (modalStackDepth === 0 && savedBodyOverflow !== null) {
    document.body.style.overflow = savedBodyOverflow;
    savedBodyOverflow = null;
  }
}

const MAX_WIDTH: Record<NonNullable<ModalProps['size']>, string> = {
  sm: '360px',
  md: '480px',
  lg: '640px',
};

export default function Modal({
  open,
  onClose,
  title,
  ariaLabel,
  size = 'md',
  children,
}: ModalProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const instanceIdRef = useRef<number>(-1);

  // Register open/close lifecycle: body scroll-lock, focus save/restore,
  // and stack ordering. Runs only while `open` is true.
  useEffect(() => {
    if (!open) return;

    previousFocusRef.current = document.activeElement as HTMLElement | null;
    lockBodyScroll();

    const myId = nextInstanceId++;
    instanceIdRef.current = myId;
    openInstanceIds.push(myId);

    // Focus the close button on mount so keyboard users start inside the modal.
    closeRef.current?.focus();

    return () => {
      const idx = openInstanceIds.indexOf(myId);
      if (idx !== -1) openInstanceIds.splice(idx, 1);
      unlockBodyScroll();

      // Restore focus to the element that opened the modal.
      const prev = previousFocusRef.current;
      if (prev && typeof prev.focus === 'function') {
        prev.focus();
      }
    };
  }, [open]);

  // Escape + Tab focus-trap. Only the topmost modal reacts to Escape.
  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      const topId = openInstanceIds[openInstanceIds.length - 1];
      if (topId !== instanceIdRef.current) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
      if (e.key === 'Tab') {
        // Trap focus: keep Tab cycling to the close button. Good enough for
        // our current modals (small forms); revisit if we add complex focus
        // zones later.
        e.preventDefault();
        closeRef.current?.focus();
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const handleBackdropClick = (e: MouseEvent) => {
    if ((e.target as HTMLElement).dataset.modalScrim === 'true') {
      onClose();
    }
  };

  const overlay = (
    <div
      data-modal-scrim="true"
      onClick={handleBackdropClick}
      style="position:fixed;inset:0;background:var(--color-overlay);display:flex;align-items:center;justify-content:center;padding:var(--space-4);z-index:1000"
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel ?? title}
    >
      <div
        style={`background:var(--color-surface);border-radius:var(--radius-lg);width:100%;max-width:${MAX_WIDTH[size]};max-height:calc(100vh - var(--space-8));display:flex;flex-direction:column;overflow:hidden;box-shadow:0 20px 40px rgba(0,0,0,0.2)`}
      >
        <div
          style="display:flex;align-items:center;justify-content:space-between;padding:var(--space-3) var(--space-4);border-bottom:1px solid var(--color-gray-100)"
        >
          <div
            style="font-size:var(--font-size-base);font-weight:var(--font-weight-semibold);color:var(--color-gray-900)"
          >
            {title}
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label={t('modal.close')}
            style="width:32px;height:32px;border:none;background:transparent;color:var(--color-gray-700);font-size:22px;cursor:pointer;border-radius:var(--radius-sm);line-height:1"
          >
            ×
          </button>
        </div>
        <div style="padding:var(--space-4);overflow-y:auto">
          {children}
        </div>
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}

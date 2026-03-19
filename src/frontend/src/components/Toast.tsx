/**
 * Toast Notification Container — T-FE-13
 *
 * Cross-island communication via window custom events.
 * Usage from any island: showToast('message', 'success')
 * Or raw: window.dispatchEvent(new CustomEvent('litcrop:toast', { detail: { message, type } }))
 */

import { useState, useEffect } from 'preact/hooks';

export interface ToastMessage {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

/** Dispatch a toast notification from any component / island. */
export function showToast(message: string, type: ToastMessage['type'] = 'info'): void {
  window.dispatchEvent(
    new CustomEvent<Omit<ToastMessage, 'id'>>('litcrop:toast', { detail: { message, type } }),
  );
}

export default function Toast() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  useEffect(() => {
    function onToastEvent(e: Event) {
      const { message, type } = (e as CustomEvent<Omit<ToastMessage, 'id'>>).detail;
      const id = crypto.randomUUID();
      setToasts((prev) => [...prev, { id, message, type }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4000);
    }

    window.addEventListener('litcrop:toast', onToastEvent);
    return () => window.removeEventListener('litcrop:toast', onToastEvent);
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div role="status" aria-live="polite" aria-atomic="false">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          class={`toast${toast.type === 'success' ? ' toast--success' : toast.type === 'error' ? ' toast--error' : ''}`}
          role="alert"
        >
          <span class="toast__icon" aria-hidden="true">
            {toast.type === 'success' ? '✓' : toast.type === 'error' ? '✕' : 'ℹ'}
          </span>
          <span>{toast.message}</span>
        </div>
      ))}
    </div>
  );
}

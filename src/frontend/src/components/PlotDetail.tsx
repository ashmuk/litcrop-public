/**
 * PlotDetail — DEPRECATED (Phase D)
 * Redirects to /beds/view with the same ID.
 * Kept for backwards compatibility with old URLs.
 */

export default function PlotDetail() {
  if (typeof window !== 'undefined') {
    const id = new URLSearchParams(window.location.search).get('id') ?? '';
    if (id) {
      window.location.replace(`/beds/view?id=${encodeURIComponent(id)}`);
    } else {
      window.location.replace('/');
    }
  }
  return null;
}

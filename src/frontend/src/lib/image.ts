/**
 * Image URL resolution helpers.
 *
 * Display: prefer thumbnail (smaller, faster) with full-size fallback.
 * Lightbox: prefer full-size (higher quality) with thumbnail fallback.
 */

/** Node ID assigned to phone-camera (manual) uploads. */
export const MANUAL_NODE_ID = 'phone-camera';

interface ImageUrls {
  thumbnail_url: string | null;
  url: string;
}

interface NodeInfo {
  node_id: string;
}

/** Whether the image was a manual phone-camera upload. */
export function isManualUpload(img: NodeInfo): boolean {
  return img.node_id === MANUAL_NODE_ID;
}

/** Resolve the best URL for display (thumbnail preferred, full-size fallback). */
export function displaySrc(img: ImageUrls): string {
  return img.thumbnail_url ?? img.url;
}

/** Resolve the best URL for lightbox / full-view (full-size preferred). */
export function fullSrc(img: ImageUrls): string {
  return img.url || img.thumbnail_url!;
}

/** Whether the image has any displayable URL. */
export function hasImageSrc(img: ImageUrls | null | undefined): img is ImageUrls {
  return img != null && (img.thumbnail_url != null || img.url != null);
}

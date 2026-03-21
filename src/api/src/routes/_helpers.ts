import { getSignedThumbnailUrl } from '../services/s3';
import type { Image } from '@litcrop/shared';

export async function makeLatestImage(image: Image) {
  const thumbnail_url = image.thumbnail_key
    ? await getSignedThumbnailUrl(image.thumbnail_key)
    : null;
  return {
    id: image.id,
    thumbnail_url,
    captured_at: image.captured_at,
    trigger: image.trigger,
  };
}

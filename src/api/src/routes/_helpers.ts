import { getSignedImageUrl } from '../services/s3';
import type { Image } from '@litcrop/shared';

export async function makeLatestImage(image: Image) {
  const thumbnail_url = await getSignedImageUrl(image.storage_key);
  return {
    id: image.id,
    thumbnail_url,
    captured_at: image.captured_at,
    trigger: image.trigger,
  };
}

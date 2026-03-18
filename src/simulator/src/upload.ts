/**
 * LitCrop Camera Simulator — Image Upload with Retry
 * T-SIM-01: Upload JPEG to POST /api/v1/plots/{plotId}/images
 * Exponential backoff: 3 attempts (delays: 1s, 2s, 4s)
 */

import type { ImageUploadResponse } from '@litcrop/shared';

const MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 1000;

export interface UploadOptions {
  apiBaseUrl: string;
  plotId: string;
  imageBuffer: Buffer;
  triggerType: 'scheduled' | 'motion';
  nodeId: string;
}

export interface UploadResult {
  success: boolean;
  data?: ImageUploadResponse;
  error?: Error;
  attempts: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Upload a JPEG image to the LitCrop API with exponential backoff retry.
 * Makes up to 3 attempts with delays: 1 s, 2 s, 4 s between retries.
 */
export async function uploadImage(options: UploadOptions): Promise<UploadResult> {
  const { apiBaseUrl, plotId, imageBuffer, triggerType, nodeId } = options;
  const url = `${apiBaseUrl}/api/v1/plots/${plotId}/images`;

  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const formData = new FormData();
      const blob = new Blob([new Uint8Array(imageBuffer)], { type: 'image/jpeg' });
      formData.append('image', blob, 'capture.jpg');
      formData.append('trigger_type', triggerType);
      formData.append('node_id', nodeId);

      const res = await fetch(url, { method: 'POST', body: formData });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
      }

      const data = (await res.json()) as ImageUploadResponse;
      return { success: true, data, attempts: attempt };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.error(
        `[upload] Attempt ${attempt}/${MAX_ATTEMPTS} failed for plot ${plotId}: ${lastError.message}`,
      );
      if (attempt < MAX_ATTEMPTS) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1); // 1 s, 2 s, 4 s
        console.log(`[upload] Retrying in ${delay} ms…`);
        await sleep(delay);
      }
    }
  }

  return { success: false, error: lastError, attempts: MAX_ATTEMPTS };
}

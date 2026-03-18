// LitCrop Simulator — Simulated camera node
// Uploads sample images to the LitCrop API on a schedule

import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { DEFAULT_CONFIG, TRIGGER_TYPES } from '@litcrop/shared';
import { uploadImage } from './upload';

const API_BASE_URL = process.env.API_BASE_URL ?? DEFAULT_CONFIG.apiBaseUrl;
const PLOT_ID = process.env.PLOT_ID ?? 'demo-plot-1';
const NODE_ID = process.env.NODE_ID ?? 'node-001';
const SAMPLE_IMAGES_DIR =
  process.env.SAMPLE_IMAGES_DIR ??
  join(__dirname, '../../..', 'assets/sample-images');

console.log('LitCrop simulator starting…');
console.log(`API base URL: ${API_BASE_URL}`);
console.log(`Supported trigger types: ${TRIGGER_TYPES.join(', ')}`);
console.log(`Upload interval: ${DEFAULT_CONFIG.simulatorIntervalMs / 1000}s`);
console.log(`Plot ID: ${PLOT_ID} | Node ID: ${NODE_ID}`);

async function runCycle(): Promise<void> {
  // Pick a random sample image
  let imageBuffer: Buffer;
  try {
    const files = readdirSync(SAMPLE_IMAGES_DIR).filter(
      (f) => f.endsWith('.jpg') || f.endsWith('.jpeg'),
    );
    if (files.length === 0) {
      console.warn('[simulator] No sample images found in', SAMPLE_IMAGES_DIR);
      return;
    }
    const picked = files[Math.floor(Math.random() * files.length)];
    imageBuffer = readFileSync(join(SAMPLE_IMAGES_DIR, picked));
    console.log(`[simulator] Selected image: ${picked}`);
  } catch (err) {
    console.error('[simulator] Failed to read sample images:', err);
    return;
  }

  const triggerType =
    Math.random() < DEFAULT_CONFIG.simulatorMotionChance ? 'motion' : 'scheduled';

  console.log(`[simulator] Uploading to plot ${PLOT_ID} (trigger: ${triggerType})…`);

  const result = await uploadImage({
    apiBaseUrl: API_BASE_URL,
    plotId: PLOT_ID,
    imageBuffer,
    triggerType,
    nodeId: NODE_ID,
  });

  if (result.success) {
    console.log(
      `[simulator] ✓ Upload succeeded (id: ${result.data?.id}, attempts: ${result.attempts})`,
    );
  } else {
    console.error(
      `[simulator] ✗ Upload failed after ${result.attempts} attempts: ${result.error?.message}`,
    );
  }
}

// Run immediately, then on interval
runCycle();
setInterval(runCycle, DEFAULT_CONFIG.simulatorIntervalMs);

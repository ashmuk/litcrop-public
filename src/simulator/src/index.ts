// LitCrop Simulator — Simulated camera node
// Uploads sample images to the LitCrop API on a schedule

import { DEFAULT_CONFIG, TRIGGER_TYPES } from '@litcrop/shared';

console.log('LitCrop simulator starting...');
console.log(`API base URL: ${DEFAULT_CONFIG.apiBaseUrl}`);
console.log(`Supported trigger types: ${TRIGGER_TYPES.join(', ')}`);
console.log(`Upload interval: ${DEFAULT_CONFIG.simulatorIntervalMs / 1000}s`);

// TODO: implement periodic HTTPS image upload logic (T-SIM-01)

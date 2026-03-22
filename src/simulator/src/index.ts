// LitCrop Simulator — T-SIM-02
// CLI-configurable camera node simulator with scheduled and motion capture modes.

import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { DEFAULT_CONFIG } from '@litcrop/shared';
import { uploadImage } from './upload';

// ── Resolve __dirname for ESM / CJS compatibility ─────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ── CLI argument parsing ──────────────────────────────────────────

interface CliArgs {
  apiUrl: string;
  farmId: string | null;
  bedId: string | null;
  allBeds: boolean;
  mode: 'scheduled' | 'motion';
  intervalSeconds: number;
  once: boolean;
  nodeId: string;
}

function parseArgs(argv: string[]): CliArgs {
  const args = argv.slice(2); // skip 'node' and script path

  const result: CliArgs = {
    apiUrl: DEFAULT_CONFIG.apiBaseUrl,
    farmId: null,
    bedId: null,
    allBeds: false,
    mode: 'scheduled',
    intervalSeconds: 300, // 5 minutes default (overrides config's 1h default)
    once: false,
    nodeId: process.env.NODE_ID ?? 'node-001',
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--api-url':
        result.apiUrl = args[++i] ?? result.apiUrl;
        break;
      case '--farm-id':
        result.farmId = args[++i] ?? null;
        break;
      case '--bed':
        result.bedId = args[++i] ?? null;
        result.allBeds = false;
        break;
      case '--plot': // backward compat alias
        result.bedId = args[++i] ?? null;
        result.allBeds = false;
        break;
      case '--all':
        result.allBeds = true;
        result.bedId = null;
        break;
      case '--mode': {
        const m = args[++i];
        if (m === 'scheduled' || m === 'motion') result.mode = m;
        else console.warn(`[simulator] Unknown mode "${m}", using "scheduled"`);
        break;
      }
      case '--interval': {
        const secs = parseInt(args[++i] ?? '', 10);
        if (!isNaN(secs) && secs > 0) result.intervalSeconds = secs;
        break;
      }
      case '--once':
        result.once = true;
        break;
      case '--node-id':
        result.nodeId = args[++i] ?? result.nodeId;
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
        break;
      default:
        console.warn(`[simulator] Unknown argument: ${arg}`);
    }
  }

  return result;
}

function printHelp(): void {
  console.log(`
LitCrop Camera Simulator

Usage:
  npx tsx src/index.ts [options]

Options:
  --api-url <url>        API base URL (default: ${DEFAULT_CONFIG.apiBaseUrl})
  --farm-id <id>         Farm ID (informational, logged only)
  --bed <bedId>          Target bed ID
  --plot <bedId>         Alias for --bed (backward compat)
  --all                  Target all beds (uses BED_IDS env var)
  --mode <scheduled|motion>  Capture mode (default: scheduled)
  --interval <seconds>   Upload interval for scheduled mode (default: 300)
  --once                 Upload once then exit
  --node-id <id>         Camera node identifier (default: node-001)
  -h, --help             Show this help

Examples:
  npx tsx src/index.ts --once --bed bed-a1 --api-url http://localhost:3000
  npx tsx src/index.ts --mode motion --bed bed-a1
  npx tsx src/index.ts --mode scheduled --interval 60 --bed bed-a1
`.trim());
}

// ── Sample image loading ──────────────────────────────────────────

const SAMPLE_IMAGES_DIR =
  process.env.SAMPLE_IMAGES_DIR ??
  join(__dirname, '..', 'sample-images');

function pickRandomImage(): Buffer | null {
  try {
    const files = readdirSync(SAMPLE_IMAGES_DIR).filter(
      (f) => f.endsWith('.jpg') || f.endsWith('.jpeg'),
    );
    if (files.length === 0) {
      console.warn('[simulator] No sample images found in', SAMPLE_IMAGES_DIR);
      return null;
    }
    const picked = files[Math.floor(Math.random() * files.length)];
    console.log(`[simulator] Selected image: ${picked}`);
    return readFileSync(join(SAMPLE_IMAGES_DIR, picked));
  } catch (err) {
    console.error('[simulator] Failed to read sample images:', err);
    return null;
  }
}

// ── Upload cycle ──────────────────────────────────────────────────

async function runCycle(args: CliArgs): Promise<void> {
  const timestamp = new Date().toISOString();
  const bedId = args.bedId ?? 'demo-bed-1';

  console.log(`[${timestamp}] mode=${args.mode} bed=${bedId}`);

  const imageBuffer = pickRandomImage();
  if (!imageBuffer) return;

  // Mode determines trigger type; motion mode always uses 'motion' trigger,
  // scheduled mode uses 'scheduled' trigger.
  const triggerType = args.mode === 'motion' ? 'motion' : 'scheduled';

  console.log(`[simulator] Uploading to bed ${bedId} (trigger: ${triggerType})…`);

  const result = await uploadImage({
    apiBaseUrl: args.apiUrl,
    bedId,
    imageBuffer,
    triggerType,
    nodeId: args.nodeId,
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

// ── Random interval for motion mode ──────────────────────────────

function randomMotionDelay(): number {
  // 30–120 seconds simulating real motion detection gaps
  return (30 + Math.floor(Math.random() * 90)) * 1000;
}

// ── Main ──────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs(process.argv);

  console.log('LitCrop simulator starting…');
  console.log(`API base URL : ${args.apiUrl}`);
  console.log(`Mode         : ${args.mode}`);
  console.log(`Bed ID       : ${args.bedId ?? 'demo-bed-1'}`);
  console.log(`Node ID      : ${args.nodeId}`);
  if (!args.once) {
    if (args.mode === 'scheduled') {
      console.log(`Interval     : ${args.intervalSeconds}s`);
    } else {
      console.log(`Interval     : random 30–120s (motion)`);
    }
  }

  // Run one cycle immediately
  await runCycle(args);

  if (args.once) {
    process.exit(0);
  }

  // Scheduled mode: fixed interval
  if (args.mode === 'scheduled') {
    const intervalMs = args.intervalSeconds * 1000;
    const timer = setInterval(() => runCycle(args), intervalMs);

    process.on('SIGINT', () => {
      console.log('\n[simulator] SIGINT received, shutting down…');
      clearInterval(timer);
      process.exit(0);
    });
    process.on('SIGTERM', () => {
      console.log('\n[simulator] SIGTERM received, shutting down…');
      clearInterval(timer);
      process.exit(0);
    });
  } else {
    // Motion mode: random intervals via recursive setTimeout
    let running = true;

    process.on('SIGINT', () => {
      console.log('\n[simulator] SIGINT received, shutting down…');
      running = false;
      process.exit(0);
    });
    process.on('SIGTERM', () => {
      console.log('\n[simulator] SIGTERM received, shutting down…');
      running = false;
      process.exit(0);
    });

    function scheduleNext(): void {
      if (!running) return;
      const delay = randomMotionDelay();
      console.log(`[simulator] Next motion event in ${delay / 1000}s…`);
      setTimeout(async () => {
        if (!running) return;
        await runCycle(args);
        scheduleNext();
      }, delay);
    }

    scheduleNext();
  }
}

main().catch((err) => {
  console.error('[simulator] Fatal error:', err);
  process.exit(1);
});

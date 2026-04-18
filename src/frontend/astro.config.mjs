import { defineConfig } from 'astro/config';
import { execFileSync } from 'child_process';
import { readFileSync, writeFileSync, rmSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import preact from '@astrojs/preact';

const appVersion = (() => {
  try { return execFileSync('git', ['describe', '--tags', '--abbrev=0']).toString().trim(); }
  catch { return 'dev'; }
})();

// Version-stamp cache invalidation.
//
// Vite's `define` replaces __APP_VERSION__ at transform time, but the
// transform cache (node_modules/.vite/) and Astro's intermediate state
// (.astro/) can retain chunks compiled against the previous appVersion.
// A tag bump changes only the git-describe output — no source mtime
// moves — so an incremental build reuses stale chunks and ships the
// wrong version string. We remember the last-built appVersion in a
// stamp file and clear the three caches whenever it changes.
// All fs calls are best-effort; a build should never fail because of
// cache-management bookkeeping.
const stampDir = 'node_modules/.cache';
const stampFile = join(stampDir, 'astro-app-version');

let stampedVersion = '';
try { if (existsSync(stampFile)) stampedVersion = readFileSync(stampFile, 'utf8').trim(); } catch {}

if (stampedVersion && stampedVersion !== appVersion) {
  console.log(`[astro.config] __APP_VERSION__ changed ${stampedVersion} → ${appVersion}, clearing build caches`);
  for (const dir of ['.astro', 'dist', 'node_modules/.vite']) {
    try { rmSync(dir, { recursive: true, force: true }); } catch {}
  }
}

try {
  mkdirSync(stampDir, { recursive: true });
  writeFileSync(stampFile, appVersion);
} catch {}

export default defineConfig({
  output: 'static',
  integrations: [
    preact(),
  ],
  server: {
    port: 4321,
  },
  vite: {
    define: {
      __APP_VERSION__: JSON.stringify(appVersion),
    },
    optimizeDeps: {
      exclude: ['@astrojs/preact', '@astrojs/preact/server'],
      esbuildOptions: {
        plugins: [
          {
            name: 'astro-virtual-modules',
            setup(build) {
              build.onResolve({ filter: /^astro:/ }, (args) => ({
                path: args.path,
                external: true,
              }));
            },
          },
        ],
      },
    },
  },
});

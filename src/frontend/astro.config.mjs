import { defineConfig } from 'astro/config';
import { execFileSync } from 'child_process';
import preact from '@astrojs/preact';
import { invalidateVersionCache } from '../../tools/invalidate-version-cache.mjs';

const appVersion = (() => {
  try { return execFileSync('git', ['describe', '--tags', '--abbrev=0']).toString().trim(); }
  catch { return 'dev'; }
})();

// Bust .astro/ + dist/ + node_modules/.vite/ when the git-describe tag
// changes between builds, so __APP_VERSION__ in compiled chunks matches
// the current release. Logic lives in tools/invalidate-version-cache.mjs
// so it can be unit-tested against injected fs primitives.
invalidateVersionCache(appVersion);

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

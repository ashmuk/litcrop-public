import { defineConfig } from 'astro/config';
import { execFileSync } from 'child_process';
import preact from '@astrojs/preact';

const appVersion = (() => {
  try { return execFileSync('git', ['describe', '--tags', '--abbrev=0']).toString().trim(); }
  catch { return 'dev'; }
})();

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

import { defineConfig } from 'astro/config';
import preact from '@astrojs/preact';

export default defineConfig({
  output: 'static',
  integrations: [
    preact(),
  ],
  server: {
    port: 4321,
  },
  vite: {
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

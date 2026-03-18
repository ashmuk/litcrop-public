import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@litcrop/shared': resolve(__dirname, './packages/shared/src/index.ts'),
    },
  },
  test: {
    include: [
      'packages/*/src/__tests__/**/*.test.ts',
      'src/*/src/__tests__/**/*.test.ts',
    ],
    environment: 'node',
  },
});

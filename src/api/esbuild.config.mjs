import { build } from 'esbuild';

await build({
  entryPoints: ['src/handler.ts'],
  bundle: true,
  outfile: 'dist/handler.js',
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  sourcemap: true,
  minify: false,
  external: ['@aws-sdk/*'],
});

console.log('Build complete: dist/handler.js');

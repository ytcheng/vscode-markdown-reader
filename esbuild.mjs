import { build } from 'esbuild';

await Promise.all([
  build({
    entryPoints: ['src/extension.ts'],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    external: ['vscode'],
    outfile: 'dist/extension.js',
    sourcemap: true
  }),
  build({
    entryPoints: ['src/webview/index.ts'],
    bundle: true,
    platform: 'browser',
    format: 'iife',
    outfile: 'media/reader.js',
    sourcemap: true
  }),
  build({
    entryPoints: ['test/visual/generate.ts'],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outfile: 'dist/test/visual/generate.js',
    sourcemap: true
  })
]);

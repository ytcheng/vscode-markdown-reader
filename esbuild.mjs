import { build } from 'esbuild';
import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';

await mkdir('media/katex', { recursive: true });
await cp('node_modules/katex/dist/katex.min.css', 'media/katex/katex.min.css');
await cp('node_modules/katex/dist/fonts', 'media/katex/fonts', { recursive: true });

const bundles = await Promise.all([
  build({
    metafile: true,
    entryPoints: ['src/webview/mermaid-frame.ts'], bundle: true, platform: 'browser', format: 'iife',
    outfile: 'media/mermaid-frame.js', minify: true, sourcemap: true
  }),
  build({
    metafile: true,
    entryPoints: ['src/extension.ts'],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    external: ['vscode'],
    outfile: 'dist/extension.js',
    sourcemap: true
  }),
  build({
    metafile: true,
    entryPoints: ['src/webview/index.ts'],
    bundle: true,
    platform: 'browser',
    format: 'iife',
    outfile: 'media/reader.js',
    sourcemap: true
  }),
  build({
    metafile: true,
    entryPoints: ['test/visual/generate.ts'],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outfile: 'dist/test/visual/generate.js',
    sourcemap: true
  })
]);

// Embed the bootstrap as srcdoc: VS Code cannot navigate nested frames to its
// service-worker resources or opaque data URLs. Send the bundle after loading.
const bootstrap = await build({
  entryPoints: ['src/webview/mermaid-bootstrap.ts'], bundle: true, platform: 'browser',
  format: 'iife', write: false, minify: true
});
const frameScript = bootstrap.outputFiles[0].text;
await writeFile('media/mermaid-frame.html', `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-MERMAID_NONCE'; style-src 'unsafe-inline'; img-src data:; font-src 'none';"></head><body><script nonce="MERMAID_NONCE">${frameScript}</script></body></html>`);


// Ship notices for the actual bundled runtime packages, including diagram dependencies.
const packageRoots = new Set();
for (const bundle of bundles.slice(0, 3)) {
  for (const input of Object.keys(bundle.metafile.inputs)) {
    const parts = input.split('/');
    const index = parts.lastIndexOf('node_modules');
    if (index < 0) continue;
    packageRoots.add(parts.slice(0, index + (parts[index + 1].startsWith('@') ? 3 : 2)).join('/'));
  }
}
const notices = [];
for (const root of [...packageRoots].sort()) {
  const manifest = JSON.parse(await readFile(`${root}/package.json`, 'utf8'));
  const destination = `media/vendor/${manifest.name}`;
  await mkdir(destination, { recursive: true });
  for (const file of await readdir(root)) {
    if (/^(license|licence|notice)([.-]|$)/i.test(file)) await cp(`${root}/${file}`, `${destination}/${file}`, { recursive: true });
  }
  notices.push(`${manifest.name}@${manifest.version}: ${manifest.license ?? 'See package license'}`);
}
await writeFile('media/vendor/BUNDLED_PACKAGES.txt', `${notices.join('\n')}\n`);

await build({
  entryPoints: ['test/support/webviewSupport.ts'], bundle: true, platform: 'node', format: 'cjs',
  outfile: 'dist/test/webviewSupport.cjs'
});

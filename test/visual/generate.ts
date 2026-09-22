import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { MarkdownRenderer } from '../../src/renderer/MarkdownRenderer.js';

async function generate(): Promise<void> {
  const root = path.resolve(__dirname, '../../..');
  const source = await readFile(path.join(root, 'test/fixtures/kitchen-sink.md'), 'utf8');
  const rendered = await new MarkdownRenderer().render(source, 1);
  const output = `<!doctype html><html><head><link rel="stylesheet" href="../../media/reader.css"><style>${rendered.styles ?? ''}</style></head><body class="vscode-light"><article id="document" class="markdown-body">${rendered.html}</article></body></html>`;
  await mkdir(path.join(root, 'test/visual'), { recursive: true });
  // Preserve the committed baseline; only regenerate the current candidate.
  await writeFile(path.join(root, 'test/visual/candidate.html'), output);
}

void generate().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

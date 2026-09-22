import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { MarkdownRenderer } from '../../src/renderer/MarkdownRenderer.js';

async function generate(): Promise<void> {
  const root = path.resolve(__dirname, '../../..');
  const source = await readFile(path.join(root, 'test/fixtures/kitchen-sink.md'), 'utf8');
  const rendered = new MarkdownRenderer().render(source, 1);
  const output = `<article class="markdown-body">${rendered.html}</article>`;
  await mkdir(path.join(root, 'test/visual'), { recursive: true });
  for (const file of ['reference.html', 'candidate.html']) {
    const target = path.join(root, 'test/visual', file);
    const template = await readFile(target, 'utf8');
    await writeFile(target, template.replace('<!-- CONTENT -->', output));
  }
}

void generate().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

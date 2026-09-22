// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { MermaidRenderer } from '../../src/webview/MermaidRenderer.js';

it('renders diagrams as inert SVG images and keeps the source for failures', async () => {
  document.body.innerHTML = '<article><figure data-mermaid><pre><code>graph TD; A --> B</code></pre></figure><figure data-mermaid><pre><code>broken</code></pre></figure></article>';
  const renderer = new MermaidRenderer(async (_id, source) => {
    if (source === 'broken') throw new Error('Parse failed');
    return { svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 417 97"><text>Diagram</text></svg>' };
  });
  await renderer.render(document.querySelector('article')!);
  expect(document.querySelector('img')?.width).toBe(417);
  expect(document.querySelector('img')?.height).toBe(97);
  expect(document.querySelector('img')?.src).toMatch(/^data:image\/svg\+xml/);
  expect(document.querySelector('figure pre')?.hasAttribute('hidden')).toBe(true);
  expect(document.querySelectorAll('figure')[1].textContent).toContain('broken');
  expect(document.querySelector('[role="status"]')?.textContent).toContain('Unable to render Mermaid diagram');
});

it('does not attach stale diagrams after the document is replaced', async () => {
  document.body.innerHTML = '<article><figure data-mermaid><pre><code>graph TD; A --> B</code></pre></figure></article>';
  let resolve!: (value: { svg: string }) => void;
  const render = vi.fn(() => new Promise<{ svg: string }>((done) => { resolve = done; }));
  const renderer = new MermaidRenderer(render);
  const article = document.querySelector('article')!;
  const pending = renderer.render(article);
  await vi.waitFor(() => expect(render).toHaveBeenCalled());
  article.innerHTML = '<p>new</p>';
  resolve({ svg: '<svg></svg>' });
  await pending;
  expect(article.innerHTML).toBe('<p>new</p>');
});

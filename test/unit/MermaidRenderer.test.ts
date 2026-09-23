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

it('rerenders an existing diagram for the current appearance and discards an outdated result', async () => {
  document.body.dataset.readerColor = 'light';
  document.body.innerHTML = '<article><figure data-mermaid><pre><code>graph TD; A --> B</code></pre></figure></article>';
  const finish: Array<(value: { svg: string }) => void> = [];
  const render = vi.fn((_id: string, _source: string, _container: HTMLElement, _theme: string) => new Promise<{ svg: string }>((resolve) => finish.push(resolve)));
  const renderer = new MermaidRenderer(render);
  const article = document.querySelector('article')!;
  const first = renderer.render(article);
  await vi.waitFor(() => expect(render).toHaveBeenCalledTimes(1));
  document.body.dataset.readerColor = 'dark';
  const second = renderer.render(article);
  await vi.waitFor(() => expect(render).toHaveBeenCalledTimes(2));
  expect(render.mock.calls.map((call) => call[3])).toEqual(['default', 'dark']);
  finish[1]({ svg: '<svg viewBox="0 0 40 20"><text>dark</text></svg>' });
  await second;
  finish[0]({ svg: '<svg viewBox="0 0 40 20"><text>light</text></svg>' });
  await first;
  const images = article.querySelectorAll<HTMLImageElement>('img.mermaid-diagram');
  expect(images).toHaveLength(1);
  expect(decodeURIComponent(images[0].src)).toContain('<text>dark</text>');
  expect(images[0].dataset.readerColor).toBe('dark');
});

// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocalDiagramRenderer } from '../../src/webview/LocalDiagramRenderer.js';
import { toSafeSvgDataUri } from '../../src/security/svg.js';

const validSvg = '<svg xmlns="http://www.w3.org/2000/svg"><text>safe</text></svg>';
let renderer: LocalDiagramRenderer | undefined;

afterEach(() => {
  renderer?.dispose();
  renderer = undefined;
  vi.restoreAllMocks();
});

function addFigure(language: 'plantuml' | 'graphviz', source: string): { article: HTMLElement; figure: HTMLElement } {
  const article = document.createElement('article');
  article.innerHTML = `<figure class="local-diagram" data-local-diagram="${language}"><pre><code>${source}</code></pre></figure>`;
  document.body.append(article);
  return { article, figure: article.querySelector('figure')! };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe('LocalDiagramRenderer', () => {
  it('renders a validated SVG image and hides source only after success', async () => {
    document.body.dataset.readerColor = 'dark';
    const { article, figure } = addFigure('graphviz', 'digraph { A -> B }');
    const renderDiagram = vi.fn(async () => validSvg);
    renderer = new LocalDiagramRenderer(document, renderDiagram);

    await renderer.render(article, 1);

    const image = figure.querySelector<HTMLImageElement>('.local-diagram-image')!;
    expect(renderDiagram).toHaveBeenCalledWith(expect.stringMatching(/^reader-local-diagram-\d+$/), 'graphviz', 'digraph { A -> B }', true);
    expect(image.src).toBe(toSafeSvgDataUri(validSvg));
    expect(image.dataset.readerColor).toBe('dark');
    expect(image.classList.contains('reader-image-zoom')).toBe(true);
    expect(image.getAttribute('role')).toBe('button');
    expect(image.tabIndex).toBe(0);
    expect(image.getAttribute('aria-label')).toBe('Open image in zoom viewer: Graphviz diagram');
    expect(figure.querySelector('pre')?.hidden).toBe(true);
    expect(figure.querySelector('.local-diagram-progress')).toBeNull();
  });

  it('keeps source visible and logs a localized status when one renderer fails', async () => {
    document.body.dataset.readerLanguage = 'zh-CN';
    const { article, figure } = addFigure('graphviz', 'broken dot');
    const failure = new Error('syntax error near line 3');
    const renderDiagram = vi.fn(async () => { throw failure; });
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    renderer = new LocalDiagramRenderer(document, renderDiagram);

    await renderer.render(article, 1);

    expect(figure.querySelector('pre')?.hidden).toBe(false);
    expect(figure.querySelector('[role="status"]')?.textContent).toContain('Graphviz');
    expect(figure.querySelector('[role="status"]')?.textContent).toContain('syntax error near line 3');
    expect(log).toHaveBeenCalledWith('Markdown Reader diagram render failed', 'graphviz', failure);
  });

  it('drops a slow response after the article is replaced by a newer revision', async () => {
    const { article: oldArticle, figure: oldFigure } = addFigure('plantuml', '@startuml Alice -> Bob @enduml');
    const oldResult = deferred<string>();
    const newResult = deferred<string>();
    const renderDiagram = vi.fn()
      .mockReturnValueOnce(oldResult.promise)
      .mockReturnValueOnce(newResult.promise);
    renderer = new LocalDiagramRenderer(document, renderDiagram);
    const oldRender = renderer.render(oldArticle, 1);

    const { article: newArticle, figure: newFigure } = addFigure('plantuml', '@startuml Alice -> Carol @enduml');
    oldArticle.remove();
    const newRender = renderer.render(newArticle, 2);
    expect(renderDiagram.mock.calls[0][0]).not.toBe(renderDiagram.mock.calls[1][0]);

    oldResult.resolve(validSvg);
    await oldRender;
    expect(oldFigure.querySelector('.local-diagram-image')).toBeNull();

    newResult.resolve(validSvg);
    await newRender;
    expect(newFigure.querySelector('.local-diagram-image')).not.toBeNull();
  });

  it('renders PlantUML and Graphviz with the current dark mode', async () => {
    document.body.dataset.readerColor = 'dark';
    const article = document.createElement('article');
    article.innerHTML = `
      <figure class="local-diagram" data-local-diagram="plantuml"><pre><code>@startuml A -> B @enduml</code></pre></figure>
      <figure class="local-diagram" data-local-diagram="graphviz"><pre><code>digraph { A -> B }</code></pre></figure>`;
    document.body.append(article);
    const renderDiagram = vi.fn(async () => validSvg);
    renderer = new LocalDiagramRenderer(document, renderDiagram);

    await renderer.render(article, 1);

    expect(renderDiagram).toHaveBeenCalledTimes(2);
    expect(renderDiagram).toHaveBeenCalledWith(expect.stringMatching(/^reader-local-diagram-\d+$/), 'plantuml', '@startuml A -> B @enduml', true);
    expect(renderDiagram).toHaveBeenCalledWith(expect.stringMatching(/^reader-local-diagram-\d+$/), 'graphviz', 'digraph { A -> B }', true);
    expect(article.querySelectorAll('.local-diagram-image')).toHaveLength(2);
  });
});

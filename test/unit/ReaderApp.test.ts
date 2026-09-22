// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReaderApp } from '../../src/webview/ReaderApp.js';

const scrollIntoView = vi.fn();
let currentApp: ReaderApp | undefined;

function renderResult(revision = 1) {
  return {
    revision,
    html: '<h1 id="one">One</h1><h3 id="two">Two</h3><p><a href="#two">jump</a> <a href="https://example.com">external</a></p>',
    headings: [
      { level: 1, text: 'One', slug: 'one', line: 0 },
      { level: 3, text: 'Two', slug: 'two', line: 2 }
    ],
    resources: []
  };
}

function setup() {
  document.body.innerHTML = `
    <div class="reader">
      <nav id="toc" class="toc" aria-label="Table of contents"></nav>
      <div id="toc-resizer" class="toc-resizer" role="separator" aria-label="Resize table of contents" aria-orientation="vertical"></div>
      <div id="toc-drawer-backdrop" hidden></div>
      <aside id="toc-drawer" hidden aria-hidden="true"></aside>
      <main class="document-container">
        <button id="toggle-toc" class="toc-toggle" type="button" aria-label="Toggle table of contents" aria-expanded="true"><span aria-hidden="true">☰</span></button>
        <section id="search-bar" class="search-bar" role="search" hidden>
          <label for="search-input">Find</label>
          <input id="search-input" type="search" aria-controls="document">
          <span id="search-count" aria-live="polite">0 of 0</span>
          <button id="search-previous" type="button" disabled>↑</button>
          <button id="search-next" type="button" disabled>↓</button>
          <button id="search-close" type="button">×</button>
        </section>
        <article id="document" class="markdown-body"></article>
      </main>
    </div>`;
  const postMessage = vi.fn();
  const setState = vi.fn();
  const app = new ReaderApp(document, { postMessage, getState: () => undefined, setState });
  app.start();
  currentApp = app;
  return { app, postMessage, setState };
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: scrollIntoView });
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 });
  Object.defineProperty(document.documentElement, 'scrollHeight', { configurable: true, value: 1_000 });
  Object.defineProperty(document.documentElement, 'clientHeight', { configurable: true, value: 100 });
  document.documentElement.scrollTop = 0;
});

afterEach(() => {
  currentApp?.dispose();
  currentApp = undefined;
});

describe('ReaderApp', () => {
  it('opens search with Ctrl+F and highlights literal case-insensitive matches', () => {
    const { app } = setup();
    app.handleMessage({ type: 'render', result: { ...renderResult(), html: '<p>Alpha alpha <code>ALPHA</code></p>' } });

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', ctrlKey: true, bubbles: true, cancelable: true }));
    const input = document.querySelector('#search-input') as HTMLInputElement;
    input.value = 'alpha';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    expect((document.querySelector('#search-bar') as HTMLElement).hidden).toBe(false);
    expect(document.querySelectorAll('#document mark[data-search-match]')).toHaveLength(3);
    expect(document.querySelector('#search-count')?.textContent).toBe('1 of 3');
  });

  it('opens search with Cmd+F', () => {
    const { app } = setup();
    app.handleMessage({ type: 'render', result: renderResult() });

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', metaKey: true, bubbles: true, cancelable: true }));

    expect((document.querySelector('#search-bar') as HTMLElement).hidden).toBe(false);
  });

  it('wraps between search matches with Enter and Shift+Enter', () => {
    const { app } = setup();
    app.handleMessage({ type: 'render', result: { ...renderResult(), html: '<p>one one</p>' } });
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', ctrlKey: true }));
    const input = document.querySelector('#search-input') as HTMLInputElement;
    input.value = 'one';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(document.querySelector('#search-count')?.textContent).toBe('2 of 2');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true }));
    expect(document.querySelector('#search-count')?.textContent).toBe('1 of 2');
  });

  it('navigates and closes search with find-bar controls', () => {
    const { app } = setup();
    app.handleMessage({ type: 'render', result: { ...renderResult(), html: '<p>one one</p>' } });
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', ctrlKey: true }));
    const input = document.querySelector('#search-input') as HTMLInputElement;
    input.value = 'one';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    (document.querySelector('#search-next') as HTMLButtonElement).click();
    expect(document.querySelector('#search-count')?.textContent).toBe('2 of 2');
    (document.querySelector('#search-previous') as HTMLButtonElement).click();
    expect(document.querySelector('#search-count')?.textContent).toBe('1 of 2');
    (document.querySelector('#search-close') as HTMLButtonElement).click();
    expect((document.querySelector('#search-bar') as HTMLElement).hidden).toBe(true);
  });

  it('closes search with Escape and removes transient marks', () => {
    const { app } = setup();
    app.handleMessage({ type: 'render', result: { ...renderResult(), html: '<p>one</p>' } });
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', ctrlKey: true }));
    const input = document.querySelector('#search-input') as HTMLInputElement;
    input.value = 'one';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect((document.querySelector('#search-bar') as HTMLElement).hidden).toBe(true);
    expect(document.querySelectorAll('#document mark[data-search-match]')).toHaveLength(0);
    expect(document.querySelector('#document')?.textContent).toBe('one');
  });

  it('clears stale search results when a newer render replaces the document', () => {
    const { app } = setup();
    app.handleMessage({ type: 'render', result: { ...renderResult(), html: '<p>one</p>' } });
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', ctrlKey: true }));
    const input = document.querySelector('#search-input') as HTMLInputElement;
    input.value = 'one';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    app.handleMessage({ type: 'render', result: { ...renderResult(2), html: '<p>two</p>' } });

    expect(document.querySelectorAll('#document mark[data-search-match]')).toHaveLength(0);
    expect(document.querySelector('#search-count')?.textContent).toBe('0 of 0');
  });

  it('ignores stale renders and builds a stable TOC for skipped heading levels', () => {
    const { app } = setup();

    app.handleMessage({ type: 'render', result: renderResult(2) });
    app.handleMessage({ type: 'render', result: { ...renderResult(1), html: '<p>stale</p>' } });

    expect(document.querySelector('#document')?.innerHTML).not.toContain('stale');
    expect(document.querySelectorAll('#toc a')).toHaveLength(2);
    expect(document.querySelector('#toc a[href="#two"]')).not.toBeNull();
    expect(document.querySelector('#toc ol ol a[href="#two"]')).not.toBeNull();
  });

  it('navigates from TOC and in-document anchors while forwarding external links', () => {
    const { app, postMessage } = setup();
    app.handleMessage({ type: 'render', result: renderResult() });

    (document.querySelector('#toc a[href="#two"]') as HTMLAnchorElement).click();
    (document.querySelector('#document a[href="#two"]') as HTMLAnchorElement).click();
    (document.querySelector('#document a[href="https://example.com"]') as HTMLAnchorElement).click();

    expect(scrollIntoView).toHaveBeenCalledTimes(2);
    expect(postMessage).toHaveBeenCalledWith({ type: 'openLink', href: 'https://example.com' });
  });

  it('marks the clicked TOC item as the current location', () => {
    const { app } = setup();
    app.handleMessage({ type: 'render', result: renderResult() });

    (document.querySelector('#toc a[href="#two"]') as HTMLAnchorElement).click();

    expect(document.querySelector('#toc a[href="#two"]')?.getAttribute('aria-current')).toBe('location');
  });

  it('keeps the clicked TOC item current while no heading is intersecting during smooth scroll', () => {
    let notify: ((entries: IntersectionObserverEntry[]) => void) | undefined;
    class TestIntersectionObserver {
      constructor(callback: (entries: IntersectionObserverEntry[]) => void) { notify = callback; }
      observe(): void {}
      disconnect(): void {}
    }
    vi.stubGlobal('IntersectionObserver', TestIntersectionObserver);
    const { app } = setup();
    app.handleMessage({ type: 'render', result: renderResult() });
    (document.querySelector('#toc a[href="#two"]') as HTMLAnchorElement).click();

    notify!([{ target: document.getElementById('one')!, isIntersecting: false, boundingClientRect: { top: -20 } } as unknown as IntersectionObserverEntry]);

    expect(document.querySelector('#toc a[href="#two"]')?.getAttribute('aria-current')).toBe('location');
    vi.unstubAllGlobals();
  });

  it('keeps the clicked TOC item current when the observer reports the previous heading during smooth scroll', () => {
    let notify: ((entries: IntersectionObserverEntry[]) => void) | undefined;
    class TestIntersectionObserver {
      constructor(callback: (entries: IntersectionObserverEntry[]) => void) { notify = callback; }
      observe(): void {}
      disconnect(): void {}
    }
    vi.stubGlobal('IntersectionObserver', TestIntersectionObserver);
    const { app } = setup();
    app.handleMessage({ type: 'render', result: renderResult() });
    (document.querySelector('#toc a[href="#two"]') as HTMLAnchorElement).click();

    notify!([{ target: document.getElementById('one')!, isIntersecting: true, boundingClientRect: { top: 16 } } as unknown as IntersectionObserverEntry]);

    expect(document.querySelector('#toc a[href="#two"]')?.getAttribute('aria-current')).toBe('location');
    vi.unstubAllGlobals();
  });

  it('does not unlock navigation from the observer\'s initial target entry before smooth scroll finishes', () => {
    let notify: ((entries: IntersectionObserverEntry[]) => void) | undefined;
    class TestIntersectionObserver {
      constructor(callback: (entries: IntersectionObserverEntry[]) => void) { notify = callback; }
      observe(): void {}
      disconnect(): void {}
    }
    vi.stubGlobal('IntersectionObserver', TestIntersectionObserver);
    const { app } = setup();
    app.handleMessage({ type: 'render', result: renderResult() });
    (document.querySelector('#toc a[href="#two"]') as HTMLAnchorElement).click();

    notify!([
      { target: document.getElementById('one')!, isIntersecting: true, boundingClientRect: { top: 0 } },
      { target: document.getElementById('two')!, isIntersecting: true, boundingClientRect: { top: 300 } }
    ] as unknown as IntersectionObserverEntry[]);
    notify!([{ target: document.getElementById('one')!, isIntersecting: true, boundingClientRect: { top: 0 } } as unknown as IntersectionObserverEntry]);

    expect(document.querySelector('#toc a[href="#two"]')?.getAttribute('aria-current')).toBe('location');
    vi.unstubAllGlobals();
  });

  it('resumes automatic TOC tracking after the navigation scroll ends', () => {
    let notify: ((entries: IntersectionObserverEntry[]) => void) | undefined;
    class TestIntersectionObserver {
      constructor(callback: (entries: IntersectionObserverEntry[]) => void) { notify = callback; }
      observe(): void {}
      disconnect(): void {}
    }
    vi.stubGlobal('IntersectionObserver', TestIntersectionObserver);
    const { app } = setup();
    app.handleMessage({ type: 'render', result: renderResult() });
    (document.querySelector('#toc a[href="#two"]') as HTMLAnchorElement).click();

    document.dispatchEvent(new Event('scrollend'));
    notify!([{ target: document.getElementById('one')!, isIntersecting: true, boundingClientRect: { top: 0 } } as unknown as IntersectionObserverEntry]);

    expect(document.querySelector('#toc a[href="#one"]')?.getAttribute('aria-current')).toBe('location');
    vi.unstubAllGlobals();
  });

  it('clears pointer focus from a TOC link after navigation', () => {
    const { app } = setup();
    app.handleMessage({ type: 'render', result: renderResult() });

    const tocLink = document.querySelector('#toc a[href="#two"]') as HTMLAnchorElement;
    tocLink.focus();
    tocLink.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));

    expect(document.activeElement).not.toBe(tocLink);
  });

  it('filters TOC depth and applies configured widths', () => {
    const { app } = setup();
    app.handleMessage({ type: 'render', result: renderResult() });
    app.handleMessage({ type: 'setLayout', tocMaxDepth: 2, tocWidth: 280, contentMaxWidth: 760 });

    expect(document.querySelector('#toc a[href="#two"]')).toBeNull();
    expect(document.body.style.getPropertyValue('--reader-toc-width')).toBe('280px');
    expect(document.body.style.getPropertyValue('--reader-content-max-width')).toBe('760px');
  });

  it('updates and persists the TOC width after a wide-screen drag', () => {
    const { app, postMessage } = setup();
    app.handleMessage({ type: 'render', result: renderResult() });

    const resizer = document.querySelector('#toc-resizer') as HTMLElement;
    resizer.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 260 }));
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 330 }));
    window.dispatchEvent(new MouseEvent('pointerup', { clientX: 330 }));

    expect(document.body.style.getPropertyValue('--reader-toc-width')).toBe('330px');
    expect(postMessage).toHaveBeenCalledWith({ type: 'setTocWidth', width: 330 });
  });

  it('restores a matching heading first and clamps fallback scroll state', () => {
    const { app } = setup();
    app.handleMessage({
      type: 'render',
      result: renderResult(),
      restore: { activeSlug: 'two', activeHeadingOffset: 12, scrollTop: 0, tocVisible: true, collapsedSlugs: [] }
    });
    app.handleMessage({
      type: 'render',
      result: { ...renderResult(2), headings: [] },
      restore: { activeSlug: 'missing', scrollTop: 9_999, tocVisible: true, collapsedSlugs: [] }
    });

    expect(scrollIntoView).toHaveBeenCalled();
    expect(document.documentElement.scrollTop).toBe(900);
  });

  it('always exposes nested TOC entries without collapse controls', () => {
    const { app } = setup();
    app.handleMessage({
      type: 'render',
      result: renderResult(),
      restore: { scrollTop: 0, tocVisible: true, collapsedSlugs: ['one'] }
    });

    expect(document.querySelectorAll('#toc button[data-slug]')).toHaveLength(0);
    expect((document.querySelector('#toc ol ol') as HTMLElement).hidden).toBe(false);
  });

  it('closes the narrow drawer with Escape and restores trigger focus', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 600 });
    const { app } = setup();
    app.handleMessage({ type: 'render', result: renderResult() });

    const trigger = document.querySelector('#toggle-toc') as HTMLButtonElement;
    trigger.click();
    expect((document.querySelector('#toc-drawer') as HTMLElement).hidden).toBe(false);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect((document.querySelector('#toc-drawer') as HTMLElement).hidden).toBe(true);
    expect(document.activeElement).toBe(trigger);
  });

  it('decodes navigation anchors and sends ready exactly once', () => {
    const { app, postMessage } = setup();
    app.handleMessage({ type: 'render', result: { ...renderResult(), html: '<h1 id="中文">中文</h1>' } });
    app.handleMessage({ type: 'navigateToAnchor', slug: '%E4%B8%AD%E6%96%87' });

    expect(scrollIntoView).toHaveBeenCalled();
    expect(postMessage).toHaveBeenCalledWith({ type: 'ready' });
  });
});

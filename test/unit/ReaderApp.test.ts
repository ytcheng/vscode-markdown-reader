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
      <header class="reader-toolbar">
        <button id="open-source" type="button">Edit</button>
        <button id="toggle-toc" type="button" aria-expanded="true">Contents</button>
      </header>
      <nav id="toc" class="toc" aria-label="Table of contents"></nav>
      <div id="toc-drawer-backdrop" hidden></div>
      <aside id="toc-drawer" hidden aria-hidden="true"></aside>
      <main class="document-container"><article id="document" class="markdown-body"></article></main>
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

  it('filters TOC depth and applies configured widths', () => {
    const { app } = setup();
    app.handleMessage({ type: 'render', result: renderResult() });
    app.handleMessage({ type: 'setLayout', tocMaxDepth: 2, tocWidth: 280, contentMaxWidth: 760 });

    expect(document.querySelector('#toc a[href="#two"]')).toBeNull();
    expect(document.body.style.getPropertyValue('--reader-toc-width')).toBe('280px');
    expect(document.body.style.getPropertyValue('--reader-content-max-width')).toBe('760px');
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

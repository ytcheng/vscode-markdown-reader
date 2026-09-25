// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReaderApp } from '../../src/webview/ReaderApp.js';

const scrollIntoView = vi.fn();
let currentApp: ReaderApp | undefined;
const originalClipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
const originalExecCommandDescriptor = Object.getOwnPropertyDescriptor(document, 'execCommand');

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
  if (originalClipboardDescriptor) Object.defineProperty(navigator, 'clipboard', originalClipboardDescriptor);
  else Reflect.deleteProperty(navigator, 'clipboard');
  if (originalExecCommandDescriptor) Object.defineProperty(document, 'execCommand', originalExecCommandDescriptor);
  else Reflect.deleteProperty(document, 'execCommand');
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

  it('matches visible text across inline elements as one result', () => {
    const { app } = setup();
    app.handleMessage({ type: 'render', result: { ...renderResult(), html: '<p>hello <strong>world</strong></p>' } });
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', ctrlKey: true }));
    const input = document.querySelector('#search-input') as HTMLInputElement;
    input.value = 'hello world';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    expect(document.querySelectorAll('#document mark[data-search-match]')).toHaveLength(2);
    expect(document.querySelector('#search-count')?.textContent).toBe('1 of 1');
    expect(document.querySelector('#document strong')?.textContent).toBe('world');
  });

  it('does not join visible text from separate block elements into one match', () => {
    const { app } = setup();
    app.handleMessage({ type: 'render', result: { ...renderResult(), html: '<p>foo</p><p>bar</p>' } });
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', ctrlKey: true }));
    const input = document.querySelector('#search-input') as HTMLInputElement;
    input.value = 'foobar';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    expect(document.querySelectorAll('#document mark[data-search-match]')).toHaveLength(0);
    expect(document.querySelector('#search-count')?.textContent).toBe('0 of 0');
  });

  it('keeps Unicode case-folded matches aligned with the original text', () => {
    const { app } = setup();
    app.handleMessage({ type: 'render', result: { ...renderResult(), html: '<p>İx</p>' } });
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', ctrlKey: true }));
    const input = document.querySelector('#search-input') as HTMLInputElement;
    input.value = 'x';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    expect(document.querySelector('#document mark[data-search-match]')?.textContent).toBe('x');
    expect(document.querySelector('#search-count')?.textContent).toBe('1 of 1');
  });

  it('matches Unicode characters whose lowercase form depends on surrounding text', () => {
    const { app } = setup();
    app.handleMessage({ type: 'render', result: { ...renderResult(), html: '<p>ΟΣ</p>' } });
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', ctrlKey: true }));
    const input = document.querySelector('#search-input') as HTMLInputElement;
    input.value = 'ος';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    expect(document.querySelector('#document mark[data-search-match]')?.textContent).toBe('ΟΣ');
    expect(document.querySelector('#search-count')?.textContent).toBe('1 of 1');
  });

  it('closes the narrow TOC drawer before opening search', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 600 });
    const { app } = setup();
    app.handleMessage({ type: 'render', result: renderResult() });
    (document.querySelector('#toggle-toc') as HTMLButtonElement).click();

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', ctrlKey: true }));

    expect((document.querySelector('#toc-drawer') as HTMLElement).hidden).toBe(true);
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

  it('copies fenced code and confirms completion from its copy button', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    const { app } = setup();
    app.handleMessage({
      type: 'render',
      result: { ...renderResult(), html: '<pre class="hljs-pre"><button class="copy-code-btn" type="button" data-copy-code aria-label="Copy code">Copy</button><code class="hljs language-ts">const answer = 42;</code></pre>' }
    });

    (document.querySelector('[data-copy-code]') as HTMLButtonElement).click();
    await Promise.resolve();

    expect(writeText).toHaveBeenCalledWith('const answer = 42;');
    expect(document.querySelector('[data-copy-code]')?.getAttribute('data-copy-state')).toBe('copied');
    expect(document.querySelector('[data-copy-code]')?.getAttribute('aria-label')).toBe('Code copied');
  });

  it('falls back to the copy command when Clipboard API access is rejected', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('Permission denied'));
    const execCommand = vi.fn().mockReturnValue(true);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    Object.defineProperty(document, 'execCommand', { configurable: true, value: execCommand });
    const { app } = setup();
    app.handleMessage({
      type: 'render',
      result: { ...renderResult(), html: '<pre class="hljs-pre"><button class="copy-code-btn" type="button" data-copy-code aria-label="Copy code">Copy</button><code class="hljs language-ts">const answer = 42;</code></pre>' }
    });

    (document.querySelector('[data-copy-code]') as HTMLButtonElement).click();
    await Promise.resolve();
    await Promise.resolve();

    expect(execCommand).toHaveBeenCalledWith('copy');
    expect(document.querySelector('[data-copy-code]')?.getAttribute('data-copy-state')).toBe('copied');
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

  it('restores collapsed nested TOC entries', () => {
    const { app } = setup();
    app.handleMessage({
      type: 'render',
      result: renderResult(),
      restore: { scrollTop: 0, tocVisible: true, collapsedSlugs: ['one'] }
    });

    expect(document.querySelectorAll('#toc button[data-toggle-branch]')).toHaveLength(1);
    expect((document.querySelector('#toc ol ol') as HTMLElement).hidden).toBe(true);
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


describe('V0.2 reading interactions', () => {
  it('does not navigate to source on body double-click', () => {
    const { app, postMessage } = setup();
    app.applyRender({ ...renderResult(), html: '<blockquote data-source-line="2"><p data-source-line="3"><em>text</em><a href="#one">link</a><button>control</button></p></blockquote>' });
    document.querySelector('#document em')!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(postMessage).not.toHaveBeenCalledWith({ type: 'openSource', line: 3 });
  });

  it('adds accessible heading actions that edit the heading and copy its encoded fragment', async () => {
    const { app, postMessage } = setup();
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    app.applyRender({ ...renderResult(), html: '<h2 id="中文" data-source-line="7">中文</h2>', headings: [{ level: 2, text: '中文', slug: '中文', line: 7 }] });
    document.querySelector<HTMLButtonElement>('[data-edit-heading]')?.click();
    expect(postMessage).toHaveBeenLastCalledWith({ type: 'openSource', line: 7 });
    document.querySelector<HTMLButtonElement>('[data-copy-heading]')?.click();
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith('#%E4%B8%AD%E6%96%87'));
    expect(document.querySelector('#toc')?.textContent).toBe('中文');
  });

  it('persists visibility immediately and restores TOC branches across renders', () => {
    const { app, setState } = setup();
    app.applyRender(renderResult(), { tocVisible: false, collapsedSlugs: ['one'], scrollTop: 0 });
    expect(document.querySelector('#toc ol ol')?.hasAttribute('hidden')).toBe(true);
    expect(app.captureViewport().collapsedSlugs).toEqual(['one']);
    app.handleMessage({ type: 'setTocVisible', visible: true });
    expect(setState).toHaveBeenLastCalledWith(expect.objectContaining({ tocVisible: true, collapsedSlugs: ['one'] }));
    document.querySelector<HTMLButtonElement>('[data-toggle-branch]')?.click();
    expect(app.captureViewport().collapsedSlugs).toEqual([]);
  });
});


it('keeps keyboard focus in the narrow TOC drawer after toggling a branch', () => {
  const { app } = setup();
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 600 });
  app.applyRender(renderResult());
  document.querySelector<HTMLButtonElement>('#toggle-toc')!.click();
  const button = document.querySelector<HTMLButtonElement>('#toc-drawer [data-toggle-branch]')!;
  button.focus();
  button.click();
  expect(document.activeElement).toBe(document.querySelector('#toc-drawer [data-toggle-branch]'));
});


it('rejects render messages sent by a child iframe', () => {
  const { app } = setup();
  app.applyRender(renderResult());
  const frame = document.createElement('iframe');
  document.body.append(frame);
  window.dispatchEvent(new MessageEvent('message', {
    source: frame.contentWindow,
    data: { type: 'render', result: { ...renderResult(999), html: '<p>forged</p>' } }
  }));
  expect(document.querySelector('#document')?.textContent).not.toContain('forged');
});


it('keeps heading actions and anchors scoped to the article when slugs match shell IDs', () => {
  const { app, postMessage } = setup();
  app.applyRender({ ...renderResult(), html: '<h2 id="document" data-source-line="8">Document</h2>', headings: [{ level: 2, text: 'Document', slug: 'document', line: 8 }] });
  const heading = document.querySelector('#document h2')!;
  heading.querySelector<HTMLButtonElement>('[data-edit-heading]')?.click();
  expect(postMessage).toHaveBeenLastCalledWith({ type: 'openSource', line: 8 });
  app.handleMessage({ type: 'navigateToAnchor', slug: 'document' });
  expect(scrollIntoView.mock.instances.at(-1)).toBe(heading);
});


it('accepts same-origin VS Code host messages after VS Code masks window.parent', () => {
  setup();
  // The VS Code bootstrap replaces window.parent with window. The real host
  // WindowProxy still appears as event.source and does not equal either one.
  expect(window.parent).toBe(window);
  const hostWindow = {} as Window;
  window.dispatchEvent(new MessageEvent('message', {
    source: hostWindow,
    origin: window.location.origin,
    data: { type: 'render', result: renderResult() }
  }));
  expect(document.querySelector('#document h1')?.textContent).toContain('One');
});

it('rejects cross-origin messages and same-origin messages from embedded frames', () => {
  const { app } = setup();
  app.applyRender(renderResult());
  window.dispatchEvent(new MessageEvent('message', {
    source: {} as Window,
    origin: 'https://untrusted.example',
    data: { type: 'render', result: { ...renderResult(998), html: '<p>forged</p>' } }
  }));
  const frame = document.createElement('iframe');
  document.body.append(frame);
  window.dispatchEvent(new MessageEvent('message', {
    source: frame.contentWindow,
    origin: window.location.origin,
    data: { type: 'render', result: { ...renderResult(999), html: '<p>forged</p>' } }
  }));
  expect(document.querySelector('#document')?.textContent).not.toContain('forged');
});

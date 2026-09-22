import type { HeadingItem, RenderResult } from '../renderer/types.js';
import type { ExtensionToWebviewMessage, ViewportState, WebviewToExtensionMessage } from './messages.js';

interface TocNode {
  heading: HeadingItem;
  children: TocNode[];
}

export interface VsCodeApi {
  postMessage(message: WebviewToExtensionMessage): void;
  getState(): ViewportState | undefined;
  setState(state: ViewportState): void;
}

export class ReaderApp {
  #revision = -1;
  #activeSlug: string | undefined;
  #tocVisible = true;
  #tocMaxDepth = 3;
  #headings: HeadingItem[] = [];
  #observer: IntersectionObserver | undefined;
  #visibleHeadings = new Map<string, number>();
  #scrollFrame: number | undefined;
  #drawerOpen = false;
  #started = false;

  constructor(
    private readonly document: Document,
    private readonly api: VsCodeApi
  ) {}

  start(): void {
    if (this.#started) return;
    this.#started = true;
    this.window.addEventListener('message', this.#onMessage);
    this.document.addEventListener('click', this.#onClick);
    this.window.addEventListener('keydown', this.#onKeyDown);
    this.window.addEventListener('scroll', this.#onScroll, { passive: true });
    this.api.postMessage({ type: 'ready' });
  }

  handleMessage(message: ExtensionToWebviewMessage): void {
    switch (message.type) {
      case 'render':
        this.applyRender(message.result, message.restore);
        return;
      case 'setTocVisible':
        this.#tocVisible = message.visible;
        this.#applyTocVisibility();
        return;
      case 'setLayout':
        this.#tocMaxDepth = Math.max(1, Math.min(6, message.tocMaxDepth));
        this.document.body.style.setProperty('--reader-toc-width', `${Math.max(220, Math.min(320, message.tocWidth))}px`);
        this.document.body.style.setProperty('--reader-content-max-width', `${Math.max(560, Math.min(1600, message.contentMaxWidth))}px`);
        this.#renderToc();
        return;
      case 'navigateToAnchor':
        this.#navigateTo(this.#decodeSlug(message.slug));
        return;
      case 'setColorMode':
        this.#setColorMode(message.mode);
    }
  }

  applyRender(result: RenderResult, restore?: ViewportState): void {
    if (result.revision <= this.#revision) return;
    this.#revision = result.revision;
    this.#headings = result.headings;
    this.article.innerHTML = result.html;

    if (restore) {
      this.#tocVisible = restore.tocVisible;
    }

    this.#renderToc();
    this.#observeHeadings();
    this.#applyTocVisibility();
    this.#restoreViewport(restore);
  }

  captureViewport(): ViewportState {
    const activeHeading = this.#activeSlug ? this.document.getElementById(this.#activeSlug) : undefined;
    return {
      activeSlug: this.#activeSlug,
      activeHeadingOffset: activeHeading?.getBoundingClientRect().top,
      scrollTop: this.#scrollTop(),
      tocVisible: this.#tocVisible,
      collapsedSlugs: []
    };
  }

  dispose(): void {
    this.window.removeEventListener('message', this.#onMessage);
    this.document.removeEventListener('click', this.#onClick);
    this.window.removeEventListener('keydown', this.#onKeyDown);
    this.window.removeEventListener('scroll', this.#onScroll);
    this.#observer?.disconnect();
    if (this.#scrollFrame !== undefined) this.window.cancelAnimationFrame(this.#scrollFrame);
    this.#started = false;
  }

  private get window(): Window {
    const view = this.document.defaultView;
    if (!view) throw new Error('ReaderApp requires a document with a window');
    return view;
  }

  private get article(): HTMLElement {
    return this.#requiredElement<HTMLElement>('document');
  }

  #requiredElement<T extends HTMLElement>(id: string): T {
    const element = this.document.getElementById(id);
    if (!element) throw new Error(`ReaderApp is missing #${id}`);
    return element as T;
  }

  #onMessage = (event: MessageEvent<ExtensionToWebviewMessage>): void => {
    this.handleMessage(event.data);
  };

  #onClick = (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    if (target.closest('#open-source')) {
      this.api.postMessage({ type: 'openSource' });
      return;
    }

    if (target.closest('#toggle-toc')) {
      if (this.#isNarrow()) {
        this.#drawerOpen ? this.#closeDrawer() : this.#openDrawer();
      } else {
        this.api.postMessage({ type: 'toggleToc' });
      }
      return;
    }

    if (target.closest('#toc-drawer-backdrop')) {
      this.#closeDrawer();
      return;
    }

    const anchor = target.closest<HTMLAnchorElement>('a[href]');
    if (!anchor) return;
    const href = anchor.getAttribute('href') ?? '';
    if (href.startsWith('#')) {
      event.preventDefault();
      this.#navigateTo(this.#decodeSlug(href.slice(1)));
      if (this.#drawerOpen) this.#closeDrawer();
    } else {
      event.preventDefault();
      this.api.postMessage({ type: 'openLink', href });
    }
  };

  #onKeyDown = (event: KeyboardEvent): void => {
    if (!this.#drawerOpen) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      this.#closeDrawer();
      return;
    }
    if (event.key !== 'Tab') return;

    const focusable = [...this.drawer.querySelectorAll<HTMLElement>('a[href], button:not([disabled])')];
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable.at(-1)!;
    if (event.shiftKey && this.document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && this.document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  #onScroll = (): void => {
    if (this.#scrollFrame !== undefined) return;
    if (typeof this.window.requestAnimationFrame !== 'function') {
      this.#saveViewport();
      return;
    }
    this.#scrollFrame = this.window.requestAnimationFrame(() => {
      this.#scrollFrame = undefined;
      this.#saveViewport();
    });
  };

  #renderToc(): void {
    const headings = this.#headings.filter((heading) => heading.level <= this.#tocMaxDepth);
    const tree = this.#buildTree(headings);
    this.#renderTocInto(this.toc, tree);
    this.#renderTocInto(this.drawer, tree);
    this.#setActiveSlug(this.#activeSlug);
  }

  #buildTree(headings: HeadingItem[]): TocNode[] {
    const root: TocNode[] = [];
    const stack: Array<{ level: number; children: TocNode[] }> = [{ level: 0, children: root }];

    for (const heading of headings) {
      while (stack.length > 1 && stack.at(-1)!.level >= heading.level) stack.pop();
      const node: TocNode = { heading, children: [] };
      stack.at(-1)!.children.push(node);
      stack.push({ level: heading.level, children: node.children });
    }

    return root;
  }

  #renderTocInto(container: HTMLElement, tree: TocNode[]): void {
    container.replaceChildren();
    if (tree.length === 0) return;
    container.append(this.#createTocList(tree));
  }

  #createTocList(nodes: TocNode[]): HTMLOListElement {
    const list = this.document.createElement('ol');
    for (const node of nodes) {
      const item = this.document.createElement('li');
      const link = this.document.createElement('a');
      link.href = `#${node.heading.slug}`;
      link.dataset.readerSlug = node.heading.slug;
      link.dataset.headingLevel = String(node.heading.level);
      link.textContent = node.heading.text || 'Untitled section';
      item.append(link);

      if (node.children.length > 0) {
        const childList = this.#createTocList(node.children);
        item.append(childList);
      }
      list.append(item);
    }
    return list;
  }

  #observeHeadings(): void {
    this.#observer?.disconnect();
    this.#visibleHeadings.clear();
    if (typeof IntersectionObserver !== 'function') return;

    const observer = new IntersectionObserver((entries: IntersectionObserverEntry[]) => {
      for (const entry of entries) {
        const slug = (entry.target as HTMLElement).id;
        if (entry.isIntersecting) this.#visibleHeadings.set(slug, entry.boundingClientRect.top);
        else this.#visibleHeadings.delete(slug);
      }
      const candidates = [...this.#visibleHeadings.entries()];
      const below = candidates.filter(([, top]) => top >= 0).sort((left, right) => left[1] - right[1])[0];
      const above = candidates.filter(([, top]) => top < 0).sort((left, right) => right[1] - left[1])[0];
      this.#setActiveSlug((below ?? above)?.[0]);
    });
    this.#observer = observer;

    for (const heading of this.#headings) {
      const element = this.document.getElementById(heading.slug);
      if (element) observer.observe(element);
    }
  }

  #restoreViewport(restore: ViewportState | undefined): void {
    if (!restore) return;
    this.#setActiveSlug(restore.activeSlug);
    if (restore.activeSlug && this.#scrollToHeading(restore.activeSlug, restore.activeHeadingOffset)) return;
    this.#setScrollTop(restore.scrollTop);
  }

  #navigateTo(slug: string): void {
    if (!this.#scrollToHeading(slug)) return;
    this.#setActiveSlug(slug);
    this.#saveViewport();
  }

  #scrollToHeading(slug: string, offset = 0): boolean {
    const heading = this.document.getElementById(slug);
    if (!heading) return false;
    const reducedMotion = this.window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    heading.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
    if (offset !== 0) this.#setScrollTop(this.#scrollTop() + offset);
    return true;
  }

  #setActiveSlug(slug: string | undefined): void {
    this.#activeSlug = slug;
    for (const link of this.document.querySelectorAll<HTMLAnchorElement>('a[data-reader-slug]')) {
      if (slug && link.dataset.readerSlug === slug) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    }
  }

  #applyTocVisibility(): void {
    this.toc.hidden = !this.#tocVisible;
    this.toggleTocButton.setAttribute('aria-expanded', String(this.#tocVisible));
  }

  #openDrawer(): void {
    this.#drawerOpen = true;
    this.drawer.hidden = false;
    this.drawer.setAttribute('aria-hidden', 'false');
    this.backdrop.hidden = false;
    this.article.setAttribute('aria-hidden', 'true');
    this.drawer.querySelector<HTMLElement>('a[href], button:not([disabled])')?.focus();
  }

  #closeDrawer(): void {
    if (!this.#drawerOpen) return;
    this.#drawerOpen = false;
    this.drawer.hidden = true;
    this.drawer.setAttribute('aria-hidden', 'true');
    this.backdrop.hidden = true;
    this.article.removeAttribute('aria-hidden');
    this.toggleTocButton.focus();
  }

  #setColorMode(mode: 'light' | 'dark' | 'high-contrast'): void {
    this.document.body.classList.remove('vscode-light', 'vscode-dark', 'vscode-high-contrast', 'vscode-high-contrast-light');
    this.document.body.classList.add(mode === 'high-contrast' ? 'vscode-high-contrast' : `vscode-${mode}`);
  }

  #saveViewport(): void {
    this.api.setState(this.captureViewport());
    this.api.postMessage({ type: 'viewportChanged', state: this.captureViewport() });
  }

  #scrollTop(): number {
    return this.document.scrollingElement?.scrollTop ?? this.document.documentElement.scrollTop;
  }

  #setScrollTop(value: number): void {
    const element = this.document.scrollingElement ?? this.document.documentElement;
    const max = Math.max(0, element.scrollHeight - element.clientHeight);
    element.scrollTop = Math.max(0, Math.min(max, value));
  }

  #decodeSlug(slug: string): string {
    try {
      return decodeURIComponent(slug);
    } catch {
      return slug;
    }
  }

  #isNarrow(): boolean {
    return this.window.innerWidth < 800;
  }

  private get toc(): HTMLElement {
    return this.#requiredElement('toc');
  }

  private get drawer(): HTMLElement {
    return this.#requiredElement('toc-drawer');
  }

  private get backdrop(): HTMLElement {
    return this.#requiredElement('toc-drawer-backdrop');
  }

  private get toggleTocButton(): HTMLButtonElement {
    return this.#requiredElement<HTMLButtonElement>('toggle-toc');
  }
}

import { ReaderControls } from './ReaderControls.js';
import { MermaidRenderer } from './MermaidRenderer.js';
import type { HeadingItem, RenderResult } from '../renderer/types.js';
import type { ExtensionToWebviewMessage, ViewportState, WebviewToExtensionMessage } from './messages.js';
import { translate, type ReaderUiLanguage } from './localization.js';

interface TocNode {
  heading: HeadingItem;
  children: TocNode[];
}

interface SearchMatch {
  elements: HTMLElement[];
}

export interface VsCodeApi {
  postMessage(message: WebviewToExtensionMessage): void;
  getState(): ViewportState | undefined;
  setState(state: ViewportState): void;
}

export class ReaderApp {
  #revision = -1;
  readonly #controls: ReaderControls;
  readonly #mermaid = new MermaidRenderer();
  #activeSlug: string | undefined;
  #tocVisible = true;
  #collapsedSlugs = new Set<string>();
  #tocMaxDepth = 3;
  #tocWidth = 260;
  #headings: HeadingItem[] = [];
  readonly #headingElements = new Map<string, HTMLElement>();
  #observer: IntersectionObserver | undefined;
  #visibleHeadings = new Map<string, number>();
  #pendingNavigationSlug: string | undefined;
  #scrollFrame: number | undefined;
  #drawerOpen = false;
  #resizingToc = false;
  #started = false;
  #searchOpen = false;
  #searchMatches: SearchMatch[] = [];
  #activeSearchMatchIndex = -1;
  #language: ReaderUiLanguage = 'en';

  constructor(
    private readonly document: Document,
    private readonly api: VsCodeApi
  ) { this.#controls = new ReaderControls(document, (message) => api.postMessage(message), () => { void this.#mermaid.render(this.article); }); }

  start(): void {
    if (this.#started) return;
    this.#started = true;
    this.#controls.start();
    this.#syncLanguage();
    this.window.addEventListener('message', this.#onMessage);
    this.document.addEventListener('click', this.#onClick);
    this.document.addEventListener('dblclick', this.#onDoubleClick);
    this.document.addEventListener('scrollend', this.#onScrollEnd);
    this.window.addEventListener('keydown', this.#onKeyDown);
    this.window.addEventListener('scroll', this.#onScroll, { passive: true });
    this.searchInput.addEventListener('input', this.#onSearchInput);
    this.searchInput.addEventListener('keydown', this.#onSearchInputKeyDown);
    this.searchPreviousButton.addEventListener('click', this.#onSearchPrevious);
    this.searchNextButton.addEventListener('click', this.#onSearchNext);
    this.searchCloseButton.addEventListener('click', this.#onSearchClose);
    this.resizer.addEventListener('pointerdown', this.#onResizerPointerDown);
    this.window.addEventListener('pointermove', this.#onResizerPointerMove);
    this.window.addEventListener('pointerup', this.#onResizerPointerUp);
    this.api.postMessage({ type: 'ready' });
  }

  handleMessage(message: ExtensionToWebviewMessage): void {
    switch (message.type) {
      case 'setReaderSettings': this.#controls.apply(message.settings); this.#syncLanguage(); return;
      case 'settingsAcknowledged': this.#controls.acknowledge(message.requestId, message.settings); this.#syncLanguage(); return;
      case 'showSettings': this.#controls.openSettings(); return;
      case 'requestExport': this.#controls.requestExport(message.action); return;
      case 'render':
        this.applyRender(message.result, message.restore);
        return;
      case 'setTocVisible':
        this.#tocVisible = message.visible;
        this.#applyTocVisibility();
        this.#saveViewport();
        return;
      case 'setLayout':
        this.#tocMaxDepth = Math.max(1, Math.min(6, message.tocMaxDepth));
        this.#setTocWidth(message.tocWidth);
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
    restore ??= this.#revision < 0 ? this.api.getState() : this.captureViewport();
    this.#clearSearchMatches();
    this.#updateSearchControls();
    this.#revision = result.revision;
    this.#controls.setRevision(result.revision);
    this.#controls.setLargeFile(result.largeFile ?? false);
    this.#headings = result.headings;
    this.article.innerHTML = result.html;
    this.#headingElements.clear();
    for (const heading of this.article.querySelectorAll<HTMLElement>('h1[id], h2[id], h3[id], h4[id], h5[id], h6[id]')) {
      this.#headingElements.set(heading.id, heading);
    }
    const styles = this.document.getElementById('render-styles');
    if (styles) styles.textContent = result.styles ?? '';
    this.#addHeadingActions();
    this.#syncLanguage();

    if (restore) {
      this.#tocVisible = restore.tocVisible;
      this.#collapsedSlugs = new Set(restore.collapsedSlugs.filter((slug) => this.#headings.some((heading) => heading.slug === slug)));
    }

    this.#renderToc();
    this.#observeHeadings();
    this.#applyTocVisibility();
    this.#restoreViewport(restore);
    const revision = this.#revision;
    const scrollTop = this.#scrollTop();
    void this.#mermaid.render(this.article).then(() => {
      if (revision !== this.#revision || this.#scrollTop() !== scrollTop) return;
      this.#restoreViewport(restore);
    });
  }

  captureViewport(): ViewportState {
    const activeHeading = this.#activeSlug ? this.#headingElements.get(this.#activeSlug) : undefined;
    return {
      activeSlug: this.#activeSlug,
      activeHeadingOffset: activeHeading?.getBoundingClientRect().top,
      scrollTop: this.#scrollTop(),
      tocVisible: this.#tocVisible,
      collapsedSlugs: [...this.#collapsedSlugs]
    };
  }

  dispose(): void {
    this.#controls.dispose();
    this.window.removeEventListener('message', this.#onMessage);
    this.document.removeEventListener('click', this.#onClick);
    this.document.removeEventListener('dblclick', this.#onDoubleClick);
    this.document.removeEventListener('scrollend', this.#onScrollEnd);
    this.window.removeEventListener('keydown', this.#onKeyDown);
    this.window.removeEventListener('scroll', this.#onScroll);
    this.searchInput.removeEventListener('input', this.#onSearchInput);
    this.searchInput.removeEventListener('keydown', this.#onSearchInputKeyDown);
    this.searchPreviousButton.removeEventListener('click', this.#onSearchPrevious);
    this.searchNextButton.removeEventListener('click', this.#onSearchNext);
    this.searchCloseButton.removeEventListener('click', this.#onSearchClose);
    this.resizer.removeEventListener('pointerdown', this.#onResizerPointerDown);
    this.window.removeEventListener('pointermove', this.#onResizerPointerMove);
    this.window.removeEventListener('pointerup', this.#onResizerPointerUp);
    this.#observer?.disconnect();
    this.#mermaid.dispose();
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
    // VS Code masks window.parent as window, but its messages still carry the
    // real host WindowProxy. Authenticate the host origin instead, and reject
    // embedded frame senders (including same-origin frames) explicitly.
    if (event.origin !== this.window.location.origin) return;
    if ([...this.document.querySelectorAll('iframe')].some((frame) => frame.contentWindow === event.source)) return;
    this.handleMessage(event.data);
  };

  #addHeadingActions(): void {
    for (const heading of this.#headings) {
      const element = this.#headingElements.get(heading.slug);
      if (!element || !this.article.contains(element)) continue;
      const actions = this.document.createElement('span');
      actions.className = 'heading-actions';
      for (const [attribute, label, text] of [
        ['data-edit-heading', translate(this.#language, 'editHeading'), ''],
        ['data-copy-heading', translate(this.#language, 'copyHeadingLink'), '#']
      ]) {
        const button = this.document.createElement('button');
        button.type = 'button';
        button.lang = this.#language;
        button.setAttribute(attribute, heading.slug);
        button.setAttribute('aria-label', label);
        button.title = label;
        button.textContent = text;
        if (attribute === 'data-edit-heading') {
          button.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M15 5l4 4M4 20l4-1L20 7a2.83 2.83 0 0 0-4-4L4 15z"/></svg>';
        }
        actions.append(button);
      }
      element.append(actions);
    }
  }

  #onDoubleClick = (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof Element) || !this.article.contains(target)) return;
    if (target.closest('a, button, input, textarea, select, [contenteditable]')) return;
    const block = target.closest<HTMLElement>('[data-source-line]');
    if (!block || !this.article.contains(block)) return;
    const line = Number(block.dataset.sourceLine);
    if (Number.isSafeInteger(line) && line >= 0) this.api.postMessage({ type: 'openSource', line });
  };

  #onClick = (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const branch = target.closest<HTMLButtonElement>('[data-toggle-branch]');
    if (branch) {
      const slug = branch.dataset.toggleBranch!;
      const container = target.closest('#toc-drawer') ? this.drawer : this.toc;
      if (this.#collapsedSlugs.has(slug)) this.#collapsedSlugs.delete(slug);
      else if (this.#collapsedSlugs.size < 200) this.#collapsedSlugs.add(slug);
      this.#renderToc();
      this.#saveViewport();
      [...container.querySelectorAll<HTMLButtonElement>('[data-toggle-branch]')].find((button) => button.dataset.toggleBranch === slug)?.focus();
      return;
    }
    const edit = target.closest<HTMLButtonElement>('[data-edit-heading]');
    if (edit) {
      const heading = this.#headings.find((item) => item.slug === edit.dataset.editHeading);
      if (heading) this.api.postMessage({ type: 'openSource', line: heading.line });
      return;
    }
    const copyHeading = target.closest<HTMLButtonElement>('[data-copy-heading]');
    if (copyHeading) {
      void this.#copyCode(copyHeading, `#${encodeURIComponent(copyHeading.dataset.copyHeading!)}`);
      return;
    }

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

    const copyButton = target.closest<HTMLButtonElement>('button[data-copy-code]');
    if (copyButton) {
      const code = copyButton.closest('pre')?.querySelector('code')?.textContent;
      if (code !== undefined) void this.#copyCode(copyButton, code);
      return;
    }

    const anchor = target.closest<HTMLAnchorElement>('a[href]');
    if (!anchor) return;
    const href = anchor.getAttribute('href') ?? '';
    if (href.startsWith('#')) {
      event.preventDefault();
      this.#navigateTo(this.#decodeSlug(href.slice(1)));
      if (event.detail > 0) anchor.blur();
      if (this.#drawerOpen) this.#closeDrawer();
    } else {
      event.preventDefault();
      this.api.postMessage({ type: 'openLink', href });
    }
  };

  #onKeyDown = (event: KeyboardEvent): void => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
      event.preventDefault();
      this.#openSearch();
      return;
    }

    if (this.#searchOpen && event.key === 'Escape') {
      event.preventDefault();
      this.#closeSearch();
      return;
    }

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

  #onSearchInput = (): void => {
    this.#updateSearch(this.searchInput.value);
  };

  #onSearchInputKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.#closeSearch();
      return;
    }
    if (event.key !== 'Enter') return;
    event.preventDefault();
    this.#selectSearchMatch(this.#activeSearchMatchIndex + (event.shiftKey ? -1 : 1));
  };

  #onSearchPrevious = (): void => this.#selectSearchMatch(this.#activeSearchMatchIndex - 1);

  #onSearchNext = (): void => this.#selectSearchMatch(this.#activeSearchMatchIndex + 1);

  #onSearchClose = (): void => this.#closeSearch();

  async #copyCode(button: HTMLButtonElement, code: string): Promise<void> {
    try {
      if (this.window.navigator.clipboard?.writeText) {
        try {
          await this.window.navigator.clipboard.writeText(code);
        } catch {
          if (!this.#copyWithCommand(code)) throw new Error('Copy command failed');
        }
      } else {
        if (!this.#copyWithCommand(code)) throw new Error('Copy command failed');
      }
      button.dataset.copyState = 'copied';
      button.setAttribute('aria-label', translate(this.#language, 'codeCopied'));
      this.window.setTimeout(() => {
        delete button.dataset.copyState;
        button.setAttribute('aria-label', this.#copyCodeLabel(button));
      }, 1_500);
    } catch {
      button.dataset.copyState = 'failed';
      button.setAttribute('aria-label', translate(this.#language, 'copyFailed'));
      this.window.setTimeout(() => {
        delete button.dataset.copyState;
        button.setAttribute('aria-label', this.#copyCodeLabel(button));
      }, 1_500);
    }
  }

  #copyWithCommand(code: string): boolean {
    const textarea = this.document.createElement('textarea');
    textarea.value = code;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    this.document.body.append(textarea);
    textarea.select();
    try {
      return this.document.execCommand('copy');
    } finally {
      textarea.remove();
    }
  }

  #onResizerPointerDown = (event: PointerEvent): void => {
    if (this.#isNarrow()) return;
    event.preventDefault();
    this.#resizingToc = true;
    this.#setTocWidth(event.clientX);
  };

  #onResizerPointerMove = (event: PointerEvent): void => {
    if (!this.#resizingToc) return;
    this.#setTocWidth(event.clientX);
  };

  #onResizerPointerUp = (event: PointerEvent): void => {
    if (!this.#resizingToc) return;
    this.#setTocWidth(event.clientX);
    this.#resizingToc = false;
    this.api.postMessage({ type: 'setTocWidth', width: this.#tocWidth });
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

  #onScrollEnd = (): void => {
    this.#pendingNavigationSlug = undefined;
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
      link.lang = 'en';
      link.href = `#${node.heading.slug}`;
      link.dataset.readerSlug = node.heading.slug;
      link.dataset.headingLevel = String(node.heading.level);
      const section = node.heading.text || translate(this.#language, 'untitledSection');
      link.textContent = section;
      item.append(link);

      if (node.children.length > 0) {
        const childList = this.#createTocList(node.children);
        const toggle = this.document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'toc-branch-toggle';
        toggle.lang = this.#language;
        toggle.dataset.toggleBranch = node.heading.slug;
        const collapsed = this.#collapsedSlugs.has(node.heading.slug);
        toggle.setAttribute('aria-label', translate(this.#language, collapsed ? 'expandSection' : 'collapseSection', { section }));
        toggle.setAttribute('aria-expanded', String(!collapsed));
        toggle.textContent = collapsed ? '▸' : '▾';
        childList.hidden = collapsed;
        item.prepend(toggle);
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
      if (this.#pendingNavigationSlug) {
        this.#setActiveSlug(this.#pendingNavigationSlug);
        return;
      }
      const candidates = [...this.#visibleHeadings.entries()];
      const below = candidates.filter(([, top]) => top >= 0).sort((left, right) => left[1] - right[1])[0];
      const above = candidates.filter(([, top]) => top < 0).sort((left, right) => right[1] - left[1])[0];
      const activeSlug = (below ?? above)?.[0];
      if (activeSlug) this.#setActiveSlug(activeSlug);
    });
    this.#observer = observer;

    for (const heading of this.#headings) {
      const element = this.#headingElements.get(heading.slug);
      if (element) observer.observe(element);
    }
  }

  #restoreViewport(restore: ViewportState | undefined): void {
    if (!restore) return;
    this.#setActiveSlug(restore.activeSlug);
    if (restore.activeSlug && this.#scrollToHeading(restore.activeSlug, restore.activeHeadingOffset)) return;
    this.#setScrollTop(restore.scrollTop);
  }

  #openSearch(): void {
    if (this.#drawerOpen) this.#closeDrawer();
    this.#searchOpen = true;
    this.searchBar.hidden = false;
    this.searchInput.focus();
    this.searchInput.select();
  }

  #closeSearch(): void {
    this.#searchOpen = false;
    this.searchBar.hidden = true;
    this.searchInput.value = '';
    this.#clearSearchMatches();
    this.#updateSearchControls();
    this.article.focus();
  }

  #updateSearch(query: string): void {
    this.#clearSearchMatches();
    const normalizedQuery = this.#caseFold(query).text;
    if (normalizedQuery.length === 0) {
      this.#updateSearchControls();
      return;
    }

    const textNodes: Text[] = [];
    const walker = this.document.createTreeWalker(this.article, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => node.textContent && !node.parentElement?.closest('mark[data-search-match], button, .katex, [data-mermaid]')
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT
    });
    for (let node = walker.nextNode(); node; node = walker.nextNode()) textNodes.push(node as Text);

    const nodeRanges: Array<{ node: Text; start: number; end: number }> = [];
    let documentText = '';
    for (const node of textNodes) {
      if (nodeRanges.length > 0 && this.#searchBlockContainer(nodeRanges.at(-1)!.node) !== this.#searchBlockContainer(node)) {
        documentText += '\n';
      }
      const start = documentText.length;
      documentText += node.textContent ?? '';
      nodeRanges.push({ node, start, end: documentText.length });
    }

    const foldedDocument = this.#caseFold(documentText);
    const matches: Array<{ start: number; end: number; elements: HTMLElement[] }> = [];
    for (let foldedStart = foldedDocument.text.indexOf(normalizedQuery); foldedStart !== -1;) {
      const foldedEnd = foldedStart + normalizedQuery.length - 1;
      matches.push({
        start: foldedDocument.starts[foldedStart],
        end: foldedDocument.ends[foldedEnd],
        elements: []
      });
      foldedStart = foldedDocument.text.indexOf(normalizedQuery, foldedStart + normalizedQuery.length);
    }

    for (const { node, start: nodeStart, end: nodeEnd } of nodeRanges) {
      const text = node.textContent ?? '';
      const segments = matches.filter((match) => match.start < nodeEnd && match.end > nodeStart);
      if (segments.length === 0) continue;

      const fragment = this.document.createDocumentFragment();
      let textStart = 0;
      for (const searchMatch of segments) {
        const matchStart = Math.max(searchMatch.start, nodeStart) - nodeStart;
        const matchEnd = Math.min(searchMatch.end, nodeEnd) - nodeStart;
        if (matchStart > textStart) fragment.append(this.document.createTextNode(text.slice(textStart, matchStart)));
        const mark = this.document.createElement('mark');
        mark.className = 'search-match';
        mark.dataset.searchMatch = '';
        mark.textContent = text.slice(matchStart, matchEnd);
        fragment.append(mark);
        searchMatch.elements.push(mark);
        textStart = matchEnd;
      }
      if (textStart < text.length) fragment.append(this.document.createTextNode(text.slice(textStart)));
      node.replaceWith(fragment);
    }

    this.#searchMatches = matches;
    this.#selectSearchMatch(0);
  }

  #clearSearchMatches(): void {
    for (const { elements } of this.#searchMatches) {
      for (const match of elements) match.replaceWith(this.document.createTextNode(match.textContent ?? ''));
    }
    this.article.normalize();
    this.#searchMatches = [];
    this.#activeSearchMatchIndex = -1;
  }

  #selectSearchMatch(index: number): void {
    if (this.#searchMatches.length === 0) return this.#updateSearchControls();
    this.#activeSearchMatchIndex = (index + this.#searchMatches.length) % this.#searchMatches.length;
    for (const [position, match] of this.#searchMatches.entries()) {
      for (const element of match.elements) element.toggleAttribute('data-search-active', position === this.#activeSearchMatchIndex);
    }
    this.#updateSearchControls();
    this.#searchMatches[this.#activeSearchMatchIndex].elements[0]?.scrollIntoView({ behavior: 'auto', block: 'center' });
  }

  #caseFold(value: string): { text: string; starts: number[]; ends: number[] } {
    const text = value.toLowerCase();
    const starts: number[] = [];
    const ends: number[] = [];
    for (let index = 0; index < value.length;) {
      const character = String.fromCodePoint(value.codePointAt(index)!);
      const foldedLength = character.toLowerCase().length;
      for (let foldedIndex = 0; foldedIndex < foldedLength; foldedIndex++) {
        starts.push(index);
        ends.push(index + character.length);
      }
      index += character.length;
    }
    return { text, starts, ends };
  }

  #searchBlockContainer(node: Text): Element | undefined {
    return node.parentElement?.closest('blockquote, h1, h2, h3, h4, h5, h6, li, p, pre, td, th') ?? undefined;
  }

  #updateSearchControls(): void {
    const count = this.#searchMatches.length;
    this.searchCount.textContent = count === 0 ? translate(this.#language, 'noMatches') : translate(this.#language, 'matchCount', { current: this.#activeSearchMatchIndex + 1, total: count });
    this.searchPreviousButton.disabled = count === 0;
    this.searchNextButton.disabled = count === 0;
  }

  #copyCodeLabel(button: HTMLButtonElement): string {
    const language = button.dataset.codeLanguage;
    return language ? translate(this.#language, 'copyLanguageCode', { language }) : translate(this.#language, 'copyCode');
  }

  #syncLanguage(): void {
    const language = this.document.body.dataset.readerLanguage === 'zh-CN' ? 'zh-CN' : 'en';
    const changed = language !== this.#language;
    this.#language = language;
    for (const button of this.article.querySelectorAll<HTMLButtonElement>('[data-copy-code]')) {
      const status = button.dataset.copyState === 'copied' ? 'codeCopied' : button.dataset.copyState === 'failed' ? 'copyFailed' : undefined;
      button.lang = this.#language;
      button.setAttribute('aria-label', status ? translate(this.#language, status) : this.#copyCodeLabel(button));
    }
    for (const button of this.article.querySelectorAll<HTMLButtonElement>('[data-edit-heading]')) {
      const label = translate(this.#language, 'editHeading');
      button.lang = this.#language;
      button.setAttribute('aria-label', label);
      button.title = label;
    }
    for (const button of this.article.querySelectorAll<HTMLButtonElement>('[data-copy-heading]')) {
      const label = translate(this.#language, 'copyHeadingLink');
      button.lang = this.#language;
      button.setAttribute('aria-label', label);
      button.title = label;
    }
    for (const image of this.article.querySelectorAll<HTMLImageElement>('img.mermaid-diagram')) {
      image.lang = this.#language;
      image.alt = translate(this.#language, 'mermaidAlt');
    }
    for (const error of this.article.querySelectorAll<HTMLElement>('.mermaid-error')) {
      error.lang = this.#language;
      error.textContent = translate(this.#language, 'mermaidRenderFailed');
    }
    if (changed && this.#revision >= 0) this.#renderToc();
    this.#updateSearchControls();
  }

  #navigateTo(slug: string): void {
    if (!this.#headingElements.get(slug)) return;
    this.#pendingNavigationSlug = slug;
    this.#setActiveSlug(slug);
    this.#scrollToHeading(slug);
    this.#saveViewport();
  }

  #scrollToHeading(slug: string, offset = 0): boolean {
    const heading = this.#headingElements.get(slug);
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

  #setTocWidth(width: number): void {
    this.#tocWidth = Math.max(180, Math.min(480, Math.round(width)));
    this.document.body.style.setProperty('--reader-toc-width', `${this.#tocWidth}px`);
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

  private get resizer(): HTMLElement {
    return this.#requiredElement('toc-resizer');
  }

  private get toggleTocButton(): HTMLButtonElement {
    return this.#requiredElement<HTMLButtonElement>('toggle-toc');
  }

  private get searchBar(): HTMLElement {
    return this.#requiredElement('search-bar');
  }

  private get searchInput(): HTMLInputElement {
    return this.#requiredElement<HTMLInputElement>('search-input');
  }

  private get searchCount(): HTMLElement {
    return this.#requiredElement('search-count');
  }

  private get searchPreviousButton(): HTMLButtonElement {
    return this.#requiredElement<HTMLButtonElement>('search-previous');
  }

  private get searchNextButton(): HTMLButtonElement {
    return this.#requiredElement<HTMLButtonElement>('search-next');
  }

  private get searchCloseButton(): HTMLButtonElement {
    return this.#requiredElement<HTMLButtonElement>('search-close');
  }
}

"use strict";
(() => {
  // src/webview/ReaderApp.ts
  var ReaderApp = class {
    constructor(document2, api) {
      this.document = document2;
      this.api = api;
    }
    document;
    api;
    #revision = -1;
    #activeSlug;
    #tocVisible = true;
    #tocMaxDepth = 3;
    #tocWidth = 260;
    #headings = [];
    #observer;
    #visibleHeadings = /* @__PURE__ */ new Map();
    #pendingNavigationSlug;
    #scrollFrame;
    #drawerOpen = false;
    #resizingToc = false;
    #started = false;
    #searchOpen = false;
    #searchMatches = [];
    #activeSearchMatchIndex = -1;
    start() {
      if (this.#started) return;
      this.#started = true;
      this.window.addEventListener("message", this.#onMessage);
      this.document.addEventListener("click", this.#onClick);
      this.document.addEventListener("scrollend", this.#onScrollEnd);
      this.window.addEventListener("keydown", this.#onKeyDown);
      this.window.addEventListener("scroll", this.#onScroll, { passive: true });
      this.searchInput.addEventListener("input", this.#onSearchInput);
      this.searchInput.addEventListener("keydown", this.#onSearchInputKeyDown);
      this.searchPreviousButton.addEventListener("click", this.#onSearchPrevious);
      this.searchNextButton.addEventListener("click", this.#onSearchNext);
      this.searchCloseButton.addEventListener("click", this.#onSearchClose);
      this.resizer.addEventListener("pointerdown", this.#onResizerPointerDown);
      this.window.addEventListener("pointermove", this.#onResizerPointerMove);
      this.window.addEventListener("pointerup", this.#onResizerPointerUp);
      this.api.postMessage({ type: "ready" });
    }
    handleMessage(message) {
      switch (message.type) {
        case "render":
          this.applyRender(message.result, message.restore);
          return;
        case "setTocVisible":
          this.#tocVisible = message.visible;
          this.#applyTocVisibility();
          return;
        case "setLayout":
          this.#tocMaxDepth = Math.max(1, Math.min(6, message.tocMaxDepth));
          this.#setTocWidth(message.tocWidth);
          this.document.body.style.setProperty("--reader-content-max-width", `${Math.max(560, Math.min(1600, message.contentMaxWidth))}px`);
          this.#renderToc();
          return;
        case "navigateToAnchor":
          this.#navigateTo(this.#decodeSlug(message.slug));
          return;
        case "setColorMode":
          this.#setColorMode(message.mode);
      }
    }
    applyRender(result, restore) {
      if (result.revision <= this.#revision) return;
      this.#clearSearchMatches();
      this.#updateSearchControls();
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
    captureViewport() {
      const activeHeading = this.#activeSlug ? this.document.getElementById(this.#activeSlug) : void 0;
      return {
        activeSlug: this.#activeSlug,
        activeHeadingOffset: activeHeading?.getBoundingClientRect().top,
        scrollTop: this.#scrollTop(),
        tocVisible: this.#tocVisible,
        collapsedSlugs: []
      };
    }
    dispose() {
      this.window.removeEventListener("message", this.#onMessage);
      this.document.removeEventListener("click", this.#onClick);
      this.document.removeEventListener("scrollend", this.#onScrollEnd);
      this.window.removeEventListener("keydown", this.#onKeyDown);
      this.window.removeEventListener("scroll", this.#onScroll);
      this.searchInput.removeEventListener("input", this.#onSearchInput);
      this.searchInput.removeEventListener("keydown", this.#onSearchInputKeyDown);
      this.searchPreviousButton.removeEventListener("click", this.#onSearchPrevious);
      this.searchNextButton.removeEventListener("click", this.#onSearchNext);
      this.searchCloseButton.removeEventListener("click", this.#onSearchClose);
      this.resizer.removeEventListener("pointerdown", this.#onResizerPointerDown);
      this.window.removeEventListener("pointermove", this.#onResizerPointerMove);
      this.window.removeEventListener("pointerup", this.#onResizerPointerUp);
      this.#observer?.disconnect();
      if (this.#scrollFrame !== void 0) this.window.cancelAnimationFrame(this.#scrollFrame);
      this.#started = false;
    }
    get window() {
      const view = this.document.defaultView;
      if (!view) throw new Error("ReaderApp requires a document with a window");
      return view;
    }
    get article() {
      return this.#requiredElement("document");
    }
    #requiredElement(id) {
      const element = this.document.getElementById(id);
      if (!element) throw new Error(`ReaderApp is missing #${id}`);
      return element;
    }
    #onMessage = (event) => {
      this.handleMessage(event.data);
    };
    #onClick = (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest("#open-source")) {
        this.api.postMessage({ type: "openSource" });
        return;
      }
      if (target.closest("#toggle-toc")) {
        if (this.#isNarrow()) {
          this.#drawerOpen ? this.#closeDrawer() : this.#openDrawer();
        } else {
          this.api.postMessage({ type: "toggleToc" });
        }
        return;
      }
      if (target.closest("#toc-drawer-backdrop")) {
        this.#closeDrawer();
        return;
      }
      const copyButton = target.closest("button[data-copy-code]");
      if (copyButton) {
        const code = copyButton.closest("pre")?.querySelector("code")?.textContent;
        if (code !== void 0) void this.#copyCode(copyButton, code);
        return;
      }
      const anchor = target.closest("a[href]");
      if (!anchor) return;
      const href = anchor.getAttribute("href") ?? "";
      if (href.startsWith("#")) {
        event.preventDefault();
        this.#navigateTo(this.#decodeSlug(href.slice(1)));
        if (event.detail > 0) anchor.blur();
        if (this.#drawerOpen) this.#closeDrawer();
      } else {
        event.preventDefault();
        this.api.postMessage({ type: "openLink", href });
      }
    };
    #onKeyDown = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
        event.preventDefault();
        this.#openSearch();
        return;
      }
      if (this.#searchOpen && event.key === "Escape") {
        event.preventDefault();
        this.#closeSearch();
        return;
      }
      if (!this.#drawerOpen) return;
      if (event.key === "Escape") {
        event.preventDefault();
        this.#closeDrawer();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = [...this.drawer.querySelectorAll("a[href], button:not([disabled])")];
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && this.document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && this.document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    #onSearchInput = () => {
      this.#updateSearch(this.searchInput.value);
    };
    #onSearchInputKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        this.#closeSearch();
        return;
      }
      if (event.key !== "Enter") return;
      event.preventDefault();
      this.#selectSearchMatch(this.#activeSearchMatchIndex + (event.shiftKey ? -1 : 1));
    };
    #onSearchPrevious = () => this.#selectSearchMatch(this.#activeSearchMatchIndex - 1);
    #onSearchNext = () => this.#selectSearchMatch(this.#activeSearchMatchIndex + 1);
    #onSearchClose = () => this.#closeSearch();
    async #copyCode(button, code) {
      const copyLabel = button.getAttribute("aria-label") ?? "Copy code";
      try {
        if (this.window.navigator.clipboard?.writeText) {
          try {
            await this.window.navigator.clipboard.writeText(code);
          } catch {
            if (!this.#copyWithCommand(code)) throw new Error("Copy command failed");
          }
        } else {
          if (!this.#copyWithCommand(code)) throw new Error("Copy command failed");
        }
        button.dataset.copyState = "copied";
        button.setAttribute("aria-label", "Code copied");
        this.window.setTimeout(() => {
          delete button.dataset.copyState;
          button.setAttribute("aria-label", copyLabel);
        }, 1500);
      } catch {
        button.dataset.copyState = "failed";
        button.setAttribute("aria-label", "Copy failed");
        this.window.setTimeout(() => {
          delete button.dataset.copyState;
          button.setAttribute("aria-label", copyLabel);
        }, 1500);
      }
    }
    #copyWithCommand(code) {
      const textarea = this.document.createElement("textarea");
      textarea.value = code;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      this.document.body.append(textarea);
      textarea.select();
      try {
        return this.document.execCommand("copy");
      } finally {
        textarea.remove();
      }
    }
    #onResizerPointerDown = (event) => {
      if (this.#isNarrow()) return;
      event.preventDefault();
      this.#resizingToc = true;
      this.#setTocWidth(event.clientX);
    };
    #onResizerPointerMove = (event) => {
      if (!this.#resizingToc) return;
      this.#setTocWidth(event.clientX);
    };
    #onResizerPointerUp = (event) => {
      if (!this.#resizingToc) return;
      this.#setTocWidth(event.clientX);
      this.#resizingToc = false;
      this.api.postMessage({ type: "setTocWidth", width: this.#tocWidth });
    };
    #onScroll = () => {
      if (this.#scrollFrame !== void 0) return;
      if (typeof this.window.requestAnimationFrame !== "function") {
        this.#saveViewport();
        return;
      }
      this.#scrollFrame = this.window.requestAnimationFrame(() => {
        this.#scrollFrame = void 0;
        this.#saveViewport();
      });
    };
    #onScrollEnd = () => {
      this.#pendingNavigationSlug = void 0;
    };
    #renderToc() {
      const headings = this.#headings.filter((heading) => heading.level <= this.#tocMaxDepth);
      const tree = this.#buildTree(headings);
      this.#renderTocInto(this.toc, tree);
      this.#renderTocInto(this.drawer, tree);
      this.#setActiveSlug(this.#activeSlug);
    }
    #buildTree(headings) {
      const root = [];
      const stack = [{ level: 0, children: root }];
      for (const heading of headings) {
        while (stack.length > 1 && stack.at(-1).level >= heading.level) stack.pop();
        const node = { heading, children: [] };
        stack.at(-1).children.push(node);
        stack.push({ level: heading.level, children: node.children });
      }
      return root;
    }
    #renderTocInto(container, tree) {
      container.replaceChildren();
      if (tree.length === 0) return;
      container.append(this.#createTocList(tree));
    }
    #createTocList(nodes) {
      const list = this.document.createElement("ol");
      for (const node of nodes) {
        const item = this.document.createElement("li");
        const link = this.document.createElement("a");
        link.href = `#${node.heading.slug}`;
        link.dataset.readerSlug = node.heading.slug;
        link.dataset.headingLevel = String(node.heading.level);
        link.textContent = node.heading.text || "Untitled section";
        item.append(link);
        if (node.children.length > 0) {
          const childList = this.#createTocList(node.children);
          item.append(childList);
        }
        list.append(item);
      }
      return list;
    }
    #observeHeadings() {
      this.#observer?.disconnect();
      this.#visibleHeadings.clear();
      if (typeof IntersectionObserver !== "function") return;
      const observer = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          const slug = entry.target.id;
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
        const element = this.document.getElementById(heading.slug);
        if (element) observer.observe(element);
      }
    }
    #restoreViewport(restore) {
      if (!restore) return;
      this.#setActiveSlug(restore.activeSlug);
      if (restore.activeSlug && this.#scrollToHeading(restore.activeSlug, restore.activeHeadingOffset)) return;
      this.#setScrollTop(restore.scrollTop);
    }
    #openSearch() {
      if (this.#drawerOpen) this.#closeDrawer();
      this.#searchOpen = true;
      this.searchBar.hidden = false;
      this.searchInput.focus();
      this.searchInput.select();
    }
    #closeSearch() {
      this.#searchOpen = false;
      this.searchBar.hidden = true;
      this.searchInput.value = "";
      this.#clearSearchMatches();
      this.#updateSearchControls();
      this.article.focus();
    }
    #updateSearch(query) {
      this.#clearSearchMatches();
      const normalizedQuery = this.#caseFold(query).text;
      if (normalizedQuery.length === 0) {
        this.#updateSearchControls();
        return;
      }
      const textNodes = [];
      const walker = this.document.createTreeWalker(this.article, NodeFilter.SHOW_TEXT, {
        acceptNode: (node) => node.textContent && !node.parentElement?.closest("mark[data-search-match]") ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT
      });
      for (let node = walker.nextNode(); node; node = walker.nextNode()) textNodes.push(node);
      const nodeRanges = [];
      let documentText = "";
      for (const node of textNodes) {
        if (nodeRanges.length > 0 && this.#searchBlockContainer(nodeRanges.at(-1).node) !== this.#searchBlockContainer(node)) {
          documentText += "\n";
        }
        const start = documentText.length;
        documentText += node.textContent ?? "";
        nodeRanges.push({ node, start, end: documentText.length });
      }
      const foldedDocument = this.#caseFold(documentText);
      const matches = [];
      for (let foldedStart = foldedDocument.text.indexOf(normalizedQuery); foldedStart !== -1; ) {
        const foldedEnd = foldedStart + normalizedQuery.length - 1;
        matches.push({
          start: foldedDocument.starts[foldedStart],
          end: foldedDocument.ends[foldedEnd],
          elements: []
        });
        foldedStart = foldedDocument.text.indexOf(normalizedQuery, foldedStart + normalizedQuery.length);
      }
      for (const { node, start: nodeStart, end: nodeEnd } of nodeRanges) {
        const text = node.textContent ?? "";
        const segments = matches.filter((match) => match.start < nodeEnd && match.end > nodeStart);
        if (segments.length === 0) continue;
        const fragment = this.document.createDocumentFragment();
        let textStart = 0;
        for (const searchMatch of segments) {
          const matchStart = Math.max(searchMatch.start, nodeStart) - nodeStart;
          const matchEnd = Math.min(searchMatch.end, nodeEnd) - nodeStart;
          if (matchStart > textStart) fragment.append(this.document.createTextNode(text.slice(textStart, matchStart)));
          const mark = this.document.createElement("mark");
          mark.className = "search-match";
          mark.dataset.searchMatch = "";
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
    #clearSearchMatches() {
      for (const { elements } of this.#searchMatches) {
        for (const match of elements) match.replaceWith(this.document.createTextNode(match.textContent ?? ""));
      }
      this.article.normalize();
      this.#searchMatches = [];
      this.#activeSearchMatchIndex = -1;
    }
    #selectSearchMatch(index) {
      if (this.#searchMatches.length === 0) return this.#updateSearchControls();
      this.#activeSearchMatchIndex = (index + this.#searchMatches.length) % this.#searchMatches.length;
      for (const [position, match] of this.#searchMatches.entries()) {
        for (const element of match.elements) element.toggleAttribute("data-search-active", position === this.#activeSearchMatchIndex);
      }
      this.#updateSearchControls();
      this.#searchMatches[this.#activeSearchMatchIndex].elements[0]?.scrollIntoView({ behavior: "auto", block: "center" });
    }
    #caseFold(value) {
      const text = value.toLowerCase();
      const starts = [];
      const ends = [];
      for (let index = 0; index < value.length; ) {
        const character = String.fromCodePoint(value.codePointAt(index));
        const foldedLength = character.toLowerCase().length;
        for (let foldedIndex = 0; foldedIndex < foldedLength; foldedIndex++) {
          starts.push(index);
          ends.push(index + character.length);
        }
        index += character.length;
      }
      return { text, starts, ends };
    }
    #searchBlockContainer(node) {
      return node.parentElement?.closest("blockquote, h1, h2, h3, h4, h5, h6, li, p, pre, td, th") ?? void 0;
    }
    #updateSearchControls() {
      const count = this.#searchMatches.length;
      this.searchCount.textContent = count === 0 ? "0 of 0" : `${this.#activeSearchMatchIndex + 1} of ${count}`;
      this.searchPreviousButton.disabled = count === 0;
      this.searchNextButton.disabled = count === 0;
    }
    #navigateTo(slug) {
      if (!this.document.getElementById(slug)) return;
      this.#pendingNavigationSlug = slug;
      this.#setActiveSlug(slug);
      this.#scrollToHeading(slug);
      this.#saveViewport();
    }
    #scrollToHeading(slug, offset = 0) {
      const heading = this.document.getElementById(slug);
      if (!heading) return false;
      const reducedMotion = this.window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
      heading.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
      if (offset !== 0) this.#setScrollTop(this.#scrollTop() + offset);
      return true;
    }
    #setActiveSlug(slug) {
      this.#activeSlug = slug;
      for (const link of this.document.querySelectorAll("a[data-reader-slug]")) {
        if (slug && link.dataset.readerSlug === slug) link.setAttribute("aria-current", "location");
        else link.removeAttribute("aria-current");
      }
    }
    #applyTocVisibility() {
      this.toc.hidden = !this.#tocVisible;
      this.toggleTocButton.setAttribute("aria-expanded", String(this.#tocVisible));
    }
    #openDrawer() {
      this.#drawerOpen = true;
      this.drawer.hidden = false;
      this.drawer.setAttribute("aria-hidden", "false");
      this.backdrop.hidden = false;
      this.article.setAttribute("aria-hidden", "true");
      this.drawer.querySelector("a[href], button:not([disabled])")?.focus();
    }
    #closeDrawer() {
      if (!this.#drawerOpen) return;
      this.#drawerOpen = false;
      this.drawer.hidden = true;
      this.drawer.setAttribute("aria-hidden", "true");
      this.backdrop.hidden = true;
      this.article.removeAttribute("aria-hidden");
      this.toggleTocButton.focus();
    }
    #setColorMode(mode) {
      this.document.body.classList.remove("vscode-light", "vscode-dark", "vscode-high-contrast", "vscode-high-contrast-light");
      this.document.body.classList.add(mode === "high-contrast" ? "vscode-high-contrast" : `vscode-${mode}`);
    }
    #saveViewport() {
      this.api.setState(this.captureViewport());
      this.api.postMessage({ type: "viewportChanged", state: this.captureViewport() });
    }
    #scrollTop() {
      return this.document.scrollingElement?.scrollTop ?? this.document.documentElement.scrollTop;
    }
    #setScrollTop(value) {
      const element = this.document.scrollingElement ?? this.document.documentElement;
      const max = Math.max(0, element.scrollHeight - element.clientHeight);
      element.scrollTop = Math.max(0, Math.min(max, value));
    }
    #setTocWidth(width) {
      this.#tocWidth = Math.max(180, Math.min(480, Math.round(width)));
      this.document.body.style.setProperty("--reader-toc-width", `${this.#tocWidth}px`);
    }
    #decodeSlug(slug) {
      try {
        return decodeURIComponent(slug);
      } catch {
        return slug;
      }
    }
    #isNarrow() {
      return this.window.innerWidth < 800;
    }
    get toc() {
      return this.#requiredElement("toc");
    }
    get drawer() {
      return this.#requiredElement("toc-drawer");
    }
    get backdrop() {
      return this.#requiredElement("toc-drawer-backdrop");
    }
    get resizer() {
      return this.#requiredElement("toc-resizer");
    }
    get toggleTocButton() {
      return this.#requiredElement("toggle-toc");
    }
    get searchBar() {
      return this.#requiredElement("search-bar");
    }
    get searchInput() {
      return this.#requiredElement("search-input");
    }
    get searchCount() {
      return this.#requiredElement("search-count");
    }
    get searchPreviousButton() {
      return this.#requiredElement("search-previous");
    }
    get searchNextButton() {
      return this.#requiredElement("search-next");
    }
    get searchCloseButton() {
      return this.#requiredElement("search-close");
    }
  };

  // src/webview/index.ts
  new ReaderApp(document, acquireVsCodeApi()).start();
})();
//# sourceMappingURL=reader.js.map

"use strict";
(() => {
  // src/settings/ReaderSettings.ts
  var defaultSettings = Object.freeze({
    theme: "reader",
    colorMode: "light",
    fontFamily: "",
    fontSize: 16,
    contentMaxWidth: 900,
    largeFileMode: "auto",
    largeFileThresholdKb: 1024
  });
  var settingKeys = Object.keys(defaultSettings);
  function isSettingValue(key, value) {
    switch (key) {
      case "theme":
        return value === "reader" || value === "github";
      case "colorMode":
        return ["auto", "light", "dark"].includes(String(value)) && typeof value === "string";
      case "largeFileMode":
        return ["auto", "on", "off"].includes(String(value)) && typeof value === "string";
      case "fontFamily":
        return typeof value === "string" && value.length <= 200 && !/[;{}<>\\\n\r\x00-\x1f]/u.test(value) && !/url\s*\(/i.test(value);
      case "fontSize":
        return integerBetween(value, 12, 32);
      case "contentMaxWidth":
        return integerBetween(value, 560, 1600);
      case "largeFileThresholdKb":
        return integerBetween(value, 1, 102400);
      default:
        return false;
    }
  }
  function integerBetween(value, min, max) {
    return typeof value === "number" && Number.isSafeInteger(value) && value >= min && value <= max;
  }
  function normalizeSettings(value) {
    const result = { ...defaultSettings };
    for (const key of settingKeys) if (isSettingValue(key, value[key])) Object.assign(result, { [key]: value[key] });
    return result;
  }

  // src/webview/ReaderControls.ts
  var ReaderControls = class {
    constructor(document2, post, onColorChange) {
      this.document = document2;
      this.post = post;
      this.onColorChange = onColorChange;
    }
    document;
    post;
    onColorChange;
    #settings = { ...defaultSettings };
    #observer;
    #revision = -1;
    #requestId = 0;
    #pending = /* @__PURE__ */ new Map();
    start() {
      if (!this.document.getElementById("reader-menu-toggle")) return;
      this.document.addEventListener("click", this.#click);
      this.document.addEventListener("change", this.#change);
      this.document.addEventListener("input", this.#input);
      this.document.addEventListener("keydown", this.#key, true);
      this.dialog.addEventListener("close", this.#closed);
      this.#observer = new MutationObserver(() => this.#color());
      this.#observer.observe(this.document.body, { attributes: true, attributeFilter: ["class"] });
      this.apply(this.#settings);
    }
    dispose() {
      this.document.removeEventListener("click", this.#click);
      this.document.removeEventListener("change", this.#change);
      this.document.removeEventListener("input", this.#input);
      this.document.removeEventListener("keydown", this.#key, true);
      this.document.getElementById("reader-settings")?.removeEventListener("close", this.#closed);
      this.#observer?.disconnect();
    }
    apply(settings) {
      const merged = { ...settings };
      for (const [key, pending] of this.#pending) Object.assign(merged, { [key]: pending.value });
      this.#settings = normalizeSettings(merged);
      const body = this.document.body;
      body.dataset.readerTheme = this.#settings.theme;
      body.style.setProperty("--reader-font-size", `${this.#settings.fontSize}px`);
      body.style.setProperty("--reader-font-family", this.#settings.fontFamily || '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif');
      body.style.setProperty("--reader-content-max-width", `${this.#settings.contentMaxWidth}px`);
      this.#color();
      if (!this.document.getElementById("reader-settings")) return;
      for (const field of this.document.querySelectorAll("[data-setting]")) {
        if (field === this.document.activeElement) continue;
        field.value = String(this.#settings[field.dataset.setting]);
      }
      const family = this.#settings.fontFamily;
      if (this.document.activeElement?.id !== "reader-font-family" && this.document.activeElement?.id !== "reader-font-preset") this.get("reader-font-preset").value = ["", "serif", "monospace"].includes(family) ? family : "custom";
      this.#customFont();
      this.get("reader-width-value").textContent = `${this.#settings.contentMaxWidth}px`;
      this.get("reader-font-smaller").disabled = this.#settings.fontSize <= 12;
      this.get("reader-font-larger").disabled = this.#settings.fontSize >= 32;
      this.get("reader-large-file-note").textContent = `Automatic at ${this.#settings.largeFileThresholdKb} KiB. Large file mode shows code, math and diagrams as source. Turn it off for full rendering.`;
    }
    acknowledge(requestId, settings) {
      for (const [key, pending] of this.#pending) if (pending.requestId === requestId) this.#pending.delete(key);
      this.apply(settings);
    }
    setRevision(revision) {
      this.#revision = revision;
      for (const button of this.document.querySelectorAll('.reader-actions [data-action="print"], .reader-actions [data-action="exportHtml"]')) button.disabled = revision < 0;
    }
    setLargeFile(enabled) {
      const button = this.document.getElementById("reader-performance");
      if (button) button.hidden = !enabled;
      this.document.body.classList.toggle("reader-large-file", enabled);
    }
    openSettings() {
      this.#menu(false);
      this.dialog.showModal();
      this.get("reader-theme").focus();
    }
    requestExport(type) {
      if (this.#revision < 0) return;
      const diagrams = [...this.document.querySelectorAll("#document [data-mermaid]")].map((figure) => {
        const image = figure.querySelector("img.mermaid-diagram");
        return image && (!image.dataset.readerColor || image.dataset.readerColor === this.document.body.dataset.readerColor) ? image.getAttribute("src") ?? "" : "";
      });
      this.post({ type, diagrams, revision: this.#revision });
    }
    #color() {
      const body = this.document.body;
      const previous = body.dataset.readerColor;
      const high = body.classList.contains("vscode-high-contrast") || body.classList.contains("vscode-high-contrast-light");
      body.dataset.readerColor = high ? "high-contrast" : this.#settings.colorMode === "auto" ? body.classList.contains("vscode-dark") ? "dark" : "light" : this.#settings.colorMode;
      if (previous !== body.dataset.readerColor) this.onColorChange?.(body.dataset.readerColor);
    }
    #menu(open, restore = false) {
      this.get("reader-menu").hidden = !open;
      this.get("reader-menu-toggle").setAttribute("aria-expanded", String(open));
      if (open) this.get("reader-menu").querySelector("button")?.focus();
      else if (restore) this.get("reader-menu-toggle").focus();
    }
    #closed = () => {
      this.get("reader-menu-toggle").focus();
    };
    #customFont() {
      const custom = this.get("reader-font-preset").value === "custom";
      this.get("reader-font-family").hidden = !custom;
      this.get("reader-font-family-label").hidden = !custom;
    }
    #update(key, value) {
      if (!isSettingValue(key, value)) {
        this.apply(this.#settings);
        return;
      }
      const requestId = ++this.#requestId;
      this.#pending.set(key, { value, requestId });
      this.apply({ ...this.#settings, [key]: value });
      this.post({ type: "updateSetting", key, value, requestId });
    }
    #click = (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const button = target.closest("button");
      switch (button?.id) {
        case "reader-menu-toggle":
          this.#menu(this.get("reader-menu").hidden === true);
          return;
        case "reader-performance":
          this.openSettings();
          return;
        case "reader-settings-close":
          this.dialog.close();
          return;
        case "reader-settings-reset": {
          const requestId = ++this.#requestId;
          this.#pending.clear();
          this.apply({ ...defaultSettings });
          for (const [key, value] of Object.entries(defaultSettings)) this.#pending.set(key, { value, requestId });
          this.post({ type: "resetSettings", requestId });
          return;
        }
        case "reader-settings-more":
          this.post({ type: "openSettings" });
          return;
        case "reader-font-smaller":
          this.#update("fontSize", Math.max(12, this.#settings.fontSize - 1));
          return;
        case "reader-font-larger":
          this.#update("fontSize", Math.min(32, this.#settings.fontSize + 1));
          return;
      }
      const action = button?.dataset.action;
      if (action) {
        this.#menu(false, true);
        if (action === "settings") this.openSettings();
        if (action === "source") this.post({ type: "openSource" });
        if (action === "print" || action === "exportHtml") this.requestExport(action);
        if (action === "feedback") this.post({ type: "openLink", href: "https://github.com/ytcheng/vscode-markdown-reader/issues" });
        if (action === "about") this.post({ type: "openLink", href: "https://github.com/ytcheng/vscode-markdown-reader#readme" });
      } else if (!target.closest(".reader-actions")) this.#menu(false);
      if (target === this.dialog) {
        const rect = this.dialog.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) this.dialog.close();
      }
    };
    #change = (event) => {
      const field = event.target;
      if (field.id === "reader-font-preset") {
        this.#customFont();
        if (field.value === "custom") this.get("reader-font-family").focus();
        else this.#update("fontFamily", field.value);
        return;
      }
      const key = field.dataset?.setting;
      if (key) this.#update(key, field.type === "number" || field.type === "range" ? Number(field.value) : field.value.trim());
    };
    #input = (event) => {
      const field = event.target;
      if (field.id !== "reader-content-width") return;
      this.document.body.style.setProperty("--reader-content-max-width", `${field.value}px`);
      this.get("reader-width-value").textContent = `${field.value}px`;
    };
    #key = (event) => {
      if (this.dialog.open) {
        event.stopPropagation();
        if (event.key === "Escape") {
          event.preventDefault();
          this.dialog.close();
        }
        return;
      }
      if (this.get("reader-menu").hidden) return;
      if (event.key === "Escape" || event.key === "Tab") {
        this.#menu(false, true);
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
        }
        return;
      }
      const buttons = [...this.get("reader-menu").querySelectorAll("button:not(:disabled)")];
      const index = buttons.indexOf(this.document.activeElement);
      const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : event.key === "ArrowDown" ? (index + 1) % buttons.length : event.key === "ArrowUp" ? (index - 1 + buttons.length) % buttons.length : -1;
      if (next >= 0) {
        event.preventDefault();
        event.stopPropagation();
        buttons[next].focus();
      }
    };
    get(id) {
      return this.document.getElementById(id);
    }
    get dialog() {
      return this.get("reader-settings");
    }
  };

  // src/webview/MermaidFrame.ts
  var MermaidFrame = class {
    constructor(document2) {
      this.document = document2;
    }
    document;
    #frame;
    #ready;
    #finishReady;
    #loading = false;
    #failure;
    #pending = /* @__PURE__ */ new Map();
    async render(id, source, theme = "default") {
      if (this.#failure) throw this.#failure;
      if (!this.#ready) {
        const uri = this.document.body.dataset.mermaidFrameUri;
        if (!uri) throw new Error("Missing Mermaid renderer");
        this.#ready = new Promise((resolve) => {
          this.#finishReady = resolve;
        });
        this.document.defaultView.addEventListener("message", this.#onMessage);
        const frame = this.document.createElement("iframe");
        frame.className = "mermaid-staging";
        frame.title = "Diagram renderer";
        frame.setAttribute("aria-hidden", "true");
        frame.setAttribute("sandbox", "allow-scripts");
        const nonce = this.document.querySelector("#render-styles")?.nonce ?? "";
        frame.srcdoc = this.document.defaultView.atob(uri.slice(uri.indexOf(",") + 1)).replaceAll("MERMAID_NONCE", nonce);
        this.#frame = frame;
        this.document.body.append(frame);
      }
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          this.#fail(new Error("Diagram rendering timed out"));
        }, 3e4);
        this.#pending.set(id, { resolve, reject, timer });
        void this.#ready.then(() => {
          if (this.#pending.has(id)) this.#frame?.contentWindow?.postMessage({ type: "renderMermaid", id, source, theme }, "*");
        });
      });
    }
    #onMessage = (event) => {
      if (event.source !== this.#frame?.contentWindow) return;
      const message = event.data;
      if (message?.type === "mermaidBootstrapReady" && !this.#loading) {
        this.#loading = true;
        void this.#loadScript().catch(() => this.#fail(new Error("Unable to load the Mermaid renderer")));
        return;
      }
      if (message?.type === "mermaidInitError") {
        this.#fail(new Error("Unable to start the Mermaid renderer"));
        return;
      }
      if (message?.type === "mermaidReady") {
        this.#finishReady?.();
        return;
      }
      if (message?.type !== "mermaidResult" || typeof message.id !== "string") return;
      const pending = this.#pending.get(message.id);
      if (!pending) return;
      clearTimeout(pending.timer);
      this.#pending.delete(message.id);
      if (typeof message.svg === "string") pending.resolve({ svg: message.svg });
      else pending.reject(new Error("Diagram rendering failed"));
    };
    async #loadScript() {
      const uri = this.document.body.dataset.mermaidScriptUri;
      if (!uri) throw new Error("Missing Mermaid script");
      const response = await this.document.defaultView.fetch(uri);
      if (!response.ok) throw new Error("Unable to read Mermaid script");
      const script = await response.text();
      if (!this.#failure) this.#frame?.contentWindow?.postMessage({ type: "initMermaid", script }, "*");
    }
    #fail(error) {
      this.#failure = error;
      for (const pending of this.#pending.values()) {
        clearTimeout(pending.timer);
        pending.reject(error);
      }
      this.#pending.clear();
    }
    dispose() {
      this.document.defaultView.removeEventListener("message", this.#onMessage);
      this.#fail(new Error("Diagram renderer disposed"));
      this.#frame?.remove();
    }
  };

  // src/webview/MermaidRenderer.ts
  var sequence = 0;
  var MermaidRenderer = class {
    constructor(renderDiagram) {
      this.renderDiagram = renderDiagram;
    }
    renderDiagram;
    #frame;
    #versions = /* @__PURE__ */ new WeakMap();
    #rendering = /* @__PURE__ */ new WeakMap();
    dispose() {
      this.#frame?.dispose();
    }
    async render(article) {
      for (const figure of article.querySelectorAll("[data-mermaid]")) {
        const code = figure.querySelector("code");
        if (!code || !figure.isConnected) continue;
        const document2 = article.ownerDocument;
        const color = document2.body.dataset.readerColor ?? "light";
        const theme = color === "dark" || color === "high-contrast" ? "dark" : "default";
        const existing = figure.querySelector("img.mermaid-diagram");
        if (existing?.dataset.readerColor === color || this.#rendering.get(figure) === color) continue;
        const version = (this.#versions.get(figure) ?? 0) + 1;
        this.#versions.set(figure, version);
        this.#rendering.set(figure, color);
        const staging = document2.createElement("div");
        staging.className = "mermaid-staging";
        staging.setAttribute("aria-hidden", "true");
        document2.body.append(staging);
        try {
          const render = this.renderDiagram ?? ((id, source, _container, selectedTheme) => (this.#frame ??= new MermaidFrame(document2)).render(id, source, selectedTheme));
          if (!figure.isConnected) continue;
          const { svg } = await render(`reader-mermaid-${++sequence}`, code.textContent ?? "", staging, theme);
          if (!figure.isConnected || this.#versions.get(figure) !== version || (document2.body.dataset.readerColor ?? "light") !== color) continue;
          const image = document2.createElement("img");
          image.className = "mermaid-diagram";
          image.alt = "Mermaid diagram";
          image.dataset.readerColor = color;
          const viewBox = svg.match(/<svg\b[^>]*\bviewBox="([^"]+)"/)?.[1].trim().split(/[\s,]+/).map(Number);
          if (viewBox?.length === 4 && viewBox.every(Number.isFinite) && viewBox[2] > 0 && viewBox[3] > 0) {
            image.width = Math.ceil(viewBox[2]);
            image.height = Math.ceil(viewBox[3]);
          }
          image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
          figure.querySelectorAll("img.mermaid-diagram, .mermaid-error").forEach((node) => node.remove());
          figure.append(image);
          figure.querySelector("pre").hidden = true;
        } catch {
          if (!figure.isConnected || this.#versions.get(figure) !== version || (document2.body.dataset.readerColor ?? "light") !== color) continue;
          figure.querySelectorAll("img.mermaid-diagram, .mermaid-error").forEach((node) => node.remove());
          figure.querySelector("pre").hidden = false;
          const error = document2.createElement("p");
          error.className = "mermaid-error";
          error.setAttribute("role", "status");
          error.textContent = "Unable to render Mermaid diagram. Check the source syntax.";
          figure.append(error);
        } finally {
          if (this.#versions.get(figure) === version) this.#rendering.delete(figure);
          staging.remove();
        }
      }
    }
  };

  // src/webview/ReaderApp.ts
  var ReaderApp = class {
    constructor(document2, api) {
      this.document = document2;
      this.api = api;
      this.#controls = new ReaderControls(document2, (message) => api.postMessage(message), () => {
        void this.#mermaid.render(this.article);
      });
    }
    document;
    api;
    #revision = -1;
    #controls;
    #mermaid = new MermaidRenderer();
    #activeSlug;
    #tocVisible = true;
    #collapsedSlugs = /* @__PURE__ */ new Set();
    #tocMaxDepth = 3;
    #tocWidth = 260;
    #headings = [];
    #headingElements = /* @__PURE__ */ new Map();
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
      this.#controls.start();
      this.window.addEventListener("message", this.#onMessage);
      this.document.addEventListener("click", this.#onClick);
      this.document.addEventListener("dblclick", this.#onDoubleClick);
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
        case "setReaderSettings":
          this.#controls.apply(message.settings);
          return;
        case "settingsAcknowledged":
          this.#controls.acknowledge(message.requestId, message.settings);
          return;
        case "showSettings":
          this.#controls.openSettings();
          return;
        case "requestExport":
          this.#controls.requestExport(message.action);
          return;
        case "render":
          this.applyRender(message.result, message.restore);
          return;
        case "setTocVisible":
          this.#tocVisible = message.visible;
          this.#applyTocVisibility();
          this.#saveViewport();
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
      restore ??= this.#revision < 0 ? this.api.getState() : this.captureViewport();
      this.#clearSearchMatches();
      this.#updateSearchControls();
      this.#revision = result.revision;
      this.#controls.setRevision(result.revision);
      this.#controls.setLargeFile(result.largeFile ?? false);
      this.#headings = result.headings;
      this.article.innerHTML = result.html;
      this.#headingElements.clear();
      for (const heading of this.article.querySelectorAll("h1[id], h2[id], h3[id], h4[id], h5[id], h6[id]")) {
        this.#headingElements.set(heading.id, heading);
      }
      const styles = this.document.getElementById("render-styles");
      if (styles) styles.textContent = result.styles ?? "";
      this.#addHeadingActions();
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
    captureViewport() {
      const activeHeading = this.#activeSlug ? this.#headingElements.get(this.#activeSlug) : void 0;
      return {
        activeSlug: this.#activeSlug,
        activeHeadingOffset: activeHeading?.getBoundingClientRect().top,
        scrollTop: this.#scrollTop(),
        tocVisible: this.#tocVisible,
        collapsedSlugs: [...this.#collapsedSlugs]
      };
    }
    dispose() {
      this.#controls.dispose();
      this.window.removeEventListener("message", this.#onMessage);
      this.document.removeEventListener("click", this.#onClick);
      this.document.removeEventListener("dblclick", this.#onDoubleClick);
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
      this.#mermaid.dispose();
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
      if (event.origin !== this.window.location.origin) return;
      if ([...this.document.querySelectorAll("iframe")].some((frame) => frame.contentWindow === event.source)) return;
      this.handleMessage(event.data);
    };
    #addHeadingActions() {
      for (const heading of this.#headings) {
        const element = this.#headingElements.get(heading.slug);
        if (!element || !this.article.contains(element)) continue;
        const actions = this.document.createElement("span");
        actions.className = "heading-actions";
        for (const [attribute, label, text] of [
          ["data-edit-heading", "Edit heading in source", ""],
          ["data-copy-heading", "Copy Heading Link", "#"]
        ]) {
          const button = this.document.createElement("button");
          button.type = "button";
          button.setAttribute(attribute, heading.slug);
          button.setAttribute("aria-label", label);
          button.title = label;
          button.textContent = text;
          if (attribute === "data-edit-heading") {
            button.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M15 5l4 4M4 20l4-1L20 7a2.83 2.83 0 0 0-4-4L4 15z"/></svg>';
          }
          actions.append(button);
        }
        element.append(actions);
      }
    }
    #onDoubleClick = (event) => {
      const target = event.target;
      if (!(target instanceof Element) || !this.article.contains(target)) return;
      if (target.closest("a, button, input, textarea, select, [contenteditable]")) return;
      const block = target.closest("[data-source-line]");
      if (!block || !this.article.contains(block)) return;
      const line = Number(block.dataset.sourceLine);
      if (Number.isSafeInteger(line) && line >= 0) this.api.postMessage({ type: "openSource", line });
    };
    #onClick = (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const branch = target.closest("[data-toggle-branch]");
      if (branch) {
        const slug = branch.dataset.toggleBranch;
        const container = target.closest("#toc-drawer") ? this.drawer : this.toc;
        if (this.#collapsedSlugs.has(slug)) this.#collapsedSlugs.delete(slug);
        else if (this.#collapsedSlugs.size < 200) this.#collapsedSlugs.add(slug);
        this.#renderToc();
        this.#saveViewport();
        [...container.querySelectorAll("[data-toggle-branch]")].find((button) => button.dataset.toggleBranch === slug)?.focus();
        return;
      }
      const edit = target.closest("[data-edit-heading]");
      if (edit) {
        const heading = this.#headings.find((item) => item.slug === edit.dataset.editHeading);
        if (heading) this.api.postMessage({ type: "openSource", line: heading.line });
        return;
      }
      const copyHeading = target.closest("[data-copy-heading]");
      if (copyHeading) {
        void this.#copyCode(copyHeading, `#${encodeURIComponent(copyHeading.dataset.copyHeading)}`);
        return;
      }
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
          const toggle = this.document.createElement("button");
          toggle.type = "button";
          toggle.className = "toc-branch-toggle";
          toggle.dataset.toggleBranch = node.heading.slug;
          const collapsed = this.#collapsedSlugs.has(node.heading.slug);
          toggle.setAttribute("aria-label", `${collapsed ? "Expand" : "Collapse"} ${node.heading.text || "Untitled section"}`);
          toggle.setAttribute("aria-expanded", String(!collapsed));
          toggle.textContent = collapsed ? "\u25B8" : "\u25BE";
          childList.hidden = collapsed;
          item.prepend(toggle);
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
        const element = this.#headingElements.get(heading.slug);
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
        acceptNode: (node) => node.textContent && !node.parentElement?.closest("mark[data-search-match], button, .katex, [data-mermaid]") ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT
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
      if (!this.#headingElements.get(slug)) return;
      this.#pendingNavigationSlug = slug;
      this.#setActiveSlug(slug);
      this.#scrollToHeading(slug);
      this.#saveViewport();
    }
    #scrollToHeading(slug, offset = 0) {
      const heading = this.#headingElements.get(slug);
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

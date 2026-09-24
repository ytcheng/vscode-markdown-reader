import { defaultSettings, effectiveFontSize, isSettingValue, normalizeSettings, type ReaderSettingKey, type ReaderSettings } from '../settings/ReaderSettings.js';
import type { WebviewToExtensionMessage } from './messages.js';
import { localizeStaticReaderUi, resolveReaderLanguage, translate } from './localization.js';

export class ReaderControls {
  #settings: ReaderSettings = { ...defaultSettings };
  #observer?: MutationObserver;
  #revision = -1;
  #requestId = 0;
  readonly #pending = new Map<ReaderSettingKey, { value: string | number; requestId: number }>();
  constructor(private readonly document: Document, private readonly post: (message: WebviewToExtensionMessage) => void, private readonly onColorChange?: (color: string) => void) {}
  start(): void {
    if (!this.document.getElementById('reader-menu-toggle')) return;
    this.document.addEventListener('click', this.#click);
    this.document.addEventListener('change', this.#change);
    this.document.addEventListener('input', this.#input);
    this.document.addEventListener('keydown', this.#key, true);
    this.dialog.addEventListener('close', this.#closed);
    this.#observer = new MutationObserver(() => this.#color());
    this.#observer.observe(this.document.body, { attributes: true, attributeFilter: ['class'] });
    this.apply(this.#settings);
  }
  dispose(): void {
    this.document.removeEventListener('click', this.#click);
    this.document.removeEventListener('change', this.#change);
    this.document.removeEventListener('input', this.#input);
    this.document.removeEventListener('keydown', this.#key, true);
    this.document.getElementById('reader-settings')?.removeEventListener('close', this.#closed);
    this.#observer?.disconnect();
  }
  apply(settings: ReaderSettings): void {
    const merged = { ...settings };
    for (const [key, pending] of this.#pending) Object.assign(merged, { [key]: pending.value });
    this.#settings = normalizeSettings(merged);
    this.#applyLanguage();
    const body = this.document.body;
    body.dataset.readerTheme = this.#settings.theme;
    body.style.setProperty('--reader-font-size', `${effectiveFontSize(this.#settings)}px`);
    body.style.setProperty('--reader-font-family', this.#settings.fontFamily || '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif');
    body.style.setProperty('--reader-content-max-width', `${this.#settings.contentMaxWidth}px`);
    this.#color();
    if (!this.document.getElementById('reader-settings')) return;
    for (const field of this.document.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-setting]')) {
      if (field === this.document.activeElement) continue;
      field.value = String(this.#settings[field.dataset.setting as ReaderSettingKey]);
    }
    const family = this.#settings.fontFamily;
    if (this.document.activeElement?.id !== 'reader-font-family' && this.document.activeElement?.id !== 'reader-font-preset') this.get<HTMLSelectElement>('reader-font-preset').value = ['', 'serif', 'monospace'].includes(family) ? family : 'custom';
    this.#customFont();
    const followsEditor = this.#settings.fontSizeMode === 'editor';
    this.get('reader-font-size-label').hidden = followsEditor;
    this.get('reader-font-size-control').hidden = followsEditor;
    this.get('reader-font-size-follow-note').hidden = !followsEditor;
    this.get('reader-editor-font-size-value').textContent = `${this.#settings.editorFontSize ?? 14}px`;
    this.get('reader-effective-font-size-value').textContent = `${effectiveFontSize(this.#settings)}px`;
    this.get('reader-width-value').textContent = `${this.#settings.contentMaxWidth}px`;
    this.get<HTMLButtonElement>('reader-font-smaller').disabled = this.#settings.fontSize <= 12;
    this.get<HTMLButtonElement>('reader-font-larger').disabled = this.#settings.fontSize >= 32;
    this.get('reader-large-file-note').textContent = translate(this.#language(), 'largeFileNote', { threshold: this.#settings.largeFileThresholdKb });
  }
  acknowledge(requestId: number, settings: ReaderSettings): void {
    for (const [key, pending] of this.#pending) if (pending.requestId === requestId) this.#pending.delete(key);
    this.apply(settings);
  }
  setRevision(revision: number): void {
    this.#revision = revision;
    for (const button of this.document.querySelectorAll<HTMLButtonElement>('.reader-actions [data-action="print"], .reader-actions [data-action="exportHtml"]')) button.disabled = revision < 0;
  }
  setLargeFile(enabled: boolean): void {
    const button = this.document.getElementById('reader-performance');
    if (button) button.hidden = !enabled;
    this.document.body.classList.toggle('reader-large-file', enabled);
  }
  openSettings(): void {
    this.#menu(false);
    this.dialog.showModal();
    this.get('reader-theme').focus();
  }
  requestExport(type: 'print' | 'exportHtml'): void {
    if (this.#revision < 0) return;
    const diagrams = [...this.document.querySelectorAll<HTMLElement>('#document [data-mermaid]')]
      .map((figure) => {
        const image = figure.querySelector<HTMLImageElement>('img.mermaid-diagram');
        return image && (!image.dataset.readerColor || image.dataset.readerColor === this.document.body.dataset.readerColor) ? image.getAttribute('src') ?? '' : '';
      });
    this.post({ type, diagrams, revision: this.#revision });
  }
  #color(): void {
    const body = this.document.body;
    const previous = body.dataset.readerColor;
    body.dataset.readerColorMode = this.#settings.colorMode;
    const high = body.classList.contains('vscode-high-contrast') || body.classList.contains('vscode-high-contrast-light');
    body.dataset.readerColor = high ? 'high-contrast' : this.#settings.colorMode === 'auto'
      ? body.classList.contains('vscode-dark') ? 'dark' : 'light' : this.#settings.colorMode;
    if (previous !== body.dataset.readerColor) this.onColorChange?.(body.dataset.readerColor);
  }
  #applyLanguage(): void {
    const language = resolveReaderLanguage(this.#settings.language, this.document.body.dataset.vscodeLanguage ?? this.document.documentElement.lang ?? 'en');
    this.document.body.dataset.readerLanguage = language;
    localizeStaticReaderUi(this.document, language);
    for (const id of ['reader-actions', 'toc', 'toc-resizer', 'toc-drawer', 'toggle-toc', 'search-label', 'search-count', 'search-previous', 'search-next', 'search-close']) {
      this.document.getElementById(id)?.setAttribute('lang', language);
    }
    this.get<HTMLInputElement>('reader-font-family').setAttribute('lang', 'en');
    const menuToggle = this.get<HTMLButtonElement>('reader-menu-toggle');
    menuToggle.setAttribute('aria-label', translate(language, 'readerMenu'));
    menuToggle.title = translate(language, 'readerMenu');
    const performance = this.get<HTMLButtonElement>('reader-performance');
    performance.title = translate(language, 'largeFileTitle');
    performance.setAttribute('aria-label', translate(language, 'largeFileAriaLabel'));
    const tocToggle = this.get<HTMLButtonElement>('toggle-toc');
    tocToggle?.setAttribute('aria-label', translate(language, 'toggleTableOfContents'));
  }
  #language(): 'en' | 'zh-CN' {
    return this.document.body.dataset.readerLanguage === 'zh-CN' ? 'zh-CN' : 'en';
  }
  #menu(open: boolean, restore = false): void {
    this.get('reader-menu').hidden = !open;
    this.get('reader-menu-toggle').setAttribute('aria-expanded', String(open));
    if (open) this.get('reader-menu').querySelector<HTMLButtonElement>('button')?.focus();
    else if (restore) this.get('reader-menu-toggle').focus();
  }
  #closed = (): void => { this.get('reader-menu-toggle').focus(); };
  #customFont(): void {
    const custom = this.get<HTMLSelectElement>('reader-font-preset').value === 'custom';
    this.get('reader-font-family').hidden = !custom;
    this.get('reader-font-family-label').hidden = !custom;
  }
  #update(key: ReaderSettingKey, value: string | number): void {
    if (!isSettingValue(key, value)) { this.apply(this.#settings); return; }
    const requestId = ++this.#requestId;
    this.#pending.set(key, { value, requestId });
    this.apply({ ...this.#settings, [key]: value });
    this.post({ type: 'updateSetting', key, value, requestId });
  }
  #click = (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest<HTMLButtonElement>('button');
    switch (button?.id) {
      case 'reader-menu-toggle': this.#menu(this.get('reader-menu').hidden === true); return;
      case 'reader-performance': this.openSettings(); return;
      case 'reader-settings-close': this.dialog.close(); return;
      case 'reader-settings-reset': {
        const requestId = ++this.#requestId;
        this.#pending.clear(); this.apply({ ...defaultSettings });
        for (const [key, value] of Object.entries(defaultSettings)) this.#pending.set(key as ReaderSettingKey, { value, requestId });
        this.post({ type: 'resetSettings', requestId }); return;
      }
      case 'reader-settings-more': this.post({ type: 'openSettings' }); return;
      case 'reader-font-smaller': this.#update('fontSize', Math.max(12, this.#settings.fontSize - 1)); return;
      case 'reader-font-larger': this.#update('fontSize', Math.min(32, this.#settings.fontSize + 1)); return;
    }
    const action = button?.dataset.action;
    if (action) {
      this.#menu(false, true);
      if (action === 'settings') this.openSettings();
      if (action === 'source') this.post({ type: 'openSource' });
      if (action === 'print' || action === 'exportHtml') this.requestExport(action);
      if (action === 'feedback') this.post({ type: 'openLink', href: 'https://github.com/ytcheng/vscode-markdown-reader/issues' });
      if (action === 'about') this.post({ type: 'openLink', href: 'https://github.com/ytcheng/vscode-markdown-reader#readme' });
    } else if (!target.closest('.reader-actions')) this.#menu(false);
    if (target === this.dialog) {
      const rect = this.dialog.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) this.dialog.close();
    }
  };
  #change = (event: Event): void => {
    const field = event.target as HTMLInputElement | HTMLSelectElement;
    if (field.id === 'reader-font-preset') {
      this.#customFont();
      if (field.value === 'custom') this.get('reader-font-family').focus();
      else this.#update('fontFamily', field.value);
      return;
    }
    const key = field.dataset?.setting as ReaderSettingKey | undefined;
    if (key) this.#update(key, field.type === 'number' || field.type === 'range' ? Number(field.value) : field.value.trim());
  };
  #input = (event: Event): void => {
    const field = event.target as HTMLInputElement;
    if (field.id !== 'reader-content-width') return;
    this.document.body.style.setProperty('--reader-content-max-width', `${field.value}px`);
    this.get('reader-width-value').textContent = `${field.value}px`;
  };
  #key = (event: KeyboardEvent): void => {
    if (this.dialog.open) {
      // Keep the reader's find/TOC keyboard handlers out of the modal.
      event.stopPropagation();
      if (event.key === 'Escape') { event.preventDefault(); this.dialog.close(); }
      return;
    }
    if (this.get('reader-menu').hidden) return;
    if (event.key === 'Escape' || event.key === 'Tab') {
      this.#menu(false, true);
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); }
      return;
    }
    const buttons = [...this.get('reader-menu').querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
    const index = buttons.indexOf(this.document.activeElement as HTMLButtonElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
      : event.key === 'ArrowDown' ? (index + 1) % buttons.length
      : event.key === 'ArrowUp' ? (index - 1 + buttons.length) % buttons.length : -1;
    if (next >= 0) { event.preventDefault(); event.stopPropagation(); buttons[next].focus(); }
  };
  private get<T extends HTMLElement>(id: string): T { return this.document.getElementById(id) as T; }
  private get dialog(): HTMLDialogElement { return this.get('reader-settings'); }
}

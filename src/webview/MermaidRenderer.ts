import { MermaidFrame, type MermaidTheme } from './MermaidFrame.js';
import { translate } from './localization.js';

type RenderDiagram = (id: string, source: string, container: HTMLElement, theme: MermaidTheme) => Promise<{ svg: string }>;

let sequence = 0;
export class MermaidRenderer {
  #frame: MermaidFrame | undefined;
  readonly #versions = new WeakMap<HTMLElement, number>();
  readonly #rendering = new WeakMap<HTMLElement, string>();
  constructor(private readonly renderDiagram?: RenderDiagram) {}

  dispose(): void { this.#frame?.dispose(); }

  async render(article: HTMLElement): Promise<void> {
    for (const figure of article.querySelectorAll<HTMLElement>('[data-mermaid]')) {
      const code = figure.querySelector('code');
      if (!code || !figure.isConnected) continue;
      const document = article.ownerDocument;
      const color = document.body.dataset.readerColor ?? 'light';
      const theme: MermaidTheme = color === 'dark' || color === 'high-contrast' ? 'dark' : 'default';
      const existing = figure.querySelector<HTMLImageElement>('img.mermaid-diagram');
      if (existing?.dataset.readerColor === color || this.#rendering.get(figure) === color) continue;
      const version = (this.#versions.get(figure) ?? 0) + 1;
      this.#versions.set(figure, version);
      this.#rendering.set(figure, color);
      const staging = document.createElement('div');
      staging.className = 'mermaid-staging';
      staging.setAttribute('aria-hidden', 'true');
      document.body.append(staging);
      try {
        const render = this.renderDiagram ?? ((id: string, source: string, _container: HTMLElement, selectedTheme: MermaidTheme) => (this.#frame ??= new MermaidFrame(document)).render(id, source, selectedTheme));
        if (!figure.isConnected) continue;
        const { svg } = await render(`reader-mermaid-${++sequence}`, code.textContent ?? '', staging, theme);
        if (!figure.isConnected || this.#versions.get(figure) !== version || (document.body.dataset.readerColor ?? 'light') !== color) continue;
        const image = document.createElement('img');
        image.className = 'mermaid-diagram';
        image.lang = document.body.dataset.readerLanguage === 'zh-CN' ? 'zh-CN' : 'en';
        image.alt = translate(document.body.dataset.readerLanguage === 'zh-CN' ? 'zh-CN' : 'en', 'mermaidAlt');
        image.dataset.readerColor = color;
        const viewBox = svg.match(/<svg\b[^>]*\bviewBox="([^"]+)"/)?.[1].trim().split(/[\s,]+/).map(Number);
        if (viewBox?.length === 4 && viewBox.every(Number.isFinite) && viewBox[2] > 0 && viewBox[3] > 0) {
          image.width = Math.ceil(viewBox[2]);
          image.height = Math.ceil(viewBox[3]);
        }
        // SVG loaded as an image cannot execute scripts or navigate the webview.
        image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
        figure.querySelectorAll('img.mermaid-diagram, .mermaid-error').forEach((node) => node.remove());
        figure.append(image);
        figure.querySelector('pre')!.hidden = true;
      } catch {
        if (!figure.isConnected || this.#versions.get(figure) !== version || (document.body.dataset.readerColor ?? 'light') !== color) continue;
        figure.querySelectorAll('img.mermaid-diagram, .mermaid-error').forEach((node) => node.remove());
        figure.querySelector('pre')!.hidden = false;
        const error = document.createElement('p');
        error.className = 'mermaid-error';
        error.lang = document.body.dataset.readerLanguage === 'zh-CN' ? 'zh-CN' : 'en';
        error.setAttribute('role', 'status');
        error.textContent = translate(document.body.dataset.readerLanguage === 'zh-CN' ? 'zh-CN' : 'en', 'mermaidRenderFailed');
        figure.append(error);
      } finally {
        if (this.#versions.get(figure) === version) this.#rendering.delete(figure);
        staging.remove();
      }
    }
  }
}

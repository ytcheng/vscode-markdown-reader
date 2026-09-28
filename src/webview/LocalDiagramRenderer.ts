import { toSafeSvgDataUri } from '../security/svg.js';
import { LocalDiagramFrame } from './LocalDiagramFrame.js';
import { translate, type ReaderUiLanguage } from './localization.js';

export type LocalDiagramLanguage = 'plantuml' | 'graphviz';
export type RenderDiagram = (id: string, language: LocalDiagramLanguage, source: string, dark: boolean) => Promise<string>;

export class LocalDiagramRenderer {
  #frame: LocalDiagramFrame | undefined;
  #sequence = 0;
  #revision = -1;
  #disposed = false;
  readonly #versions = new WeakMap<HTMLElement, number>();
  readonly #renderDiagram: RenderDiagram;

  constructor(private readonly document: Document, renderDiagram?: RenderDiagram) {
    this.#renderDiagram = renderDiagram ?? ((id, language, source, dark) => {
      this.#frame ??= new LocalDiagramFrame(this.document);
      return this.#frame.render(id, language, source, dark);
    });
  }

  async render(article: HTMLElement, revision: number): Promise<void> {
    if (this.#disposed || revision < this.#revision) return;
    this.#revision = revision;
    const figures = Array.from(article.querySelectorAll<HTMLElement>('figure.local-diagram[data-local-diagram]'));
    await Promise.all(figures.map((figure) => this.#renderFigure(figure, revision)));
  }

  dispose(): void {
    this.#disposed = true;
    this.#revision += 1;
    this.#frame?.dispose();
    this.#frame = undefined;
  }

  async #renderFigure(figure: HTMLElement, revision: number): Promise<void> {
    const language = figure.dataset.localDiagram;
    if (language !== 'plantuml' && language !== 'graphviz') return;
    const sourceBlock = figure.querySelector<HTMLElement>('pre');
    const code = sourceBlock?.querySelector('code');
    if (!sourceBlock || !code) return;

    const version = (this.#versions.get(figure) ?? 0) + 1;
    this.#versions.set(figure, version);
    const id = `reader-local-diagram-${++this.#sequence}`;
    const source = code.textContent ?? '';
    const languageName: LocalDiagramLanguage = language;
    const uiLanguage: ReaderUiLanguage = this.document.body.dataset.readerLanguage === 'zh-CN' ? 'zh-CN' : 'en';
    const dark = isDarkReader(this.document.body);

    this.#clearResult(figure);
    sourceBlock.hidden = false;
    const loading = this.document.createElement('p');
    loading.className = 'local-diagram-progress';
    loading.setAttribute('role', 'status');
    loading.textContent = translate(uiLanguage, 'diagramRendering');
    figure.append(loading);

    try {
      const svg = await this.#renderDiagram(id, languageName, source, dark);
      if (!this.#isCurrent(figure, version, revision)) return;
      const image = this.document.createElement('img');
      image.className = 'local-diagram-image reader-image-zoom';
      image.alt = language === 'plantuml' ? 'PlantUML diagram' : 'Graphviz diagram';
      image.tabIndex = 0;
      image.setAttribute('role', 'button');
      const zoomLabel = translate(uiLanguage, 'openImageInZoomViewer');
      image.setAttribute('aria-label', `${zoomLabel}: ${image.alt}`);
      image.dataset.readerColor = this.document.body.dataset.readerColor ?? (dark ? 'dark' : 'light');
      image.src = toSafeSvgDataUri(svg);
      sourceBlock.hidden = true;
      this.#clearResult(figure);
      figure.append(image);
    } catch (error) {
      if (!this.#isCurrent(figure, version, revision)) return;
      console.error('Markdown Reader diagram render failed', languageName, error);
      sourceBlock.hidden = false;
      this.#clearResult(figure);
      const status = this.document.createElement('p');
      status.className = 'local-diagram-error';
      status.setAttribute('role', 'status');
      const messageKey = language === 'plantuml' ? 'plantumlRenderFailed' : 'graphvizRenderFailed';
      const detail = error instanceof Error ? error.message : String(error);
      status.textContent = `${translate(uiLanguage, messageKey)} ${detail}`;
      figure.append(status);
    }
  }

  #isCurrent(figure: HTMLElement, version: number, revision: number): boolean {
    return !this.#disposed && figure.isConnected && this.#versions.get(figure) === version && revision === this.#revision;
  }

  #clearResult(figure: HTMLElement): void {
    figure.querySelectorAll('.local-diagram-image, .local-diagram-error, .local-diagram-progress').forEach((node) => node.remove());
  }
}

function isDarkReader(body: HTMLElement): boolean {
  return body.dataset.readerColor === 'dark' || (body.dataset.readerColor === 'high-contrast' && !body.classList.contains('vscode-high-contrast-light'));
}

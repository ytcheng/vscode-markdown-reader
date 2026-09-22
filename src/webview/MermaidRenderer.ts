import { MermaidFrame } from './MermaidFrame.js';

type RenderDiagram = (id: string, source: string, container: HTMLElement) => Promise<{ svg: string }>;

let sequence = 0;
export class MermaidRenderer {
  #frame: MermaidFrame | undefined;
  constructor(private readonly renderDiagram?: RenderDiagram) {}

  dispose(): void { this.#frame?.dispose(); }

  async render(article: HTMLElement): Promise<void> {
    for (const figure of article.querySelectorAll<HTMLElement>('[data-mermaid]')) {
      const code = figure.querySelector('code');
      if (!code || !figure.isConnected) continue;
      const document = article.ownerDocument;
      const staging = document.createElement('div');
      staging.className = 'mermaid-staging';
      staging.setAttribute('aria-hidden', 'true');
      document.body.append(staging);
      try {
        const render = this.renderDiagram ?? ((id: string, source: string) => (this.#frame ??= new MermaidFrame(document)).render(id, source));
        if (!figure.isConnected) continue;
        const { svg } = await render(`reader-mermaid-${++sequence}`, code.textContent ?? '', staging);
        if (!figure.isConnected) continue;
        const image = document.createElement('img');
        image.className = 'mermaid-diagram';
        image.alt = 'Mermaid diagram';
        const viewBox = svg.match(/<svg\b[^>]*\bviewBox="([^"]+)"/)?.[1].trim().split(/[\s,]+/).map(Number);
        if (viewBox?.length === 4 && viewBox.every(Number.isFinite) && viewBox[2] > 0 && viewBox[3] > 0) {
          image.width = Math.ceil(viewBox[2]);
          image.height = Math.ceil(viewBox[3]);
        }
        // SVG loaded as an image cannot execute scripts or navigate the webview.
        image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
        figure.append(image);
        figure.querySelector('pre')!.hidden = true;
      } catch {
        if (!figure.isConnected) continue;
        const error = document.createElement('p');
        error.className = 'mermaid-error';
        error.setAttribute('role', 'status');
        error.textContent = 'Unable to render Mermaid diagram. Check the source syntax.';
        figure.append(error);
      } finally {
        staging.remove();
      }
    }
  }
}

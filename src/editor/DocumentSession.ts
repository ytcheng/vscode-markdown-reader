import type { RenderResult } from '../renderer/types.js';
import type { ViewportState } from '../webview/messages.js';

export interface RenderSink {
  postRender(result: RenderResult, restore?: ViewportState): PromiseLike<boolean>;
}

export interface Renderer {
  render(source: string, revision: number): RenderResult | Promise<RenderResult>;
}

export class DocumentSession {
  #revision = 0;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #disposed = false;
  #lastResult: RenderResult | undefined;
  #getText: () => string;
  readonly #panels = new Set<RenderSink>();

  constructor(
    getText: () => string,
    private readonly renderer: Renderer,
    private readonly debounceMs = 200
  ) {
    this.#getText = getText;
  }

  get hasPanels(): boolean {
    return this.#panels.size > 0;
  }

  setTextProvider(getText: () => string): void {
    this.#getText = getText;
  }

  attach(panel: RenderSink): void {
    this.#panels.add(panel);
  }

  detach(panel: RenderSink): void {
    this.#panels.delete(panel);
  }

  schedule(): void {
    clearTimeout(this.#timer);
    this.#timer = setTimeout(() => void this.renderNow(), this.debounceMs);
  }

  async renderNow(): Promise<void> {
    const revision = ++this.#revision;
    const result = await Promise.resolve(this.renderer.render(this.#getText(), revision));
    if (this.#disposed || revision !== this.#revision) return;
    this.#lastResult = result;
    await Promise.all([...this.#panels].map((panel) => panel.postRender(result)));
  }

  dispose(): void {
    this.#disposed = true;
    clearTimeout(this.#timer);
    this.#panels.clear();
  }
}

// Mermaid runs in an opaque sandbox with a restrictive child CSP.
// It has no VS Code API, network access, or permission to navigate its parent.
export class MermaidFrame {
  #frame: HTMLIFrameElement | undefined;
  #ready: Promise<void> | undefined;
  #finishReady: (() => void) | undefined;
  #loading = false;
  #failure: Error | undefined;
  readonly #pending = new Map<string, { resolve: (value: { svg: string }) => void; reject: (reason: Error) => void; timer: ReturnType<typeof setTimeout> }>();

  constructor(private readonly document: Document) {}

  async render(id: string, source: string): Promise<{ svg: string }> {
    if (this.#failure) throw this.#failure;
    if (!this.#ready) {
      const uri = this.document.body.dataset.mermaidFrameUri;
      if (!uri) throw new Error('Missing Mermaid renderer');
      this.#ready = new Promise((resolve) => { this.#finishReady = resolve; });
      this.document.defaultView!.addEventListener('message', this.#onMessage);
      const frame = this.document.createElement('iframe');
      frame.className = 'mermaid-staging';
      frame.title = 'Diagram renderer';
      frame.setAttribute('aria-hidden', 'true');
      frame.setAttribute('sandbox', 'allow-scripts');
      const nonce = this.document.querySelector<HTMLStyleElement>('#render-styles')?.nonce ?? '';
      frame.srcdoc = this.document.defaultView!.atob(uri.slice(uri.indexOf(',') + 1)).replaceAll('MERMAID_NONCE', nonce);
      this.#frame = frame;
      this.document.body.append(frame);
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#fail(new Error('Diagram rendering timed out'));
      }, 30_000);
      this.#pending.set(id, { resolve, reject, timer });
      void this.#ready!.then(() => {
        if (this.#pending.has(id)) this.#frame?.contentWindow?.postMessage({ type: 'renderMermaid', id, source }, '*');
      });
    });
  }

  #onMessage = (event: MessageEvent): void => {
    if (event.source !== this.#frame?.contentWindow) return;
    const message = event.data;
    if (message?.type === 'mermaidBootstrapReady' && !this.#loading) {
      this.#loading = true;
      void this.#loadScript().catch(() => this.#fail(new Error('Unable to load the Mermaid renderer')));
      return;
    }
    if (message?.type === 'mermaidInitError') { this.#fail(new Error('Unable to start the Mermaid renderer')); return; }
    if (message?.type === 'mermaidReady') { this.#finishReady?.(); return; }
    if (message?.type !== 'mermaidResult' || typeof message.id !== 'string') return;
    const pending = this.#pending.get(message.id);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.#pending.delete(message.id);
    if (typeof message.svg === 'string') pending.resolve({ svg: message.svg });
    else pending.reject(new Error('Diagram rendering failed'));
  };

  async #loadScript(): Promise<void> {
    const uri = this.document.body.dataset.mermaidScriptUri;
    if (!uri) throw new Error('Missing Mermaid script');
    const response = await this.document.defaultView!.fetch(uri);
    if (!response.ok) throw new Error('Unable to read Mermaid script');
    const script = await response.text();
    if (!this.#failure) this.#frame?.contentWindow?.postMessage({ type: 'initMermaid', script }, '*');
  }

  #fail(error: Error): void {
    this.#failure = error;
    for (const pending of this.#pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.#pending.clear();
  }

  dispose(): void {
    this.document.defaultView!.removeEventListener('message', this.#onMessage);
    this.#fail(new Error('Diagram renderer disposed'));
    this.#frame?.remove();
  }
}

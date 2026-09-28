interface PendingDiagram {
  resolve(svg: string): void;
  reject(error: Error): void;
  timer: ReturnType<typeof setTimeout>;
}

export class LocalDiagramFrame {
  #frame: HTMLIFrameElement | undefined;
  #ready: Promise<void> | undefined;
  #finishReady: (() => void) | undefined;
  #loading = false;
  #failure: Error | undefined;
  readonly #pending = new Map<string, PendingDiagram>();

  constructor(private readonly document: Document) {}

  async render(id: string, language: 'plantuml', source: string): Promise<string> {
    if (this.#failure) throw this.#failure;
    this.#createFrame();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.#fail(new Error('Diagram rendering timed out')), 30_000);
      this.#pending.set(id, { resolve, reject, timer });
      void this.#ready!.then(() => {
        if (this.#pending.has(id)) {
          this.#frame?.contentWindow?.postMessage({ type: 'renderDiagram', id, language, source }, '*');
        }
      });
    });
  }

  #createFrame(): void {
    if (this.#ready) return;
    const uri = this.document.body.dataset.localDiagramFrameUri;
    if (!uri) throw new Error('Missing local diagram renderer frame');
    this.#ready = new Promise((resolve) => { this.#finishReady = resolve; });
    this.document.defaultView!.addEventListener('message', this.#onMessage);
    const frame = this.document.createElement('iframe');
    frame.title = 'Local diagram renderer';
    frame.setAttribute('aria-hidden', 'true');
    frame.setAttribute('sandbox', 'allow-scripts');
    frame.style.position = 'fixed';
    frame.style.left = '-10000px';
    frame.style.width = '1px';
    frame.style.height = '1px';
    frame.style.visibility = 'hidden';
    const nonce = this.document.querySelector<HTMLStyleElement>('#render-styles')?.nonce ?? '';
    frame.srcdoc = this.document.defaultView!.atob(uri.slice(uri.indexOf(',') + 1)).replaceAll('MERMAID_NONCE', nonce);
    this.#frame = frame;
    this.document.body.append(frame);
  }

  #onMessage = (event: MessageEvent): void => {
    if (event.source !== this.#frame?.contentWindow) return;
    const message = event.data;
    if (message?.type === 'localDiagramBootstrapReady' && !this.#loading) {
      this.#loading = true;
      void this.#loadRuntime().catch((error: unknown) => this.#fail(asError(error)));
      return;
    }
    if (message?.type === 'localDiagramRuntimeError') {
      this.#fail(new Error(typeof message.error === 'string' ? message.error : 'Unable to start the local diagram renderer'));
      return;
    }
    if (message?.type === 'localDiagramRuntimeReady') {
      this.#finishReady?.();
      return;
    }
    if ((message?.type !== 'diagramResult' && message?.type !== 'diagramError') || typeof message.id !== 'string') return;
    const pending = this.#pending.get(message.id);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.#pending.delete(message.id);
    if (message.type === 'diagramResult' && typeof message.svg === 'string') pending.resolve(message.svg);
    else pending.reject(new Error(typeof message.error === 'string' ? message.error : 'PlantUML rendering failed'));
  };

  async #loadRuntime(): Promise<void> {
    const vizUri = this.document.body.dataset.plantUmlVizScriptUri;
    const runtimeUri = this.document.body.dataset.localDiagramScriptUri;
    if (!vizUri || !runtimeUri) throw new Error('Missing local PlantUML runtime assets');
    const fetch = this.document.defaultView!.fetch.bind(this.document.defaultView);
    const [vizResponse, runtimeResponse] = await Promise.all([fetch(vizUri), fetch(runtimeUri)]);
    if (!vizResponse.ok || !runtimeResponse.ok) throw new Error('Unable to read local PlantUML runtime assets');
    const [plantUmlVizScript, runtimeScript] = await Promise.all([vizResponse.text(), runtimeResponse.text()]);
    if (!this.#failure) {
      this.#frame?.contentWindow?.postMessage({
        type: 'initializeLocalDiagramRuntime', plantUmlVizScript, runtimeScript
      }, '*');
    }
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
    this.#fail(new Error('Local diagram renderer disposed'));
    this.#frame?.remove();
    this.#frame = undefined;
  }
}

function asError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

// Test-only observer: production ReaderApp still receives the real VS Code API.
const realTestApi = acquireVsCodeApi();
const pageStartedAt = performance.now();
let readerReadyMs;
const testApi = {
  postMessage(message) {
    if (message?.type === 'ready' && readerReadyMs === undefined) readerReadyMs = performance.now() - pageStartedAt;
    realTestApi.postMessage(message);
  },
  getState: realTestApi.getState.bind(realTestApi),
  setState: realTestApi.setState.bind(realTestApi)
};
window.acquireVsCodeApi = () => testApi;

const failures = [];
const cspErrors = [];
const stages = [];
const firstSvgMs = { plantuml: undefined, graphviz: undefined };
let localRuntimeReadyCount = 0;
let firstLocalFrame;
const heapBefore = performance.memory?.usedJSHeapSize ?? null;
let lastProgressAt = 0;

window.addEventListener('error', (event) => failures.push(event.message || event.target?.src || 'resource error'), true);
window.addEventListener('unhandledrejection', (event) => failures.push(String(event.reason)));
window.addEventListener('securitypolicyviolation', (event) => {
  const detail = `${event.violatedDirective}: ${event.blockedURI}`;
  failures.push(detail);
  cspErrors.push(detail);
});

function collectReport(message, startedAt, force = false) {
  const now = performance.now();
  const mermaidFigures = [...document.querySelectorAll('#document [data-mermaid]')];
  const localFigures = [...document.querySelectorAll('#document figure.local-diagram[data-local-diagram]')];
  const mermaidImages = mermaidFigures.flatMap((figure) => [...figure.querySelectorAll('.mermaid-diagram')]);
  const mermaidLoaded = mermaidImages.filter((image) => image.complete && image.naturalWidth > 0).length;
  const diagramErrors = [...document.querySelectorAll('.mermaid-error')].map((node) => node.textContent);
  const localStates = localFigures.map((figure) => {
    const image = figure.querySelector('.local-diagram-image');
    const loaded = Boolean(image?.complete && image.naturalWidth > 0);
    const error = figure.querySelector('.local-diagram-error')?.textContent ?? '';
    const language = figure.dataset.localDiagram;
    const imageSource = loaded ? image.getAttribute('src') ?? '' : '';
    const svg = imageSource.startsWith('data:image/svg+xml;charset=utf-8,')
      ? decodeURIComponent(imageSource.slice('data:image/svg+xml;charset=utf-8,'.length)) : '';
    return {
      language,
      loaded,
      error,
      sourceVisible: figure.querySelector('pre')?.hidden === false,
      naturalWidth: loaded ? image.naturalWidth : 0,
      naturalHeight: loaded ? image.naturalHeight : 0,
      readerColor: image?.dataset.readerColor ?? '',
      svgColorSignature: [...svg.matchAll(/\b(?:fill|stroke)="([^"]+)"/gi)].map((match) => match[1]).sort().join('|'),
      graphvizCanvasTransparent: language === 'graphviz' && !/<g\b(?=[^>]*\bid="graph0")(?=[^>]*\bclass="graph")[^>]*>\s*<title>[^<]*<\/title>\s*<polygon\b/i.test(svg),
      graphvizDarkForeground: language === 'graphviz' && /fill="#e6edf3"/i.test(svg)
    };
  });
  const localDone = localStates.every((state) => state.loaded || state.error);
  const mermaidDone = mermaidLoaded + diagramErrors.length >= mermaidFigures.length;
  if (!force && (!localDone || !mermaidDone) && now - startedAt < 90_000) return;

  const frame = document.querySelector('iframe[title="Local diagram renderer"]');
  if (!firstLocalFrame && frame) firstLocalFrame = frame;
  const report = {
    type: 'testRenderResult',
    revision: message.revision,
    loaded: mermaidLoaded,
    mermaidLoaded,
    headings: document.querySelectorAll('#document h1, #document h2').length,
    math: document.querySelectorAll('#document .katex').length,
    codeBlocks: document.querySelectorAll('#document pre.hljs-pre').length,
    tables: document.querySelectorAll('#document table').length,
    links: document.querySelectorAll('#document a').length,
    sandbox: frame?.getAttribute('sandbox') ?? document.querySelector('iframe')?.getAttribute('sandbox') ?? '',
    localFigureCount: localStates.length,
    localRendered: localStates.filter((state) => state.loaded).length,
    localErrors: localStates.filter((state) => state.error).map((state) => state.error),
    localSourceFallbacks: localStates.filter((state) => state.error && state.sourceVisible).length,
    localImages: localStates.filter((state) => state.loaded).map(({ language, naturalWidth, naturalHeight, readerColor, svgColorSignature, graphvizCanvasTransparent, graphvizDarkForeground }) => ({ language, naturalWidth, naturalHeight, readerColor, svgColorSignature, graphvizCanvasTransparent, graphvizDarkForeground })),
    localImageNaturalWidth: [...document.querySelectorAll('#document img:not(.local-diagram-image):not(.mermaid-diagram)')]
      .find((image) => image.complete && image.naturalWidth > 0)?.naturalWidth ?? 0,
    localStatuses: localStates,
    localSandbox: frame?.getAttribute('sandbox') ?? '',
    localAllowSameOrigin: (frame?.getAttribute('sandbox') ?? '').split(/\s+/).includes('allow-same-origin'),
    localFrameReused: Boolean(frame && frame === firstLocalFrame),
    localRuntimeReadyCount,
    readerColor: document.body.dataset.readerColor ?? '',
    readerReadyMs,
    renderCompleteMs: now - startedAt,
    plantumlFirstSvgMs: firstSvgMs.plantuml ?? null,
    graphvizFirstSvgMs: firstSvgMs.graphviz ?? null,
    heapBefore,
    heapAfter: performance.memory?.usedJSHeapSize ?? null,
    diagramErrors,
    errors: failures.slice(),
    cspErrors: cspErrors.slice(),
    stages: stages.slice(),
    complete: localDone && mermaidDone
  };
  realTestApi.postMessage(report);
}

function collectAfterLocalDiagramsSettle(message) {
  const startedAt = performance.now();
  const timer = setInterval(() => {
    const settled = [...document.querySelectorAll('#document figure.local-diagram[data-local-diagram]')].every((figure) => {
      const image = figure.querySelector('.local-diagram-image');
      return Boolean((image?.complete && image.naturalWidth > 0) || figure.querySelector('.local-diagram-error'));
    });
    if (settled || performance.now() - startedAt > 90_000) {
      clearInterval(timer);
      collectReport(message, startedAt, true);
    }
  }, 50);
}

window.addEventListener('message', (event) => {
  const message = event.data;
  if (message?.type === 'localDiagramCspViolation') {
    const detail = `${String(message.directive)}: ${String(message.blockedUri)}`;
    failures.push(detail);
    cspErrors.push(detail);
  }
  if (message?.type === 'localDiagramRuntimeReady') localRuntimeReadyCount += 1;
  if (typeof message?.type === 'string' && (message.type.startsWith('mermaid') || message.type.startsWith('localDiagram'))) {
    stages.push(message.type);
  }
  if (message?.type === 'render') {
    const startedAt = performance.now();
    const timer = setInterval(() => {
      try {
      const localStates = [...document.querySelectorAll('#document figure.local-diagram[data-local-diagram]')];
      const elapsedMs = performance.now() - startedAt;
      for (const figure of localStates) {
        const image = figure.querySelector('.local-diagram-image');
        const language = figure.dataset.localDiagram;
        if (image?.complete && image.naturalWidth > 0 && (language === 'plantuml' || language === 'graphviz') && firstSvgMs[language] === undefined) {
          firstSvgMs[language] = elapsedMs;
        }
      }
      const localDone = localStates.every((figure) => {
        const image = figure.querySelector('.local-diagram-image');
        return Boolean((image?.complete && image.naturalWidth > 0) || figure.querySelector('.local-diagram-error'));
      });
      const mermaidFigures = [...document.querySelectorAll('#document [data-mermaid]')];
      const mermaidLoaded = [...document.querySelectorAll('#document .mermaid-diagram')]
        .filter((image) => image.complete && image.naturalWidth > 0).length;
      const mermaidErrors = document.querySelectorAll('#document .mermaid-error').length;
      const mermaidDone = mermaidLoaded + mermaidErrors >= mermaidFigures.length;
      if (!localDone || !mermaidDone) {
        if (performance.now() - lastProgressAt > 2_000) {
          lastProgressAt = performance.now();
          realTestApi.postMessage({
            type: 'testRenderProgress', revision: message.result?.revision, localDone, mermaidDone,
            elapsedMs: performance.now() - startedAt,
            localStates: localStates.map((figure) => ({
              language: figure.dataset.localDiagram,
              image: Boolean(figure.querySelector('.local-diagram-image')),
              error: figure.querySelector('.local-diagram-error')?.textContent ?? ''
            })),
            runtimeReadyCount: localRuntimeReadyCount,
            cspErrors: cspErrors.slice()
          });
        }
        if (performance.now() - startedAt < 35_000) return;
      }
      clearInterval(timer);
      collectReport(message.result, startedAt, true);
      } catch (error) {
        realTestApi.postMessage({ type: 'testProbeError', message: error instanceof Error ? error.message : String(error) });
      }
    }, 50);
    return;
  }
  if (message?.type === 'testProbeReport') collectAfterLocalDiagramsSettle(message);
});

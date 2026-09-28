interface VsCodeApi {
  postMessage(message: unknown): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

const api = acquireVsCodeApi();
const body = document.body;
const frameUri = body.dataset.localDiagramFrameUri ?? '';
const runtimeUri = body.dataset.localDiagramScriptUri ?? '';
const vizUri = body.dataset.plantUmlVizScriptUri ?? '';
const nonce = document.querySelector<HTMLStyleElement>('#render-styles')?.nonce ?? '';
const srcdoc = frameUri.includes(',') ? atob(frameUri.slice(frameUri.indexOf(',') + 1)) : '';
const frame = document.createElement('iframe');
frame.setAttribute('sandbox', 'allow-scripts');
frame.setAttribute('aria-hidden', 'true');
frame.title = 'Local PlantUML probe';
const comma = frameUri.indexOf(',');
frame.srcdoc = comma < 0 ? '' : srcdoc.replaceAll('MERMAID_NONCE', nonce);

let started = false;
let finished = false;
let plantumlSvg = '';
let graphvizSvg = '';
let graphvizTimer: number | undefined;
const report = (error = '') => {
  if (finished) return;
  finished = true;
  if (graphvizTimer !== undefined) window.clearTimeout(graphvizTimer);
  api.postMessage({
    type: 'plantumlProbeResult', plantumlSvg, graphvizSvg, error,
    sandbox: frame.getAttribute('sandbox'),
    cspErrors,
    scriptUris: [vizUri, runtimeUri]
  });
};
const stage = (name: string, detail: Record<string, unknown> = {}) => {
  api.postMessage({ type: 'plantumlProbeStage', stage: name, ...detail });
};
const cspErrors: string[] = [];
window.addEventListener('securitypolicyviolation', (event) => {
  cspErrors.push(`${event.violatedDirective}: ${event.blockedURI}`);
  stage('parent-csp-violation', { directive: event.violatedDirective, blockedUri: event.blockedURI });
});
window.addEventListener('error', (event) => {
  cspErrors.push(event.message || 'resource error');
  stage('parent-error', { message: event.message || 'resource error' });
});
frame.addEventListener('load', () => {
  const cspNonce = frame.srcdoc.match(/script-src 'nonce-([^']+)'/)?.[1] ?? '';
  stage('frame-load', { frameUriPresent: Boolean(frameUri), nonceLength: nonce.length, cspNonce });
});
stage('probe-start', { frameUriPresent: Boolean(frameUri), runtimeUriPresent: Boolean(runtimeUri), vizUriPresent: Boolean(vizUri), nonceLength: nonce.length });
window.addEventListener('message', (event) => {
  if (event.source !== frame.contentWindow) return;
  const message = event.data;
  if (message?.type === 'localDiagramBootstrapReady' && !started) {
    started = true;
    stage('bootstrap-ready');
    void Promise.all([fetch(vizUri), fetch(runtimeUri)]).then(async ([vizResponse, runtimeResponse]) => {
      if (!vizResponse.ok || !runtimeResponse.ok) throw new Error('Unable to load local PlantUML assets');
      const [plantUmlVizScript, runtimeScript] = await Promise.all([vizResponse.text(), runtimeResponse.text()]);
      stage('assets-fetched', { vizBytes: plantUmlVizScript.length, runtimeBytes: runtimeScript.length });
      frame.contentWindow?.postMessage({
        type: 'initializeLocalDiagramRuntime', plantUmlVizScript, runtimeScript
      }, '*');
      stage('initialize-sent');
    }).catch((error: unknown) => report(error instanceof Error ? error.message : String(error)));
    return;
  }
  if (message?.type === 'localDiagramRuntimeReady') {
    stage('runtime-ready');
    frame.contentWindow?.postMessage({
      type: 'renderDiagram', id: 'reader-local-diagram-1', language: 'plantuml',
      source: '@startuml\nAlice -> Bob: Hello\nBob --> Alice: Hi\n@enduml'
    }, '*');
    stage('render-sent');
    return;
  }
  if (message?.type === 'diagramResult' && message.id === 'reader-local-diagram-1' && typeof message.svg === 'string') {
    stage('render-result', { svgBytes: message.svg.length });
    plantumlSvg = message.svg;
    window.setTimeout(() => {
      frame.contentWindow?.postMessage({
        type: 'renderDiagram', id: 'reader-local-diagram-2', language: 'graphviz',
        source: 'digraph G { A -> B; B -> C; C -> A }'
      }, '*');
      stage('graphviz-render-sent');
    }, 0);
    graphvizTimer = window.setTimeout(() => report('Graphviz probe timed out'), 10_000);
    return;
  }
  if (message?.type === 'diagramResult' && message.id === 'reader-local-diagram-2' && typeof message.svg === 'string') {
    graphvizSvg = message.svg;
    stage('graphviz-render-result', { svgBytes: message.svg.length });
    report();
    return;
  }
  if (message?.type === 'diagramError' && (message.id === 'reader-local-diagram-1' || message.id === 'reader-local-diagram-2')) {
    stage('diagram-error', { id: message.id, error: message.error });
    report(typeof message.error === 'string' ? message.error : `${String(message.id)} render failed`);
    return;
  }
  if (message?.type === 'localDiagramRuntimeError') {
    stage('runtime-error', { message: message.error });
    report(typeof message.error === 'string' ? message.error : 'Local diagram runtime failed');
  }
});

document.body.append(frame);

const scriptNonce = (document.currentScript as HTMLScriptElement).nonce;
let initialized = false;

window.addEventListener('error', (event) => {
  parent.postMessage({ type: 'localDiagramRuntimeError', error: event.message || 'Local diagram runtime failed to load' }, '*');
});

window.addEventListener('message', (event: MessageEvent) => {
  if (event.source !== parent || initialized || event.data?.type !== 'initializeLocalDiagramRuntime') return;
  const message = event.data;
  if (typeof message.plantUmlVizScript !== 'string' || typeof message.runtimeScript !== 'string') return;
  initialized = true;
  try {
    const viz = document.createElement('script');
    viz.nonce = scriptNonce;
    viz.textContent = message.plantUmlVizScript;
    document.body.append(viz);
    const runtime = document.createElement('script');
    runtime.nonce = scriptNonce;
    runtime.textContent = message.runtimeScript;
    document.body.append(runtime);
  } catch (error) {
    parent.postMessage({ type: 'localDiagramRuntimeError', error: error instanceof Error ? error.message : String(error) }, '*');
  }
});

parent.postMessage({ type: 'localDiagramBootstrapReady' }, '*');

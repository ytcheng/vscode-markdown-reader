// This srcdoc document has a restrictive CSP and an opaque sandbox origin.
// The parent supplies the bundled script through postMessage because nested
// frame navigations cannot use VS Code's service-worker resource loader.
let initialized = false;
const scriptNonce = (document.currentScript as HTMLScriptElement).nonce;
window.addEventListener('error', () => parent.postMessage({ type: 'mermaidInitError' }, '*'));
window.addEventListener('message', (event: MessageEvent) => {
  if (event.source !== parent || initialized || event.data?.type !== 'initMermaid' || typeof event.data.script !== 'string') return;
  initialized = true;
  const script = document.createElement('script');
  script.nonce = scriptNonce;
  script.textContent = event.data.script;
  document.body.append(script);
});
parent.postMessage({ type: 'mermaidBootstrapReady' }, '*');

// Test-only observer: production reader still uses the actual VS Code API and resources.
const testApi = acquireVsCodeApi();
window.acquireVsCodeApi = () => testApi;
const failures = [];
const stages = [];
window.addEventListener('error', (event) => failures.push(event.message || event.target?.src || 'resource error'), true);
window.addEventListener('securitypolicyviolation', (event) => failures.push(`${event.violatedDirective}: ${event.blockedURI}`));
window.addEventListener('message', (event) => {
  if (event.data?.type?.startsWith('mermaid')) stages.push(event.data.type);
  if (event.data?.type !== 'render') return;
  const started = Date.now();
  const timer = setInterval(() => {
    const images = [...document.querySelectorAll('.mermaid-diagram')];
    const loaded = images.filter((image) => image.complete && image.naturalWidth > 0).length;
    const diagramErrors = [...document.querySelectorAll('.mermaid-error')].map((node) => node.textContent);
    if ((loaded < 3 || diagramErrors.length < 1) && Date.now() - started < 10_000) return;
    clearInterval(timer);
    testApi.postMessage({
      type: 'testRenderResult', loaded,
      headings: document.querySelectorAll('#document h1, #document h2').length,
      math: document.querySelectorAll('.katex').length,
      sandbox: document.querySelector('iframe')?.getAttribute('sandbox'),
      errors: failures,
      stages,
      diagramErrors
    });
  }, 100);
});

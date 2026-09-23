import mermaid from 'mermaid';

const config = {
  startOnLoad: false, securityLevel: 'strict' as const, suppressErrorRendering: true,
  htmlLabels: false, flowchart: { htmlLabels: false },
  maxTextSize: 50_000, maxEdges: 500,
  secure: ['secure', 'securityLevel', 'startOnLoad', 'suppressErrorRendering', 'maxTextSize', 'maxEdges', 'htmlLabels', 'flowchart', 'themeCSS', 'dompurifyConfig']
};
let theme: 'default' | 'dark' = 'default';
mermaid.initialize({ ...config, theme });

let queue = Promise.resolve();
window.addEventListener('message', (event: MessageEvent) => {
  if (event.source !== parent) return;
  const message = event.data;
  if (message?.type !== 'renderMermaid' || typeof message.id !== 'string' || !/^reader-mermaid-\d+$/.test(message.id) || typeof message.source !== 'string' || !['default', 'dark'].includes(message.theme)) return;
  queue = queue.then(async () => {
    try {
      if (message.source.length > 50_000) throw new Error('Diagram is too large');
      if (theme !== message.theme) {
        theme = message.theme;
        mermaid.initialize({ ...config, theme });
      }
      const { svg } = await mermaid.render(message.id, message.source);
      parent.postMessage({ type: 'mermaidResult', id: message.id, svg }, '*');
    } catch {
      parent.postMessage({ type: 'mermaidResult', id: message.id, error: true }, '*');
    }
  });
});
parent.postMessage({ type: 'mermaidReady' }, '*');

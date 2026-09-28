import { renderPlantUML } from './renderers/plantuml.js';
import { renderGraphviz } from './renderers/graphviz.js';

interface RenderRequest {
  type: 'renderDiagram';
  id: string;
  language: 'plantuml' | 'graphviz';
  source: string;
}

window.addEventListener('message', (event: MessageEvent) => {
  if (event.source !== parent) return;
  const message = event.data as Partial<RenderRequest> | undefined;
  if (message?.type !== 'renderDiagram' || typeof message.id !== 'string' ||
      !/^reader-local-diagram-\d+$/.test(message.id) ||
      (message.language !== 'plantuml' && message.language !== 'graphviz') || typeof message.source !== 'string') return;

  const render = message.language === 'plantuml' ? renderPlantUML : renderGraphviz;
  void render(message.source).then(
    (svg) => parent.postMessage({ type: 'diagramResult', id: message.id, svg }, '*'),
    (error: unknown) => parent.postMessage({
      type: 'diagramError', id: message.id,
      error: error instanceof Error ? error.message : String(error)
    }, '*')
  );
});

parent.postMessage({ type: 'localDiagramRuntimeReady' }, '*');

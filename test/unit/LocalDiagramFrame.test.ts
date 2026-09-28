// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { LocalDiagramFrame } from '../../src/webview/LocalDiagramFrame.js';

let renderer: LocalDiagramFrame | undefined;
afterEach(() => { renderer?.dispose(); renderer = undefined; vi.unstubAllGlobals(); vi.useRealTimers(); });

function setup() {
  document.body.innerHTML = '<style id="render-styles" nonce="test-nonce"></style>';
  document.body.dataset.localDiagramFrameUri = `data:text/html;base64,${btoa('<script nonce="MERMAID_NONCE"></script>')}`;
  document.body.dataset.localDiagramScriptUri = 'https://local-resource/local-diagram-frame.js';
  document.body.dataset.plantUmlVizScriptUri = 'https://local-resource/plantuml-viz-global.js';
  renderer = new LocalDiagramFrame(document);
  const pending = renderer.render('reader-local-diagram-1', 'plantuml', '@startuml\nAlice -> Bob\n@enduml');
  const frame = document.querySelector('iframe')!;
  const post = vi.spyOn(frame.contentWindow!, 'postMessage');
  const send = (data: unknown, source: Window = frame.contentWindow!) => window.dispatchEvent(new MessageEvent('message', { source, data }));
  return { pending, frame, post, send };
}

it('loads the local PlantUML assets in order and accepts SVG only from its sandbox', async () => {
  const fetch = vi.fn(async (uri: string) => ({
    ok: true,
    text: async () => uri.endsWith('plantuml-viz-global.js') ? 'window.Viz = {};' : 'bundled PlantUML frame'
  }));
  vi.stubGlobal('fetch', fetch);
  const { pending, frame, post, send } = setup();
  expect(frame.getAttribute('sandbox')).toBe('allow-scripts');
  expect(frame.srcdoc).toContain('nonce="test-nonce"');
  expect(frame.getAttribute('src')).toBeNull();

  send({ type: 'localDiagramBootstrapReady' }, window);
  expect(fetch).not.toHaveBeenCalled();
  send({ type: 'localDiagramBootstrapReady' });
  await vi.waitFor(() => expect(post).toHaveBeenCalledWith({
    type: 'initializeLocalDiagramRuntime',
    plantUmlVizScript: 'window.Viz = {};',
    runtimeScript: 'bundled PlantUML frame'
  }, '*'));
  expect(fetch).toHaveBeenNthCalledWith(1, 'https://local-resource/plantuml-viz-global.js');
  expect(fetch).toHaveBeenNthCalledWith(2, 'https://local-resource/local-diagram-frame.js');

  send({ type: 'localDiagramRuntimeReady' });
  await vi.waitFor(() => expect(post).toHaveBeenCalledWith({
    type: 'renderDiagram', id: 'reader-local-diagram-1', language: 'plantuml', source: '@startuml\nAlice -> Bob\n@enduml'
  }, '*'));
  const svg = '<svg xmlns="http://www.w3.org/2000/svg"><text>Alice</text></svg>';
  send({ type: 'diagramResult', id: 'reader-local-diagram-1', svg });
  await expect(pending).resolves.toBe(svg);
});

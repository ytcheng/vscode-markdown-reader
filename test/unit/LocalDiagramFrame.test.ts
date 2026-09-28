// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { LocalDiagramFrame } from '../../src/webview/LocalDiagramFrame.js';

let renderer: LocalDiagramFrame | undefined;
afterEach(() => { renderer?.dispose(); renderer = undefined; vi.unstubAllGlobals(); vi.useRealTimers(); });

function setup(dark = false) {
  document.body.innerHTML = '<style id="render-styles" nonce="test-nonce"></style>';
  document.body.dataset.localDiagramFrameUri = `data:text/html;base64,${btoa('<script nonce="MERMAID_NONCE"></script>')}`;
  document.body.dataset.localDiagramScriptUri = 'https://local-resource/local-diagram-frame.js';
  document.body.dataset.plantUmlVizScriptUri = 'https://local-resource/plantuml-viz-global.js';
  renderer = new LocalDiagramFrame(document);
  const pending = renderer.render('reader-local-diagram-1', 'plantuml', '@startuml\nAlice -> Bob\n@enduml', dark);
  const frame = document.querySelector('iframe')!;
  const post = vi.spyOn(frame.contentWindow!, 'postMessage');
  const send = (data: unknown, source: Window = frame.contentWindow!) => window.dispatchEvent(new MessageEvent('message', { source, data }));
  return { pending, frame, post, send };
}

it('loads the local PlantUML assets in order, forwards the color mode, and accepts SVG only from its sandbox', async () => {
  const fetch = vi.fn(async (uri: string) => ({
    ok: true,
    text: async () => uri.endsWith('plantuml-viz-global.js') ? 'window.Viz = {};' : 'bundled PlantUML frame'
  }));
  vi.stubGlobal('fetch', fetch);
  const { pending, frame, post, send } = setup(true);
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
    type: 'renderDiagram', id: 'reader-local-diagram-1', language: 'plantuml', source: '@startuml\nAlice -> Bob\n@enduml', dark: true
  }, '*'));
  const svg = '<svg xmlns="http://www.w3.org/2000/svg"><text>Alice</text></svg>';
  send({ type: 'diagramResult', id: 'reader-local-diagram-1', svg });
  await expect(pending).resolves.toBe(svg);
});

it('ignores unknown, mismatched, and foreign messages until the matching frame replies', async () => {
  const { pending, send } = setup();
  const svg = '<svg xmlns="http://www.w3.org/2000/svg"></svg>';
  let settled = false;
  void pending.then(() => { settled = true; }, () => { settled = true; });

  send({ type: 'unknownMessage', id: 'reader-local-diagram-1', svg });
  send({ type: 'diagramResult', id: 'reader-local-diagram-2', svg });
  send({ type: 'diagramResult', id: 'reader-local-diagram-1', svg }, window);
  await Promise.resolve();
  expect(settled).toBe(false);

  send({ type: 'diagramResult', id: 'reader-local-diagram-1', svg });
  await expect(pending).resolves.toBe(svg);
});

it('isolates one diagram error from another pending request', async () => {
  const { pending: first, send } = setup();
  const second = renderer!.render('reader-local-diagram-2', 'graphviz', 'digraph { A -> B }');
  const firstError = expect(first).rejects.toThrow('DOT syntax error');
  const svg = '<svg xmlns="http://www.w3.org/2000/svg"></svg>';

  send({ type: 'diagramError', id: 'reader-local-diagram-1', error: 'DOT syntax error' });
  await firstError;
  send({ type: 'diagramResult', id: 'reader-local-diagram-2', svg });
  await expect(second).resolves.toBe(svg);
});

it('disposes a timed-out frame, rejects its pending requests, and retries in a fresh frame', async () => {
  vi.useFakeTimers();
  const { pending: first, frame } = setup();
  const second = renderer!.render('reader-local-diagram-2', 'graphviz', 'digraph { A -> B }');
  const firstError = expect(first).rejects.toThrow('Diagram rendering timed out');
  const secondError = expect(second).rejects.toThrow('Diagram rendering timed out');

  await vi.advanceTimersByTimeAsync(30_000);
  await Promise.all([firstError, secondError]);
  expect(frame.isConnected).toBe(false);
  expect(document.querySelectorAll('iframe')).toHaveLength(0);

  const retry = renderer!.render('reader-local-diagram-3', 'graphviz', 'digraph { B -> C }');
  const retryError = expect(retry).rejects.toThrow('Local diagram renderer disposed');
  const retryFrame = document.querySelector('iframe');
  expect(retryFrame).not.toBe(frame);
  renderer!.dispose();
  await retryError;
});

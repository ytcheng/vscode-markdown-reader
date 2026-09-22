// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { MermaidFrame } from '../../src/webview/MermaidFrame.js';

let renderer: MermaidFrame | undefined;
afterEach(() => { renderer?.dispose(); vi.unstubAllGlobals(); vi.useRealTimers(); });

function setup() {
  document.body.innerHTML = '<style id="render-styles" nonce="test-nonce"></style>';
  document.body.dataset.mermaidFrameUri = `data:text/html;base64,${btoa('<script nonce="MERMAID_NONCE"></script>')}`;
  document.body.dataset.mermaidScriptUri = 'https://local-resource/mermaid.js';
  renderer = new MermaidFrame(document);
  const rendering = renderer.render('reader-mermaid-1', 'graph TD; A-->B');
  const frame = document.querySelector('iframe')!;
  const post = vi.spyOn(frame.contentWindow!, 'postMessage');
  const send = (data: unknown, source: Window = frame.contentWindow!) => window.dispatchEvent(new MessageEvent('message', { source, data }));
  return { rendering, frame, post, send };
}

it('loads local code through the parent and only accepts the sandbox message source', async () => {
  const fetch = vi.fn(async () => ({ ok: true, text: async () => 'bundled script' }));
  vi.stubGlobal('fetch', fetch);
  const { rendering, frame, post, send } = setup();
  expect(frame.getAttribute('sandbox')).toBe('allow-scripts');
  expect(frame.srcdoc).toContain('nonce="test-nonce"');
  expect(frame.getAttribute('src')).toBeNull();
  send({ type: 'mermaidBootstrapReady' }, window);
  expect(fetch).not.toHaveBeenCalled();
  send({ type: 'mermaidBootstrapReady' });
  await vi.waitFor(() => expect(post).toHaveBeenCalledWith({ type: 'initMermaid', script: 'bundled script' }, '*'));
  expect(fetch).toHaveBeenCalledWith('https://local-resource/mermaid.js');
  send({ type: 'mermaidReady' });
  await vi.waitFor(() => expect(post).toHaveBeenCalledWith(expect.objectContaining({ type: 'renderMermaid' }), '*'));
  send({ type: 'mermaidResult', id: 'reader-mermaid-1', svg: '<svg/>' });
  await expect(rendering).resolves.toEqual({ svg: '<svg/>' });
});

it('fails all diagrams immediately after initialization times out', async () => {
  vi.useFakeTimers();
  const { rendering } = setup();
  const first = expect(rendering).rejects.toThrow('timed out');
  const second = expect(renderer!.render('reader-mermaid-2', 'graph TD; B-->C')).rejects.toThrow('timed out');
  await vi.advanceTimersByTimeAsync(30_000);
  await Promise.all([first, second]);
  await expect(renderer!.render('reader-mermaid-3', 'graph TD; C-->D')).rejects.toThrow('timed out');
});

it('does not send a fetched script after disposal', async () => {
  let finish!: (script: string) => void;
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, text: () => new Promise<string>((resolve) => { finish = resolve; }) })));
  const { rendering, post, send } = setup();
  const rejected = expect(rendering).rejects.toThrow('disposed');
  send({ type: 'mermaidBootstrapReady' });
  await vi.waitFor(() => expect(finish).toBeDefined());
  renderer!.dispose();
  finish('bundled script');
  await rejected;
  expect(post).not.toHaveBeenCalled();
});

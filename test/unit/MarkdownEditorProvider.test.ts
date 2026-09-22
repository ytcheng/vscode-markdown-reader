import { beforeEach, describe, expect, it, vi } from 'vitest';

const vscode = vi.hoisted(() => {
  const state: { changeTextDocument?: (event: { document: unknown }) => void } = {};
  return {
  __state: state,
  workspace: {
    onDidChangeTextDocument: vi.fn((handler: (event: { document: unknown }) => void) => {
      state.changeTextDocument = handler;
      return { dispose: vi.fn() };
    }),
    getConfiguration: vi.fn(() => ({ get: vi.fn((_key: string, fallback: unknown) => fallback), update: vi.fn() }))
  },
  Uri: { joinPath: vi.fn(() => ({ toString: () => 'webview-resource' })) },
  window: { activeTextEditor: undefined },
  commands: { executeCommand: vi.fn() },
  env: { openExternal: vi.fn() },
  ConfigurationTarget: { Global: true }
  };
});

vi.mock('vscode', () => vscode);

import { MarkdownEditorProvider } from '../../src/editor/MarkdownEditorProvider.js';

describe('MarkdownEditorProvider', () => {
  beforeEach(() => vi.clearAllMocks());

  it('forwards a Webview TOC toggle request as an updated visibility message', async () => {
    let receive: ((message: unknown) => void) | undefined;
    const postMessage = vi.fn(async () => true);
    const panel = {
      active: true,
      webview: {
        cspSource: 'vscode-webview:',
        options: {},
        html: '',
        asWebviewUri: vi.fn(() => ({ toString: () => 'webview-resource' })),
        postMessage,
        onDidReceiveMessage: vi.fn((handler: (message: unknown) => void) => {
          receive = handler;
          return { dispose: vi.fn() };
        })
      },
      onDidDispose: vi.fn(),
      onDidChangeViewState: vi.fn()
    };
    const document = { uri: { toString: () => 'file:///reader.md' }, getText: () => '# Reader' };
    const context = { extensionUri: {}, subscriptions: [] };
    const provider = new MarkdownEditorProvider(context as never);

    await provider.resolveCustomTextEditor(document as never, panel as never);
    receive!({ type: 'toggleToc' });

    expect(postMessage).toHaveBeenCalledWith({ type: 'setTocVisible', visible: false });
  });

  it('sends layout and rendered content after the Webview signals readiness', async () => {
    let receive: ((message: unknown) => void) | undefined;
    const postMessage = vi.fn(async () => true);
    const panel = {
      active: true,
      webview: {
        cspSource: 'vscode-webview:', options: {}, html: '',
        asWebviewUri: vi.fn(() => ({ toString: () => 'webview-resource' })), postMessage,
        onDidReceiveMessage: vi.fn((handler: (message: unknown) => void) => {
          receive = handler;
          return { dispose: vi.fn() };
        })
      },
      onDidDispose: vi.fn(), onDidChangeViewState: vi.fn()
    };
    const document = { uri: { toString: () => 'file:///reader.md' }, getText: () => '# Reader' };
    const provider = new MarkdownEditorProvider({ extensionUri: {}, subscriptions: [] } as never);

    await provider.resolveCustomTextEditor(document as never, panel as never);
    receive!({ type: 'ready' });

    await vi.waitFor(() => {
      expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'setLayout', tocWidth: 260 }));
      expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'render' }));
    });
  });

  it('refreshes a preview from a replacement document model with the same URI', async () => {
    vi.useFakeTimers();
    let receive: ((message: unknown) => void) | undefined;
    const postMessage = vi.fn(async () => true);
    const panel = {
      active: true,
      webview: {
        cspSource: 'vscode-webview:', options: {}, html: '',
        asWebviewUri: vi.fn(() => ({ toString: () => 'webview-resource' })), postMessage,
        onDidReceiveMessage: vi.fn((handler: (message: unknown) => void) => {
          receive = handler;
          return { dispose: vi.fn() };
        })
      },
      onDidDispose: vi.fn(), onDidChangeViewState: vi.fn()
    };
    const uri = { toString: () => 'file:///reader.md' };
    const initialDocument = { uri, getText: () => '# old' };
    const updatedDocument = { uri, getText: () => '# new' };
    const provider = new MarkdownEditorProvider({ extensionUri: {}, subscriptions: [] } as never);

    await provider.resolveCustomTextEditor(initialDocument as never, panel as never);
    receive!({ type: 'ready' });
    await vi.advanceTimersByTimeAsync(0);
    postMessage.mockClear();

    vscode.__state.changeTextDocument!({ document: updatedDocument });
    await vi.advanceTimersByTimeAsync(200);

    expect(postMessage).toHaveBeenLastCalledWith(expect.objectContaining({
      type: 'render',
      result: expect.objectContaining({ html: expect.stringContaining('new') })
    }));
    vi.useRealTimers();
  });
});

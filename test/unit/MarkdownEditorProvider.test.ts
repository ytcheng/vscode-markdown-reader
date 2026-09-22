import { beforeEach, describe, expect, it, vi } from 'vitest';

const vscode = vi.hoisted(() => {
  const state: {
    changeTextDocument?: (event: { document: unknown }) => void;
    fileChanged?: (uri: unknown) => void;
    watchers: Array<{ dispose: ReturnType<typeof vi.fn> }>;
  } = { watchers: [] };
  return {
  __state: state,
  workspace: {
    fs: { readFile: vi.fn(async () => Buffer.from('<!doctype html><html></html>')) },
    onDidChangeTextDocument: vi.fn((handler: (event: { document: unknown }) => void) => {
      state.changeTextDocument = handler;
      return { dispose: vi.fn() };
    }),
    createFileSystemWatcher: vi.fn(() => {
      const watcher = {
        onDidChange: vi.fn((handler: (uri: unknown) => void) => {
          state.fileChanged = handler;
          return { dispose: vi.fn() };
        }),
        dispose: vi.fn()
      };
      state.watchers.push(watcher);
      return watcher;
    }),
    openTextDocument: vi.fn(),
    getConfiguration: vi.fn(() => ({ get: vi.fn((_key: string, fallback: unknown) => fallback), update: vi.fn() }))
  },
  Uri: { joinPath: vi.fn(() => ({ toString: () => 'webview-resource' })) },
  RelativePattern: vi.fn(),
  Disposable: { from: vi.fn((...disposables: Array<{ dispose: () => void }>) => ({ dispose: () => disposables.forEach((disposable) => disposable.dispose()) })) },
  window: { activeTextEditor: undefined, showTextDocument: vi.fn() },
  Position: class { constructor(public line: number, public character: number) {} },
  Selection: class { constructor(public start: unknown, public end: unknown) {} },
  TextEditorRevealType: { InCenterIfOutsideViewport: 2 },
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

  it('refreshes after an external file write and disposes its watcher when the preview closes', async () => {
    vi.useFakeTimers();
    let disposePanel: (() => void) | undefined;
    const postMessage = vi.fn(async () => true);
    const panel = {
      active: true,
      webview: {
        cspSource: 'vscode-webview:', options: {}, html: '',
        asWebviewUri: vi.fn(() => ({ toString: () => 'webview-resource' })), postMessage,
        onDidReceiveMessage: vi.fn()
      },
      onDidDispose: vi.fn((handler: () => void) => {
        disposePanel = handler;
        return { dispose: vi.fn() };
      }),
      onDidChangeViewState: vi.fn()
    };
    const uri = { scheme: 'file', toString: () => 'file:///reader.md' };
    const document = { uri, getText: () => '# initial' };
    const updatedDocument = { uri, getText: () => '# external' };
    vscode.workspace.openTextDocument.mockResolvedValue(updatedDocument);
    const provider = new MarkdownEditorProvider({ extensionUri: {}, subscriptions: [] } as never);

    await provider.resolveCustomTextEditor(document as never, panel as never);

    expect(vscode.workspace.createFileSystemWatcher).toHaveBeenCalledOnce();
    const watcher = vscode.__state.watchers[0]!;
    vscode.__state.fileChanged!(uri);
    await vi.advanceTimersByTimeAsync(200);
    expect(postMessage).toHaveBeenLastCalledWith(expect.objectContaining({
      type: 'render',
      result: expect.objectContaining({ html: expect.stringContaining('external') })
    }));

    disposePanel!();
    expect(watcher.dispose).toHaveBeenCalledOnce();

    const reopenedPostMessage = vi.fn(async () => true);
    const reopenedPanel = {
      active: true,
      webview: {
        cspSource: 'vscode-webview:', options: {}, html: '',
        asWebviewUri: vi.fn(() => ({ toString: () => 'webview-resource' })), postMessage: reopenedPostMessage,
        onDidReceiveMessage: vi.fn()
      },
      onDidDispose: vi.fn(), onDidChangeViewState: vi.fn()
    };
    const reopenedDocument = { uri, getText: () => '# reopened' };
    vscode.workspace.openTextDocument.mockResolvedValue(reopenedDocument);
    await provider.resolveCustomTextEditor(reopenedDocument as never, reopenedPanel as never);
    expect(vscode.workspace.createFileSystemWatcher).toHaveBeenCalledTimes(2);
    vscode.__state.fileChanged!(uri);
    await vi.advanceTimersByTimeAsync(200);
    expect(reopenedPostMessage).toHaveBeenLastCalledWith(expect.objectContaining({
      type: 'render',
      result: expect.objectContaining({ html: expect.stringContaining('reopened') })
    }));
    vi.useRealTimers();
  });
});


it('opens source in the originating editor group and clamps the requested line', async () => {
  let receive: (message: unknown) => void = () => undefined;
  const uri = { toString: () => 'file:///position.md' };
  const doc = { uri, getText: () => '# heading', lineCount: 4 };
  const editor = { revealRange: vi.fn() };
  vscode.workspace.openTextDocument.mockResolvedValue(doc);
  vscode.window.showTextDocument.mockResolvedValue(editor);
  const provider = new MarkdownEditorProvider({ extensionUri: {}, subscriptions: [] } as never);
  const panel = {
    active: true, viewColumn: 2,
    webview: { cspSource: 'vscode-webview:', asWebviewUri: () => ({ toString: () => 'resource' }), postMessage: vi.fn(async () => true), onDidReceiveMessage: (handler: typeof receive) => { receive = handler; } },
    onDidDispose: vi.fn(), onDidChangeViewState: vi.fn()
  };
  await provider.resolveCustomTextEditor(doc as never, panel as never);
  receive({ type: 'openSource', line: 999 });
  await vi.waitFor(() => expect(vscode.window.showTextDocument).toHaveBeenCalledWith(doc, expect.objectContaining({
    viewColumn: 2, preview: false, selection: expect.objectContaining({ start: expect.objectContaining({ line: 3, character: 0 }) })
  })));
  expect(editor.revealRange).toHaveBeenCalled();
});

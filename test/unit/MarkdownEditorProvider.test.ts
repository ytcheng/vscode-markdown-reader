import { beforeEach, describe, expect, it, vi } from 'vitest';

const vscode = vi.hoisted(() => {
  const state: {
    changeTextDocument?: (event: { document: unknown }) => void;
    fileChanged?: (uri: unknown) => void;
    configurationChanged?: (event: { affectsConfiguration: (section: string) => boolean }) => void;
    watchers: Array<{ dispose: ReturnType<typeof vi.fn> }>;
  } = { watchers: [] };
  return {
  __state: state,
  workspace: {
    fs: { readFile: vi.fn(async () => Buffer.from('<!doctype html><html></html>')) },
    onDidChangeConfiguration: vi.fn((handler) => { state.configurationChanged = handler; return { dispose: vi.fn() }; }),
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
  window: { activeTextEditor: undefined, showTextDocument: vi.fn(), showErrorMessage: vi.fn() },
  Position: class { constructor(public line: number, public character: number) {} },
  Selection: class { constructor(public start: unknown, public end: unknown) {} },
  TextEditorRevealType: { InCenterIfOutsideViewport: 2 },
  commands: { executeCommand: vi.fn() },
  env: { openExternal: vi.fn() },
  ConfigurationTarget: { Global: 1, Workspace: 2, WorkspaceFolder: 3 }
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


it('loads resource-scoped settings and broadcasts workspace configuration changes', async () => {
  const get = vi.fn((key: string, fallback: unknown) => key === 'theme' ? 'github' : fallback);
  vscode.workspace.getConfiguration.mockReturnValue({ get, update: vi.fn() });
  const provider = new MarkdownEditorProvider({ extensionUri: {}, subscriptions: [] } as never);
  const panels: Array<{ webview: { postMessage: ReturnType<typeof vi.fn> } }> = [];
  const receivers: Array<(value: unknown) => void> = [];
  for (const name of ['a', 'b']) {
    const panel = {
      active: true,
      webview: { cspSource: 'webview:', asWebviewUri: () => ({ toString: () => 'resource' }), postMessage: vi.fn(async () => true), onDidReceiveMessage: (handler: (value: unknown) => void) => { receivers.push(handler); } },
      onDidDispose: vi.fn(), onDidChangeViewState: vi.fn()
    };
    await provider.resolveCustomTextEditor({ uri: { toString: () => `file:///${name}.md` }, getText: () => '# Title' } as never, panel as never);
    panels.push(panel);
  }
  receivers.forEach((receive) => receive({ type: 'ready' }));
  await vi.waitFor(() => panels.forEach((panel) => expect(panel.webview.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'setReaderSettings', settings: expect.objectContaining({ theme: 'github' }) }))));
  panels.forEach((panel) => panel.webview.postMessage.mockClear());
  get.mockImplementation((key, fallback) => key === 'fontSize' ? 24 : fallback);
  vscode.__state.configurationChanged!({ affectsConfiguration: () => true });
  await vi.waitFor(() => panels.forEach((panel) => expect(panel.webview.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'setReaderSettings', settings: expect.objectContaining({ fontSize: 24 }) }))));
});

it('exports an immutable source snapshot and drops stale diagram images', async () => {
  const { ExportService } = await import('../../src/export/ExportService.js');
  const exported = vi.spyOn(ExportService.prototype, 'exportDocument').mockResolvedValue();
  let receive: (value: unknown) => void = () => undefined;
  let source = '# Original\n\n```mermaid\ngraph TD; A-->B\n```';
  const uri = { toString: () => 'file:///snapshot.md' };
  const document = { uri, version: 1, getText: () => source };
  vscode.workspace.getConfiguration.mockReturnValue({ get: vi.fn((_key, fallback) => fallback), update: vi.fn() });
  vscode.workspace.openTextDocument.mockResolvedValue(document);
  const postMessage = vi.fn(async () => true);
  const panel = {
    active: true,
    webview: { cspSource: 'webview:', asWebviewUri: () => ({ toString: () => 'resource' }), postMessage, onDidReceiveMessage: (handler: typeof receive) => { receive = handler; } },
    onDidDispose: vi.fn(), onDidChangeViewState: vi.fn()
  };
  const provider = new MarkdownEditorProvider({ extensionUri: {}, subscriptions: [] } as never);
  await provider.resolveCustomTextEditor(document as never, panel as never);
  receive({ type: 'ready' });
  await vi.waitFor(() => expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'render' })));
  const diagrams = ['data:image/svg+xml;charset=utf-8,%3Csvg%3E%3C%2Fsvg%3E'];
  receive({ type: 'exportHtml', revision: 1, diagrams });
  await vi.waitFor(() => expect(exported).toHaveBeenCalledTimes(1));
  expect(exported.mock.calls[0][2]).toEqual(diagrams);
  source = '# Changed\n\n```mermaid\ngraph TD; C-->D\n```';
  expect(exported.mock.calls[0][0].getText()).toContain('Original');
  receive({ type: 'exportHtml', revision: 1, diagrams });
  await vi.waitFor(() => expect(exported).toHaveBeenCalledTimes(2));
  expect(exported.mock.calls[1][2]).toEqual([]);
  expect(exported.mock.calls[1][0].getText()).toContain('Changed');
  exported.mockRestore();
});

it('stops initializing when the preview closes while its frame resource is loading', async () => {
  type FrameBytes = Awaited<ReturnType<typeof vscode.workspace.fs.readFile>>;
  let finishRead: ((bytes: FrameBytes) => void) | undefined;
  vscode.workspace.fs.readFile.mockImplementationOnce(() => new Promise<FrameBytes>((resolve) => { finishRead = resolve; }));
  let disposePanel: (() => void) | undefined;
  let disposed = false;
  const webview = {
    cspSource: 'webview:', options: {}, html: '',
    asWebviewUri: vi.fn(() => ({ toString: () => 'resource' })),
    postMessage: vi.fn(async () => true), onDidReceiveMessage: vi.fn()
  };
  const panel = {
    get webview() {
      if (disposed) throw new Error('Webview is disposed');
      return webview;
    },
    onDidDispose: vi.fn((handler: () => void) => { disposePanel = handler; }),
    onDidChangeViewState: vi.fn()
  };
  const document = { uri: { toString: () => 'file:///closing.md' }, getText: () => '# Closing' };
  const provider = new MarkdownEditorProvider({ extensionUri: {}, subscriptions: [] } as never);

  const resolving = provider.resolveCustomTextEditor(document as never, panel as never);
  await vi.waitFor(() => expect(finishRead).toBeDefined());
  disposed = true;
  disposePanel?.();
  finishRead!(Buffer.from('<!doctype html>'));

  await expect(resolving).resolves.toBeUndefined();
  expect(webview.postMessage).not.toHaveBeenCalled();
});

it('does not report a disposed Webview while a ready message is being handled', async () => {
  let disposePanel: (() => void) | undefined;
  let receive: ((message: unknown) => void) | undefined;
  let failPost: ((error: Error) => void) | undefined;
  let disposed = false;
  const postMessage = vi.fn().mockImplementationOnce(() => new Promise<boolean>((_resolve, reject) => { failPost = reject; }))
    .mockImplementation(async () => {
      if (disposed) throw new Error('Webview is disposed');
      return true;
    });
  const webview = {
    cspSource: 'webview:', options: {}, html: '',
    asWebviewUri: vi.fn(() => ({ toString: () => 'resource' })), postMessage,
    onDidReceiveMessage: vi.fn((handler: (message: unknown) => void) => { receive = handler; })
  };
  const panel = {
    get webview() {
      if (disposed) throw new Error('Webview is disposed');
      return webview;
    },
    onDidDispose: vi.fn((handler: () => void) => { disposePanel = handler; }),
    onDidChangeViewState: vi.fn()
  };
  const document = { uri: { toString: () => 'file:///ready.md' }, getText: () => '# Ready' };
  const provider = new MarkdownEditorProvider({ extensionUri: {}, subscriptions: [] } as never);

  await provider.resolveCustomTextEditor(document as never, panel as never);
  receive!({ type: 'ready' });
  await vi.waitFor(() => expect(failPost).toBeDefined());
  disposed = true;
  disposePanel!();
  failPost!(new Error('Webview is disposed'));

  await new Promise<void>((resolve) => setImmediate(resolve));
  expect(postMessage).toHaveBeenCalledTimes(1);
  expect(vscode.window.showErrorMessage).not.toHaveBeenCalled();
});

import * as vscode from 'vscode';
import { randomBytes } from 'node:crypto';
import { TocStateStore } from './TocStateStore.js';
import type { HeadingItem } from '../renderer/types.js';
import { DocumentSession, type RenderSink } from './DocumentSession.js';
import { NavigationCoordinator } from './NavigationCoordinator.js';
import { WebviewResourceRewriter } from '../links/WebviewResourceRewriter.js';
import { ResourceResolver } from '../links/ResourceResolver.js';
import { MarkdownRenderer } from '../renderer/MarkdownRenderer.js';
import { classifyLink } from '../security/links.js';
import { parseWebviewMessage } from '../security/messages.js';
import { getWebviewHtml } from '../webview/html.js';
import type { ViewportState } from '../webview/messages.js';

export const MARKDOWN_READER_VIEW_TYPE = 'markdownReader.preview';

export class MarkdownEditorProvider implements vscode.CustomTextEditorProvider {
  readonly #sessions = new Map<string, DocumentSession>();
  readonly #watchers = new Map<string, vscode.Disposable>();
  readonly #states = new WeakMap<vscode.WebviewPanel, ViewportState>();
  readonly #tocStates: TocStateStore;
  readonly #panelUris = new WeakMap<vscode.WebviewPanel, string>();
  readonly #headings = new WeakMap<vscode.WebviewPanel, HeadingItem[]>();
  readonly #renderer = new MarkdownRenderer();
  readonly #resolver = new ResourceResolver();
  readonly #navigation = new NavigationCoordinator();
  #mermaidFrameUri: PromiseLike<string> | undefined;
  activeDocumentUri: vscode.Uri | undefined;
  #activePanel: vscode.WebviewPanel | undefined;

  constructor(private readonly context: vscode.ExtensionContext) {
    this.#tocStates = new TocStateStore(context.workspaceState);
    context.subscriptions.push(vscode.workspace.onDidChangeTextDocument((event) => {
      const session = this.#sessions.get(event.document.uri.toString());
      if (!session) return;
      session.setTextProvider(() => event.document.getText());
      session.schedule();
    }));
  }

  async resolveCustomTextEditor(document: vscode.TextDocument, panel: vscode.WebviewPanel): Promise<void> {
    const key = document.uri.toString();
    this.#panelUris.set(panel, key);
    const toc = this.#tocStates.get(key) ?? {
      tocVisible: vscode.workspace.getConfiguration('markdownReader').get<boolean>('toc.enabled', true),
      collapsedSlugs: []
    };
    this.#states.set(panel, { ...toc, scrollTop: 0 });
    this.activeDocumentUri = document.uri;
    this.#activePanel = panel;
    this.#navigation.markActive(document.uri.toString(), panel.webview);
    panel.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.context.extensionUri, vscode.Uri.joinPath(document.uri, '..')]
    };
    panel.webview.html = getWebviewHtml({
      cspSource: panel.webview.cspSource,
      mermaidScriptUri: panel.webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'mermaid-frame.js')).toString(),
      mermaidFrameUri: await (this.#mermaidFrameUri ??= vscode.workspace.fs.readFile(
        vscode.Uri.joinPath(this.context.extensionUri, 'media', 'mermaid-frame.html')
      ).then((bytes) => `data:text/html;base64,${Buffer.from(bytes).toString('base64')}`)),
      nonce: randomBytes(18).toString('base64'),
      katexStyleUri: panel.webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'katex', 'katex.min.css')).toString(),
      scriptUri: panel.webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'reader.js')).toString(),
      styleUri: panel.webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'reader.css')).toString(),
      highContrastStyleUri: panel.webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'high-contrast.css')).toString()
    });

    const session = this.#sessionFor(document);
    const sink: RenderSink = {
      postRender: async (result) => {
        this.#headings.set(panel, result.headings);
        const rewriter = new WebviewResourceRewriter({ resolve: (href) => this.#resolver.resolve(document.uri, href)?.uri });
        const rewritten = rewriter.rewrite(result, panel.webview);
        return panel.webview.postMessage({ type: 'render', result: rewritten, restore: this.#states.get(panel) });
      }
    };
    session.attach(sink);
    this.#watchFile(document);

    panel.onDidDispose(() => {
      if (this.#activePanel === panel) this.#activePanel = undefined;
      this.#navigation.remove(document.uri.toString(), panel.webview);
      session.detach(sink);
      this.#disposeSession(document.uri.toString());
    }, undefined, this.context.subscriptions);
    panel.onDidChangeViewState(() => { if (panel.active) { this.activeDocumentUri = document.uri; this.#activePanel = panel; this.#navigation.markActive(document.uri.toString(), panel.webview); } }, undefined, this.context.subscriptions);
    panel.webview.onDidReceiveMessage((raw) => void this.#handleMessage(raw, document, panel), undefined, this.context.subscriptions);
  }

  async openPreview(uri = this.activeDocumentUri): Promise<void> {
    if (!uri) return;
    await vscode.commands.executeCommand('vscode.openWith', uri, MARKDOWN_READER_VIEW_TYPE, { preview: false });
  }

  async openSource(uri = this.activeDocumentUri, line?: number, panel = this.#activePanel): Promise<void> {
    if (!uri) return;
    if (line === undefined && panel) {
      const slug = this.#states.get(panel)?.activeSlug;
      line = this.#headings.get(panel)?.find((heading) => heading.slug === slug)?.line;
    }
    const viewColumn = panel?.viewColumn;
    await vscode.commands.executeCommand('vscode.openWith', uri, 'default', { preview: false, viewColumn });
    if (line === undefined || !Number.isSafeInteger(line) || line < 0) return;
    const document = await vscode.workspace.openTextDocument(uri);
    const position = new vscode.Position(Math.min(line, Math.max(0, document.lineCount - 1)), 0);
    const selection = new vscode.Selection(position, position);
    const editor = await vscode.window.showTextDocument(document, { viewColumn, preview: false, selection });
    editor.revealRange(selection, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
  }

  async togglePreview(): Promise<void> {
    const source = vscode.window.activeTextEditor?.document;
    if (source?.languageId === 'markdown') await this.openPreview(source.uri);
    else await this.openSource();
  }

  toggleToc(): void {
    const panel = this.#activePanel;
    if (!panel) return;
    this.#toggleToc(panel);
  }

  #toggleToc(panel: vscode.WebviewPanel): void {
    const current = this.#states.get(panel)?.tocVisible ?? true;
    void panel.webview.postMessage({ type: 'setTocVisible', visible: !current });
    const state = { ...(this.#states.get(panel) ?? { scrollTop: 0, collapsedSlugs: [] }), tocVisible: !current };
    this.#states.set(panel, state);
    this.#rememberToc(panel, state);
  }

  #sessionFor(document: vscode.TextDocument): DocumentSession {
    const key = document.uri.toString();
    let session = this.#sessions.get(key);
    if (!session) {
      session = new DocumentSession(() => document.getText(), this.#renderer);
      this.#sessions.set(key, session);
    }
    session.setTextProvider(() => document.getText());
    return session;
  }

  #watchFile(document: vscode.TextDocument): void {
    const key = document.uri.toString();
    if (document.uri.scheme !== 'file' || this.#watchers.has(key)) return;
    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(document.uri, '*'),
      true,
      false,
      true
    );
    const changeSubscription = watcher.onDidChange((uri) => void this.#refreshFromFile(uri));
    this.#watchers.set(key, vscode.Disposable.from(watcher, changeSubscription));
  }

  async #refreshFromFile(uri: vscode.Uri): Promise<void> {
    const session = this.#sessions.get(uri.toString());
    if (!session) return;
    try {
      const document = await vscode.workspace.openTextDocument(uri);
      session.setTextProvider(() => document.getText());
      session.schedule();
    } catch {
      // File deletion and short-lived I/O failures are retried by the next file event.
    }
  }

  #disposeSession(key: string): void {
    const session = this.#sessions.get(key);
    if (!session || session.hasPanels) return;
    session.dispose();
    this.#sessions.delete(key);
    this.#watchers.get(key)?.dispose();
    this.#watchers.delete(key);
  }

  async #handleMessage(raw: unknown, document: vscode.TextDocument, panel: vscode.WebviewPanel): Promise<void> {
    const message = parseWebviewMessage(raw);
    if (!message) return;
    if (message.type === 'ready') {
      this.#navigation.ready(document.uri.toString(), panel.webview);
      await this.#postLayout(panel);
      await this.#sessionFor(document).renderNow();
      return;
    }
    if (message.type === 'viewportChanged') {
      this.#states.set(panel, message.state);
      this.#rememberToc(panel, message.state);
    }
    if (message.type === 'openSource') await this.openSource(document.uri, message.line, panel);
    if (message.type === 'toggleToc') {
      this.#toggleToc(panel);
      return;
    }
    if (message.type === 'setTocWidth') {
      await vscode.workspace.getConfiguration('markdownReader').update('toc.width', message.width, vscode.ConfigurationTarget.Global);
      await this.#postLayout(panel);
      return;
    }
    if (message.type !== 'openLink') return;

    const kind = classifyLink(message.href);
    if (kind === 'external') await vscode.env.openExternal(vscode.Uri.parse(message.href));
    if (kind === 'local' || kind === 'markdown') {
      const resolved = this.#resolver.resolve(document.uri, message.href);
      if (!resolved) return;
      if (kind === 'markdown') {
        this.#navigation.navigate(resolved.uri.toString(), resolved.fragment);
        await vscode.commands.executeCommand('vscode.openWith', resolved.uri, MARKDOWN_READER_VIEW_TYPE, { preview: false });
      }
      else await vscode.commands.executeCommand('vscode.open', resolved.uri);
    }
  }

  #rememberToc(panel: vscode.WebviewPanel, state: ViewportState): void {
    const uri = this.#panelUris.get(panel);
    if (uri) void this.#tocStates.set(uri, state).catch((error: unknown) => console.error('Unable to save Markdown Reader TOC state', error));
  }

  async #postLayout(panel: vscode.WebviewPanel): Promise<void> {
    const configuration = vscode.workspace.getConfiguration('markdownReader');
    await panel.webview.postMessage({
      type: 'setLayout',
      tocMaxDepth: configuration.get<number>('toc.maxDepth', 3),
      tocWidth: configuration.get<number>('toc.width', 260),
      contentMaxWidth: configuration.get<number>('content.maxWidth', 900)
    });
  }
}

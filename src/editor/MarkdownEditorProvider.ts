import * as vscode from 'vscode';
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
  readonly #states = new WeakMap<vscode.WebviewPanel, ViewportState>();
  readonly #renderer = new MarkdownRenderer();
  readonly #resolver = new ResourceResolver();
  readonly #navigation = new NavigationCoordinator();
  activeDocumentUri: vscode.Uri | undefined;
  #activePanel: vscode.WebviewPanel | undefined;

  constructor(private readonly context: vscode.ExtensionContext) {
    context.subscriptions.push(vscode.workspace.onDidChangeTextDocument((event) => {
      const session = this.#sessions.get(event.document.uri.toString());
      if (!session) return;
      session.setTextProvider(() => event.document.getText());
      session.schedule();
    }));
  }

  async resolveCustomTextEditor(document: vscode.TextDocument, panel: vscode.WebviewPanel): Promise<void> {
    this.activeDocumentUri = document.uri;
    this.#activePanel = panel;
    this.#navigation.markActive(document.uri.toString(), panel.webview);
    panel.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.context.extensionUri, vscode.Uri.joinPath(document.uri, '..')]
    };
    panel.webview.html = getWebviewHtml({
      cspSource: panel.webview.cspSource,
      scriptUri: panel.webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'reader.js')).toString(),
      styleUri: panel.webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'reader.css')).toString(),
      highContrastStyleUri: panel.webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'high-contrast.css')).toString()
    });

    const session = this.#sessionFor(document);
    const sink: RenderSink = {
      postRender: async (result) => {
        const rewriter = new WebviewResourceRewriter({ resolve: (href) => this.#resolver.resolve(document.uri, href)?.uri });
        const rewritten = rewriter.rewrite(result, panel.webview);
        return panel.webview.postMessage({ type: 'render', result: rewritten, restore: this.#states.get(panel) });
      }
    };
    session.attach(sink);

    panel.onDidDispose(() => session.detach(sink), undefined, this.context.subscriptions);
    panel.onDidChangeViewState(() => { if (panel.active) { this.activeDocumentUri = document.uri; this.#activePanel = panel; this.#navigation.markActive(document.uri.toString(), panel.webview); } }, undefined, this.context.subscriptions);
    panel.webview.onDidReceiveMessage((raw) => void this.#handleMessage(raw, document, panel), undefined, this.context.subscriptions);
  }

  async openPreview(uri = this.activeDocumentUri): Promise<void> {
    if (!uri) return;
    await vscode.commands.executeCommand('vscode.openWith', uri, MARKDOWN_READER_VIEW_TYPE, { preview: false });
  }

  async openSource(uri = this.activeDocumentUri): Promise<void> {
    if (!uri) return;
    await vscode.commands.executeCommand('vscode.openWith', uri, 'default', { preview: false });
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
    this.#states.set(panel, { ...(this.#states.get(panel) ?? { scrollTop: 0, collapsedSlugs: [] }), tocVisible: !current });
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

  async #handleMessage(raw: unknown, document: vscode.TextDocument, panel: vscode.WebviewPanel): Promise<void> {
    const message = parseWebviewMessage(raw);
    if (!message) return;
    if (message.type === 'ready') {
      this.#navigation.ready(document.uri.toString(), panel.webview);
      await this.#postLayout(panel);
      await this.#sessionFor(document).renderNow();
      return;
    }
    if (message.type === 'viewportChanged') this.#states.set(panel, message.state);
    if (message.type === 'openSource') await this.openSource(document.uri);
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

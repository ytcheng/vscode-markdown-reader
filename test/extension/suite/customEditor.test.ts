import * as assert from 'node:assert';
import * as vscode from 'vscode';
import * as path from 'node:path';
import { readFile } from 'node:fs/promises';

suite('Markdown Reader custom editor', () => {
  test('registers all reader commands after activation', async () => {
    await vscode.extensions.getExtension('chengjian.vscode-markdown-reader')?.activate();
    const commands = await vscode.commands.getCommands(true);
    for (const command of ['markdownReader.openPreview', 'markdownReader.openSource', 'markdownReader.togglePreview', 'markdownReader.toggleToc']) {
      assert.ok(commands.includes(command), `${command} must be registered`);
    }
  });
});


suite('Markdown Reader actual webview', () => {
  test('renders body, math and three diagrams through VS Code resource loading', async function () {
    this.timeout(20_000);
    const extension = vscode.extensions.getExtension('chengjian.vscode-markdown-reader')!;
    const { getWebviewHtml, MarkdownRenderer } = require(path.join(__dirname, '../webviewSupport.cjs'));
    const panel = vscode.window.createWebviewPanel('markdownReader.integrationTest', 'Reader integration test', vscode.ViewColumn.Active, {
      enableScripts: true, localResourceRoots: [extension.extensionUri]
    });
    const uri = (...parts: string[]) => panel.webview.asWebviewUri(vscode.Uri.joinPath(extension.extensionUri, ...parts)).toString();
    const source = await readFile(path.join(extension.extensionPath, 'docs/V0.2-功能测试.md'), 'utf8');
    const result = await new MarkdownRenderer().render(source, 1);
    try {
      const finished = new Promise<Record<string, unknown>>((resolve) => {
        panel.webview.onDidReceiveMessage((message) => {
          if (message.type === 'ready') void panel.webview.postMessage({ type: 'render', result });
          if (message.type === 'testRenderResult') resolve(message);
        });
      });
      panel.webview.html = getWebviewHtml({
        cspSource: panel.webview.cspSource, nonce: 'integration-test-nonce',
        mermaidScriptUri: uri('media', 'mermaid-frame.js'),
        scriptUri: uri('media', 'reader.js'), styleUri: uri('media', 'reader.css'),
        highContrastStyleUri: uri('media', 'high-contrast.css'), katexStyleUri: uri('media', 'katex', 'katex.min.css'),
        mermaidFrameUri: `data:text/html;base64,${(await readFile(path.join(extension.extensionPath, 'media/mermaid-frame.html'))).toString('base64')}`
      }).replace('<script defer', `<script src="${uri('test', 'fixtures', 'webview-probe.js')}"></script><script defer`);
      const report = await finished;
      console.log('Actual webview render report:', JSON.stringify(report));
      assert.ok(Number(report.headings) > 0, 'Body must render through the real host message channel');
      assert.ok(Number(report.math) > 0, 'Math must render');
      assert.strictEqual(report.loaded, 3, JSON.stringify(report));
      assert.strictEqual(report.sandbox, 'allow-scripts', 'Renderer must not have same-origin access');
      assert.strictEqual((report.diagramErrors as string[]).length, 1, 'Invalid diagrams must retain a readable fallback');
      assert.deepStrictEqual(report.errors, [], 'No script or CSP failures');
    } finally {
      panel.dispose();
    }
  });
});

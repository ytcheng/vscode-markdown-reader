import { expect, it } from 'vitest';
import { getWebviewHtml } from '../../src/webview/html.js';

it('emits a strict CSP and only local scripts and styles', () => {
  const html = getWebviewHtml({
    cspSource: 'vscode-webview:',
    scriptUri: 'webview://reader.js',
    styleUri: 'webview://reader.css',
    highContrastStyleUri: 'webview://hc.css'
  });

  expect(html).toContain("default-src 'none'");
  expect(html).toContain('script-src vscode-webview:');
  expect(html).toContain('style-src vscode-webview:');
  expect(html).not.toContain("'unsafe-inline'");
  expect(html).toContain('aria-label="Table of contents"');
  expect(html).toContain('src="webview://reader.js"');
  expect(html).toContain('href="webview://reader.css"');
  expect(html).toContain('href="webview://hc.css"');
});

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
  expect(html).not.toContain('reader-toolbar');
  expect(html).not.toContain('id="open-source"');
  expect(html).toContain('id="toggle-toc"');
  expect(html).toContain('class="toc-toggle"');
  expect(html).toContain('aria-label="Toggle table of contents"');
  expect(html).toContain('aria-expanded="true"');
  expect(html).toContain('id="toc-resizer"');
  expect(html).toContain('role="separator"');
  expect(html).toContain('<svg width="1.2em" height="1.2em" fill="currentColor"');
  expect(html).toContain('viewBox="0 0 30 30" class="btn-icon"');
  expect(html).toContain('M2.5,7.5L2.5,22.5');
});

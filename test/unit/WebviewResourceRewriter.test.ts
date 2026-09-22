import { describe, expect, it, vi } from 'vitest';
import { WebviewResourceRewriter } from '../../src/links/WebviewResourceRewriter.js';

const result = {
  revision: 1,
  html: '<p><img src="__MD_READER_RESOURCE_0__"><img src="__MD_READER_RESOURCE_1__"></p>',
  headings: [],
  resources: [
    { placeholder: '__MD_READER_RESOURCE_0__', kind: 'image' as const, href: 'images/logo.png' },
    { placeholder: '__MD_READER_RESOURCE_1__', kind: 'image' as const, href: 'javascript:alert(1)' }
  ]
};

describe('WebviewResourceRewriter', () => {
  it('uses each panel URI while preserving the shared render result', () => {
    const resolver = { resolve: (href: string) => (href === 'images/logo.png' ? { value: 'file:///workspace/images/logo.png' } : undefined) };
    const rewriter = new WebviewResourceRewriter(resolver);
    const panelA = { asWebviewUri: (uri: { value: string }) => ({ toString: () => `webview-a:${uri.value}` }) };
    const panelB = { asWebviewUri: (uri: { value: string }) => ({ toString: () => `webview-b:${uri.value}` }) };

    expect(rewriter.rewrite(result, panelA).html).toContain('src="webview-a:file:///workspace/images/logo.png"');
    expect(rewriter.rewrite(result, panelB).html).toContain('src="webview-b:file:///workspace/images/logo.png"');
    expect(result.html).toContain('__MD_READER_RESOURCE_0__');
  });

  it('keeps HTTPS images and marks blocked resources without a source URL', () => {
    const rewriter = new WebviewResourceRewriter({ resolve: () => undefined });
    const remoteResult = { ...result, resources: [{ placeholder: '__MD_READER_RESOURCE_0__', kind: 'image' as const, href: 'https://example.com/logo.png' }] };

    expect(rewriter.rewrite(remoteResult, { asWebviewUri: vi.fn() }).html).toContain('src="https://example.com/logo.png"');
    expect(rewriter.rewrite(result, { asWebviewUri: vi.fn() }).html).toContain('data-reader-image-error="blocked"');
  });
});

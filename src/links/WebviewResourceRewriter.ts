import type { RenderResult } from '../renderer/types.js';

export interface ResourceResolver<Uri> {
  resolve(href: string): Uri | undefined;
}

export interface WebviewLike<Uri> {
  asWebviewUri(uri: Uri): { toString(): string };
}

export class WebviewResourceRewriter<Uri> {
  constructor(private readonly resolver: ResourceResolver<Uri>) {}

  rewrite(result: RenderResult, webview: WebviewLike<Uri>): RenderResult {
    let html = result.html;
    for (const resource of result.resources) {
      const replacement = this.#replacementFor(resource.href, webview);
      if (replacement) {
        html = html.replaceAll(resource.placeholder, escapeAttribute(replacement));
      } else {
        html = html.replaceAll(
          `src="${resource.placeholder}"`,
          'src="" data-reader-image-error="blocked"'
        );
      }
    }
    return { ...result, html };
  }

  #replacementFor(href: string, webview: WebviewLike<Uri>): string | undefined {
    if (isHttpsImage(href)) return href;
    const uri = this.resolver.resolve(href);
    return uri ? webview.asWebviewUri(uri).toString() : undefined;
  }
}

function isHttpsImage(href: string): boolean {
  try {
    return new URL(href).protocol === 'https:';
  } catch {
    return false;
  }
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

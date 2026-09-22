import { randomBytes } from 'node:crypto';
import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import * as vscode from 'vscode';
import { ResourceResolver } from '../links/ResourceResolver.js';
import { MarkdownRenderer } from '../renderer/MarkdownRenderer.js';
import { classifyLink } from '../security/links.js';
import { normalizeSettings, useLargeFileMode, type ReaderSettings } from '../settings/ReaderSettings.js';

const MAX_DIAGRAM_BYTES = 10 * 1024 * 1024;
const SVG_PREFIX = 'data:image/svg+xml;charset=utf-8,';
const IMAGE_TYPES: Record<string, string> = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.avif': 'image/avif', '.svg': 'image/svg+xml', '.bmp': 'image/bmp', '.ico': 'image/x-icon'
};

/** Produces portable documents from the host renderer; webview HTML is never accepted. */
export class ExportService {
  readonly #renderer = new MarkdownRenderer();
  readonly #resolver = new ResourceResolver();
  #styles?: Promise<string>;

  constructor(private readonly extensionUri: vscode.Uri) {}

  async exportDocument(document: vscode.TextDocument, settings: ReaderSettings, diagrams: string[], action: 'print' | 'exportHtml'): Promise<void> {
    if (action === 'print' && vscode.env.remoteName) {
      void vscode.window.showInformationMessage('Printing is unavailable from a remote extension host. Use Export HTML, download the file, and open it in your local browser to print or save as PDF.');
      return;
    }
    validateDiagrams(diagrams);
    const source = document.getText();
    const version = document.version;
    const title = path.posix.basename(document.uri.path).replace(/\.md$/i, '') || 'Markdown';
    const target = action === 'exportHtml' ? await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.joinPath(document.uri, '..', `${title}.html`),
      filters: { HTML: ['html'] }, saveLabel: 'Export HTML'
    }) : undefined;
    if (action === 'exportHtml' && !target) return;

    const preferences = normalizeSettings(settings);
    const result = await this.#renderer.render(source, version, { largeFile: useLargeFileMode(source, preferences) });
    const warnings = new Set<string>();
    if (result.largeFile) warnings.add('Large-file mode is enabled: code, math, and diagrams are exported as source without syntax highlighting or diagram rendering.');
    let content = result.html.replace(/<button\b[^>]*\bdata-copy-code\b[^>]*>[\s\S]*?<\/button>/g, '');
    for (const resource of result.resources) {
      const image = await this.#image(document.uri, resource.href);
      // Match only renderer-owned image tags, so source text resembling a placeholder stays untouched.
      content = content.replace(/<img\b[^>]*>/g, (tag) => {
        if (!tag.includes(`src="${resource.placeholder}"`)) return tag;
        if (image) return tag.replace(`src="${resource.placeholder}"`, `src="${escapeHtml(image)}"`);
        const alt = tag.match(/\balt="([^"]*)"/)?.[1] ?? '';
        warnings.add('Some images were unavailable or blocked and are shown as text.');
        return `<span class="reader-image-fallback" role="img" aria-label="${alt || 'Unavailable image'}">[Image unavailable${alt ? `: ${alt}` : ''}]</span>`;
      });
    }
    let diagramIndex = 0;
    content = content.replace(/<figure\b[^>]*\bdata-mermaid\b[^>]*>[\s\S]*?<\/figure>/g, (figure) => {
      const snapshot = diagrams[diagramIndex++];
      if (!snapshot) {
        warnings.add('Some diagrams were not ready; their Mermaid source is included instead.');
        return figure;
      }
      return `<figure class="reader-export-diagram"><img src="${escapeHtml(snapshot)}" alt="Mermaid diagram ${diagramIndex}"></figure>`;
    });
    content = content.replace(/<a\b[^>]*\bhref="([^"]*)"[^>]*>/g, (tag, value: string) => {
      const href = decodeAttribute(value);
      const kind = classifyLink(href);
      if (kind === 'anchor' || kind === 'external') return tag;
      const resolved = kind !== 'blocked' && isRelativePath(href) ? this.#resolver.resolve(document.uri, href) : undefined;
      if (!resolved || !['file', 'vscode-remote'].includes(resolved.uri.scheme)) return tag.replace(/\s+href="[^"]*"/, ' aria-disabled="true"');
      const uri = resolved.fragment ? resolved.uri.with({ fragment: decodeFragment(resolved.fragment) }) : resolved.uri;
      return tag.replace(/href="[^"]*"/, `href="${escapeHtml(uri.toString())}"`);
    });

    const dark = preferences.colorMode === 'dark' || (preferences.colorMode === 'auto' && [vscode.ColorThemeKind.Dark, vscode.ColorThemeKind.HighContrast].includes(vscode.window.activeColorTheme.kind));
    const nonce = randomBytes(18).toString('base64');
    const print = action === 'print';
    const css = `${await this.#readStyles()}\n${result.styles ?? ''}`.replace(/</g, '\\3c ');
    const inlineSettings = `--reader-font-size:${preferences.fontSize}px;--reader-content-max-width:${preferences.contentMaxWidth}px;--reader-font-family:${preferences.fontFamily || 'system-ui, sans-serif'}`;
    const warningHtml = warnings.size ? `<aside class="reader-export-warnings" role="status">${[...warnings].map(escapeHtml).join(' ')}</aside>` : '';
    const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: https:; font-src data:; style-src 'unsafe-inline'; script-src ${print ? `'nonce-${nonce}'` : "'none'"}; base-uri 'none'; form-action 'none'">
<title>${escapeHtml(title)}</title><style>${css}</style></head>
<body class="vscode-${dark ? 'dark' : 'light'}" data-reader-theme="${preferences.theme}" data-reader-color="${dark ? 'dark' : 'light'}" style="${escapeHtml(inlineSettings)}">
${print ? '<button id="reader-print" type="button">Print / Save as PDF</button>' : ''}${warningHtml}
<article id="document" class="markdown-body">${content}</article>
${print ? `<script nonce="${nonce}">document.getElementById('reader-print').addEventListener('click',function(){window.print();});</script>` : ''}
</body></html>`;
    if (target) await vscode.workspace.fs.writeFile(target, Buffer.from(html, 'utf8'));
    else {
      const directory = await mkdtemp(path.join(os.tmpdir(), 'markdown-reader-print-'));
      const file = path.join(directory, 'document.html');
      await writeFile(file, html, { encoding: 'utf8', mode: 0o600 });
      if (!await vscode.env.openExternal(vscode.Uri.file(file))) throw new Error('Could not open the print page in your browser. Use Export HTML to save it manually.');
    }
    if (warnings.size) void vscode.window.showWarningMessage([...warnings].join(' '));
  }

  async #image(documentUri: vscode.Uri, href: string): Promise<string | undefined> {
    try { if (new URL(href).protocol === 'https:') return href; } catch { /* Relative resource. */ }
    if (!isRelativePath(href)) return undefined;
    const resource = this.#resolver.resolve(documentUri, href);
    if (!resource) return undefined;
    const type = IMAGE_TYPES[path.posix.extname(resource.uri.path).toLowerCase()];
    if (!type) return undefined;
    try {
      const bytes = await vscode.workspace.fs.readFile(resource.uri);
      return `data:${type};base64,${Buffer.from(bytes).toString('base64')}${resource.fragment ? `#${encodeURIComponent(decodeFragment(resource.fragment))}` : ''}`;
    } catch { return undefined; }
  }

  #readStyles(): Promise<string> {
    this.#styles ??= this.#loadStyles().catch((error: unknown) => { this.#styles = undefined; throw error; });
    return this.#styles;
  }

  async #loadStyles(): Promise<string> {
    const [reader, math] = await Promise.all([
      vscode.workspace.fs.readFile(vscode.Uri.joinPath(this.extensionUri, 'media', 'reader.css')),
      vscode.workspace.fs.readFile(vscode.Uri.joinPath(this.extensionUri, 'media', 'katex', 'katex.min.css'))
    ]);
    let mathCss = Buffer.from(math).toString('utf8');
    const sources = [...mathCss.matchAll(/src:([^;}]+)/g)];
    for (const source of sources) {
      const font = source[1].match(/url\(["']?(fonts\/[\w.-]+\.woff2)["']?\)/)?.[1];
      if (!font) throw new Error('Unable to embed a required math font.');
      const bytes = await vscode.workspace.fs.readFile(vscode.Uri.joinPath(this.extensionUri, 'media', 'katex', ...font.split('/')));
      mathCss = mathCss.replace(source[0], `src:url(data:font/woff2;base64,${Buffer.from(bytes).toString('base64')}) format("woff2")`);
    }
    return `${Buffer.from(reader).toString('utf8')}\n${mathCss}`;
  }
}

function validateDiagrams(diagrams: string[]): void {
  let size = 0;
  for (const diagram of diagrams) {
    if (typeof diagram !== 'string' || (size += Buffer.byteLength(diagram, 'utf8')) > MAX_DIAGRAM_BYTES) throw new Error('Diagram snapshots exceed the 10 MB export limit.');
    if (!diagram) continue;
    if (!diagram.startsWith(SVG_PREFIX)) throw new Error('Invalid diagram snapshot: only encoded SVG image data is accepted.');
    try {
      const encoded = diagram.slice(SVG_PREFIX.length);
      const svg = decodeURIComponent(encoded);
      if (!/^\s*<svg\b[^>]*[\s\S]*<\/svg>\s*$/.test(svg) || /[<>"\s]/.test(encoded)) throw new Error('Invalid SVG');
    } catch { throw new Error('Invalid diagram snapshot: malformed SVG image data.'); }
  }
}

function isRelativePath(href: string): boolean {
  try { href = decodeURIComponent(href); } catch { return false; }
  return !/^[a-z][a-z\d+.-]*:/i.test(href) && !/^[\\/]/.test(href) && !/[\\\x00-\x1f]/u.test(href);
}
function decodeFragment(value: string): string { try { return decodeURIComponent(value); } catch { return value; } }
function escapeHtml(value: string): string { return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function decodeAttribute(value: string): string { return value.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'); }

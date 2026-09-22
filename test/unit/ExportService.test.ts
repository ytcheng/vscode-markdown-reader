import path from 'node:path';
// @ts-expect-error jsdom is a test-only dependency without bundled declarations.
import { JSDOM } from 'jsdom';
import { readFile, rm } from 'node:fs/promises';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const vscode = vi.hoisted(() => {
  class Uri {
    constructor(readonly value: string) {}
    get scheme() { return new URL(this.value).protocol.slice(0, -1); }
    get authority() { return new URL(this.value).host; }
    get path() { return decodeURIComponent(new URL(this.value).pathname); }
    get fsPath() { return this.path; }
    toString() { return this.value; }
    with(change: { fragment: string }) { const u = new URL(this.value); u.hash = change.fragment; return new Uri(u.href); }
    static file(value: string) { return new Uri(`file://${value.split('/').map(encodeURIComponent).join('/')}`); }
    static joinPath(uri: Uri, ...parts: string[]) { return new Uri(new URL(parts.join('/'), `${uri.value.replace(/\/$/, '')}/`).href); }
  }
  return {
    Uri,
    workspace: { fs: { readFile: vi.fn(), writeFile: vi.fn() }, getWorkspaceFolder: vi.fn(() => ({ uri: Uri.file('/workspace') })) },
    window: { showSaveDialog: vi.fn(), showWarningMessage: vi.fn(), showInformationMessage: vi.fn(), activeColorTheme: { kind: 2 } },
    env: { openExternal: vi.fn(async (_uri: unknown) => true), remoteName: undefined as string | undefined },
    ColorThemeKind: { Light: 1, Dark: 2, HighContrast: 3, HighContrastLight: 4 }
  };
});
vi.mock('vscode', () => vscode);
import { ExportService } from '../../src/export/ExportService.js';
import { defaultSettings } from '../../src/settings/ReaderSettings.js';
import { MarkdownRenderer } from '../../src/renderer/MarkdownRenderer.js';
const document = (source: string, name = 'readme.md') => ({ uri: vscode.Uri.file(`/workspace/${name}`), version: 1, getText: () => source });
const exportHtml = async (source: string, diagrams: string[] = [], settings = defaultSettings, name?: string) => {
  await new ExportService(vscode.Uri.file('/extension') as never).exportDocument(document(source, name) as never, settings, diagrams, 'exportHtml');
  return Buffer.from(vscode.workspace.fs.writeFile.mock.calls.at(-1)![1]).toString();
};

describe('ExportService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vscode.env.remoteName = undefined;
    vscode.window.showSaveDialog.mockResolvedValue(vscode.Uri.file('/output/export.html'));
    vscode.workspace.fs.readFile.mockImplementation(async (uri: { path: string }) => {
      if (uri.path.endsWith('reader.css')) return Buffer.from('.markdown-body{color:black}');
      if (uri.path.endsWith('katex.min.css')) return Buffer.from('@font-face{font-family:KaTeX;src:url(fonts/math.woff2) format("woff2"),url(fonts/math.woff) format("woff")}');
      if (uri.path.endsWith('math.woff2')) return Buffer.from('font');
      if (uri.path === '/workspace/image.png') return Buffer.from('image');
      throw new Error('not found');
    });
  });

  it('exports escaped source and title with chosen settings and embedded math font', async () => {
    const html = await exportHtml('# Heading\n\n<script>alert(1)</script>\n\n$x^2$', [], { ...defaultSettings, theme: 'github', colorMode: 'auto', fontFamily: '"Example", serif', fontSize: 20 }, '<script>.md');
    const dom = new JSDOM(html).window.document as Document;
    expect(dom.querySelectorAll('script')).toHaveLength(0);
    expect(dom.title).toBe('<script>');
    expect(dom.querySelector('#document')?.textContent).toContain('<script>alert(1)</script>');
    expect(dom.body.dataset.readerTheme).toBe('github');
    expect(dom.body.dataset.readerColor).toBe('dark');
    expect(dom.body.style.getPropertyValue('--reader-font-family')).toBe('"Example", serif');
    expect(html).toContain('data:font/woff2;base64,Zm9udA==');
    expect(html).not.toContain('url(fonts/');
    expect(dom.querySelector('.katex')).not.toBeNull();
  });

  it('embeds permitted local images, retains HTTPS and makes missing or blocked images accessible', async () => {
    const html = await exportHtml('![local](image.png) ![remote](https://example.com/a.png) ![missing](missing.png) ![escape](../private.png) ![http](http://example.com/a.png)');
    const dom = new JSDOM(html).window.document as Document;
    expect(dom.querySelector('img[alt="local"]')?.getAttribute('src')).toBe('data:image/png;base64,aW1hZ2U=');
    expect(dom.querySelector('img[alt="remote"]')?.getAttribute('src')).toBe('https://example.com/a.png');
    expect(dom.querySelectorAll('[role="img"]')).toHaveLength(3);
    expect(vscode.workspace.fs.readFile.mock.calls.some(([uri]) => uri.path === '/private.png')).toBe(false);
    expect(vscode.workspace.fs.readFile.mock.calls.some(([uri]) => uri.scheme === 'http')).toBe(false);
    expect(vscode.window.showWarningMessage).toHaveBeenCalled();
  });

  it('does not read encoded backslash paths or protocol-relative resources', async () => {
    await exportHtml('![encoded](folder%5Cimage.png) ![network](//example.com/image.png)');
    expect(vscode.workspace.fs.readFile.mock.calls.some(([uri]) => uri.path.includes('folder'))).toBe(false);
    expect(vscode.workspace.fs.readFile.mock.calls.some(([uri]) => uri.authority === 'example.com')).toBe(false);
  });

  it('keeps anchors and resolves allowed local links while removing code controls', async () => {
    const html = await exportHtml('[heading](#heading) [local](guide.md#part) [escape](../private.txt) [blocked](command:run)\n\n```js\nconst x = 1;\n```');
    const dom = new JSDOM(html).window.document as Document;
    expect(dom.querySelector('a[href="#heading"]')).not.toBeNull();
    expect(dom.querySelector('a[href="file:///workspace/guide.md#part"]')).not.toBeNull();
    expect(dom.querySelector('a[href="command:run"]')).toBeNull();
    expect(dom.querySelector('a[href="../private.txt"]')).toBeNull();
    expect(dom.querySelector('[data-copy-code]')).toBeNull();
  });

  it('includes safe SVG snapshots and retains code with warnings for incomplete diagrams', async () => {
    const snapshot = `data:image/svg+xml;charset=utf-8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg"><text>Hello</text></svg>')}`;
    const html = await exportHtml('```mermaid\ngraph TD; A-->B\n```\n```mermaid\ngraph TD; C-->D\n```', [snapshot, '']);
    const dom = new JSDOM(html).window.document as Document;
    expect(dom.querySelector('figure img')?.getAttribute('src')).toBe(snapshot);
    expect(dom.querySelector('figure pre')?.textContent).toContain('C-->D');
    expect(vscode.window.showWarningMessage).toHaveBeenCalled();
  });

  it('rejects unsafe diagram URIs and oversized aggregate payloads', async () => {
    const service = new ExportService(vscode.Uri.file('/extension') as never);
    await expect(service.exportDocument(document('') as never, defaultSettings, ['javascript:alert(1)'], 'exportHtml')).rejects.toThrow(/diagram/i);
    await expect(service.exportDocument(document('') as never, defaultSettings, ['x'.repeat(10 * 1024 * 1024 + 1)], 'exportHtml')).rejects.toThrow(/diagram/i);
    expect(vscode.workspace.fs.writeFile).not.toHaveBeenCalled();
  });

  it('cancels without reading assets or writing a file', async () => {
    vscode.window.showSaveDialog.mockResolvedValue(undefined);
    await new ExportService(vscode.Uri.file('/extension') as never).exportDocument(document('# Content') as never, defaultSettings, [], 'exportHtml');
    expect(vscode.workspace.fs.readFile).not.toHaveBeenCalled();
    expect(vscode.workspace.fs.writeFile).not.toHaveBeenCalled();
  });

  it('captures source and version before the save dialog can mutate the document', async () => {
    let source = '# Before dialog';
    const mutableDocument = { ...document(source), getText: () => source };
    vscode.window.showSaveDialog.mockImplementationOnce(async () => {
      source = '# Edited during dialog';
      mutableDocument.version = 2;
      return vscode.Uri.file('/output/export.html');
    });
    const render = vi.spyOn(MarkdownRenderer.prototype, 'render');
    try {
      await new ExportService(vscode.Uri.file('/extension') as never).exportDocument(mutableDocument as never, defaultSettings, [], 'exportHtml');
      const html = Buffer.from(vscode.workspace.fs.writeFile.mock.calls.at(-1)![1]).toString();
      const dom = new JSDOM(html).window.document as Document;
      expect(dom.querySelector('h1')?.textContent).toBe('Before dialog');
      expect(render).toHaveBeenCalledWith('# Before dialog', 1, { largeFile: false });
    } finally { render.mockRestore(); }
  });

  it('warns explicitly when export uses large-file source fallbacks', async () => {
    const html = await exportHtml('$$x^2$$\n\n```mermaid\ngraph TD; A-->B\n```', [], { ...defaultSettings, largeFileMode: 'on' });
    const dom = new JSDOM(html).window.document as Document;
    expect(dom.querySelector('.reader-export-warnings')?.textContent).toMatch(/large.file.*code.*math.*diagrams.*source/i);
    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(expect.stringMatching(/large.file.*code.*math.*diagrams.*source/i));
  });

  it('preserves large-file fallback and rejects CSS injection', async () => {
    const html = await exportHtml('$$x^2$$\n\n```mermaid\ngraph TD; A-->B\n```', [], { ...defaultSettings, largeFileMode: 'on', fontFamily: '</style><script>alert(1)</script>' });
    const dom = new JSDOM(html).window.document as Document;
    expect(dom.querySelector('.katex')).toBeNull();
    expect(dom.querySelector('.math-source')).not.toBeNull();
    expect(dom.querySelector('script')).toBeNull();
  });

  it('opens a local print page with a nonce-protected button', async () => {
    await new ExportService(vscode.Uri.file('/extension') as never).exportDocument(document('# Print') as never, defaultSettings, [], 'print');
    const uri = vscode.env.openExternal.mock.calls[0]?.[0] as unknown as { fsPath: string };
    expect(uri).toBeDefined();
    try {
      const dom = new JSDOM(await readFile(uri.fsPath, 'utf8')).window.document as Document;
      expect(dom.querySelector('#reader-print')?.textContent).toContain('Print / Save as PDF');
      expect(dom.querySelector('script')?.nonce).toBeTruthy();
      expect(dom.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute('content')).toContain(`'nonce-${dom.querySelector('script')?.nonce}'`);
    } finally { await rm(path.dirname(uri.fsPath), { recursive: true }); }
  });

  it('does not open a remote print path on the client', async () => {
    vscode.env.remoteName = 'ssh-remote';
    await new ExportService(vscode.Uri.file('/extension') as never).exportDocument(document('# Print') as never, defaultSettings, [], 'print');
    expect(vscode.env.openExternal).not.toHaveBeenCalled();
    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(expect.stringMatching(/Export HTML.*download/i));
  });
});

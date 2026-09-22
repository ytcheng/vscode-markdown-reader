import { describe, expect, it } from 'vitest';
import { MarkdownRenderer } from '../../src/renderer/MarkdownRenderer.js';

describe('MarkdownRenderer', async () => {
  it('extracts headings, deduplicates slugs, and emits zero-based source lines', async () => {
    const result = await new MarkdownRenderer().render('# 架构 `API`\n\n## 重复\n\n## 重复', 7);

    expect(result.revision).toBe(7);
    expect(result.headings).toEqual([
      { level: 1, text: '架构 API', slug: '架构-api', line: 0 },
      { level: 2, text: '重复', slug: '重复', line: 2 },
      { level: 2, text: '重复', slug: '重复-1', line: 4 }
    ]);
    expect(result.html).toContain('id="架构-api"');
    expect(result.html).toContain('data-source-line="0"');
  });

  it('supports tables and disabled task-list controls without source HTML', async () => {
    const result = await new MarkdownRenderer().render(
      '| A | B |\n|---|---:|\n| x | y |\n\n- [x] done\n\n<script>alert(1)</script>',
      1
    );

    expect(result.html).toContain('<table data-source-line="0">');
    expect(result.html).toContain('class="align-right"');
    expect(result.html).toContain('class="task-list-item-checkbox"');
    expect(result.html).toContain('disabled');
    expect(result.html).not.toContain('<script>');
    expect(result.html).not.toContain('style=');
  });

  it('handles empty, skipped, inline-formatted, and emoji headings predictably', async () => {
    const result = await new MarkdownRenderer().render('#\n\n### *中文* `Code` 🎉', 2);

    expect(result.headings).toEqual([
      { level: 1, text: '', slug: 'section', line: 0 },
      { level: 3, text: '中文 Code 🎉', slug: '中文-code', line: 2 }
    ]);
    expect(result.html).toContain('id="section"');
    expect(result.html).toContain('id="中文-code"');
  });

  it('tracks image resources with renderer-generated placeholders', async () => {
    const result = await new MarkdownRenderer().render('![logo](images/logo.png)', 3);

    expect(result.resources).toEqual([
      { placeholder: '__MD_READER_RESOURCE_0__', kind: 'image', href: 'images/logo.png' }
    ]);
    expect(result.html).toContain('src="__MD_READER_RESOURCE_0__"');
  });

  it('highlights fenced code and adds an accessible copy control', async () => {
    const result = await new MarkdownRenderer().render('```ts\nconst answer = 42;\n```', 1);

    expect(result.html).toContain('<pre class="hljs-pre" data-source-line="0">');
    expect(result.html).toContain('class="copy-code-btn"');
    expect(result.html).toContain('data-copy-code');
    expect(result.html).toContain('data-code-language="ts"');
    expect(result.html).toContain('aria-label="Copy ts code"');
    expect(result.html).toContain('<span class="code-language">TS</span>');
    expect(result.html).toContain('class="copy-code-icon"');
    expect(result.html).toContain('class="hljs language-ts"');
    expect(result.styles).toContain('#D73A49');
  });

  it('renders unknown fenced languages as escaped plain text with a copy control', async () => {
    const result = await new MarkdownRenderer().render('```unknown\n<a>\n```', 1);

    expect(result.html).toContain('class="copy-code-btn"');
    expect(result.html).toContain('&lt;a&gt;');
    expect(result.html).not.toContain('<a>');
  });
  it('maps body blocks, including nested lists and code, to zero-based source lines', async () => {
    const result = await new MarkdownRenderer().render('Paragraph\n\n- first\n- second\n\n> quote\n\n```ts\nconst n = 1;\n```', 1);
    expect(result.html).toContain('<p data-source-line="0">');
    expect(result.html).toContain('<li data-source-line="2">');
    expect(result.html).toContain('<li data-source-line="3">');
    expect(result.html).toContain('<blockquote data-source-line="5">');
    expect(result.html).toMatch(/<pre[^>]*data-source-line="7"/);
  });

  it('renders math without interpreting code, escaped dollars or raw HTML', async () => {
    const result = await new MarkdownRenderer().render(String.raw`Inline $x^2$ and \$5.

$$
\frac{a}{b}
$$

${'`$code$`'}

$\href{javascript:alert(1)}{bad}$`, 1);
    expect(result.html).toContain('class="katex"');
    expect(result.html).toContain('katex-display');
    expect(result.html).toContain('<code>$code$</code>');
    expect(result.html).toContain('$5');
    expect(result.html).not.toContain('href="javascript:');
    expect(result.html).not.toContain(' style=');
  });

  it('keeps invalid math readable without failing the rest of the document', async () => {
    const result = await new MarkdownRenderer().render('$\\unknowncommand{x}$\n\n## Still here', 1);
    expect(result.html).toContain('unknowncommand');
    expect(result.headings[0].text).toBe('Still here');
  });

  it('marks Mermaid fences for rendering and preserves escaped source', async () => {
    const result = await new MarkdownRenderer().render('```mermaid\ngraph TD; A[<script>] --> B\n```', 1);
    expect(result.html).toContain('data-mermaid');
    expect(result.html).toContain('data-source-line="0"');
    expect(result.html).toContain('&lt;script&gt;');
    expect(result.html).not.toContain('<script>');
  });

  it('keeps block math source lines and isolates macros between renders', async () => {
    const renderer = new MarkdownRenderer();
    const first = await renderer.render('Intro\n\n$$\n\\gdef\\customer{123456}\\customer\n$$\n\n$\\customer$', 1);
    expect(first.html).toMatch(/<[^>]*data-source-line="2"[^>]*>/);
    expect(first.html).toContain('123456');
    const second = await renderer.render('$\\customer$', 2);
    expect(second.html).not.toContain('123456');
    expect(second.html).toContain('customer');
  });

});


it('escapes language metadata in code labels as well as code content', async () => {
  const result = await new MarkdownRenderer().render('```"><img/src=x>\ncode\n```', 1);
  expect(result.html).not.toMatch(/<img/i);
  expect(result.html).not.toContain('data-code-language=""><');
});

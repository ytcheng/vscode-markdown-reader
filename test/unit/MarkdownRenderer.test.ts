import { describe, expect, it } from 'vitest';
import { MarkdownRenderer } from '../../src/renderer/MarkdownRenderer.js';

describe('MarkdownRenderer', () => {
  it('extracts headings, deduplicates slugs, and emits zero-based source lines', () => {
    const result = new MarkdownRenderer().render('# 架构 `API`\n\n## 重复\n\n## 重复', 7);

    expect(result.revision).toBe(7);
    expect(result.headings).toEqual([
      { level: 1, text: '架构 API', slug: '架构-api', line: 0 },
      { level: 2, text: '重复', slug: '重复', line: 2 },
      { level: 2, text: '重复', slug: '重复-1', line: 4 }
    ]);
    expect(result.html).toContain('id="架构-api"');
    expect(result.html).toContain('data-source-line="0"');
  });

  it('supports tables and disabled task-list controls without source HTML', () => {
    const result = new MarkdownRenderer().render(
      '| A | B |\n|---|---:|\n| x | y |\n\n- [x] done\n\n<script>alert(1)</script>',
      1
    );

    expect(result.html).toContain('<table>');
    expect(result.html).toContain('class="align-right"');
    expect(result.html).toContain('class="task-list-item-checkbox"');
    expect(result.html).toContain('disabled');
    expect(result.html).not.toContain('<script>');
    expect(result.html).not.toContain('style=');
  });

  it('handles empty, skipped, inline-formatted, and emoji headings predictably', () => {
    const result = new MarkdownRenderer().render('#\n\n### *中文* `Code` 🎉', 2);

    expect(result.headings).toEqual([
      { level: 1, text: '', slug: 'section', line: 0 },
      { level: 3, text: '中文 Code 🎉', slug: '中文-code', line: 2 }
    ]);
    expect(result.html).toContain('id="section"');
    expect(result.html).toContain('id="中文-code"');
  });

  it('tracks image resources with renderer-generated placeholders', () => {
    const result = new MarkdownRenderer().render('![logo](images/logo.png)', 3);

    expect(result.resources).toEqual([
      { placeholder: '__MD_READER_RESOURCE_0__', kind: 'image', href: 'images/logo.png' }
    ]);
    expect(result.html).toContain('src="__MD_READER_RESOURCE_0__"');
  });

  it('highlights fenced code and adds an accessible copy control', () => {
    const result = new MarkdownRenderer().render('```ts\nconst answer = 42;\n```', 1);

    expect(result.html).toContain('<pre class="hljs-pre">');
    expect(result.html).toContain('class="copy-code-btn"');
    expect(result.html).toContain('data-copy-code');
    expect(result.html).toContain('data-code-language="ts"');
    expect(result.html).toContain('aria-label="Copy ts code"');
    expect(result.html).toContain('<span class="code-language">TS</span>');
    expect(result.html).toContain('class="copy-code-icon"');
    expect(result.html).toContain('class="hljs language-ts"');
    expect(result.html).toContain('hljs-keyword');
  });

  it('renders unknown fenced languages as escaped plain text with a copy control', () => {
    const result = new MarkdownRenderer().render('```unknown\n<a>\n```', 1);

    expect(result.html).toContain('class="copy-code-btn"');
    expect(result.html).toContain('&lt;a&gt;');
    expect(result.html).not.toContain('<a>');
  });
});

import { describe, expect, it } from 'vitest';
import { MarkdownRenderer } from '../../src/renderer/MarkdownRenderer.js';

const document = String.raw`# Large document

Ordinary **Markdown** and $x < y$.

$$
\frac{a}{b} < c
$$

![diagram](images/diagram.png)

> - Nested code:
>
>   ${'```ts'}
>   const value = "<script>";
>   ${'```'}

${'```mermaid'}
graph TD; A[<script>] --> B
${'```'}`;

describe('MarkdownRenderer modes', () => {
  it('preserves document structure and safe source while downgrading expensive rendering', async () => {
    const result = await new MarkdownRenderer().render(document, 8, { largeFile: true });

    expect(result.largeFile).toBe(true);
    expect(result.revision).toBe(8);
    expect(result.headings).toEqual([{ level: 1, text: 'Large document', slug: 'large-document', line: 0 }]);
    expect(result.resources).toEqual([
      { placeholder: '__MD_READER_RESOURCE_0__', kind: 'image', href: 'images/diagram.png' }
    ]);
    expect(result.html).toContain('<strong>Markdown</strong>');
    expect(result.html).toContain('$x &lt; y$');
    expect(result.html).toContain('\\frac{a}{b} &lt; c');
    expect(result.html).toContain('const value = &quot;&lt;script&gt;&quot;;');
    expect(result.html).toContain('graph TD; A[&lt;script&gt;] --&gt; B');
    expect(result.html.match(/data-copy-code/g)).toHaveLength(2);
    expect(result.html).not.toMatch(/data-mermaid|class="katex|<script>/);
    expect(result.styles).toBe('');
  });

  it('restores math, diagrams and nested code highlighting when large mode ends', async () => {
    const renderer = new MarkdownRenderer();
    await renderer.render(document, 1, { largeFile: true });
    const restored = await renderer.render(document, 2, { largeFile: false });
    const defaultResult = await renderer.render(document, 3);

    expect(restored.largeFile).toBe(false);
    expect(defaultResult.largeFile).toBe(false);
    expect(restored.html).toContain('class="katex"');
    expect(restored.html).toContain('data-mermaid');
    expect(restored.styles).toContain('--shiki-dark:');
    expect(restored.html).toBe(defaultResult.html);
    expect(restored.headings).toEqual(defaultResult.headings);
  });

  it('extracts both light and dark syntax colors into CSP-compatible CSS', async () => {
    const result = await new MarkdownRenderer().render('```ts\nconst answer = 42;\n```', 1);

    expect(result.styles).toContain('color:#D73A49');
    expect(result.styles).toContain('--shiki-dark:#F97583');
    expect(result.html).not.toContain('style=');
    expect(result.html).toContain('reader-style-');
  });
});

import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';
import less from 'less';

const requiredTokens = [
  '--primary-color',
  '--primary-color-hover',
  '--primary-color-alpha-10',
  '--text-muted',
  '--text-disabled',
  '--border-color',
  '--bg-image',
  '--bg-code',
  '--bg-stripe',
  '--bg-block',
  '--highlight-color',
  '--opacity-image',
  '--hljs-base'
];

it('defines all reader theme tokens in both light and dark modes', async () => {
  const source = await readFile('media/reader.less', 'utf8');
  const { css } = await less.render(source, { filename: 'media/reader.less' });

  for (const mode of ['vscode-light', 'vscode-dark']) {
    const declarationBlock = css.match(new RegExp(`body\\.${mode}\\s*\\{([^}]*)\\}`, 's'))?.[1] ?? '';
    for (const token of requiredTokens) expect(declarationBlock).toContain(`${token}:`);
  }
});

it('uses a white reading surface in light mode', async () => {
  const source = await readFile('media/reader.less', 'utf8');
  const { css } = await less.render(source, { filename: 'media/reader.less' });

  expect(css).toMatch(/body\.vscode-light\s*\{[^}]*background:\s*#fff/s);
  expect(css).toMatch(/body\.vscode-light \.toc,[\s\S]*?background:\s*#fff/s);
});

it('keeps the reading surface white when VS Code provides a dark workbench theme', async () => {
  const source = await readFile('media/reader.less', 'utf8');
  const { css } = await less.render(source, { filename: 'media/reader.less' });

  const darkThemeBlock = css.match(/body\.vscode-dark\s*\{([^}]*)\}/s)?.[1] ?? '';
  expect(darkThemeBlock).toContain('--bg-code: #e6edf8;');
  expect(darkThemeBlock).toContain('background: #fff;');
  expect(darkThemeBlock).toContain('color: #24292f;');
  expect(css).toMatch(/body\.vscode-dark \.toc,[\s\S]*?background:\s*#fff/s);
});

it('does not retain a dark background on quoted or code content in normal themes', async () => {
  const source = await readFile('media/reader.less', 'utf8');
  const { css } = await less.render(source, { filename: 'media/reader.less' });

  expect(css).toMatch(/body\.vscode-dark \.markdown-body blockquote,[\s\S]*?background:\s*#fff !important;/s);
  expect(css).toMatch(/body\.vscode-dark \.markdown-body pre > code,[\s\S]*?background:\s*#e8eef8 !important;/s);
});

it('uses a borderless TOC control inside the document, compact navigation, and clear code surfaces', async () => {
  const source = await readFile('media/reader.less', 'utf8');
  const { css } = await less.render(source, { filename: 'media/reader.less' });

  expect(css).toMatch(/\.toc\s*\{[^}]*padding:\s*20px 4px 20px 4px/s);
  expect(css).toMatch(/\.toc-toggle\s*\{[^}]*position:\s*fixed[^}]*top:\s*12px[^}]*left:\s*calc\(var\(--reader-toc-width\) \+ 6px\)[^}]*border:\s*0[^}]*background:\s*transparent/s);
  expect(css).toMatch(/body:has\(\.toc\[hidden\]\) \.toc-toggle\s*\{[^}]*left:\s*6px/s);
  expect(css).toMatch(/@media \(max-width: 800px\)\s*\{[\s\S]*?\.toc-toggle\s*\{[^}]*left:\s*6px/s);
  expect(css).toMatch(/\.toc-resizer\s*\{[^}]*width:\s*12px[^}]*margin-left:\s*-12px[^}]*cursor:\s*col-resize/s);
  expect(css).toMatch(/\.reader\s*\{[^}]*grid-template-columns:\s*var\(--reader-toc-width\) 0 minmax\(0, 1fr\)/s);
  expect(css).toMatch(/\.toc a\[aria-current='location'\],[\s\S]*?color:\s*#607cd2;[\s\S]*?font-weight:\s*700;[\s\S]*?text-decoration:\s*none;[\s\S]*?outline:\s*none;/s);
  const currentTocRule = css.match(/\.toc a\[aria-current='location'\],[\s\S]*?\{([^}]*)\}/s)?.[1] ?? '';
  expect(currentTocRule).toContain('font-weight: 700;');
  expect(currentTocRule).toContain('outline: none;');
  expect(css).toMatch(/body\.vscode-dark \.toc a\[aria-current='location'\],[\s\S]*?color:\s*#607cd2;[\s\S]*?font-weight:\s*700;/s);
  expect(css).toMatch(/body:has\(\.toc\[hidden\]\) \.reader\s*\{[^}]*grid-template-columns:\s*0 0 minmax\(0, 1fr\)/s);
  expect(css).toMatch(/\.markdown-body pre,[\s\S]*?background:\s*#e8eef8 !important;/s);
  expect(css).toMatch(/body\.vscode-dark \.markdown-body code,[\s\S]*?background:\s*#e6edf8;/s);
  expect(css).toMatch(/scrollbar-width:\s*thin/);
  expect(css).toMatch(/::-webkit-scrollbar\s*\{[^}]*width:\s*8px/s);
  expect(css).toMatch(/::-webkit-scrollbar-track\s*\{[^}]*background:\s*#fff/s);
});

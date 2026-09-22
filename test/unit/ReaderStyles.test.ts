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
  expect(darkThemeBlock).toContain('--bg-code: #f3f6ff;');
  expect(darkThemeBlock).toContain('background: #fff;');
  expect(darkThemeBlock).toContain('color: #24292f;');
  expect(css).toMatch(/body\.vscode-dark \.toc,[\s\S]*?background:\s*#fff/s);
});

it('does not retain a dark background on quoted or code content in normal themes', async () => {
  const source = await readFile('media/reader.less', 'utf8');
  const { css } = await less.render(source, { filename: 'media/reader.less' });

  expect(css).toMatch(/body\.vscode-dark \.markdown-body blockquote,[\s\S]*?background:\s*#fff !important;/s);
  expect(css).toMatch(/body\.vscode-dark \.markdown-body pre > code,[\s\S]*?background:\s*#f6f8fa !important;/s);
});

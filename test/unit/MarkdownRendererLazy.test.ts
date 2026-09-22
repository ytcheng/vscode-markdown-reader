import { expect, it, vi } from 'vitest';

vi.mock('shiki', async (importOriginal) => {
  const actual = await importOriginal<typeof import('shiki')>();
  return { ...actual, createHighlighter: vi.fn(actual.createHighlighter) };
});

it('defers the shared TextMate engine until normal rendering needs a supported language', async () => {
  const { createHighlighter } = await import('shiki');
  const { MarkdownRenderer } = await import('../../src/renderer/MarkdownRenderer.js');
  const renderer = new MarkdownRenderer();

  expect(createHighlighter).not.toHaveBeenCalled();
  await renderer.render('```ts\nconst n = 1;\n```', 1, { largeFile: true });
  await renderer.render('```unknown\nplain text\n```', 2);
  expect(createHighlighter).not.toHaveBeenCalled();

  await renderer.render('```ts\nconst n = 1;\n```', 3);
  await renderer.render('```js\nconst n = 2;\n```', 4);
  expect(createHighlighter).toHaveBeenCalledTimes(1);
});

import { createHighlighter, bundledLanguages, type BundledLanguage } from 'shiki';

// One TextMate engine per extension host; grammars are loaded on demand from the bundle.
let highlighter: ReturnType<typeof createHighlighter> | undefined;

export async function highlightCode(code: string, language: string): Promise<string | undefined> {
  if (!Object.hasOwn(bundledLanguages, language)) return undefined;
  const engine = await (highlighter ??= createHighlighter({ themes: ['github-light', 'github-dark'], langs: [] }));
  const lang = language as BundledLanguage;
  await engine.loadLanguage(lang);
  return engine.codeToHtml(code, { lang, themes: { light: 'github-light', dark: 'github-dark' } })
    .replace(/^[\s\S]*?<code>/, '').replace(/<\/code><\/pre>$/, '');
}

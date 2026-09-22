import { createHighlighter, bundledLanguages, type BundledLanguage } from 'shiki';

// One TextMate engine per extension host; grammars are loaded on demand from the bundle.
const highlighter = createHighlighter({ themes: ['github-light'], langs: [] });

export async function highlightCode(code: string, language: string): Promise<string | undefined> {
  if (!Object.hasOwn(bundledLanguages, language)) return undefined;
  const engine = await highlighter;
  const lang = language as BundledLanguage;
  await engine.loadLanguage(lang);
  return engine.codeToHtml(code, { lang, theme: 'github-light' })
    .replace(/^[\s\S]*?<code>/, '').replace(/<\/code><\/pre>$/, '');
}

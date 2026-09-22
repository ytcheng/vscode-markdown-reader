import MarkdownIt from 'markdown-it';
import type { Env, MarkdownIt as MarkdownItInstance, RendererRule, Token } from 'markdown-it';
import taskLists from 'markdown-it-task-lists';
import { highlightCode } from './ShikiRenderer.js';
import { tex } from '@mdit/plugin-tex';
import { renderToString, type KatexOptions } from 'katex';
import { SlugGenerator } from './SlugGenerator.js';
import type { HeadingItem, RenderResource, RenderResult } from './types.js';

interface RenderEnvironment extends Env {
  resources: RenderResource[];
  highlighted: Map<Token, string>;
  mathMacros: NonNullable<KatexOptions['macros']>;
}

const TABLE_ALIGNMENT = /text-align:\s*(left|center|right)/i;

export class MarkdownRenderer {
  readonly #md: MarkdownItInstance;

  constructor() {
    this.#md = new MarkdownIt({ html: false, linkify: true, typographer: false }).use(taskLists, {
      enabled: false,
      label: true
    }).use(tex, {
      render: (content: string, displayMode: boolean, env: Env) => renderToString(content, {
        displayMode, trust: false, throwOnError: false, maxExpand: 1000, maxSize: 20,
        macros: (env as RenderEnvironment).mathMacros, strict: 'ignore'
      })
    });
    const mathBlock = this.#md.renderer.rules.math_block!;
    this.#md.renderer.rules.math_block = (tokens, index, options, env, self) =>
      `<div class="katex-block" data-source-line="${tokens[index].map?.[0] ?? 0}">${mathBlock(tokens, index, options, env, self)}</div>\n`;

    const defaultImageRule: RendererRule =
      this.#md.renderer.rules.image ??
      ((tokens, index, options, _env, self) => self.renderToken(tokens, index, options));

    this.#md.renderer.rules.image = (tokens, index, options, env, self) => {
      const token = tokens[index];
      const resources = this.#resourcesFrom(env);
      const placeholder = `__MD_READER_RESOURCE_${resources.length}__`;

      resources.push({ placeholder, kind: 'image', href: String(token.attrGet('src') ?? '') });
      token.attrSet('src', placeholder);
      return defaultImageRule(tokens, index, options, env, self);
    };

    this.#md.renderer.rules.fence = (tokens, index, _options, env) => {
      const token = tokens[index];
      const language = token.info.trim().split(/\s+/, 1)[0].toLowerCase();
      if (language === 'mermaid') {
        return `<figure data-mermaid data-source-line="${token.map?.[0] ?? 0}"><pre><code>${this.#md.utils.escapeHtml(token.content)}</code></pre></figure>\n`;
      }
      const code = (env as RenderEnvironment).highlighted.get(token) ?? this.#md.utils.escapeHtml(token.content);
      const escapedLanguage = this.#md.utils.escapeHtml(language);
      const languageClass = language ? ` language-${escapedLanguage}` : '';
      const languageLabel = language === 'typescript' || language === 'ts'
        ? 'TS'
        : language === 'javascript' || language === 'js'
          ? 'JS'
          : language === 'python' || language === 'py'
            ? 'PY'
            : language
              ? language.toUpperCase()
              : 'TEXT';
      const copyLabel = this.#md.utils.escapeHtml(language ? `Copy ${language} code` : 'Copy code');

      return `<pre class="hljs-pre" data-source-line="${token.map?.[0] ?? 0}"><button class="copy-code-btn" type="button" data-copy-code data-code-language="${escapedLanguage}" aria-label="${copyLabel}"><span class="code-language">${this.#md.utils.escapeHtml(languageLabel)}</span><svg class="copy-code-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="9" y="3" width="12" height="12" rx="2"></rect><rect x="3" y="9" width="12" height="12" rx="2"></rect></svg><svg class="copy-success-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="m5 12 4 4L19 6"></path></svg></button><code class="hljs${languageClass}">${code}</code></pre>\n`;
    };
  }

  async render(source: string, revision: number): Promise<RenderResult> {
    const resources: RenderResource[] = [];
    const environment: RenderEnvironment = { resources, highlighted: new Map(), mathMacros: {} };
    const tokens = this.#md.parse(source, environment);
    await Promise.all(tokens.filter((token) => token.type === 'fence').map(async (token) => {
      const language = token.info.trim().split(/\s+/, 1)[0].toLowerCase();
      if (language === 'mermaid') return;
      const html = await highlightCode(token.content, language);
      if (html !== undefined) environment.highlighted.set(token, html);
    }));
    const slugs = new SlugGenerator();
    const headings: HeadingItem[] = [];

    for (let index = 0; index < tokens.length; index += 1) {
      const open = tokens[index];
      const inline = tokens[index + 1];

      if (open.type === 'heading_open' && inline?.type === 'inline') {
        const text = (inline.children ?? [])
          .filter((token) => token.type !== 'html_inline')
          .map((token) => token.content)
          .join('')
          .trim();
        const slug = slugs.slug(text);

        open.attrSet('id', slug);
        open.attrSet('data-source-line', String(open.map?.[0] ?? 0));
        headings.push({
          level: Number(open.tag.slice(1)),
          text,
          slug,
          line: open.map?.[0] ?? 0
        });
      }

      if (open.map && open.block && open.type !== 'inline') {
        open.attrSet('data-source-line', String(open.map[0]));
      }
      this.#replaceTableStyleWithClass(open);
    }

    // Only renderer-generated styles reach this point; source HTML remains disabled.
    const styles: string[] = [];
    let html = this.#md.renderer.render(tokens, this.#md.options, environment);
    html = html.replace(/<[^>]+\sstyle="[^"]*"[^>]*>/g, (tag) => {
      const css = tag.match(/\sstyle="([^"]*)"/)![1];
      const className = `reader-style-${styles.length}`;
      styles.push(`#document .${className}{${css}}`);
      const clean = tag.replace(/\sstyle="[^"]*"/, '');
      return /\sclass="/.test(clean)
        ? clean.replace(/\sclass="/, ` class="${className} `)
        : clean.replace(/^(<[^\s>]+)/, `$1 class="${className}"`);
    });
    return {
      revision,
      html,
      styles: styles.join('\n'),
      headings,
      resources
    };
  }

  #replaceTableStyleWithClass(token: Token): void {
    if (token.type !== 'th_open' && token.type !== 'td_open') return;

    const style = token.attrGet('style');
    const alignment = (typeof style === 'string' ? style.match(TABLE_ALIGNMENT)?.[1] : undefined)?.toLowerCase();
    if (!alignment) return;

    const existingClass = token.attrGet('class');
    token.attrSet('class', [existingClass, `align-${alignment}`].filter(Boolean).join(' '));
    token.attrs = token.attrs?.filter(([name]) => name !== 'style') ?? null;
  }

  #resourcesFrom(environment: Env | undefined): RenderResource[] {
    const resources = environment?.resources;
    if (!Array.isArray(resources)) throw new Error('MarkdownRenderer requires a resource collection');
    return resources as RenderResource[];
  }
}

import MarkdownIt from 'markdown-it';
import type { Env, MarkdownIt as MarkdownItInstance, RendererRule, Token } from 'markdown-it';
import taskLists from 'markdown-it-task-lists';
import hljs from 'highlight.js/lib/common';
import { SlugGenerator } from './SlugGenerator.js';
import type { HeadingItem, RenderResource, RenderResult } from './types.js';

interface RenderEnvironment extends Env {
  resources: RenderResource[];
}

const TABLE_ALIGNMENT = /text-align:\s*(left|center|right)/i;

export class MarkdownRenderer {
  readonly #md: MarkdownItInstance;

  constructor() {
    this.#md = new MarkdownIt({ html: false, linkify: true, typographer: false }).use(taskLists, {
      enabled: false,
      label: true
    });

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

    this.#md.renderer.rules.fence = (tokens, index) => {
      const token = tokens[index];
      const language = token.info.trim().split(/\s+/, 1)[0].toLowerCase();
      const code = language && hljs.getLanguage(language)
        ? hljs.highlight(token.content, { language, ignoreIllegals: true }).value
        : this.#md.utils.escapeHtml(token.content);
      const languageClass = language ? ` language-${this.#md.utils.escapeHtml(language)}` : '';
      const languageAttribute = language ? ` lang="${this.#md.utils.escapeHtml(language)}"` : '';

      return `<pre class="hljs-pre"><button class="copy-code-btn" type="button" data-copy-code aria-label="Copy code">Copy</button><code class="hljs copyable${languageClass}"${languageAttribute}>${code}</code></pre>\n`;
    };
  }

  render(source: string, revision: number): RenderResult {
    const resources: RenderResource[] = [];
    const environment: RenderEnvironment = { resources };
    const tokens = this.#md.parse(source, environment);
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

      this.#replaceTableStyleWithClass(open);
    }

    return {
      revision,
      html: this.#md.renderer.render(tokens, this.#md.options, environment),
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

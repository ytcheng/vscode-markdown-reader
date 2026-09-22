export type LinkKind = 'anchor' | 'markdown' | 'local' | 'external' | 'blocked';

const EXTERNAL_SCHEMES = new Set(['https:', 'http:', 'mailto:']);

export function classifyLink(href: string): LinkKind {
  if (href.startsWith('#')) return 'anchor';
  const scheme = href.match(/^[a-z][a-z\d+.-]*:/i)?.[0].toLowerCase();
  if (scheme) return EXTERNAL_SCHEMES.has(scheme) ? 'external' : 'blocked';

  const path = href.split('#', 1)[0].split('?', 1)[0];
  return path.toLocaleLowerCase().endsWith('.md') ? 'markdown' : 'local';
}

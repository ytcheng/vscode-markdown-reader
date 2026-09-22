import type { ViewportState, WebviewToExtensionMessage } from '../webview/messages.js';

const MAX_HREF_LENGTH = 8_192;
const MAX_COLLAPSED_SLUGS = 200;
const MAX_SLUG_LENGTH = 1_024;

export function parseWebviewMessage(value: unknown): WebviewToExtensionMessage | undefined {
  if (!isRecord(value) || typeof value.type !== 'string') return undefined;

  switch (value.type) {
    case 'ready':
    case 'toggleToc':
      return hasOnlyKeys(value, ['type']) ? { type: value.type } : undefined;
    case 'openLink':
      return hasOnlyKeys(value, ['type', 'href']) && typeof value.href === 'string' && value.href.length <= MAX_HREF_LENGTH
        ? { type: 'openLink', href: value.href }
        : undefined;
    case 'openSource':
      return hasOnlyKeys(value, ['type', 'line']) &&
        (value.line === undefined || (typeof value.line === 'number' && Number.isSafeInteger(value.line) && value.line >= 0))
        ? { type: 'openSource', line: value.line as number | undefined }
        : undefined;
    case 'viewportChanged': {
      const state = parseViewportState(value.state);
      return state ? { type: 'viewportChanged', state } : undefined;
    }
    default:
      return undefined;
  }
}

function parseViewportState(value: unknown): ViewportState | undefined {
  if (!isRecord(value) || !hasOnlyKeys(value, ['activeSlug', 'activeHeadingOffset', 'scrollTop', 'tocVisible', 'collapsedSlugs'])) {
    return undefined;
  }
  if (value.activeSlug !== undefined && (typeof value.activeSlug !== 'string' || value.activeSlug.length > MAX_SLUG_LENGTH)) return undefined;
  if (value.activeHeadingOffset !== undefined && !isFiniteNumber(value.activeHeadingOffset)) return undefined;
  if (!isFiniteNumber(value.scrollTop) || value.scrollTop < 0 || typeof value.tocVisible !== 'boolean') return undefined;
  if (!Array.isArray(value.collapsedSlugs) || value.collapsedSlugs.length > MAX_COLLAPSED_SLUGS) return undefined;
  if (!value.collapsedSlugs.every((slug) => typeof slug === 'string' && slug.length <= MAX_SLUG_LENGTH)) return undefined;

  return {
    activeSlug: value.activeSlug,
    activeHeadingOffset: value.activeHeadingOffset,
    scrollTop: value.scrollTop,
    tocVisible: value.tocVisible,
    collapsedSlugs: value.collapsedSlugs
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

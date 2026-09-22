import { describe, expect, it } from 'vitest';
import { parseWebviewMessage } from '../../src/security/messages.js';

describe('parseWebviewMessage', () => {
  it('accepts every known webview message shape', () => {
    expect(parseWebviewMessage({ type: 'ready' })).toEqual({ type: 'ready' });
    expect(parseWebviewMessage({ type: 'toggleToc' })).toEqual({ type: 'toggleToc' });
    expect(parseWebviewMessage({ type: 'setTocWidth', width: 300 })).toEqual({ type: 'setTocWidth', width: 300 });
    expect(parseWebviewMessage({ type: 'openSource', line: 3 })).toEqual({ type: 'openSource', line: 3 });
    expect(parseWebviewMessage({ type: 'openLink', href: 'https://example.com' })).toEqual({ type: 'openLink', href: 'https://example.com' });
    expect(
      parseWebviewMessage({
        type: 'viewportChanged',
        state: { activeSlug: 'intro', activeHeadingOffset: 12, scrollTop: 42, tocVisible: true, collapsedSlugs: ['api'] }
      })
    ).toEqual({
      type: 'viewportChanged',
      state: { activeSlug: 'intro', activeHeadingOffset: 12, scrollTop: 42, tocVisible: true, collapsedSlugs: ['api'] }
    });
  });

  it('rejects unknown, malformed, and unbounded input', () => {
    expect(parseWebviewMessage({ type: 'runCommand' })).toBeUndefined();
    expect(parseWebviewMessage({ type: 'openSource', line: -1 })).toBeUndefined();
    expect(parseWebviewMessage({ type: 'openSource', line: Number.POSITIVE_INFINITY })).toBeUndefined();
    expect(parseWebviewMessage({ type: 'openLink', href: 'x'.repeat(8193) })).toBeUndefined();
    expect(parseWebviewMessage({ type: 'setTocWidth', width: 179 })).toBeUndefined();
    expect(parseWebviewMessage({ type: 'setTocWidth', width: 481 })).toBeUndefined();
    expect(parseWebviewMessage({ type: 'setTocWidth', width: 300.5 })).toBeUndefined();
    expect(parseWebviewMessage({ type: 'viewportChanged', state: { scrollTop: 0, tocVisible: true, collapsedSlugs: [], extra: true } })).toBeUndefined();
    expect(parseWebviewMessage({ type: 'viewportChanged', state: { scrollTop: 0, tocVisible: true, collapsedSlugs: Array(201).fill('x') } })).toBeUndefined();
  });
});

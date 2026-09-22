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

it('validates setting and export messages without arbitrary HTML or commands', () => {
  expect(parseWebviewMessage({ type: 'updateSetting', requestId: 1, key: 'theme', value: 'github' })).toEqual({ type: 'updateSetting', requestId: 1, key: 'theme', value: 'github' });
  expect(parseWebviewMessage({ type: 'updateSetting', requestId: 1, key: 'fontSize', value: 100 })).toBeUndefined();
  expect(parseWebviewMessage({ type: 'updateSetting', requestId: 1, key: 'fontFamily', value: 'a; color:red' })).toBeUndefined();
  expect(parseWebviewMessage({ type: 'updateSetting', requestId: 1, key: '__proto__', value: {} })).toBeUndefined();
  expect(parseWebviewMessage({ type: 'resetSettings', requestId: 1 })).toEqual({ type: 'resetSettings', requestId: 1 });
  expect(parseWebviewMessage({ type: 'openSettings' })).toEqual({ type: 'openSettings' });
  expect(parseWebviewMessage({ type: 'print', revision: 1, diagrams: ['data:image/svg+xml;charset=utf-8,%3Csvg%2F%3E'] })).toBeDefined();
  expect(parseWebviewMessage({ type: 'exportHtml', revision: 1, diagrams: [], html: '<script>x</script>' })).toBeUndefined();
  expect(parseWebviewMessage({ type: 'print', revision: 1, diagrams: ['https://example.com'] })).toBeUndefined();
  expect(parseWebviewMessage({ type: 'print', revision: 1, diagrams: ['data:image/svg+xml;charset=utf-8,x" onerror="evil'] })).toBeUndefined();
});

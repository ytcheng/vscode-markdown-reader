import { describe, expect, it } from 'vitest';
import { classifyLink } from '../../src/security/links.js';

describe('classifyLink', () => {
  it('classifies anchors, local files, markdown files, and approved external schemes', () => {
    expect(classifyLink('#install')).toBe('anchor');
    expect(classifyLink('guide.md#api')).toBe('markdown');
    expect(classifyLink('images/logo.svg')).toBe('local');
    expect(classifyLink('https://example.com')).toBe('external');
    expect(classifyLink('mailto:reader@example.com')).toBe('external');
  });

  it('blocks executable, filesystem, and unknown schemes', () => {
    for (const href of ['javascript:alert(1)', 'data:text/html,boom', 'file:///secret', 'command:workbench.action.reloadWindow', 'vscode:foo']) {
      expect(classifyLink(href)).toBe('blocked');
    }
  });
});

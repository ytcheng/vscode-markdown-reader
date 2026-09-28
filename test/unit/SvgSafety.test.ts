// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { isSafeSvgDataUri, toSafeSvgDataUri } from '../../src/security/svg.js';

describe('local diagram SVG safety', () => {
  it.each([
    '<html><body>not svg</body></html>',
    '<svg><path></svg>',
    '<!DOCTYPE svg><svg></svg>',
    '<!DOCTYPE svg [<!ENTITY x "unsafe">]><svg><text>&x;</text></svg>',
    '<svg><script>alert(1)</script></svg>',
    '<svg><foreignObject><div>HTML</div></foreignObject></svg>',
    '<svg><rect OnLoAd="alert(1)" /></svg>',
    '<svg><a href="javascript:alert(1)"><text>bad</text></a></svg>',
    '<svg><a href="jav&#x61;script:alert(1)"><text>bad</text></a></svg>',
    '<svg><image href="https://example.com/image.png" /></svg>',
    '<svg><rect style="fill: url(https://example.com/paint.svg#x)" /></svg>'
  ])('rejects unsafe or malformed SVG: %s', (svg) => {
    expect(() => toSafeSvgDataUri(svg)).toThrow();
  });

  it('allows fragment-only references and encodes accepted SVG as a data URI', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="gradient0" /></defs><rect fill="url(#gradient0)" /><use href="#node1" /></svg>';
    const uri = toSafeSvgDataUri(svg);

    expect(uri).toBe(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
    expect(isSafeSvgDataUri(uri)).toBe(true);
  });

  it('preserves PlantUML source metadata without allowing other processing instructions', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><text>safe</text></svg><?plantuml-src abc123?>';
    expect(isSafeSvgDataUri(toSafeSvgDataUri(svg))).toBe(true);
    expect(() => toSafeSvgDataUri('<?xml-stylesheet href="https://example.com/style.css"?><svg xmlns="http://www.w3.org/2000/svg" />')).toThrow();
  });

  it('rejects malformed or non-SVG data URIs', () => {
    expect(isSafeSvgDataUri('data:image/png;base64,AA==')).toBe(false);
    expect(isSafeSvgDataUri('data:image/svg+xml;charset=utf-8,%E0%A4%A')).toBe(false);
    expect(isSafeSvgDataUri('data:image/svg+xml;charset=utf-8,%3Chtml%2F%3E')).toBe(false);
  });
});

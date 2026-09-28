const SVG_DATA_URI_PREFIX = 'data:image/svg+xml;charset=utf-8,';
const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const FORBIDDEN_ELEMENTS = new Set([
  'script', 'foreignobject', 'iframe', 'object', 'embed', 'audio', 'video',
  'animate', 'animatemotion', 'animatetransform', 'set'
]);
const URL_ATTRIBUTES = new Set(['href', 'src', 'data', 'poster', 'action', 'formaction']);

export function validateRendererSvg(svg: string): void {
  if (typeof svg !== 'string' || !svg.trim()) throw new Error('Renderer returned an empty SVG');
  if (/<!\s*(?:doctype|entity)\b/i.test(svg)) throw new Error('SVG declarations are not allowed');
  if (typeof DOMParser === 'undefined') throw new Error('SVG validation requires an XML parser');

  const parsed = new DOMParser().parseFromString(svg, 'image/svg+xml');
  if (parsed.querySelector('parsererror')) throw new Error('Renderer returned malformed SVG');
  const root = parsed.documentElement;
  if (!root || root.localName !== 'svg' || root.namespaceURI !== SVG_NAMESPACE) {
    throw new Error('Renderer output must have an SVG root element');
  }

  const validateNode = (node: Node): void => {
    if (node.nodeType === 7) {
      const target = (node as ProcessingInstruction).target.toLowerCase();
      if (target !== 'plantuml-src') throw new Error('SVG processing instructions are not allowed');
    }

    if (node.nodeType === 1) {
      const element = node as Element;
      if (FORBIDDEN_ELEMENTS.has(element.localName.toLowerCase())) {
        throw new Error('Active SVG elements are not allowed');
      }

      for (const attribute of Array.from(element.attributes)) {
        const name = attribute.name.toLowerCase();
        const value = attribute.value.trim();
        if (name.startsWith('on')) throw new Error('SVG event handlers are not allowed');
        if (name === 'xml:base') throw new Error('SVG base URLs are not allowed');
        if (URL_ATTRIBUTES.has(attribute.localName.toLowerCase()) && value && !value.startsWith('#')) {
          throw new Error('External SVG references are not allowed');
        }
        if (name === 'style' || /\burl\s*\(/i.test(value)) validateCss(value);
      }

      if (element.localName.toLowerCase() === 'style') validateCss(element.textContent ?? '');
    }

    for (const child of Array.from(node.childNodes)) validateNode(child);
  };

  validateNode(parsed);
}

export function toSafeSvgDataUri(svg: string): string {
  validateRendererSvg(svg);
  return `${SVG_DATA_URI_PREFIX}${encodeURIComponent(svg)}`;
}

export function isSafeSvgDataUri(value: string): boolean {
  if (!value.startsWith(SVG_DATA_URI_PREFIX)) return false;
  try {
    validateRendererSvg(decodeURIComponent(value.slice(SVG_DATA_URI_PREFIX.length)));
    return true;
  } catch {
    return false;
  }
}

function validateCss(css: string): void {
  const normalized = css.replace(/\/\*[\s\S]*?\*\//g, '');
  if (normalized.includes('\\') || /@import\b|expression\s*\(|-moz-binding/i.test(normalized)) {
    throw new Error('Unsafe SVG CSS is not allowed');
  }

  const urlPattern = /\burl\s*\(([^)]*)\)/gi;
  let match: RegExpExecArray | null;
  while ((match = urlPattern.exec(normalized)) !== null) {
    const target = match[1].trim().replace(/^(?:"([^"]*)"|'([^']*)')$/, '$1$2');
    if (!target.startsWith('#') || target.length < 2 || /[\s"'()]/.test(target.slice(1))) {
      throw new Error('External SVG CSS references are not allowed');
    }
  }

  if (/\burl\b/i.test(normalized.replace(urlPattern, ''))) {
    throw new Error('Malformed SVG CSS reference');
  }
}

const SVG_DATA_URI_PREFIX = 'data:image/svg+xml;charset=utf-8,';
const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const FORBIDDEN_ELEMENTS = new Set([
  'script', 'foreignobject', 'iframe', 'object', 'embed', 'audio', 'video',
  'animate', 'animatemotion', 'animatetransform', 'set'
]);
const URL_ATTRIBUTES = new Set(['href', 'src', 'data', 'poster', 'action', 'formaction']);

export function validateRendererSvg(svg: string): void {
  if (typeof svg !== 'string' || !svg.trim()) throw new Error('Renderer returned an empty SVG');
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(svg)) throw new Error('SVG contains invalid XML characters');

  const stack: string[] = [];
  let rootSeen = false;
  let rootClosed = false;
  let styleContent: string | undefined;
  let offset = 0;

  while (offset < svg.length) {
    if (svg[offset] !== '<') {
      const end = svg.indexOf('<', offset);
      const text = decodeXmlEntities(svg.slice(offset, end < 0 ? svg.length : end));
      if (styleContent !== undefined) styleContent += text;
      else if (stack.length === 0 && text.trim()) throw new Error('Text outside the SVG root is not allowed');
      offset = end < 0 ? svg.length : end;
      continue;
    }

    if (svg.startsWith('<!--', offset)) {
      const end = svg.indexOf('-->', offset + 4);
      if (end < 0 || svg.slice(offset + 4, end).includes('--')) throw new Error('Malformed SVG comment');
      offset = end + 3;
      continue;
    }

    if (svg.startsWith('<?', offset)) {
      if (styleContent !== undefined) throw new Error('Processing instructions are not allowed in SVG styles');
      const end = svg.indexOf('?>', offset + 2);
      if (end < 0) throw new Error('Malformed SVG processing instruction');
      const instruction = svg.slice(offset + 2, end).trim();
      const target = instruction.match(/^([A-Za-z_][A-Za-z0-9_.:-]*)/)?.[1]?.toLowerCase();
      if (target !== 'plantuml-src') throw new Error('SVG processing instructions are not allowed');
      offset = end + 2;
      continue;
    }

    if (svg.startsWith('<!', offset)) throw new Error('SVG declarations are not allowed');

    const end = findTagEnd(svg, offset + 1);
    if (end < 0) throw new Error('Malformed SVG tag');
    let tag = svg.slice(offset + 1, end).trim();
    if (tag.startsWith('/')) {
      if (styleContent !== undefined) {
        const styleName = stack.at(-1)?.split(':').at(-1)?.toLowerCase();
        if (styleName !== 'style') throw new Error('Elements inside SVG styles are not allowed');
      }
      const closingName = tag.slice(1).trim();
      if (!/^[A-Za-z_:][A-Za-z0-9_.:-]*$/.test(closingName) || stack.pop() !== closingName) {
        throw new Error('SVG tags are not properly nested');
      }
      if (closingName.split(':').at(-1)?.toLowerCase() === 'style') {
        validateCss(styleContent ?? '');
        styleContent = undefined;
      }
      if (stack.length === 0) rootClosed = true;
      offset = end + 1;
      continue;
    }

    const selfClosing = /\/\s*$/.test(tag);
    if (selfClosing) tag = tag.replace(/\/\s*$/, '').trimEnd();
    const nameMatch = tag.match(/^([A-Za-z_:][A-Za-z0-9_.:-]*)/);
    if (!nameMatch) throw new Error('Malformed SVG element name');
    const name = nameMatch[1];
    const localName = name.split(':').at(-1)!.toLowerCase();
    const attributes = parseAttributes(tag.slice(name.length));

    if (!rootSeen) {
      if (name !== 'svg' || attributes.get('xmlns') !== SVG_NAMESPACE) {
        throw new Error('Renderer output must have an SVG namespace root element');
      }
      rootSeen = true;
    } else if (rootClosed || stack.length === 0) {
      throw new Error('Renderer output must contain one SVG root element');
    }

    if (FORBIDDEN_ELEMENTS.has(localName)) throw new Error('Active SVG elements are not allowed');
    if (styleContent !== undefined) throw new Error('Elements inside SVG styles are not allowed');

    for (const [attributeName, value] of attributes) {
      const normalizedName = attributeName.toLowerCase();
      const attributeLocalName = normalizedName.split(':').at(-1)!;
      if (normalizedName.startsWith('on')) throw new Error('SVG event handlers are not allowed');
      if (normalizedName === 'xml:base') throw new Error('SVG base URLs are not allowed');
      if (URL_ATTRIBUTES.has(attributeLocalName) && value && !isFragment(value)) {
        throw new Error('External SVG references are not allowed');
      }
      if (attributeLocalName === 'style' || /\burl\s*\(/i.test(value)) validateCss(value);
    }

    if (localName === 'style') styleContent = '';
    if (!selfClosing) stack.push(name);
    else if (stack.length === 0) rootClosed = true;
    else if (localName === 'style') {
      validateCss(styleContent ?? '');
      styleContent = undefined;
    }

    offset = end + 1;
  }

  if (!rootSeen || !rootClosed || stack.length > 0 || styleContent !== undefined) {
    throw new Error('Renderer returned incomplete SVG');
  }
}

export function toSafeSvgDataUri(svg: string): string {
  validateRendererSvg(svg);
  return `${SVG_DATA_URI_PREFIX}${encodeURIComponent(svg)}`;
}

export function isSafeSvgDataUri(value: string): boolean {
  if (!value.startsWith(SVG_DATA_URI_PREFIX)) return false;
  const encoded = value.slice(SVG_DATA_URI_PREFIX.length);
  if (!isEncodedComponent(encoded)) return false;
  try {
    validateRendererSvg(decodeURIComponent(encoded));
    return true;
  } catch {
    return false;
  }
}

function isEncodedComponent(value: string): boolean {
  if (!value) return false;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code === 0x25) {
      if (!isHexCode(value.charCodeAt(index + 1)) || !isHexCode(value.charCodeAt(index + 2))) return false;
      index += 2;
      continue;
    }
    const safePunctuation = code === 0x2d || code === 0x5f || code === 0x2e || code === 0x21 ||
      code === 0x7e || code === 0x2a || code === 0x27 || code === 0x28 || code === 0x29;
    if (!safePunctuation && !(code >= 0x30 && code <= 0x39) && !(code >= 0x41 && code <= 0x5a) && !(code >= 0x61 && code <= 0x7a)) return false;
  }
  return true;
}

function isHexCode(code: number): boolean {
  return (code >= 0x30 && code <= 0x39) || (code >= 0x41 && code <= 0x46) || (code >= 0x61 && code <= 0x66);
}

function findTagEnd(source: string, offset: number): number {
  let quote = '';
  for (let index = offset; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (character === quote) quote = '';
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === '>') {
      return index;
    }
  }
  return -1;
}

function parseAttributes(source: string): Map<string, string> {
  const attributes = new Map<string, string>();
  let offset = 0;
  while (offset < source.length) {
    while (/\s/.test(source[offset] ?? '')) offset += 1;
    if (offset >= source.length) break;
    const match = source.slice(offset).match(/^([A-Za-z_:][A-Za-z0-9_.:-]*)/);
    if (!match) throw new Error('Malformed SVG attribute name');
    const name = match[1];
    if (attributes.has(name)) throw new Error('Duplicate SVG attribute');
    offset += name.length;
    while (/\s/.test(source[offset] ?? '')) offset += 1;
    if (source[offset] !== '=') throw new Error('SVG attributes must have values');
    offset += 1;
    while (/\s/.test(source[offset] ?? '')) offset += 1;
    const quote = source[offset];
    if (quote !== '"' && quote !== "'") throw new Error('SVG attributes must be quoted');
    offset += 1;
    const end = source.indexOf(quote, offset);
    if (end < 0) throw new Error('Unclosed SVG attribute');
    const rawValue = source.slice(offset, end);
    if (rawValue.includes('<')) throw new Error('SVG attributes cannot contain unescaped markup');
    attributes.set(name, decodeXmlEntities(rawValue));
    offset = end + 1;
  }
  return attributes;
}

function decodeXmlEntities(value: string): string {
  let decoded = '';
  for (let offset = 0; offset < value.length; offset += 1) {
    if (value[offset] !== '&') {
      decoded += value[offset];
      continue;
    }
    const end = value.indexOf(';', offset + 1);
    if (end < 0) throw new Error('Malformed XML entity');
    const entity = value.slice(offset + 1, end);
    const named: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
    if (entity in named) decoded += named[entity];
    else if (/^#\d+$/.test(entity) || /^#x[0-9a-f]+$/i.test(entity)) {
      const codePoint = entity[1].toLowerCase() === 'x' ? Number.parseInt(entity.slice(2), 16) : Number.parseInt(entity.slice(1), 10);
      if (!isValidXmlCodePoint(codePoint)) throw new Error('Invalid XML character reference');
      decoded += String.fromCodePoint(codePoint);
    } else throw new Error('Unknown XML entity');
    offset = end;
  }
  return decoded;
}

function isValidXmlCodePoint(codePoint: number): boolean {
  return codePoint === 0x9 || codePoint === 0xa || codePoint === 0xd ||
    (codePoint >= 0x20 && codePoint <= 0xd7ff) ||
    (codePoint >= 0xe000 && codePoint <= 0xfffd) ||
    (codePoint >= 0x10000 && codePoint <= 0x10ffff);
}

function isFragment(value: string): boolean {
  const fragment = value.trim();
  return fragment.startsWith('#') && fragment.length > 1 && !/[\s"'()]/.test(fragment.slice(1));
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
    if (!isFragment(target)) throw new Error('External SVG CSS references are not allowed');
  }
  if (/\burl\b/i.test(normalized.replace(urlPattern, ''))) throw new Error('Malformed SVG CSS reference');
}

import { render } from '@plantuml/core';

const INCLUDE_DIRECTIVE = /^[\t ]*!(?:include(?:_once|_many|sub|url)?|import)\b/im;
const INCOMPLETE_ARROW = /^[\t ]*[\w.$-]+\s*(?:<--?|--?>|==?>)\s*$/m;
const SYNTAX_ERROR_ARTWORK = /<text\b(?=[^>]*\bfill="#FF0000")(?=[^>]*\bfont-weight="bold")[^>]*>\s*Syntax Error\?/i;
let queue: Promise<void> = Promise.resolve();
let targetSequence = 0;

export function renderPlantUML(source: string, dark = false): Promise<string> {
  if (INCLUDE_DIRECTIVE.test(source)) {
    return Promise.reject(new Error('PlantUML include directives are unavailable offline because optional libraries are not bundled.'));
  }
  if (INCOMPLETE_ARROW.test(source)) return Promise.reject(new Error('PlantUML contains an incomplete arrow.'));
  const renderDiagram = () => new Promise<string>((resolve, reject) => {
    const target = document.createElement('div');
    target.id = `reader-plantuml-${++targetSequence}`;
    target.style.position = 'fixed';
    target.style.left = '-10000px';
    target.style.visibility = 'hidden';
    document.body.append(target);
    const observer = new MutationObserver(() => {
      const svg = target.querySelector('svg');
      if (!svg) return;
      const markup = target.innerHTML;
      finish(() => {
        if (SYNTAX_ERROR_ARTWORK.test(markup)) reject(new Error('PlantUML syntax error.'));
        else resolve(markup);
      });
    });
    const finish = (settle: () => void) => {
      observer.disconnect();
      target.remove();
      settle();
    };
    observer.observe(target, { childList: true, subtree: true });
    try {
      render(source.split(/\r\n|\r|\n/), target.id, { dark });
    } catch (error) {
      finish(() => reject(asError(error)));
    }
  });
  const result = queue.then(renderDiagram, renderDiagram);
  queue = result.then(() => undefined, () => undefined);
  return result;
}

function asError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

import { renderToString } from '@plantuml/core';

const INCLUDE_DIRECTIVE = /^[\t ]*!(?:include(?:_once|_many|sub|url)?|import)\b/im;
const INCOMPLETE_ARROW = /^[\t ]*[\w.$-]+\s*(?:<--?|--?>|==?>)\s*$/m;
const SYNTAX_ERROR_ARTWORK = /<text\b(?=[^>]*\bfill="#FF0000")(?=[^>]*\bfont-weight="bold")[^>]*>\s*Syntax Error\?/i;
let queue: Promise<void> = Promise.resolve();

export function renderPlantUML(source: string): Promise<string> {
  if (INCLUDE_DIRECTIVE.test(source)) {
    return Promise.reject(new Error('PlantUML include directives are unavailable offline because optional libraries are not bundled.'));
  }
  if (INCOMPLETE_ARROW.test(source)) return Promise.reject(new Error('PlantUML contains an incomplete arrow.'));
  const render = () => new Promise<string>((resolve, reject) => {
    renderToString(source.split(/\r\n|\r|\n/), (svg) => {
      if (SYNTAX_ERROR_ARTWORK.test(svg)) reject(new Error('PlantUML syntax error.'));
      else resolve(svg);
    }, (message) => reject(new Error(message)));
  });
  const result = queue.then(render, render);
  queue = result.then(() => undefined, () => undefined);
  return result;
}

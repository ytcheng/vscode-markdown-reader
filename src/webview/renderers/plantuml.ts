import { renderToString } from '@plantuml/core';

let queue: Promise<void> = Promise.resolve();

export function renderPlantUML(source: string): Promise<string> {
  const render = () => new Promise<string>((resolve, reject) => {
    renderToString(source.split(/\r\n|\r|\n/), resolve, (message) => reject(new Error(message)));
  });
  const result = queue.then(render, render);
  queue = result.then(() => undefined, () => undefined);
  return result;
}

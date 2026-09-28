import { expect, it, vi } from 'vitest';
import { renderPlantUML } from '../../src/webview/renderers/plantuml.js';

const svg = '<svg xmlns="http://www.w3.org/2000/svg"><text>Alice</text></svg>';
const renderToString = vi.hoisted(() => vi.fn());
vi.mock('@plantuml/core', () => ({ renderToString }));

it('wraps renderToString success and error callbacks', async () => {
  renderToString.mockImplementationOnce((_lines, onSuccess) => onSuccess(svg));
  await expect(renderPlantUML('@startuml\nAlice -> Bob\n@enduml')).resolves.toBe(svg);
  expect(renderToString).toHaveBeenCalledWith(
    ['@startuml', 'Alice -> Bob', '@enduml'], expect.any(Function), expect.any(Function)
  );
});

it('serializes PlantUML callbacks and continues after a rejected render', async () => {
  let failFirst!: (message: string) => void;
  renderToString
    .mockImplementationOnce((_lines, _success, onError) => { failFirst = onError; })
    .mockImplementationOnce((_lines, onSuccess) => onSuccess(svg));
  const first = renderPlantUML('@startuml\ninvalid\n@enduml');
  const second = renderPlantUML('@startuml\nAlice -> Bob\n@enduml');
  await vi.waitFor(() => expect(renderToString).toHaveBeenCalledTimes(1));
  failFirst('Invalid PlantUML');
  await expect(first).rejects.toThrow('Invalid PlantUML');
  await expect(second).resolves.toBe(svg);
  expect(renderToString).toHaveBeenCalledTimes(2);
});

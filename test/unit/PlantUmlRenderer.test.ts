import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { renderPlantUML } from '../../src/webview/renderers/plantuml.js';

const svg = '<svg xmlns="http://www.w3.org/2000/svg"><text>Alice</text></svg>';
const renderToString = vi.hoisted(() => vi.fn());
vi.mock('@plantuml/core', () => ({ renderToString }));

beforeEach(() => renderToString.mockReset());
afterEach(() => renderToString.mockReset());

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

it.each([
  '!include https://example.invalid/missing.puml',
  '!include <C4/C4_Context>',
  '!includeurl https://example.invalid/missing.puml',
  '!import https://example.invalid/library.puml'
])('rejects unavailable include directives before the engine can load a script: %s', async (directive) => {
  renderToString.mockImplementationOnce((_lines, onSuccess) => onSuccess(svg));

  await expect(renderPlantUML(`@startuml\n${directive}\nAlice -> Bob\n@enduml`))
    .rejects.toThrow(/include.*unavailable offline/i);
  expect(renderToString).not.toHaveBeenCalled();
});

it('reports an incomplete PlantUML arrow instead of entering a blocking parser path', async () => {
  renderToString.mockClear();
  renderToString.mockImplementationOnce((_lines, onSuccess) => onSuccess(svg));

  await expect(renderPlantUML('@startuml\nAlice ->\n@enduml')).rejects.toThrow(/incomplete.*arrow/i);
  expect(renderToString).not.toHaveBeenCalled();
});

it('rejects PlantUML syntax-error artwork returned through the success callback', async () => {
  const errorSvg = '<svg xmlns="http://www.w3.org/2000/svg"><text fill="#FF0000" font-weight="bold"> Syntax Error? (Assumed diagram type: sequence)</text></svg>';
  renderToString.mockImplementationOnce((_lines, onSuccess) => onSuccess(errorSvg));

  await expect(renderPlantUML('@startuml\nnot a diagram\n@enduml')).rejects.toThrow(/PlantUML syntax error/i);
});

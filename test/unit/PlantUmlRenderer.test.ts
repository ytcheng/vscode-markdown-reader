// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { renderPlantUML } from '../../src/webview/renderers/plantuml.js';

const lightSvg = '<svg xmlns="http://www.w3.org/2000/svg"><text fill="#000000">Alice</text><path stroke="#000000"></path></svg>';
const darkSvg = '<svg xmlns="http://www.w3.org/2000/svg"><text fill="#e6edf3">Alice</text><path stroke="#c9d1d9"></path></svg>';
const render = vi.hoisted(() => vi.fn());
vi.mock('@plantuml/core', () => ({ render }));

let targets: HTMLElement[];

beforeEach(() => {
  document.body.innerHTML = '';
  targets = [];
  render.mockReset().mockImplementation((_lines: string[], targetId: string, options?: { dark?: boolean }) => {
    const target = document.getElementById(targetId)!;
    targets.push(target);
    setTimeout(() => { if (target.isConnected) target.innerHTML = options?.dark ? darkSvg : lightSvg; }, 0);
  });
});
afterEach(() => { render.mockReset(); document.body.innerHTML = ''; });

it('passes dark mode to PlantUML and returns its light-foreground SVG', async () => {
  await expect(renderPlantUML('@startuml\nAlice -> Bob\n@enduml', true)).resolves.toBe(darkSvg);
  expect(render).toHaveBeenCalledWith(['@startuml', 'Alice -> Bob', '@enduml'], expect.any(String), { dark: true });
});

it('uses light mode by default', async () => {
  await expect(renderPlantUML('@startuml\nAlice -> Bob\n@enduml')).resolves.toBe(lightSvg);
  expect(render).toHaveBeenCalledWith(['@startuml', 'Alice -> Bob', '@enduml'], expect.any(String), { dark: false });
});

it('serializes PlantUML renders and continues after syntax-error artwork', async () => {
  render.mockImplementation((_lines: string[], targetId: string) => { targets.push(document.getElementById(targetId)!); });
  const first = renderPlantUML('@startuml\ninvalid\n@enduml');
  const second = renderPlantUML('@startuml\nAlice -> Bob\n@enduml');
  await vi.waitFor(() => expect(render).toHaveBeenCalledTimes(1));
  targets[0].innerHTML = '<svg xmlns="http://www.w3.org/2000/svg"><text fill="#FF0000" font-weight="bold">Syntax Error?</text></svg>';
  await expect(first).rejects.toThrow(/PlantUML syntax error/i);
  await vi.waitFor(() => expect(render).toHaveBeenCalledTimes(2));
  targets[1].innerHTML = lightSvg;
  await expect(second).resolves.toBe(lightSvg);
  expect(targets[0].isConnected).toBe(false);
  expect(targets[1].isConnected).toBe(false);
});

it.each([
  '!include https://example.invalid/missing.puml',
  '!include <C4/C4_Context>',
  '!includeurl https://example.invalid/missing.puml',
  '!import https://example.invalid/library.puml'
])('rejects unavailable include directives before the engine can load a script: %s', async (directive) => {
  await expect(renderPlantUML(`@startuml\n${directive}\nAlice -> Bob\n@enduml`))
    .rejects.toThrow(/include.*unavailable offline/i);
  expect(render).not.toHaveBeenCalled();
});

it('reports an incomplete PlantUML arrow instead of entering a blocking parser path', async () => {
  await expect(renderPlantUML('@startuml\nAlice ->\n@enduml')).rejects.toThrow(/incomplete.*arrow/i);
  expect(render).not.toHaveBeenCalled();
});

it('rejects syntax-error artwork rendered through the DOM API', async () => {
  render.mockImplementationOnce((_lines: string[], targetId: string) => {
    const target = document.getElementById(targetId)!;
    targets.push(target);
    setTimeout(() => { target.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg"><text fill="#FF0000" font-weight="bold">Syntax Error?</text></svg>'; }, 0);
  });

  await expect(renderPlantUML('@startuml\nnot a diagram\n@enduml')).rejects.toThrow(/PlantUML syntax error/i);
  expect(targets[0].isConnected).toBe(false);
});

it('rejects synchronous engine errors and releases the render queue', async () => {
  render
    .mockImplementationOnce(() => { throw new Error('Engine failed'); })
    .mockImplementationOnce((_lines: string[], targetId: string, options?: { dark?: boolean }) => {
      const target = document.getElementById(targetId)!;
      targets.push(target);
      setTimeout(() => { target.innerHTML = options?.dark ? darkSvg : lightSvg; }, 0);
    });

  await expect(renderPlantUML('@startuml\nfirst\n@enduml')).rejects.toThrow('Engine failed');
  await expect(renderPlantUML('@startuml\nAlice -> Bob\n@enduml')).resolves.toBe(lightSvg);
});

import { expect, it, vi } from 'vitest';
import { renderGraphviz } from '../../src/webview/renderers/graphviz.js';

const instance = vi.hoisted(() => vi.fn());
vi.mock('@viz-js/viz', () => ({ instance }));

it('reuses one Viz instance and keeps later DOT renders usable after an error', async () => {
  const renderString = vi.fn()
    .mockImplementationOnce(() => { throw new Error('syntax error near line 3'); })
    .mockReturnValue('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
  instance.mockResolvedValue({ renderString });

  await expect(renderGraphviz('digraph { A -> }')).rejects.toThrow('syntax error near line 3');
  await expect(renderGraphviz('digraph { A -> B }')).resolves.toContain('<svg');
  expect(instance).toHaveBeenCalledTimes(1);
  expect(renderString).toHaveBeenCalledTimes(2);
});

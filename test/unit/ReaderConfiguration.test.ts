import { beforeEach, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({
  get: vi.fn((_key: string, fallback: unknown) => fallback), inspect: vi.fn(), update: vi.fn(async () => undefined)
}));
vi.mock('vscode', () => ({
  workspace: { getConfiguration: vi.fn(() => mock) },
  ConfigurationTarget: { Global: 1, Workspace: 2, WorkspaceFolder: 3 }
}));
import { readSettings, writeSetting } from '../../src/settings/ReaderConfiguration.js';
beforeEach(() => { vi.clearAllMocks(); mock.inspect.mockReturnValue(undefined); });
it('reads defaults and writes user settings when no workspace override exists', async () => {
  expect(readSettings({} as never).fontSize).toBe(16);
  await writeSetting({} as never, 'fontSize', 20);
  expect(mock.update).toHaveBeenCalledWith('fontSize', 20, 1);
});
it('writes to an existing workspace override instead of silently ignoring the change', async () => {
  mock.inspect.mockReturnValue({ workspaceValue: 22 });
  await writeSetting({} as never, 'fontSize', 20);
  expect(mock.update).toHaveBeenCalledWith('fontSize', 20, 2);
  mock.inspect.mockReturnValue({ workspaceValue: 22, workspaceFolderValue: 24 });
  await writeSetting({} as never, 'fontSize', 18);
  expect(mock.update).toHaveBeenLastCalledWith('fontSize', 18, 3);
});

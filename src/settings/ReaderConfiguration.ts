import * as vscode from 'vscode';
import { configurationKeys, defaultSettings, isSettingValue, normalizeSettings, settingKeys, type ReaderSettings } from './ReaderSettings.js';

export function readSettings(uri: vscode.Uri): ReaderSettings {
  const config = vscode.workspace.getConfiguration('markdownReader', uri);
  const values: Partial<Record<keyof ReaderSettings, unknown>> = {};
  for (const key of settingKeys) values[key] = config.get(configurationKeys[key], defaultSettings[key]);
  return normalizeSettings(values);
}
export async function writeSetting(uri: vscode.Uri, key: keyof ReaderSettings, value: string | number): Promise<void> {
  if (!isSettingValue(key, value)) throw new Error('Invalid reading setting');
  const config = vscode.workspace.getConfiguration('markdownReader', uri);
  const name = configurationKeys[key];
  const inspection = config.inspect(name);
  const target = inspection?.workspaceFolderValue !== undefined ? vscode.ConfigurationTarget.WorkspaceFolder
    : inspection?.workspaceValue !== undefined ? vscode.ConfigurationTarget.Workspace : vscode.ConfigurationTarget.Global;
  await config.update(name, value, target);
}
export async function resetSettings(uri: vscode.Uri): Promise<void> {
  for (const key of settingKeys) await writeSetting(uri, key, defaultSettings[key]);
}

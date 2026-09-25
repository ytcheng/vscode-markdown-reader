// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ReaderControls } from '../../src/webview/ReaderControls.js';
import { controlsHtml } from '../../src/webview/controlsHtml.js';
import { defaultSettings } from '../../src/settings/ReaderSettings.js';
let controls: ReaderControls;
const post = vi.fn();
const get = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
beforeEach(() => {
  document.body.innerHTML = controlsHtml + '<article id="document"></article>';
  document.body.className = 'vscode-light';
  document.body.removeAttribute('data-reader-theme');
  document.body.removeAttribute('data-reader-color-mode');
  document.body.removeAttribute('data-reader-color');
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new Event('close')); };
  post.mockClear();
  controls = new ReaderControls(document, post);
  controls.start();
  controls.setRevision(1);
  controls.apply({ ...defaultSettings, fontSizeMode: 'custom' });
});
afterEach(() => controls.dispose());
it('follows the VS Code editor font size by default', () => {
  controls.apply({ ...defaultSettings, editorFontSize: 19 });
  expect(get<HTMLSelectElement>('reader-font-size-mode').value).toBe('editor');
  expect(get('reader-font-size-control').hidden).toBe(true);
  expect(get('reader-font-size-follow-note').hidden).toBe(false);
  expect(document.body.style.getPropertyValue('--reader-font-size')).toBe('21px');
  expect(get('reader-editor-font-size-value').textContent).toBe('19px');
  expect(get('reader-effective-font-size-value').textContent).toBe('21px');
});
it('starts from the saved dark theme before receiving host settings', () => {
  controls.dispose();
  document.body.dataset.readerTheme = 'github';
  document.body.dataset.readerColorMode = 'dark';
  document.body.dataset.readerColor = 'dark';
  controls = new ReaderControls(document, post);
  controls.start();
  expect(document.body.dataset.readerTheme).toBe('github');
  expect(document.body.dataset.readerColorMode).toBe('dark');
  expect(document.body.dataset.readerColor).toBe('dark');
});
it('opens the menu with keyboard navigation and returns focus on Escape', () => {
  get('reader-menu-toggle').click();
  expect(get('reader-menu').hidden).toBe(false);
  expect(get('reader-menu-toggle').getAttribute('aria-expanded')).toBe('true');
  document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
  expect(document.activeElement?.getAttribute('data-action')).toBe('print');
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  expect(get('reader-menu').hidden).toBe(true);
  expect(document.activeElement?.id).toBe('reader-menu-toggle');
});
it('previews and persists typography, and restores focus after settings close', () => {
  get('reader-menu-toggle').click();
  document.querySelector<HTMLButtonElement>('[data-action="settings"]')!.click();
  expect(get<HTMLDialogElement>('reader-settings').open).toBe(true);
  const size = get<HTMLInputElement>('reader-font-size');
  size.value = '22'; size.dispatchEvent(new Event('change', { bubbles: true }));
  expect(document.body.style.getPropertyValue('--reader-font-size')).toBe('22px');
  expect(post).toHaveBeenCalledWith({ type: 'updateSetting', key: 'fontSize', value: 22, requestId: 1 });
  get('reader-settings-close').click();
  expect(document.activeElement?.id).toBe('reader-menu-toggle');
});
it('applies settings without overwriting host theme classes and reports large mode', () => {
  document.body.className = 'vscode-dark';
  controls.apply({ ...defaultSettings, theme: 'github', colorMode: 'light' });
  expect(document.body.dataset.readerTheme).toBe('github');
  expect(document.body.dataset.readerColor).toBe('light');
  expect(document.body.classList.contains('vscode-dark')).toBe(true);
  controls.setLargeFile(true);
  expect(get('reader-performance').hidden).toBe(false);
  controls.setLargeFile(false);
  expect(get('reader-performance').hidden).toBe(true);
});
it('sends export snapshots as image data only', () => {
  document.querySelector('#document')!.innerHTML = '<figure data-mermaid><img class="mermaid-diagram" src="data:image/svg+xml;charset=utf-8,%3Csvg%2F%3E"></figure>';
  document.querySelector<HTMLButtonElement>('[data-action="exportHtml"]')!.click();
  expect(post).toHaveBeenCalledWith({ type: 'exportHtml', revision: 1, diagrams: ['data:image/svg+xml;charset=utf-8,%3Csvg%2F%3E'] });
});
it('announces appearance changes and excludes an outdated diagram from export', () => {
  const changed = vi.fn();
  controls.dispose();
  controls = new ReaderControls(document, post, changed);
  controls.start();
  controls.setRevision(1);
  document.querySelector('#document')!.innerHTML = '<figure data-mermaid><img class="mermaid-diagram" data-reader-color="light" src="data:image/svg+xml;charset=utf-8,%3Csvg%2F%3E"></figure>';
  changed.mockClear();
  controls.apply({ ...defaultSettings, colorMode: 'dark' });
  expect(changed).toHaveBeenCalledWith('dark');
  document.querySelector<HTMLButtonElement>('[data-action="exportHtml"]')!.click();
  expect(post).toHaveBeenCalledWith({ type: 'exportHtml', revision: 1, diagrams: [''] });
});
it('keeps rapid typography changes ahead of delayed host broadcasts', () => {
  get('reader-font-larger').click();
  get('reader-font-larger').click();
  controls.apply({ ...defaultSettings, fontSizeMode: 'custom', fontSize: 17 });
  get('reader-font-larger').click();
  expect(post).toHaveBeenLastCalledWith({ type: 'updateSetting', key: 'fontSize', value: 19, requestId: 3 });
});
it('does not overwrite an unfinished custom font edit on unrelated broadcasts', () => {
  const preset = get<HTMLSelectElement>('reader-font-preset');
  preset.value = 'custom'; preset.dispatchEvent(new Event('change', { bubbles: true }));
  const font = get<HTMLInputElement>('reader-font-family');
  font.value = 'Noto Sans';
  controls.apply({ ...defaultSettings, contentMaxWidth: 1000 });
  expect(font.hidden).toBe(false);
  expect(font.value).toBe('Noto Sans');
});
it('preserves every rapid click before the first configuration write completes', () => {
  for (let i = 0; i < 3; i++) get('reader-font-larger').click();
  expect(post.mock.calls.map(([message]) => message.value)).toEqual([17, 18, 19]);
});
it('acknowledges exact requests when values repeat during rapid changes', () => {
  get('reader-font-larger').click();
  get('reader-font-larger').click();
  get('reader-font-smaller').click();
  const firstId = post.mock.calls[0][0].requestId;
  controls.acknowledge(firstId, { ...defaultSettings, fontSizeMode: 'custom', fontSize: 17 });
  controls.apply({ ...defaultSettings, fontSizeMode: 'custom', fontSize: 18 });
  get('reader-font-larger').click();
  expect(post.mock.calls.map(([message]) => message.value)).toEqual([17, 18, 17, 18]);
  const finalId = post.mock.calls.at(-1)![0].requestId;
  controls.acknowledge(finalId, { ...defaultSettings, fontSizeMode: 'custom', fontSize: 18 });
  controls.apply({ ...defaultSettings, fontSizeMode: 'custom', fontSize: 24 });
  expect(document.body.style.getPropertyValue('--reader-font-size')).toBe('24px');
});

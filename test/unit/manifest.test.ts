import { expect, it } from 'vitest';
import manifest from '../../package.json';

it('declares the default Markdown Reader editor, commands, shortcuts, and bounded settings', () => {
  const contributions = manifest.contributes!;
  expect(contributions.customEditors).toEqual(expect.arrayContaining([expect.objectContaining({ viewType: 'markdownReader.preview', priority: 'default', selector: [{ filenamePattern: '*.md' }] })]));
  expect(contributions.commands?.map((command) => command.command)).toEqual(expect.arrayContaining(['markdownReader.openPreview', 'markdownReader.openSource', 'markdownReader.togglePreview', 'markdownReader.toggleToc']));
  expect(contributions.keybindings?.[1]?.when).toBe('activeCustomEditorId == markdownReader.preview');
  expect(contributions.configuration?.properties?.['markdownReader.toc.maxDepth']).toMatchObject({ minimum: 1, maximum: 6 });
  expect(contributions.configuration?.properties?.['markdownReader.toc.width']).toMatchObject({ minimum: 180, maximum: 480 });
  expect(contributions.configuration?.properties).not.toHaveProperty('markdownReader.defaultMode');
  expect(contributions.menus?.['editor/title']).toEqual([
    expect.objectContaining({ command: 'markdownReader.openSource', group: 'navigation@1' })
  ]);
  expect(contributions.commands).toEqual(expect.arrayContaining([
    expect.objectContaining({ command: 'markdownReader.openSource', icon: '$(edit)' })
  ]));
});

import * as assert from 'node:assert';
import * as vscode from 'vscode';

suite('Markdown Reader custom editor', () => {
  test('registers all reader commands after activation', async () => {
    await vscode.extensions.getExtension('local.markdown-reader')?.activate();
    const commands = await vscode.commands.getCommands(true);
    for (const command of ['markdownReader.openPreview', 'markdownReader.openSource', 'markdownReader.togglePreview', 'markdownReader.toggleToc']) {
      assert.ok(commands.includes(command), `${command} must be registered`);
    }
  });
});

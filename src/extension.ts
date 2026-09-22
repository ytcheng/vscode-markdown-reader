import * as vscode from 'vscode';
import { MarkdownEditorProvider, MARKDOWN_READER_VIEW_TYPE } from './editor/MarkdownEditorProvider.js';

export function activate(context: vscode.ExtensionContext): void {
  const provider = new MarkdownEditorProvider(context);
  context.subscriptions.push(vscode.window.registerCustomEditorProvider(MARKDOWN_READER_VIEW_TYPE, provider, {
    supportsMultipleEditorsPerDocument: true,
    webviewOptions: { retainContextWhenHidden: false }
  }));
  context.subscriptions.push(
    vscode.commands.registerCommand('markdownReader.openPreview', () => provider.openPreview()),
    vscode.commands.registerCommand('markdownReader.openSource', () => provider.openSource()),
    vscode.commands.registerCommand('markdownReader.togglePreview', () => provider.togglePreview()),
    vscode.commands.registerCommand('markdownReader.toggleToc', () => provider.toggleToc()),
    vscode.commands.registerCommand('markdownReader.readingSettings', () => provider.showSettings()),
    vscode.commands.registerCommand('markdownReader.exportHtml', () => provider.requestExport('exportHtml')),
    vscode.commands.registerCommand('markdownReader.print', () => provider.requestExport('print'))
  );
}

export function deactivate(): void {}

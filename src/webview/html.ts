import { controlsHtml } from './controlsHtml.js';
import { resolveReaderLanguage } from './localization.js';
import type { ReaderSettings } from '../settings/ReaderSettings.js';
export interface WebviewHtmlOptions {
  cspSource: string;
  nonce?: string;
  mermaidFrameUri?: string;
  mermaidScriptUri?: string;
  katexStyleUri?: string;
  scriptUri: string;
  styleUri: string;
  highContrastStyleUri: string;
  vscodeLanguage?: string;
  initialSettings?: Pick<ReaderSettings, 'theme' | 'colorMode'>;
}

export function getWebviewHtml(options: WebviewHtmlOptions): string {
  const vscodeLanguage = options.vscodeLanguage ?? 'en';
  const language = resolveReaderLanguage('auto', vscodeLanguage);
  const escapedVscodeLanguage = vscodeLanguage.replace(/[&"<>]/g, (character) => ({ '&': '&amp;', '"': '&quot;', '<': '&lt;', '>': '&gt;' })[character]!);
  const readerTheme = options.initialSettings?.theme === 'github' ? 'github' : 'reader';
  const configuredColorMode = options.initialSettings?.colorMode;
  const readerColorMode = configuredColorMode === 'dark' || configuredColorMode === 'auto' ? configuredColorMode : 'light';
  const readerColor = readerColorMode === 'auto' ? '' : ` data-reader-color="${readerColorMode}"`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${options.cspSource} https: data:; frame-src 'self'; connect-src ${options.cspSource}; font-src ${options.cspSource}; style-src ${options.cspSource} 'unsafe-inline'; script-src ${options.cspSource}${options.nonce ? ` 'nonce-${options.nonce}'` : ''};">
  <link rel="stylesheet" href="${options.styleUri}">
  <link rel="stylesheet" href="${options.highContrastStyleUri}">
  ${options.katexStyleUri ? `<link rel="stylesheet" href="${options.katexStyleUri}">` : ''}
  <style id="render-styles" nonce="${options.nonce ?? ''}"></style>
  <script defer src="${options.scriptUri}"></script>
</head>
<body class="vscode-light" data-vscode-language="${escapedVscodeLanguage}" data-reader-language="${language}" data-reader-theme="${readerTheme}" data-reader-color-mode="${readerColorMode}"${readerColor} data-mermaid-frame-uri="${options.mermaidFrameUri ?? ''}" data-mermaid-script-uri="${options.mermaidScriptUri ?? ''}">
  ${controlsHtml}
  <div class="reader">
    <nav id="toc" class="toc" aria-label="Table of contents" data-i18n-aria-label="tableOfContents"></nav>
    <div id="toc-resizer" class="toc-resizer" role="separator" aria-label="Resize table of contents" data-i18n-aria-label="resizeTableOfContents" aria-orientation="vertical"></div>
    <div id="toc-drawer-backdrop" class="toc-drawer-backdrop" hidden></div>
    <aside id="toc-drawer" class="toc-drawer" aria-label="Table of contents" data-i18n-aria-label="tableOfContents" aria-hidden="true" hidden></aside>
    <main class="document-container">
      <button id="toggle-toc" class="toc-toggle" type="button" aria-label="Toggle table of contents" aria-expanded="true"><svg width="1.2em" height="1.2em" fill="currentColor" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 30" class="btn-icon" aria-hidden="true"><path d="M2.5,7.5L2.5,22.5C2.5,25.261425,4.7385759,27.500002,7.5,27.500002L22.5,27.500002C25.261425,27.500002,27.500002,25.261425,27.500002,22.5L27.500002,7.5C27.500002,4.7385762,25.261425,2.5,22.5,2.5L7.5,2.5C4.7385759,2.5,2.5,4.7385762,2.5,7.5ZM7.5,25.000002Q5,25.000002,5,22.5L5,7.5Q5,5,7.5,5L22.5,5Q25.000002,5,25.000002,7.5L25.000002,22.5Q25.000002,25.000002,22.5,25.000002L7.5,25.000002ZM8.5,8.75L8.5,21.25C8.5,21.940357,9.059643699999999,22.5,9.75,22.5C10.440355799999999,22.5,11,21.940357,11,21.25L11,8.75C11,8.059644200000001,10.440355799999999,7.5,9.75,7.5C9.059643699999999,7.5,8.5,8.059644200000001,8.5,8.75Z" fill="currentColor"></path></svg></button>
      <section id="search-bar" class="search-bar" role="search" hidden>
        <label id="search-label" class="search-label" for="search-input" data-i18n="find">Find</label>
        <input id="search-input" type="search" autocomplete="off" spellcheck="false" aria-controls="document">
        <span id="search-count" class="search-count" aria-live="polite">0 of 0</span>
        <button id="search-previous" type="button" aria-label="Previous match" data-i18n-aria-label="previousMatch" disabled>↑</button>
        <button id="search-next" type="button" aria-label="Next match" data-i18n-aria-label="nextMatch" disabled>↓</button>
        <button id="search-close" type="button" aria-label="Close find" data-i18n-aria-label="closeFind">×</button>
      </section>
      <article id="document" class="markdown-body" tabindex="-1"></article>
    </main>
  </div>
</body>
</html>`;
}

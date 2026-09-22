export interface WebviewHtmlOptions {
  cspSource: string;
  scriptUri: string;
  styleUri: string;
  highContrastStyleUri: string;
}

export function getWebviewHtml(options: WebviewHtmlOptions): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${options.cspSource} https: data:; style-src ${options.cspSource}; script-src ${options.cspSource};">
  <link rel="stylesheet" href="${options.styleUri}">
  <link rel="stylesheet" href="${options.highContrastStyleUri}">
  <script defer src="${options.scriptUri}"></script>
</head>
<body class="vscode-light">
  <div class="reader">
    <header class="reader-toolbar">
      <button id="open-source" type="button" aria-label="Open Markdown source">Edit</button>
      <button id="toggle-toc" type="button" aria-label="Toggle table of contents" aria-expanded="true">Contents</button>
    </header>
    <nav id="toc" class="toc" aria-label="Table of contents"></nav>
    <div id="toc-drawer-backdrop" class="toc-drawer-backdrop" hidden></div>
    <aside id="toc-drawer" class="toc-drawer" aria-label="Table of contents" aria-hidden="true" hidden></aside>
    <main class="document-container">
      <article id="document" class="markdown-body" tabindex="-1"></article>
    </main>
  </div>
</body>
</html>`;
}

# Changelog

All notable changes to Markdown Reader are documented in this file.

## 0.2.3

- Replace heading Edit text buttons with compact pencil icons, preserving tooltips, accessible labels, and source navigation.
- Update English and Chinese documentation and screenshots to showcase the TOC, Shiki, Mermaid, KaTeX, and tables.

## 0.2.2

- Fix Mermaid diagrams remaining as source in VS Code: use a sandboxed srcdoc renderer and pass the local bundle through the parent webview instead of navigating to a resource URL.
- Add an actual VS Code Webview rendering regression test covering diagrams, formulas, host messages, and invalid-diagram fallback.

## 0.2.1

- Fix blank previews in VS Code by accepting the host's same-origin render messages after its bootstrap masks `window.parent`.
- Continue rejecting cross-origin and embedded-frame messages.

## 0.2.0

- Replace highlight.js with bundled Shiki TextMate highlighting and on-demand grammar loading.
- Render Mermaid diagrams offline in an isolated frame, with source fallback for invalid diagrams.
- Add KaTeX inline and display math, local fonts, and per-document macro isolation.
- Double-click document blocks or use heading Edit controls to reveal the corresponding source line in the same editor group.
- Copy encoded heading fragments with the accessible Copy Heading Link control.
- Remember TOC visibility and collapsed branches per document across closing and reopening, with independent split previews.
- Keep scripts restricted by CSP and render diagrams in a separate sandbox; generated inline styles are allowed for Mermaid compatibility.

## 0.1.1

- Refresh open previews when Markdown changes in VS Code or is written by an external tool.
- Recreate document sessions and file watchers safely after previews are closed and reopened.

## 0.1.0 — Initial release

- Open Markdown files in a focused reading view in the current VS Code tab.
- Navigate long documents with a synchronized, resizable table of contents.
- Switch between source and preview with one shortcut.
- Refresh automatically after file changes while preserving the reading position where possible.
- Search rendered documents and copy fenced code blocks.
- Configure table-of-contents visibility, depth, width, and reading-column width.

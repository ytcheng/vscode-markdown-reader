# Changelog

All notable changes to Markdown Reader are documented in this file.

## 0.3.9 — 2026-09-25

- Add a selection-based edit action at the upper-right of selected text to open its source block, and remove double-click source navigation.
- Add a full-preview zoom viewer for Mermaid diagrams and standalone Markdown images, with zoom, drag-to-pan, and fit controls.

## 0.3.8 — 2026-09-24

- Add English and Simplified Chinese reader UI, following VS Code's display language by default with a separate language setting.

## 0.3.7 — 2026-09-24

- Use the configured reading font in the table of contents.
- Keep Markdown diffs in the standard VS Code text diff while regular Markdown files continue to open in Markdown Reader.

## 0.3.6 — 2026-09-24

- Redesign the Marketplace icon to make its Markdown connection clearer, with a transparent background.

## 0.3.5 — 2026-09-24

- Refresh the English and Chinese Marketplace README introductions and add localized animated table-of-contents demos.
- Clarify the Marketplace description around current-tab reading and document navigation.

## 0.3.4 — 2026-09-24

- Follow the VS Code editor font size by default, with an option to use a custom reading font size.
- Keep Mermaid diagrams synchronized with the reader's light, dark, and automatic appearance.
- Refine automatic theme colors and dark-mode text, and adjust reading font size for closer visual alignment with the editor.

## 0.3.3 — 2026-09-23

- Fix the white strip beside the table of contents and make its light background easier to distinguish.
- Match dark-mode Webview scrollbars to the VS Code editor theme.
- Prevent "Webview is disposed" errors when a preview closes during loading or an asynchronous update.

## 0.3.2 — 2026-09-22

- Extend the light Reader directory background across scrollbar tracks, corners and thumb borders, including the narrow-screen drawer.
- Update English and Chinese documentation with menu and reading-settings screenshots.

## 0.3.1 — 2026-09-22

- Default to the original Reader + Light appearance.
- Give the light Reader table of contents and narrow-screen directory drawer an rgb(249, 250, 251) background.

## 0.3.0 — 2026-09-22

- Add a Chrome Markdown Reader-style top-right menu and accessible reading settings dialog.
- Add Reader / GitHub typography themes, light / dark / automatic appearance, custom local body fonts, adjustable font size and content width.
- Persist settings at the existing workspace override or user scope and synchronize open readers.
- Add automatic large file mode (1 MiB by default), rendering code, math and diagrams as source while preserving navigation and search.
- Export portable HTML with embedded local images, styles and math fonts; retain rendered Mermaid diagrams as image snapshots.
- Open a print-ready browser page with paper-friendly spacing, wrapping and pagination; save PDF through the browser print dialog.


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

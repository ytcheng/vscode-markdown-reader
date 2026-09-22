# Markdown Reader

Markdown Reader opens `.md` files as a reading view in the current VS Code tab.
It provides a document TOC, stable heading anchors, automatic refresh after a
file changes, and Source/Preview switching.

## Commands and settings

- **Open Preview**, **Open Source**, **Toggle Preview**, and **Toggle Table of Contents** are available under the Markdown Reader command category.
- `Cmd/Ctrl+Shift+V` opens Reader from a Markdown text editor and returns to source when Reader is active.
- Configure `markdownReader.toc.enabled`, `markdownReader.toc.maxDepth` (1–6), `markdownReader.toc.width` (220–320), and `markdownReader.content.maxWidth` (560–1600).

The extension uses `markdownReader.preview` as the default custom editor for
`.md`. Use **Reopen Editor With…** to switch back to VS Code's Text Editor.

## Scope and security

V0.1 supports CommonMark basics, tables, task lists, strikethrough, autolinks,
and fenced code. It does not support Markdown HTML, Mermaid, KaTeX, or Shiki
syntax highlighting. Only `https:`, `http:`, and `mailto:` links may be opened
externally; other schemes are blocked. Local images are limited to the document
workspace root (or document directory outside a workspace).

The visual baseline is `@md-reader/theme` 2.0.5 under MIT; see the bundled
`THIRD_PARTY_NOTICES.md` and distributed license.

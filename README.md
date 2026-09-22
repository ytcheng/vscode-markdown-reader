# Markdown Reader

> Read Markdown in VS Code with a synchronized table of contents, Shiki code highlighting, Mermaid diagrams, and KaTeX math — all in one tab, all offline.

[中文文档](README.zh-CN.md) · [GitHub repository](https://github.com/ytcheng/vscode-markdown-reader)

![Markdown Reader showing a nested table of contents, Shiki code highlighting, a Mermaid diagram, KaTeX math, and a table](assets/markdown-reader-preview.png)

Markdown Reader turns Markdown files into focused, document-style reading views without leaving your current editor tab. It is designed for people who read long specifications, notes, documentation, and AI-generated Markdown in VS Code.

## Highlights

- **Choose your theme and typography** — Reader / GitHub themes, light / dark / follow-VS-Code appearance, local body fonts and 12–32 px text.
- **Large file mode** — automatically shows code, math and diagrams as source for documents of 1 MiB or larger.
- **Export and print** — save HTML with embedded local resources, or print and save PDF through your browser.
- **Read in the current tab** — open Markdown as a clean document instead of a source file or a forced side-by-side preview.
- **Synchronized table of contents** — headings become a navigable TOC that follows your reading position.
- **Stay oriented after changes** — refreshes when the file changes and restores your reading position where possible.
- **Source and Preview, one shortcut** — switch in either direction with <kbd>Ctrl</kbd>/<kbd>Cmd</kbd> + <kbd>Shift</kbd> + <kbd>V</kbd>.
- **Find in the document** — use <kbd>Ctrl</kbd>/<kbd>Cmd</kbd> + <kbd>F</kbd> to search, highlight results, and move between matches.
- **Shiki code highlighting** — TextMate grammars, language labels, and copy buttons; unknown languages remain readable plain text.
- **Diagrams and math, offline** — Mermaid fenced diagrams and KaTeX inline/block formulas render with bundled resources.
- **Edit what you read** — double-click body text or click the **pencil icon** beside a heading to open its source line in the same editor group.
- **Copy heading links** — use **#** beside a heading to copy its encoded `#fragment` for links within that document.
- **Remember your TOC** — visibility and collapsed branches survive closing/reopening a document, independently for each document in the workspace.
- **Fits your layout** — show or hide the TOC, resize it, choose its heading depth, and set a preferred reading width.
- **Several documents at once** — each Markdown file gets its own independent reader tab.

## Getting started

1. Install [**Markdown Reader: Focus Mode**](https://marketplace.visualstudio.com/items?itemName=chengjian.vscode-markdown-reader) from the VS Code Marketplace.
2. Open any `.md` file. Markdown Reader is registered as the default reading editor for Markdown files.
3. If VS Code opens the text editor instead, choose **Reopen Editor With…** from the editor title menu, then select **Markdown Reader**.

### Switch between reading and editing

| What you want to do | How |
| --- | --- |
| Open the reading view | Run **Markdown Reader: Open Preview** |
| Return to the Markdown source | Run **Markdown Reader: Open Source** |
| Edit a specific passage | Double-click the passage, or click a heading’s pencil icon |
| Copy a heading link | Click **#** beside the heading |
| Toggle Source / Preview | <kbd>Ctrl</kbd>/<kbd>Cmd</kbd> + <kbd>Shift</kbd> + <kbd>V</kbd> |
| Show or hide the table of contents | Run **Markdown Reader: Toggle Table of Contents** |
| Change theme, font and size | Top-right **☰ → Reading Settings…** |
| Export HTML | Top-right **☰ → Export HTML…** |
| Print or save PDF | Top-right **☰ → Print / Save as PDF…** |
| Search the rendered document | <kbd>Ctrl</kbd>/<kbd>Cmd</kbd> + <kbd>F</kbd> |

All commands are also available from the Command Palette (`Ctrl`/`Cmd` + `Shift` + `P`) under **Markdown Reader**.

## Reading settings, printing and export

Open the **☰** menu at the top right for View Source, **Print / Save as PDF…**, **Export HTML…**, **Reading Settings…**, Feedback and About.

![Reader menu with reading settings, HTML export and printing](assets/markdown-reader-menu.png)

The default is **Reader + Light**, with a white reading surface and an `rgb(249, 250, 251)` table-of-contents background, including its scrollbar. Reading Settings offers **Reader / GitHub** typography, independent light / dark / follow-VS-Code appearance, locally installed body fonts, 12–32 px font size and content width. Headings scale with the body; code stays monospace. Workbench high contrast takes priority. Changes apply immediately and persist to an existing workspace override, or otherwise to user settings; open readers stay synchronized.

![Reading Settings with Reader and Light selected, font size, content width and large file mode](assets/markdown-reader-settings.png)

**Large file mode** displays a clickable ⚡ indicator and shows code, math and diagrams as source, preserving navigation, copying and search. Switch it off for full rendering. This reduces rendering costs; it does not paginate the Markdown parser or the entire DOM.

**Export HTML** embeds styles, readable local images and math fonts. HTTPS images remain external. Completed Mermaid diagrams are embedded as SVG images; pending diagrams and large-mode content retain source with a notice. Custom system fonts are not bundled.

**Print / Save as PDF** opens a temporary HTML page in your default browser. Use its print button and the browser print dialog to print or save a PDF. Paper styles hide controls, wrap code and improve pagination. There is no native PDF generator. In remote extension environments, export HTML and download it to print in a local browser.

The command palette also exposes **Markdown Reader: Reading Settings**, **Export HTML** and **Print / Save as PDF** while a reader is active.

## Configuration

Configure Markdown Reader in VS Code Settings, or add the following to `settings.json`:

```json
{
  "markdownReader.theme": "reader",
  "markdownReader.colorMode": "light",
  "markdownReader.fontFamily": "",
  "markdownReader.fontSize": 16,
  "markdownReader.largeFile.mode": "auto",
  "markdownReader.largeFile.thresholdKb": 1024,
  "markdownReader.toc.enabled": true,
  "markdownReader.toc.maxDepth": 3,
  "markdownReader.toc.width": 260,
  "markdownReader.content.maxWidth": 900
}
```

| Setting | Default | Description |
| --- | ---: | --- |
| `markdownReader.toc.enabled` | `true` | Show the table of contents when opening a document. |
| `markdownReader.toc.maxDepth` | `3` | Include headings through this level (`1`–`6`). |
| `markdownReader.toc.width` | `260` | Default TOC width in pixels (`180`–`480`). You can also resize it in the reader. |
| `markdownReader.content.maxWidth` | `900` | Maximum reading-column width in pixels (`560`–`1600`). |
| `markdownReader.theme` | `reader` | `reader`, `github` |
| `markdownReader.colorMode` | `light` | `auto`, `light`, `dark` |
| `markdownReader.fontFamily` | `""` | Local font family list; empty uses system fonts. |
| `markdownReader.fontSize` | `16` | Body size in pixels, 12–32. |
| `markdownReader.largeFile.mode` | `auto` | `auto`, `on`, `off` |
| `markdownReader.largeFile.thresholdKb` | `1024` | UTF-8 size threshold in KiB. |

## Markdown support

Markdown Reader supports the everyday Markdown features needed for documentation and notes:

- CommonMark basics: headings, paragraphs, emphasis, lists, block quotes, code, and horizontal rules
- Tables, task lists, strikethrough, autolinks, and fenced code blocks
- Local and HTTPS images
- In-document anchors, Markdown file links, and external web links

Use fenced blocks labelled `mermaid` for diagrams, `$...$` for inline math, and `$$...$$` for display math. Invalid diagrams retain their source with an error message; invalid formulas remain readable. All grammars, diagram code, fonts, and styles are bundled for offline use. Diagrams and formulas render locally without uploading document content or requiring an API key.

Source navigation targets the beginning of the clicked Markdown block. Links, buttons, and form controls keep their normal behavior. TOC state is remembered for the most recent 100 document URIs in each workspace; existing split previews remain independent. `toc.enabled` sets the default for documents without saved state.

Raw Markdown HTML remains disabled. Diagrams are rendered in a sandboxed local frame and displayed as non-interactive SVG images. Generated heading controls are excluded from search; diagram and formula internals are not searched.

## Safety and link handling

For safety, external links are limited to `https:`, `http:`, and `mailto:`. Other schemes are blocked. Local images are loaded only from the workspace root, or from the document directory when the file is outside a workspace.

## Development

```bash
npm install
npm run check
```

## License

[MIT](LICENSE)

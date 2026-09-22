# Markdown Preview Search Design

## Goal

Give the Markdown Reader preview an editor-like in-document search experience.

## Interaction

- `Ctrl+F` on Windows/Linux and `Cmd+F` on macOS opens the reader search bar and focuses its query field.
- Typing updates matches in the rendered Markdown body immediately. Matching is case-insensitive and literal.
- The bar shows the selected match index and total matches. `Enter` and the next button move forward; `Shift+Enter` and the previous button move backward. Navigation wraps around.
- `Escape` closes the bar, restores focus to the document, and removes match highlighting. The close button does the same.
- An empty query reports zero matches and performs no navigation. Search is limited to the rendered article, excluding the TOC and controls.

## Architecture

- `getWebviewHtml` provides an accessible search bar in the document container, initially hidden.
- `ReaderApp` owns keyboard handling, match discovery, navigation, and cleanup. It wraps matching text nodes in dedicated `<mark>` nodes and unwraps them before each new search and whenever a render replaces the article content.
- CSS positions the bar at the top right of the reading surface, reflows safely for narrow viewports, and distinguishes the active result from other results with VS Code theme variables.

## Accessibility and Safety

- Controls have labels, the count uses a polite live region, and buttons expose disabled state when there are no results.
- The search query is never interpreted as HTML or a regular expression. Text-node traversal avoids altering attributes, links, code structure, or user-provided markup semantics beyond transient highlight wrappers.

## Testing

- Unit tests cover opening with `Ctrl+F`/`Cmd+F`, text matching and count, forward/backward wrapping, `Enter` variants, and `Escape` cleanup.
- HTML tests cover the presence and initial hidden state of the accessible controls.
- Run type checks, focused unit tests, then the full unit suite and build.

# Markdown Preview Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add editor-style in-document find to the Markdown Reader preview.

**Architecture:** The webview HTML supplies an initially hidden, accessible find bar. `ReaderApp` owns literal text-node matching, result navigation, and removal of temporary highlight wrappers. LESS anchors the bar to the reading surface.

**Tech Stack:** TypeScript, DOM APIs, LESS, Vitest with JSDOM.

---

## File structure

- `src/webview/html.ts`: Accessible find-bar controls.
- `src/webview/ReaderApp.ts`: Keyboard, match, navigation, and cleanup behavior.
- `media/reader.less`: Find-bar and match styles.
- `test/unit/WebviewHtml.test.ts`: Static markup regression coverage.
- `test/unit/ReaderApp.test.ts`: Search interaction coverage.

### Task 1: Define and test find-bar markup

**Files:** Modify `src/webview/html.ts`; modify `test/unit/WebviewHtml.test.ts`.

- [ ] **Step 1: Write a failing HTML test**

```ts
it('includes an initially hidden accessible search bar', () => {
  const html = getWebviewHtml(options);
  expect(html).toContain('id="search-bar"');
  expect(html).toContain('id="search-input"');
  expect(html).toContain('id="search-count"');
  expect(html).toContain('aria-live="polite"');
});
```

- [ ] **Step 2: Verify RED** — run `npm run test:unit -- test/unit/WebviewHtml.test.ts`; expect failure because `search-bar` is absent.

- [ ] **Step 3: Add the minimal markup immediately before `#document`**

```html
<section id="search-bar" class="search-bar" role="search" hidden>
  <label class="search-label" for="search-input">Find</label>
  <input id="search-input" type="search" autocomplete="off" spellcheck="false" aria-controls="document" />
  <span id="search-count" class="search-count" aria-live="polite">0 of 0</span>
  <button id="search-previous" type="button" aria-label="Previous match" disabled>↑</button>
  <button id="search-next" type="button" aria-label="Next match" disabled>↓</button>
  <button id="search-close" type="button" aria-label="Close find">×</button>
</section>
```

- [ ] **Step 4: Verify GREEN** — run `npm run test:unit -- test/unit/WebviewHtml.test.ts`; expect pass.
- [ ] **Step 5: Commit** — run `git add src/webview/html.ts test/unit/WebviewHtml.test.ts && git commit -m "feat: add preview search controls"`.

### Task 2: Add shortcut handling and literal matches

**Files:** Modify `src/webview/ReaderApp.ts`; modify `test/unit/ReaderApp.test.ts`.

- [ ] **Step 1: Write failing interaction tests**

```ts
it('opens search with Ctrl+F and highlights literal case-insensitive matches', () => {
  const { app } = setup();
  app.handleMessage({ type: 'render', result: { ...renderResult(), html: '<p>Alpha alpha <code>ALPHA</code></p>' } });
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', ctrlKey: true, bubbles: true, cancelable: true }));
  const input = document.querySelector('#search-input') as HTMLInputElement;
  input.value = 'alpha'; input.dispatchEvent(new Event('input', { bubbles: true }));
  expect((document.querySelector('#search-bar') as HTMLElement).hidden).toBe(false);
  expect(document.querySelectorAll('#document mark[data-search-match]')).toHaveLength(3);
  expect(document.querySelector('#search-count')?.textContent).toBe('1 of 3');
});
```

Add a second test dispatching the same `f` event with `metaKey: true` and expecting a visible bar.

- [ ] **Step 2: Verify RED** — run `npm run test:unit -- test/unit/ReaderApp.test.ts`; expect failure due to absent fixture controls or match marks.

- [ ] **Step 3: Implement the smallest behavior** — extend `setup()` with the Task 1 markup. In `ReaderApp`, add `#matches: HTMLElement[] = []`, `#activeMatchIndex = -1`, and listeners for the input and three buttons. In `#onKeyDown`, intercept `(event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f'`, prevent default, reveal the bar, and focus/select its input. For each input, unwrap old matches, use a `TreeWalker` over `this.article` text nodes, find literal case-insensitive occurrences, and replace them with text fragments plus `<mark data-search-match>`. Select the first result and show `1 of N`; an empty input shows `0 of 0`.

- [ ] **Step 4: Verify GREEN** — run `npm run test:unit -- test/unit/ReaderApp.test.ts`; expect pass.
- [ ] **Step 5: Commit** — run `git add src/webview/ReaderApp.ts test/unit/ReaderApp.test.ts && git commit -m "feat: highlight preview search matches"`.

### Task 3: Navigate, clean up, and style results

**Files:** Modify `src/webview/ReaderApp.ts`; modify `media/reader.less`; modify `test/unit/ReaderApp.test.ts`.

- [ ] **Step 1: Write failing navigation and cleanup tests**

```ts
it('wraps between search matches with Enter and Shift+Enter', () => {
  const { app } = setup();
  app.handleMessage({ type: 'render', result: { ...renderResult(), html: '<p>one one</p>' } });
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', ctrlKey: true }));
  const input = document.querySelector('#search-input') as HTMLInputElement;
  input.value = 'one'; input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  expect(document.querySelector('#search-count')?.textContent).toBe('2 of 2');
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true }));
  expect(document.querySelector('#search-count')?.textContent).toBe('1 of 2');
});
```

Add an Escape test that asserts a hidden bar and no `mark[data-search-match]` elements.

- [ ] **Step 2: Verify RED** — run `npm run test:unit -- test/unit/ReaderApp.test.ts`; expect failure because index navigation and cleanup are missing.

- [ ] **Step 3: Implement minimal navigation and cleanup** — handle Enter/Shift+Enter on the input; previous/next button clicks; Escape while the bar is open; and close clicks. `#selectSearchMatch(index)` must modulo-wrap, set `data-search-active` only on the active mark, update the count, and call `scrollIntoView({ behavior: 'auto', block: 'center' })`. `#closeSearch()` hides the bar, clears the query and wrappers, resets buttons/count, and focuses the article. Call cleanup before replacing `article.innerHTML` in `applyRender` and unregister all added listeners in `dispose`.

- [ ] **Step 4: Add CSS** — style `.search-bar` as a high-z-index top-right control group, fit the input and buttons to VS Code theme colors, use `mark[data-search-match]` for non-active emphasis and `mark[data-search-active]` for stronger emphasis. Add a max-width/offset rule in the existing `@media (max-width: 800px)` block.

- [ ] **Step 5: Verify GREEN** — run `npm run test:unit -- test/unit/ReaderApp.test.ts`; expect pass.
- [ ] **Step 6: Run full verification** — run `npm run check:types && npm run test:unit && npm run build`; expect all exit codes to be zero.
- [ ] **Step 7: Commit** — run `git add src/webview/ReaderApp.ts media/reader.less test/unit/ReaderApp.test.ts && git commit -m "feat: navigate preview search results"`.

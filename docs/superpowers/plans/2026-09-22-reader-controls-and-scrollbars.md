# 阅读器控件与滚动条调整 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 删除 Webview 顶部工具栏，将目录控制移至正文左上角，并提供更紧凑目录和统一的浅色细滚动条。

**Architecture:** Webview HTML 将只保留目录切换按钮、目录和阅读正文；`ReaderApp` 继续以 `#toggle-toc` 作为唯一目录触发器，因此桌面和窄屏的现有消息与抽屉行为不变。LESS 负责去除工具栏布局、放置图标按钮、缩减目录边距并为全部滚动容器设置跨浏览器滚动条外观；扩展清单只在编辑器标题栏贡献带图标的源码操作。

**Tech Stack:** TypeScript、VS Code extension manifest、LESS、Vitest、jsdom。

---

### Task 1: 更新 Webview 结构与行为测试

**Files:**
- Modify: `test/unit/WebviewHtml.test.ts`
- Modify: `test/unit/ReaderApp.test.ts`
- Modify: `src/webview/html.ts`

- [ ] **Step 1: 为正文目录按钮和无顶部工具栏写失败测试**

在 `test/unit/WebviewHtml.test.ts` 的现有测试末尾加入：

```ts
  expect(html).not.toContain('reader-toolbar');
  expect(html).not.toContain('id="open-source"');
  expect(html).toContain('id="toggle-toc"');
  expect(html).toContain('class="toc-toggle"');
  expect(html).toContain('aria-label="Toggle table of contents"');
  expect(html).toContain('aria-expanded="true"');
```

在 `test/unit/ReaderApp.test.ts` 的 `setup()` HTML 中删除 `header.reader-toolbar`，并在 `main.document-container` 内、`article` 之前加入：

```html
<button id="toggle-toc" class="toc-toggle" type="button" aria-label="Toggle table of contents" aria-expanded="true"><span aria-hidden="true">☰</span></button>
```

- [ ] **Step 2: 运行测试并确认它因旧顶部工具栏而失败**

运行：`npx vitest run test/unit/WebviewHtml.test.ts test/unit/ReaderApp.test.ts`

预期：`WebviewHtml` 断言失败，输出仍包含 `reader-toolbar` 或 `open-source`。

- [ ] **Step 3: 最小化更新 Webview HTML**

将 `src/webview/html.ts` 中 `reader` 的内容替换为：

```html
    <nav id="toc" class="toc" aria-label="Table of contents"></nav>
    <div id="toc-drawer-backdrop" class="toc-drawer-backdrop" hidden></div>
    <aside id="toc-drawer" class="toc-drawer" aria-label="Table of contents" aria-hidden="true" hidden></aside>
    <main class="document-container">
      <button id="toggle-toc" class="toc-toggle" type="button" aria-label="Toggle table of contents" aria-expanded="true"><span aria-hidden="true">☰</span></button>
      <article id="document" class="markdown-body" tabindex="-1"></article>
    </main>
```

不要修改 `ReaderApp`：它已通过同一 `#toggle-toc` ID 支持桌面切换和窄屏抽屉、Escape 关闭与焦点恢复。

- [ ] **Step 4: 运行测试并确认通过**

运行：`npx vitest run test/unit/WebviewHtml.test.ts test/unit/ReaderApp.test.ts`

预期：两个测试文件全部通过，现有窄屏抽屉键盘测试保持绿色。

### Task 2: 调整编辑器标题栏命令贡献

**Files:**
- Modify: `test/unit/manifest.test.ts`
- Modify: `package.json`

- [ ] **Step 1: 为单一图标化标题栏命令写失败测试**

在 `test/unit/manifest.test.ts` 的现有测试末尾加入：

```ts
  expect(contributions.menus?.['editor/title']).toEqual([
    expect.objectContaining({ command: 'markdownReader.openSource', group: 'navigation@1' })
  ]);
  expect(contributions.commands).toEqual(expect.arrayContaining([
    expect.objectContaining({ command: 'markdownReader.openSource', icon: '$(edit)' })
  ]));
```

- [ ] **Step 2: 运行测试并确认它因目录标题栏命令与缺失图标而失败**

运行：`npx vitest run test/unit/manifest.test.ts`

预期：数组包含 `markdownReader.toggleToc` 且 `openSource` 没有 `icon`，因此断言失败。

- [ ] **Step 3: 最小化调整 `package.json`**

将 `contributes.commands` 中的源码命令改为：

```json
{ "command": "markdownReader.openSource", "title": "Open Source", "category": "Markdown Reader", "icon": "$(edit)" }
```

并将 `contributes.menus.editor/title` 改为只含：

```json
{ "command": "markdownReader.openSource", "when": "activeCustomEditorId == markdownReader.preview", "group": "navigation@1" }
```

保留 `markdownReader.toggleToc` 的命令声明和实现，供正文按钮向扩展请求切换；仅移除它在 `editor/title` 中的展示。

- [ ] **Step 4: 运行测试并确认通过**

运行：`npx vitest run test/unit/manifest.test.ts`

预期：测试通过。

### Task 3: 设计目录按钮、紧凑目录与浅色细滚动条

**Files:**
- Modify: `test/unit/ReaderStyles.test.ts`
- Modify: `media/reader.less`
- Modify: `media/high-contrast.less`

- [ ] **Step 1: 为编译后的样式写失败测试**

在 `test/unit/ReaderStyles.test.ts` 末尾新增：

```ts
it('uses compact TOC spacing, a floating TOC control, and thin light scrollbars', async () => {
  const source = await readFile('media/reader.less', 'utf8');
  const { css } = await less.render(source, { filename: 'media/reader.less' });

  expect(css).toMatch(/\.toc\s*\{[^}]*padding:\s*20px 8px 20px 8px/s);
  expect(css).toMatch(/\.toc-toggle\s*\{[^}]*position:\s*fixed/s);
  expect(css).toMatch(/scrollbar-width:\s*thin/);
  expect(css).toMatch(/::-webkit-scrollbar\s*\{[^}]*width:\s*8px/s);
  expect(css).toMatch(/::-webkit-scrollbar-track\s*\{[^}]*background:\s*#fff/s);
});
```

- [ ] **Step 2: 运行测试并确认它因缺失样式而失败**

运行：`npx vitest run test/unit/ReaderStyles.test.ts`

预期：新增测试找不到 `.toc-toggle`、`scrollbar-width: thin` 和 WebKit 滚动条规则。

- [ ] **Step 3: 在 `media/reader.less` 移除工具栏布局并加入新样式**

将 `.reader` 的 `grid-template-areas` 改为 `'toc document'`，删除 `.reader-toolbar` 和 `.reader-toolbar button` 规则；将 `.toc` 的高度改为 `100vh`、内边距改为 `20px 8px 20px 8px`。在 `body` 之后加入：

```less
*,
*::before,
*::after {
  scrollbar-width: thin;
  scrollbar-color: #b9c0c9 #fff;
}

::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

::-webkit-scrollbar-track { background: #fff; }
::-webkit-scrollbar-thumb {
  background: #b9c0c9;
  border: 2px solid #fff;
  border-radius: 999px;
}
::-webkit-scrollbar-thumb:hover { background: #959ea9; }
```

在 `.document-container` 规则后加入：

```less
.toc-toggle {
  position: fixed;
  z-index: 5;
  top: 12px;
  left: calc(var(--reader-toc-width) + 12px);
  width: 28px;
  height: 28px;
  padding: 0;
  color: #5f6670;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: #fff;
  cursor: pointer;
  line-height: 1;
}

body:has(.toc[hidden]) .toc-toggle { left: 12px; }
```

将窄屏 `.reader` 的 grid 区域改为只含 `'document'`，并在该媒体查询中加入 `.toc-toggle { left: 12px; }`。将 `media/high-contrast.less` 中 `.reader-toolbar` 从边框颜色选择器删除，并加入 `.toc-toggle` 以保持高对比边框可见。

- [ ] **Step 4: 运行样式测试并生成 CSS**

运行：`npx vitest run test/unit/ReaderStyles.test.ts && npm run build:css`

预期：样式测试通过，`media/reader.css` 和 `media/high-contrast.css` 更新。

### Task 4: 全量验证

**Files:**
- Modify: `media/reader.css`（由构建生成）
- Modify: `media/high-contrast.css`（由构建生成）
- Modify: `media/reader.js`（由构建生成）
- Modify: `media/reader.js.map`（由构建生成）
- Modify: `dist/**`（由构建生成）

- [ ] **Step 1: 执行静态检查、单元测试与生产构建**

运行：`npm run check`

预期：TypeScript 检查、全部 Vitest 单元测试与构建命令均以退出码 0 完成。

- [ ] **Step 2: 检查构建结果的关键选择器**

运行：`rg -n "reader-toolbar|toc-toggle|scrollbar-width|::-webkit-scrollbar" src media package.json`

预期：`src/webview/html.ts`、`media/reader.less` 和编译 CSS 中存在 `toc-toggle` 与滚动条规则；`reader-toolbar` 只可能出现在历史生成物之外，不应出现在源文件；`package.json` 的 `editor/title` 只有 `markdownReader.openSource`。

- [ ] **Step 3: 进行 VS Code 手动验收**

运行：`npm run build && code --extensionDevelopmentPath="$(pwd)"`

预期：以扩展开发主机打开 Markdown 后，顶部没有 Webview 工具栏；标题栏只有铅笔图标；正文左上角目录图标可切换宽屏目录与窄屏抽屉；目录文字贴近左侧；页面、目录和宽代码块均呈现白底细滚动条。

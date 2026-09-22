# 目录开关、可调宽度与代码对比度 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让目录开关避让滚动条，支持持久化拖拽调整目录宽度，并改善目录与代码区的视觉层级。

**Architecture:** HTML 提供目录/正文之间的语义化分隔条；`ReaderApp` 在宽屏处理指针拖拽并只在结束时向扩展提交宽度。消息解析层校验 180--480px 范围，`MarkdownEditorProvider` 将结果保存到现有 VS Code 配置并在 Webview 就绪时下发布局。LESS 使按钮相对正文定位并完成视觉调整。

**Tech Stack:** TypeScript、VS Code Extension API、LESS、Vitest、jsdom。

---

### Task 1: 定义安全的宽度提交消息

**Files:**
- Modify: `test/unit/messages.test.ts`
- Modify: `src/webview/messages.ts`
- Modify: `src/security/messages.ts`

- [ ] **Step 1: 添加宽度消息的失败断言**

```ts
expect(parseWebviewMessage({ type: 'setTocWidth', width: 300 })).toEqual({ type: 'setTocWidth', width: 300 });
expect(parseWebviewMessage({ type: 'setTocWidth', width: 179 })).toBeUndefined();
expect(parseWebviewMessage({ type: 'setTocWidth', width: 481 })).toBeUndefined();
```

- [ ] **Step 2: 运行消息测试并确认失败**

Run: `npx vitest run test/unit/messages.test.ts`

Expected: FAIL，因为解析器尚不识别 `setTocWidth`。

- [ ] **Step 3: 增加消息联合类型和解析分支**

```ts
| { type: 'setTocWidth'; width: number }
```

并仅接受 `Number.isSafeInteger(value.width)` 且 `180 <= value.width <= 480` 的精确消息形状。

- [ ] **Step 4: 重新运行消息测试并确认通过**

Run: `npx vitest run test/unit/messages.test.ts`

Expected: PASS。

### Task 2: 在 Webview 实现拖拽并写失败行为测试

**Files:**
- Modify: `test/unit/ReaderApp.test.ts`
- Modify: `src/webview/html.ts`
- Modify: `src/webview/ReaderApp.ts`

- [ ] **Step 1: 为拖拽后的样式更新和提交写失败测试**

```ts
const splitter = document.querySelector('#toc-resizer') as HTMLElement;
splitter.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 260, pointerId: 1 }));
window.dispatchEvent(new PointerEvent('pointermove', { clientX: 330, pointerId: 1 }));
window.dispatchEvent(new PointerEvent('pointerup', { clientX: 330, pointerId: 1 }));
expect(document.body.style.getPropertyValue('--reader-toc-width')).toBe('330px');
expect(postMessage).toHaveBeenCalledWith({ type: 'setTocWidth', width: 330 });
```

- [ ] **Step 2: 运行 ReaderApp 测试并确认失败**

Run: `npx vitest run test/unit/ReaderApp.test.ts`

Expected: FAIL，因为页面不存在 `#toc-resizer`。

- [ ] **Step 3: 增加分隔条与最小指针处理**

在目录和正文之间加入：

```html
<div id="toc-resizer" class="toc-resizer" role="separator" aria-label="Resize table of contents" aria-orientation="vertical"></div>
```

`ReaderApp` 对宽屏的 `pointerdown` 记录 pointer id，`pointermove` 将 `clientX` 夹在 180--480 后写入 CSS 变量，`pointerup` 清理监听器、释放指针捕获并仅提交一次 `setTocWidth` 消息。

- [ ] **Step 4: 重新运行 ReaderApp 测试并确认通过**

Run: `npx vitest run test/unit/ReaderApp.test.ts`

Expected: PASS。

### Task 3: 持久化并恢复目录宽度

**Files:**
- Modify: `test/unit/manifest.test.ts`
- Modify: `src/editor/MarkdownEditorProvider.ts`
- Modify: `package.json`

- [ ] **Step 1: 为扩大宽度配置范围写失败断言**

```ts
expect(contributions.configuration?.properties?.['markdownReader.toc.width']).toMatchObject({ minimum: 180, maximum: 480 });
```

- [ ] **Step 2: 运行清单测试并确认失败**

Run: `npx vitest run test/unit/manifest.test.ts`

Expected: FAIL，因为现有范围是 220--320。

- [ ] **Step 3: 读取、下发布局并持久化宽度**

将清单范围改为 180--480。`MarkdownEditorProvider` 在 `ready` 时读取 `markdownReader` 配置并发送 `setLayout`；收到 `setTocWidth` 后使用 `vscode.workspace.getConfiguration('markdownReader').update('toc.width', width, vscode.ConfigurationTarget.Workspace)` 保存，并回发已保存值。

- [ ] **Step 4: 重新运行清单和类型测试并确认通过**

Run: `npx vitest run test/unit/manifest.test.ts && npm run check:types`

Expected: PASS。

### Task 4: 调整按钮、目录与代码区视觉并写失败样式测试

**Files:**
- Modify: `test/unit/ReaderStyles.test.ts`
- Modify: `media/reader.less`

- [ ] **Step 1: 添加编译 CSS 的失败断言**

```ts
expect(css).toMatch(/\.document-container\s*\{[^}]*position:\s*relative/s);
expect(css).toMatch(/\.toc-toggle\s*\{[^}]*position:\s*absolute[^}]*left:\s*24px[^}]*border:\s*0[^}]*background:\s*transparent/s);
expect(css).toMatch(/\.toc\s*\{[^}]*padding:\s*20px 4px 20px 4px/s);
expect(css).toMatch(/\.markdown-body pre,[\s\S]*?background:\s*#e8eef8 !important;/s);
```

- [ ] **Step 2: 运行样式测试并确认失败**

Run: `npx vitest run test/unit/ReaderStyles.test.ts`

Expected: FAIL，因为按钮仍是 fixed 且带边框/白底，目录内边距为 8px。

- [ ] **Step 3: 实现正文内按钮、拖拽条和颜色规则**

将正文容器设为 `position: relative`；按钮改为 `position: absolute; top: 12px; left: 24px; border: 0; background: transparent`；删除收起状态的左侧覆写。设置目录内边距为 `20px 4px`，让 `.toc-resizer` 只在宽屏呈现 `col-resize` 光标与 8px 可拖拽热区。将预格式化代码背景设为 `#e8eef8`、行内代码背景设为 `#e6edf8`。

- [ ] **Step 4: 重新运行样式测试并构建 CSS**

Run: `npx vitest run test/unit/ReaderStyles.test.ts && npm run build:css`

Expected: PASS，生成的 CSS 包含新定位、分隔条和颜色规则。

### Task 5: 全量验证

**Files:**
- Modify: `media/reader.css`
- Modify: `media/high-contrast.css`
- Modify: `media/reader.js`
- Modify: `media/reader.js.map`
- Modify: `dist/**`

- [ ] **Step 1: 执行静态检查、单元测试和构建**

Run: `npm run check`

Expected: 全部命令以退出码 0 结束。

- [ ] **Step 2: 检查关键生成结果**

Run: `rg -n "toc-resizer|position: absolute|background: transparent|#e8eef8|setTocWidth" src media package.json`

Expected: 源文件和生成物均包含相应实现；不再存在 `.toc-toggle` 的 `position: fixed`。

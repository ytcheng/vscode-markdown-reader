# 目录开关固定顶部 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让目录开关在宽屏与窄屏的 Webview 顶部固定显示，并在宽屏目录展开时避让目录栏与拖拽条。

**Architecture:** 保持 `src/webview/html.ts` 的按钮结构与 `ReaderApp` 的事件处理不变，仅在 `media/reader.less` 调整按钮为固定定位。目录显示时使用现有的 `--reader-toc-width` 计算横向位置；目录隐藏与窄屏时覆写为固定左侧安全边距。`ReaderStyles.test.ts` 对 LESS 编译结果断言这些规则，随后由 CSS 构建将结果写入发布文件。

**Tech Stack:** LESS、Vitest、npm scripts。

---

### Task 1: 以编译样式测试锁定固定定位规则

**Files:**
- Modify: `test/unit/ReaderStyles.test.ts:58-77`
- Modify: `media/reader.less:151-165`

- [ ] **Step 1: 将现有按钮定位断言改为失败断言**

在 `uses a borderless TOC control inside the document, compact navigation, and clear code surfaces` 测试中，用以下断言替换现有的 `.document-container` 与 `.toc-toggle` 定位断言：

```ts
expect(css).toMatch(/\.toc-toggle\s*\{[^}]*position:\s*fixed[^}]*top:\s*12px[^}]*left:\s*calc\(var\(--reader-toc-width\) \+ 6px\)[^}]*border:\s*0[^}]*background:\s*transparent/s);
expect(css).toMatch(/body:has\(\.toc\[hidden\]\) \.toc-toggle\s*\{[^}]*left:\s*6px/s);
expect(css).toMatch(/@media \(max-width: 800px\)\s*\{[\s\S]*?\.toc-toggle\s*\{[^}]*left:\s*6px/s);
```

- [ ] **Step 2: 运行目标测试并确认其失败**

Run: `npx vitest run test/unit/ReaderStyles.test.ts`

Expected: FAIL，报告 `.toc-toggle` 仍使用 `position: absolute`，而且没有目录隐藏和窄屏时的固定左侧规则。

- [ ] **Step 3: 运行完整单元测试以记录基线**

Run: `npm run test:unit`

Expected: FAIL，失败仅来自 Task 1 新增的 `ReaderStyles` 断言。

### Task 2: 使用 CSS 将按钮固定于 Webview 顶部

**Files:**
- Modify: `media/reader.less:151-165`

- [ ] **Step 1: 将桌面端按钮改为固定定位**

用以下规则替换现有 `.toc-toggle` 块中的定位声明；保留其余尺寸、颜色、焦点和交互声明不变：

```less
.toc-toggle {
  position: fixed;
  z-index: 5;
  top: 12px;
  left: calc(var(--reader-toc-width) + 6px);
  width: 28px;
  height: 28px;
  padding: 0;
  color: #5f6670;
  border: 0;
  background: transparent;
  cursor: pointer;
  line-height: 1;
}

body:has(.toc[hidden]) .toc-toggle {
  left: 6px;
}
```

这里的 `calc` 将按钮保持在宽屏正文栏的左边缘之后 6px；当目录隐藏时，现有 grid 使正文回到左边，覆写规则同步使按钮回到 6px 安全边距。

- [ ] **Step 2: 为窄屏设置独立的左侧安全边距**

在 `@media (max-width: 800px)` 内、`.markdown-body` 规则之前添加：

```less
  .toc-toggle {
    left: 6px;
  }
```

该规则覆盖默认的目录宽度计算，因此抽屉打开或关闭时按钮均保持在窄屏视口左侧。

- [ ] **Step 3: 重新运行目标样式测试**

Run: `npx vitest run test/unit/ReaderStyles.test.ts`

Expected: PASS，编译 CSS 包含固定顶部、宽屏目录偏移、目录隐藏回退和窄屏回退规则。

- [ ] **Step 4: 编译发布样式**

Run: `npm run build:css`

Expected: PASS，更新 `media/reader.css` 与 `media/high-contrast.css`；前者包含上述编译后的固定定位规则。

### Task 3: 回归验证并隔离提交

**Files:**
- Modify: `media/reader.css`（由 `npm run build:css` 生成）
- Modify: `test/unit/ReaderStyles.test.ts`
- Modify: `media/reader.less`

- [ ] **Step 1: 执行类型检查、全部单元测试与完整构建**

Run: `npm run check`

Expected: PASS，依次完成 TypeScript 检查、全部 Vitest 单元测试和 CSS/扩展构建。

- [ ] **Step 2: 检查改动范围**

Run: `git diff -- media/reader.less media/reader.css test/unit/ReaderStyles.test.ts && git status --short`

Expected: 前一条命令只显示固定定位规则和对应断言的改动；后一条命令用于识别现有的非本任务改动。

- [ ] **Step 3: 在独立、干净的 Git 索引中提交任务文件**

Run: `git add media/reader.less media/reader.css test/unit/ReaderStyles.test.ts && git commit -m "fix: keep toc toggle fixed at top"`

Expected: 创建仅包含本任务三项文件的提交。若当前索引含有其他人预先暂存的文件，则不要执行此命令；先在隔离工作树或清理后的索引中完成提交，避免夹带无关改动。

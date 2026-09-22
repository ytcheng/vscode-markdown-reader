# VS Code Markdown Reader V0.1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建一个以 Custom Text Editor 方式默认打开 `.md`、高保真复用 Markdown Reader 主题、支持 TOC、自动刷新和 Preview/Source 切换的 VS Code 扩展 V0.1。

**Architecture:** Extension Host 使用 `CustomTextEditorProvider` 和每 URI 一个 `DocumentSession` 管理共享文档状态，再将带 revision 的渲染结果广播给一个或多个 Webview。Webview HTML 外壳只初始化一次，正文、TOC、滚动和折叠状态通过双向消息更新；渲染、安全校验、URI 解析和视图状态各自封装为可单测模块。

**Tech Stack:** TypeScript 7、VS Code Extension API 1.100、esbuild、markdown-it 15、markdown-it-task-lists、`@md-reader/theme` 2.0.5、Less、Vitest/jsdom、VS Code Extension Test、Playwright。

---

## 实施前约束

- 当前目录不是 Git 仓库。不得未经用户确认执行 `git init`。每个任务末尾仍给出建议 commit；若执行时仍无 Git 仓库，则记录检查点并跳过 commit。
- Node.js 最低版本为 `22.22.2`，以同时满足 Vitest 5 和 jsdom 30。
- `@md-reader/theme` 固定为 `2.0.5`，上游基线 commit 固定为 `b99c768a8806e49b11dbe131de26d467034dc0f9`。
- V0.1 只注册 `*.md`，不扩展到 MDX、Mermaid、KaTeX 或完整语法高亮。
- 所有功能按 TDD 顺序实现：先写失败测试，再写最小实现，再运行完整相关测试。

## 文件结构

```text
package.json                         扩展 manifest、命令、配置、构建与测试脚本
tsconfig.json                        Extension Host 与共享代码类型检查
esbuild.mjs                          打包 extension、webview 和测试入口
vitest.config.ts                     单元测试与 jsdom 项目配置
.vscodeignore                        VSIX 排除规则
THIRD_PARTY_NOTICES.md               上游主题来源、版本、commit 和修改说明
src/extension.ts                     activate/deactivate 和依赖装配
src/editor/MarkdownEditorProvider.ts CustomTextEditorProvider 生命周期
src/editor/DocumentSession.ts        每 URI debounce、revision、广播和资源释放
src/editor/PanelState.ts             每 Webview 独立 viewport/TOC 状态
src/editor/NavigationCoordinator.ts  跨 Markdown 文件的 fragment 定位与就绪队列
src/renderer/MarkdownRenderer.ts     markdown-it 初始化、HTML 和 headings 输出
src/renderer/SlugGenerator.ts        稳定且可去重的 heading slug
src/renderer/types.ts                RenderResult、HeadingItem
src/links/ResourceResolver.ts        相对资源、workspace root 和 fragment 解析
src/links/WebviewResourceRewriter.ts 将资源占位符转换为每 panel 的 Webview URI
src/security/messages.ts             Webview 消息运行时校验
src/security/links.ts                外链 scheme 白名单
src/webview/html.ts                  CSP、安全资源 URI 和静态 HTML 外壳
src/webview/messages.ts              双向消息与 ViewportState 类型
src/webview/index.ts                 ReaderApp 启动入口
src/webview/ReaderApp.ts             DOM patch、TOC、scroll spy、drawer 和状态恢复
src/types/markdown-it-task-lists.d.ts 缺失的第三方类型声明
media/reader.less                    上游主题 mixin、颜色 token 和布局适配
media/high-contrast.less             VS Code High Contrast 覆盖
media/reader.css                     构建产物
media/high-contrast.css              构建产物
media/reader.js                      Webview 构建产物
media/vendor/md-reader-theme/LICENSE 上游 MIT License
test/unit/**/*.test.ts               纯逻辑与 jsdom 测试
test/extension/runTest.ts            Extension Host 测试启动器
test/extension/tsconfig.json         Extension Host 测试 CommonJS 编译配置
test/extension/suite/index.ts        Extension Host 测试入口
test/extension/suite/*.test.ts       Custom Editor 集成测试
test/fixtures/kitchen-sink.md        Markdown/视觉固定样例
test/visual/reference.html           官方主题参考 DOM
test/visual/candidate.html           VS Code Webview 候选 DOM
test/visual/generate.ts              从固定 fixture 生成两套视觉页面
test/visual/visual.spec.ts            Playwright 截图回归
README.md                            安装、命令、设置和已知限制
```

### Task 1: 建立可构建、可测试的扩展骨架

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `esbuild.mjs`
- Create: `vitest.config.ts`
- Create: `.vscodeignore`
- Create: `src/extension.ts`
- Create: `src/webview/index.ts`
- Create: `test/unit/scaffold.test.ts`

- [ ] **Step 1: 写脚手架失败测试**

```ts
// test/unit/scaffold.test.ts
import { describe, expect, it } from 'vitest';
import manifest from '../../package.json';

describe('extension manifest', () => {
  it('uses the bundled extension entry and supported engine', () => {
    expect(manifest.main).toBe('./dist/extension.js');
    expect(manifest.engines.vscode).toBe('^1.100.0');
  });
});
```

- [ ] **Step 2: 创建固定版本的 `package.json`**

```json
{
  "name": "markdown-reader",
  "displayName": "Markdown Reader",
  "description": "Open Markdown as a polished reading view in the current VS Code tab.",
  "version": "0.1.0",
  "publisher": "local",
  "private": true,
  "license": "MIT",
  "engines": { "vscode": "^1.100.0", "node": ">=22.22.2" },
  "categories": ["Other"],
  "activationEvents": ["onCustomEditor:markdownReader.preview"],
  "main": "./dist/extension.js",
  "scripts": {
    "build:css": "lessc media/reader.less media/reader.css && lessc media/high-contrast.less media/high-contrast.css",
    "build": "npm run build:css && node esbuild.mjs",
    "check:types": "tsc -p tsconfig.json --noEmit",
    "test:unit": "vitest run",
    "prepare:visual": "node dist/test/visual/generate.js",
    "test:visual": "npm run build && npm run prepare:visual && playwright test test/visual/visual.spec.ts",
    "build:test-extension": "tsc -p test/extension/tsconfig.json",
    "test:extension": "npm run build && npm run build:test-extension && node dist/test/runTest.js",
    "check": "npm run check:types && npm run test:unit && npm run build"
  },
  "dependencies": {
    "@md-reader/theme": "2.0.5",
    "markdown-it": "15.0.2",
    "markdown-it-task-lists": "2.1.1"
  },
  "devDependencies": {
    "@playwright/test": "1.63.0",
    "@types/markdown-it": "14.2.0",
    "@types/node": "26.6.2",
    "@types/vscode": "1.100.0",
    "@vscode/test-electron": "3.1.0",
    "esbuild": "0.28.2",
    "jsdom": "30.1.0",
    "less": "4.9.1",
    "mocha": "12.0.2",
    "@types/mocha": "10.0.10",
    "pixelmatch": "7.2.0",
    "@types/pixelmatch": "7.1.0",
    "pngjs": "7.0.0",
    "@types/pngjs": "6.0.5",
    "typescript": "7.0.2",
    "vitest": "5.0.1"
  }
}
```

- [ ] **Step 3: 创建 TypeScript、Vitest 和 esbuild 配置**

```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "types": ["node", "vscode", "vitest/globals"]
  },
  "include": ["src/**/*.ts", "test/**/*.ts", "vitest.config.ts"]
}
```

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['test/unit/**/*.test.ts'], environment: 'node' }
});
```

```js
// esbuild.mjs
import { build } from 'esbuild';

await Promise.all([
  build({ entryPoints: ['src/extension.ts'], outfile: 'dist/extension.js', bundle: true, platform: 'node', format: 'cjs', external: ['vscode'], sourcemap: true }),
  build({ entryPoints: ['src/webview/index.ts'], outfile: 'media/reader.js', bundle: true, platform: 'browser', format: 'iife', sourcemap: true })
]);
```

- [ ] **Step 4: 创建最小入口和临时样式入口**

```ts
// src/extension.ts
import type * as vscode from 'vscode';

export function activate(_context: vscode.ExtensionContext): void {}
export function deactivate(): void {}
```

```ts
// src/webview/index.ts
export {};
```

```less
// media/reader.less
@import (reference) "../node_modules/@md-reader/theme/src/index.less";
.markdown-body { .theme(); }
```

```less
// media/high-contrast.less
body.vscode-high-contrast,
body.vscode-high-contrast-light { forced-color-adjust: auto; }
```

```text
# .vscodeignore
.vscode/**
src/**
test/**
docs/**
media/**/*.less
**/*.map
tsconfig.json
vitest.config.ts
esbuild.mjs
```

- [ ] **Step 5: 安装依赖并验证测试先红后绿**

Run: `npm install && npm run test:unit && npm run check`

Expected: `1 passed`，类型检查和两个 bundle 构建均退出 0，生成 `dist/extension.js`、`media/reader.js` 和两个 CSS 文件。

- [ ] **Step 6: 建立提交检查点**

```bash
git add package.json package-lock.json tsconfig.json esbuild.mjs vitest.config.ts .vscodeignore src media test
git commit -m "chore: scaffold markdown reader extension"
```

若 `git rev-parse --is-inside-work-tree` 失败，则不初始化仓库，只记录“Task 1 verified”。

### Task 2: 实现 Markdown 渲染、Heading 提取和稳定 Slug

**Files:**
- Create: `src/renderer/types.ts`
- Create: `src/renderer/SlugGenerator.ts`
- Create: `src/renderer/MarkdownRenderer.ts`
- Create: `src/types/markdown-it-task-lists.d.ts`
- Create: `test/unit/SlugGenerator.test.ts`
- Create: `test/unit/MarkdownRenderer.test.ts`

- [ ] **Step 1: 写 Slug 和渲染失败测试**

```ts
// test/unit/MarkdownRenderer.test.ts
import { describe, expect, it } from 'vitest';
import { MarkdownRenderer } from '../../src/renderer/MarkdownRenderer.js';

describe('MarkdownRenderer', () => {
  it('extracts headings, deduplicates slugs, and emits zero-based source lines', () => {
    const result = new MarkdownRenderer().render('# 架构 `API`\n\n## 重复\n\n## 重复', 7);
    expect(result.revision).toBe(7);
    expect(result.headings).toEqual([
      { level: 1, text: '架构 API', slug: '架构-api', line: 0 },
      { level: 2, text: '重复', slug: '重复', line: 2 },
      { level: 2, text: '重复', slug: '重复-1', line: 4 }
    ]);
    expect(result.html).toContain('id="架构-api"');
    expect(result.html).toContain('data-source-line="0"');
  });

  it('supports tables and disabled task-list controls without source HTML', () => {
    const result = new MarkdownRenderer().render('| A | B |\n|---|---:|\n| x | y |\n\n- [x] done\n\n<script>alert(1)</script>', 1);
    expect(result.html).toContain('<table>');
    expect(result.html).toContain('class="task-list-item-checkbox"');
    expect(result.html).toContain('disabled');
    expect(result.html).not.toContain('<script>');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm run test:unit -- test/unit/MarkdownRenderer.test.ts`

Expected: FAIL，提示 `MarkdownRenderer` 模块不存在。

- [ ] **Step 3: 实现类型和去重 Slug**

```ts
// src/renderer/types.ts
export interface HeadingItem { level: number; text: string; slug: string; line: number; }
export interface RenderResource { placeholder: string; kind: 'image'; href: string; }
export interface RenderResult { revision: number; html: string; headings: HeadingItem[]; resources: RenderResource[]; }
```

```ts
// src/renderer/SlugGenerator.ts
export class SlugGenerator {
  readonly #counts = new Map<string, number>();

  slug(text: string): string {
    const base = text.trim().toLocaleLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, '').replace(/[\s-]+/g, '-').replace(/^-|-$/g, '') || 'section';
    const count = this.#counts.get(base) ?? 0;
    this.#counts.set(base, count + 1);
    return count === 0 ? base : `${base}-${count}`;
  }
}
```

- [ ] **Step 4: 实现单次 token 解析和 Heading renderer rule**

`MarkdownRenderer.render()` 必须调用一次 `md.parse()`，从 `heading_open` 后的 inline token 提取纯文本，写入 token attrs，再调用 `md.renderer.render(tokens, options, env)`。覆盖 table 对齐 renderer，将 inline `style` 改成 `class="align-right|align-center|align-left"`。

```ts
import MarkdownIt from 'markdown-it';
import taskLists from 'markdown-it-task-lists';
import { SlugGenerator } from './SlugGenerator.js';
import type { HeadingItem, RenderResource, RenderResult } from './types.js';

export class MarkdownRenderer {
  readonly #md = new MarkdownIt({ html: false, linkify: true, typographer: false }).use(taskLists, { enabled: false, label: true });

  render(source: string, revision: number): RenderResult {
    const resources: RenderResource[] = [];
    const env: Record<string, unknown> = { resources };
    const tokens = this.#md.parse(source, env);
    const slugs = new SlugGenerator();
    const headings: HeadingItem[] = [];
    for (let i = 0; i < tokens.length; i += 1) {
      const open = tokens[i];
      const inline = tokens[i + 1];
      if (open.type !== 'heading_open' || inline?.type !== 'inline') continue;
      const text = (inline.children ?? []).filter(t => !['html_inline'].includes(t.type)).map(t => t.content).join('').trim();
      const slug = slugs.slug(text);
      const line = open.map?.[0] ?? 0;
      open.attrSet('id', slug);
      open.attrSet('data-source-line', String(line));
      headings.push({ level: Number(open.tag.slice(1)), text, slug, line });
    }
    return { revision, html: this.#md.renderer.render(tokens, this.#md.options, env), headings, resources };
  }
}
```

```ts
// src/types/markdown-it-task-lists.d.ts
declare module 'markdown-it-task-lists' {
  import type MarkdownIt from 'markdown-it';
  interface TaskListOptions { enabled?: boolean; label?: boolean; labelAfter?: boolean; }
  const taskLists: (md: MarkdownIt, options?: TaskListOptions) => void;
  export default taskLists;
}
```

自定义 image renderer 从 `env.resources` 取得当前数组，为每个图片写入 `__MD_READER_RESOURCE_<index>__` placeholder；源 Markdown 无法直接控制 placeholder 属性。

- [ ] **Step 5: 补齐边界用例并运行测试**

为 `空标题`、`中英文混合`、`emoji`、`H1→H3`、`重复标题`、`inline emphasis/code`、恶意 HTML 和 table alignment class 各增加一个断言。

Run: `npm run test:unit -- test/unit/SlugGenerator.test.ts test/unit/MarkdownRenderer.test.ts`

Expected: PASS，且 HTML 中不存在 `style=`、`<script>` 或可执行事件属性。

- [ ] **Step 6: 提交**

```bash
git add src/renderer src/types test/unit
git commit -m "feat: render markdown with stable heading anchors"
```

### Task 3: 集成 Markdown Reader 主题和安全 Webview 外壳

**Files:**
- Modify: `media/reader.less`
- Modify: `media/high-contrast.less`
- Create: `src/webview/html.ts`
- Create: `test/unit/WebviewHtml.test.ts`
- Create: `media/vendor/md-reader-theme/LICENSE`
- Create: `THIRD_PARTY_NOTICES.md`

- [ ] **Step 1: 写 CSP 和主题资源失败测试**

```ts
import { expect, it } from 'vitest';
import { getWebviewHtml } from '../../src/webview/html.js';

it('emits a strict CSP and only local scripts/styles', () => {
  const html = getWebviewHtml({ cspSource: 'vscode-webview:', scriptUri: 'webview://reader.js', styleUri: 'webview://reader.css', highContrastStyleUri: 'webview://hc.css' });
  expect(html).toContain("default-src 'none'");
  expect(html).toContain("script-src vscode-webview:");
  expect(html).not.toContain("'unsafe-inline'");
  expect(html).toContain('aria-label="Table of contents"');
});
```

- [ ] **Step 2: 实现完整 HTML 外壳**

`getWebviewHtml()` 返回固定 shell：toolbar、TOC nav、drawer backdrop、main/article 和三个本地资源链接。脚本使用 `defer`，所有按钮包含 `type="button"`、`aria-label` 和初始 `aria-expanded`；HTML 中不注入 Markdown 内容。

- [ ] **Step 3: 将官方主题 mixin 限定到 `.markdown-body`**

`media/reader.less` 必须包含官方 light/dark token、`.theme()`、900px 内容宽度、260px TOC、800px drawer breakpoint、table alignment class 和 `prefers-reduced-motion`。颜色 token 使用上游 2.x MIT 源码的已公开值并转换为 2.0.5 新变量名，例如：

```less
.reader-light() {
  --primary-color: #607cd2;
  --primary-color-hover: #4c68bb;
  --primary-color-alpha-10: rgba(96, 124, 210, 0.1);
  --text-muted: #909090;
  --border-color: #d0d7de;
  --bg-image: #f8f9fa;
  --bg-code: #f3f6ff;
  --bg-stripe: #f6f8fa;
  --highlight-color: #fff07e;
  --opacity-image: 1;
}

.markdown-body { .theme(); max-width: 900px; margin: 0 auto; padding: 30px 70px 40px; }
.align-left { text-align: left; }
.align-center { text-align: center; }
.align-right { text-align: right; }
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { scroll-behavior: auto !important; transition-duration: 0.01ms !important; } }
```

同时定义主题使用到的全部 `var(--...)`；增加一个测试读取编译后的 CSS，断言每个被引用变量都有 light/dark 定义。

- [ ] **Step 4: 添加 High Contrast 覆盖**

使用 `--vscode-contrastBorder`、`--vscode-focusBorder`、`--vscode-editor-foreground` 和 `--vscode-editor-background` 覆盖链接、按钮、active TOC、表格与代码块；不得仅靠颜色区分 active/focus。

- [ ] **Step 5: 添加许可证文件与声明**

`THIRD_PARTY_NOTICES.md` 写明 `@md-reader/theme 2.0.5`、仓库 URL、commit、MIT、复制并适配 Less mixin/token；`media/vendor/md-reader-theme/LICENSE` 保存上游完整 MIT 文本。

- [ ] **Step 6: 构建并验证**

Run: `npm run build:css && npm run test:unit -- test/unit/WebviewHtml.test.ts`

Expected: PASS；CSS 构建退出 0；`rg "unsafe-inline|style=" src/webview media/reader.css` 无输出。

- [ ] **Step 7: 提交**

```bash
git add media src/webview/html.ts test/unit/WebviewHtml.test.ts THIRD_PARTY_NOTICES.md
git commit -m "feat: integrate markdown reader theme and secure shell"
```

### Task 4: 实现 Webview ReaderApp、TOC 和阅读位置恢复

**Files:**
- Create: `src/webview/messages.ts`
- Create: `src/webview/ReaderApp.ts`
- Modify: `src/webview/index.ts`
- Create: `test/unit/ReaderApp.test.ts`
- Modify: `vitest.config.ts`

- [ ] **Step 1: 定义与设计文档一致的消息类型**

```ts
export interface ViewportState {
  activeSlug?: string;
  activeHeadingOffset?: number;
  scrollTop: number;
  tocVisible: boolean;
  collapsedSlugs: string[];
}
export type ExtensionToWebviewMessage =
  | { type: 'render'; result: RenderResult; restore?: ViewportState }
  | { type: 'setTocVisible'; visible: boolean }
  | { type: 'setLayout'; tocMaxDepth: number; tocWidth: number; contentMaxWidth: number }
  | { type: 'navigateToAnchor'; slug: string }
  | { type: 'setColorMode'; mode: 'light' | 'dark' | 'high-contrast' };
export type WebviewToExtensionMessage =
  | { type: 'ready' }
  | { type: 'openSource'; line?: number }
  | { type: 'openLink'; href: string }
  | { type: 'toggleToc' }
  | { type: 'viewportChanged'; state: ViewportState };
```

- [ ] **Step 2: 写 jsdom 失败测试**

测试至少覆盖：旧 revision 被忽略；新 render 更新 article/TOC；重复/跳级标题形成稳定树；点击目录滚动；折叠同步 `aria-expanded`；恢复 slug+offset，slug 缺失时恢复并 clamp `scrollTop`；`Escape` 关闭 drawer并还焦点。另测 `setLayout` 过滤超过 maxDepth 的 TOC 项，并通过 CSS custom properties 应用 toc/content 宽度；`navigateToAnchor` 解码后定位；article 内点击 `#anchor` 只在本页滚动，其他链接发送 `openLink`。

Run: `npm run test:unit -- test/unit/ReaderApp.test.ts`

Expected: FAIL，提示 `ReaderApp` 不存在。

- [ ] **Step 3: 实现 ReaderApp 的最小公共接口**

```ts
export interface VsCodeApi {
  postMessage(message: WebviewToExtensionMessage): void;
  getState(): ViewportState | undefined;
  setState(state: ViewportState): void;
}

export class ReaderApp {
  #revision = -1;
  constructor(private readonly document: Document, private readonly api: VsCodeApi) {}
  start(): void;
  handleMessage(message: ExtensionToWebviewMessage): void;
  applyRender(result: RenderResult, restore?: ViewportState): void;
  captureViewport(): ViewportState;
  dispose(): void;
}
```

`start()` 只注册一次 message/click/scroll/keydown/resize 监听并发送 `ready`；`dispose()` 对称移除所有监听和 observer。

- [ ] **Step 4: 实现 TOC tree、Scroll Spy 和 Drawer**

使用 stack 将 heading 转为嵌套 `<ol>`；每项使用 `<a href="#slug">`，有子节点时增加原生 button。`IntersectionObserver` 不直接选择“最后回调项”，而是维护所有可见 heading，再选择 viewport 顶部以下最近项或顶部以上最后一项。

- [ ] **Step 5: 实现状态保存和恢复**

scroll handler 使用 `requestAnimationFrame` 合并更新；保存 active slug、相对 offset、scrollTop、tocVisible、collapsedSlugs。render 后先定位 slug 并恢复 offset，失败再使用 clamp 后的 scrollTop。

- [ ] **Step 6: 启动 ReaderApp 并运行测试**

```ts
// src/webview/index.ts
import { ReaderApp } from './ReaderApp.js';
declare function acquireVsCodeApi(): import('./ReaderApp.js').VsCodeApi;
new ReaderApp(document, acquireVsCodeApi()).start();
```

Run: `npm run test:unit -- test/unit/ReaderApp.test.ts`

Expected: 所有 ReaderApp 用例 PASS，测试结束后 observer/listener 数量归零。

- [ ] **Step 7: 提交**

```bash
git add src/webview test/unit/ReaderApp.test.ts vitest.config.ts
git commit -m "feat: add toc navigation and resilient viewport state"
```

### Task 5: 实现链接安全、消息校验和资源根限制

**Files:**
- Create: `src/security/messages.ts`
- Create: `src/security/links.ts`
- Create: `src/links/ResourceResolver.ts`
- Create: `src/links/WebviewResourceRewriter.ts`
- Create: `test/unit/messages.test.ts`
- Create: `test/unit/links.test.ts`
- Create: `test/unit/WebviewResourceRewriter.test.ts`
- Create: `test/extension/suite/ResourceResolver.test.ts`

- [ ] **Step 1: 写运行时消息校验失败测试**

测试拒绝 unknown type、非有限 line、负数 line、超长 href、未知 state 字段类型和超过合理数量的 collapsedSlugs；接受设计文档定义的五种消息。

- [ ] **Step 2: 实现窄化函数而不是类型断言**

```ts
export function parseWebviewMessage(value: unknown): WebviewToExtensionMessage | undefined {
  if (!value || typeof value !== 'object' || !('type' in value)) return undefined;
  const message = value as Record<string, unknown>;
  if (message.type === 'ready' || message.type === 'toggleToc') return { type: message.type };
  if (message.type === 'openLink' && typeof message.href === 'string' && message.href.length <= 8192) return { type: 'openLink', href: message.href };
  if (message.type === 'openSource' && (message.line === undefined || Number.isSafeInteger(message.line) && Number(message.line) >= 0)) return { type: 'openSource', line: message.line as number | undefined };
  return parseViewportMessage(message);
}
```

- [ ] **Step 3: 实现外链 scheme 白名单**

`classifyLink(href)` 只返回 `anchor`、`markdown`、`local`、`external` 或 `blocked`；external 只接受 `https:`、`http:`、`mailto:`，拒绝 `javascript:`、`data:`、`file:`、`command:` 和未知 scheme。

- [ ] **Step 4: 实现 ResourceResolver**

使用 `vscode.Uri.joinPath(documentUri, '..', decodedPath)`，通过规范化 URI path 判断结果是否仍位于 allowed root：文档在 workspace 内时只允许 containing Workspace Folder；工作区外时只允许父目录。保留 fragment 供 Markdown 首次定位；多根工作区不授予其他 root。

- [ ] **Step 5: 实现每 Webview 的图片 URI 适配**

Markdown image renderer 对每个图片 URL 生成不可由源文本控制的唯一 placeholder，并写入 `RenderResult.resources`。`WebviewResourceRewriter` 逐项调用 ResourceResolver；允许的本地资源经当前 panel 的 `webview.asWebviewUri()` 替换，HTTPS 图片保留，blocked 图片替换为空 `src` 并增加 `data-reader-image-error="blocked"`。测试两个 fake webview 对同一 RenderResult 产生不同 Webview URI，但 renderer 只调用一次。

- [ ] **Step 6: 运行单元与 Extension Host URI 测试**

Run: `npm run test:unit -- test/unit/messages.test.ts test/unit/links.test.ts test/unit/WebviewResourceRewriter.test.ts`

Expected: PASS。

Extension Host 测试在 Task 8 接线后运行，覆盖空格、百分号、`../` 逃逸、remote scheme、多根 workspace 和工作区外文件。

- [ ] **Step 7: 提交**

```bash
git add src/security src/links test/unit test/extension/suite/ResourceResolver.test.ts
git commit -m "feat: validate webview messages and resource links"
```

### Task 6: 实现 DocumentSession 和 CustomTextEditorProvider

**Files:**
- Create: `src/editor/PanelState.ts`
- Create: `src/editor/NavigationCoordinator.ts`
- Create: `src/editor/DocumentSession.ts`
- Create: `src/editor/MarkdownEditorProvider.ts`
- Modify: `src/extension.ts`
- Create: `test/unit/DocumentSession.test.ts`
- Create: `test/unit/NavigationCoordinator.test.ts`

- [ ] **Step 1: 写 DocumentSession 失败测试**

使用 fake renderer、fake scheduler 和两个 fake panel，验证 200ms 内连续变更只 render 一次；revision 单调递增；旧 Promise 后完成时不广播；两个 panel 收到同一 RenderResult；后 attach 的 panel 直接收到缓存结果而不重新解析；dispose 清除 timer 和 panel。

- [ ] **Step 2: 实现 PanelState 和 DocumentSession**

```ts
export interface RenderSink { postRender(result: RenderResult, restore?: ViewportState): PromiseLike<boolean>; }
export interface Renderer { render(source: string, revision: number): RenderResult | Promise<RenderResult>; }

export class DocumentSession {
  #revision = 0;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #disposed = false;
  #lastResult: RenderResult | undefined;
  readonly #panels = new Set<RenderSink>();

  constructor(private readonly getText: () => string, private readonly renderer: Renderer, private readonly debounceMs = 200) {}
  attach(panel: RenderSink): void { this.#panels.add(panel); if (this.#lastResult) void panel.postRender(this.#lastResult); }
  detach(panel: RenderSink): void { this.#panels.delete(panel); }
  schedule(): void { clearTimeout(this.#timer); this.#timer = setTimeout(() => void this.renderNow(), this.debounceMs); }
  async renderNow(): Promise<void> {
    const revision = ++this.#revision;
    const result = await Promise.resolve(this.renderer.render(this.getText(), revision));
    if (this.#disposed || revision !== this.#revision) return;
    this.#lastResult = result;
    await Promise.all([...this.#panels].map(panel => panel.postRender(result)));
  }
  dispose(): void { this.#disposed = true; clearTimeout(this.#timer); this.#panels.clear(); }
}
```

- [ ] **Step 3: 实现 Provider 生命周期**

Provider 使用 `Map<document.uri.toString(), DocumentSession>`；`resolveCustomTextEditor` 设置最小 webview options、设置 HTML shell、attach panel、注册 panel message/dispose，并触发首次 render。全局只注册一个 `workspace.onDidChangeTextDocument`，按 URI 找 session 调度，不为每个 panel 重复注册 workspace listener。`postRender` 在发送前通过 `WebviewResourceRewriter` 为当前 panel 生成 HTML 副本。消息路由必须经 `parseWebviewMessage`：external 调 `env.openExternal`，其他本地文件调 `vscode.open`，Markdown 调自定义 viewType，Source 调 `vscode.openWith(..., 'default')`。

`NavigationCoordinator` 记录每 URI 最近活动 panel；`.md#fragment` 已打开时向活动 panel 发送 `navigateToAnchor`，尚未 resolve 时把 slug 排队并在 `ready` 后消费。测试已打开和首次打开两条路径，队列消费后必须删除。

- [ ] **Step 4: 接入颜色主题和配置变化**

监听 `window.onDidChangeActiveColorTheme` 广播 `setColorMode`；监听 `workspace.onDidChangeConfiguration`，只在 `markdownReader` 配置受影响时发送 `setLayout` 和 `setTocVisible`，不重新解析 Markdown。High Contrast 与 High Contrast Light 都映射到 `high-contrast`。

- [ ] **Step 5: 注册 Provider**

```ts
context.subscriptions.push(vscode.window.registerCustomEditorProvider(
  'markdownReader.preview',
  new MarkdownEditorProvider(context),
  { supportsMultipleEditorsPerDocument: true, webviewOptions: { retainContextWhenHidden: false } }
));
```

- [ ] **Step 6: 验证**

Run: `npm run test:unit -- test/unit/DocumentSession.test.ts test/unit/NavigationCoordinator.test.ts && npm run check`

Expected: PASS；连续变更测试的 renderer call count 为 1；build 无 VS Code bundle 错误。

- [ ] **Step 7: 提交**

```bash
git add src/editor src/extension.ts test/unit/DocumentSession.test.ts test/unit/NavigationCoordinator.test.ts
git commit -m "feat: manage custom editor document sessions"
```

### Task 7: 完成命令、快捷键、菜单和配置 Manifest

**Files:**
- Modify: `package.json`
- Create: `src/editor/commands.ts`
- Modify: `src/editor/MarkdownEditorProvider.ts`
- Create: `test/unit/manifest.test.ts`

- [ ] **Step 1: 写 manifest 失败测试**

断言 custom editor selector 仅为 `*.md`、priority 为 `default`；四个 command 全部声明；快捷键包含精确 when；配置 maxDepth 为 1--6、toc.width 为 220--320；不存在 `markdownReader.defaultMode`。

- [ ] **Step 2: 增加贡献点**

在 `package.json` 添加：

```json
"contributes": {
  "customEditors": [{ "viewType": "markdownReader.preview", "displayName": "Markdown Reader", "selector": [{ "filenamePattern": "*.md" }], "priority": "default" }],
  "commands": [
    { "command": "markdownReader.openPreview", "title": "Open Preview", "category": "Markdown Reader" },
    { "command": "markdownReader.openSource", "title": "Open Source", "category": "Markdown Reader" },
    { "command": "markdownReader.togglePreview", "title": "Toggle Preview", "category": "Markdown Reader" },
    { "command": "markdownReader.toggleToc", "title": "Toggle Table of Contents", "category": "Markdown Reader" }
  ],
  "keybindings": [
    { "command": "markdownReader.openPreview", "key": "ctrl+shift+v", "mac": "cmd+shift+v", "when": "editorTextFocus && resourceExtname == .md" },
    { "command": "markdownReader.openSource", "key": "ctrl+shift+v", "mac": "cmd+shift+v", "when": "activeCustomEditorId == markdownReader.preview" }
  ],
  "menus": {
    "editor/title": [
      { "command": "markdownReader.openSource", "when": "activeCustomEditorId == markdownReader.preview", "group": "navigation@1" },
      { "command": "markdownReader.toggleToc", "when": "activeCustomEditorId == markdownReader.preview", "group": "navigation@2" }
    ]
  },
  "configuration": {
    "title": "Markdown Reader",
    "properties": {
      "markdownReader.toc.enabled": { "type": "boolean", "default": true },
      "markdownReader.toc.maxDepth": { "type": "integer", "default": 3, "minimum": 1, "maximum": 6 },
      "markdownReader.toc.width": { "type": "integer", "default": 260, "minimum": 220, "maximum": 320 },
      "markdownReader.content.maxWidth": { "type": "integer", "default": 900, "minimum": 560, "maximum": 1600 }
    }
  }
}
```

- [ ] **Step 3: 实现 Source/Preview 切换**

`openPreview` 调用 `vscode.commands.executeCommand('vscode.openWith', uri, 'markdownReader.preview', { viewColumn, preview: false })`；`openSource` 调用 `vscode.commands.executeCommand('vscode.openWith', uri, 'default', sameOptions)`。Toggle 根据 provider 当前活动 panel 判断方向；使用 `setContext('markdownReader.previewActive', boolean)` 为命令逻辑提供稳定状态。

- [ ] **Step 4: 实现 TOC toggle**

命令只向当前 Markdown Reader panel 发送 `setTocVisible`，并同步 panel state；没有活动 Reader 时 command 立即返回，不修改其他文档。

- [ ] **Step 5: 运行 manifest 和命令测试**

Run: `npm run test:unit -- test/unit/manifest.test.ts && npm run check`

Expected: PASS；package JSON schema 可解析；四个 command 与注册实现一一对应。

- [ ] **Step 6: 提交**

```bash
git add package.json src/editor test/unit/manifest.test.ts
git commit -m "feat: add preview source commands and settings"
```

### Task 8: 添加 Extension Host 集成测试

**Files:**
- Create: `test/extension/runTest.ts`
- Create: `test/extension/tsconfig.json`
- Create: `test/extension/suite/index.ts`
- Create: `test/extension/suite/customEditor.test.ts`
- Create: `test/fixtures/simple.md`

- [ ] **Step 1: 创建固定 VS Code 1.100 测试启动器**

```ts
// test/extension/runTest.ts
import path from 'node:path';
import { runTests } from '@vscode/test-electron';

await runTests({
  version: '1.100.0',
  extensionDevelopmentPath: path.resolve(__dirname, '../../'),
  extensionTestsPath: path.resolve(__dirname, 'suite/index.js'),
  launchArgs: [path.resolve(__dirname, '../../test/fixtures'), '--disable-extensions']
});
```

- [ ] **Step 2: 配置测试编译与 Mocha 入口**

`test/extension/tsconfig.json` 继承根配置，设置 `module: "CommonJS"`、`moduleResolution: "Node"`、`outDir: "../../dist/test"`、`rootDir: "."` 和 `types: ["node", "vscode", "mocha"]`。`suite/index.ts` 导出 `run(): Promise<void>`，创建 Mocha、显式 `addFile()` 两个编译后的 test 文件，并在 failures 大于 0 时 reject。

- [ ] **Step 3: 编写集成用例**

测试扩展激活、四个命令存在、`vscode.openWith(simple.md, 'markdownReader.preview')` 成功、`openSource` 后出现对应 TextDocument、再次 openPreview 返回 custom editor。另测同 URI 连续 openWith 到两个 ViewColumn 不抛错，以覆盖 `supportsMultipleEditorsPerDocument`。

- [ ] **Step 4: 增加 URI 真实 API 用例**

把 Task 5 的 `ResourceResolver.test.ts` 接入 suite，使用临时 workspace fixture 验证父级逃逸被拒绝、同 workspace 图片允许、其他 workspace root 被拒绝、fragment 保留。

- [ ] **Step 5: 运行 Extension Host 测试**

Run: `npm run test:extension`

Expected: 下载/复用 VS Code 1.100 后所有 suite PASS，进程退出 0，无未处理 promise rejection。

- [ ] **Step 6: 提交**

```bash
git add test/extension test/fixtures
git commit -m "test: cover custom editor in extension host"
```

### Task 9: 完成可访问性、响应式和视觉回归

**Files:**
- Modify: `esbuild.mjs`
- Modify: `src/webview/ReaderApp.ts`
- Modify: `media/reader.less`
- Modify: `media/high-contrast.less`
- Modify: `test/unit/ReaderApp.test.ts`
- Create: `test/fixtures/kitchen-sink.md`
- Create: `test/visual/reference.html`
- Create: `test/visual/candidate.html`
- Create: `test/visual/generate.ts`
- Create: `test/visual/visual.spec.ts`
- Create: `playwright.config.ts`

- [ ] **Step 1: 添加 a11y 行为测试**

断言 TOC 折叠按钮可聚焦并同步 `aria-expanded`；Drawer 打开时焦点进入第一个链接；Tab/Shift+Tab 不越出 Drawer；Escape 关闭并还焦点；reduced motion 下不请求 smooth scroll；active 项同时有 `aria-current="location"`。

- [ ] **Step 2: 实现窄窗口和焦点约束**

800px 以下隐藏固定 TOC、显示 toolbar TOC button；使用 inert/aria-hidden 管理背景；只在 Drawer 打开期间注册焦点约束监听，关闭立即移除。

- [ ] **Step 3: 创建 kitchen-sink fixture**

Fixture 必须实际包含 H1--H6、重复/跳级/中文标题、段落、强调、链接、任务列表、嵌套列表、引用、表格、inline code、fenced code、相对图片、横线和长内容；不得只写说明文字代替语法样例。

- [ ] **Step 4: 创建双页面视觉基线**

`generate.ts` 直接导入生产 `MarkdownRenderer`，并在本任务把它加入 `esbuild.mjs`，输出到 `dist/test/visual/generate.js`；它读取同一 `kitchen-sink.md` 生成正文。`reference.html` 使用固定 `@md-reader/theme` DOM/class，`candidate.html` 使用 Reader Webview DOM。两者固定字体、内容和 viewport，禁止网络资源。Playwright 分别在 1440×1000 Light、Dark 和 760×1000 Drawer 场景截图，用 `pngjs` 解码并通过 `pixelmatch` 计算 reference/candidate 的差异比例。

```ts
import { expect, test } from '@playwright/test';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

for (const mode of ['light', 'dark'] as const) {
  test(`${mode} reader theme`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`file://${process.cwd()}/test/visual/reference.html?mode=${mode}`);
    const reference = PNG.sync.read(await page.screenshot({ fullPage: true }));
    await page.goto(`file://${process.cwd()}/test/visual/candidate.html?mode=${mode}`);
    const candidate = PNG.sync.read(await page.screenshot({ fullPage: true }));
    expect(reference.width).toBe(candidate.width);
    expect(reference.height).toBe(candidate.height);
    const changed = pixelmatch(reference.data, candidate.data, undefined, reference.width, reference.height, { threshold: 0.1 });
    expect(changed / (reference.width * reference.height)).toBeLessThanOrEqual(0.01);
  });
}
```

- [ ] **Step 5: 安装浏览器并建立首份人工审核基线**

Run: `npm run build && npx playwright install chromium && npm run test:visual`

人工并排检查 reference/candidate：正文、标题、列表、表格、引用、代码容器、图片和 TOC。V0.1 不比较代码 token 颜色，生成器应在两页代码内容中移除 token span 后再比较。Expected: 自动 pixel diff 不超过 1%。

- [ ] **Step 6: 运行可访问性与视觉测试**

Run: `npm run test:unit -- test/unit/ReaderApp.test.ts && npm run test:visual`

Expected: 所有键盘/ARIA 用例 PASS；Light/Dark/Drawer 截图 diff 不超过 1%；High Contrast 人工 smoke 中所有焦点可见。

- [ ] **Step 7: 提交**

```bash
git add src/webview media test/fixtures test/visual playwright.config.ts
git commit -m "test: add accessible responsive visual coverage"
```

### Task 10: 打包检查、文档和最终验收

**Files:**
- Create: `README.md`
- Modify: `.vscodeignore`
- Modify: `package.json`
- Verify: `THIRD_PARTY_NOTICES.md`
- Verify: `media/vendor/md-reader-theme/LICENSE`

- [ ] **Step 1: 编写 README**

README 必须说明：点击 `.md` 默认进入 Reader、四个命令、Source/Preview 快捷键冲突行为、四个配置项、主题来源与 MIT 声明、V0.1 不支持 Markdown HTML/Mermaid/KaTeX/Shiki、外部链接白名单及如何改回 Text Editor。

- [ ] **Step 2: 配置 VSIX 打包内容**

`.vscodeignore` 排除 `src/`、`test/`、未编译 Less、配置源码和 sourcemap，但保留 `dist/extension.js`、`media/reader.js`、两个 CSS、主题 LICENSE、`THIRD_PARTY_NOTICES.md`、README 和 package.json。

- [ ] **Step 3: 增加最终验证脚本**

在 package scripts 增加：

```json
"verify": "npm run check:types && npm run test:unit && npm run build && npm run test:extension && npm run test:visual"
```

- [ ] **Step 4: 运行完整验证**

Run: `npm run verify`

Expected: 类型检查 0 error；unit、Extension Host、visual 全部 PASS；build 退出 0。

- [ ] **Step 5: 检查安装包内容**

安装 `@vscode/vsce` 后运行：

```bash
npx @vscode/vsce ls
npx @vscode/vsce package --no-dependencies
```

Expected: 文件清单包含运行产物、README、第三方声明和主题 LICENSE；不包含 `src/`、`test/`、`.ts`、`.less`、远程资源或密钥；生成一个 `.vsix`。

- [ ] **Step 6: 手工验收设计文档的 14 项流程**

依次验证：首次点击默认 Reader、当前 Tab/Group、TOC、点击定位、滚动高亮、多文档、主动 split、AI 修改刷新、阅读位置、Edit 返回源码、再次 Preview、Light/Dark 高保真、High Contrast/键盘/reduced motion、许可证随包发布。每项记录 PASS/FAIL 和复现步骤，任何 FAIL 均不得发布 V0.1。

- [ ] **Step 7: 最终提交**

```bash
git add README.md .vscodeignore package.json package-lock.json THIRD_PARTY_NOTICES.md media dist
git commit -m "docs: finalize markdown reader v0.1"
```

## 完成定义

- `npm run verify` 全绿。
- VSIX 内容审计通过，许可证随包发布。
- 设计文档第 22 节的 14 条验收标准全部有证据。
- Light/Dark 视觉回归在固定环境下不超过 1% pixel diff；V0.1 明确排除语法 token 颜色。
- 没有未完成占位标记、未处理 promise、未知 Webview 消息直通或超出资源根的本地读取。

# VS Code Markdown Reader 插件技术方案

## 1. 产品定位

> **Markdown files open like documents, not source code.**

面向 Codex、Claude Code 等 AI Coding 工作流：AI 负责生成和修改
Markdown，用户主要阅读、Review，必要时才进入源码编辑。

核心目标：

-   Preview 在当前 Tab / Editor Group 打开，不强制右侧分屏。
-   每个 `.md` 文件拥有独立 Preview，可同时打开多个文档。
-   Preview / Source 一键切换。
-   可将 Markdown Reader 设置为 `.md` 默认打开方式。
-   AI 或外部程序修改文件后自动刷新并保持阅读位置。
-   提供类似 Chrome Markdown Reader 的整洁阅读样式。
-   默认视觉主题尽量 1:1 还原
    [Markdown Reader](https://md-reader.github.io/) 的正文排版与阅读体验。
-   **自动提取标题，在左侧生成固定目录（TOC），并跟随正文滚动高亮。**

视觉实现以官方公开的
[`md-reader/theme`](https://github.com/md-reader/theme) 为基线。该主题采用 MIT
许可证；本项目只复用公开主题，不假定或复制未公开的 Markdown Reader 3.x
业务代码和 Pro 功能。

## 2. 核心交互

传统 Markdown Preview：

    Source | Preview

本插件：

    Source
      ↕
    Preview

多个 Markdown 文档可以同时存在：

    [README] [SPEC] [PLAN] [API]

Preview 提供 `Edit`，并注册：

-   `Markdown Reader: Open Preview`
-   `Markdown Reader: Open Source`
-   `Markdown Reader: Toggle Preview`
-   `Markdown Reader: Toggle Table of Contents`

Preview / Source 切换可复用 `Cmd/Ctrl + Shift + V`，但必须通过 `when`
条件限定作用域：Reader 激活时切换到 Source，Markdown 文本编辑器激活时切换到
Reader，不覆盖其他语言和其他 Webview 的快捷键。该快捷键与 VS Code 内置
`markdown.togglePreview` 相同，扩展必须在 `package.json` 中明确冲突处理规则。

`.md` 默认打开行为由 `customEditors.priority: "default"` 决定，而不是由扩展自定义
配置模拟。用户仍可通过 `Reopen Editor With...` 改回 Text Editor 或其他编辑器。

## 3. 左侧目录 TOC

左侧目录是 **V0.1 核心功能**，交互参考 Chrome Markdown Reader。

### 3.1 布局

    ┌────────────────┬──────────────────────────────────────────┐
    │ Document TOC   │           Markdown Document              │
    │ Overview       │                                          │
    │   Background   │   # Technical Design                     │
    │ Architecture   │   ## Architecture                        │
    │   Renderer     │                                          │
    │   Webview      │                                          │
    │ Security       │                                          │
    └────────────────┴──────────────────────────────────────────┘

目录固定在左侧，正文保持适合阅读的最大宽度。

### 3.2 标题提取

Markdown 中的 H1--H6 在解析阶段提取为：

``` typescript
interface HeadingItem {
  level: number;
  text: string;
  slug: string;
  line?: number;
}
```

例如：

    Title
    ├── Architecture
    │   ├── Renderer
    │   └── Webview
    └── Security

直接从 `markdown-it` token stream 提取 heading，避免二次解析。

### 3.3 Heading ID

正文生成：

``` html
<h2 id="architecture" data-source-line="12">Architecture</h2>
```

Slug 必须稳定，并处理重复标题：

    architecture
    architecture-1
    architecture-2

同时正确处理中文、中英文混合标题及 inline code/emphasis。

### 3.4 TOC 深度

默认显示 H1--H3：

``` json
{
  "markdownReader.toc.maxDepth": 3
}
```

允许配置 1--6。

### 3.5 点击与滚动联动

点击目录项后调用 `scrollIntoView()` 定位。普通模式使用平滑滚动；当系统开启
`prefers-reduced-motion: reduce` 时使用即时定位。

使用 `IntersectionObserver` 监听正文
Heading。用户滚动到某章节时，左侧目录自动高亮当前章节。

### 3.6 折叠

支持层级折叠：

    ▼ Architecture
        Renderer
      > Webview
    ▶ Security

当前章节所属父节点自动展开。

TOC 使用语义化 `<nav aria-label="Table of contents">`，目录项必须可通过键盘访问。
折叠按钮使用原生 `<button>` 并同步 `aria-expanded`。

### 3.7 TOC 尺寸与显示

默认宽度 260px，建议范围 220--320px。

``` json
{
  "markdownReader.toc.width": 260
}
```

支持 `Toggle Table of Contents`。隐藏后正文重新居中，不保留空白占位。

### 3.8 窄窗口

当 Editor 宽度不足（建议断点约 800px）：

-   自动收起固定 TOC；
-   显示目录按钮；
-   点击后以 Overlay / Drawer 展示；
-   选择目录项后关闭 Drawer。
-   `Escape` 关闭 Drawer，打开期间约束焦点，关闭后将焦点还给目录按钮。

## 4. 总体技术架构

推荐使用 VS Code `CustomTextEditorProvider`。

    Document URI
        │
        ▼
    TextDocument (.md) ── 一个资源共享一个文档模型
        │
        ▼
    MarkdownReaderEditorProvider
        │
        ├── Document Change Subscription
        ├── Markdown Renderer ── markdown-it ── HTML + Headings
        └── WebviewPanel[] ── 同一文档可因 Split Editor 存在多个视图
                              ├── Panel A: 独立滚动/TOC 状态
                              └── Panel B: 独立滚动/TOC 状态

一次 Markdown 解析同时得到：

``` typescript
interface RenderResult {
  revision: number;
  html: string;
  headings: HeadingItem[];
  resources: RenderResource[];
}

interface RenderResource {
  placeholder: string;
  kind: "image";
  href: string;
}
```

Provider 按文档 URI 管理渲染结果和面板集合。文档内容变化时只解析一次，再把同一结果
广播给该文档的全部面板。发送前仅对 `resources` 中的占位符执行每 Webview 独立的
`asWebviewUri` 转换，不重新解析 Markdown。每个面板独立维护滚动位置、当前标题、TOC
折叠和显示状态。

## 5. 技术栈

### Extension

-   TypeScript
-   VS Code Extension API
-   Node.js
-   esbuild

### Markdown

使用 `markdown-it` 默认 preset，并明确启用：

``` typescript
markdownIt({
  html: false,
  linkify: true,
  typographer: false
}).use(taskListPlugin);
```

V0.1 支持 CommonMark 基础语法，以及 Table、Task List、Strikethrough、Autolink
和 Fenced Code。Table 与 Strikethrough 使用 `markdown-it` 内置规则；Task List
使用明确记录版本的插件。测试用例用于固定本项目实际支持的 Markdown 方言，避免把
“常见 GFM”解释成完整 GFM 兼容。

### 代码高亮

V0.1 代码块使用 Markdown Reader 主题外观并进行 HTML 转义，不提供完整语法高亮。
V0.2 引入 `Shiki`；其 TextMate Grammar 与 VS Code 的语法高亮体系更接近。

### 后续增强

-   Mermaid：图表
-   KaTeX：数学公式
-   DOMPurify：允许 HTML 时进行安全清理

第一版不引入 React、Vue 或 Svelte。Webview 使用原生
HTML、CSS、JavaScript，减少体积和复杂度。

### 主题

V0.1 内置 `@md-reader/theme` 2.0.5，对应基线 commit
`b99c768a8806e49b11dbe131de26d467034dc0f9`。构建时将所需 Less 编译为本地 CSS，
运行时不访问网络、不跟随上游 `main` 自动更新。

主题升级必须作为显式依赖升级处理，并通过视觉回归测试。仓库必须包含上游 MIT
许可证及 `THIRD_PARTY_NOTICES.md`，记录项目地址、版本、commit 和本地修改摘要。

## 6. Webview 页面结构

``` html
<body>
  <div class="reader">
    <nav class="toc" aria-label="Table of contents"></nav>
    <main class="document-container">
      <article class="markdown-body"></article>
    </main>
  </div>
</body>
```

基础 CSS：

``` css
.reader {
  display: flex;
  min-height: 100vh;
}

.toc {
  width: 260px;
  position: sticky;
  top: 0;
  height: 100vh;
  overflow-y: auto;
}

.document-container {
  flex: 1;
  min-width: 0;
}

.markdown-body {
  max-width: 900px;
  margin: 0 auto;
  padding: 32px 48px 80px;
}
```

## 7. 阅读样式

V0.1 的默认视觉目标不是泛化的“类似 Markdown 阅读器”，而是尽量 1:1 还原
[Markdown Reader](https://md-reader.github.io/) 的默认阅读主题。实现以公开、MIT
许可的 [`md-reader/theme`](https://github.com/md-reader/theme) 为基线，并对 VS Code
Webview 做最小适配。

### 7.1 视觉保真范围

以下内容纳入 1:1 视觉验收：

-   页面背景、正文容器宽度、左右留白和垂直节奏；
-   H1--H6 的字号、字重、行高、上下间距和分隔效果；
-   正文、链接、列表、任务列表、引用、分隔线和脚注样式；
-   inline code、代码块、语言标签及滚动行为；
-   表格边框、表头、斑马纹、单元格留白和横向滚动；
-   图片最大宽度、圆角、居中、说明文字和加载失败状态；
-   Light / Dark 模式下的颜色、层级和对比度；
-   TOC 的字号、层级缩进、hover、active、折叠和滚动条样式。

不要求复刻浏览器扩展的安装页、设置页、账号、订阅、Pro 功能或未公开交互。

### 7.2 VS Code 必要适配

以下场景允许偏离上游主题：

-   High Contrast 模式必须优先满足 VS Code 可访问性；
-   字体不可用时使用 VS Code 编辑器字体和系统字体 fallback；
-   窄 Editor 使用 TOC Drawer，而不是压缩正文到不可读宽度；
-   链接焦点环、键盘导航和 reduced motion 遵循宿主环境；
-   Webview CSP 和资源 URI 规则优先于上游浏览器实现。

基础目标：

-   正文 `font-size: 16px`
-   `line-height: 1.5`（与固定版本上游主题一致）
-   正文最大宽度默认 900px
-   重点优化 Heading、段落、表格、引用、inline
    code、代码块、列表、分割线和图片

上游主题变量负责默认视觉保真；VS Code CSS Variables 作为宿主适配和 fallback：

``` css
var(--vscode-editor-background)
var(--vscode-editor-foreground)
var(--vscode-textLink-foreground)
var(--vscode-editor-font-family)
var(--vscode-editor-font-size)
var(--vscode-sideBar-background)
var(--vscode-sideBar-foreground)
```

Light / Dark 根据当前 VS Code 主题自动选择对应的 Markdown Reader 配色。High
Contrast 使用单独覆盖层，不要求与原主题像素一致，但必须保持内容和焦点清晰可见。

## 8. AI 修改与自动刷新

监听：

``` typescript
workspace.onDidChangeTextDocument
```

Webview HTML 外壳只在面板初始化时设置一次，后续不得通过反复替换
`webview.html` 更新文档。更新流程：

    用户阅读 PLAN.md
           ↓
    Codex 修改 PLAN.md
           ↓
    TextDocument Changed
           ↓
    Debounce 200ms
           ↓
    分配递增 revision 并重新 Render
           ↓
    Extension postMessage(render)
           ↓
    Webview 丢弃旧 revision
           ↓
    Patch HTML + TOC 并恢复阅读位置

推荐 debounce 150--250ms，默认 200ms。

渲染任务捕获启动时的 revision；任务结束时如果已有更新 revision，则丢弃旧结果。
面板关闭时必须释放文档变化监听、消息监听、定时器和面板引用。

### 8.1 保持阅读位置

记录：

1.  当前 active heading slug；
2.  active heading 相对于 viewport 的位置；
3.  scrollTop 作为 fallback。

刷新后优先根据 Heading Anchor 恢复位置，比单纯保存 scrollTop 更能适应 AI
在文档前部插入或删除内容。

Webview 在滚动稳定后上报 `viewportChanged`，并使用 `vscode.setState()` 保存面板状态。
收到新内容时，优先定位同 slug 标题并恢复相对 viewport 偏移；标题不存在时使用
`scrollTop`，仍超出范围时 clamp 到文档有效滚动范围。

## 9. Preview → Source 定位

V0.1 的 Edit、Open Source 和 Toggle Preview 使用
`vscode.openWith(document.uri, "default", options)` 在当前 Editor Group 打开源码，
不保证定位到正文对应行。

V0.2 支持双击正文或点击标题旁的 Edit 跳转到对应源码位置：

``` html
<h2 id="database-architecture" data-source-line="173">
  Database Architecture
</h2>
```

Webview 发送：

``` typescript
{
  type: "openSource",
  line: 173
}
```

`markdown-it` token `map` 和内部消息统一使用零基行号。Extension 打开 Text Editor
后构造零基 `Position` 并 Reveal 对应行；只在用户界面展示时转换为一基行号。

## 10. 图片与链接

### 本地图片

相对路径必须以当前 Markdown 文档所在目录为基准，通过 URI API 解析，不能拼接
Workspace 根路径。解析后使用 `webview.asWebviewUri(...)` 转换，并将
`localResourceRoots` 限制为扩展媒体目录和允许读取的文档资源根目录。

必须覆盖空格和 URL 编码、`../`、绝对路径、远程工作区、虚拟文件系统、工作区外文件
以及图片不存在等场景。具体策略如下：文档位于 Workspace 时，仅允许读取包含该文档的
Workspace Folder；文档位于 Workspace 外时，仅允许读取该文档的父目录；解析后超出允许
根目录的路径一律拒绝。多根工作区不得自动授予其他 Workspace Folder 的读取权限。

### Markdown 文件链接

相对 `.md` 链接以当前文档目录为基准解析，通过 `vscode.openWith` 以 Markdown
Reader 打开目标文件，并保留 `#fragment` 用于首次定位。
其他本地文件交由 `vscode.open` 使用默认编辑器打开。

### 外部 URL

只允许 `https:`、`http:` 和 `mailto:`，校验通过后再调用
`vscode.env.openExternal()`。其他 scheme 默认拒绝，不允许 Webview 直接导航。

### 当前文档 Anchor

`[Install](#installation)` 直接在当前 Webview 内滚动。

## 11. 安全

Webview 使用最小权限和严格 CSP：

``` html
<meta
  http-equiv="Content-Security-Policy"
  content="default-src 'none'; img-src ${webview.cspSource} https: data:;
           style-src ${webview.cspSource}; script-src ${webview.cspSource};"
>
```

脚本和样式使用扩展本地文件，不启用任意 inline script/style。若最终不需要 `data:`
图片则从 CSP 中移除。`enableScripts`、`localResourceRoots` 和所有资源权限保持最小化。
`markdown-it` 表格对齐等默认产生 inline style 的渲染规则必须改写为 class，再由本地
CSS 定义样式，不能为了兼容它而放宽 `style-src`。

V0.2 的 Mermaid 兼容例外：VS Code 不支持将 Webview 资源 URL 直接作为嵌套图表页面
导航，改用 `srcdoc` 与 `sandbox="allow-scripts"`。由于 `srcdoc` 继承父 CSP，
父页面 `style-src` 允许 Mermaid 必需的内联样式；正文渲染规则仍输出 class。
脚本仅允许扩展资源和随机 nonce 授权代码，不启用 `unsafe-inline` 或 `unsafe-eval`。
父页面读取扩展本地 bundle，经来源校验的消息交给子页面；子页面 CSP 禁止网络连接，
不授予同源权限或 VS Code API，图表结果仅以不可执行的 SVG 图片显示。

V0.1：

    markdown-it html = false

不执行 Markdown 中的 `<script>` 等 HTML。Extension 必须把文件内容、文件路径、标题、
配置和 Webview 消息都视为不可信输入；所有消息进行 discriminated-union 校验、长度限制
和 URI scheme 校验。`markdown-it` 的链接校验不能替代 Extension 侧的 `openLink`
白名单。

后续若允许内嵌 HTML，则引入 DOMPurify，并过滤 script、iframe、javascript:、
onclick、onerror 等危险内容，同时增加专门的 XSS 测试。工作区是否受信任不改变上述
安全边界。

## 12. 多 Preview

每个 Markdown URI 对应一个共享 TextDocument；每次打开或分屏可以产生独立 Webview：

    README.md → Webview A
    SPEC.md   → Webview B
    PLAN.md   → Webview C

VS Code 负责 Tab、Editor
Group、Focus、生命周期和文件状态。插件不得建立全局唯一 Preview Panel。

注册 Provider 时设置 `supportsMultipleEditorsPerDocument: true`。同一文档的多个面板
共享解析结果，但各自保存 viewport 和 TOC 状态。不同文档之间不得共享 debounce、
revision 或视图状态。

## 13. Custom Editor 注册

``` json
{
  "contributes": {
    "customEditors": [
      {
        "viewType": "markdownReader.preview",
        "displayName": "Markdown Reader",
        "selector": [
          { "filenamePattern": "*.md" }
        ],
        "priority": "default"
      }
    ]
  }
}
```

V0.1 使用 `priority: "default"`，以满足“点击 Markdown 即进入 Reader”的产品目标。
用户可通过 `Reopen Editor With...` 选择并设置其他默认 Editor。

注册代码必须包含：

``` typescript
vscode.window.registerCustomEditorProvider(viewType, provider, {
  supportsMultipleEditorsPerDocument: true,
  webviewOptions: { retainContextWhenHidden: false }
});
```

不依赖 `retainContextWhenHidden` 保活页面；隐藏和恢复状态由 `getState/setState` 处理。

## 14. Extension 与 Webview 通信

``` typescript
type WebviewToExtensionMessage =
  | { type: "openSource"; line?: number }
  | { type: "openLink"; href: string }
  | { type: "toggleToc" }
  | { type: "viewportChanged"; state: ViewportState }
  | { type: "ready" };

type ExtensionToWebviewMessage =
  | { type: "render"; result: RenderResult; restore?: ViewportState }
  | { type: "setTocVisible"; visible: boolean }
  | { type: "setLayout"; tocMaxDepth: number; tocWidth: number; contentMaxWidth: number }
  | { type: "navigateToAnchor"; slug: string }
  | { type: "setColorMode"; mode: "light" | "dark" | "high-contrast" };

interface ViewportState {
  activeSlug?: string;
  activeHeadingOffset?: number;
  scrollTop: number;
  tocVisible: boolean;
  collapsedSlugs: string[];
}
```

双方都只接受已知 `type` 和经过校验的字段。`render.revision` 小于 Webview
最近已应用 revision 时必须丢弃。

## 15. 推荐目录结构

    markdown-reader/
    ├── package.json
    ├── tsconfig.json
    ├── esbuild.js
    ├── src/
    │   ├── extension.ts
    │   ├── editor/
    │   │   ├── MarkdownEditorProvider.ts
    │   │   └── DocumentWatcher.ts
    │   ├── renderer/
    │   │   ├── MarkdownRenderer.ts
    │   │   ├── HeadingExtractor.ts
    │   │   ├── SlugGenerator.ts
    │   │   ├── ShikiRenderer.ts
    │   │   ├── MermaidRenderer.ts
    │   │   └── KatexRenderer.ts
    │   ├── webview/
    │   │   ├── WebviewManager.ts
    │   │   ├── html.ts
    │   │   └── messaging.ts
    │   └── utils/
    │       ├── uri.ts
    │       └── debounce.ts
    ├── media/
    │   ├── reader.css
    │   ├── high-contrast.css
    │   ├── reader.js
    │   ├── icons/
    │   └── vendor/
    │       └── md-reader-theme/
    │           ├── theme.css
    │           └── LICENSE
    ├── test/
    │   ├── renderer.test.ts
    │   ├── headings.test.ts
    │   ├── fixtures/
    │   └── visual/
    ├── THIRD_PARTY_NOTICES.md
    └── README.md

## 16. 配置项

V0.1：

``` json
{
  "markdownReader.toc.enabled": true,
  "markdownReader.toc.maxDepth": 3,
  "markdownReader.toc.width": 260,
  "markdownReader.content.maxWidth": 900
}
```

后续：

``` json
{
  "markdownReader.mermaid.enabled": true,
  "markdownReader.katex.enabled": true
}
```

所有配置必须在 `contributes.configuration` 声明类型、默认值、范围和说明；其中
`toc.maxDepth` 限制为 1--6，`toc.width` 限制为 220--320，内容宽度必须设置合理上下限。
`defaultMode` 不作为扩展配置提供，默认编辑器选择交由 VS Code Custom Editor 机制。

### 16.1 Manifest Contributions

V0.1 的 `package.json` 至少声明：

-   `contributes.customEditors`：Reader viewType、`.md` selector 和 default priority；
-   `contributes.commands`：Open Preview、Open Source、Toggle Preview、Toggle TOC；
-   `contributes.keybindings`：带精确 `when` 条件的 Preview / Source 切换；
-   `contributes.menus`：Reader 的 Editor title 操作；
-   `contributes.configuration`：本节列出的配置 schema；
-   `engines.vscode`：开发和 CI 验证过的最低 VS Code 版本。

命令的 `enablement` 和菜单的 `when` 必须区分 Markdown Text Editor 与
`markdownReader.preview`，避免命令出现在无效上下文。

## 17. V0.1 实施范围

### Editor

-   Custom Markdown Editor
-   当前 Tab Preview
-   多 Preview Tab
-   同一文档 Split Editor 多视图
-   Preview / Source 切换
-   `.md` 默认使用 Markdown Reader，用户可改回其他 Editor

### Markdown

-   CommonMark 基础语法
-   GFM Table
-   Task List
-   Strikethrough
-   Autolink
-   Fenced Code

### Reader

-   基于 `@md-reader/theme` 2.0.5 的高保真 Markdown Reader 排版
-   Light / Dark / High Contrast
-   本地图片
-   Markdown 链接
-   外部链接
-   键盘导航、焦点可见和 reduced motion
-   上游 MIT License 与第三方声明

### TOC

-   自动提取 H1--H3
-   为正文 Heading 生成稳定且唯一的 Anchor ID
-   左侧固定目录
-   层级缩进
-   点击跳转
-   当前章节高亮
-   自动跟随滚动
-   目录折叠
-   TOC 显示 / 隐藏
-   窄窗口 Drawer

### AI Workflow

-   文件变化自动刷新
-   200ms debounce
-   刷新保持阅读位置
-   revision 防止过期渲染覆盖最新文档

## 18. V0.2

-   Shiki 完整代码高亮
-   Mermaid
-   KaTeX
-   Preview → Source 行号定位
-   双击正文进入源码
-   Copy Heading Link
-   跨 Tab 关闭/重开的 TOC 状态记忆

## 19. V0.3

-   Reader Theme 系统
-   GitHub Theme
-   自定义字体
-   自定义字号
-   大文件模式
-   打印优化
-   导出 HTML / PDF（可选）

## 20. 测试方案

### Renderer

测试 H1--H6、重复 Heading slug、中文/中英文混合 Heading、Heading 内
inline code/emphasis、Table、Task List、Code Fence 和链接。使用 golden fixtures 固定
实际 Markdown 方言，并测试所有动态文本均被正确转义。

### TOC

测试 Heading Tree 层级、跳级标题（H1 → H3）、重复标题、点击定位、Scroll
Spy、折叠状态和窄窗口 Drawer。

### AI Refresh

模拟连续修改 Markdown，验证 debounce、TOC
更新、旧 revision 被丢弃，以及阅读位置不会跳回顶部。关闭面板后验证监听和定时器已释放。

### 多文档

同时打开多个 `.md`，确认每个 Preview
独立更新、独立保存滚动状态，不互相覆盖。

同一 `.md` 使用 Split Editor 打开两个 Preview，确认共享最新文档内容，但滚动、当前标题、
TOC 折叠和显示状态互相独立。

### Extension Host Integration

在真实 Extension Host 中测试：默认打开、`vscode.openWith` Source / Preview 切换、
当前 Editor Group、不创建右侧分屏、主题切换、多根工作区、远程 URI 和资源释放。

### Security

测试 HTML source、`javascript:`、`data:`、`file:`、畸形 URI、路径穿越、未知消息类型、
超长消息以及图片加载失败。验证 CSP 不允许任意 inline script 和未声明资源来源。

### Accessibility

测试 TOC 全键盘操作、焦点顺序、Drawer 焦点约束与恢复、`Escape`、ARIA 状态、High
Contrast 和 `prefers-reduced-motion`。

### Visual Regression

准备一份覆盖标题、段落、列表、表格、引用、代码、图片和 TOC 的固定 Markdown fixture。
在固定 VS Code 版本、viewport、字体和缩放下生成 Light / Dark 截图，与 Markdown
Reader 参考截图逐区域比较。High Contrast 只验证可读性和状态清晰度，不做像素一致要求。
V0.1 的代码块比较容器、字体、间距和背景，不比较语法 token 颜色；token 颜色从引入
Shiki 的 V0.2 起纳入视觉回归。

首次建立基线时记录参考 Markdown Reader 版本、`@md-reader/theme` 版本、commit、操作系统、
字体和 viewport；主题升级必须显式更新基线并人工 Review diff。

## 21. 关键技术决策

  项目              决策
  ----------------- -----------------------------------------
  VS Code 集成      `CustomTextEditorProvider`
  Markdown Parser   `markdown-it`
  默认打开          Custom Editor `priority: "default"`
  Preview 位置      当前 Editor Group
  多文档            每个 URI 独立 TextDocument 与渲染状态
  同文档多视图      共享 TextDocument，每个 Webview 独立视图状态
  TOC               从 Markdown token stream 提取
  TOC Scroll Spy    `IntersectionObserver`
  默认主题          `@md-reader/theme` 2.0.5，固定 commit 并内置
  代码高亮          V0.1 安全转义；V0.2 Shiki
  UI Framework      V0.1 不使用
  Theme             Markdown Reader CSS + VS Code 宿主适配
  自动刷新          `onDidChangeTextDocument` + debounce
  更新协议          单次 HTML Shell + 双向消息 + revision
  阅读位置恢复      Active Heading Anchor + offset + scroll fallback
  第三方许可        MIT License + `THIRD_PARTY_NOTICES.md`
  Mermaid           V0.2
  KaTeX             V0.2

## 22. 验收标准

V0.1 完成时，应满足以下实际使用流程：

1.  用户首次在 VS Code 点击 `README.md`，不需要预先配置 Editor Association。
2.  Markdown Reader 在当前 Tab 和当前 Editor Group 显示渲染后的文档。
3.  左侧自动显示由标题生成的目录。
4.  点击目录立即定位对应章节。
5.  滚动正文时，目录自动高亮当前章节。
6.  可以同时打开 README、SPEC、PLAN 等多个 Preview Tab。
7.  不自动创建右侧分屏；用户主动 Split 时可打开同一文档的第二个独立视图。
8.  Codex 修改当前 Markdown 后，页面自动刷新。
9.  刷新后阅读位置基本不变。
10. 用户点击 Edit 或快捷键可以在当前 Editor Group 回到 Markdown 源码。
11. 再次 Preview 后返回阅读视图。
12. Light / Dark 下的正文核心元素与固定版本 Markdown Reader 参考截图高度一致。
13. High Contrast、键盘导航和 reduced motion 可正常使用。
14. 安装包包含 `md-reader/theme` 的 MIT License 和第三方声明。

最终体验应接近：

> **尽量 1:1 的 Chrome Markdown Reader 阅读体验 + VS Code 原生 Tab 管理 + AI
> Coding 工作流。**

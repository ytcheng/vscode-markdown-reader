# PlantUML 与 Graphviz 本地渲染设计

## 目标

为 VS Code Markdown Reader 增加本地 PlantUML 与 Graphviz/DOT 图形渲染。`plantuml` / `puml` 使用 PlantUML，`dot` / `graphviz` 使用 Graphviz。所有图形在本机渲染为 SVG 并显示在 Markdown Preview 中，不要求 Java/JVM 或系统 Graphviz，不连接 PlantUML Server、Kroki 或其他在线渲染服务。

新功能不得改变现有 Mermaid、KaTeX、代码高亮、TOC、链接、图片、刷新和导出行为。大文件模式继续显示源码，不启动图形 runtime。

## 已确认的约束

- PlantUML 实现优先使用官方 `@plantuml/core`，通过其公开 JavaScript API 渲染，不调用 Java。
- Graphviz 实现先判断能否经 PlantUML 的稳定公开 API 直接渲染 DOT。当前可查到的 `@plantuml/core` 公开接口提供 `render` 与 `renderToString`，没有 DOT 渲染入口；DOT 因此使用 `@viz-js/viz` 的公开 API，不导入 PlantUML 私有实现。
- 不允许远程渲染、在线标准库回退或动态下载资源。PlantUML 可选标准库只从随扩展发布的资源解析；未随包提供的 include 显示为该图的局部渲染错误。
- 保持主 Webview CSP 与 Mermaid 实现不变。任何为 WASM 或 worker 所需的 CSP 权限只配置在隔离的渲染 iframe 中，并经 VS Code Webview 实测后确定。
- SVG 不以内联 HTML 写入 Markdown 文档；显示为编码后的 SVG 图片。拒绝带脚本、事件处理器、`javascript:` URL 或外部资源引用的输出。
- 渲染失败只影响对应图块，源码仍可读，详细原因进入 console，Preview 其他内容保持可用。
- 优先级为稳定性、可维护性，然后是包体积。不得为减少包体积依赖未公开 API 或删去 runtime 必需文件。

## 方案与取舍

### 渲染位置

在 Webview 中新增独立的本地 sandbox iframe 作为 PlantUML 与 Graphviz 的 renderer。Markdown renderer 只识别 fence、转义并保留源码、输出占位块；Webview 插入文档后再向 iframe 发起异步渲染请求。

扩展端 Markdown renderer 不直接运行浏览器型图形 runtime。主 Webview 也不承载图形库，避免把异步初始化、SVG 插入和图形代码耦合到 Markdown parser 或主文档 DOM。Mermaid 继续沿用当前自己的 sandbox frame，不进行大规模重构。

### Graphviz runtime

PlantUML 包含用于自身图形布局的 Graphviz/Viz.js runtime，但当前公开 API 没有 DOT-to-SVG 调用。因此 Graphviz fence 使用单独的 `@viz-js/viz`。新 renderer frame 中缓存 `instance()` 返回的 Promise，并复用于此 Preview 中的 DOT 图。不得从 `@plantuml/core` 导入私有文件或访问非公开对象。

实施开始时先验证两个官方包当前版本在扩展构建与 VS Code Webview 中的真实 API、worker/WASM 资源和 CSP 需求。若验证失败，暂停实现并重新审阅设计；不得借此引入 Java、系统 Graphviz、远程服务或私有 API。

### PlantUML API

PlantUML 适配层通过 `renderToString(lines, onSuccess, onError)` 取得 SVG，并将回调接口包装为 Promise。`@plantuml/core` 要求使用其 `viz-global.js`；构建和 frame 初始化必须按官方说明提供此资源。通过 Promise 单例延迟初始化，通过串行队列调用 PlantUML renderer，避免其共享状态被并发渲染覆盖。

## 组件与职责

| 组件 | 职责 |
| --- | --- |
| `src/renderer/MarkdownRenderer.ts` | 识别四种图形 fence，生成含转义源码、语言、源码行号的占位图块；不初始化图形 runtime。 |
| 本地 renderer 适配层 | 分别包装 PlantUML 与 DOT API，暴露异步 SVG 渲染接口。 |
| 本地 sandbox frame 与 Webview 客户端 | 延迟启动 renderer、复用 runtime、关联异步请求与结果、丢弃失效结果、展示图形或局部错误。 |
| `src/webview/ReaderApp.ts` | 文档 HTML 插入后发现图块并调度渲染；文档刷新时使旧结果失效。 |
| `src/webview/ReaderControls.ts` | 按文档顺序收集 Mermaid、PlantUML 与 Graphviz 的已渲染 SVG 快照供导出使用。 |
| `src/export/ExportService.ts` | 校验 SVG 快照并按原图块顺序嵌入 HTML/打印文档；未完成渲染时保留源代码并给出提示。 |
| `esbuild.mjs` 与 `.vscodeignore` | 构建本地 frame/runtime 资源、纳入相关许可证，并只打包实际运行需要的文件。 |

具体文件名与消息接口在实施计划中结合当前项目模式确定。不得修改 Mermaid 消息协议来适配新图形。

## 渲染数据流

```mermaid
flowchart LR
    A[Markdown fence] --> B[MarkdownRenderer 输出源码占位块]
    B --> C[ReaderApp 插入文档]
    C --> D[Local diagram client]
    D -->|按需创建并复用| E[隔离 renderer iframe]
    E --> F{语言}
    F -->|plantuml / puml| G[@plantuml/core]
    F -->|dot / graphviz| H[@viz-js/viz]
    G --> I[校验 SVG]
    H --> I
    I -->|请求仍有效| J[编码 SVG image]
    I -->|错误| K[保留源码并显示局部错误]
```

### 请求与刷新

- 每个请求带唯一 ID、renderer 类型、源码和文档 revision。
- 父页面只接受来自当前 renderer iframe 且与待处理 ID 匹配的消息。
- 插入新 revision 后，旧图块及其请求不再接收结果；返回前同时验证目标仍连接到当前文档。
- runtime 初始化失败可使相同 runtime 后续请求收到可读错误；单张图的语法或 SVG 验证错误不影响其他图。
- Preview 初次显示不等待图形 runtime 或 SVG。占位图块保留源码；渲染完成后再替换为图片。

## 错误与可访问性

- PlantUML 与 Graphviz 解析错误分别显示 renderer 名称、适合用户理解的提示和可用的语法错误信息。
- 原始 fence 源码在错误时保持显示。
- 详细错误写入 console；错误 UI 使用 `role="status"`，并按英文/简体中文界面本地化。
- 图形容器限制最大宽度并允许横向滚动；SVG 图片保持宽高比，小图不放大。
- 新图的 SVG 保持 renderer 默认颜色，不根据 Reader 浅色/深色主题重写图内颜色。

## SVG 与 CSP 安全

- Markdown source HTML 仍然关闭。
- iframe 使用 `sandbox="allow-scripts"`，不添加 `allow-same-origin`，不提供 VS Code API。
- iframe 仅加载扩展安装包内的代码和资源，不配置网络加载路径；外部 PlantUML 标准库加载被禁用。
- renderer 输出在接收端检查有效 SVG 根元素，以及 script、事件处理器、危险 URL 和外部资源引用；校验失败时不显示该 SVG。
- SVG 只通过 `img.src = data:image/svg+xml;charset=utf-8,...` 载入，不使用 `innerHTML` 或 DOMParser 后插入主文档。
- 如必须允许 WASM/worker 执行，仅为 renderer iframe 添加经实测所需的最小 CSP 指令；主 Webview CSP 不放宽。

## 导出行为

Webview 收集每个 Mermaid/PlantUML/Graphviz 图块对应的已完成 SVG 快照。沿用现有 revision 和文档内容 digest 检查，阻止将旧文档的图像混入当前导出。扩展端依文档图块顺序将有效快照替换成 SVG 图片；空快照对应保留源码并加入“部分图形尚未完成”的提示。保留现有快照消息大小限制并覆盖所有图形类型。

## 回归与验收标准

### 功能验收

1. `plantuml` 与 `puml` 均使用 PlantUML renderer；`dot` 与 `graphviz` 均使用 Graphviz renderer。
2. 至少成功渲染 PlantUML sequence、class、component 示例，以及 Graphviz directed、带 `rankdir=LR` 的架构示例。
3. 无效 PlantUML 与无效 DOT 都显示局部错误和原源码；一个失败不影响另一个 renderer、同类其他图、Mermaid 或全文显示。
4. 未知语言、普通 fenced code、KaTeX、图片、表格和 markdown links 保持现有行为。
5. Mermaid 行为及主题变化、刷新、缩放和错误回退保持原样。
6. 大文件模式不启动这两个 renderer，并继续显示源码。
7. 一个 Markdown 同时包含 Mermaid、PlantUML、Graphviz、KaTeX 和普通代码块时，所有内容都按各自现有样式和行为呈现。
8. Preview 刷新不重复初始化仍存活 Preview 中的 runtime；旧异步结果不能覆盖新文档。
9. HTML 导出和打印能够嵌入已渲染的 PlantUML/Graphviz SVG，且校验与超限处理正常。
10. 脚本、事件处理器、`javascript:` URL 或外部资源 SVG 不可执行、不可导航、不可发出外部资源请求，并被安全校验拒绝。

### 测试与回归

- 单元测试覆盖 fence 别名、源码转义、大文件模式、runtime 单例、PlantUML 序列化、异步错误、失效 revision、SVG 验证、导出顺序及超限行为。
- renderer API 通过依赖注入或 mock 单测；真实 runtime 的渲染与 CSP/worker/WASM 由扩展宿主集成测试验证。
- 集成样例覆盖 sequence/class/component、directed/rankdir 图，以及 Mermaid + 新图形 + KaTeX + 普通代码共存。
- 跑项目现有 `npm run check`，并跑 `npm run test:extension` 与 `npm run test:visual` 覆盖 Webview 加载、浅色/深色主题和原 UI。不得为通过检查而修改不相关测试预期。
- 回归检查 TOC、source navigation、图片、链接、普通代码高亮、Preview refresh、HTML export 和 print。

### 包体积与性能

- 依赖变更前记录基准 VSIX 大小。若仓库无现成 VSIX，则用发布 workflow 的 `npx --yes @vscode/vsce package --no-dependencies --out ...` 生成基准包。
- 用相同构建和打包方式分别测量基准版本、只加入 `@plantuml/core` 的中间版本、同时加入 `@plantuml/core` 与 `@viz-js/viz` 的最终版本。报告 Before、PlantUML only、PlantUML + Graphviz 三个体积和相对增量；记录两个 package 的版本和 bundle/资源组成。
- 检查打包清单中只有 renderer 运行需要的 bundle、WASM/worker/辅助资源、许可证与现有扩展文件；排除 source map、测试、示例、开发源码及 npm 包测试素材，不能排除 runtime 必需文件。
- 测量文档首次显示、PlantUML/Graphviz 冷启动、单图与多图渲染、Preview refresh 和 WASM/runtime 重复初始化情况。

## 文档与交付

- 更新 `README.md` 与 `README.zh-CN.md`，为 Mermaid、PlantUML、Graphviz 提供 fence 示例。
- 明确 PlantUML/Graphviz 在本地渲染，不需要 Java 或系统 Graphviz，不调用外部渲染服务器。
- 实施报告按以下栏目记录：Implementation、Architecture、Graphviz Runtime、Package Size、Performance、Tests、Regression、Files Changed、Known Limitations。
- 发布时再按仓库发布规范更新 `package.json` 版本与 `CHANGELOG.md`；本设计不授权发布、推送或创建 tag。

## 已知限制

- 未随扩展打包的 PlantUML 可选标准库 include 不会从网络下载，会作为该图的局部渲染错误显示。
- 为遵守公开 API 约束，PlantUML 自带 Viz.js 不用于直接渲染 DOT；因此将有单独的 `@viz-js/viz` Graphviz runtime 和额外包体积。
- `@plantuml/core` 与 Webview 的最终兼容性、worker/WASM 资源和 CSP 需求须由首个实现任务进行可复现验证；验证结果只能在本地离线、安全约束内解决。

## 官方 API 依据

- [`@plantuml/core` npm 文档](https://www.npmjs.com/package/%40plantuml/core)：当前公开 `render` / `renderToString` API，以及 `viz-global.js` 和异步运行说明。
- [PlantUML TeaVM 集成说明](https://plantuml.github.io/plantuml/js-plantuml/GITHUB_INTEGRATION.md)：浏览器扩展集成方式与渲染并发注意事项。
- [Viz.js API 文档](https://viz-js.com/api/)：公开 `instance()`、`renderString()` 与 WebAssembly runtime 说明。

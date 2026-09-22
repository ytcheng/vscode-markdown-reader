# Markdown Reader

> 在 VS Code 中提供精致的 Markdown 阅读体验：目录同步、文件自动刷新、文内搜索，以及顺畅的 Source / Preview 切换。

[English](README.md) · [GitHub 仓库](https://github.com/ytcheng/vscode-markdown-reader)

![VS Code 中的 Markdown Reader](assets/markdown-reader-preview-zh-CN.png)

Markdown Reader 会在当前 VS Code 编辑器标签页中，将 `.md` 文件呈现为专注、舒适的文档阅读视图。它适合阅读长篇技术方案、笔记、文档，以及由 AI 生成的 Markdown 内容。

## 主要特色

- **当前标签页直接阅读**：以整洁的文档视图打开 Markdown，不强制占用右侧分栏。
- **目录与正文联动**：自动提取标题形成目录；阅读正文时，当前章节会同步高亮。
- **自动刷新并尽量保留位置**：文件被 AI、其他程序或编辑器修改后，阅读视图自动刷新，并尽可能停留在原来的阅读位置。
- **Source / Preview 一键切换**：使用 <kbd>Ctrl</kbd>/<kbd>Cmd</kbd> + <kbd>Shift</kbd> + <kbd>V</kbd> 在源码和阅读视图间切换。
- **文内搜索**：使用 <kbd>Ctrl</kbd>/<kbd>Cmd</kbd> + <kbd>F</kbd> 搜索渲染后的内容，高亮匹配项并可前后跳转。
- **更适合阅读代码**：围栏代码块展示语言信息，并提供复制按钮。
- **版式可调整**：可显示/隐藏目录、拖动调整目录宽度、设置目录深度与正文最大宽度。
- **支持多文档并行阅读**：每个 Markdown 文件拥有独立的阅读标签页。

## 快速开始

1. 从 VS Code Marketplace 安装 **Markdown Reader**。
2. 打开任意 `.md` 文件。Markdown Reader 已注册为 Markdown 的默认阅读编辑器。
3. 如果 VS Code 以文本编辑器打开文件，在编辑器标题栏菜单中选择 **Reopen Editor With…**，然后选择 **Markdown Reader**。

### 阅读与编辑切换

| 目标 | 操作方式 |
| --- | --- |
| 打开阅读视图 | 运行 **Markdown Reader: Open Preview** |
| 返回 Markdown 源码 | 运行 **Markdown Reader: Open Source** |
| 切换 Source / Preview | <kbd>Ctrl</kbd>/<kbd>Cmd</kbd> + <kbd>Shift</kbd> + <kbd>V</kbd> |
| 显示或隐藏目录 | 运行 **Markdown Reader: Toggle Table of Contents** |
| 搜索已渲染的文档 | <kbd>Ctrl</kbd>/<kbd>Cmd</kbd> + <kbd>F</kbd> |

也可以通过命令面板（`Ctrl`/`Cmd` + `Shift` + `P`）搜索 **Markdown Reader**，运行所有相关命令。

## 配置项

在 VS Code 设置中搜索 Markdown Reader，或在 `settings.json` 中加入：

```json
{
  "markdownReader.toc.enabled": true,
  "markdownReader.toc.maxDepth": 3,
  "markdownReader.toc.width": 260,
  "markdownReader.content.maxWidth": 900
}
```

| 配置项 | 默认值 | 说明 |
| --- | ---: | --- |
| `markdownReader.toc.enabled` | `true` | 打开文档时是否显示目录。 |
| `markdownReader.toc.maxDepth` | `3` | 目录展示到第几级标题（`1`–`6`）。 |
| `markdownReader.toc.width` | `260` | 目录默认宽度，单位为像素（`180`–`480`）；也可以在阅读器中拖动调整。 |
| `markdownReader.content.maxWidth` | `900` | 正文最大宽度，单位为像素（`560`–`1600`）。 |

## Markdown 支持范围

Markdown Reader 支持日常文档与笔记常用的 Markdown 语法：

- CommonMark 基础语法：标题、段落、强调、列表、引用、代码、分割线
- 表格、任务列表、删除线、自动链接和围栏代码块
- 本地图片与 HTTPS 图片
- 文内锚点、Markdown 文件链接和外部网页链接

当前版本暂不渲染 Markdown HTML、Mermaid 图表、KaTeX 公式和 Shiki 语法高亮。

## 安全与链接处理

为保证安全，扩展仅允许打开 `https:`、`http:` 和 `mailto:` 外部链接，其他协议会被拦截。本地图片仅能从工作区根目录读取；如果文档位于工作区外，则仅能从该文档所在目录读取。

## 开发

```bash
npm install
npm run check
```

## 许可证

[MIT](LICENSE)

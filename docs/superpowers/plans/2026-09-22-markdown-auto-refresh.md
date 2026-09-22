# Markdown 自动刷新 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 打开的 Markdown Reader 在 VS Code 编辑或外部写入源文件后自动显示最新内容。

**Architecture:** `onDidChangeTextDocument` 是主刷新入口，并将会话绑定到事件中的最新文档。每个预览文件另有精确的文件系统监听作为外部写入兜底；两条路径共用 `DocumentSession` 的防抖。最后一个面板关闭时销毁会话和监听，避免陈旧文档引用。

**Tech Stack:** TypeScript、VS Code Extension API、Vitest。

---

## 文件结构

- `src/editor/DocumentSession.ts`：维护可替换的文本来源，并报告是否仍有预览面板。
- `src/editor/MarkdownEditorProvider.ts`：路由 VS Code 文档和文件系统事件，管理会话及文件监听生命周期。
- `test/unit/DocumentSession.test.ts`：验证替换文本来源后防抖渲染使用最新文本。
- `test/unit/MarkdownEditorProvider.test.ts`：验证重新创建的同 URI 文档、外部变更和会话清理。

### Task 1: 让会话使用最新文本来源

**Files:**

- Modify: `test/unit/DocumentSession.test.ts`
- Modify: `src/editor/DocumentSession.ts`

- [ ] **Step 1: 写入失败测试**

在 `test/unit/DocumentSession.test.ts` 新增：

```ts
it('renders with a replacement text provider after a document model is reopened', async () => {
  vi.useFakeTimers();
  const render = vi.fn((source: string, revision: number) => ({ revision, html: source, headings: [], resources: [] }));
  const panel = { postRender: vi.fn(async () => true) };
  const session = new DocumentSession(() => '# old', { render }, 200);
  session.attach(panel);

  session.setTextProvider(() => '# new');
  session.schedule();
  await vi.advanceTimersByTimeAsync(200);

  expect(render).toHaveBeenCalledWith('# new', 1);
  vi.useRealTimers();
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `npm run test:unit -- test/unit/DocumentSession.test.ts`

Expected: FAIL，提示 `setTextProvider` 尚不存在。

- [ ] **Step 3: 实现最小会话接口**

在 `src/editor/DocumentSession.ts` 新增可写私有字段，并更新构造函数：

```ts
#getText: () => string;

constructor(
  getText: () => string,
  private readonly renderer: Renderer,
  private readonly debounceMs = 200
) {
  this.#getText = getText;
}

get hasPanels(): boolean {
  return this.#panels.size > 0;
}

setTextProvider(getText: () => string): void {
  this.#getText = getText;
}
```

`renderNow()` 应继续通过 `this.#getText()` 取得 Markdown，其他行为不变。

- [ ] **Step 4: 运行测试并确认通过**

Run: `npm run test:unit -- test/unit/DocumentSession.test.ts`

Expected: PASS，包含新测试和既有会话测试。

- [ ] **Step 5: 提交**

```bash
git add src/editor/DocumentSession.ts test/unit/DocumentSession.test.ts
git commit -m "fix: refresh sessions from latest document"
```

### Task 2: 将 VS Code 文本事件绑定到新文档模型

**Files:**

- Modify: `test/unit/MarkdownEditorProvider.test.ts`
- Modify: `src/editor/MarkdownEditorProvider.ts`

- [ ] **Step 1: 写入失败测试**

扩展 `vscode.workspace.onDidChangeTextDocument` mock，以保存回调；新增测试：先用 `getText: () => '# old'` 解析预览，再以相同 URI、`getText: () => '# new'` 的文档触发保存的回调。使用 fake timers 推进 200ms 后，断言最后一条 `postMessage` 的 `render.result.html` 包含 `new`。

```ts
changeTextDocument!({ document: updatedDocument });
await vi.advanceTimersByTimeAsync(200);
expect(postMessage).toHaveBeenLastCalledWith(expect.objectContaining({
  type: 'render',
  result: expect.objectContaining({ html: expect.stringContaining('new') })
}));
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `npm run test:unit -- test/unit/MarkdownEditorProvider.test.ts`

Expected: FAIL，渲染仍包含旧文档文本。

- [ ] **Step 3: 最小化路由实现**

在 `MarkdownEditorProvider` 的构造函数中，将单行监听回调改为：

```ts
context.subscriptions.push(vscode.workspace.onDidChangeTextDocument((event) => {
  const session = this.#sessions.get(event.document.uri.toString());
  if (!session) return;
  session.setTextProvider(() => event.document.getText());
  session.schedule();
}));
```

并在 `#sessionFor(document)` 中，对新建和已存在会话都调用：

```ts
session.setTextProvider(() => document.getText());
```

- [ ] **Step 4: 运行测试并确认通过**

Run: `npm run test:unit -- test/unit/MarkdownEditorProvider.test.ts`

Expected: PASS，既有 Webview 初始化、布局和 TOC 测试继续通过。

- [ ] **Step 5: 提交**

```bash
git add src/editor/MarkdownEditorProvider.ts test/unit/MarkdownEditorProvider.test.ts
git commit -m "fix: refresh preview from current text document"
```

### Task 3: 增加外部写入监听与会话清理

**Files:**

- Modify: `test/unit/MarkdownEditorProvider.test.ts`
- Modify: `src/editor/MarkdownEditorProvider.ts`

- [ ] **Step 1: 写入失败测试**

扩展 `workspace` mock：`createFileSystemWatcher` 返回带 `onDidChange` 与 `dispose` 的 watcher，并让 `openTextDocument` 返回 `getText: () => '# external'` 的同 URI 文档。解析预览后触发 watcher 的 change 回调，推进 200ms，断言渲染 HTML 包含 `external`。

再捕获面板 `onDidDispose` 回调并执行，断言 watcher 已 dispose。用同 URI 重新解析新的面板后，断言 `createFileSystemWatcher` 被再次调用。

```ts
fileChanged!(document.uri);
await vi.advanceTimersByTimeAsync(200);
expect(postMessage).toHaveBeenLastCalledWith(expect.objectContaining({
  type: 'render',
  result: expect.objectContaining({ html: expect.stringContaining('external') })
}));

disposePanel!();
expect(watcher.dispose).toHaveBeenCalledOnce();
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `npm run test:unit -- test/unit/MarkdownEditorProvider.test.ts`

Expected: FAIL，当前提供器不创建 watcher，也不在最后一个面板关闭时释放会话。

- [ ] **Step 3: 实现单文件 watcher 和清理**

在 provider 添加 `#watchers = new Map<string, vscode.Disposable>()`。当一个会话首次附加面板时，针对 `document.uri` 使用：

```ts
const watcher = vscode.workspace.createFileSystemWatcher(
  new vscode.RelativePattern(document.uri, '*'),
  true,
  false,
  true
);
const changeSubscription = watcher.onDidChange((uri) => void this.#refreshFromFile(uri));
this.#watchers.set(key, vscode.Disposable.from(watcher, changeSubscription));
```

实现：

```ts
async #refreshFromFile(uri: vscode.Uri): Promise<void> {
  const session = this.#sessions.get(uri.toString());
  if (!session) return;
  try {
    const document = await vscode.workspace.openTextDocument(uri);
    session.setTextProvider(() => document.getText());
    session.schedule();
  } catch {
    // 文件删除或临时不可访问时保留上一次渲染，等待下一次有效事件。
  }
}

#disposeSession(key: string): void {
  const session = this.#sessions.get(key);
  if (!session || session.hasPanels) return;
  session.dispose();
  this.#sessions.delete(key);
  this.#watchers.get(key)?.dispose();
  this.#watchers.delete(key);
}
```

把面板的 dispose 回调改为先 `session.detach(sink)`，再调用 `#disposeSession(key)`。文件 scheme 不是 `file` 时不创建 watcher，仍由文档事件刷新。

- [ ] **Step 4: 运行测试并确认通过**

Run: `npm run test:unit -- test/unit/MarkdownEditorProvider.test.ts`

Expected: PASS，外部写入刷新、清理和重开监听测试通过。

- [ ] **Step 5: 提交**

```bash
git add src/editor/MarkdownEditorProvider.ts test/unit/MarkdownEditorProvider.test.ts
git commit -m "fix: refresh markdown previews after external writes"
```

### Task 4: 全量验证

**Files:**

- Verify only: `src/editor/DocumentSession.ts`
- Verify only: `src/editor/MarkdownEditorProvider.ts`
- Verify only: `test/unit/DocumentSession.test.ts`
- Verify only: `test/unit/MarkdownEditorProvider.test.ts`

- [ ] **Step 1: 运行完整项目检查**

Run: `npm run check`

Expected: TypeScript 类型检查、所有 Vitest 单元测试、LESS 构建和扩展 bundle 均通过。

- [ ] **Step 2: 检查工作树**

Run: `git diff --check && git status --short`

Expected: 无空白错误；仅包含此功能的已提交变更，以及现有的打包产物改动。

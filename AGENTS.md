# Agent preferences

- 不使用视觉伴侣（Visual Companion），也不要询问是否启用；默认以文字和本地工具完成任务。

## VS Code Marketplace 发布与更新

### 已发布扩展

- Publisher：`chengjian`
- Extension ID：`chengjian.vscode-markdown-reader`
- Marketplace：<https://marketplace.visualstudio.com/items?itemName=chengjian.vscode-markdown-reader>
- Publisher 管理页：<https://marketplace.visualstudio.com/manage/publishers/chengjian>
- GitHub：<https://github.com/ytcheng/vscode-markdown-reader>

`package.json` 中的 `name` 和 `displayName` 都必须在 Marketplace 中保持唯一。不要将它们改回已被占用的 `markdown-reader` / `Markdown Reader`。

### 发布新版本

1. 更新 `package.json` 的 `version`，并在 `CHANGELOG.md` 写明该版本的变更。
2. 完成代码与文档改动后，执行完整检查：

   ```bash
   npm run check
   ```

3. 提交并推送源码、`package.json` 与 `CHANGELOG.md` 到 `main`。
4. 打包到被 Git 忽略的 `release/` 目录：

   ```bash
   npx @vscode/vsce package --no-dependencies \
     --out release/vscode-markdown-reader-<version>.vsix
   ```

5. 首次在机器上发布时登录 Publisher；PAT 必须具备 `Marketplace (Manage)` 权限，且不得写入仓库、日志或对话：

   ```bash
   npx @vscode/vsce login chengjian
   ```

6. 发布已验证的 VSIX，避免 `vsce publish` 自动改版本或创建 Git tag：

   ```bash
   npx @vscode/vsce publish \
     --packagePath release/vscode-markdown-reader-<version>.vsix
   ```

7. 等待 Marketplace 索引数分钟后，使用下列命令安装并验证：

   ```bash
   code --install-extension chengjian.vscode-markdown-reader
   ```

### 打包约束

- `.vscodeignore` 只保留运行所需的 `dist/extension.js`、`media/`、`assets/`、README、CHANGELOG、许可证与清单文件。
- Marketplace 图标必须是至少 `128×128` 的 PNG；当前图标路径为 `assets/markdown-reader-icon.png`。
- `README.md` 使用英文截图，`README.zh-CN.md` 使用中文截图；图片必须保留为仓库内相对路径。

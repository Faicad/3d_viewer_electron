# Electron 二进制管理

## 问题

`pnpm install` 后，`pnpm run dev` 报错：

```
Error: Electron uninstall
```

根本原因：pnpm 的 store 是内容寻址的，electron 包 `node_modules/.pnpm/electron@{version}/node_modules/electron/dist/` 下的二进制文件（约 150MB）**不在 store 中**。当 pnpm 重新链接包目录时，`dist/` 为空，而 electron 自带的 `install.js`（依赖 `@electron/get` + `extract-zip`）在 pnpm 严格模式下经常因超时或模块查找失败而无法完成下载。

## 解决方案

### 1. 删掉 `.npmrc`，改用 `.pnpmrc`

`.npmrc` 中曾有一条 `electron_mirror` 配置指向 npmmirror。该配置删掉了，因为：

- pnpm 项目应该用 `.pnpmrc`
- 下载逻辑已内聚到独立脚本中，不需外部配置

### 2. `scripts/ensure-electron-binary.mjs`

该脚本在 `postinstall` 中运行（`package.json`）：

```jsonc
"postinstall": "node scripts/ensure-electron-binary.mjs && electron-builder install-app-deps && node scripts/copy-draco-wasm.mjs",
```

执行流程：

1. 在 pnpm 目录结构中定位 electron 包（硬编码 `electron@{version}` 路径 + 软链接备选）
2. 检测 `dist/` 下二进制文件是否存在、版本是否匹配
3. 如果缺失，先从系统缓存 `%LOCALAPPDATA%/electron/Cache/` 解压
4. 缓存不存在则从 `https://npmmirror.com/mirrors/electron/` 下载
5. 使用 PowerShell `Expand-Archive` 解压（不依赖 `extract-zip`）
6. 写入 `path.txt`（用 `writeFileSync`，不加换行符）

## 更新 Electron 版本

`scripts/ensure-electron-binary.mjs` 中有一处硬编码路径：

```js
join(rootDir, 'node_modules', '.pnpm', 'electron@42.3.3', 'node_modules', 'electron'),
```

升级 electron 时需要同步更新此处的版本号。建议按以下步骤操作：

1. 在 `package.json` 中修改 `devDependencies` 里的 `electron` 版本
2. 运行 `pnpm install`
3. 检查 `node_modules/.pnpm/` 下新版本的目录名（格式 `electron@{version}`）
4. 更新 `scripts/ensure-electron-binary.mjs` 中的路径。如果匹配规则是 `node_modules/.pnpm/electron@*/node_modules/electron` 更灵活，但当前是精确匹配
5. 运行 `node scripts/ensure-electron-binary.mjs` 验证安装
6. 运行 `pnpm run dev` 确认启动正常

### 简化建议

可以把硬编码路径改成自动扫描：

```js
function findElectronDir() {
  const pnpmDir = join(rootDir, 'node_modules', '.pnpm');
  const entries = readdirSync(pnpmDir);
  const match = entries.find(e => /^electron@\d+\.\d+\.\d+$/.test(e));
  if (match) {
    const dir = join(pnpmDir, match, 'node_modules', 'electron');
    const pkgPath = join(dir, 'package.json');
    if (existsSync(pkgPath)) {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      return { dir, version: pkg.version };
    }
  }
  return null;
}
```

但目前没改，保持显式精确匹配避免意外。

## 注意事项

1. **Windows 专有**：解压依赖 PowerShell `Expand-Archive`。macOS/Linux 需要改用 `unzip` 命令或 `extract-zip` npm 包
2. **镜像写死**：`npmmirror.com` 是中国镜像，境外网络下需要改成官方 GitHub releases URL
3. **path.txt 换行问题**：之前用 PowerShell `Set-Content` 写入时带上了 `\r\n`，导致 electron-vite spawn 时路径变为 `electron.exe\r\n`，报 `ENOENT`。脚本中用 `writeFileSync` 写入纯文本避开此问题
4. **缓存优先**：脚本优先从 `%LOCALAPPDATA%/electron/Cache/` 解压，文件已存在时直接跳过，不会产生额外网络开销

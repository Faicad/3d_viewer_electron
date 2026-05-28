# Release Process

## 前置条件

- 代码已合并到 `main` 分支
- `pnpm run ci` 全部通过（tsc + lint + vitest + playwright + build）
- 有 GitHub 仓库的 push 权限（用于推送 tag 和 release）

## 版本号规则

本项目使用 [Conventional Commits](https://www.conventionalcommits.org/) + `standard-version` 自动管理版本号。

版本号格式：`major.minor.patch`（如 `1.1.1`）

| 提交类型 | 版本号变化 | 示例 |
|----------|-----------|------|
| `fix: ...` | patch +1（1.1.0 → 1.1.1） | `fix: crash on STEP load` |
| `feat: ...` | minor +1（1.1.0 → 1.2.0） | `feat: add file associations` |
| `feat: ...\n\nBREAKING CHANGE: ...` | major +1（1.1.0 → 2.0.0） | 不兼容的 API 变更 |
| `docs:`, `style:`, `test:`, `chore:`, `perf:`, `refactor:` | 不 bump 版本 | 仅出现在 CHANGELOG |

`.versionrc` 中的配置决定哪些类型被显式记录到 CHANGELOG，哪些被隐藏。

## 发布流程

### 1. 确保分支干净

```bash
git checkout main
git pull origin main
git status          # 应该干净，没有未提交的变更
```

### 2. 运行 CI

```bash
pnpm run ci
```

必须全部通过才能继续。

### 3. 生成新版本号 + CHANGELOG

**自动 bump（推荐）**：由 commit 历史决定 bump 类型

```bash
pnpm run release
```

此命令会：
1. 根据自上次 tag 以来的 commit 类型 bump 版本号
2. 更新 `package.json` 中的 `version`
3. 生成/更新 `CHANGELOG.md`
4. 创建 git tag（如 `v1.2.0`）
5. 提交版本变更

**手动指定 bump 类型**（当自动逻辑不正确或需要手动干预时）：

```bash
pnpm run release:minor   # 强制 bump minor（1.1.1 → 1.2.0）
pnpm run release:major   # 强制 bump major（1.1.1 → 2.0.0）
```

要强制 bump patch（与 `pnpm run release` 行为相同）：

```bash
pnpm exec standard-version --release-as patch
```

**首次打版或预发布**：

```bash
pnpm exec standard-version --first-release    # 不打 tag，只更新 CHANGELOG
pnpm exec standard-version --prerelease beta  # 生成 1.2.0-beta.0
```

### 4. 推送 tag 和提交

```bash
git push --follow-tags origin main
```

`--follow-tags` 确保 tag 和提交一起被推送。

### 5. 打包

打包前，确认 `package.json` 中的 `version` 已经是新的版本号。

```bash
# Windows — NSIS 安装包 + 免安装目录
pnpm run build:win

# Windows — 仅免安装目录（调试用）
pnpm run build:unpacked

# Linux — AppImage + deb
pnpm run build:unpacked:linux

# macOS — DMG
pnpm run build:unpacked:mac
```

产物输出到 `dist/` 目录：

| 平台 | 产物 |
|------|------|
| Windows | `dist/3D Model Viewer Setup 1.2.0.exe` |
| Windows | `dist/win-unpacked/` |
| Linux | `dist/3D Model Viewer-1.2.0.AppImage` |
| Linux | `dist/3d-model-viewer_1.2.0_amd64.deb` |
| macOS | `dist/3D Model Viewer-1.2.0.dmg` |

### 6. 发布到 GitHub Releases（可选）

当前 `package.json` 中 `build.publish` 配置为 `"github"`。

设置 `GH_TOKEN` 环境变量（需要一个有 repo 权限的 GitHub Personal Access Token）：

```bash
export GH_TOKEN=ghp_xxxxxxxxxxxx
```

然后在打包时 electron-builder 会自动上传到 GitHub Releases：

```bash
# Windows 打包 + 自动发布到 GitHub Releases
pnpm run build:win
```

`standard-version` 创建的 tag（如 `v1.2.0`）会被 electron-builder 用作 release 名称。

## 版本历史

查看已发布的版本：

```bash
git tag --sort=-v:refname
```

查看某个版本包含的变更：

```bash
git log v1.1.0...v1.1.1 --oneline
```

## 快速参考

```bash
# 完整发布一个 patch 版本（Windows）
pnpm run ci                    # 1. 全量检查
pnpm run release               # 2. bump version + changelog + tag
git push --follow-tags origin main  # 3. 推送
pnpm run build:win             # 4. 打包（如需发布到 GitHub Releases 则先设置 GH_TOKEN）
```

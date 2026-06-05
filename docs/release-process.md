# Release Process

## 前置条件

- 代码已合并到 `main` 分支
- `pnpm run ci` 全部通过（tsc + lint + vitest + playwright + build）
- 有 GitHub 仓库的 push 权限（用于推送 tag 和 release）

## 发布原理

推送 `v*` tag 到 GitHub 后，`.github/workflows/release.yml` 会自动触发，在 **GitHub Actions** 上同时构建三个平台（Ubuntu / Windows / macOS）并将产物上传到 GitHub Releases。

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

`--follow-tags` 确保 tag 和提交一起被推送。此推送会触发 GitHub Actions 工作流。

### 5. 等待 GitHub Actions 自动构建

推送 tag 后，GitHub Actions 会自动执行 `release.yml` 工作流：

1. **同时构建** Linux / Windows / macOS 三个平台的安装包
2. 使用 `secrets.GITHUB_TOKEN`（自动提供）上传产物到 GitHub Releases
3. **自动发布 draft**（不再需要手动点发布）

可以在 [Actions 页面](https://github.com/faicad/3d_viewer_electron/actions) 查看构建进度。

构建完成后，访问 [Releases 页面](https://github.com/faicad/3d_viewer_electron/releases) 即可看到各平台的下载链接：

| 平台 | 产物 |
|------|------|
| Linux | `3D Model Viewer-{version}.AppImage` + `.deb` |
| Windows | `3D Model Viewer Setup {version}.exe` |
| macOS | `3D Model Viewer-{version}.dmg` |

### 6. 本地打包（仅调试用）

无需本地构建，但如果需要在本地调试打包：

```bash
# Windows — NSIS 安装包
pnpm run build:win

# Windows — 仅免安装目录（调试用）
pnpm run build:unpacked

# Linux — AppImage + deb
pnpm run build:unpacked:linux

# macOS — DMG
pnpm run build:unpacked:mac
```

产物输出到本地 `dist/` 目录。**不会**自动上传到 GitHub Releases，除非设置了 `GH_TOKEN` 环境变量。

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
# 完整发布一个版本（全平台）
git checkout main && git pull origin main  # 0. 拉取最新 main
pnpm run ci                    # 1. 全量检查
pnpm run release               # 2. bump version + changelog + tag
git push --follow-tags origin main  # 3. 推送 → GitHub Actions 自动构建并发布
```

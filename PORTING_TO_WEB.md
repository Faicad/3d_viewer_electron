# 移植文档：3D Viewer Electron → 纯 Web 项目

**源项目：** `3d_viewer_electron`  
**目标目录：** `../3d_viewer_ai`  
**移植目标：** 纯 Web 项目，可本地静态 HTML 运行，取消右侧文件缩略图和历史模型功能，文件打开改用 Web API。

---

## 关于 `file://` 协议的限制

本地 HTML 通过 `file://` 协议打开时，存在以下限制：

| API | `file://` 下是否可用 | 说明 |
|-----|---------------------|------|
| `<input type="file">` | ✅ 可用 | 用户手动选文件后读取 |
| `file.arrayBuffer()` | ✅ 可用 | File API 读取文件内容 |
| `fetch()` / XHR | ❌ 被 CORS 阻止 | 无法通过 `fetch` 加载本地资源 |
| `showOpenFilePicker()` | ❌ 需要安全上下文 | `file://` 不被认为是安全上下文 |
| `showDirectoryPicker()` | ❌ 需要安全上下文 | `file://` 下不可用 |
| Web Worker | ⚠️ Chrome 可用，Firefox 部分阻止 | 建议 Chrome 运行 |
| WASM | ⚠️ Chrome 可用，需测试 | 浏览器相关 |
| IndexedDB | ✅ 可用 | 缓存数据 |
| localStorage | ✅ 可用 | 本地数据存储 |

**结论：** 核心功能（通过 `<input type="file">` 选择并加载 3D 模型）在 `file://` 下可以正常工作。目录浏览（`showDirectoryPicker`）和 `fetch` 加载外部资源不可用。建议同时提供 `python -m http.server` 或 `npx serve` 等轻量服务器方案。

---

## 一、直接拷贝的文件（无需修改）

以下文件直接复制到目标目录 `../3d_viewer_ai/`，保持原路径结构。

### 1.1 根目录配置

| 文件 | 说明 |
|------|------|
| `.gitignore` | Git 忽略规则 |
| `.versionrc` | standard-version 配置（不必须但可保留） |
| `eslint.config.mjs` | ESLint 配置 |
| `tsconfig.json` | TypeScript 根配置（需移除 `references` 中的 `tsconfig.node.json`） |
| `tsconfig.web.json` | 渲染进程 TypeScript 配置 |
| `LICENSE` | LGPL-2.0-only 许可证 |

### 1.2 源文件 — 完整目录 `src/renderer/`

以下文件拷贝 **但保留**，部分需要调整（见第三章）：

```
src/renderer/
├── App.tsx
├── main.tsx
├── index.html              ✎ page title 改为 Web 标题
├── index.css
├── assets/
│   ├── react.svg
│   ├── vite.svg
│   └── hero.png
├── components/
│   ├── ErrorBoundary.tsx
│   ├── LoadingOverlay.tsx
│   ├── ModelInfoPanel.tsx
│   ├── OpenFileDialog.tsx
│   ├── CacheManager.tsx
│   ├── PartMaterialEditor.tsx
│   ├── ... (所有 ui/ 下的 shadcn 组件)
│   ├── panels/
│   │   ├── EnvironmentPanel.tsx    ✎
│   │   ├── MaterialEditor.tsx
│   │   ├── AnimationDialog.tsx
│   │   ├── GlbExtensionPanel.tsx
│   │   └── SvgLayerTree.tsx
│   ├── settings/
│   │   └── SettingsDialog.tsx      ✎
│   ├── __tests__/
│   │   └── CacheManager.test.tsx   ✎（需 mock 调整）
│   └── viewport/
│       ├── ViewportContainer.tsx
│       └── SvgWorkspace.tsx
├── config/
│   ├── file-formats.ts
│   └── file-formats.test.ts
├── engine/
│   ├── formatLoaders.ts            ✎
│   ├── loaderResultCache.ts
│   ├── components/
│   │   ├── ModelGroup.tsx
│   │   ├── SceneSetup.tsx          ✎
│   │   └── ...
│   ├── composer/
│   ├── environment/
│   ├── heatbed/
│   ├── hooks/
│   ├── material/
│   └── __tests__/
├── hooks/
│   ├── useFileLoader.ts            ✎（大幅调整）
│   ├── useFileUpload.ts            ✎（大幅调整）
│   └── useMediaQuery.ts
├── i18n/
│   ├── index.ts
│   └── locales/
├── layouts/
│   └── DesktopLayout.tsx           ✎（大幅调整）
├── lib/
│   ├── async-utils.ts
│   ├── bambu-3mf/                 （全部拷贝）
│   ├── dxf-to-svg/                （全部拷贝）
│   ├── file-meta.ts
│   ├── logger.ts                  ✎
│   ├── scene-tree-utils.ts
│   ├── step-converter/
│   │   ├── index.ts
│   │   ├── stepCache.ts
│   │   ├── stepToGlb.ts
│   │   ├── stepToGlbCached.ts
│   │   ├── stepWorkerPool.ts
│   │   ├── stepWorkerPool.ts
│   │   ├── GlbBuilder.ts
│   │   ├── occtLoader.ts
│   │   ├── topologyExt.ts
│   │   ├── preCache.ts            ✎
│   │   └── *.test.ts              （测试文件可拷贝）
│   ├── topology/
│   └── utils.ts
├── pages/
│   └── WorkspacePage.tsx           ✎
├── public/                        （全部静态资源）
│   ├── env/                       （HDR 环境贴图）
│   ├── wasm/                      （OCCT WASM 二进制）
│   └── step-worker.js             （STEP 转换 Worker）
├── stores/
│   ├── animation-store.ts
│   ├── engine-store.ts
│   ├── glb-extension-store.ts
│   ├── material-store.ts
│   ├── model-store.ts             ✎
│   ├── selection-store.ts
│   ├── svg-workspace-store.ts
│   ├── tool-store.ts
│   └── ui-store.ts                ✎
└── types/
    └── window.d.ts                ✎
```

### 1.3 测试数据

| 文件 | 说明 |
|------|------|
| `src/test/fixtures/` | 测试用 3D 模型文件 |
| `vitest.config.ts` | 单元测试配置 |
| `vitest.jsdom.config.ts` | jsdom 组件测试配置 |

### 1.4 文档

| 文件 | 说明 |
|------|------|
| `CLAUDE.md` | 项目说明（可保留供 AI 参考） |
| `CHANGELOG.md` | 变更日志 |

---

## 二、不拷贝的文件/目录

### 2.1 Electron 主进程和预加载脚本

```
electron/                       ← 整个目录，Web 不需要
├── main/index.ts               (Node.js + Electron API)
└── preload/index.ts            (contextBridge + ipcRenderer)
```

### 2.2 Electron 构建配置

| 文件 | 原因 |
|------|------|
| `electron.vite.config.ts` | Electron 三入口构建配置，替换为 `vite.config.ts` |
| `pnpm-workspace.yaml` | 仅声明了 electron 的 onlyBuiltDependencies |
| `.pnpmrc` | electron 国内镜像配置 |
| `playwright.config.ts` | E2E 测试框架，Web 版暂不需要 |

### 2.3 右侧文件缩略图相关（需求取消）

| 文件 | 原因 |
|------|------|
| `src/renderer/components/FileListPanel.tsx` | 右侧文件浏览+缩略图面板，完全依赖 Electron 文件系统 API |
| `src/renderer/lib/thumbnail-cache/` | **整个目录**：缩略图缓存、生成器、队列 |
| `src/renderer/lib/thumbnail-cache/thumbnailCache.ts` | 缩略图 IndexedDB 缓存 |
| `src/renderer/lib/thumbnail-cache/thumbnailGenerator.ts` | 3D/2D 缩略图 WebGL 渲染 |
| `src/renderer/lib/thumbnail-cache/thumbnailQueue.ts` | 后台缩略图队列（依赖 `electronAPI.readFile`） |
| `src/renderer/lib/thumbnail-cache/*.test.ts` | 对应的测试文件 |
| `src/renderer/lib/bambu-3mf/bambu-3mf.test.ts` | 引用了 `thumbnailGenerator` 的导入，需要移除或改写测试 |

### 2.4 历史模型功能相关（需求取消）

| 文件 | 原因 |
|------|------|
| `src/renderer/components/HistoryPanel.tsx` | 历史记录面板，完全依赖 Electron 文件路径 + readFile |
| `src/renderer/stores/history-store.ts` | 历史记录 Zustand store，持久化 localStorage |

### 2.5 Electron 打包相关

| 文件/目录 | 原因 |
|----------|------|
| `resources/` | 应用图标 (ico/icns/png)，只用于打包 |
| `dist/` | electron-builder 输出目录 |
| `out/` | electron-vite 构建输出 |
| `scripts/local-ci.mjs` | CI 脚本（electron-vite + playwright） |
| `scripts/ci.sh` | CI shell 脚本 |
| `scripts/ci.ps1` | CI PowerShell 脚本 |
| `scripts/ci-playwright.mjs` | Playwright CI |
| `scripts/capture-toolbar.mjs` | Electron 截图脚本 |
| `scripts/capture-screenshots.mjs` | 截图脚本 |
| `scripts/capture-format-screenshots.mjs` | 格式截图 |
| `scripts/capture-animation-demo.mjs` | 动画演示截图 |
| `scripts/capture-animation-fullscreen-demo.mjs` | 全屏动画截图 |
| `scripts/replace-step-topology.mjs` | Electron 相关替换 |
| `scripts/replace-step-topology-wsl.mjs` | WSL 相关替换 |
| `scripts/time_ci.sh.txt` | CI 计时 |
| `scripts/time_ci.ps1.txt` | CI 计时 |

### 2.6 测试相关

| 文件/目录 | 原因 |
|----------|------|
| `src/test/` | Playwright E2E 测试（全部），依赖 Electron |
| `ci-logs/` | CI 日志输出 |

### 2.7 文档站点

| 目录 | 原因 |
|------|------|
| `pages/` | VitePress 文档站点，与 Web 版核心项目无关 |
| `docs/` | 设计文档，非运行所需 |
| `HELP-DOCS-WORKFLOW.md` | 文档工作流说明 |

### 2.8 类型定义

| 文件 | 原因 |
|------|------|
| `src/renderer/types/electron.d.ts` | `window.electronAPI` 类型定义，Web 版不再需要 |
| `tsconfig.node.json` | Electron/Node 类型配置 |

### 2.9 Electron 相关的依赖和脚本

`package.json` 中：
- `main` 字段 `"./out/main/index.js"`（移除）
- `scripts` 中的 `dev`/`build`/`preview`（electron-vite 命令）
- `scripts` 中所有 `build:win`/`build:unpacked`/`build:unpacked:linux`/`build:unpacked:mac`
- `scripts` 中的 `postinstall`（electron-builder install-app-deps）
- `scripts` 中的 `test:e2e`/`test:e2e:docs`/`test:fast`
- `scripts` 中的 `ci`
- `scripts` 中的 `release`/`release:minor`/`release:major`
- `devDependencies` 中的 `electron`、`electron-builder`、`electron-vite`
- `devDependencies` 中的 `@playwright/test`
- `devDependencies` 中的 `@vitest/ui`（可选）
- `build` 字段（electron-builder 配置）
- `overrides` 字段（可选）
- `resolutions`（如果有）

---

## 三、拷贝后需要调整的文件

### 3.1 移除 Electron 相关 import 和调用

| 文件 | 调整内容 |
|------|---------|
| `src/renderer/stores/model-store.ts` | 移除 `import { useHistoryStore }`（L5）；移除 `addLoadedFile` 中对 `useHistoryStore.getState().addEntry(...)` 的调用（L436） |
| `src/renderer/stores/ui-store.ts` | 移除 `historyPanelOpen` 状态、`toggleHistoryPanel` 方法、以及相关的持久化逻辑 |
| `src/renderer/main.tsx` | 移除 `import` 中的 `generateSvgThumbnail`、`putThumbnail`（L13-L14）；移除 `window.__svgHelpers` 中的 `generateSvgThumbnail`、`putThumbnail`（L35-L36）；移除 `window.__svgFixtures = {}`（L31） |
| `src/renderer/lib/logger.ts` | 将 `window.env?.PROD` 替换为 `import.meta.env.PROD`；移除 `E2E` 判断 |
| `src/renderer/types/window.d.ts` | 移除 `__svgFixtures` 声明；移除 `__svgHelpers` 中的 `generateSvgThumbnail`、`putThumbnail`；确认 `electronAPI` 和 `env` 定义不再存在于 `Window` 接口中（electron.d.ts 已移除） |

### 3.2 DesktopLayout — 移除右侧面板和 Electron 功能

**文件：** `src/renderer/layouts/DesktopLayout.tsx`

调整内容：
- 移除 `FileListPanel` 和 `HistoryPanel` 的 import
- 移除 `useFileLoader` hook 的 `loadFilesFromDialog`（已经不需要）
- 移除右侧面板渲染代码（`ui.rightPanelOpen || ui.historyPanelOpen` 分支）
- 移除 `window.electronAPI.onFullscreenChanged` 监听
- 移除 `window.electronAPI.toggleFullscreen` 调用 → 改为 `document.documentElement.requestFullscreen()`
- 移除 `handleToggleFullscreen` 中的 `electronAPI` 调用
- 移除键盘导航中对 `window.electronAPI.readFile` 的调用（文件列表快捷键）
- 移除右键菜单中的 `window.electronAPI.showItemInFolder`
- 移除工具栏中的"History"按钮（Clock 图标）
- 移除 `handleOpenFile` 中调用 `loadFilesFromDialog` 的逻辑 → 改为触发 `<input type="file">`
- 移除 `fullscreen` 相关的事件和逻辑（或者改用 Web Fullscreen API）

### 3.3 WorkspacePage — 文件打开改为 Web API

**文件：** `src/renderer/pages/WorkspacePage.tsx`

调整内容：
- 移除 `import` 中的缩略图相关导入（`generateSvgThumbnail`、`putThumbnail`）
- 移除 `handleNativeOpenFile` 中的 `window.electronAPI` 判断 → 直接触发 `fileInputRef.current?.click()`
- 移除 `useEffect` 中 `window.electronAPI.getPendingFilePath()` 和 `window.electronAPI.onOpenExternalFile` 的监听
- `processFileLocally` 中所有 `window.electronAPI?.getFilePath(file) ?? file.name` → 统一改为 `file.name`
- 移除 `skipUpload` / `uploadFile` 相关逻辑（简化，统一使用 `processFileLocally`）

### 3.4 useFileLoader — 改为纯 Web 实现

**文件：** `src/renderer/hooks/useFileLoader.ts`

调整内容：
- 移除所有 `import` 中的缩略图相关代码（`generateThumbnailFromResult`、`generateSvgThumbnail`、`processEmbeddedThumbnail`、`putThumbnail`、`cacheKey`）
- 移除 `updateFolderForFile` 方法（依赖 `electronAPI.readDirectory`）
- `loadFilePath` 方法中：
  - 移除 `if (!window.electronAPI) return` 守卫
  - 文件读取改为接收 `ArrayBuffer` 参数（不再调用 `electronAPI.readFile`）
  - 移除所有缩略图生成和缓存的代码块
  - 移除 `skipFolderUpdate` 相关逻辑
  - 移除 `updateFolderForFile` 的调用
- `loadFilesFromDialog` 方法 — 整体移除（Web 版使用 `<input type="file">`）
- 函数签名调整：`loadFilePath` 不再接收文件路径字符串，改为接收 `(buffer: ArrayBuffer, fileName: string, ...)`

### 3.5 useFileUpload — 简化

**文件：** `src/renderer/hooks/useFileUpload.ts`

调整内容：
- 移除所有缩略图相关 import
- 移除所有 `window.electronAPI?.getFilePath(file)` → 改为 `file.name`
- 移除 `window.electronAPI` 目录扫描的代码块（L182-L228）
- 移除 `skipFolderUpdate` 相关逻辑
- 方法签名保持接收 `File` 对象不变

### 3.6 formatLoaders — GLTF 外部资源解析

**文件：** `src/renderer/engine/formatLoaders.ts`

调整内容：
- `gltfToGlb` 函数中：将 `window.electronAPI.readFileAsBase64` 改为 `fetch` 加载外部资源（或报错提示 Web 版不支持外部引用 GLTF）

### 3.7 SceneSetup — 环境贴图加载

**文件：** `src/renderer/engine/components/SceneSetup.tsx`

调整内容：
- 自定义环境贴图加载（L90）：将 `window.electronAPI.readFile(path)` 改为通过 URL 加载或 `fetch`（取决于实现方式）

### 3.8 EnvironmentPanel — 环境贴图对话框

**文件：** `src/renderer/components/panels/EnvironmentPanel.tsx`

调整内容：
- `handleLoadCustom` 中 `window.electronAPI.openEnvironmentMapDialog()` → 改为打开一个 `<input type="file" accept=".hdr,.exr">` 对话框

### 3.9 SettingsDialog — 版本号

**文件：** `src/renderer/components/settings/SettingsDialog.tsx`

调整内容：
- `window.electronAPI.getAppVersion()` → 改为从环境变量或硬编码字符串获取版本

### 3.10 preCache.ts — STEP 预缓存

**文件：** `src/renderer/lib/step-converter/preCache.ts`

调整内容：
- `window.electronAPI.readFile(file.path)`（L59） → 改为从内存缓存或外部传入的 `Map<string, ArrayBuffer>` 中获取文件数据

### 3.11 CacheManager — 移除缩略图引用

**文件：** `src/renderer/components/CacheManager.tsx`

调整内容：
- 移除 `import` 中来自 `thumbnailCache` 的 THUMB_CACHE_DB_NAME/THUMB_CACHE_DB_VERSION/THUMB_STORE_NAME
- 移除缩略图缓存清理相关的 UI 元素

### 3.12 index.html — 页面标题

**文件：** `src/renderer/index.html`

调整内容：
- `<title>` 从 "Faicad 3D Viewer" 改为 "3D Viewer"（或类似 Web 标题）
- 移除 Electron 相关的 meta 标签（如果有）

---

## 四、新增文件

### 4.1 `package.json`

重新编写，保留 React/Three.js/渲染相关依赖，移除 Electron 相关依赖。

```jsonc
{
  "name": "3d_viewer_ai",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "lint": "eslint .",
    "test:unit": "vitest run",
    "test:components": "vitest run --config vitest.jsdom.config.ts"
  },
  "dependencies": {
    // 保持所有 runtime dependencies 不变
  },
  "devDependencies": {
    // 移出 electron, electron-builder, electron-vite
    // 移出 @playwright/test
    // 保持 @vitejs/plugin-react, typescript, vitest 等
    "vite": "^6.0.0",
    "typescript": "~6.0.2",
    "@vitejs/plugin-react": "^4.5.2",
    "@tailwindcss/vite": "^4.2.4",
    "tailwindcss": "^4.3.0",
    "vitest": "^4.1.6",
    "eslint": "^10.4.0",
    // ...
  }
}
```

### 4.2 `vite.config.ts`

新配置文件，替代 `electron.vite.config.ts`：

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  root: path.resolve(__dirname, 'src/renderer'),
  base: './',  // 使用相对路径，支持 file:// 协议
  build: {
    outDir: path.resolve(__dirname, 'dist'),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src/renderer'),
    },
  },
})
```

### 4.3 新的文件打开模块（可选）

建议提取一个统一的 `useFileOpen.ts` hook，封装 `<input type="file">` 和 Web API 文件读取逻辑，供各处统一调用。

---

## 五、调整汇总表

| 类别 | 文件数 |
|------|--------|
| 直接拷贝的文件 | ~120+ |
| 不拷贝的文件/目录 | ~50+ |
| 拷贝后需要调整的文件 | ~15 |
| 新增文件 | ~3 |

### 调整难度分级

| 难度 | 文件 | 工作量 |
|------|------|--------|
| ★★★ | `useFileLoader.ts`、`useFileUpload.ts`、`DesktopLayout.tsx`、`WorkspacePage.tsx` | 大（核心逻辑重构） |
| ★★☆ | `model-store.ts`、`ui-store.ts`、`preCache.ts`、`SceneSetup.tsx`、`main.tsx` | 中（移除 import 和调用） |
| ★☆☆ | `SettingsDialog.tsx`、`EnvironmentPanel.tsx`、`formatLoaders.ts`、`logger.ts`、`CacheManager.tsx`、`window.d.ts`、`index.html` | 小（简单替换） |

---

## 六、移植后功能对位表

| 原功能 | 移植后 | 说明 |
|--------|--------|------|
| 文件菜单打开 | `<input type="file">` | 直接选择文件 |
| 目录浏览 | ❌ 移除 | 依赖 `readDirectory` + `FileListPanel` |
| 右侧文件缩略图 | ❌ 移除 | 需求要求取消 |
| 历史模型 | ❌ 移除 | 需求要求取消 |
| 文件拖放打开 | ✅ 保留 | `e.dataTransfer.files[0]` 纯 Web API |
| 剪贴板粘贴文件 | ✅ 保留 | `navigator.clipboard` |
| STEP/STP 转换 | ✅ 保留 | WASM Worker 不依赖 Electron |
| 3D 渲染 | ✅ 保留 | Three.js / R3F 纯 Web |
| SVG/DXF 工作区 | ✅ 保留 | 纯前端逻辑 |
| 环境贴图 | ⚠️ 改造 | HDR 文件通过 `<input type="file">` 加载 |
| 材质编辑 | ✅ 保留 | 纯前端逻辑 |
| 全屏 | ⚠️ 改造 | 改为 Web Fullscreen API |
| GLTF 外部资源 | ⚠️ 改造 | 改为 `fetch` 或报错 |
| 版本号 | ⚠️ 改造 | 硬编码 |
| 右键"打开所在文件夹" | ❌ 移除 | Web 无此能力 |
| 在浏览器中打开链接 | ✅ 保留 | `window.open(url, '_blank')` |
| 键盘文件浏览 | ❌ 移除 | 依赖 FileListPanel |

---

## 七、移植步骤建议

1. 创建 `../3d_viewer_ai/` 目录
2. 新增 `vite.config.ts` 和精简版 `package.json`
3. 拷贝所有无需修改的文件（第一部分）
4. 拷贝需要修改的文件，逐一按第三章进行调整
5. 不拷贝第二部分的文件/目录
6. 运行 `npm install` 安装依赖
7. 运行 `npm run dev` 验证功能
8. 运行 `npm run build` 构建生产版本
9. 测试 `file://` 协议下直接打开 `dist/index.html` 的效果

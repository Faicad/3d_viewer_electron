# Movie 模式右侧缩略图不显示问题分析与修复

## 问题现象

在 movie 模式下录制视频时，右侧 `FileListPanel` 面板不显示模型缩略图，只显示空状态提示文字。

---

## 前置：文件加载体系梳理

项目中存在多个名称相似的"加载文件"函数，容易混淆。以下按调用层级梳理清楚。

### IPC 层（main process ↔ renderer）

定义在 `electron/main/index.ts`，通过 `electron/preload/index.ts` 暴露到 `window.electronAPI`：

| IPC channel | preload 方法 | 作用 |
|---|---|---|
| `fs:readFile` | `electronAPI.readFile(path)` | 从磁盘读取文件，返回 `{ success, data: ArrayBuffer }` |
| `fs:readFileAsBase64` | `electronAPI.readFileAsBase64(path)` | 从磁盘读取文件，返回 base64 字符串 |
| `fs:readDirectory` | `electronAPI.readDirectory(dirPath)` | 列出目录下所有支持的 3D 文件，返回 `{ name, path, mtimeMs }[]` |

**`readFile` 是底层 IPC，只负责读字节，不涉及任何 store 操作。**

### executeCommand API 层（外部脚本 / postMessage / 测试调用）

定义在 `src/renderer/main.tsx`，通过 `window.__executeCommand(cmd, params)` 暴露到全局：

| 命令 | 行号 | 作用 | 数据来源 |
|---|---|---|---|
| **`loadFile`** | 733 | 从**本地磁盘路径**加载模型 | `electronAPI.readFile(filePath)` → IPC `fs:readFile` |
| **`loadModel`** | 643 | 从 **URL / data URL** 加载模型 | `fetch(url)` — 不走 Electron IPC |
| `generateScadModel` | 829 | 编译 OpenSCAD 代码并加载 | WASM 编译，不走 IPC |

### 调用方：谁在使用 `loadFile` 和 `loadModel`？

`loadFile` 命令**不是 movie 模式专用**，它被以下几方共同使用：

| 调用方 | 文件 | 说明 |
|---|---|---|
| **movie 录制脚本** | `movies/lib-electron.mjs:1421` | `recordOne()` 函数，通过 `page.evaluate` 注入调用 |
| **E2E 测试** | `src/test/poc-loadfile.spec.ts:26` | 测试 `loadFile` 命令本身的正确性 |
| **E2E 测试** | `src/test/poc-lib-electron.spec.ts:38` | 带视频录制的集成测试 |
| **postMessage / iframe 嵌入** | `src/renderer/main.tsx` 底部消息监听 | 外部页面通过 `postMessage` 发 `{ command: 'loadFile', ... }` |

`loadModel` 命令同样被多方使用：

| 调用方 | 说明 |
|---|---|
| **postMessage / iframe 嵌入** | 外部页面通过 `postMessage` 发送 model URL |
| **AI IPC 服务端** | AI 命令通过 IPC 转发加载模型 |

### UI 交互层（用户点击 / 拖放 / 键盘触发）

定义在 React hooks 和组件中：

| 函数 | 文件 | 行号 | 触发方式 | 数据来源 |
|---|---|---|---|---|
| **`loadFilePath`** | `useFileLoader.ts` | 55 | OS 文件关联、双击打开 | `electronAPI.readFile()` |
| **`loadFilesFromDialog`** | `useFileLoader.ts` | 239 | 工具栏「打开文件」按钮 | `electronAPI.openFileDialog()` → 批量 `loadFilePath` |
| **`uploadFile`** | `useFileUpload.ts` | 23 | 拖放、粘贴、`<input type="file">` | `file.arrayBuffer()`（浏览器 File API） |
| **键盘 Enter** | `DesktopLayout.tsx` | 674 | 在右侧文件列表按 Enter | `electronAPI.readFile(file.path)` |

### 层级关系图

```
┌─────────────────────────────────────────────────────┐
│  调用入口                                             │
│  ┌──────────┐ ┌──────────┐ ┌────────┐ ┌──────────┐ │
│  │ postMsg  │ │ E2E test │ │ movie  │ │ AI IPC   │ │
│  └────┬─────┘ └────┬─────┘ └───┬────┘ └────┬─────┘ │
│       └────────────┘           └────────────┘        │
│              │                      │                │
│              ▼                      ▼                │
│  window.__executeCommand()  window.__executeCommand()│
│       'loadModel'                'loadFile'          │
│       (URL→fetch)               (本地路径→IPC)        │
├─────────────────────────────────────────────────────┤
│  用户 UI 入口                                         │
│  ┌──────────┐ ┌──────────┐ ┌────────────────────┐   │
│  │ 打开文件  │ │ 拖放/粘贴│ │ 键盘 Enter(列表)    │   │
│  └────┬─────┘ └────┬─────┘ └────────┬───────────┘   │
│       ▼             ▼               ▼                │
│  loadFilesFromDialog  uploadFile   inline handler    │
│       │             │               │                │
│       └─────────────┴───────────────┘                │
│                    │                                  │
│                    ▼                                  │
│            electronAPI.readFile()                     │
│            (IPC: fs:readFile)                         │
├─────────────────────────────────────────────────────┤
│  Main Process (electron/main/index.ts)               │
│  ipcMain.handle('fs:readFile', ...)                  │
│  → fs.readFile() → ArrayBuffer                       │
└─────────────────────────────────────────────────────┘
```

### 命名对照表

| 名称 | 是什么 | 层级 |
|---|---|---|
| `fs:readFile` | IPC channel 名称 | main process |
| `electronAPI.readFile()` | preload 桥接方法 | preload |
| `loadFile` | executeCommand 的一个 case，参数是本地路径 | renderer (API 层) |
| `loadModel` | executeCommand 的一个 case，参数是 URL | renderer (API 层) |
| `loadFilePath()` | useFileLoader hook 的方法，UI 触发 | renderer (hooks) |
| `uploadFile()` | useFileUpload hook 的方法，拖放/粘贴 | renderer (hooks) |
| `loadFormat()` | 底层解析器，ArrayBuffer → meshes | renderer (engine) |

**容易混淆的点**：
- `electronAPI.readFile()` 只做磁盘 I/O，返回字节；`loadFile` 命令在 I/O 之上还做格式检测、STEP 转换、解析、store 更新。
- `loadFile` 和 `loadModel` 都是 executeCommand 的 case，区别仅在于数据来源（本地磁盘 vs 网络 URL）。
- `loadFilePath`（驼峰）是 UI hook，`loadFile`（驼峰但首字母小写）是命令名——两者完全独立。

---

## 根因分析

### 核心问题：`loadFile` 命令未填充 `folderFiles`

movie 模式通过 `main.tsx` 的 `loadFile` 命令加载模型（第 733–809 行）。其流程为：

1. ✅ 调用 `electronAPI.readFile(filePath)` 读取文件
2. ✅ 检测格式、STEP 转换、调用 `loadFormat()` 解析几何数据
3. ✅ 调用 `addLoadedFile()` 将文件加入 `loadedFiles`
4. ❌ **从未调用 `setFolderFiles()`**

而右侧面板 `FileListPanel` 完全依赖 `modelStore.folderFiles` 来渲染缩略图网格。在 `FileListPanel.tsx` 第 346–351 行：

```tsx
{folderFiles.length === 0 ? (
  <ScrollArea className="flex-1 p-4">
    <p className="text-xs text-muted-foreground text-center py-8">
      {currentFolderPath ? t('fileList.noModels') : t('fileList.empty')}
    </p>
  </ScrollArea>
) : (
  // ... 缩略图网格 + 缩略图队列
)}
```

由于 `folderFiles` 始终为空数组 `[]`：
- 第 142 行 `if (!enablePreview || folderFiles.length === 0)` 直接 `stopThumbnailQueue()` 并 return
- 缩略图队列永远不会启动
- 界面显示空状态提示文字，而非缩略图网格

### 对比：`loadFilePath`（UI hook）的正常流程

`useFileLoader.loadFilePath()`（`useFileLoader.ts` 第 55 行）在加载完成后会调用内部 helper `updateFolderForFile(filePath, name)`（第 222–224 行），该函数：

1. 从 `filePath` 提取父目录路径
2. 调用 `electronAPI.readDirectory(dirPath)` 读取目录内容
3. 调用 `setFolderFiles(dirPath, files)` 填充文件列表
4. 在列表中定位并选中当前文件（`setSelectedFileIndex`）
5. 若预览模式开启，启动 STEP 文件预缓存

`loadFile` 命令完全缺失这一段逻辑。

### 同样受影响的其他调用方

这个问题不仅影响 movie 模式。所有使用 `loadFile` / `loadModel` 命令的调用方都受影响：

- **postMessage / iframe 嵌入**：调用 `loadFile` 或 `loadModel` 后右侧面板同样为空
- **E2E 测试**：如果测试需要验证右侧面板，也会遇到同样问题
- **AI IPC**：通过 `loadModel` 加载 URL 模型后同样没有文件列表

> 注：`loadModel`（URL 加载）的修复更复杂，因为模型来自网络，没有"父目录"可读。对于这种情况，可能需要独立设计（例如不显示右侧面板，或者显示一个仅含当前模型的虚拟列表）。

### 次要问题：`mtimeMs` 不一致导致缓存键不匹配

即使修复了 `setFolderFiles` 问题，还存在缩略图缓存键不一致的隐患：

| 来源 | 缓存键格式 | `mtimeMs` 值 |
|---|---|---|
| `loadFile` 命令 | `${filePath}\|${mtimeMs}` | `Date.now()` — 当前时间戳（第 786 行） |
| `ViewportContainer.makeHandleParsed` | `${filePath}\|${file.mtimeMs}` | 继承 `loadFile` 设置的 `Date.now()`（第 546 行） |
| `readDirectory` → `folderFiles` | `${filePath}\|${mtimeMs}` | `fs.stat.mtimeMs` — 真实文件修改时间 |
| `FileListPanel` 缩略图查找 | `${filePath}\|${file.mtimeMs}` | 来自 `folderFiles`（真实 mtime） |

**影响**：`ViewportContainer` 在模型解析完成后生成的缩略图（缓存键使用 `Date.now()`）无法被 `FileListPanel` 命中（查找键使用真实 mtime），导致缩略图需要缩略图队列重新生成，造成重复工作和短暂闪烁。

---

## 修复方案

### 修改文件：`src/renderer/main.tsx`

在 `loadFile` 命令处理器中，`addLoadedFile` 调用之后，添加目录读取和 `setFolderFiles` 逻辑，与 `useFileLoader.updateFolderForFile` 保持一致。

**修改位置**：第 785–791 行附近（`addLoadedFile` 调用之后，`await new Promise(r => setTimeout(r, 100))` 之前）

**修改内容**：

```ts
useModelStore.getState().addLoadedFile({
  id: fileId, fileName, filePath: String(filePath), mtimeMs: Date.now(), buffer,
  format, sceneTree: [], glbPartInfos: [], modelCenteringOffset: null,
  sourceUnit: loadResult.sourceUnit ?? FORMAT_MAP[format].defaultUnit,
  fileGroup: FORMAT_MAP[format].group, loadingPhase: 'loading',
  bambuMetadata: loadResult.bambuMetadata, fileMeta,
})

// ── 新增：同步填充右侧文件列表面板 ──
const dirPath = String(filePath).slice(0, Math.max(
  String(filePath).lastIndexOf('/'),
  String(filePath).lastIndexOf('\\'),
))
try {
  const dirResult = await window.electronAPI.readDirectory(dirPath)
  if (dirResult.success && dirResult.files) {
    useModelStore.getState().setFolderFiles(dirPath, dirResult.files)
    const idx = dirResult.files.findIndex(f => f.name === fileName)
    if (idx !== -1) {
      useModelStore.getState().setSelectedFileIndex(idx)
    }
  }
} catch (e) {
  console.warn('[loadFile] Failed to read directory for file list:', e)
}

await new Promise(r => setTimeout(r, 100))
```

### 长期优化（建议单独 PR）

`loadFile` 使用 `mtimeMs: Date.now()` 会导致与 `readDirectory` 返回的真实文件修改时间不一致。建议：

1. 在 main process 的 `fs:readFile` IPC handler 中额外返回文件的 `mtimeMs`（通过 `fs.stat`）
2. `loadFile` 使用真实 `mtimeMs` 而非 `Date.now()`
3. 这样可以保证 `ViewportContainer.makeHandleParsed` 生成的缩略图缓存键与 `FileListPanel` 查找键完全一致，避免重复的缩略图生成

### `loadModel` 命令的特殊处理

`loadModel`（URL 加载）没有本地文件路径和父目录，无法调用 `readDirectory`。可考虑：

- 不填充 `folderFiles`，但隐藏右侧面板（当前已通过 `?embed=1` 参数处理）
- 或者构建仅含当前模型名称的虚拟文件列表

---

## 验证方法

1. 构建 unpacked 版本：`npm run build:unpacked`
2. 运行一个 movie 录制脚本，观察右侧面板是否显示文件列表和缩略图
3. 检查缩略图是否正确加载（非空状态提示）
4. 确认 `FileListPanel` 中当前加载的文件被正确高亮（`isCurrent` 样式生效）

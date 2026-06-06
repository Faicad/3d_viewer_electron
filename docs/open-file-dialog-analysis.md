# 统一两套"打开文件对话框"的实现

## 一、问题描述

项目中存在两个独立的"打开文件对话框"处理函数，做的是同一件事但实现不同：

| 函数 | 文件 | 行号 | 触发方式 |
|------|------|------|----------|
| `handleOpenFile` | `DesktopLayout.tsx` | 702-882 | 工具栏"打开文件"按钮 |
| `handleNativeOpenFile` | `WorkspacePage.tsx` | 178-236 | 空状态拖放区域点击 |

此外 `WorkspacePage` 内部还有一个 `loadFilePath` 辅助函数（行 43-176），被 `handleNativeOpenFile` 和 OS 文件关联（双击文件打开）共同使用。而 `DesktopLayout.handleOpenFile` 内联了全部加载逻辑，没有复用 `loadFilePath`。

## 二、逐项差异分析

### 2.1 文件夹更新方式 —— 核心差异

**DesktopLayout（✅ 正确）**：
```ts
// 行 876-881，在 for 循环加载完所有文件后显式调用
if (firstDirPath) {
  const dirResult = await window.electronAPI.readDirectory(firstDirPath)
  if (dirResult.success && dirResult.files) {
    useModelStore.getState().setFolderFiles(firstDirPath, dirResult.files)
  }
}
```
- 在加载循环结束后**显式调用**
- 只读一次目录
- 调用时机明确、可预测

**WorkspacePage（❌ 有问题）**：
```ts
// 行 265-273，在 useEffect 中延迟执行
useEffect(() => {
  for (const file of loadedFiles) {
    if (file.loadingPhase === 'done' && !postProcessedRef.current.has(file.id)) {
      // ...
      // Directory listing (deferred from loadFilePath)
      if (window.electronAPI) {
        const dirPath = file.filePath.slice(0, ...)
        window.electronAPI.readDirectory(dirPath).then((dirResult) => {
          if (dirResult.success && dirResult.files) {
            useModelStore.getState().setFolderFiles(dirPath, dirResult.files)
          }
        })
      }
    }
  }
}, [loadedFiles])
```
- 依赖 `loadingPhase === 'done'` 状态转换
- **每个**达到 done 状态的文件都会触发一次目录读取（而非批量）
- 调用时机间接、脆弱——如果 loadingPhase 的转换时机改变，文件夹更新就会出问题

**结论：以 DesktopLayout 为准，统一用显式调用。**

### 2.2 去重检查 `isFileLoaded`

- **DesktopLayout**：❌ 没有，每次打开对话框都重新加载
- **WorkspacePage**：✅ `loadFilePath` 开头有 `isFileLoaded(filePath)` 检查，已加载则跳过

**结论：保留 WorkspacePage 的去重逻辑。** 虽然"打开文件对话框"场景下用户通常不会重复选同一个文件，但 OS 文件关联场景（`onOpenExternalFile`）中文件可能已经打开了，去重有实际意义。

### 2.3 HDR/EXR 环境贴图支持

- **DesktopLayout**：❌ 不支持。分类时只有 `svgPaths` 和 `d3Paths`，HDR/EXR 会落入 `d3Paths`（3D 路径），到 `loadFormat` 时失败。
- **WorkspacePage**：✅ 支持。分类时分出 `envPaths`（hdr/exr），调用 `useEngineStore.getState().addCustomEnv(filePath, name)` 加载为自定义环境贴图。

**结论：保留 WorkspacePage 的 HDR/EXR 支持。** 这样工具栏"打开文件"按钮也能加载环境贴图。

### 2.4 缩略图生成时机

- **DesktopLayout**：✅ 内联生成（fire-and-forget）。加载完文件后直接调用 `generateThumbnailFromResult` 或 `generateSvgThumbnail`，不依赖外部状态。
- **WorkspacePage**：❌ 延迟生成。跟文件夹更新共用同一个 useEffect，等 `loadingPhase === 'done'` 时才通过 `getCachedResult` 取回 loadResult 生成缩略图。这意味着缩略图生成依赖 loadingPhase 状态转换和 loaderResultCache 中的数据未被清理。

**结论：以 DesktopLayout 为准，统一用内联生成。** 加载完就生成缩略图，不依赖后续状态变化。

### 2.5 缩略图缓存 key 格式

- **DesktopLayout**：✅ 使用 `cacheKey(filePath, loadTime)`（来自 `thumbnailCache.ts`），内部做了路径分隔符归一化（`\` → `/`）和时间戳截断。
- **WorkspacePage**：❌ 各处手动拼接 `` `${filePath}|${Date.now()}` `` 或 `` `${filePath}|${file.mtimeMs}` ``，没有路径归一化。

**结论：统一使用 `cacheKey(filePath, mtimeMs)`。** 路径归一化保证了同一文件在不同路径表示下命中缓存。

### 2.6 Store Reset 行为

- **DesktopLayout**（3D 路径）：reset model store **且**清空 SVG workspace（`setState({ files: [], selectedFileId: null })`）。
- **WorkspacePage.handleNativeOpenFile**（3D 路径）：只 reset model store，**没有**清空 SVG workspace。
- 两处 SVG 路径都只 reset model store。

**结论：以 DesktopLayout 为准，3D 路径同时清空 SVG workspace。** 否则从 SVG 模式切到 3D 模式时，SVG workspace 残留可能导致 UI 异常。

### 2.7 错误提示

- **DesktopLayout**：toast 信息包含文件名，如 `"Failed to read: ${fileName}"`、`t('error.modelEmpty', { fileName })`。
- **WorkspacePage**：toast 信息较简略，`"Load failed: " + String(e)`。

**结论：以 DesktopLayout 为准，保留含文件名的错误提示。**

### 2.8 STEP 转换的 progress 管理

- **DesktopLayout**：STEP 转换时 `showProgress`，成功后不立即 `hideProgress`，留给后面的"Loading xxx..."或最终 `hideProgress` 处理。catch 中 `hideProgress` + rethrow。
- **WorkspacePage**：STEP 转换在 finally 中 `hideProgress`。非 STEP 3D 文件的 progress 在 `loadFilePath` 中没有显式 `hideProgress`（依赖 store 的 loadingPhase 变化或其他机制）。

**结论：统一为 WorkspacePage 的 finally 模式（更安全，保证 progress 一定关闭），同时补上非 STEP 3D 文件的 `hideProgress`。**

### 2.9 loadFilePath 作为 OS 文件关联的共用函数

`WorkspacePage.loadFilePath` 不仅被 `handleNativeOpenFile` 调用，还被以下场景使用：
- `getPendingFilePath()`：应用通过命令行/文件关联启动时（行 283-287）
- `onOpenExternalFile()`：应用运行中通过 OS 打开文件时（行 290-293）

这些场景调用 `loadFilePath` **不经过** `handleNativeOpenFile` 的 store reset 逻辑，所以它们的行为是"追加文件到当前工作区"而非"清空后打开"。**这个行为需要保留**。但文件夹更新应该显式执行，而不是靠 useEffect。

### 2.10 加载后自动选中文件：`setSelectedFileIndex`

**只有 `useFileUpload.uploadFile` 做了这个操作**（`useFileUpload.ts:193`）：

```ts
useModelStore.getState().setFolderFiles(folderPath, result.files)
const idx = result.files.findIndex(f => f.name === file.name)
if (idx !== -1) {
  useModelStore.getState().setSelectedFileIndex(idx)
}
```

**`setSelectedFileIndex` 是什么**（`model-store.ts:376`）：
```ts
setSelectedFileIndex: (index) => set({ selectedFileIndex: index }),
```
它是 model-store 里的一个简单状态字段，表示用户在左侧文件列表中当前高亮/选中的文件索引。`FileListPanel` 组件读取这个值来渲染选中态样式，键盘上下键也会改变它。

**当前两个对话框的行为**：
- `DesktopLayout.handleOpenFile`：调用 `setFolderFiles` 但不调 `setSelectedFileIndex`。文件列表会出现，但没有文件被选中高亮。
- `WorkspacePage.handleNativeOpenFile`：`loadFilePath` 根本没调 `setFolderFiles`，靠 useEffect 延迟。同样没有 `setSelectedFileIndex`。

**结论：应统一加上。** 打开文件后自动在列表中选中它，这是合理的 UX 行为。`useFileUpload` 已经证明了这一点。

### 2.11 STEP 后台预缓存：`startPreCache`

**只有 `useFileUpload.uploadFile` 做了这个操作**（`useFileUpload.ts:196-198`）：

```ts
setTimeout(() => {
  startPreCache(result.files, '/wasm/occt-import-js.wasm')
}, 1000)
```

**`startPreCache` 是什么**（`lib/step-converter/preCache.ts:29`）：
- STEP 文件转 GLB 需要 WebAssembly OCCT 库，转换很慢（单个文件可能数秒）
- `startPreCache` 在后台遍历文件夹中所有 `.stp`/`.step` 文件
- 对每个文件：先查 IndexedDB 缓存，已缓存的跳过；未缓存的读取文件 → 后台转换 → 存入 IndexedDB
- 用户后续点击这些预缓存过的文件时，瞬间就能打开（命中缓存）
- 1 秒延迟是为了不阻塞当前文件的加载和首帧渲染

**前提条件**（参考 `FileListPanel.tsx:80`）：
```ts
if (!enablePreview || folderFiles.length === 0) return
```
- 只有用户开启了文件预览（`enablePreview`）时才执行预缓存
- 预览关闭时预缓存没有意义（看不到缩略图）

**当前两个对话框的行为**：
- `DesktopLayout.handleOpenFile`：没有调用 `startPreCache`
- `WorkspacePage.handleNativeOpenFile`：没有调用 `startPreCache`

**结论：应统一加上，但需满足前提条件。** 只在 `enablePreview` 为 true 时调度，延时改为 110ms（避免 1s 过长）：

### 2.12 差异汇总表

| 差异项 | DesktopLayout | WorkspacePage | useFileUpload | 以谁为准 |
|--------|:--:|:--:|:--:|------|
| 文件夹更新 | 显式 ✅ | useEffect ❌ | 显式 ✅ | **DesktopLayout** |
| 去重 `isFileLoaded` | ❌ | ✅ | ❌ | **WorkspacePage** |
| HDR/EXR 支持 | ❌ | ✅ | ❌ | **WorkspacePage** |
| 缩略图时机 | 内联 ✅ | useEffect ❌ | 内联 ✅ | **DesktopLayout** |
| 缓存 key | `cacheKey` ✅ | 手动拼接 ❌ | 手动拼接 ❌ | **DesktopLayout** |
| 3D 路径清 SVG workspace | ✅ | ❌ | ✅ | **DesktopLayout** |
| 错误提示含文件名 | ✅ | ❌ | ✅ | **DesktopLayout** |
| STEP progress finally | ❌ | ✅ | ❌ | **WorkspacePage** |
| `setSelectedFileIndex` | ❌ | ❌ | ✅ | **useFileUpload** |
| `startPreCache` | ❌ | ❌ | ✅ | **useFileUpload** |

## 三、修复方案

### 总体思路

提取 `loadFilePath` + 对话框分类/批量逻辑 → 新建 `useFileLoader` hook。两处调用方只做薄封装，委托给 hook。

### 步骤 1：新建 `src/renderer/hooks/useFileLoader.ts`

导出两个函数：

**`loadFilePath(filePath, fileName?)`** — 加载单个文件（整合 DesktopLayout 的显式风格 + WorkspacePage 的去重/HDR）：

1. 去重检查 `isFileLoaded(filePath)` → 已加载则 return
2. `detectFormat(name)` → 不支持则 toast + return
3. HDR/EXR → `addCustomEnv(filePath, name)` → return
4. `readFile` → STEP 转换 / SVG-DXF 解码 / 3D `loadFormat`
5. 缩略图内联生成（fire-and-forget），统一用 `cacheKey(filePath, mtimeMs)`
6. `addLoadedFile` 到 store
7. 错误处理：`ModelEmptyError` → `t('error.modelEmpty', { fileName })`，其他 → toast 含文件名
8. `hideProgress` 在 finally 中保证执行

**`loadFilesFromDialog()`** — 打开对话框 → 分类 → 批量加载（整合两处逻辑）：

1. `openFileDialog()`
2. 分类为 `svgPaths` / `d3Paths` / `envPaths`
3. 混合选择：3D 优先，跳过 SVG + env
4. Reset store：
   - 3D: `reset()` + `SvgWorkspaceStore.setState({ files: [], selectedFileId: null })`
   - SVG: `reset()`
   - env: 不 reset
5. for 循环调用 `loadFilePath(filePath, fileName)`
6. 显式更新文件夹（整合 DesktopLayout + useFileUpload）：
   `firstDirPath` → `readDirectory` → `setFolderFiles(firstDirPath, files)` → `setSelectedFileIndex(idx)`
   → 如果 `enablePreview` 为 true，`setTimeout(() => startPreCache(files, wasmPath), 110)`

### 步骤 2：修改 `WorkspacePage.tsx`

- 删除内联 `loadFilePath`（行 43-176）
- 删除 `handleNativeOpenFile`（行 178-236），改为薄封装：
  ```ts
  const handleNativeOpenFile = useCallback(async () => {
    if (!window.electronAPI) { fileInputRef.current?.click(); return }
    await loadFilesFromDialog()
  }, [loadFilesFromDialog])
  ```
- **删除延迟后处理 useEffect（行 239-276）及 postProcessedRef**——文件夹更新和缩略图都改为内联执行
- OS 文件关联监听改用 hook 的 `loadFilePath`
- 清理不再直接使用的 imports

### 步骤 3：修改 `DesktopLayout.tsx`

- 删除内联 `handleOpenFile`（行 702-882），改为委托：
  ```ts
  const { loadFilesFromDialog } = useFileLoader()
  const handleOpenFile = useCallback(async () => {
    await loadFilesFromDialog()
  }, [loadFilesFromDialog])
  ```
- 清理不再直接使用的 imports

### 步骤 4：更新测试 `desktop-layout.test.tsx`

新增 useFileLoader mock：
```ts
vi.mock('@/hooks/useFileLoader', () => ({
  useFileLoader: () => ({
    loadFilePath: vi.fn(),
    loadFilesFromDialog: vi.fn(),
  }),
}))
```

### 步骤 5：验证

```bash
npx vitest run      # 单元测试
npx tsc --noEmit    # 类型检查
node scripts/local-ci.mjs  # 完整 CI
```

手动验证：
- 工具栏按钮 → 选 3D 文件 → 文件列表填充
- 拖放区域点击 → 选 SVG → SVG 工作区展示
- OS 文件关联打开 → 仍正常
- 选 HDR/EXR → 加载为环境贴图（工具栏按钮新增能力）

## 四、收益总结

| 方面 | 修改前 | 修改后 |
|------|--------|--------|
| 文件夹更新 | DesktopLayout: 显式 ✅ / WorkspacePage: useEffect ❌ | 统一显式 |
| 去重 | 仅 WorkspacePage | 统一有 |
| HDR/EXR | 仅 WorkspacePage | 统一有 |
| 缩略图 | DesktopLayout: 内联 / WorkspacePage: useEffect 延迟 | 统一内联 |
| 缓存 key | 格式不统一 | 统一 `cacheKey(filePath, mtimeMs)` |
| 3D 路径清 SVG workspace | 仅 DesktopLayout | 统一清 |
| 错误提示含文件名 | 仅 DesktopLayout | 统一有 |
| STEP progress finally | 仅 WorkspacePage | 统一 finally |
| `setSelectedFileIndex` | 无 | 统一有（打开后自动选中文件） |
| `startPreCache` | 无 | 统一有（后台预缓存 STEP） |
| 重复代码行数 | ~260 行 | 0 行 |

# 移除全局 `sourceUnit` — 重构方案

## 问题

当前 `ModelStore` 有一个全局（根级别）字段 `sourceUnit: UnitSystem`，它在多文件模式下是"当前活跃文件单位"的镜像缓存，在单文件模式下则是唯一存储文件单位的地方。

这导致了一个架构缺陷：**unit 本应永远属于文件，却存在一个不属于任何文件的全局副本**。`ModelInfoPanel` 就是因此读错了 sourceUnit（第173行读了全局而非 per-file）。

## 根因分析

全局 `sourceUnit` 存在的原因是：**不是所有文件都进了 `loadedFiles`**。

| 载入方式 | 存储路径 | 文件有 unit 吗？ |
|----------|----------|-----------------|
| 工具栏 "Open File" 对话框 | `addLoadedFile` → `loadedFiles[]` | ✅ per-file |
| 文件关联 / 双击打开 | `addLoadedFile` → `loadedFiles[]` | ✅ per-file |
| FileListPanel 点击文件 | `addLoadedFile` → `loadedFiles[]` | ✅ per-file |
| **drag-drop 到 Workspace** | **`setModelBuffer` → 根字段** | **❌ 只能靠全局** |
| **<input type="file"> 选择** | **`setModelBuffer` → 根字段** | **❌ 只能靠全局** |

drag-drop 和文件输入走的 `processFileLocally`，对 3D 文件（非 SVG/DXF）不使用 `addLoadedFile`，而是写入 `modelBuffer`、`modelFormat`、`modelFilePath` 等根字段。ViewportContainer 检测到 `loadedFiles.length === 0` 时走"单文件渲染路径"，完全绕过 `loadedFiles`，导致没有 per-file 上下文来存储 unit。

## 方案：让所有文件都进 `loadedFiles`

关键改动只有 **`WorkspacePage.tsx` 中的 `processFileLocally`**，让 3D 文件（STEP 和非 STEP）走 `addLoadedFile` 而非 `setModelBuffer`。

### 改动 1：`WorkspacePage.tsx` — `processFileLocally`

#### 当前代码（第 315–388 行）

```
processFileLocally(file):
  rawBuffer = await file.arrayBuffer()

  if isStepFile:
    // STEP 转换...
    setModelBuffer(glbBuffer, 'glb')   ← 没有 fileId
  else if svg/dxf:
    addLoadedFile({ id: fileId, ... })   ← 正确
    return
  else:
    setModelBuffer(rawBuffer, format)    ← 没有 fileId
    setModelFilePath(filePath)

  setGLBUrl(file.name)                   ← 没有 fileId
```

#### 改为

```
processFileLocally(file):
  rawBuffer = await file.arrayBuffer()

  if isStepFile:
    // STEP 转换...
    addLoadedFile({ id: fileId, ..., sourceUnit: 'meter', format: 'glb', ... })
  else if svg/dxf:
    addLoadedFile({ id: fileId, ..., sourceUnit: 'millimeter', format: 'svg'/'dxf', ... })
    return
  else:
    addLoadedFile({
      id: fileId,
      fileName: file.name,
      filePath: filePath ?? file.name,
      mtimeMs: file.lastModified,
      buffer: rawBuffer,
      format,
      sourceUnit: FORMAT_MAP[format].defaultUnit,
      fileGroup: FORMAT_MAP[format].group,
      loadingPhase: 'loading',
      sceneTree: [],
      glbPartInfos: [],
      modelCenteringOffset: null,
    })
```

效果：drag-drop 的 3D 文件进入 `loadedFiles`，ViewportContainer 自动走多文件渲染路径，`ModelGroup` 获得 `fileId`，`onSourceUnitChange` 绑定到 `updateFileSourceUnit(file.id, ...)`。

### 改动 2：`model-store.ts` — 删除全局 `sourceUnit`

| 位置 | 删除内容 |
|------|----------|
| 接口第143行 | `sourceUnit: UnitSystem` |
| 接口第144行 | `setSourceUnit: (unit: UnitSystem) => void` |
| 实现第362行 | `setSourceUnit: (unit) => set({ sourceUnit: unit })` |
| 初始状态第305行 | `sourceUnit: 'millimeter'` |
| `syncActiveFileFields` 第275/289行 | 返回对象中删除 `sourceUnit` |
| `reset()` 第435行 | `sourceUnit: 'millimeter'` |
| `removeLoadedFile` 第473行 | `sourceUnit: 'millimeter'` |
| `updateFileSourceUnit` 第551-553行 | 条件同步逻辑 `{ sourceUnit: unit }` |

### 改动 3：`ViewportContainer.tsx` — 删除全局 `sourceUnit` 读取

**第 625-627 行：**
```ts
// 替换前
const sourceUnit: UnitSystem = fileId
  ? (modelStoreState.loadedFiles.find(f => f.id === fileId)?.sourceUnit ?? modelStoreState.sourceUnit)
  : modelStoreState.sourceUnit

// 替换后
const sourceUnit: UnitSystem = fileId
  ? (modelStoreState.loadedFiles.find(f => f.id === fileId)?.sourceUnit ?? 'millimeter')
  : 'millimeter'
```

分析：`fileId` 为 `undefined` 只在 `loadedFiles.length === 0` 时发生（空状态），此时没有模型，`sourceUnit` 的值不影响任何渲染。

**第 862 行——单文件路径 `onSourceUnitChange`：**
直接删除这个回调——单文件路径只在空状态使用，无内容可加载，无需设置 unit。

### 改动 4：`ModelInfoPanel.tsx` — 删除全局 sourceUnit fallback

```ts
// 替换前
const sourceUnit = activeFile?.sourceUnit ?? useModelStore.getState().sourceUnit

// 替换后
const sourceUnit = activeFile?.sourceUnit ?? 'millimeter'
```

`activeFile` 为 `undefined` 时没有文件加载，用 `'millimeter'` 作为安全的显示默认值。

### 改动 5：测试 / Mock

| 文件 | 改动 |
|------|------|
| `desktop-layout.test.tsx` | 从 mock store 中删除 `sourceUnit`、`setSourceUnit` |
| `scene-tree-optimization.test.tsx` | 同上 |
| `model-store.test.ts` | 新增的 3 个测试改为验证 per-file 独立性；删除关于全局 sourceUnit 同步的断言 |

## 影响分析

1. **功能无变化**：所有文件（无论哪种方式载入）都正常显示，unit 显示正确
2. **ViewportContainer 渲染路径归并**：`loadedFiles.length > 0` 分支覆盖所有有内容的场景，`loadedFiles.length === 0` 分支仅在初始空状态使用
3. **`modelGroupMapRef` key 统一**：不再有 `'__single__'` 这个特殊 key，所有文件都以 `file.id` 为 key
4. **复杂度降低**：删除约 10 行 store 定义 + 5 行同步逻辑 + 1 个回调绑定

## 不变的部分

- `modelBuffer`、`modelFormat`、`modelFilePath`、`glbUrl` 等根字段**保留**（`syncActiveFileFields` 仍然会设置它们，以保持与 `useFileUpload` 等其他入口的兼容）
- `ViewportContainer` 的单文件渲染分支**保留**（用于空状态占位，不会渲染实际模型）

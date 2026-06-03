# STL 启发式单位判断 — 显示未生效问题

## 链路总览

```
guessStlUnit → onSourceUnitChange → store.sourceUnit → rawToMM → heatbed 尺寸 / 界面显示
```

`guessStlUnit` 本身逻辑正确，能根据包围盒体积正确返回 `'inch'` / `'meter'` / `'millimeter'`。问题出在下游：**store 中的 `sourceUnit` 已正确更新，但显示管线未使用它**。

---

## Bug 1（关键）：`rawToMM` 硬编码为 1，忽略 `sourceUnit`

**文件**: `src/renderer/components/viewport/ViewportContainer.tsx` 第 616 行

```typescript
// 之前
const rawToMM = (fmt === 'glb' || fmt === 'gltf') ? 1000 : 1

// 之后
const sourceUnit = modelStoreState.sourceUnit
const rawToMM = UNIT_TO_MM[sourceUnit]
```

**后果**: STL 被检测为 inch 后，`sourceUnit = 'inch'`，但 `rawToMM` 始终 = 1（把 inch 坐标当 mm 用），热床选了最小号（200mm），模型溢出。

**影响范围**: 所有非 GLB 格式。实际上只有 STL 可能被检测为非 mm，其他格式的 `defaultUnit` 要么是 `'millimeter'`（→ rawToMM=1），要么是 `'meter'`（→ rawToMM=1000，仅 GLB），跟之前硬编码等价。

> **这个修复已在 ViewportContainer.tsx 中完成**, 见第 616-617 行。

---

## Bug 2：多文件模式下 `handleModelLoaded` 读的是活动文件的 `sourceUnit`，不是触发文件的

**文件**: `src/renderer/components/viewport/ViewportContainer.tsx` 第 563 行

```typescript
const handleModelLoaded = useCallback((box: THREE.Box3) => {
  // ...
  const sourceUnit = modelStoreState.sourceUnit   // 顶层字段，只反映活动文件
```

在多文件模式下，非活动 STL 文件的 `onLoaded` 触发时，`modelStoreState.sourceUnit` 是活动文件的单位，不是触发文件的。`updateFileSourceUnit` 只在 `fileId === activeFileId` 时同步到顶层。

**修复**: `handleModelLoaded` 接受可选 `fileId`，从 store 中查找该文件自己的 `sourceUnit`：

```typescript
// handleModelLoaded(box: THREE.Box3, fileId?: string)
const sourceUnit: UnitSystem = fileId
  ? (modelStoreState.loadedFiles.find(f => f.id === fileId)?.sourceUnit ?? modelStoreState.sourceUnit)
  : modelStoreState.sourceUnit
```

调用方传递 `file.id`：
```typescript
// 多文件路径
onLoaded={(box) => handleModelLoaded(box, file.id)}

// 单文件路径不变
onLoaded={handleModelLoaded}
```

> **这个修复已在 ViewportContainer.tsx 中完成**。

---

## Bug 3：多文件模式缺少 `onSourceUnitChange`

**文件**: `src/renderer/components/viewport/ViewportContainer.tsx` 第 809-816 行

多文件 `<ModelGroup>` 没有传 `onSourceUnitChange`。`guessStlUnit` 的结果无法写回 store。

**修复**: 已在第 818-820 行添加：
```typescript
onSourceUnitChange={(unit) =>
  useModelStore.getState().updateFileSourceUnit(file.id, unit as UnitSystem)
}
```

---

## Bug 4：热床 label 未随 auto-size 更新

**文件**: `src/renderer/engine/components/SceneSetup.tsx`

- 挂载时（第 297 行）调了 `heatbed.setLabel(...)` ✓
- 订阅回调中（第 336-343 行）调了 `setConfig()` 更新几何，**漏了 `setLabel()`** ✗

```typescript
// 订阅回调 — 当前代码
const sizeMM = state.bedSize * state.bedRawToMM
singleHeatbedRef.current?.setConfig({
  dimensions: squareBedDimensions(state.bedSize),
  gridStep: calculateGridStep(squareBedDimensions(sizeMM)) * (1 / state.bedRawToMM),
})
// ← 缺了 setLabel()
```

**修复**: `setConfig()` 之后追加：
```typescript
singleHeatbedRef.current?.setLabel(`${Math.round(sizeMM)} × ${Math.round(sizeMM)} mm`)
```

**待实现。**

---

## Bug 5：`bedSize` 和 `bedRawToMM` 分两次 zustand set，中间态触发错误的订阅回调

**文件**: `src/renderer/components/viewport/ViewportContainer.tsx` 第 620-622 行

```typescript
store2.setBedSize(autoSize)      // set #1 → 订阅看到 newSize × oldRawToMM
store2.setBedRawToMM(rawToMM)    // set #2 → 订阅看到 newSize × newRawToMM
```

`setBedSize` 和 `setBedRawToMM` 是 engine-store 上两个独立的 action（各调一次 `set()`）。SceneSetup 订阅 `bedSize`/`bedRawToMM` 变更，会在两次 set 之间看到中间态。

**修复**: 用一次 `setState` 原子更新两个字段：

```typescript
// 之前
store2.setBedSize(autoSize)
store2.setBedRawToMM(rawToMM)

// 之后
useEngineStore.setState({ bedSize: autoSize, bedRawToMM: rawToMM })
```

**待实现。**

---

## 总结

| Bug | 文件 | 状态 |
|-----|------|------|
| 1. `rawToMM` 硬编码 1 | `ViewportContainer.tsx` | ✅ 已修复 |
| 2. 多文件读错 sourceUnit | `ViewportContainer.tsx` | ✅ 已修复 |
| 3. 多文件缺 `onSourceUnitChange` | `ViewportContainer.tsx` | ✅ 已修复 |
| 4. 热床 label 不更新 | `SceneSetup.tsx` | ❌ 待修复 |
| 5. bedSize/bedRawToMM 非原子更新 | `ViewportContainer.tsx` | ❌ 待修复 |

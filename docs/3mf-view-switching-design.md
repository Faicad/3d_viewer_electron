# 打印/装配/导入 三视图切换功能设计

> **变更记录**
>
> | 日期 | 变更 |
> |---|---|
> | 2026-06-03 | 修正 `mat4From12Values` 的 `set()` 参数顺序（`v[0],v[1],v[2],v[9]` → `v[0],v[3],v[6],v[9]`）；修正 `mat4From16Values` 从 `fromArray` 改为 `set` 行主序。实际实现编码时已采用正确版本，文档后补。详见下文 §11。 |

## 1. 功能概述

为 Bambu Lab 3MF 文件提供三种空间位置的切换查看能力，让用户能直观看到零件在**打印排版**、**装配堆叠**、**原始导入**三种坐标系下的布局差异。

---

## 2. 三种视图定义

| 视图 | 显示内容 | 数据来源 | 效果 |
|---|---|---|---|
| **打印视图 (Print)** | 零件在打印平台上的排版位置 | `<build><item transform>` | 当前已有行为，含自动排版后的 XY 偏移 + Z 抬升，按 plate 分盘居中 |
| **装配视图 (Assembly)** | 零件在最终组装体中的理想相对位置 | `<assemble_item transform>` + `offset` | 零件按 Z 轴堆叠，XY 居中对齐，可看到装配顺序和高度差 |
| **导入视图 (Import)** | 原始 STL/STEP 导入时的位置 | `<part><metadata key="matrix">` + `source_offset` | 展示每个 part 在原始 CAD 空间中的位置，parts 可能分散或重叠 |

**约束**：仅 Bambu Lab 3MF 文件具有上述三种元数据；普通 3MF 文件只有打印视图可用。

---

## 3. 数学原理

### 3.1 当前变换链

ThreeMFLoader 为每个 mesh 计算的世界矩阵：

```
M_world = M_build_item × M_component
         ↑ object 级      ↑ part 级
         打印排版位置      sub-part 内部组装
```

当前 `ModelGroup.tsx` 将其烘焙到几何体：

```typescript
src.updateWorldMatrix(true, false)
geo.applyMatrix4(src.matrixWorld)   // v' = M_world · v
src.position.set(0, 0, 0)
```

### 3.2 视图切换的 Delta 计算

目标：保留 `M_component` 不变，替换 `M_build_item` 为目标视图的变换。

```
M_current = M_build_item × M_component    ← 当前烘焙后的几何体
M_target  = M_view_item   × M_component   ← 目标视图

Delta = M_target × M_current⁻¹
      = (M_view_item × M_component) × (M_build_item × M_component)⁻¹
      = M_view_item × M_component × M_component⁻¹ × M_build_item⁻¹
      = M_view_item × M_build_item⁻¹               ← M_component 抵消！
```

**结论**：Delta 只与两个 object 级变换有关，与内部 component 变换无关。对每个 mesh 应用 `geo.applyMatrix4(Delta)` 即可切换到目标视图。

### 3.3 三组变换的 Delta 公式

| 切换方向 | Delta 矩阵 |
|---|---|
| 打印 → 装配 | `M_assemble_item × M_build_item⁻¹` |
| 打印 → 导入 | `M_import_part × M_build_item⁻¹` |
| 装配 → 打印 | `M_build_item × M_assemble_item⁻¹` |
| 装配 → 导入 | `M_import_part × M_assemble_item⁻¹` |

其中 `M_import_part` 从 `<part><metadata key="matrix">` 解析为 4×4 矩阵，并结合 `source_offset` 平移。

---

## 4. 数据解析扩展

### 4.1 新增数据类型

在 `bambu-3mf.ts` 中添加：

```typescript
/** 装配项变换（来自 model_settings.config <assemble_item>） */
export interface AssembleItemTransform {
  objectId: string
  transform: number[]   // 4×3 矩阵，12 个值，同 <build><item transform> 格式
  offset: [number, number, number]  // 额外微调平移
}

/** Part 级导入变换（来自 model_settings.config <part><metadata key="matrix">） */
export interface PartImportTransform {
  objectId: string
  partId: string
  matrix: number[]      // 4×4 矩阵，16 个值
  sourceOffset: [number, number, number]  // source_offset_x/y/z
}
```

在 `Bambu3mfMetadata` 中新增字段：

```typescript
export interface Bambu3mfMetadata {
  // ... 现有字段
  assembleTransforms: Map<string, AssembleItemTransform>     // key = objectId
  importTransforms: Map<string, PartImportTransform>          // key = "objectId:partId"
}
```

### 4.2 解析逻辑

在 `parseBambu3mf()` 的 Phase 2（`model_settings.config` 解析）中增加：

**解析 `<assemble>` 块**：

```typescript
// 正则提取 <assemble_item> 元素
const assembleRe = /<assemble_item\s+([^>]*)\/?>/gi
while ((match = assembleRe.exec(xml)) !== null) {
  const attrs = match[1]
  const objectId = extractAttr(attrs, 'object_id')
  const transform = extractAttr(attrs, 'transform')  // 12 个数值
  const offset = extractAttr(attrs, 'offset')          // "x y z"
  assembleTransforms.set(objectId, { objectId, transform, offset })
}
```

**解析 `<part>` 中的 matrix 元数据**（在现有 part 解析循环中扩展）：

```typescript
// 现有代码已遍历 <part id="X">...</part>
// 在其内部 metadata 中额外提取 key="matrix" 和 source_offset_x/y/z
let matrix: number[] | undefined
let sox = 0, soy = 0, soz = 0
const metaRe = /<metadata\s+key="([^"]*)"\s+value="([^"]*)"\s*\/?>/gi
while ((mm = metaRe.exec(partBody)) !== null) {
  if (mm[1] === 'matrix') matrix = mm[2].split(/\s+/).map(Number)
  if (mm[1] === 'source_offset_x') sox = parseFloat(mm[2])
  if (mm[1] === 'source_offset_y') soy = parseFloat(mm[2])
  if (mm[1] === 'source_offset_z') soz = parseFloat(mm[2])
}
if (matrix) {
  importTransforms.set(`${objectId}:${partId}`, {
    objectId, partId, matrix, sourceOffset: [sox, soy, soz]
  })
}
```

---

## 5. 视图切换实现

### 5.1 状态管理

在 `engine-store.ts`（或 `model-store.ts`）中新增：

```typescript
type ViewMode = 'print' | 'assembly' | 'import'

interface EngineState {
  // ... 现有状态
  viewMode: ViewMode
  setViewMode: (mode: ViewMode) => void
}
```

初始值为 `'print'`，切换时触发 3MF 重新加载。

### 5.2 ModelGroup 中的加载逻辑变更

当前加载流程（`ModelGroup.tsx` useEffect）：

```
loadFormat(buffer, '3mf')
  → ThreeMFLoader.parse(buffer)        // 产生带 build 变换的世界矩阵
  → geo.applyMatrix4(src.matrixWorld)  // 烘焙到几何体
  → 居中 / 分盘
```

新流程：

```
loadFormat(buffer, '3mf')
  → ThreeMFLoader.parse(buffer)          // 产生带 build 变换的世界矩阵
  → geo.applyMatrix4(src.matrixWorld)    // 烘焙（保持向后兼容）
  → if (viewMode !== 'print' && bambuMeta) {
      const delta = computeViewDelta(viewMode, bambuMeta, partInfos[i])
      if (delta) geo.applyMatrix4(delta)  // 切换到目标视图
    }
  → 居中 / 分盘
```

`computeViewDelta` 函数：

```typescript
function computeViewDelta(
  viewMode: ViewMode,
  bambuMeta: Bambu3mfMetadata,
  partInfo: GlbPartInfo,
): THREE.Matrix4 | null {
  const objectId = partInfo.objectId
  if (!objectId) return null

  // 从 bambuMeta 的 buildItems 中查找当前 object 的 build transform
  const buildItem = bambuMeta.buildItems?.find(b => b.objectId === objectId)
  const buildMatrix = buildItem?.transform
    ? mat4From12Values(buildItem.transform)
    : new THREE.Matrix4().identity()

  if (viewMode === 'assembly') {
    const assembleItem = bambuMeta.assembleTransforms?.get(objectId)
    if (!assembleItem) return null
    const assembleMatrix = mat4From12Values(assembleItem.transform)
    // apply offset as translation
    assembleMatrix.multiply(makeTranslationMatrix(assembleItem.offset))
    // delta = M_assemble × M_build⁻¹
    return assembleMatrix.multiply(buildMatrix.clone().invert())
  }

  if (viewMode === 'import') {
    const partId = partInfo.partId ?? '0'
    const importItem = bambuMeta.importTransforms?.get(`${objectId}:${partId}`)
    if (!importItem) return null
    const importMatrix = mat4From16Values(importItem.matrix)
    // apply source_offset
    importMatrix.multiply(makeTranslationMatrix(importItem.sourceOffset))
    // delta = M_import × M_build⁻¹
    return importMatrix.multiply(buildMatrix.clone().invert())
  }

  return null  // print view: no change
}
```

### 5.3 Mesh → Object ID 映射

需要 `GlbPartInfo` 携带 `objectId`，以便在 ModelGroup 中将每个 mesh 匹配到对应的变换。

在 `GlbPartInfo` 中新增可选字段：

```typescript
export interface GlbPartInfo {
  // ... 现有字段
  objectId?: string   // 3MF object ID，仅 Bambu 3MF 文件有此值
}
```

在 `bambu-3mf.ts` 构建 flat parts 列表时，`BambuPartMeta` 已有 `objectId`，将其同步到 `GlbPartInfo` 即可。

### 5.4 Matrix 工具函数

```typescript
/** 12 值（列主序）→ THREE.Matrix4
 *
 *  3MF XML 存储 12 个值，按列主序排列：
 *    col0: [v0, v1, v2], col1: [v3, v4, v5],
 *    col2: [v6, v7, v8], col3: [v9, v10, v11] (translation)
 *  THREE.Matrix4.set() 接受行主序参数，因此将行列互换传入以完成转置。
 */
function mat4From12Values(v: number[]): THREE.Matrix4 {
  return new THREE.Matrix4().set(
    v[0], v[3], v[6], v[9],
    v[1], v[4], v[7], v[10],
    v[2], v[5], v[8], v[11],
    0, 0, 0, 1,
  )
}

/** 16 值（行主序）→ THREE.Matrix4
 *
 *  Bambu <part metadata key="matrix"> 的 16 个值按行主序排列，
 *  直接传入 set() 即可（set() 参数为行主序）。
 */
function mat4From16Values(v: number[]): THREE.Matrix4 {
  return new THREE.Matrix4().set(
    v[0], v[1], v[2], v[3],
    v[4], v[5], v[6], v[7],
    v[8], v[9], v[10], v[11],
    v[12], v[13], v[14], v[15],
  )
}

/** 平移向量 → THREE.Matrix4 */
function makeTranslationMatrix(t: [number, number, number]): THREE.Matrix4 {
  return new THREE.Matrix4().makeTranslation(t[0], t[1], t[2])
}
```

---

## 6. UI 设计

### 6.1 交互方式

视图切换放在**场景树的文件级右键菜单**中。用户在场景树中右键点击一个 3MF 文件名，如果该文件拥有三种视图的数据，则菜单中展示三个视图选项，当前视图前加 ✓ 标记。

### 6.2 右键菜单效果

```
▶ screw holder.stl
▶ vise body.stl
▶ vise.3mf                     ← 右键
  ┌─────────────────────────┐
  │ ✓ Print View  (default) │  ← 当前为 Print
  │   Assembly View         │
  │   Import View           │
  ├─────────────────────────┤
  │   Copy File Path        │
  └─────────────────────────┘
```

- **Print View** — 始终显示（所有 3MF 都有 `<build>`）
- **Assembly View** — 仅当 `bambuMetadata.assembleTransforms` 非空时显示
- **Import View** — 仅当 `bambuMetadata.importTransforms` 非空时显示
- 当前所在视图前显示 ✓
- 点击任一视图项后关闭菜单，更新 store 的 `viewMode`，触发 ModelGroup 重新处理变换并居中

### 6.3 现有代码集成点

在 `DesktopLayout.tsx` 的 `handleFileContextMenu` 中，新增 3MF / Bambu 分支：

```typescript
// 在 handleFileContextMenu 的 items 构建中：
const isBambu3mf = file?.format === '3mf' && file?.bambuMetadata
const hasAssemble = isBambu3mf && file!.bambuMetadata!.assembleTransforms?.size > 0
const hasImport = isBambu3mf && file!.bambuMetadata!.importTransforms?.size > 0
const currentView = useEngineStore.getState().viewMode

if (isBambu3mf) {
  // separator
  items.push({ type: 'separator' })

  items.push({
    label: (currentView === 'print' ? '✓ ' : '') + 'Print View',
    action: () => {
      useEngineStore.getState().setViewMode('print')
    },
    disabled: currentView === 'print',
  })
  if (hasAssemble) {
    items.push({
      label: (currentView === 'assembly' ? '✓ ' : '') + 'Assembly View',
      action: () => {
        useEngineStore.getState().setViewMode('assembly')
      },
      disabled: currentView === 'assembly',
    })
  }
  if (hasImport) {
    items.push({
      label: (currentView === 'import' ? '✓ ' : '') + 'Import View',
      action: () => {
        useEngineStore.getState().setViewMode('import')
      },
      disabled: currentView === 'import',
    })
  }
}
```

### 6.4 ContextMenuItemDef 扩展

当前 `ContextMenuItemDef` 不支持分隔线。需新增 `type` 字段：

```typescript
export interface ContextMenuItemDef {
  type?: 'normal' | 'separator'
  label?: string              // separator 时无需 label
  icon?: React.ComponentType<{ className?: string }>
  action?: () => void         // separator 时无 action
  disabled?: boolean
  danger?: boolean
}
```

`ContextMenu.tsx` 渲染时对 `type === 'separator'` 的项渲染 `<hr>` 而非 `<button>`。

### 6.5 切换动画

可选：使用 `THREE.Tween` 或 R3F 的 `useSpring` 做平滑矩阵插值。MVP 阶段可直接跳转。

---

## 7. 居中策略

三种视图的包围盒中心不同，需要重新计算居中偏置：

| 视图 | 包围盒特征 | 居中方式 |
|---|---|---|
| Print | 多 plate 分立 | 按 plate 居中 + grid 排布 |
| Assembly | 所有零件聚集在原点附近 | 整体居中，Z 朝上 |
| Import | 零件分散（原始 CAD 空间） | 整体居中 |

**建议**：每种视图独立计算 `modelCenteringOffset`，存在 `LoadedFileModel` 的 view 相关字段中。切换视图时更新包围盒并触发 `CameraControls` 的 `fitToBox`。

---

## 8. 文件变更清单

| 文件 | 变更 |
|---|---|
| `bambu-3mf.ts` | 新增 `AssembleItemTransform`, `PartImportTransform` 类型；`Bambu3mfMetadata` 新增 `assembleTransforms`, `importTransforms` 字段；`parseBambu3mf()` 增加 `<assemble>` 和 `<part>` matrix 解析 |
| `model-store.ts` | `GlbPartInfo` 新增 `objectId?` |
| `engine-store.ts` | 新增 `viewMode: ViewMode` 状态 + `setViewMode` action |
| `formatLoaders.ts` | 在 `LoaderResult` 中透传 `assembleTransforms` / `importTransforms` |
| `ModelGroup.tsx` | 新增 `viewMode` prop；在 bake 步骤后根据 view mode 应用 Delta 矩阵；变换数据透传到 `GlbPartInfo.objectId` |
| `DesktopLayout.tsx` | 在 `handleFileContextMenu` 中添加 3MF 视图切换菜单项；判断 `bambuMetadata.hasAssemble` / `hasImport` 动态显示 |
| `ContextMenu.tsx` | `ContextMenuItemDef` 增加 `type?: 'normal' \| 'separator'`；渲染时支持分隔线 |

---

## 9. 边界情况与注意事项

1. **非 Bambu 3MF**：无 `assembleTransforms` / `importTransforms`，视图模式固定为 print，控件隐藏或置灰
2. **缺失部分变换**：某个 object 只有 build 没有 assemble → fallback 到 build 变换
3. **Part 与 Object 的粒度差异**：import 视图是 per-part 的，而 print/assembly 是 per-object 的；切换时需处理同一个 object 下多个 part 各自独立变换
4. **旋转兼容性**：`M_component` 的抵消成立的前提是 item 级和 component 级的矩阵乘法顺序符合预期。如果 ThreeMFLoader 场景图结构与假设不符，需要反向调试确认
5. **多 plate 文件**：assembly/import 视图应合并所有 plate 的零件到同一空间，不按 plate 分开展示
6. **缩放/镜像**：Delta 矩阵支持任意仿射变换（缩放、错切、镜像），不需要额外处理
7. **缓存失效**：切换视图后 loaderResultCache 应失效或按 `(fileId + viewMode)` 组合缓存

---

## 10. 实现步骤（建议顺序）

1. **Step 1** — 在 `bambu-3mf.ts` 中解析 `<assemble_item>` 和 `<part>` matrix，新增数据类型，确保单元测试覆盖
2. **Step 2** — `GlbPartInfo` 增加 `objectId`，在 flat parts 列表构建时注入
3. **Step 3** — 实现 `computeViewDelta` 函数和矩阵工具函数
4. **Step 4** — store 新增 `viewMode` 状态 + `setViewMode` action
5. **Step 5** — `ModelGroup.tsx` 接入 view mode prop，在 bake 步骤后应用 Delta
6. **Step 6** — `ContextMenu.tsx` 扩展 `ContextMenuItemDef` 支持分隔线
7. **Step 7** — `DesktopLayout.tsx` `handleFileContextMenu` 添加 3MF 视图切换菜单项
8. **Step 8** — 处理居中策略、camera fitToBox、非 Bambu 文件隐藏菜单项

---

## 11. 矩阵处理验证与修正

> 本节对比设计文档与实际实现 `viewTransforms.ts` 之间的矩阵处理差异，并与 lib3mf-rs（Rust 3MF 格式库）及 3MF 规范交叉验证。

### 11.1 `mat4From12Values` — 设计文档 vs 实际代码

#### 设计文档原始版本（有误）

```typescript
// 原 §5.4
function mat4From12Values(v: number[]): THREE.Matrix4 {
  return new THREE.Matrix4().set(
    v[0], v[1], v[2], v[9],   // 行 0: m00, m01, m02, m30
    v[3], v[4], v[5], v[10],  // 行 1: m10, m11, m12, m31
    v[6], v[7], v[8], v[11],  // 行 2: m20, m21, m22, m32
    0, 0, 0, 1,
  )
}
```

将输入按行主序直接填入 `set()`，产生的数学矩阵（列向量变换 `v' = M × v`）：

```
| m00  m01  m02  m30 |
| m10  m11  m12  m31 |
| m20  m21  m22  m32 |
|  0    0    0    1  |
```

计算结果：
```
x' = m00·x + m01·y + m02·z + m30
y' = m10·x + m11·y + m12·z + m31
z' = m20·x + m21·y + m22·z + m32
```

#### 实际代码（正确）

```typescript
// viewTransforms.ts:16-23
export function mat4From12Values(v: number[]): THREE.Matrix4 {
  // 输入按列主序解释：col0=[v0,v1,v2], col1=[v3,v4,v5],
  // col2=[v6,v7,v8], col3=[v9,v10,v11] (translation)
  // set() 接受行主序，行列互换完成转置
  return new THREE.Matrix4().set(
    v[0], v[3], v[6], v[9],
    v[1], v[4], v[7], v[10],
    v[2], v[5], v[8], v[11],
    0, 0, 0, 1,
  )
}
```

产生的数学矩阵：

```
|  a   d   g  tx |
|  b   e   h  ty |
|  c   f   i  tz |
|  0   0   0   1 |
```

计算结果：
```
x' = a·x + d·y + g·z + tx
y' = b·x + e·y + h·z + ty
z' = c·x + f·y + i·z + tz
```

#### 与 lib3mf-rs 对比验证

lib3mf-rs（Rust）的解析：

```rust
// crates/lib3mf-core/src/parser/component_parser.rs:65-69
Ok(Mat4::from_cols_array(&[
    p[0], p[1], p[2], 0.0, p[3], p[4], p[5], 0.0,
    p[6], p[7], p[8], 0.0, p[9], p[10], p[11], 1.0,
]))
```

`glam::Mat4` 列主序存储，数学矩阵：

```
| p[0]  p[3]  p[6]  p[9]  |
| p[1]  p[4]  p[7]  p[10] |
| p[2]  p[5]  p[8]  p[11] |
|  0     0     0     1    |
```

实际代码 `v` = lib3mf-rs 的 `p`，`set(v[0], v[3], v[6], v[9], ...)` 产生的矩阵与 lib3mf-rs 完全一致。✅

**结论：实际代码与 lib3mf-rs 数学等价，处理正确。设计文档原始版本有 bug（旋转被转置），实现时已修正。**

### 11.2 3MF 规范的矩阵约定

3MF Core Spec §3.3：

> *"row-major affine 3D matrices (4x4) are used"*
> *"matrices have the form 'm00 m01 m02 m10 m11 m12 m20 m21 m22 m30 m31 m32'"*

3MF 使用**行向量** `v' = v × M`：

```
| m00  m01  m02   0  |
| m10  m11  m12   0  |     v' = v × M
| m20  m21  m22   0  |
| m30  m31  m32   1  |
```

Three.js 和 glam 都使用**列向量** `v' = M × v`，因此需要将 3MF 矩阵转置后存储（等价于将 12 值解释为列主序）：

```
| m00  m10  m20  m30 |
| m01  m11  m21  m31 |     3MF 矩阵的转置（适用于列向量）
| m02  m12  m22  m32 |
|  0    0    0    1  |
```

实际 `mat4From12Values` 通过列主序解释 + `set()` 行主序顺序完成了这个转置。✅

### 11.3 `mat4From16Values` 分析

```typescript
// viewTransforms.ts:32-38
export function mat4From16Values(v: number[]): THREE.Matrix4 {
  return new THREE.Matrix4().set(
    v[0], v[1], v[2], v[3],     // 行 0
    v[4], v[5], v[6], v[7],     // 行 1
    v[8], v[9], v[10], v[11],   // 行 2
    v[12], v[13], v[14], v[15], // 行 3
  )
}
```

假设 Bambu `<part metadata key="matrix">` 的 16 个值按**行主序**存储，直接传入 `set()` 即可。

> ⚠️ 设计文档原版使用 `fromArray(v)`（期望列主序），与 `mat4From12Values` 假设的输入格式矛盾。已修正为 `set()` 行主序。

### 11.4 `computeViewDelta` 验证

```typescript
const buildMatrix = mat4From12Values(buildItem.transform)

// Assembly: Δ = M_assemble × M_build⁻¹
const assembleMatrix = mat4From12Values(assembleItem.transform)
return assembleMatrix.multiply(buildMatrix.clone().invert())

// Import: Δ = M_import × M_build⁻¹
const importMatrix = mat4From16Values(importItem.matrix)
importMatrix.multiply(makeTranslationMatrix(importItem.sourceOffset))
return importMatrix.multiply(buildMatrix.clone().invert())
```

Delta 推导验证：

```
v'' = Δ · (M_build × M_component × v)
Δ = M_assemble × M_build⁻¹
v'' = (M_assemble × M_build⁻¹) × (M_build × M_component × v)
    = M_assemble × M_component × v ✓
```

三种矩阵在同一列向量约定下统一操作，Delta 公式正确。✅

### 11.5 总结

| 层面 | 设计文档（原始） | 实际代码 `viewTransforms.ts` | 结论 |
|---|---|---|---|
| `mat4From12Values` | `set(v[0], v[1], v[2], v[9], ...)` | `set(v[0], v[3], v[6], v[9], ...)` | 文档有 bug，代码正确 ✅ |
| `mat4From16Values` | `fromArray(v)` 列主序 | `set(v[...])` 行主序 | 文档有 bug，代码正确 ✅ |
| `makeTranslationMatrix` | `makeTranslation` | `makeTranslation` | 正确 ✅ |
| `computeViewDelta` | `M_target × M_build⁻¹` | `M_target × M_build⁻¹` | 正确 ✅ |
| 与 lib3mf-rs 等价性 | 不等价（旋转转置） | 等价（正确转置） | ✅ |

---

## 附录：Delta 矩阵推导验证

```
给定：
  M_baked = M_build × M_component × local_vertex

目标：
  M_target = M_assemble × M_component × local_vertex

推导：
  delta × M_baked = M_target
  delta × (M_build × M_component) = M_assemble × M_component
  delta = M_assemble × M_component × (M_build × M_component)⁻¹
        = M_assemble × M_component × M_component⁻¹ × M_build⁻¹
        = M_assemble × M_build⁻¹     ← 抵消完成

实现：
  geo.applyMatrix4(delta) 等价于 v' = delta × v
  geo 当前包含 M_build × M_component × local
  应用 delta 后：delta × M_build × M_component × local = M_assemble × M_component × local ✓
```

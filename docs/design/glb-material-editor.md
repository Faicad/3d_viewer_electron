# GLB 材质编辑 — 设计文档

## 概述

在 GLB 扩展面板的材质列表中，点击任意材质行，打开材质编辑器面板对**所有引用该材质的零件**进行统一编辑。修改实时生效，自动应用到该材质的全部实例。

## 动机

当前材质编辑器（MaterialEditor）的工作粒度是**单个零件**（per-part），通过场景树右键或选中后从工具栏打开。但对于 GLB 文件，同一个 glTF 材质往往被多个 mesh primitive 引用（如 RobotExpressive 的 Grey 材质被 6 个零件共享），逐个编辑效率极低且无法保证一致性。

GLB 扩展面板已经展示了材质级别的信息（索引、名称、实例数），是材质级别编辑的天然入口。

## 用户流程

```
GLB 扩展面板 → 材质列表 → 点击某一行材质
  → 打开 MaterialEditor 浮窗
  → 标题栏显示 "材质名称 / 文件名称"
  → 编辑属性，所有引用该材质的零件实时变化
  → 编辑行为与现有 MaterialEditor 一致（覆盖/恢复/复制粘贴等）
```

## 设计思路

### 现有的 MaterialEditor 已支持多零件编辑

`MaterialEditor` 接受 `editingOverrideKeys: string[]`——一个覆盖键数组。当数组长度 > 1 时，编辑器标题显示"已选择 N 个零件"，且 `apply()` 会调用 `setMaterialOverrideBatch(keys, appearance)` 一次性应用到全部零件。

**当前无人调用这个多零件路径**——所有入口（场景树右键、工具栏按钮）都只传单个 key。本需求就是为多零件路径提供第一个实际入口。

### 核心问题：如何找出引用同一个 glTF 材质的所有零件

`GlbPartInfo` 当前字段：

```typescript
interface GlbPartInfo {
  partId: string       // 零件标识
  meshIndex: number    // 在 meshes[] 数组中的位置
  name: string         // 名称
  triangleCount: number
}
```

**缺少 `materialIndex`**——即该零件使用的是 glTF materials 数组中的哪一个材质。需要补充。

### 数据来源

在 `loadFormat` → `glb` 分支中，`gltf.parser.json` 包含完整的 glTF JSON：

```
meshes[i].primitives[j].material = 材质索引
```

而 `extractMeshes(gltf.scene)` 展平后的 mesh 顺序与 glTF primitive 枚举顺序一致（深度优先遍历，每个 primitive 产生一个 `THREE.Mesh`）。

因此可以在遍历时标注每个 mesh 对应的 glTF 材质索引：

```
第 N 个 scene mesh → 第 N 个 glTF primitive → material = K
```

然后将这个 `K` 写入 `THREE.Mesh.userData.gltfMaterialIndex`，在 `ModelGroup` 构建 `GlbPartInfo` 时读取并存储。

### 替代方案：THREE.Material UUID 分组

GLTFLoader 对引用同一个 glTF 材质的 primitive 会复用同一个 `THREE.Material` 实例（共享引用）。可以在 `ModelGroup` 克隆材质之前，用 `src.material.uuid` 作为分组键。

缺点：
- UUID 不可读，调试困难
- 依赖 GLTFLoader 内部行为，未来版本可能变更
- 无法直接通过 glTF 材质索引查询

**推荐使用 `materialIndex` 方案**，数据来自 glTF JSON，语义明确，且 `GltfMaterialMeta`（GLB 扩展面板已用的数据结构）就是按 `materialIndex` 组织的。

## 实现方案

### 1. 在 `formatLoaders.ts` 中标注每个 mesh 的材质索引

glb 加载路径中，GLTFLoader 创建场景后，遍历 glTF JSON 的 meshes→primitives 链，将每个 primitive 的 material 索引写入对应 `THREE.Mesh.userData.gltfMaterialIndex`。

glTF primitive 与 scene mesh 的对应关系已在 `buildTextureExtras` 中用过，可抽取为独立函数复用。

### 2. 扩展 `GlbPartInfo` 接口

```typescript
// model-store.ts
export interface GlbPartInfo {
  partId: string
  meshIndex: number
  name: string
  triangleCount: number
  materialIndex: number    // 新增：glTF materials 数组索引
}
```

在 `ModelGroup.tsx` 构建 `partInfos` 时，从 `src.userData.gltfMaterialIndex` 读取并填充。

### 3. 新增 Store 辅助方法

```typescript
// model-store.ts 扩展
interface ModelStore {
  // ... 现有字段 ...

  /** 获取属于指定 fileId + materialIndex 的所有 partId */
  getPartIdsByMaterial(fileId: string, materialIndex: number): string[]
}
```

实现：遍历 `loadedFiles` 中对应文件的 `glbPartInfos`，筛选 `materialIndex` 匹配的条目，返回 `partId[]`。

### 4. GLB 扩展面板增加点击处理

`GlbExtensionPanel` 材质表格每行增加 `onClick` 和 `cursor-pointer` 样式。点击时：

```typescript
function handleMaterialClick(matIndex: number, matName: string, fileName: string) {
  const modelStore = useModelStore.getState()
  const fileId = useGlbExtensionStore.getState().activeFileId
  if (!fileId) return

  const partIds = modelStore.getPartIdsByMaterial(fileId, matIndex)
  const keys = partIds.map(pid => `${fileId}:${pid}`)
  const title = `${matName} / ${fileName}`

  useMaterialStore.getState().openMaterialEditor(keys, title)
}
```

### 5. 标题展示

MaterialEditor 现有标题逻辑在 `MaterialEditor.tsx` 第 567 行附近：

```tsx
// 当 editingKeys.length > 1 时显示零件数量
// 当 editingKeys.length === 1 时显示单个零件名
```

需要增加新逻辑：当通过材质入口打开时（`editingKeys.length > 1`且所有 key 属于同一材质），优先显示 `materialEditorTitle`——即传入的 `"材质名称 / 文件名称"`。

## 数据流

```
用户点击材质
  → GlbExtensionPanel.handleMaterialClick(idx)
  → modelStore.getPartIdsByMaterial(fileId, idx) → partIds[]
  → keys = partIds.map(pid => `${fileId}:${pid}`)
  → materialStore.openMaterialEditor(keys, "Grey / bath_day.glb")
  → MaterialEditor 渲染，遍历 keys，取第一个 part 的 MaterialAppearance 作为表单初始值
  → 用户修改属性，点击 Apply
  → materialStore.setMaterialOverrideBatch(keys, appearance)
  → ModelGroup.useEffect 检测到 materialOverrides 变化
  → 对所有 keys 对应的 mesh 应用新材质
  → 3D 视口实时更新
```

## 边界情况

| 场景 | 行为 |
|---|---|
| 材质无实例（instanceCount=0，理论上不会出现） | 点击无反应，不打开编辑器 |
| 同一文件多个材质 | 每次点击切换编辑目标，与现有单零件切换行为一致 |
| 切换活动文件 | 若编辑器正打开且编辑的是旧文件的材质，编辑器应关闭（与现有行为一致） |
| 材质编辑器已打开编辑其他零件 | 点击材质后切换到材质级编辑模式，覆盖 `editingOverrideKeys` |
| 用户在编辑器中修改后点"恢复原始" | 只恢复当前编辑的材质对应的所有零件 |
| 多个文件加载 | 编辑器只作用于 `activeFileId` 对应文件的材质零件 |
| 零件有独立的 per-part 覆盖 | 材质级编辑会覆盖已有的 per-part 覆盖（因为使用同一个 override key） |

## 测试策略

### 测试文件

使用 `RobotExpressive.glb` 作为测试数据——3 个材质（Grey/Main/Black），材质实例数分别为 6/12/1，无纹理干扰，是验证材质级编辑的理想模型。

### 单元测试（vitest, node env）

**`src/renderer/stores/model-store.test.ts`** — 扩展已有测试：

1. **`getPartIdsByMaterial` 返回正确零件**：构造两个文件各含不同 materialIndex 的 `GlbPartInfo`，验证：
   - 查询 materialIndex=0 返回对应 fileId 下所有该材质的 partId
   - 查询不存在的 materialIndex 返回空数组
   - 不同 fileId 的查询互不干扰

2. **`materialIndex` 字段默认值**：验证未设置 `materialIndex` 的 `GlbPartInfo` 不参与匹配（如 STL 等非 glTF 格式的零件不应被材质查询命中）

**`src/renderer/engine/__tests__/format-loaders.test.ts`** — 扩展已有 GLB 测试：

3. **mesh 标注 gltfMaterialIndex**：用 `RobotExpressive.glb` 调用 `loadFormat`，验证每个 mesh 的 `userData.gltfMaterialIndex` 与 glTF JSON 中对应 primitive 的 material 一致。关键校验点：
   - Foot.L（mesh 0, 1 primitive）→ materialIndex=0 (Grey)
   - Torso（mesh 1, 2 primitives）→ 两个 mesh 分别指向 materialIndex=0 和 materialIndex=1 (Main)
   - Head（mesh 2, 3 primitives）→ 三个 mesh 分别指向 0 (Grey), 1 (Main), 2 (Black)
   - 总 mesh 数 = 总 primitive 数 = 19

### 组件测试（vitest, jsdom env）

**`src/renderer/components/panels/__tests__/GlbExtensionPanel.test.tsx`** — 扩展已有测试：

4. **点击材质行打开编辑器**：mock `useModelStore` 的 `getPartIdsByMaterial` 返回 3 个 partId，mock `useMaterialStore` 的 `openMaterialEditor`。渲染面板 → 点击材质 #0 行 → 验证：
   - `openMaterialEditor` 被调用一次
   - 第一个参数是 3 个 key：`["file1:part0", "file1:part5", "file1:part10"]`
   - 第二个参数标题为 `"Grey / test.glb"`

5. **材质行有 cursor-pointer 样式**：验证材质 `<tr>` 有可点击样式

**`src/renderer/components/panels/__tests__/MaterialEditor.test.tsx`** — 新建或扩展现有：

6. **多零件编辑标题显示**：传入 `editingKeys.length > 1`，验证标题栏显示传入的 `materialEditorTitle`（如 `"Grey / test.glb"`），而非默认的零件计数

### E2E 测试（playwright）

**`src/test/material-editor.spec.ts`** — 已存在 4 个测试文件，扩展或新建：

7. **GLB 面板点击材质 → 打开编辑器**：
   - 加载 `RobotExpressive.glb`
   - 右键文件节点 → 点击 "GLB 扩展"
   - 展开材质区 → 点击材质 #0 (Grey, instances=6)
   - 验证 MaterialEditor 浮窗出现
   - 验证标题栏显示 "Grey / RobotExpressive"

8. **材质级编辑应用到全部零件**：
   - 在 MaterialEditor 中修改 baseColor 为红色
   - 验证场景中所有使用 Grey 材质的零件（6 个）都变为红色
   - 使用 Black 材质的零件（Head.prim2）不受影响

9. **恢复原始材质**：
   - 点击 "恢复原始材质" 按钮
   - 验证所有 6 个零件恢复原始 Grey 颜色

## 涉及的变更文件

| 文件 | 变更 |
|---|---|
| `src/renderer/engine/formatLoaders.ts` | 在 glb 加载路径中，遍历 glTF primitives 并标注 `mesh.userData.gltfMaterialIndex` |
| `src/renderer/stores/model-store.ts` | `GlbPartInfo` 增加 `materialIndex`；新增 `getPartIdsByMaterial` 方法 |
| `src/renderer/engine/components/ModelGroup.tsx` | 构建 `partInfos` 时从 `userData.gltfMaterialIndex` 读取并填充 |
| `src/renderer/components/panels/GlbExtensionPanel.tsx` | 材质表格行增加 `onClick` 处理，调用 MaterialEditor |
| `src/renderer/components/panels/MaterialEditor.tsx` | 标题栏在多零件模式下显示传入的 title（而非零件计数） |
| `src/renderer/stores/glb-extension-store.ts` | 无需变更（activeFileId 已存在） |

## 与现有功能的兼容性

- **Per-part 编辑**：不受影响，仍然通过场景树右键/工具栏按钮触发
- **默认材质编辑**：不受影响
- **复制粘贴材质**：在材质级编辑模式下，"复制"复制材质外观，"粘贴"只需应用到当前编辑的所有零件（`setMaterialOverrideBatch`）
- **A/B 对比**：显示原始材质时，所有共享该材质的零件同时切换
- **纹理预览**：不受影响

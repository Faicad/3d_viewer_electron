# UV 映射可视化 — 设计文档

## 概述

纹理贴图功能完成后，用户可以看到纹理缩略图并通过 factor 控制强度，但缺少一个关键环节：**纹理到底是如何映射到模型表面的？** UV 坐标是 2D 纹理与 3D 表面之间的桥梁，目前完全不可见。本设计以一个**纹理大图弹窗**为核心，提供棋盘格纹理测试和纹理替换功能，让用户直观理解纹理映射关系。UV 接缝检测通过独立 CLI 工具提供。

本功能是 [材质编辑器纹理功能](./material-editor-textures.md) 的配套设计。

## 现状

- GLB 模型通过 GLTFLoader 加载后，几何体上已存在 `geometry.attributes.uv`（`TEXCOORD_0`），但代码库从未读取或使用该属性
- STEP→GLB 转换管道（`GlbBuilder.ts`）不生成 `TEXCOORD` 属性——STEP 模型没有 UV 坐标
- 纹理通过材质槽位（`material.map` 等）隐式映射，用户看不到映射质量

## 入口

**点击 MaterialEditor 中的纹理缩略图**（20×20px 的小图）→ 弹出纹理大图弹窗。缩略图 hover 时显示手型光标，暗示可点击。

**自动切换显示模式**：打开材质编辑器（MaterialEditor）时，若当前处于 wireframe/mesh 等非实体模式，自动切换到 **solid** 模式。否则任何材质修改（颜色、粗糙度、纹理替换等）在 3D 视口中均不可见。

## 纹理大图弹窗

### 窗口设计

```
┌─────────────────────────────────────┐
│  Base Color → map            [✕]    │  ← 标题栏（PBR 属性名 + 纹理槽位名）
├─────────────────────────────────────┤
│                                     │
│                                     │
│                                     │
│         纹理大图（原图）              │
│                                     │
│                                     │
│                                     │
│                                     │
├─────────────────────────────────────┤
│  □ 棋盘格纹理              [换图]  │  ← 底部工具栏
└─────────────────────────────────────┘
```

### 各区域说明

**内容区 — 纹理大图**：
- `<img>` 或 Canvas 显示纹理原图，等比缩放并居中
**底部工具栏**（一个复选框 + 一个按钮）：

| 控件 | 作用范围 | 说明 |
|---|---|---|
| `□ 棋盘格纹理` | 弹窗 + 3D 视口 | 勾选后将当前纹理槽位替换为程序化棋盘格纹理（Canvas 8×8 带编号），弹窗和 3D 模型同步显示。取消勾选恢复勾选前的纹理。切换开关，不影响 `[换图]` 的结果 |
| `[换图]` | 弹窗 + 3D 视口 | 点击弹出系统文件选择器，选取本地图片文件（png/jpg/jpeg/webp/bmp）。选中后**替换当前纹理槽位的纹理**——弹窗内纹理大图和 3D 模型表面同步更新为新图片 |

`[换图]` 行为细节：
- 通过 `material-store.setOverride()` 持久化写入纹理替换，与滑条/取色器的编辑行为一致
- 替换仅作用于当前 part 的当前纹理槽位，不影响其他 part 或槽位
- 弹窗关闭后修改**保留**，未来 GLB 导出时包含修改后的纹理
- 换图后 `□ 棋盘格纹理` 自动取消勾选
- 弹窗内纹理大图始终显示当前生效的纹理（原始、棋盘格、或换图后的）

**窗口关闭时**：`□ 棋盘格纹理` 自动取消勾选恢复原纹理。`[换图]` 产生的修改**保留**。

### 窗口行为

- **初始尺寸**：520×480px（含标题栏和工具栏），内容区约 500×430px
- **可缩放**：窗口右下角可拖拽缩放，纹理图等比缩放适应内容区
- **位置**：屏幕居中，z-index 高于 MaterialEditor，始终在最前
- **关闭方式**：点击 [✕]、按 Escape
- **窗口可拖动**：拖动标题栏移动窗口
- **复用实例**：点击不同纹理缩略图 → 替换窗内纹理图（复用同一窗口实例），标题栏同步更新，复选框状态重置
- **无遮罩层**：弹窗直接浮在 3D 视口上方

### 数据来源

- **纹理图**：从 `MaterialAppearance` 对应字段（如 `map`）的 data-URI 或 `TextureCache` 中获取原图
- **当前 part**：由 `material-store` 中当前正在编辑的 part 决定

## 棋盘格纹理

### 原理

程序化生成的 8×8 棋盘格纹理（Canvas 生成），每个格子内带编号 (1-64)，使 UV 密度和拉伸在 3D 模型表面一目了然：

- **均匀方格** → UV 映射均匀，纹理不会变形
- **被拉长的矩形** → 该区域 UV 被拉伸
- **被压缩的矩形** → UV 密度过高
- **格子不连续/错位** → UV 接缝位置
- **格子方向不一致** → UV 岛翻转或旋转

### 控制方式

弹窗底部 `□ 棋盘格纹理` 复选框。勾选后 3D 模型替换为棋盘格，弹窗纹理图同步更新；取消勾选恢复之前的纹理。纯视图层切换，不写入 material-store override。

### 实现要点

- 棋盘格纹理在首次勾选时懒生成（Canvas 512×512），缓存在 ref 中
- 勾选时记下当前纹理 → 替换为棋盘格；取消勾选时恢复记下的纹理
- 不修改 material-store，是与 `[换图]` 独立的视图层临时切换
- wireframe/mesh 显示模式下，棋盘格复选框和换图按钮均置灰（非实体渲染，纹理贴图无效）


## 翻译文案

| key | zh | en |
|---|---|---|
| `uv.previewTitle` | `{pbrName} → {slotName}` | `{pbrName} → {slotName}` |
| `uv.checkerboard` | 棋盘格纹理 | Checker Texture |
| `uv.swapImage` | 换图 | Swap Image |

## 涉及的变更文件

| 文件 | 变更性质 |
|---|---|
| `src/renderer/components/panels/TexturePreviewDialog.tsx` | **新建** — 纹理大图弹窗（纹理图 + 棋盘格复选框 + [换图] 按钮） |
| `scripts/uv-debug.ts` | **新建** — CLI 工具：输入 glb → 输出 UV 岛可视化图片 |
| `src/renderer/components/panels/MaterialEditor.tsx` | 纹理缩略图增加 `onClick` → 打开 TexturePreviewDialog |
| `src/renderer/engine/components/ModelGroup.tsx` | 接收 `checkerTextureEnabled` prop，开启时在 3D 视口替换纹理为棋盘格 |
| `src/renderer/components/viewport/ViewportContainer.tsx` | 新增 `checkerEnabled` state，渲染 TexturePreviewDialog |
| `src/renderer/locales/zh.json` | 新增 UV 相关文案 |
| `src/renderer/locales/en.json` | 新增 UV 相关文案 |

### 多套 TEXCOORD 的处理

glTF 规范允许每个 mesh primitive 有多套 TEXCOORD（`TEXCOORD_0`, `TEXCOORD_1`, ...），每个纹理槽位通过 `texCoord` 字段独立指定使用哪一套（默认 0）。

**由纹理槽位决定 UV 来源**：每个纹理槽位通过 `texCoord` 字段独立指定使用哪套 UV。实际 Three.js 行为：GLTFLoader 已将 `texCoord` 映射为 `texture.channel`，棋盘格替换纹理时 Three.js 自动使用正确的 UV 属性，无需额外处理。

## 不做什么

- **不生成 UV 坐标**：STEP/STP 模型加载后没有 UV 坐标，本功能不会自动生成 UV
- **不修改 UV 坐标**：本功能只读只展示，不提供 UV 编辑能力

---

## 实施计划

### 阶段 1：棋盘格纹理生成器

**新建** `src/renderer/engine/material/checkerTexture.ts`

- 导出 `createCheckerTexture(size?: number)` — 用 Canvas 生成 8×8 棋盘格，每个格子带编号 (1-64)，返回 `THREE.CanvasTexture`
- 纹理尺寸默认 512×512，格子编号字体自适应 `size / 8 * 0.4`
- Canvas 渲染时使用 `fillText` 绘制编号，编号定位在每个格子中心
- 返回的 `THREE.CanvasTexture` 设置 `wrapS/wrapT = RepeatWrapping`、`colorSpace = SRGBColorSpace`、`magFilter/minFilter = LinearFilter`
- 导出 `disposeCheckerTexture()` — 调用 `texture.dispose()` 释放 GPU 资源

### 阶段 2：纹理大图弹窗组件

**新建** `src/renderer/components/panels/TexturePreviewDialog.tsx`

核心 props / 状态：

| 字段 | 类型 | 说明 |
|---|---|---|
| `visible` | `boolean` | 弹窗是否可见 |
| `onClose` | `() => void` | 关闭回调（关闭时自动取消棋盘格） |
| `textureSrc` | `string` | 当前生效的纹理图 data-URI / URL |
| `slotName` | `string` | 纹理槽位名（如 `"map"`） |
| `pbrName` | `string` | PBR 属性显示名（如 `"Base Color"`） |
| `onSwapImage` | `(slot: string) => void` | 换图回调 |
| `checkerEnabled` | `boolean` | 棋盘格是否启用 |
| `onCheckerToggle` | `(enabled: boolean) => void` | 棋盘格切换回调 |
| `checkerDisabled` | `boolean` | 是否置灰棋盘格控件（非 solid 模式） |

内部状态：
- `size: { width: number, height: number }` — 窗口尺寸，初始 520×480，最小 320×300
- `position: { x: number, y: number }` — 窗口位置，初始屏幕居中
- `isDragging: boolean` — 标题栏拖拽状态
- `isResizing: boolean` — 右下角缩放拖拽状态

实现细节：
- 使用 React portal (`createPortal`) 渲染到 `document.body`，z-index 高于 MaterialEditor
- 标题栏 `onMouseDown` 开始拖拽，`document` 级 `mousemove/mouseup` 更新位置
- 右下角 12×12px 的 resize handle，`onMouseDown` 开始缩放，`document` 级 `mousemove/mouseup` 更新尺寸
- 纹理大图 `<img>` 放在 `object-contain` 容器中，等比缩放适应内容区
- 纹理图从 `textureSrc` 读取显示，该值由父组件根据棋盘格状态决定（棋盘格启用时传棋盘格 data-URI，否则传原始纹理）
- 窗口复用：父组件通过 `visible` + `textureSrc` prop 切换不同纹理槽位时，组件内部 `useEffect` 检测 `textureSrc` 变化自动更新图片
- Escape 键关闭：`useEffect` 中 `keydown` 监听，visible 时注册，关闭时清理
- 复用实例行为：当弹窗已打开时用户点击另一个缩略图，父组件更新 `textureSrc`/`slotName`/`pbrName` prop，弹窗内图片和标题同步切换，复选框重置为未勾选

### 阶段 3：缩略图点击入口

**修改** `src/renderer/components/panels/MaterialEditor.tsx`

- 在 `ColorRow` 和 `SliderRow` 的缩略图 `<div>` 上添加：
  - `className` 增加 `cursor-pointer`（手型光标暗示可点击）
  - `onClick` 处理器：调用父组件传入的 `onTextureClick(slotName)`
- `ColorRow` / `SliderRow` props 新增 `onTextureClick?: (slot: string) => void`
- MaterialEditor 主组件新增 prop `onTextureClick: (slot: string) => void`
- `onTextureClick` 沿调用链传递：`MaterialEditor` → `PbrSection` → `ColorRow` / `SliderRow`
- 纹理槽位名映射（与现有 `textureThumbnails` key 一致）：`map`、`roughnessMap`、`metalnessMap`、`emissiveMap`、`alphaMap`、`clearcoatMap`、`clearcoatNormalMap`、`transmissionMap`、`thicknessMap`
- 注意：仅传递槽位名，不传递纹理数据——父组件从 store 读取原图

### 阶段 4：父组件编排逻辑

**修改** `src/renderer/components/viewport/ViewportContainer.tsx`

新增 state：
```ts
const [textureDialog, setTextureDialog] = useState<{
  slot: string        // 纹理槽位名，如 'map'
  pbrLabel: string    // PBR 属性显示名，如 'Base Color'
} | null>(null)

const [checkerEnabled, setCheckerEnabled] = useState(false)
```

核心逻辑：

- `openTextureDialog(slot, pbrLabel)` — 设置 `textureDialog` state，打开弹窗
- `closeTextureDialog()` — 设置 `textureDialog = null`，同时 `setCheckerEnabled(false)`（自动取消棋盘格）
- `handleCheckerToggle(enabled)` — 设置 `checkerEnabled`，不写 material-store
- `handleSwapImage(slot)` — 从 `textureThumbnails` 获取原图 data-URI 作为初始值，调用 `showOpenDialog`（Electron `dialog.showOpenDialog`），读取选中文件为 base64，调用 `materialStore.setMaterialOverride()` 写入纹理替换

`textureDialog` 不为 null 时渲染 `<TexturePreviewDialog>`：
```tsx
{textureDialog && (
  <TexturePreviewDialog
    visible={true}
    onClose={closeTextureDialog}
    textureSrc={getEffectiveTextureSrc(textureDialog.slot, checkerEnabled)}
    slotName={textureDialog.slot}
    pbrName={textureDialog.pbrLabel}
    onSwapImage={handleSwapImage}
    checkerEnabled={checkerEnabled}
    onCheckerToggle={handleCheckerToggle}
    checkerDisabled={displayMode !== 'solid'}
  />
)}
```

`getEffectiveTextureSrc(slot)` 逻辑：
1. 如果 `checkerEnabled` — 返回棋盘格 data-URI（从 `createCheckerTexture` Canvas 导出）
2. 如果当前 part 的 override 中有该 slot 的纹理（换图后） — 返回该纹理
3. 否则返回 `textureThumbnails[primaryKey][slot]`（原始纹理缩略图，但弹窗需要的是**原图**而非缩略图，见下方注意事项）

> **注意：弹窗需要原图而非 20×20 缩略图**。`textureThumbnails` 存储的是 20×20 缩略图 data-URI，不够清晰。需要在 `ViewportContainer` 中额外提供获取原图的方法。两种方案：
> - **方案 A（推荐）**：通过 `TextureCache` 获取原纹理 → Canvas 绘制全尺寸 data-URI。在 `cloneMaterial.ts` 中 `extractTexturesFromMaterial` 已生成了全尺寸 JPEG（quality 0.85），存储在 `TextureSlotInfo` 的 `fullDataUri` 字段中。但该字段目前未存入 store。需要扩展 `textureThumbnails` 结构或新增一个并行 store 字段存储全尺寸 data-URI。
> - **方案 B**：复制 `cloneMaterial.ts` 中生成全尺寸 data-URI 的逻辑，在弹窗打开时实时生成。
>
> 建议采用**方案 A**：在 `extractTexturesFromMaterial` → `setTextureThumbnailsForFile` 路径上同时存储原图 data-URI，新增 store 字段 `textureOriginals: Record<string, Record<string, string>>`。弹窗打开时从 `textureOriginals[primaryKey][slot]` 读取原图。

- `handleSwapImage(slot)` — 使用隐藏的 `<input type="file" accept="image/png,image/jpeg,image/webp,image/bmp">`（与 `OpenFileDialog.tsx` 相同的浏览器原生方式），**不设 `multiple` 属性，仅允许单选**。选中后通过 `FileReader.readAsDataURL()` 在渲染进程直接获取 data-URI，无需 IPC。
- `displayMode` 从 `useModelStore` 读取，用于 `checkerDisabled`

### 阶段 5：棋盘格 3D 视口同步

**修改** `src/renderer/engine/components/ModelGroup.tsx`

新增 props：
```ts
checkerTexture?: THREE.Texture | null   // 棋盘格纹理实例
checkerSlot?: string | null             // 当前棋盘格作用的纹理槽位
```

当 `checkerTexture` 非空时，在应用 overrides 的 `useEffect` 中：
1. 从 store 获取当前的 override（或 original）appearance
2. 深拷贝 appearance，将 `checkerSlot` 对应字段设为棋盘格纹理的 data-URI
3. 通过 MaterialFactory 创建临时材质（不写 store）
4. 将该材质应用到对应的 mesh 上

注意：棋盘格是三层的叠加逻辑：
- 底层：material-store 中的原始纹理 / override 纹理
- 棋盘格层：临时替换指定槽位的纹理（不写 store）
- `[换图]` 层：持久化 override（写 store）

棋盘格启用时：
- `[换图]` 按钮仍可点击，换图后自动取消棋盘格（`setCheckerEnabled(false)`）
- wireframe/mesh 模式下棋盘格置灰但 3D 视口无效果（因为非实体渲染看不到纹理）

### 阶段 6：自动切换 Solid 模式

**修改** `src/renderer/components/panels/MaterialEditor.tsx` 或 `ViewportContainer.tsx`

在 MaterialEditor 打开时（`materialEditorVisible` 从 false 变为 true），检查 `displayMode`：
- 若非 `solid`，自动调用 `useModelStore.getState().setDisplayMode('solid')`
- 记录切换前的显示模式，供后续可能的恢复逻辑使用（当前设计不做自动恢复，用户可手动切回）

### 阶段 7：棋盘格纹理缓存

**修改** `src/renderer/components/viewport/ViewportContainer.tsx`

- 使用 `useRef<THREE.CanvasTexture | null>` 缓存棋盘格纹理实例
- 首次勾选棋盘格时调用 `createCheckerTexture()` 生成并存入 ref
- 组件卸载时调用 `disposeCheckerTexture()` 释放资源
- `createCheckerTexture()` 通过 Canvas 2D API 生成：绘制 8×8 的交替色块 + 每个格子中心绘制编号文字

### 阶段 8：翻译和清理

- `src/renderer/locales/zh.json` 和 `en.json` 添加 `uv` 命名空间键值
- MaterialEditor 缩略图 hover 样式调整（`cursor-pointer` + optional hover ring）
- TexturePreviewDialog 关闭时 `checkerEnabled` 重置

---

## 测试

### 单元测试

**`src/renderer/engine/material/checkerTexture.test.ts`**（新建）

| 测试用例 | 验证点 |
|---|---|
| `createCheckerTexture 返回 CanvasTexture` | 返回值是 `THREE.CanvasTexture` 实例 |
| `棋盘格纹理尺寸正确` | `image.width === 512`, `image.height === 512` |
| `棋盘格格子颜色正确` | Canvas 像素采样：偶数格子为白色，奇数格子为黑色 |
| `棋盘格编号可见` | Canvas 像素在格子中心区域有非背景色像素 |
| `wrapS/wrapT 为 RepeatWrapping` | 纹理的 wrapS 和 wrapT 均为 `THREE.RepeatWrapping` |
| `colorSpace 为 SRGBColorSpace` | 纹理的 colorSpace 正确 |
| `disposeCheckerTexture 释放资源` | 调用后 `texture.image` 相关资源被清理 |

**`src/renderer/stores/material-store.test.ts`**（已有文件，新增用例）

| 测试用例 | 验证点 |
|---|---|
| `textureThumbnails 存储和读取` | 现有行为回归：setTextureThumbnailsForFile 后 get 可读到正确数据 |
| `新增 textureOriginals 存储` | 如采用方案 A，验证 setTextureOriginalsForFile 后 get 可读到正确数据 |
| `换图后 override 包含新纹理 data-URI` | `setMaterialOverride` 后读取 override，纹理字段为换图后的 data-URI |

**`src/renderer/engine/components/cloneMaterial.test.ts`**（新建，如不存在）

| 测试用例 | 验证点 |
|---|---|
| `textureThumbnail 生成 20×20 缩略图` | 返回的 Canvas 尺寸为 20×20 |
| `extractTexturesFromMaterial 提取纹理 data-URI` | 对带 map 的材质，返回的结构包含 `map.fullDataUri` |

### 组件测试

**`src/renderer/components/panels/TexturePreviewDialog.test.tsx`**（新建）

测试环境搭建：
- Mock `react-i18next` 的 `useTranslation`（同现有测试约定）
- Mock `createPortal`：`vi.mock('react-dom', async () => ({ ...await vi.importActual('react-dom'), createPortal: (node: any) => node }))`
- 使用 `@testing-library/react` 的 `render` + `userEvent.setup()`

| 测试用例 | 步骤 | 验证点 |
|---|---|---|
| **弹窗渲染** | 传入 `visible=true` + `textureSrc="test.png"` | DOM 中出现纹理图片 `<img>` |
| **弹窗不可见时不渲染** | 传入 `visible=false` | DOM 中无弹窗元素 |
| **标题栏显示正确槽位名** | 传入 `pbrName="Base Color"`, `slotName="map"` | 标题栏文本包含 `Base Color → map` |
| **关闭按钮触发 onClose** | `render` → 点击 [✕] 按钮 | `onClose` 被调用 1 次 |
| **Escape 键关闭** | `render` → 按 Escape | `onClose` 被调用 1 次 |
| **棋盘格复选框切换** | `render` → 点击 `□ 棋盘格纹理` | `onCheckerToggle(true)` 被调用 |
| **取消勾选棋盘格** | `checkerEnabled=true` → 点击 `□ 棋盘格纹理` | `onCheckerToggle(false)` 被调用 |
| **棋盘格置灰** | `checkerDisabled=true` | 复选框为 disabled 状态 |
| **换图按钮点击** | `render` → 点击 `[换图]` | `onSwapImage(map)` 被调用 |
| **棋盘格置灰时换图按钮也置灰** | `checkerDisabled=true` | `[换图]` 按钮为 disabled 状态 |
| **窗口拖拽** | 标题栏 mousedown → mousemove → mouseup | 窗口位置改变（通过 style top/left 断言） |
| **窗口缩放** | resize handle mousedown → mousemove → mouseup | 窗口尺寸改变（通过 style width/height 断言） |
| **最小尺寸限制** | 缩放至小于 320×300 | 窗口尺寸不跌破 320×300 |
| **纹理图切换** | 先渲染 `textureSrc="a.png"`，再更新为 `textureSrc="b.png"` | `<img>` 的 src 更新为 `b.png` |
| **复用实例时标题更新** | 弹窗已存在，更新 `pbrName` prop | 标题栏文本同步更新 |
| **复用实例时复选框重置** | 弹窗已存在，`checkerEnabled=true`，更新 `slotName` prop | `onCheckerToggle(false)` 被调用 |
| **棋盘格启用时显示棋盘格图** | `checkerEnabled=true`, `textureSrc=checkerDataUri` | `<img>` src 为棋盘格 data-URI |

**`src/renderer/components/panels/MaterialEditor.test.tsx`**（已有文件，新增用例）

| 测试用例 | 步骤 | 验证点 |
|---|---|---|
| **缩略图点击触发 onTextureClick** | `render` → 点击某个纹理缩略图 `<img>` | `onTextureClick('map')` 被调用 |
| **缩略图显示手型光标** | `render` → 检查缩略图元素 className | 包含 `cursor-pointer` |
| **无纹理时缩略图不渲染** | 传入无纹理的 part | 缩略图 `<img>` 不存在 |
| **所有纹理槽位缩略图均可点击** | 对有 `roughnessMap` 的 part 渲染 | 点击 `roughnessMap` 缩略图 → `onTextureClick('roughnessMap')` |

### 集成测试（Playwright）

**`tests/uv-texture-preview.spec.ts`**（新建）

| 测试用例 | 步骤 | 验证点 |
|---|---|---|
| **打开弹窗** | 加载 GLB 模型 → 打开 MaterialEditor → 点击纹理缩略图 | 弹窗出现在屏幕上，包含纹理大图 |
| **关闭弹窗** | 弹窗可见 → 点击 [✕] | 弹窗消失 |
| **Escape 关闭** | 弹窗可见 → 按 Escape | 弹窗消失 |
| **棋盘格切换** | 弹窗可见 → 勾选棋盘格 → 检查 3D 视口 | 3D 模型表面显示棋盘格纹理 |
| **取消棋盘格恢复原纹理** | 棋盘格已启用 → 取消勾选 | 3D 模型恢复原纹理 |
| **棋盘格 + 关闭弹窗自动取消** | 棋盘格启用 → 关闭弹窗 | 3D 模型恢复原纹理 |
| **换图按钮** | 弹窗可见 → 点击换图 → 选择本地图片 | 3D 模型和弹窗纹理图同步更新为新图片 |
| **换图后棋盘格自动取消** | 棋盘格启用 → 点击换图 | 棋盘格复选框取消勾选，3D 模型显示新图片 |
| **wireframe 模式棋盘格置灰** | 切换到 wireframe 模式 → 打开弹窗 | 棋盘格复选框和换图按钮为 disabled |
| **材质编辑器打开自动切 solid** | wireframe 模式 → 打开 MaterialEditor | 显示模式自动切换为 solid |
| **弹窗复用** | 打开 map 纹理弹窗 → 直接点击 roughnessMap 缩略图 | 弹窗标题更新，图片切换，复选框重置 |

### 手动测试检查清单

| 检查项 | 步骤 | 预期结果 |
|---|---|---|
| 棋盘格在 UV 密集区域显示压缩格子 | 加载 UV 密度不均的模型 → 启用棋盘格 | 密集 UV 区域格子更小、拉伸区域格子更长 |
| 棋盘格在 UV 接缝处断开 | 加载有 UV 接缝的模型 → 启用棋盘格 | 接缝两侧格子不连续 |
| 无 UV 的模型棋盘格无效果 | 加载 STEP 模型 → 打开弹窗 → 启用棋盘格 | 棋盘格复选框置灰（STEP 模型无纹理槽位） |
| 换图持久化 | 换图后关闭弹窗 → 重新打开弹窗 | 弹窗显示换图后的图片 |
| 换图不影响其他 part | 选中 part A → 换图 → 选中 part B | part B 的纹理不受影响 |
| 弹窗拖拽不溢出屏幕 | 拖拽弹窗到屏幕边缘 | 弹窗保持可见（有边界限制） |
| 大纹理图缩放适应 | 加载 4096×4096 纹理 → 打开弹窗 | 图片等比缩放适应内容区，不溢出 |
| 关闭弹窗棋盘格自动恢复 | 棋盘格启用 → 关闭弹窗 | 3D 模型恢复原纹理，下次打开弹窗棋盘格未勾选 |

---

## UI Mockup 参考

Mockup 文件：`docs/design/uv-mapping-mockup.html`

展示：
- 弹窗浮在 3D 视口上方，无遮罩，可缩放可拖拽
- 弹窗内仅纹理大图
- 底部棋盘格复选框和换图按钮

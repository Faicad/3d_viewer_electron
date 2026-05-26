# 材质编辑器纹理功能 — 设计文档

## 概述

在现有材质编辑器浮窗中增加纹理贴图的展示与控制。纹理缩略图内联到对应 PBR 属性的同一行中，滑条/取色器本身就是纹理强度的控制器（`final = factor × texture`），不需要独立的开关。

本功能是 [GLB 扩展面板](./glb-extension-panel.md) 的配套设计——扩展面板负责文件级 glTF 扩展的清单与开关，本设计负责材质级的纹理展示。

## 现状

MaterialEditor 是一个 260px 宽的浮窗，按 PBR 属性分区（Base → Clearcoat → Sheen → Transmission → Emissive → Misc），每区使用 `SliderRow`、`ColorRow`、`ToggleRow` 子组件。

`MaterialAppearance` 类型已定义了 10 个纹理槽位字段（`map`、`normalMap`、`roughnessMap`、`metalnessMap`、`aoMap`、`emissiveMap`、`transmissionMap`、`thicknessMap`、`clearcoatMap`、`clearcoatNormalMap`），类型均为 `string`（URL/data-URI）。但 `materialToAppearance()` 函数目前只提取 PBR 数值属性，**未提取纹理引用**。

GLB 加载后，Three.js 材质上的纹理是 `THREE.Texture` 对象。MaterialEditor 的 `apply()` → `material-store.setOverride()` → `MaterialFactory.createMaterial()` 管线已经能处理 `MaterialAppearance` 上的纹理字段——`MaterialFactory.loadAndApplyTextures()` 会读取 URL 字段并加载。数据管道是通的，缺的是**加载时提取纹理信息**和**编辑器 UI**。

### 滚动条

当前 MaterialEditor 使用 `<ScrollArea>` 但无可见滚动条，内容超出面板高度时下半部分无法访问。新增纹理行后内容量进一步增加，必须修复。

要求：`max-h-[80vh]` + 鼠标 hover 时显示滚动条，与现有 shadcn ScrollArea 行为一致。

## 布局设计

### 纹理位置

不新增独立分区。每个 PBR 属性的纹理信息**内联到该属性的同一行**中。理由：

- 纹理与 PBR scalar 值是相乘关系（`final = scalar × texture`），放在同一行直观表达这个关联
- 无需在独立分区和 PBR 分区之间来回对照"哪个纹理对应哪个属性"
- 无纹理的属性行保持原样，有纹理的行自然多出一段纹理控件，布局紧凑

### 行布局

**有纹理的行**：缩略图放在行最右侧，数值/控件在缩略图左边间隔 5px。数值后缀 ` x` 表示乘法关系。

取色器行：
```
颜色                          [#FFF] [▓]
```

滑条行（滑条另起一行）：
```
粗糙度                         1 x [▓]
[==========slider==========]
            ↑ 右边缘对齐 "1 x"
```

**无纹理的行**：保持现有布局不变（`justify-between`，数值右对齐，无后缀）。

```
不透明度                         1
```

缩略图 20×20px，不显示纹理名称。所有缩略图天然对齐到面板右边缘。

### 滑条宽度规则

**全有或全无**：只要当前材质有任意一张纹理，所有滑条统一缩短，右边缘与 value+thumb 列左边缘对齐。全部无纹理时所有滑条保持全宽。避免同一面板内滑条长短不一。

实现方式：有纹理时，测量 value+thumb 列中最宽值的宽度，所有滑条设置相同的 `margin-right`（约 48px）。同时，无纹理行的数值/控件也设置相同的右偏移（数值 `mr-[25px]`，取色器 `mr-[23px]`），使所有数值在同一垂直列对齐。

## 数据模型

**一个属性最多一张贴图**：`MeshPhysicalMaterial` 的每个纹理槽位（`map`、`normalMap`、`roughnessMap` 等）是单个 `THREE.Texture | null`，不是数组。glTF 2.0 规范也是如此。

**一张贴图可能被多个属性引用**：同一个 `THREE.Texture` 实例可以同时赋给 `map` 和 `emissiveMap`（虽然不常见）。缩略图以纹理引用地址为 key 缓存，同一贴图被多属性引用时只生成一次缩略图。

**glTF 规范的 factor 默认值**：除 `emissiveFactor` 默认为 `[0,0,0]` 外，所有 factor 默认值均为 1.0（恒等乘数），设计意图就是"纹理原样生效"。加载模型时直接读取文件中作者设定的 factor 值，无需强制覆盖。

## 控制机制

纹理贴图不需要独立的开关。`final = factor × texture` 的乘法关系意味着滑条/取色器本身就是控制器：

- 取色器行（`color × map`）：取色器 = 白色 → 纹理原样显示；取色器 = 黑色 → 纹理不可见；取色器 = 红色 → 纹理叠加红色调
- 滑条行（`roughness × roughnessMap`）：滑条 = 1 → 纹理完全生效；滑条 = 0 → 纹理被覆盖（全光滑/全不透明等）

纹理字段（`map`、`normalMap` 等）在 `MaterialAppearance` 中有值即绑定，`undefined` 即不存在。加载时从 `THREE.Texture` 序列化为 data-URI 存入 `materialOriginals`，"重置为原始"可恢复。用户通过滑条/取色器调节 factor 值，通过 `apply()` 写入 override，数据流与现有 PBR 属性一致。

## 数据提取

`cloneMaterial.ts` 的 `materialToAppearance()` 需要增加纹理提取逻辑：遍历 `THREE.Material` 上每个已知的纹理槽位，若存在 `THREE.Texture`，则：

1. 从 `texture.source.data`（`ImageBitmap` 或 `HTMLImageElement`）生成 20×20 缩略图 data-URI，以纹理引用地址为 key 缓存
2. 将原始纹理也序列化为 data-URI 存入对应 `MaterialAppearance` 字段
3. 若纹理来源于 GLB 内嵌 image，则保留其 mimeType 信息

对于外部文件引用的纹理（glTF 分离模式），在 `gltfToGlb` 转换阶段已嵌入为 data-URI，所以加载后的纹理总是内嵌的，序列化是安全的。单个纹理处理耗时 <2ms，不阻塞 UI。

## alphaMode 与不透明度的整合

### 术语

`opacity` 正确翻译为**"不透明度"**——值越大越不透明。0 = 全透明，1 = 全不透明。"透明度"是反向概念（transparency = 1 - opacity），不应使用。

### 现状问题

- `alphaMode` 在 Misc 区，不透明度滑条在 Base 区，用户看不出关联
- `alphaMode = OPAQUE` 时不透明度滑条可拖动但完全无效
- `alphaMode = MASK` 时实际生效的是 `alphaCutoff` 裁剪阈值，但显示滑条标签仍然是"不透明度"

### 新设计

`alphaMode` 从 Misc 区移到 Base 区，与不透明度滑条整合在同一控件区。三种模式，三个分段按钮，**滑条永远显示**：

```
不透明度   [不透明] [遮罩] [半透明]
不透明度                    1        ← 禁用，锁定为 1
[========slider disabled========]

不透明度   [不透明] [遮罩] [半透明]
裁剪阈值                   0.5       ← 控制 alphaCutoff
[========slider========]

不透明度   [不透明] [遮罩] [半透明]
不透明度                   0.8       ← 控制 opacity
[========slider========]
```

当 `alphaMap` 纹理存在时，按 PBR 纹理规则在滑条行内联显示缩略图和 ` x` 后缀。

### 行为表

| 模式 | 滑条标签 | 滑条控制 | 值域 | 滑条状态 |
|---|---|---|---|---|
| 不透明 | 不透明度 | `opacity` | 锁定为 1 | 禁用，不可拖动 |
| 遮罩 | 裁剪阈值 | `alphaCutoff` | 0–1 | 可用 |
| 半透明 | 不透明度 | `opacity` | 0–1 | 可用 |

**每个模式记住各自的滑条位置**：切换模式时滑条恢复该模式上次的值，而非用当前滑条值覆盖。遮罩的"裁剪阈值 0.5"和半透明的"不透明度 0.8"是两个独立的值，切换不应互相污染。

在不透明模式下，滑条锁定为 1 且置灰。底层实际仍走 OPAQUE 渲染队列——滑块=1 只是 UI 表达，Three.js 内部 `transparent: false` 保证深度缓冲正确。

Misc 区移除 `alphaMode` 下拉和 `alphaCutoff` 滑条。

## 与 GLB 扩展面板的交互

两个功能操作相同的材质属性但粒度不同：

- GLB 扩展面板的开关：文件级，如关闭 `KHR_materials_transmission` → 所有 part 的 `transmission` 重置为 0
- 材质编辑器的纹理控制：per-part 级，通过滑条调节的是某个 part 的 factor 值

两者不会冲突——扩展面板关闭的是扩展对应的属性值，材质编辑器控制的是 factor × texture 中的 factor。若同时操作同一属性（如扩展关掉了 transmission，材质编辑器又调了 transmission 的 factor），各自独立生效。

## A/B 对比按钮

取消顶部的"Override Material"全局开关。在 footer 用两态按钮替代：保留两份快照——原始材质（加载时的值）和当前编辑结果，一键切换 A/B 对比。

- 默认显示"**恢复原始材质**"——点击后临时切回原始材质，按钮变为"**恢复为最新修改**"
- 再次点击"恢复为最新修改"——切回当前编辑结果，按钮恢复为"恢复原始材质"
- 此切换不影响编辑状态——随时可以切回修改版
- 若当前 part 没有任何修改（原始 = 当前），按钮置灰禁用

## 涉及的变更文件

| 文件 | 变更性质 |
|---|---|
| `src/renderer/engine/components/cloneMaterial.ts` | `materialToAppearance()` 增加纹理提取逻辑（缩略图生成 + data-URI 序列化） |
| `src/renderer/components/panels/MaterialEditor.tsx` | 每个 PBR 属性行内联纹理缩略图（有纹理时显示缩略图+数值后缀 ` x`，无纹理时行不变）；滑条宽度全有或全无 |
| `src/renderer/locales/zh.json` | 新增纹理相关文案 |
| `src/renderer/locales/en.json` | 新增纹理相关文案 |

## UI 参考

Mockup 文件：`docs/design/material-editor-mockup.html`

两个面板并排展示——左侧 Body Material（含 4 张纹理，展示缩略图内联、数值后缀、滑条缩短），右侧 Glass Material（无纹理，展示保持原样）。

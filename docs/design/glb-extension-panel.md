# GLB 扩展面板 — 设计文档

## 概述

在左侧场景栏中，对 GLB 文件节点右键单击弹出上下文菜单，菜单中包含"GLB 扩展"选项。点击后弹出一个独立的浮窗面板，展示当前 GLB 模型中的四大类信息：

1. **扩展** — glTF 扩展清单（支持/不支持/未知）
2. **材质** — 文件中所有材质的属性概览（只读）
3. **纹理** — 文件中所有纹理的属性概览（只读）
4. **动画** — 文件中包含的动画数据（只读）

全部为只读信息展示，不提供任何编辑操作。

职责划分：

| 内容 | 归属面板 | 原因 |
|---|---|---|
| glTF 扩展清单（支持/不支持） | **GLB 扩展面板** | 扩展是文件级的元信息，仅做信息展示 |
| 材质属性一览（name、alphaMode、doubleSided、实例数、纹理引用数） | **GLB 扩展面板** | 材质索引和基本属性概览，帮助快速了解文件内容 |
| 纹理属性一览（uri、引用数、MIME、分辨率、尺寸、压缩格式） | **GLB 扩展面板** | 纹理元信息概览，帮助判断渲染质量和性能瓶颈 |
| 纹理贴图预览与编辑控制 | **材质编辑器** | 纹理是 per-material-slot 的属性，编辑操作归材质编辑器 |
| 纹理相关扩展（如 `KHR_texture_transform`） | **GLB 扩展面板**（仅信息展示） | 扩展声明是文件级的，但纹理控制仍在材质编辑器 |
| 动画列表 | **GLB 扩展面板** | 动画是文件级资源，当前无其他面板承载 |
| PBR 材质属性编辑 | **材质编辑器** | 已有功能 |

核心原则：**文件级元信息归 GLB 扩展面板，材质/纹理的编辑控制归材质编辑器**。

## 动机

- GLB 文件可携带数十种 glTF 扩展，Three.js 的 `GLTFLoader` 在解析时静默处理它们，用户对此完全无感知
- 了解模型使用了哪些扩展及其支持状态，有助于判断渲染质量问题的根因（如 Draco 压缩未被解码、KTX2 纹理未正确转码）
- 当前项目仅显式处理 `STEP_T`（自定义 CAD 拓扑扩展），其余扩展一概不可见
- GLB 材质包含 alphaMode、doubleSided 等关键渲染属性，用户无法在不打开材质编辑器的情况下概览这些信息
- 纹理的原始格式、分辨率、压缩方式直接影响渲染质量和显存占用，缺乏可见性
- 许多 GLB 文件包含动画数据，但项目当前完全忽略

## 设计思路

### 数据从哪里来

当前 GLB 加载路径只取 `gltf.scene` 提取 mesh，丢弃了解析结果中的其他数据：

```
GLTFLoader.parseAsync(buffer)
  → gltf.scene          ← 当前只用这个
  → gltf.parser.json    ← 原始 glTF JSON，含 extensionsUsed/extensionsRequired/materials/textures/images/animations 等
  → gltf.parser.extensions ← 已知扩展的插件实例，可用于判断哪些扩展被实际加载
  → gltf.animations     ← 解析后的 THREE.AnimationClip[]
```

**设计决策**：在 `LoaderResult` 上增加一个可选字段 `gltfExtensions`，携带解析出的扩展、材质、纹理和动画元信息。加载非 GLB 格式时该字段为空，GLB 面板据此判断是否可用。

**关键要求**：从 `gltf.parser.json`（原始 glTF JSON）和 `GLTFLoader` 解析结果中提取数据。数据提取逻辑必须是**纯函数**——输入 `GLTF` 对象（`GLTFLoader.parseAsync` 的返回值），输出结构化的元信息。这样可以在单元测试中直接调用 GLTFLoader 解析文件、再调用提取函数验证结果，**无需启动 Electron 或 Playwright**。

### 各数据块的来源细节

**扩展**：
- `gltf.parser.json.extensionsUsed` → used 列表
- `gltf.parser.json.extensionsRequired` → required 列表（可能为 undefined）
- 比对 `gltf.parser.extensions` 已知插件列表判断是否被实际加载（supported / unsupported）
- 未出现在分类表中的扩展标记为 unknown

**材质**：
- `gltf.parser.json.materials[]` → 原始 glTF 材质数组
- 每个材质的字段：`name`、`alphaMode`（默认 `OPAQUE`）、`doubleSided`（默认 `false`）
- 实例数：遍历 `gltf.parser.json.meshes[].primitives[].material`，统计每个材质索引被引用的次数
- 纹理槽位数：遍历材质的所有纹理引用——`pbrMetallicRoughness.baseColorTexture`、`pbrMetallicRoughness.metallicRoughnessTexture`、`normalTexture`、`occlusionTexture`、`emissiveTexture`，以及 `extensions` 内各扩展的纹理字段（如 `KHR_materials_anisotropy.anisotropyTexture`、`KHR_materials_clearcoat.clearcoatNormalTexture`），统计非 null 的纹理引用数

**纹理**：
- `gltf.parser.json.textures[]` → glTF 纹理数组，每个包含 `sampler` 和 `source`（image 索引）
- `gltf.parser.json.images[]` → 图像源数组，每个包含 `uri`（或 `bufferView`）、`mimeType`、`name`
- 槽位（slots）：反向遍历所有材质的所有纹理引用，记录每个纹理被哪些材质槽位使用。格式为 `"material[N].slotName"`，对扩展纹理为 `"material[N].extName.fieldName"`
- 实例数：统计有多少个不同材质引用该纹理（槽位数可能多于实例数，因为同一材质可引用同一纹理用于多个槽位）
- MIME 类型：来自 `image.mimeType`
- 压缩格式：根据 `mimeType` 或 `uri` 后缀判断 — `image/ktx2` → KTX2/BasisU，无特殊格式 → "无"
- 分辨率：来自 `THREE.Texture.image.width × height`（纹理已由 GLTFLoader 加载）。若 image 尚未加载（异步纹理），显示 "—"
- 尺寸：来自对应 `bufferView.byteLength`（若纹理内嵌），否则从 `THREE.Texture.image` 估算

**动画**：
- `gltf.parser.json.animations[]` → 名称和通道数
- `gltf.animations[]` → `THREE.AnimationClip` 数组，每项有 `name` 和 `duration`

### 材质数据的展示

材质表展示 `gltf.parser.json.materials[]` 中每个元素的以下字段，纯只读：

| 列 | 来源 | 说明 |
|---|---|---|
| # | 数组索引 | 材质在 glTF JSON materials 数组中的索引 |
| name | `material.name` | 材质名称，可能为空，空时显示 `(unnamed)` |
| instances | 统计 | 被多少个 mesh primitive 引用（一个 mesh 有多个 primitive 则各算一次） |
| textures | 统计 | 该材质有多少个非 null 的纹理槽位（含扩展纹理） |
| alphaMode | `material.alphaMode` | OPAQUE / BLEND / MASK；缺省显示 OPAQUE |
| doubleSided | `material.doubleSided` | true / false；缺省显示 false |

### 纹理数据的展示

纹理表展示文件中所有纹理的元信息，纯只读：

| 列 | 来源 | 说明 |
|---|---|---|
| # | 数组索引 | 纹理在 glTF JSON textures 数组中的索引 |
| name | `image.name` 或从 uri 提取文件名 | 纹理名称，空时显示 `(unnamed)` |
| uri | `image.uri` 或 `image.bufferView` | 内嵌 data URI 截断至前 50 字符 + "..."；bufferView 显示为 `bufferView://N` |
| slots | 反向查找 | 如 `material[0].baseColorTexture`、`material[0].KHR_materials_clearcoat.clearcoatNormalTexture` |
| instances | 统计 | 被多少个不同材质引用（去重 material index） |
| mimeType | `image.mimeType` | 如 `image/png`、`image/jpeg`、`image/ktx2` |
| compression | 推断 | KTX2/BasisU / Draco / WebP / AVIF / 无 |
| resolution | `THREE.Texture.image.width × height` | 如 `2048x2048`；纹理未加载时显示 `—` |
| size | `bufferView.byteLength` 或估算 | 内嵌纹理的文件大小；外部纹理可显示 `—` 或估算 GPU 内存 |

### 动画数据的展示

动画只做**存在性展示**，不做交互：

| 列 | 来源 | 说明 |
|---|---|---|
| # | 数组索引 | 动画在 glTF JSON animations 数组中的索引 |
| name | `animation.name` 或 `gltf.parser.json.animations[i].name` | 动画名称 |
| duration | `THREE.AnimationClip.duration` | 秒，保留 1 位小数 |
| channels | `gltf.parser.json.animations[i].channels.length` | 动画通道数 |

### 扩展如何分类

面板将扩展按支持状态分为三类，纯信息展示，不提供任何开关操作。

**已支持**：Three.js GLTFLoader 内置处理这些扩展，加载时自动生效。

| 扩展名 | 类别 | 说明 |
|---|---|---|
| `KHR_materials_clearcoat` | 材质 | 清漆涂层效果 |
| `KHR_materials_sheen` | 材质 | 光泽效果 |
| `KHR_materials_transmission` | 材质 | 玻璃/透射效果 |
| `KHR_materials_ior` | 材质 | 折射率 |
| `KHR_materials_specular` | 材质 | 高光控制 |
| `KHR_materials_anisotropy` | 材质 | 各向异性 |
| `KHR_materials_iridescence` | 材质 | 虹彩效果 |
| `KHR_materials_emissive_strength` | 材质 | 自发光强度 |
| `KHR_materials_volume` | 材质 | 体积/衰减 |
| `KHR_materials_dispersion` | 材质 | 色散 |
| `KHR_materials_unlit` | 材质 | 无光照材质 |
| `KHR_materials_pbrSpecularGlossiness` | 材质 | 旧版 PBR 工作流，自动转换为 metal/rough |
| `KHR_mesh_quantization` | 几何 | 量化顶点属性 |
| `KHR_texture_transform` | 纹理 | UV 变换 |
| `EXT_texture_webp` | 纹理 | WebP 纹理 |
| `EXT_texture_avif` | 纹理 | AVIF 纹理 |
| `MSFT_texture_dds` | 纹理 | DDS 纹理 |
| `KHR_lights_punctual` | 光照 | 点光源/方向光 |
| `KHR_draco_mesh_compression` | 几何 | Draco 几何解压，已注册 `DRACOLoader` + WASM |
| `KHR_texture_basisu` | 纹理 | KTX2/BasisU 纹理转码，已注册 `KTX2Loader` + WASM |
| `EXT_texture_webp` | 纹理 | WebP 纹理，已注册 |
| `EXT_mesh_gpu_instancing` | 几何 | GPU 实例化渲染 |

**不支持**：扩展出现在文件中，但因缺少相应解码器注册而未被处理。标记为警告样式，提示用户渲染可能不完整。

| 扩展名 | 类别 | 说明 |
|---|---|---|
| `EXT_meshopt_compression` | 几何 | Meshopt 几何解压，需注册 `MeshoptDecoder` |

注：若"不支持"的扩展同时出现在 `extensionsRequired` 中，则模型加载本身会失败（Three.js 行为）。

**未知**：在 `extensionsUsed` 中出现但不在上述两类中的扩展。Three.js 会将其存入 `object.userData.gltfExtensions`，不做任何处理。面板以灰色标记显示。

**自定义扩展**：
- `STEP_T` — 项目自身的 CAD 拓扑扩展，归类为 `custom`

### 面板展示方式

GLB 扩展面板是一个**独立的浮窗**，与右侧栏面板（ModelInfo、History、Environment、FileList）完全无关——不互斥、不共享容器。展示方式与材质编辑器浮窗相同：固定定位、可拖拽标题栏、独立的显示/隐藏状态。

面板内部按四大区块垂直排列，每块使用可折叠区域（accordion/collapsible section）：

1. **扩展** — 分类表格（已支持 / 不支持 / 未知）
2. **材质** — 材质属性表格
3. **纹理** — 纹理属性表格
4. **动画** — 动画列表表格

各区块独立折叠，默认全部展开。面板宽度固定（约 680px），高度自适应内容（最大不超过视口 80%，超出后对应区块内部滚动）。

若某区块无数据（如文件无纹理），该区块折叠并显示"无纹理"等提示文案，仍可展开查看空状态。

触发方式：在左侧场景栏中右键单击 GLB 文件节点 → 弹出上下文菜单 → 点击"GLB 扩展"菜单项 → 打开浮窗面板。非 GLB 格式的文件节点不显示该菜单项。

## 测试策略

### 核心原则

**整个数据提取逻辑必须能够通过单元测试完整验证，无需 Electron 或 Playwright。** 测试直接使用 `GLTFLoader.parseAsync()` 解析 GLB 文件，然后调用提取函数获得结果，与预期值对比。

### 测试文件

使用两个 GLB 文件作为固定测试数据，覆盖不同的数据组合：

| 文件 | 覆盖场景 |
|---|---|
| `src/test/fixtures/AnisotropyBarnLamp.glb` | 有扩展 + 有材质 + 有纹理（PNG + 扩展纹理槽位） + 无动画 |
| `src/test/fixtures/RobotExpressive.glb` | 无扩展 + 有材质（无纹理引用） + 无纹理 + 有动画（14 clips，含 duration=0） |
| `src/test/fixtures/bath_day.glb` | 有扩展（含 required） + 有材质（BLEND/MASK alpha） + 有纹理（WebP + `EXT_texture_webp` 扩展纹理源） + 有动画（1 clip, 47 channels） |

### 测试架构

```
数据提取函数（纯函数，位于 formatLoaders.ts 或独立模块）
  ├── extractExtensions(gltf: GLTF) → ExtensionMeta[]
  ├── extractMaterials(gltf: GLTF) → GltfMaterialMeta[]
  ├── extractTextures(gltf: GLTF) → GltfTextureMeta[]
  └── extractAnimations(gltf: GLTF) → GltfAnimationMeta[]

测试文件（vitest）
  ├── formatLoaders.test.ts / glb-extension.test.ts
  │    1. GLTFLoader.parseAsync(fixtureBuffer) → gltf
  │    2. 调用各 extract 函数 → 结果
  │    3. assert 结果与预期值完全一致
  └── GlbExtensionPanel.test.tsx（@testing-library/react）
        - 将 mock 数据传入 store，渲染面板组件，验证表格行数、列值、空状态等
```

### 预期值（Ground Truth）

以下均通过 `gltf-transform inspect` 和直接读取 glTF JSON 获得。

#### AnisotropyBarnLamp.glb

**扩展：**

```
extensionsUsed: [
  "KHR_materials_anisotropy",
  "KHR_materials_clearcoat",
  "KHR_materials_emissive_strength",
  "KHR_materials_transmission",
  "KHR_materials_volume"
]
extensionsRequired: none
分类：全部为 "supported"
```

**材质：**

| # | name | instances | textures | alphaMode | doubleSided |
|---|---|---|---|---|---|
| 0 | lamp metal | 1 | 6 | OPAQUE | false |
| 1 | lamp filament | 1 | 0 | OPAQUE | false |
| 2 | lamp glass | 1 | 0 | OPAQUE | false |

材质 #0 的 6 个纹理槽位明细：`baseColorTexture`、`metallicRoughnessTexture`、`normalTexture`、`occlusionTexture`、`KHR_materials_anisotropy.anisotropyTexture`、`KHR_materials_clearcoat.clearcoatNormalTexture`

**纹理：**

| # | name | uri | slots | instances | mimeType | compression | resolution | size |
|---|---|---|---|---|---|---|---|---|
| 0 | (unnamed) | bufferView://2 | material[0].baseColorTexture | 1 | image/png | 无 | 2048x2048 | 2794184 |
| 1 | (unnamed) | bufferView://0 | material[0].normalTexture, material[0].KHR_materials_clearcoat.clearcoatNormalTexture | 1 | image/png | 无 | 2048x2048 | 65137 |
| 2 | (unnamed) | bufferView://1 | material[0].metallicRoughnessTexture, material[0].occlusionTexture | 1 | image/png | 无 | 2048x2048 | 1300285 |
| 3 | (unnamed) | bufferView://3 | material[0].KHR_materials_anisotropy.anisotropyTexture | 1 | image/png | 无 | 2048x2048 | 573090 |

分辨率确认：每张纹理均经过 `gltf-transform inspect` 验证为 `2048x2048`，对应 GPU 内存约 22.37 MB（RGBA8）。

**动画：** 无

#### RobotExpressive.glb

**扩展：**

```
extensionsUsed: none
extensionsRequired: none
分类：空
```

**材质：**

| # | name | instances | textures | alphaMode | doubleSided |
|---|---|---|---|---|---|
| 0 | Grey | 6 | 0 | OPAQUE | false |
| 1 | Main | 12 | 0 | OPAQUE | false |
| 2 | Black | 1 | 0 | OPAQUE | false |

实例数验证依据 — 遍历所有 mesh primitives：
- Material #0 (Grey): 被 6 个 primitives 引用（Foot.L, Torso.prim0, Head.prim0, Foot.R, Hand.R.prim1, Hand.L.prim1）
- Material #1 (Main): 被 12 个 primitives 引用
- Material #2 (Black): 被 1 个 primitive 引用（Head.prim2）

**纹理：** 无

**动画：**

| # | name | channels | duration |
|---|---|---|---|
| 0 | Dance | 12 | 3.0 |
| 1 | Death | 18 | 1.0 |
| 2 | Idle | 7 | 3.0 |
| 3 | Jump | 18 | 1.0 |
| 4 | No | 7 | 2.0 |
| 5 | Punch | 15 | 1.0 |
| 6 | Running | 18 | 1.0 |
| 7 | Sitting | 10 | 0.0 |
| 8 | Standing | 10 | 0.0 |
| 9 | ThumbsUp | 15 | 2.0 |
| 10 | Walking | 20 | 1.0 |
| 11 | WalkJump | 18 | 1.0 |
| 12 | Wave | 18 | 2.0 |
| 13 | Yes | 7 | 2.0 |

Duration 值来自 `gltf-transform inspect` 输出（对应 `THREE.AnimationClip.duration`）。

#### bath_day.glb

**扩展：**

```
extensionsUsed: [
  "KHR_materials_transmission",
  "EXT_mesh_gpu_instancing",
  "EXT_texture_webp",
  "KHR_draco_mesh_compression"
]
extensionsRequired: ["EXT_texture_webp", "KHR_draco_mesh_compression"]
分类：全部为 "supported"
```

注意：`EXT_texture_webp` 和 `KHR_draco_mesh_compression` 同时出现在 `extensionsRequired` 中，说明缺少解码器会导致加载失败。Three.js GLTFLoader 目前已注册相应解码器，解析正常。

**材质：**

| # | name | instances | textures | alphaMode | doubleSided |
|---|---|---|---|---|---|
| 0 | Pol__0 | 6 | 1 | OPAQUE | true |
| 1 | 07_-_Default | 5 | 1 | BLEND | true |
| 2 | 03_-_Default | 1 | 1 | MASK | true |
| 3 | 08_-_Default | 8 | 2 | BLEND | true |
| 4 | 02_-_Default | 1 | 1 | BLEND | true |
| 5 | 01_-_Default | 1 | 1 | MASK | true |

材质 #3 的 2 个纹理槽位明细：`baseColorTexture`、`KHR_materials_transmission.transmissionTexture`。其余材质仅 `baseColorTexture`。

此文件是唯一覆盖 `alphaMode=BLEND`、`alphaMode=MASK`、`doubleSided=true` 的测试文件。

**纹理：**

| # | name | uri | slots | instances | mimeType | compression | resolution | size |
|---|---|---|---|---|---|---|---|
| 0 | (unnamed) | bufferView://0 | material[0].baseColorTexture | 1 | image/webp | WebP | 2048x2048 | 197914 |
| 1 | (unnamed) | bufferView://1 | material[1].baseColorTexture, material[2].baseColorTexture, material[3].baseColorTexture | 3 | image/webp | WebP | 2048x2048 | 209646 |
| 2 | (unnamed) | bufferView://3 | material[4].baseColorTexture, material[5].baseColorTexture | 2 | image/webp | WebP | 2048x2048 | 157928 |
| 3 | (unnamed) | bufferView://2 | material[3].KHR_materials_transmission.transmissionTexture | 1 | image/webp | WebP | 2048x2048 | 16500 |

**关键实现细节：** 此文件使用 `EXT_texture_webp` 扩展，纹理的 `source` 不在 `texture.source` 而在 `texture.extensions.EXT_texture_webp.source`。提取函数必须优先检查扩展纹理源：

```
imageIndex = texture.extensions?.EXT_texture_webp?.source ?? texture.source
```

所有纹理为 WebP 格式（`image/webp`），compression 列应显示 `"WebP"`。4 张纹理全部 2048x2048 分辨率，bufferView 文件大小差异巨大（16.5 KB ~ 209.6 KB），体现了 WebP 在不同内容上的压缩效率。

**动画：**

| # | name | channels | duration |
|---|---|---|---|
| 0 | Take 001 | 47 | 3.0 |

单个动画，47 个通道覆盖整个场景（含 GPU 实例化网格的骨骼动画）。

### 测试用例清单

**formatLoaders.test.ts / glb-extension.test.ts（vitest，解析真实 GLB 文件）：**

1. **AnisotropyBarnLamp — 扩展提取**：验证 5 个扩展均被识别、全部分类为 supported、extensionsRequired 为空
2. **AnisotropyBarnLamp — 材质提取**：验证 3 个材质，字段完全匹配上表（name、instances、textures、alphaMode、doubleSided）。材质 #0 的 6 个纹理槽位含扩展纹理（`KHR_materials_anisotropy.anisotropyTexture`、`KHR_materials_clearcoat.clearcoatNormalTexture`）
3. **AnisotropyBarnLamp — 纹理提取**：验证 4 个纹理，字段完全匹配上表（slots 列表、instances、mimeType、compression、resolution、size）。纹理 #1 有 2 个槽位，纹理 #2 有 2 个槽位（同材质不同用途）
4. **AnisotropyBarnLamp — 动画提取**：验证 animations 数组为空
5. **RobotExpressive — 扩展提取**：验证无扩展（used 和 required 均为空数组）
6. **RobotExpressive — 材质提取**：验证 3 个材质，instances 分别为 6、12、1，全部无纹理引用
7. **RobotExpressive — 纹理提取**：验证无纹理
8. **RobotExpressive — 动画提取**：验证 14 个动画，名称、channels、duration 完全匹配。含 duration=0 的动画（Sitting、Standing）
9. **bath_day — 扩展提取**：验证 4 个扩展，2 个 required（`EXT_texture_webp`、`KHR_draco_mesh_compression`），全部分类为 supported
10. **bath_day — 材质提取**：验证 6 个材质，含 BLEND/MASK alphaMode、doubleSided=true、instances 最大值 8
11. **bath_day — 纹理提取**：验证 4 张 WebP 纹理，source 来自 `EXT_texture_webp` 扩展。纹理 #1 有 3 个 instances，纹理 #2 有 2 个 instances
12. **bath_day — 动画提取**：验证 1 个动画，47 channels，duration=3.0
13. **非 GLB 格式**：验证返回空的 gltfExtensions

**GlbExtensionPanel.test.tsx（@testing-library/react，组件测试）：**

1. 渲染四区块面板，验证各区块标题存在
2. 传入 mock 扩展数据，验证表格行数和内容渲染
3. 传入 mock 材质数据，验证 6 列渲染和数据值
4. 传入 mock 纹理数据，验证 slots 列以逗号分隔展示
5. 传入 mock 动画数据，验证 duration 格式化
6. 空数据处理：无纹理时显示"无纹理"，无动画时显示"无动画"
7. 各区块可折叠/展开
8. 标题栏可拖拽

## 核心接口定义

### `LoaderResult` 扩展

在 `src/renderer/engine/formatLoaders.ts` 的 `LoaderResult` 接口中增加字段，仅在 glb/gltf 加载时填充：

```typescript
LoaderResult {
  // ... 现有字段不变 ...
  gltfExtensions?: {
    /** glTF JSON 中声明的所有扩展 */
    used: string[]
    /** glTF JSON 中声明的必需扩展（缺少则加载失败） */
    required: string[]
    /** 材质元信息（来自 gltf.parser.json.materials） */
    materials: GltfMaterialMeta[]
    /** 纹理元信息（来自 gltf.parser.json.textures + images + THREE.Texture） */
    textures: GltfTextureMeta[]
    /** 文件中的动画元信息 */
    animations: GltfAnimationMeta[]
  }
}

interface GltfMaterialMeta {
  index: number
  name?: string
  alphaMode: 'OPAQUE' | 'BLEND' | 'MASK'
  doubleSided: boolean
  instanceCount: number
  textureSlotCount: number
}

interface GltfTextureMeta {
  index: number
  name?: string
  uri?: string                // image.uri 或 "bufferView://N"
  mimeType?: string           // image/png, image/jpeg, image/ktx2 等
  slots: string[]             // 如 ["material[0].baseColorTexture", "material[0].normalTexture"]
  instanceCount: number       // 被多少个不同材质引用（去重 material index）
  compression?: string        // "KTX2/BasisU" | "Draco" | "WebP" | "AVIF" | "无"
  resolution?: { width: number; height: number }
  sizeEstimate?: number       // 字节，bufferView 文件大小
}

interface GltfAnimationMeta {
  index: number
  name?: string
  duration: number            // 来自 THREE.AnimationClip.duration
  channels: number            // 来自 gltf.parser.json.animations[i].channels.length
}
```

### 数据提取函数（纯函数，可脱离 Electron 测试）

```typescript
// 位置：src/renderer/engine/formatLoaders.ts（与 loadFormat 同文件）

export function extractExtensions(gltf: GLTF): { used: string[]; required: string[] } {
  return {
    used: gltf.parser.json.extensionsUsed ?? [],
    required: gltf.parser.json.extensionsRequired ?? [],
  }
}

export function extractMaterials(gltf: GLTF): GltfMaterialMeta[] {
  const jsonMaterials = gltf.parser.json.materials ?? []
  const jsonMeshes = gltf.parser.json.meshes ?? []
  // 统计每个材质被多少 primitive 引用
  const instanceCounts = new Array(jsonMaterials.length).fill(0)
  jsonMeshes.forEach(mesh => {
    mesh.primitives?.forEach(prim => {
      if (prim.material !== undefined) {
        instanceCounts[prim.material]++
      }
    })
  })
  // 统计每个材质的纹理槽位数（含扩展纹理）
  return jsonMaterials.map((mat, idx) => ({
    index: idx,
    name: mat.name,
    alphaMode: mat.alphaMode ?? 'OPAQUE',
    doubleSided: mat.doubleSided ?? false,
    instanceCount: instanceCounts[idx],
    textureSlotCount: countTextureSlots(mat),
  }))
}

export function extractTextures(gltf: GLTF): GltfTextureMeta[] {
  const jsonTextures = gltf.parser.json.textures ?? []
  const jsonImages = gltf.parser.json.images ?? []
  const jsonMaterials = gltf.parser.json.materials ?? []

  // 反向建表：texture index → 引用它的材质槽位列表
  const texToSlots: Map<number, string[]> = new Map()
  const texToMaterialSet: Map<number, Set<number>> = new Map()

  jsonMaterials.forEach((mat, mi) => {
    collectTextureRefs(mat, mi, (slotName, texIndex) => {
      if (!texToSlots.has(texIndex)) texToSlots.set(texIndex, [])
      texToSlots.get(texIndex)!.push(`material[${mi}].${slotName}`)
      if (!texToMaterialSet.has(texIndex)) texToMaterialSet.set(texIndex, new Set())
      texToMaterialSet.get(texIndex)!.add(mi)
    })
  })

  // 解析 image 索引：优先检查 EXT_texture_webp 等扩展纹理源
  function getImageIndex(tex: unknown): number | undefined {
    return tex?.extensions?.EXT_texture_webp?.source ?? tex?.source
  }

  return jsonTextures.map((tex, idx) => {
    const imgIdx = getImageIndex(tex)
    const img = imgIdx !== undefined ? jsonImages[imgIdx] : undefined
    const bv = img?.bufferView !== undefined ? gltf.parser.json.bufferViews?.[img.bufferView] : undefined
    return {
      index: idx,
      name: img?.name,
      uri: img?.uri ? truncateDataUri(img.uri) : img?.bufferView !== undefined ? `bufferView://${img.bufferView}` : undefined,
      mimeType: img?.mimeType,
      slots: texToSlots.get(idx) ?? [],
      instanceCount: texToMaterialSet.get(idx)?.size ?? 0,
      compression: inferCompression(img?.mimeType, img?.uri),
      resolution: undefined,  // 从 THREE.Texture 获取，在 parse 后填充
      sizeEstimate: bv?.byteLength,
    }
  })
}

export function extractAnimations(gltf: GLTF): GltfAnimationMeta[] {
  const jsonAnims = gltf.parser.json.animations ?? []
  const clips = gltf.animations ?? []
  return jsonAnims.map((a, idx) => ({
    index: idx,
    name: a.name,
    duration: clips[idx]?.duration ?? 0,
    channels: a.channels?.length ?? 0,
  }))
}
```

### 纹理槽位收集（含扩展纹理）

遍历材质的所有已知纹理槽位，包括扩展中的纹理。槽位收集逻辑：

```typescript
const TEXTURE_SLOT_PATHS: SlotPath[] = [
  // pbrMetallicRoughness
  { path: ['pbrMetallicRoughness', 'baseColorTexture'], name: 'baseColorTexture' },
  { path: ['pbrMetallicRoughness', 'metallicRoughnessTexture'], name: 'metallicRoughnessTexture' },
  // 基础纹理
  { path: ['normalTexture'], name: 'normalTexture' },
  { path: ['occlusionTexture'], name: 'occlusionTexture' },
  { path: ['emissiveTexture'], name: 'emissiveTexture' },
  // 扩展纹理
  { path: ['extensions', 'KHR_materials_anisotropy', 'anisotropyTexture'], name: 'KHR_materials_anisotropy.anisotropyTexture' },
  { path: ['extensions', 'KHR_materials_clearcoat', 'clearcoatNormalTexture'], name: 'KHR_materials_clearcoat.clearcoatNormalTexture' },
  { path: ['extensions', 'KHR_materials_transmission', 'transmissionTexture'], name: 'KHR_materials_transmission.transmissionTexture' },
  { path: ['extensions', 'KHR_materials_volume', 'thicknessTexture'], name: 'KHR_materials_volume.thicknessTexture' },
  { path: ['extensions', 'KHR_materials_sheen', 'sheenColorTexture'], name: 'KHR_materials_sheen.sheenColorTexture' },
  { path: ['extensions', 'KHR_materials_sheen', 'sheenRoughnessTexture'], name: 'KHR_materials_sheen.sheenRoughnessTexture' },
  { path: ['extensions', 'KHR_materials_specular', 'specularTexture'], name: 'KHR_materials_specular.specularTexture' },
  { path: ['extensions', 'KHR_materials_specular', 'specularColorTexture'], name: 'KHR_materials_specular.specularColorTexture' },
  { path: ['extensions', 'KHR_materials_iridescence', 'iridescenceTexture'], name: 'KHR_materials_iridescence.iridescenceTexture' },
  { path: ['extensions', 'KHR_materials_iridescence', 'iridescenceThicknessTexture'], name: 'KHR_materials_iridescence.iridescenceThicknessTexture' },
]
```

### 新 Store：`glbExtensionStore`

负责管理当前活动文件的扩展、材质、纹理和动画数据。不持久化。

```typescript
interface GlbExtensionStore {
  usedExtensions: string[]
  requiredExtensions: string[]
  extensions: ExtensionClassified[]   // 分类后的扩展（supported/unsupported/unknown）
  materials: GltfMaterialMeta[]
  textures: GltfTextureMeta[]
  animations: GltfAnimationMeta[]
  modelName: string
  panelVisible: boolean
  panelPosition: { x: number; y: number }

  // Actions
  setGlbData(data: { usedExtensions, requiredExtensions, extensions, materials, textures, animations, modelName }) → void
  setPanelVisible(visible: boolean) → void
  setPanelPosition(pos: { x: number; y: number }) → void
  clear() → void
}
```

Panel 为独立浮窗，其显示状态和位置由 `glbExtensionStore` 自行管理，不在 `ui-store` 中增加任何字段。场景栏右键菜单项直接设置 `glbExtensionStore.panelVisible = true`。

## 边界情况

| 场景 | 行为 |
|---|---|
| 当前加载的是非 GLB 格式（STL/OBJ 等） | 场景栏中该文件节点的右键菜单不包含"GLB 扩展"项 |
| GLB 文件没有使用任何扩展 | 扩展区显示"无扩展使用"，其余区块正常展示 |
| GLB 文件无材质（极罕见，如纯点云） | 材质区显示"无材质" |
| GLB 文件无纹理 | 纹理区显示"无纹理" |
| GLB 文件无动画 | 动画区显示"无动画" |
| 材质 name 为空 | 显示为 `(unnamed)` |
| 纹理 name 为空 | 显示为 `(unnamed)` |
| 纹理 uri 为 bufferView（内嵌） | 显示为 `bufferView://N`（N 为 bufferView 索引） |
| 纹理 source 在扩展中（如 `EXT_texture_webp`） | 优先从 `texture.extensions.EXT_texture_webp.source` 获取 image 索引，fallback 到 `texture.source` |
| 纹理 image 尚未加载（分辨率不可用） | 分辨率列显示 "—" |
| mimeType 缺失 | 根据 uri 后缀推断，无法推断则显示 "unknown" |
| glTF 分离文件（.gltf + .bin + 贴图） | 经过 `gltfToGlb` 转换后扩展/材质/纹理信息保留，面板正常工作 |
| 扩展在 `extensionsUsed` 中但解码器未注册 | 标记为"不支持"，黄色警告样式；若同时出现在 `extensionsRequired` 中则模型加载本身已失败 |
| 多文件同时加载 | 面板展示当前活动文件的数据；切换活动文件时面板内容跟随更新 |
| 模型卸载/重置 | 清空 store，若浮窗正打开则自动关闭 |
| 压缩纹理（KTX2/BasisU） | compression 列显示 "KTX2/BasisU"，resolution 显示转码后的实际尺寸 |
| 同一材质的不同槽位引用同一个纹理 | slots 列列出所有槽位，instanceCount 按材料去重（同一材质引用多次只计 1） |
| 同一纹理被多个材质引用 | instanceCount > 1，slots 列列出所有引用位置 |
| 扩展纹理槽位（如 `KHR_materials_anisotropy.anisotropyTexture`） | 计入材质的 textures 列，也计入纹理的 slots 列，名称使用完整扩展路径 |
| 材质无任何纹理引用 | textures 列显示 0 |

## 涉及的变更文件

| 文件 | 变更性质 |
|---|---|
| `src/renderer/engine/formatLoaders.ts` | `LoaderResult` 增加 `gltfExtensions` 字段；导出 `extractExtensions`、`extractMaterials`、`extractTextures`、`extractAnimations` 纯函数；glb/gltf 分支调用并填充 |
| `src/renderer/stores/glb-extension-store.ts` | **新建** — 扩展/材质/纹理/动画数据管理、浮窗显隐和位置 |
| `src/renderer/components/GlbExtensionPanel.tsx` | **新建** — 扩展面板浮窗 UI（可拖拽，四区块可折叠表格，与 MaterialEditor 同模式） |
| `src/renderer/layouts/DesktopLayout.tsx` | 场景栏 GLB 文件节点右键菜单增加"GLB 扩展"项，点击打开浮窗 |
| `src/renderer/engine/components/ModelGroup.tsx` | 加载完成后向 glbExtensionStore 推送数据 |
| `src/renderer/locales/zh.json` | 新增面板相关文案 |
| `src/renderer/locales/en.json` | 新增面板相关文案 |
| `src/test/formatLoaders.test.ts` 或 `src/test/glb-extension.test.ts` | **新建** — 单元测试：用真实 GLB 文件验证 4 个 extract 函数的输出 |
| `src/renderer/components/__tests__/GlbExtensionPanel.test.tsx` | **新建** — 组件测试：用 @testing-library/react 验证面板渲染 |

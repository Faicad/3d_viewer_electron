# 模型信息面板重构分析文档

## 1. 当前状态

当前 `ModelInfoPanel` 展示两个区域：

| 区域 | 内容 | 适用格式 |
|------|------|---------|
| **整体统计信息** | 顶点数、三角面数、表面积、体积、包围盒尺寸、部件数、文件格式、预估耗材 | 所有格式 |
| **3MF 模型元数据** | 标题、设计师、描述、许可证 | 仅 3MF (Bambu Lab) |

当前实现文件：`src/renderer/components/ModelInfoPanel.tsx`
相关类型：
- `ComputedModelStats` — 全局几何统计（文件级）
- `BambuModelMeta` — 3MF 特定元数据（title, designer, description, license）
- `Bambu3mfMetadata` — 完整 3MF 元数据（含 filament, plates, parts, transforms 等）

## 2. 目标结构（三部分）

```
┌─ 模型信息 ─────────────────────┐
│                                 │
│ ── 选中零件信息 ──              │  ← 新增
│  零件名: xxx                    │
│  顶点数: 12,345                 │
│  三角面: 6,789                  │
│  表面积: 123.4 mm²             │
│  体积: 56.7 mm³                │
│  材料: PLA (挤出器 1)          │  ← 3MF only
│  底板: 1                        │  ← 3MF only
│                                 │
│ ── 文件信息 ──                  │  ← 原"整体统计信息"，扩展
│  文件名: model.stl              │
│  文件大小: 2.3 MB               │
│  顶点数: 98,765                 │
│  三角面: 45,678                 │
│  表面积: 789.0 mm²             │
│  体积: 123.4 mm³               │
│  包围盒: 10 × 20 × 30 mm       │
│  部件数: 5                      │
│  文件格式: STL                  │
│  预估耗材: 45.6 g (PLA)        │
│                                 │
│ ── 文件元数据 ──                │  ← 原"模型元数据"，扩展为通用
│  标题: My Model                 │
│  设计者: user                   │
│  描述: ...                      │
│  许可证: BY-ND                  │
│  生成软件: Bambu Studio 1.8.0   │
│  创建时间: 2024-01-15           │
│  [格式特有信息...]              │
└─────────────────────────────────┘
```

## 3. 各 3D 文件格式元数据能力分析

### 3.1 STL

- **格式标准无元数据能力**。二进制 STL 有 80 字节 header 字段（通常为空或被忽略），无结构化元数据。
- **不展示"文件元数据"区域**。

### 3.2 GLB / glTF 2.0

glTF 2.0 的 `asset` 对象是标准元数据容器：

| 原始字段名 | 标准定义 | 示例值 |
|-----------|---------|-------|
| `asset.generator` | ✅ 标准 | `"Khronos glTF Blender I/O v3.6"` |
| `asset.version` | ✅ 标准 | `"2.0"` |
| `asset.minVersion` | ✅ 标准 | `"2.0"` |
| `asset.copyright` | ✅ 标准 | `"(c) 2024 Author Name"` |
| `extras` 中的自定义字段 | ⚠️ 非标准容器 | 任意 JSON |

**不属于元数据**（模型数据，已在 GlbExtensionPanel 中展示）：
- `materials[]` — 模型材质数据
- `textures[]` — 纹理数据
- `animations[]` — 动画数据
- `extensionsUsed/Required` — 扩展使用情况
- `meshes[]`、`nodes[]`、`accessors[]` — 几何数据

### 3.3 3MF (ISO标准 + Bambu Lab 扩展)

3MF 标准 `<metadata>` 标签是一等元数据容器，每个 `<metadata name="...">` 都是原始键值对：

| 原始字段名（name 属性值） | 标准 | 来源 |
|--------------------------|------|------|
| `Title` | ✅ ISO 3MF | `3D/3dmodel.model` 中的 `<metadata name="Title">` |
| `Designer` | ✅ ISO 3MF | `<metadata name="Designer">` |
| `Description` | ✅ ISO 3MF | `<metadata name="Description">` |
| `License` | ✅ ISO 3MF | `<metadata name="License">` |
| `Application` | ✅ ISO 3MF | `<metadata name="Application">` |
| `CreationDate` | ✅ ISO 3MF | `<metadata name="CreationDate">` |
| `ModificationDate` | ✅ ISO 3MF | `<metadata name="ModificationDate">` |
| 其他任意 `<metadata name="...">` | ✅ 标准扩展 | 按原始 name/value 展示 |

**不属于元数据**（模型数据）：
- `filament_colour` / `filament_type` — Bambu 打印配置，属于打印机设置而非文件元数据
- 部件/对象层级结构 — 模型数据结构
- 底板分配、挤出器分配 — 切片配置
- 装配/导入变换矩阵 — 几何变换数据
- 缩略图 — 预览资源

**注意**：当前已提取 `Title`/`Designer`/`Description`/`License`，但未提取 `Application`/`CreationDate`/`ModificationDate` 及其他可能的 `<metadata name="...">` 标签。

### 3.4 STEP / STP (AP242)

STEP 文件遵循 ISO 10303-21 纯文本格式，`HEADER` 段包含结构化元数据：

| 原始字段名 | 标准 | 示例值 | 当前状态 |
|-----------|------|-------|---------|
| `FILE_NAME.name` | ✅ ISO 10303-21 | `"model.stp"` | ❌ 未提取 |
| `FILE_NAME.time_stamp` | ✅ ISO 10303-21 | `"2024-01-15T10:30:00"` | ❌ 未提取 |
| `FILE_NAME.author` | ✅ ISO 10303-21 | `("John Doe")` | ❌ 未提取 |
| `FILE_NAME.organization` | ✅ ISO 10303-21 | `("Acme Corp")` | ❌ 未提取 |
| `FILE_NAME.preprocessor_version` | ✅ ISO 10303-21 | `"SolidWorks 2024"` | ❌ 未提取 |
| `FILE_NAME.originating_system` | ✅ ISO 10303-21 | `"SolidWorks 2024"` | ❌ 未提取 |
| `FILE_NAME.authorization` | ✅ ISO 10303-21 | `"..."` | ❌ 未提取 |
| `FILE_DESCRIPTION.description` | ✅ ISO 10303-21 | `("STEP AP242")` | ❌ 未提取 |
| `FILE_DESCRIPTION.implementation_level` | ✅ ISO 10303-21 | `"2;1"` | ❌ 未提取 |
| `FILE_SCHEMA` | ✅ ISO 10303-21 | `("AUTOMOTIVE_DESIGN_CC_AP242")` | ❌ 未提取 |

**不属于元数据**（模型数据）：
- B-rep 拓扑数据（faces/edges/vertices）— 几何拓扑数据
- 产品定义层次结构 — 模型结构数据
- 部件名称 — 模型结构数据
- 单位 — 已在文件信息中展示

**HEADER 原始格式**：
```
ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('STEP AP242'), '2;1');
FILE_NAME('model.stp', '2024-01-15T10:30:00', ('Author Name'), ('Organization Name'),
  'Preprocessor Version', 'Originating System', 'Authorization');
FILE_SCHEMA(('AUTOMOTIVE_DESIGN_CC_AP242'));
ENDSEC;
...
```

**实现方式**：需要纯文本解析 STEP 文件开头的 `HEADER` 段（正则提取）。OCCT WASM 当前不暴露这些信息。

### 3.5 其他格式简要分析

| 格式 | 元数据能力 | 可展示的原始字段 |
|------|-----------|----------------|
| OBJ | ❌ 极有限 | 无结构化字段，可尝试提取注释行（以 `#` 开头） |
| AMF | ✅ XML metadata | `<metadata type="..." group="...">value</metadata>` |
| 3DM | ⚠️ WASM | Rhino 用户文本属性（当前未提取） |
| PLY | ⚠️ 有限 | Header 中的 `comment` 行 |
| VRML | ⚠️ 有限 | `WorldInfo { title "..." info ["..."] }` |
| FBX/USDZ/DAE/3DS | ❌ 当前 | 未解析元数据 |
| GCode | ❌ | 纯文本指令，无结构化元数据 |

## 4. 元数据展示方案

### 核心原则

1. **不统一字段名** — 每种格式展示其原始的元数据字段名称，不加抽象层
2. **区分元数据与模型数据** — 仅展示"关于文件的信息"，材质/纹理/动画/几何拓扑/变换矩阵等不在此处展示
3. **按格式分区展示** — 根据 `modelFormat` 显示对应的元数据区域，其他区域隐藏

### 4.1 数据模型

```typescript
// LoadedFileModel 中新增字段
interface LoadedFileModel {
  // ... 现有字段 ...
  fileMeta?: FileMeta     // 新增：文件元数据
}

interface FileMeta {
  /** 格式类型，用于决定渲染哪个元数据区域 */
  format: FormatId

  /** 3MF 元数据 — 原始键值对 */
  '3mf'?: {
    entries: Array<{ name: string; value: string }>  // 直接来自 <metadata name="..." 标签
    // name 原始值如 "Title"、"Designer"、"Application"、"CreationDate" 等
  }

  /** GLB 元数据 */
  'glb'?: {
    generator?: string      // asset.generator
    version?: string        // asset.version
    minVersion?: string     // asset.minVersion
    copyright?: string      // asset.copyright
    extras?: Record<string, unknown>  // 任意自定义 extras
  }

  /** STEP 元数据（来自 ISO 10303-21 HEADER） */
  'step'?: {
    name?: string
    time_stamp?: string
    author?: string
    organization?: string
    preprocessor_version?: string
    originating_system?: string
    authorization?: string
    file_description?: string
    implementation_level?: string
    file_schema?: string
  }
}
```

### 4.2 展示规则

| 格式 | 元数据区域标题 | 内容 |
|------|--------------|------|
| 3MF | `"3MF Metadata"` | 遍历 `entries[]` 以 `<name>: <value>` 形式逐行展示 |
| GLB | `"glTF Metadata"` | generator, version, minVersion, copyright, extras 子项 |
| STEP | `"STEP Header"` | 原始 HEADER 字段名逐行展示 |
| STL | — | 无元数据区域 |
| 其他 | — | 无元数据区域 |

### 4.3 展示示例

**3MF 文件**：
```
── 3MF Metadata ──
  Title: Table Vise
  Designer: 3D anarchy
  Description: A parametric vise for 3D printing
  License: BY-ND
  Application: BambuStudio 01.08.01.58
  CreationDate: 2024-01-15
  ModificationDate: 2024-01-16
```

**GLB 文件**：
```
── glTF Metadata ──
  generator: Khronos glTF Blender I/O v3.6.27
  version: 2.0
  minVersion: 2.0
  copyright: (C) 2024, Example Corp.
```

**STEP 文件**：
```
── STEP Header ──
  name: vise-assembly.stp
  time_stamp: 2024-06-15T14:30:00+00:00
  author: John Smith
  organization: Acme Corp
  originating_system: SolidWorks 2024 SP5
  preprocessor_version: SolidWorks STEP AP242 Export
  file_description: STEP AP242
  file_schema: AUTOMOTIVE_DESIGN_CC_AP242
```

**STL 文件**：无"文件元数据"区域。

## 5. 实现建议

### 5.1 现有基础设施

**选中状态已有**（无需新增 Store）：
- `selection-store.ts`: `selectedReferenceIds: string[]` — 数组支持 Shift 多选
- `setSelectedReference(id, { shiftKey })` — 普通点击替换，Shift 点击切换
- 场景树点击（`DesktopLayout.tsx:92-99`）和 3D 画布拾取（`useTopologyPicking.ts:476`）均传入 `event.shiftKey`

**单零件统计函数已有**（无需新增）：
- `compute-model-stats.ts`: `computeMeshStats(mesh)` — 返回单 Mesh 的 vertices, triangles, surfaceArea, volume, box
- `model-store.ts`: `GlbPartInfo` — 已有 `name`, `triangleCount`, `extruder?`, `plateId?`, `objectId?`

**需要新增的只是映射逻辑**：
1. 从 `modelGroup` 中按 `userData.partId` 找到对应 `THREE.Mesh`
2. 对选中的每个 Mesh 调用 `computeMeshStats(mesh)`
3. 合并多选时多个 Mesh 的统计（或列出每个选中零件）

```typescript
// compute-model-stats.ts — 新增导出函数
export function findMeshesByPartIds(group: THREE.Group, partIds: string[]): THREE.Mesh[]

export interface PartStats {
  partId: string
  name: string
  vertices: number
  triangles: number
  surfaceArea: number
  volume: number
  boundingBox: THREE.Box3
}
```

### 5.2 边界情况处理

#### 场景一：单个模型文件（`partCount === 1`）

文件只有一个零件时，选中零件信息与文件信息内容完全重复。此时：
- **不展示"选中零件信息"区域**
- 文件信息区域正常展示
- 判断条件：`stats.partCount <= 1`

#### 场景二：多选多个零件

`selectedReferenceIds` 包含多个 ID，如 `["screw-001", "nut-003", "washer-007"]`。

展示方式（初版用简洁模式）：
```
── 选中零件 (3) ──
  顶点总和: 2,570
  三角面总和: 924
  表面积总和: 25.7 mm²
  体积总和: 10.6 mm³
```

后续可扩展为列表模式：
```
── 选中零件 (3) ──
  screw-001: 1,230 顶点 / 456 三角面 / 12.3 mm² / 5.6 mm³
  nut-003:   890 顶点 / 312 三角面 / 8.9 mm² / 3.2 mm³
  washer-007: 450 顶点 / 156 三角面 / 4.5 mm² / 1.8 mm³
```

实现逻辑：
```typescript
const selectedPartIds = useSelectionStore((s) => s.selectedReferenceIds)
// 过滤出有效的 partId（排除 group 节点 ID）
const validPartIds = selectedPartIds.filter(id => isValidPartId(id, modelGroup))
const selectedPartStats = useMemo(() => {
  return validPartIds.map(id => {
    const mesh = findMeshByPartId(modelGroup, id)
    return mesh ? { partId: id, ...computeMeshStats(mesh) } : null
  }).filter(Boolean)
}, [modelGroup, validPartIds])
// 多选时合并统计
const mergedStats = useMemo(() => {
  if (!selectedPartStats || selectedPartStats.length === 0) return null
  return {
    count: selectedPartStats.length,
    vertices: selectedPartStats.reduce((s, p) => s + p.vertices, 0),
    triangles: selectedPartStats.reduce((s, p) => s + p.triangles, 0),
    surfaceArea: selectedPartStats.reduce((s, p) => s + p.surfaceArea, 0),
    volume: selectedPartStats.reduce((s, p) => s + p.volume, 0),
  }
}, [selectedPartStats])
```

#### 场景三：选中场景树的组节点（`meshIndex === undefined`）

场景树中存在非叶节点（组节点）：
- **GLTF 层级组节点** — 由 `buildSceneTree()` 从 `THREE.Object3D.children` 生成，`meshIndex === undefined`
- **Bambu 3MF 底板节点** — ID 如 `"plate-1"`、`"plate-2"`，`meshIndex === undefined`

**当前已有问题**：组节点 ID 进入 `selectedReferenceIds` 后，`SelectionHighlight` 和 `SelectionBoundingBox` 都找不到对应 mesh，不渲染任何高亮。

**处理方法（初版）**：
```typescript
function isValidPartId(id: string, modelGroup: THREE.Group | null): boolean {
  if (!modelGroup) return false
  let found = false
  modelGroup.traverse((child) => {
    if (child instanceof THREE.Mesh && child.userData.partId === id) found = true
  })
  return found
}
```
- 选中 ID 为有效 partId → 展示零件统计
- 选中 ID 不是有效 partId（组节点）→ 尝试递归展开组节点
  - 展开后有子零件 → 按多选（场景二）展示
  - 展开后无子零件 → 显示"选中了一个组"

```typescript
function expandGroupToPartIds(
  groupId: string,
  sceneTree: SceneTreeNode[],
): string[] {
  const node = findNodeInTree(sceneTree, groupId)
  if (!node) return []
  const partIds: string[] = []
  function walk(n: SceneTreeNode) {
    if (n.meshIndex !== undefined) partIds.push(n.id)
    if (n.children) n.children.forEach(walk)
  }
  walk(node)
  return partIds
}
```

#### 判断逻辑总优先级

```
if (stats.partCount <= 1)
  → 不显示"选中零件信息"（单零件文件，内容与文件信息重复）

else if (selectedPartIds.length === 0)
  → 不显示"选中零件信息"

else if (selectedPartIds.every(id => isValidPartId(id, modelGroup)))
  → 统计并展示选中零件（单选/多选）

else
  → 尝试展开组节点为子零件
    → 展开后无有效零件：显示"选中了一个组"
    → 展开后有有效零件：按多选展示
```

### 5.3 ModelInfoPanel 结构变更

```
ModelInfoPanel
├── 标题栏（可拖动）
├── [选中零件信息]  ← 条件渲染：selectedReferenceIds.length > 0
│   ├── StatRow: 零件名
│   ├── StatRow: 顶点数
│   ├── StatRow: 三角面数
│   ├── StatRow: 表面积
│   ├── StatRow: 体积
│   └── [3MF only] extruder, plate
├── [文件信息]
│   ├── StatRow: 文件名（新增）
│   ├── StatRow: 文件大小（新增）
│   ├── StatRow: 顶点数
│   ├── StatRow: 三角面数
│   ├── StatRow: 表面积
│   ├── StatRow: 体积
│   ├── StatRow: 包围盒尺寸
│   ├── StatRow: 部件数
│   ├── StatRow: 文件格式
│   └── StatRow: 预估耗材 (条件)
└── [文件元数据]  ← 各格式显示各自的原始字段名
    ├── [3MF]
    │   ├── Title: xxx
    │   ├── Designer: xxx
    │   ├── Description: ...
    │   ├── License: xxx
    │   ├── Application: BambuStudio 1.8.0
    │   ├── CreationDate: 2024-01-15
    │   └── ModificationDate: 2024-01-16
    ├── [GLB]
    │   ├── generator: Khronos glTF Blender I/O v3.6
    │   ├── gltfVersion: 2.0
    │   ├── minGltfVersion: 2.0
    │   └── copyright: (c) 2024
    ├── [STEP]
    │   ├── author: John Doe
    │   ├── organization: Acme Corp
    │   ├── originating_system: SolidWorks 2024
    │   ├── preprocessor_version: ...
    │   ├── authorization: ...
    │   ├── time_stamp: 2024-01-15T10:30:00
    │   └── FILE_DESCRIPTION: STEP AP242
    └── [STL] 无元数据区域
```

### 5.4 优先级建议

| 优先级 | 任务 | 备注 |
|-------|------|------|
| P0 | 新增 `findMeshByPartId()` + `isValidPartId()` + `expandGroupToPartIds()` + 合并统计 | 映射逻辑 |
| P0 | 拆分 ModelInfoPanel 为三部分结构，处理边界情况（单零件/多选/组节点） | 核心重构 |
| P1 | 新增文件名、文件大小行 | 从 `loadedFiles[]` 中读取 |
| P1 | 3MF 元数据提取更多 ISO 标签（Application, CreationDate, ModificationDate + 所有 `<metadata name="...">`） | 修改 `bambu-3mf.ts`，收集为 `entries[]` |
| P1 | GLB 元数据提取（`asset.generator`, `asset.version`, `asset.minVersion`, `asset.copyright`） | 修改 `formatLoaders.ts` 或新建提取函数 |
| P2 | STEP HEADER 元数据解析（纯文本正则） | 在 `formatLoaders.ts` 或 `stepToGlb.ts` 中解析 |
| P2 | 文件元数据区域按格式分区渲染 | `modelFormat` 决定显示哪个子区域 |

### 5.5 与现有 GlbExtensionPanel 的关系

当前 GLB 的扩展、材质、纹理、动画信息通过独立的 `GlbExtensionPanel` 展示。建议：
- **短期**：保持 GlbExtensionPanel 独立，不并入 ModelInfoPanel（避免该面板过于臃肿）
- **长期**：在 ModelInfoPanel 的"文件元数据"区底部增加一行"查看 GLB 扩展信息 →"链接，点击后打开 GlbExtensionPanel

## 6. 国际化 i18n 新增 key

```json
{
  "modelInfo.title": "模型信息",
  "modelInfo.selectedPart": "选中零件信息",
  "modelInfo.fileInfo": "文件信息",
  "modelInfo.fileMetadata": "文件元数据",
  "modelInfo.fileName": "文件名",
  "modelInfo.fileSize": "文件大小",
  "modelInfo.extruder": "挤出器",
  "modelInfo.plate": "底板",

  // 格式元数据区域标题
  "modelInfo.meta3mf": "3MF Metadata",
  "modelInfo.metaGlb": "glTF Metadata",
  "modelInfo.metaStep": "STEP Header",
  // 其他
  "modelInfo.noPartSelected": "未选中零件",
  "modelInfo.noMetadata": "无文件元数据"
}
```

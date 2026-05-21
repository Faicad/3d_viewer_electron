# 3D 文件格式单位支持调查与处理方案

> 创建日期：2026-05-21
> 目标：检测每个文件自身的单位系统，不做数值缩放，仅正确显示单位标签。默认毫米/公制。

---

## 一、当前现状

**当前默认单位假设：毫米（mm）**

ModelInfoPanel 显示时硬编码了 `mm²`、`mm³`、`mm` 后缀，且材质成本计算假设单位是 mm³。

### 当前代码中的单位相关逻辑

| 位置 | 内容 | 备注 |
|------|------|------|
| `formatLoaders.ts` 所有 loader | 不做任何单位读取或转换 | 原样加载顶点坐标 |
| `ModelGroup.tsx` | 无单位转换 | 只做几何体合并/居中 |
| `ModelInfoPanel.tsx:56-63` | 显示 `mm²`、`mm³`、`mm` | 硬编码假设 |
| `ModelInfoPanel.tsx:70` | `volume / 1000 * 1.24 g (PLA)` | 假设 mm³ |
| `stepToGlb.ts:5` | `CAD_TO_GLB_SCALE = 0.001` | mm → 米 |
| `stepToGlb.ts:32` | `linearUnit: 'millimeter'` | 硬编码，不读 STEP 文件头 |
| `topologyExt.ts:4-5` | 拓扑数据单位 mm，mesh 顶点在米 | 双单位系统 |
| `build-selector-runtime.ts:456` | `scale = 0.001` 默认值 | 拓扑回缩 |
| `model-store.ts` | 无单位相关字段 | 缺失 |

**核心问题：**
1. 没有统一的单位元数据存储
2. 没有一个 format loader 读取/暴露文件本身的单位信息
3. STEP 的 `linearUnit` 是硬编码的 `'millimeter'`，不读取 STEP 头部的 `LENGTH_UNIT`
4. 显示始终显示 `mm`，与实际数据可能不符

---

## 二、各文件格式单位支持详表

### 图例

- **默认单位**：该格式规范或行业惯例默认使用什么单位
- **可携带单位**：文件格式是否有字段/属性来声明单位
- **three.js 暴露**：对应 loader 是否提供单位信息给调用方
- **mm 等价值**：1 个该单位等于多少 mm（仅供参考，不做转换）

### 已支持格式（28 种）

| # | 格式 | 默认单位 | 可携带单位 | three.js 暴露 | mm 等价值 | 备注 |
|---|------|----------|-----------|--------------|---------------|------|
| 1 | **STL** `.stl` | 无规范 | ❌ 无 | ❌ | 1.0 (假设 mm) | 3D 打印行业默认 mm；ASCII STL 无单位头 |
| 2 | **GLB** `.glb` | **米** (规范) | ⚠️ 无字段 | ❌ | 1 m = 1000 mm | glTF 2.0 规范说距离单位是米，但无强制字段 |
| 3 | **glTF** `.gltf` | **米** (规范) | ⚠️ 无字段 | ❌ | 1 m = 1000 mm | 同 GLB |
| 4 | **3MF** `.3mf` | 毫米 (规范) | ✅ `<unit>` 元素 | ❌ | 按声明 | 属性值: `micron`, `millimeter`, `centimeter`, `inch`, `foot`, `meter` |
| 5 | **STEP** `.step/.stp` | 无规范默认 | ✅ `LENGTH_UNIT` | N/A (occt) | 需解析头部 | 当前 `linearUnit: 'millimeter'` 硬编码。实体可能用 SI 或 inch-based |
| 6 | **OBJ** `.obj` | 无规范 | ❌ 无 | ❌ | 1.0 | 行业惯例为计量单位（cm/mm/m 均可），mtl 无单位信息 |
| 7 | **PLY** `.ply` | 无规范 | ⚠️ 自定义属性 | ❌ | 1.0 | 可在 header 中加注释，但无法规字段 |
| 8 | **FBX** `.fbx` | 厘米 (默认) | ✅ `UnitScaleFactor` | ❌ | 1 cm = 10 mm | FBX 7.4+ 在 `GlobalSettings` 中有 `UnitScaleFactor`，但 THREE.js FBXLoader 不暴露 |
| 9 | **DAE** `.dae` | 米 (规范) | ✅ `<unit>` 元素 | ⚠️ `scene.unit` | 按声明 | ColladaLoader 在 `.scene.unit` 中暴露 `{name, meter}` |
| 10 | **3DS** `.3ds` | 无规范 | ✅ `MASTER_SCALE` | ❌ | 需解析 | 文件中有全局缩放因子，但 TDSLoader 不暴露 |
| 11 | **USDZ** `.usdz` | 米 (规范) | ✅ `metersPerUnit` | ⚠️ 内部已处理 | 按声明 | USDZLoader 内部读取 `metersPerUnit` 并缩放 mesh |
| 12 | **DRC** `.drc` | 无 | ❌ | ❌ | 1.0 | Draco 是压缩格式，无单位信息 |
| 13 | **BVH** `.bvh` | 无规范 | ❌ 无 | ❌ | 1.0 | 动捕骨骼数据，单位无标准化 |
| 14 | **VTK** `.vtk/.vtp` | 无规范 | ❌ 无 | ❌ | 1.0 | 科学可视化，单位由数据决定 |
| 15 | **XYZ** `.xyz` | 无规范 | ❌ 无 | ❌ | 1.0 | 纯坐标点云 |
| 16 | **PDB** `.pdb` | **埃 (Å)** (规范) | ❌ 无字段 | ❌ | **10⁻⁷ (Å→mm)** | PDB 标准规定坐标单位为 Å（1 Å = 10⁻¹⁰ m = 10⁻⁷ mm），当前代码未转换 |
| 17 | **NRRD** `.nrrd` | 无规范 | ✅ `spacings` | ✅ `volume.spacing` | 需处理 | NRRDLoader 暴露 `volume.spacing` 数组，包含体素间距信息 |
| 18 | **GCode** `.gcode` | 毫米 (默认) | ✅ `G21` / `G20` | ❌ | 按声明 | `G21` = mm, `G20` = inches。GCodeLoader 假设 mm |
| 19 | **VRML** `.wrl` | 无规范 | ❌ 无 | ❌ | 1.0 | VRML97 规范建议用米，但无强制 |
| 20 | **VOX** `.vox` | 体素 | ❌ 无 | ❌ | 1.0/体素 | 体素为单位，无物理意义 |
| 21 | **KMZ** `.kmz` | 米 (KML) | ⚠️ KML 坐标系统 | ❌ | 1000 | KMZLoader 解析为 Three.js 对象，无单位处理 |
| 22 | **AMF** `.amf` | 毫米 (规范) | ✅ `<unit>` 元素 | ❌ | 按声明 | `<unit>` 内容可选 `millimeter`, `inch`, `micrometer`, `nanometer`, `angstrom`, `centimeter`, `meter` |
| 23 | **LWO** `.lwo` | 无规范 | ⚠️ `CLIP` 缩放 | ❌ | 1.0 | LightWave 对象格式，`CLIP` 块有缩放但无单位语义 |
| 24 | **MD2** `.md2` | 无 | ❌ 无 | ❌ | 1.0 | Quake II 模型格式，无实际单位 |
| 25 | **MDD** `.mdd` (disabled) | 无 | ❌ 无 | ❌ | 1.0 | 变形数据，无几何体 |
| 26 | **PCD** `.pcd` | 无规范 | ❌ 无 | ❌ | 1.0 | 点云数据，无单位 |
| 27 | **IFC** `.ifc` (disabled) | 米 (规范) | ✅ 完整单位系统 | N/A | 按声明 | IFC 有完整的 `IfcUnitAssignment`，如果后续启用 web-ifc 可获取 |
| 28 | **3DM** `.3dm` | 取决于 Rhino 文档 | ✅ 文档单位 | ⚠️ 内部已处理 | 按声明 | Rhino3dmLoader 内部使用 Rhino 单位系统 |

### 格式单位总结

**可以携带单位信息（需解析）：7 种**
- 3MF, STEP, FBX, DAE, AMF, GCode, NRRD

**规范隐含单位（需按约定转换）：7 种**
- GLB/GLTF (米), PDB (埃), USDZ (米), IFC (米, disabled), KMZ (米), 3DM (不定), VRML (米)

**无单位信息（当前假设 mm）：14 种**
- STL, OBJ, PLY, 3DS, DRC, BVH, VTK, XYZ, VOX, LWO, MD2, MDD (disabled), PCD, WRL

---

## 三、当前代码中单位处理的问题

### 3.1 STEP `linearUnit` 硬编码

`stepToGlb.ts:32` 始终使用 `linearUnit: 'millimeter'`，不读取 STEP 文件的 `LENGTH_UNIT`。

STEP 头部格式示例——单位定义在实体部分（DATA 段）：
```
#10 = ( LENGTH_UNIT() NAMED_UNIT( * ) SI_UNIT( $, .METRE. ) );
```
或英制：
```
#10 = ( LENGTH_UNIT() NAMED_UNIT( * ) LENGTH_UNIT( .INCH. ) );
```

OCCT 的 `ReadStepFile` 会根据 `linearUnit` 参数解析几何数据，如果传错会导致内部数值错误。
- 需要解析 `LENGTH_UNIT` 并传给 OCCT 做正确解析
- 最终显示标签也需与解析出的单位一致

### 3.2 PDB 坐标显示单位缺失

PDB 格式规定坐标单位为 **Ångström（埃）**：1 Å = 10⁻¹⁰ m。
当前 `PDBLoader` 加载后直接使用原始坐标，在显示时当 mm 处理，标签错误。
- 一个 5Å 的分子当前显示为 "5mm"，应显示为 "5 Å"。
- **不需要做数值缩放**，只需要在 UI 中标注正确单位 `Å`。

### 3.3 GLB/glTF 显示单位标签错误

glTF 2.0 规范规定所有距离单位为 **米**。当前代码直接将坐标当 mm 显示。
- 一个 1m 的方块显示为 "1mm³" → 数据正确但标签错误，应为 `m³`。
- **不需要 m→mm 缩放**，只需在 UI 中标注正确单位 `m`。

### 3.4 3MF 的 `<unit>` 元素被忽略

3MF 规范规定文件根元素 `<model>` 可以包含 `<unit>` 子元素：
```xml
<unit unit="inch" />
```
THREE.js 的 ThreeMFLoader 不读取该属性。即使 unit 是 inch，显示标签仍然是 `mm`。
- **不需要数值缩放**，只需解析 `<unit>` 并在 UI 中标注正确单位。

### 3.5 DAE 的 `<unit>` 元素被忽略

Collada 根 `<asset>` 中有 `<unit>` 元素：
```xml
<unit meter="0.01" name="centimeter" />
```
ColladaLoader 解析该值并存储在 `scene.unit` 中，但 UI 显示仍然当 mm 处理。
- **不需要数值缩放**，只需读取 `scene.unit` 并在 UI 中标注正确单位。

---

## 四、处理方案

### 4.1 设计原则

1. **不做数值缩放**——顶点坐标保持文件原始值不变，不进行 m→mm、inch→mm 等转换
2. **单位标签与数据匹配**——显示时使用与文件原始单位一致的后缀（如 GLB/glTF 显示 `m`，3MF 按 `<unit>` 声明显示）
3. **检测原始单位**——各 loader 在加载时检测文件的单位信息并传递到 store
4. **默认值 mm/公制**——无单位信息的格式（STL/OBJ/PLY 等）默认显示 `mm`、公制
5. **所有运算基于原始坐标**——`computeModelStats` 等计算始终基于原始坐标值，仅单位标签变化

### 4.2 需要实现的变更

#### A. 类型定义

```typescript
// file-formats.ts 新增
export type UnitSystem =
  | 'millimeter'
  | 'centimeter'
  | 'meter'
  | 'inch'
  | 'foot'
  | 'micron'
  | 'angstrom'
  | 'unknown'
```

与公制/英制分类：
```typescript
export type UnitCategory = 'metric' | 'imperial' | 'unknown'

export function unitCategory(system: UnitSystem): UnitCategory {
  switch (system) {
    case 'millimeter':
    case 'centimeter':
    case 'meter':
    case 'micron':
      return 'metric'
    case 'inch':
    case 'foot':
      return 'imperial'
    default:
      return 'unknown'
  }
}
```

#### B. 修改 `LoaderResult`

```typescript
export interface LoaderResult {
  meshes: THREE.Mesh[]
  objects: THREE.Object3D[]
  skeleton?: THREE.Skeleton
  sceneRoot?: THREE.Object3D
  /** 文件原始单位系统（加载时检测）。undefined 表示未知，按 millimeter 处理 */
  sourceUnit?: UnitSystem
}
```

#### C. 各格式 loader 修改

**GLB/glTF** —— 始终返回 `sourceUnit: 'meter'`：

```typescript
case 'glb': {
  const gltf = await new GLTFLoader().parseAsync(buffer, '')
  const meshes = extractMeshes(gltf.scene)
  return { meshes, objects: [], sceneRoot: gltf.scene, sourceUnit: 'meter' }
}
```

> UI 将显示 `m`（如 "表面积 0.06 m²"），而非当前硬编码的 `mm²`。

**3MF** —— 从 XML 头解析 `<unit>` 属性：

```typescript
case '3mf': {
  const text = bufferToText(buffer)
  const sourceUnit = parse3mfUnit(text)
  const group = new ThreeMFLoader().parse(buffer)
  const meshes = extractMeshes(group)
  return { meshes, objects: extractAllObjects(group), sourceUnit }
}

function parse3mfUnit(xml: string): UnitSystem {
  // 3MF: <unit unit="inch" /> 或省略（默认 millimeter）
  const match = xml.match(/unit\s*=\s*"([^"]+)"/)
  if (!match) return 'millimeter'
  const unitName = match[1].toLowerCase()
  switch (unitName) {
    case 'micron': return 'micron'
    case 'centimeter': return 'centimeter'
    case 'inch': return 'inch'
    case 'foot': return 'foot'
    case 'meter': return 'meter'
    default: return 'millimeter' // 包括 'millimeter'
  }
}
```

**STEP** —— 从 STEP 文本中解析 `LENGTH_UNIT` 实体。注意 STEP 管线特殊（两步走）：

第一步，在 `occtLoader.ts` 或 `stepToGlb.ts` 中解析单位，传给 OCCT：
```typescript
// 方案 A：解析 text 后传参给 OCCT（OCCT 内部按 linearUnit 缩放mesh）
const stepText = new TextDecoder().decode(buffer)
const sourceUnit = parseStepLengthUnit(stepText) ?? 'millimeter'
// OCCT 支持: 'millimeter' | 'centimeter' | 'inch' | 'foot' | 'meter'
// 注意：OCCT 内部会根据 linearUnit 缩放 mesh，输出顶点已在此单位下
const params = {
  linearUnit: sourceUnit,
  linearDeflectionType: 'absolute_value',
  linearDeflection: 0.001,
  angularDeflection: 0.5,
}
```

第二步，STEP→GLB 后，输出的 GLB 的 glTF 坐标在米单位下，将源单位信息传递给 store：
```typescript
// stepToGlb.ts 返回时携带 sourceUnit
return { glbBuffer, sourceUnit: parsedUnit ?? 'millimeter' }
```

> **关键问题**：OCCT 的 `linearUnit` 参数决定其内部如何处理顶点。如果设为 `'millimeter'` 但文件是 inch，OCCT 会错误缩放。如果设为 `'inch'`，OCCT 按英寸处理，最终输出到 glTF（米）的转换需要额外计算。与 OCCT 配合方式需要进一步验证。

**DAE（Collada）** —— 利用 ColladaLoader 已解析的 `scene.unit`：

```typescript
case 'dae': {
  const text = bufferToText(buffer)
  const scene = new ColladaLoader().parse(text, '')
  const sourceUnit = scene.unit ? unitNameToSystem(scene.unit.name) : 'meter'
  const meshes = extractMeshes(scene.scene)
  return { meshes, objects: extractAllObjects(scene.scene), sourceUnit }
}

function unitNameToSystem(name: string): UnitSystem {
  const lower = name.toLowerCase()
  if (lower.includes('millimeter') || lower === 'mm') return 'millimeter'
  if (lower.includes('centimeter') || lower === 'cm') return 'centimeter'
  if (lower.includes('meter') || lower === 'm') return 'meter'
  if (lower.includes('inch') || lower === 'in') return 'inch'
  if (lower.includes('foot') || lower === 'ft') return 'foot'
  return 'unknown'
}
```

**FBX** —— 从 FBX 二进制中解析 `UnitScaleFactor`。FBX 的 `GlobalSettings` 属性中有一个 `UnitScaleFactor`，值为 1 = 厘米，其他值需要计算：

```typescript
case 'fbx': {
  const group = new FBXLoader().parse(buffer, '')
  const sourceUnit = detectFbxUnit(buffer)
  const meshes = extractMeshes(group)
  return { meshes, objects: extractAllObjects(group), sourceUnit }
}

function detectFbxUnit(buffer: ArrayBuffer): UnitSystem {
  // FBX 默认单位是厘米（UnitScaleFactor = 1）
  // 从 ASCII/Binary FBX 中提取 UnitScaleFactor 值
  // 1 = 厘米, 0.01 = 米 (即 FBXUnitScaleFactor 0.01 → meter)
  // 需要扫描文件头的 GlobalSettings 段
  const text = new TextDecoder().decode(buffer.slice(0, Math.min(buffer.byteLength, 65536)))
  const match = text.match(/UnitScaleFactor[^0-9]*([0-9.]+)/)
  if (!match) return 'centimeter'
  const factor = parseFloat(match[1])
  // FBX 因子与厘米的比率：1=cm, 0.01=m, 0.0254=inch, 0.3048=foot
  if (Math.abs(factor - 1) < 0.001) return 'centimeter'
  if (Math.abs(factor - 0.01) < 0.001) return 'meter'
  if (Math.abs(factor - 0.0254) < 0.001) return 'inch'
  if (Math.abs(factor - 0.3048) < 0.001) return 'foot'
  return 'centimeter' // FBX 默认
}
```

**AMF** —— 从 XML 中解析 `<unit>` 内容：

```typescript
case 'amf': {
  const text = bufferToText(buffer)
  const sourceUnit = parseAmfUnit(text)
  const group = new AMFLoader().parse(buffer)
  const meshes = extractMeshes(group)
  return { meshes, objects: extractAllObjects(group), sourceUnit }
}

function parseAmfUnit(xml: string): UnitSystem {
  // AMF: <unit>inch</unit> 或省略（默认 millimeter）
  const match = xml.match(/<unit>\s*(\w+)\s*<\/unit>/i)
  if (!match) return 'millimeter'
  const name = match[1].toLowerCase()
  switch (name) {
    case 'inch': return 'inch'
    case 'micrometer': return 'micron'
    case 'nanometer': return 'unknown'  // 无对应枚举，fallback
    case 'angstrom': return 'angstrom'
    case 'centimeter': return 'centimeter'
    case 'meter': return 'meter'
    default: return 'millimeter' // 包括 'millimeter'
  }
}
```

**GCode** —— 从文本中扫描 `G21`（mm）/ `G20`（inch）：

```typescript
case 'gcode': {
  const text = bufferToText(buffer)
  const sourceUnit = detectGCodeUnit(text) // G21=mm, G20=inch
  const group = new GCodeLoader().parse(text)
  const objects = extractAllObjects(group)
  return { meshes: [], objects, sourceUnit }
}

function detectGCodeUnit(gcode: string): UnitSystem {
  // 扫描 G21（毫米）或 G20（英寸）
  // G21/G20 是模态命令，通常出现在文件头
  if (/\bG21\b/.test(gcode)) return 'millimeter'
  if (/\bG20\b/.test(gcode)) return 'inch'
  return 'millimeter' // GCodeLoader 默认 mm
}
```

**PDB** —— 固定返回 `'angstrom'`：

```typescript
case 'pdb': {
  const text = bufferToText(buffer)
  const result = new PDBLoader().parse(text)
  const objects: THREE.Object3D[] = []
  // ...
  return { meshes: [], objects, sourceUnit: 'angstrom' }
}
```

**NRRD** —— 从 `volume.spacing` 推导，但保留 `unknown`：

```typescript
case 'nrrd': {
  const volume = new NRRDLoader().parse(buffer)
  // spacings 通常以 mm 为单位，但不保证
  return { meshes: [mesh], objects: [], sourceUnit: 'millimeter' }
}
```

**3DS** —— 需解析 `MASTER_SCALE`：

```typescript
case '3ds': {
  const group = new TDSLoader().parse(buffer)
  const sourceUnit = detect3dsUnit(buffer)
  const meshes = extractMeshes(group)
  return { meshes, objects: extractAllObjects(group), sourceUnit }
  // 若无法解析，返回 'unknown'，UI 显示默认 mm
}
```

> **复杂度说明**：3DS/TDSLoader 解析器为纯二进制格式，`MASTER_SCALE` 位于 `EDIT_MATERIAL` 块后的 `MASTER_SCALE` 块（ID `0x0100`），解析成本较高。优先级可降低。

**无单位格式**（STL/OBJ/PLY/DRC/BVH/VTK/XYZ/VOX/LWO/MD2/PCD/WRL/KMZ）—— 不做任何修改，`sourceUnit` 保持 `undefined`，上层默认用 `'millimeter'`：

```typescript
// 不需要改动
return { meshes, objects, sceneRoot }
```

#### D. 在 model-store 中存储单位信息

```typescript
// model-store.ts 新增字段
sourceUnit: UnitSystem
```

```typescript
// setModelBuffer 时调用方传入 sourceUnit
// 当前 ViewportContainer / file-open 逻辑中调用 setModelBuffer
// 需要在调用前确定 sourceUnit（从 LoaderResult 获取）
setModelBuffer: (buffer: ArrayBuffer, format: FormatId, sourceUnit?: UnitSystem) => {
  const sliced = buffer.slice(0)
  const defaultAxis = getDefaultUpAxis(format, sliced)
  set({
    modelBuffer: sliced,
    modelFormat: format,
    __loadingPhase: 'loading',
    activeUpAxis: defaultAxis,
    sourceUnit: sourceUnit ?? 'millimeter', // 默认 mm
  })
}
```

> `sourceUnit` 在 `setModelBuffer` 时传入。目前 `setModelBuffer` 的调用点在：
> - `src/renderer/layouts/DesktopLayout.tsx`（文件打开）
> - `src/renderer/lib/topology/parse-glb-topology.ts`（STEP 转换后的 GLB 加载）
>
> 这两个调用点需要先调用 `loadFormat` 或解析单位后再调用 `setModelBuffer`。

#### E. 在 ModelInfoPanel 中根据单位显示标签

```typescript
// ModelInfoPanel.tsx

const sourceUnit = useModelStore((s) => s.sourceUnit)
const fileGroup = useModelStore((s) => s.fileGroup)

const unitLabel = sourceUnitToLabel(sourceUnit)
const areaUnit = `${unitLabel}²`
const volumeUnit = `${unitLabel}³`

<StatRow label={t('modelInfo.surfaceArea')} value={`${formatNumber(stats.surfaceArea)} ${areaUnit}`} />
<StatRow label={t('modelInfo.volume')} value={`${formatNumber(stats.volume)} ${volumeUnit}`} />
<StatRow
  label={t('modelInfo.dimensions')}
  value={
    stats.boundingBox.isEmpty()
      ? '-'
      : `${formatNumber(stats.boundingBox.max.x - stats.boundingBox.min.x)} × ${formatNumber(stats.boundingBox.max.y - stats.boundingBox.min.y)} × ${formatNumber(stats.boundingBox.max.z - stats.boundingBox.min.z)} ${unitLabel}`
  }
/>
{/* 仅 mesh/cad 格式计算耗材；非 mesh/cad 格式忽略此项 */}
{fileGroup === 'mesh' || fileGroup === 'cad' ? (
  <StatRow
    label={t('modelInfo.materialCost')}
    value={stats.volume > 0 ? `${formatNumber(stats.volume / 1000 * 1.24)} g (PLA)` : '-'}
  />
) : null}
```

单位标签映射函数：
```typescript
// file-formats.ts 或 compute-model-stats.ts

export function sourceUnitToLabel(unit: UnitSystem): string {
  switch (unit) {
    case 'millimeter': return 'mm'
    case 'centimeter': return 'cm'
    case 'meter':      return 'm'
    case 'inch':       return 'in'
    case 'foot':       return 'ft'
    case 'micron':     return 'µm'
    case 'angstrom':   return 'Å'
    default:           return 'mm' // unknown → 默认 mm
  }
}
```

> 材质成本计算仍然基于体积值，不做单位转换。计算 `volume / 1000 * 1.24` 的前提假设是 mm³→g 转换。当文件单位为米时，1 m³ = 10⁹ mm³，这个数值会非常大，但仍可计算。后续可考虑增加单位感知的材质成本公式。

#### F. 单位显示——需要在 model-store 的 reset 中清理

```typescript
// model-store.ts reset() 方法中新增
reset: () => {
  set({
    // ... 现有字段
    sourceUnit: 'millimeter', // 重置为默认
    fileGroup: 'mesh',        // 重置为默认
  })
}
```

#### G. 加载时保存 fileGroup

```typescript
// formatLoaders.ts 或调用方
import { fileFormats } from '@/config/file-formats'

const ext = getExtension(filePath) // 例如 '.glb'
const format = fileFormats.find(f => f.extensions.includes(ext))
if (format) {
  useModelStore.getState().setFileGroup(format.group)
}
```

> model-store 需要新增 `fileGroup: FileGroup` 字段和 `setFileGroup` action。当文件单位不是 mm 或文件组非 mesh/cad 时，`materialCost` 行不显示。这样 point/volume/animation/gcode 等格式不会出现无意义的耗材估算。

### 4.3 工作流程总览

```
用户打开文件
  ↓
formatLoaders.loadFormat()
  ↓
解析单位（按格式特定逻辑） ← sourceUnit
  ↓
setModelBuffer(buffer, format, sourceUnit)
  ↓
ModelGroup 加载 mesh（原始坐标，不做缩放）
  ↓
model-store.sourceUnit = sourceUnit
  ↓
computeModelStats() ← 基于原始坐标计算，单位无关
  ↓
ModelInfoPanel 显示 ← 根据 sourceUnit 显示正确后缀
```

### 4.4 查看各格式当前单位显示变化

| 格式 | 当前显示 | 修改后显示 | 原因 |
|------|---------|-----------|------|
| GLB/glTF | `mm²`, `mm³`, `mm` | **`m²`**, **`m³`**, **`m`** | glTF 规范距离单位为米 |
| 3MF (默认) | `mm²`, `mm³`, `mm` | `mm²`, `mm³`, `mm` | 3MF 默认单位是 mm |
| 3MF (inch) | `mm²`, `mm³`, `mm` | **`in²`**, **`in³`**, **`in`** | `<unit>` 声明为 inch |
| STEP (mm) | `mm²`, `mm³`, `mm` | `mm²`, `mm³`, `mm` | 解析后为 mm |
| STEP (inch) | `mm²`, `mm³`, `mm` | **`in²`**, **`in³`**, **`in`** | 解析后为 inch |
| DAE (cm) | `mm²`, `mm³`, `mm` | **`cm²`**, **`cm³`**, **`cm`** | DAE `<unit name="centimeter">` |
| PDB | `mm²`, `mm³`, `mm` | **`Å²`**, **`Å³`**, **`Å`** | PDB 规范为埃 |
| STL/OBJ/PLY 等 | `mm²`, `mm³`, `mm` | `mm²`, `mm³`, `mm` | 无单位信息，默认不变 |

### 4.5 工作量评估

| 文件 | 改动量 | 复杂度 |
|------|--------|--------|
| `config/file-formats.ts` | +40 行（类型 + 映射函数） | 低 |
| `stores/model-store.ts` | +4 行（字段 + setter + reset） | 低 |
| `engine/formatLoaders.ts` | 修改 10 个 case，每个 +2~15 行：GLB, 3MF, DAE, FBX, AMF, GCode, PDB, NRRD, 3DS + STEP 路径 | 中 |
| `lib/step-converter/occtLoader.ts` | +20 行（解析 STEP LENGTH_UNIT） | 中高 |
| `lib/step-converter/stepToGlb.ts` | 调整 linearUnit 参数 | 低 |
| `components/ModelInfoPanel.tsx` | +15 行（动态单位标签） | 低 |

**总计：约 80 行新增，零顶点缩放逻辑**

### 4.6 测试策略

所有 28 种文件格式都需要有单位处理的测试。测试分为三类：

| 类别 | 覆盖格式 | 测试内容 |
|------|----------|---------|
| A. 单位检测 | 有单位字段的格式 | 验证能正确从文件中解析出 `sourceUnit` |
| B. 默认单位 | 无单位字段的格式 | 验证返回默认 `sourceUnit` |
| C. 材质成本 | mesh + cad | 验证耗材行正确显示/隐藏 |
| D. 材质成本 | 非 mesh/cad | 验证耗材行不出现 |

#### A. 单位检测测试（7 种格式有可解析单位）

```typescript
// src/renderer/lib/formatLoaders.test.ts

import { loadFormat } from './formatLoaders'
import { fileFormats } from '@/config/file-formats'
import { describe, it, expect } from 'vitest'

// ── 辅助函数 ──
function findFormat(ext: string) {
  return fileFormats.find(f => f.extensions.includes(ext))!
}

type UnitSystem = 'millimeter' | 'centimeter' | 'meter' | 'inch' | 'foot' | 'micron' | 'angstrom'

async function getSourceUnit(filePath: string): Promise<UnitSystem> {
  const result = await loadFormat(filePath, await fs.readFile(filePath))
  return result.sourceUnit
}

// ── 有单位字段的格式 ──

describe('3MF unit detection', () => {
  it('reads <unit unit="inch" /> as inch', async () => {
    const unit = await getSourceUnit('fixtures/3mf/inch-unit.3mf')
    expect(unit).toBe('inch')
  })

  it('defaults to millimeter when no <unit> element', async () => {
    const unit = await getSourceUnit('fixtures/3mf/no-unit.3mf')
    expect(unit).toBe('millimeter')
  })
})

describe('STEP unit detection', () => {
  it('detects SI_UNIT METRE from DATA section', async () => {
    const unit = await getSourceUnit('fixtures/step/meter-unit.stp')
    expect(unit).toBe('meter')
  })

  it('detects INCH from DATA section', async () => {
    const unit = await getSourceUnit('fixtures/step/inch-unit.stp')
    expect(unit).toBe('inch')
  })

  it('defaults to millimeter when no LENGTH_UNIT', async () => {
    const unit = await getSourceUnit('fixtures/step/no-unit.stp')
    expect(unit).toBe('millimeter')
  })
})

describe('DAE unit detection', () => {
  it('reads <unit meter="0.01" name="centimeter" />', async () => {
    const unit = await getSourceUnit('fixtures/dae/cm-unit.dae')
    expect(unit).toBe('centimeter')
  })

  it('defaults to meter when no <unit> element', async () => {
    const unit = await getSourceUnit('fixtures/dae/no-unit.dae')
    expect(unit).toBe('meter')
  })
})

describe('FBX unit detection', () => {
  it('reads UnitScaleFactor from ASCII FBX', async () => {
    const unit = await getSourceUnit('fixtures/fbx/inch-unit.fbx')
    expect(unit).toBe('inch')
  })

  it('defaults to centimeter for binary FBX without GlobalSettings', async () => {
    const unit = await getSourceUnit('fixtures/fbx/no-unit.fbx')
    expect(unit).toBe('centimeter')
  })
})

describe('GCode unit detection', () => {
  it('detects metric mode (G21) from header', async () => {
    const unit = await getSourceUnit('fixtures/gcode/metric.gcode')
    expect(unit).toBe('millimeter')
  })

  it('detects imperial mode (G20) from header', async () => {
    const unit = await getSourceUnit('fixtures/gcode/imperial.gcode')
    expect(unit).toBe('inch')
  })
})

describe('PDB unit detection', () => {
  it('always returns angstrom', async () => {
    const unit = await getSourceUnit('fixtures/pdb/sample.pdb')
    expect(unit).toBe('angstrom')
  })
})
```

> 注意：上述测试依赖 fixtures 文件夹 `src/renderer/__tests__/fixtures/` 下的测试文件。如果缺少真实文件，可以使用单元测试级别的 mock，或使用内联二进制/文本模拟。
>
> FBX 的 `UnitScaleFactor` 测试仅覆盖 ASCII FBX（可文本扫描），二进制 FBX 需单独解析器。GCode 以指令 `G20`/`G21` 判定。PDB 的克里金值在 `CRYST1` 记录中，但所有 PDB 都是 Å，直接 hardcode。

#### B. 默认单位测试（14 种无单位字段的格式）

```typescript
// src/renderer/lib/formatLoaders.test.ts — 默认单位

describe('default units for formats without unit metadata', () => {
  // 这些格式没有 unit 字段 → 预期返回默认 millimeter
  const noUnitExtensions = [
    'stl', 'obj', 'ply', '3ds', 'drc', 'lwo', 'md2', 'bvh', 'wrl',
    'vox', 'kmz', 'pcd', 'xyz', 'vtk',
  ]

  for (const ext of noUnitExtensions) {
    it(`${ext} defaults to millimeter`, () => {
      const format = findFormat(`.${ext}`)
      // 通过 config 验证预期
      expect(format.defaultUnit).toBe('millimeter')
    })
  }
})

describe('default units for GLB/glTF', () => {
  it('GLB defaults to meter', () => {
    const format = findFormat('.glb')
    expect(format.defaultUnit).toBe('meter')
  })

  it('glTF defaults to meter', () => {
    const format = findFormat('.gltf')
    expect(format.defaultUnit).toBe('meter')
  })
})

describe('default units for NRRD', () => {
  it('NRRD defaults to micron', () => {
    const format = findFormat('.nrrd')
    expect(format.defaultUnit).toBe('micron')
  })
})
```

> `file-formats.ts` 需要新增 `defaultUnit: UnitSystem` 字段，为每种格式声明默认单位。上述测试会验证该声明是否正确。

#### C. 材质成本——仅 mesh/cad 格式显示

```typescript
// src/renderer/components/ModelInfoPanel.test.tsx

import { render, screen } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'

describe('ModelInfoPanel material cost visibility', () => {
  beforeEach(() => {
    useModelStore.getState().reset()
  })

  it('shows material cost for mesh format group', () => {
    useModelStore.getState().setFileGroup('mesh')
    useModelStore.getState().setSourceUnit('millimeter')
    render(<ModelInfoPanel />)
    expect(screen.getByText(/g \(PLA\)/)).toBeTruthy()
  })

  it('shows material cost for cad format group', () => {
    useModelStore.getState().setFileGroup('cad')
    useModelStore.getState().setSourceUnit('millimeter')
    render(<ModelInfoPanel />)
    expect(screen.getByText(/g \(PLA\)/)).toBeTruthy()
  })
})

describe('ModelInfoPanel material cost hidden', () => {
  // 所有非 mesh/cad 组
  const hiddenGroups: FileGroup[] = ['point', 'volume', 'animation', 'gcode', 'other', 'bim']

  for (const group of hiddenGroups) {
    it(`hides material cost for ${group} format group`, () => {
      useModelStore.getState().setFileGroup(group)
      render(<ModelInfoPanel />)
      expect(screen.queryByText(/g \(PLA\)/)).toBeNull()
    })
  }
})
```

> 注意：ModelInfoPanel 内部已经用 `{fileGroup === 'mesh' || fileGroup === 'cad' ? <StatRow .../> : null}` 控制了可见性。

#### D. 单位标签映射测试

```typescript
// src/renderer/lib/compute-model-stats.test.ts — 补充

import { sourceUnitToLabel } from '@/config/file-formats'

describe('sourceUnitToLabel', () => {
  const cases: [UnitSystem, string][] = [
    ['millimeter', 'mm'],
    ['centimeter', 'cm'],
    ['meter',      'm'],
    ['inch',       'in'],
    ['foot',       'ft'],
    ['micron',     'µm'],
    ['angstrom',   'Å'],
  ]

  for (const [unit, label] of cases) {
    it(`maps ${unit} → ${label}`, () => {
      expect(sourceUnitToLabel(unit)).toBe(label)
    })
  }

  it('falls back to mm for unknown unit', () => {
    expect(sourceUnitToLabel('unknown' as UnitSystem)).toBe('mm')
  })
})
```

#### E. 格式配置 `defaultUnit` 字段完整性测试

```typescript
// src/renderer/config/file-formats.test.ts

import { fileFormats } from './file-formats'

describe('file-formats defaultUnit coverage', () => {
  for (const format of fileFormats) {
    it(`${format.name} (${format.extensions.join(', ')}) has a defaultUnit`, () => {
      expect(format.defaultUnit).toBeDefined()
      // 所有格式至少是已知的 UnitSystem
      expect(['millimeter', 'centimeter', 'meter', 'inch', 'foot', 'micron', 'angstrom'])
        .toContain(format.defaultUnit)
    })
  }
})
```

> 这样 file-formats.ts 新增 `defaultUnit` 字段后，每个格式都必须声明，否则测试会失败。强制要求配置完整性。

### 4.7 注意事项与风险

1. **STEP 特殊处理**：OCCT 的 `linearUnit` 参数决定其内部缩放行为。当传入 `'inch'` 时，OCCT 输出的顶点坐标会以 inch 为单位，然后 `CAD_TO_GLB_SCALE = 0.001` 将其当 mm 转 m，导致错误。因此 STEP 管线需要额外处理：
   - 如果 sourceUnit 是 m/cm/inch，需要调整 `CAD_TO_GLB_SCALE` 因子，使得最终 glTF 坐标以米为单位。
   - 或者在 GLB 输出后，将 `sourceUnit` 保持为原始单位，由 ModelGroup 统一处理（但 ModelGroup 不做缩放，仅显示标签）。

2. **computeModelStats**：完全基于坐标数值计算，不需要单位知识。但材质成本公式 `volume / 1000 * 1.24` 假设 mm³→g，如果文件单位是米（坐标值大很多），计算结果没有物理意义。材质成本应该在 `fileGroup === 'mesh' || fileGroup === 'cad'` 且 `sourceUnit === 'millimeter'` 时才显示。

3. **用户上传无单位文件**：保持默认 mm/公制。可在 UI 添加"文件单位"下拉菜单（毫米/厘米/米/英寸）让用户手动设置。设置后更新 store 中的 `sourceUnit` 和显示标签，不缩放顶点。

4. **3DS 单位解析**：纯二进制格式，需要解析 `MASTER_SCALE` 块，成本较高。优先级可设为低，先默认 mm。

5. **FBX 单位解析**：FBX 有 ASCII 和二进制两种格式。ASCII 格式可直接文本扫描 `UnitScaleFactor`。二进制格式需解析 FBX 节点树。`FBXLoader.parse()` 后不暴露 GlobalSettings，需要单独二进制解析。

6. **模型居中与场景树**：居中操作基于坐标数值，不受单位标签影响，无需修改。

7. **材质成本显示的调整**：当前 `volume / 1000 * 1.24` 公式假设 mm³→g，仅对 mm 单位有效。规则：
   - 当 `fileGroup !== 'mesh' && fileGroup !== 'cad'` 时：**不显示**耗材行（point/volume/animation/gcode 等格式无意义）
   - 当 `sourceUnit === 'millimeter'` 时：正常显示 `volume / 1000 * 1.24 g (PLA)`
   - 其他情况：显示 `-` 或提示"当前单位不支持"

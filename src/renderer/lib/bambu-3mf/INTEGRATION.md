# Bambu Lab 3MF Metadata Integration Design

## 1. Goals

1. **零件名称** — 使用可读的名称（"vise body"）而非自动生成的 `part-0`，去掉文件扩展名。
2. **零件颜色** — 根据 Bambu 工程设置中的耗材颜色应用到网格材质，替代默认灰色。
3. **缩略图** — 优先提取 3MF 标准缩略图路径下的图片，缩放裁剪为本项目尺寸后使用；若无则回退到现有的 Three.js 渲染生成流程。
4. **盘分组** — 场景树中以盘为父节点分组（多盘时），允许切换显示。
5. **模型信息** — 在现有的 ModelInfoPanel 中展示 3MF 层级的元数据（标题、设计师、描述、许可证），**不展示缩略图**。
6. **不新增独立 UI 面板** — 所有功能必须融入已有的 UI 组件（ModelInfoPanel、场景树、FileListPanel、ModelGroup 材质/名称），不新增漂浮面板。

## 2. 数据流

```
.3mf 文件 buffer
   │
   ├── ThreeMFLoader.parse(buffer)     → meshes[0..N-1]  （不变）
   │
   ├── parseBambu3mf(buffer)           → Bambu3mfMetadata
   │      {
   │        filamentColors,             // ["#FFFFFF", "#A6A9AA", ...]
   │        filamentTypes,              // ["PETG", "PLA", ...]
   │        objects,                    // Map<objectId, BambuObjectMeta>
   │        parts: BambuPartMeta[],     // 扁平 0..N-1，顺序 = ThreeMFLoader 展开顺序
   │        plates,                     // Map<plateId, BambuPlateInfo>
   │        modelMeta,                  // title, designer, description, license
   │        thumbnailBlob?              // 提取的标准缩略图 blob
   │      }
   │
   └── 在 ModelGroup.tsx 的 multi-mesh 路径中合并：
        • partInfos[i].name          ← BambuPartMeta[i].name（去扩展名）
        • materials[i]               ← 耗材颜色（根据 BambuPartMeta[i].extruder）
        • sceneTree 节点             ← 多盘时按盘分组
        • LoadedFileModel.bambuMetadata  ← 给 ModelInfoPanel 展示
```

## 3. 各层改动

### 3.1 `bambu-3mf.ts` — 解析器增强

`Bambu3mfMetadata` 新增字段：

```typescript
export interface Bambu3mfMetadata {
  filamentColors: string[]
  filamentTypes: string[]
  objects: Map<string, BambuObjectMeta>
  parts: BambuPartMeta[]
  plates: Map<number, BambuPlateInfo>

  /** 3D/3dmodel.model 中的模型级 <metadata> */
  modelMeta?: {
    title?: string
    designer?: string
    description?: string
    license?: string
  }
  /** 从标准 3MF 缩略图路径提取的 PNG blob，用于 FileListPanel */
  thumbnailBlob?: Blob
}
```

解析新增内容：

- 从 `3D/3dmodel.model` 解析 `<model>` 直接子元素的 `<metadata>`，提取 `Title`、`Designer`、`Description`、`License`。
- 缩略图路径（按优先级）：
  1. `MetaData/thumbnail.png`（3MF ISO 标准路径）
  2. `Auxiliaries/.thumbnails/thumbnail_small.png`（通用 3MF）
  3. 不存在则 `thumbnailBlob` 为 undefined，回退到现有流程

**不去**解析 `Metadata/plate_1.png` 等拓竹扩展缩略图。扩展名处理：`stripExtension(name)`：去掉 `.stl` `.step` `.obj` `.3mf` 等后缀。

### 3.2 `formatLoaders.ts` — `LoaderResult`

添加可选字段：

```typescript
export interface LoaderResult {
  // ... 已有字段 ...
  bambuMetadata?: Bambu3mfMetadata
}
```

`'3mf'` case 中：

```typescript
case '3mf': {
  const group = new ThreeMFLoader().parse(buffer)
  const meshes = extractMeshes(group)
  let bambuMetadata: Bambu3mfMetadata | undefined
  try {
    bambuMetadata = parseBambu3mf(buffer)
  } catch {
    // 非 Bambu 3MF — 正常返回
  }
  return { meshes, objects: extractAllObjects(group), bambuMetadata }
}
```

### 3.3 `model-store.ts` — `LoadedFileModel`

添加：

```typescript
export interface LoadedFileModel {
  // ... 已有 ...
  bambuMetadata?: Bambu3mfMetadata
}
```

`WorkspacePage.tsx` 中构建 `LoadedFileModel` 时传入：

```typescript
useModelStore.getState().addLoadedFile({
  id: fileId,
  // ... 其他字段 ...
  bambuMetadata: loadResult.bambuMetadata,
})
```

### 3.4 `ModelGroup.tsx` — 零件名称和颜色

在 multi-mesh 循环中（约第 289–337 行）：

```typescript
const bambuMeta = result.bambuMetadata

for (let i = 0; i < meshes.length; i++) {
  const partMeta = bambuMeta?.parts[i]

  // 名称：优先使用 Bambu 零件名称（去扩展名）
  const rawName = partMeta?.name || src.name || `part-${i}`
  const partName = stripExtension(rawName)

  // 材质：从耗材颜色创建有色材质
  let mat = cloneAndConvertMaterial(src.material)
  if (partMeta && bambuMeta) {
    const fi = partMeta.extruder - 1
    const colorHex = bambuMeta.filamentColors[fi]
    if (colorHex && mat && 'color' in mat) {
      ;(mat as THREE.MeshStandardMaterial).color = new THREE.Color(colorHex)
    }
  }

  partInfos.push({
    partId: String(partId),
    meshIndex: i,
    name: partName,
    triangleCount: ...,
    extruder: partMeta?.extruder,
    plateId: partMeta?.plateId,
  })
}
```

扩展 `GlbPartInfo`：

```typescript
export interface GlbPartInfo {
  // ... 已有 ...
  extruder?: number
  plateId?: number
}
```

场景树构建（约第 432–440 行）：若有多盘，在场景树中创建盘父节点：

```typescript
if (bambuMeta && bambuMeta.plates.size > 1) {
  const plates = new Map<number, SceneTreeNode[]>()
  for (const info of partInfos) {
    const pid = info.plateId ?? 1
    if (!plates.has(pid)) plates.set(pid, [])
    plates.get(pid)!.push({
      id: info.partId, name: info.name, visible: true, expanded: true, meshIndex: info.meshIndex,
    })
  }
  tree = Array.from(plates.entries()).map(([plateId, children]) => ({
    id: `plate-${plateId}`,
    name: `Plate ${plateId}`,
    visible: true,
    expanded: true,
    children,
  }))
} else {
  tree = partInfos.map((info) => ({...}))
}
```

### 3.5 `WorkspacePage.tsx` — 缩略图回退逻辑

在延迟缩略图生成处（约第 208–236 行），优先使用 3MF 内嵌缩略图：

```typescript
postProcessedRef.current.add(file.id)

if (file.format === '3mf' && file.bambuMetadata?.thumbnailBlob) {
  putThumbnail(`${file.filePath}|${Date.now()}`, file.bambuMetadata.thumbnailBlob)
} else {
  // 回退：Three.js 渲染生成缩略图
  const loadResult = getCachedResult(file.id)
  if (loadResult) {
    generateThumbnailFromResult(...)
  }
}
```

缩略图尺寸：`putThumbnail` 已有的缓存机制会自动缩放。如果需要对 blob 做额外缩放/裁剪，可在 `putThumbnail` 之前用 Canvas 处理，但现有缩略图缓存系统已经处理了展示尺寸适配。

### 3.6 `ModelInfoPanel.tsx` — 模型元数据展示

在统计行下方新增"模型信息"区块（仅当 `bambuMetadata.modelMeta` 存在时显示）：

```typescript
const activeFile = loadedFiles.find(f => f.id === activeFileId)
const bambuMeta = activeFile?.bambuMetadata

// ... 原有统计行 ...

{bambuMeta?.modelMeta && (
  <>
    <div className="px-3 py-1 text-xs font-semibold text-muted-foreground border-t mt-1">
      模型信息
    </div>
    {bambuMeta.modelMeta.title && (
      <StatRow label="标题" value={bambuMeta.modelMeta.title} />
    )}
    {bambuMeta.modelMeta.designer && (
      <StatRow label="设计师" value={bambuMeta.modelMeta.designer} />
    )}
    {bambuMeta.modelMeta.license && (
      <StatRow label="许可证" value={bambuMeta.modelMeta.license} />
    )}
    {bambuMeta.modelMeta.description && (
      <div className="px-3 py-1.5 text-xs border-b text-muted-foreground">
        {stripHtml(bambuMeta.modelMeta.description)}
      </div>
    )}
  </>
)}
```

**不显示缩略图** — 右侧 FileListPanel 已有缩略图展示。

### 3.7 `FileListPanel.tsx` / `DesktopLayout.tsx` — 无需新增 UI

- FileListPanel 已有缩略图展示逻辑（`putThumbnail` → 缩略图缓存 → 显示），直接利用。
- 场景树已有嵌套结构，多盘分组后用户通过展开/折叠切换。
- 用色已通过 ModelGroup 材质直接渲染，无需额外 UI。
- 不新增任何浮动面板、按钮、对话框。

## 4. 缩略图提取细节

按以下路径顺序（严格按 3MF 标准，**不使用**拓竹扩展 `Metadata/plate_*.png`）：

```typescript
const thumbPaths = [
  'MetaData/thumbnail.png',                            // 3MF ISO 标准
  'Auxiliaries/.thumbnails/thumbnail_small.png',       // 通用 3MF
]
for (const path of thumbPaths) {
  if (unzipped[path]) {
    thumbnailBlob = new Blob([unzipped[path]], { type: 'image/png' })
    break
  }
}
```

## 5. 耗材颜色→材质映射

 extruder 索引（1-based）对应 filament 数组（0-based）：

```
extruder=1 → filamentColors[0] → white PLA (#FFFFFF)
extruder=2 → filamentColors[1] → gray PLA (#A6A9AA)
extruder=3 → filamentColors[2] → light blue PLA (#8BD5EE)
extruder=4 → filamentColors[3] → blue PETG (#0069B1)
extruder=5 → filamentColors[4] → pink PLA (#F330F9)
```

在 `ModelGroup.tsx` 中创建材质时，设置 `material.color` 为色值，保留原材质的 roughness/metalness。对 `extruder=0`（未知）回退默认灰色。

## 6. 盘可见性

场景树中盘节点支持层级可见性切换 —— 现有的 `toggleNodeVisible` 已通过 `setAllVisible` 处理子节点联动。无需额外视图层 UI。

## 7. 向后兼容

- 非 Bambu 3MF 文件：`parseBambu3mf()` 返回空数据，`bambuMetadata = undefined`。
- `bambuMetadata` 所有地方均为可选字段，空值检查到位。
- ThreeMFLoader 输出不变。
- 缩略图不存在时完全回退到现有生成流程。

## 8. 测试

### 阶段 1 — 解析器增强
- `bambu-3mf.test.ts`:
  - ✅ 验证 `modelMeta` 提取（title, designer, description, license）
  - ✅ 验证标准缩略图路径提取（`MetaData/thumbnail.png`）
  - ✅ 验证非 Bambu 3MF 返回空数据
  - ✅ 验证零件名去扩展名（"vise body.stl" → "vise body"）

### 阶段 2 — Loader 集成
- `bambu-3mf.test.ts`:
  - ✅ 验证 `loadFormat('3mf', buffer)` 返回的 `LoaderResult.bambuMetadata` 不为空
  - ✅ 验证非 3mf 格式不包含 bambuMetadata

### 阶段 3 — ModelGroup 应用
- 添加新测试文件或集成测试：
  - ✅ 加载 `vise.3mf`，验证 `partInfos[0].name` = `"screw holder"`（不是 `"part-0"`）
  - ✅ 验证 `partInfos[8].name`（vise body 第一部分）= `"vise body_1"`
  - ✅ 验证 `partInfos[9].name`（vise body 第二部分）= `"vise body_2"`
  - ✅ 验证 mesh 材质颜色匹配 filament 色值
  - ✅ 验证多盘时场景树有盘父节点
  - ✅ 单盘文件场景树保持扁平

### 阶段 4 — 缩略图集成
- 添加测试：
  - ✅ 验证标准 3MF 缩略图路径提取成功时返回 Blob
  - ✅ 验证标准路径不存在时 `thumbnailBlob` 为 undefined
  - ✅ 验证回退逻辑不阻塞现有缩略图生成

### 阶段 5 — ModelInfoPanel
- 添加测试：
  - ✅ 验证 `bambuMetadata.modelMeta` 存在时展示附加行
  - ✅ 验证 `bambuMetadata.modelMeta` 不存在时不影响原有展示

## 8. Implementation Order

| 阶段 | 范围 | 文件 | 测试 |
|------|------|------|------|
| 1 | 解析器增强：modelMeta、缩略图提取、去扩展名 | `bambu-3mf.ts` | `bambu-3mf.test.ts` 新增 3-4 条 |
| 2 | LoaderResult + store 集成 | `formatLoaders.ts`, `model-store.ts`, `WorkspacePage.tsx` | `bambu-3mf.test.ts` 新增 2 条 |
| 3 | ModelGroup 零件名称、耗材颜色、盘分组 | `ModelGroup.tsx` | 集成测试 |
| 4 | 缩略图回退 | `WorkspacePage.tsx` | 单元测试 |
| 5 | ModelInfoPanel 元数据展示 | `ModelInfoPanel.tsx` | 单元测试 |

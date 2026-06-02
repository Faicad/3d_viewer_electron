# 模型文件单位检测方案

为本项目实现每个文件的单位自动检测。

---

## 1. 目标

每个 `LoadedFileModel.sourceUnit` 应反映文件真实的物理单位：

1. 文件元数据有单位声明 → 采用
2. 无元数据 → 采用格式默认值（`file-formats.ts` 中 `defaultUnit`）
3. STL 无元数据 → 启发式判断（包围盒体积）

`sourceUnit` 确定后，热床可通过 `UNIT_TO_MM` 表查到 `rawToMM`（1 场景单位 = 多少 mm），从而正确选择尺寸。

---

## 2. 单位转换系数

```typescript
// src/config/file-formats.ts，紧跟 sourceUnitToLabel 之后

/** 1 个指定单位 = 多少 mm */
export const UNIT_TO_MM: Record<UnitSystem, number> = {
  millimeter: 1,
  centimeter: 10,
  meter: 1000,
  inch: 25.4,
  foot: 304.8,
  micron: 0.001,
  angstrom: 0.000_000_1,
}
```

热床使用：`rawToMM = UNIT_TO_MM[sourceUnit]`。

---

## 3. 各格式解析规则

### 3.1 GLB / glTF

glTF 2.0 规范默认单位 = 米。

- 检查 `gltfJson.extensionsUsed` 中是否有 `STEP_T`：
  - 有 → `'millimeter'`（CAD-skill GLB，来自 STEP 转换。注意：虽然 GLB 顶点已在米空间，但 sourceUnit 记录的是**原始 STEP 的单位**，不是 GLB 顶点单位。实际 rawToMM 仍用 `UNIT_TO_MM['meter']` = 1000）
  - 无 → `'meter'`

> **关键**：STEP_T GLB 的 `sourceUnit = 'millimeter'` 表示**源文件**单位。但顶点坐标已经被 `CAD_TO_GLB_SCALE = 0.001` 转为米空间。热床计算 rawToMM 时应当用**顶点坐标的单位**而非 sourceUnit：
>
> ```typescript
> // sourceUnit 用于 UI 显示（如 "mm" 标签）
> // rawToMM 用于热床尺寸计算，查的是顶点所在坐标系的单位
> const vertexUnit = (format === 'glb' || format === 'gltf') ? 'meter' : sourceUnit
> const rawToMM = UNIT_TO_MM[vertexUnit]
> ```

### 3.2 3MF

3MF XML 根元素 `<model unit="...">` 声明单位，默认 `millimeter`。

**方案**：传给 `ThreeMFLoader` 之前用 `DOMParser` 或正则从 buffer 头部提取：

```typescript
function parse3mfUnit(buffer: ArrayBuffer): UnitSystem {
  const header = new Uint8Array(buffer.slice(0, 2048))
  const text = new TextDecoder().decode(header)
  const match = text.match(/<model[^>]*\sunit="([^"]+)"/i)
  if (match) {
    const val = match[1].toLowerCase()
    if (['micron','millimeter','centimeter','inch','foot','meter'].includes(val)) {
      return val as UnitSystem
    }
  }
  return 'millimeter' // 3MF 默认
}
```

> 3MF 是 ZIP 包，第一个文件是 `3D/3dmodel.model`（XML）。上述方法扫描 ZIP 头部即可，不需要完整解压。

### 3.3 STL（启发式）

STL 不含单位元数据。加载完成后根据包围盒体积猜测：

```typescript
function guessStlUnit(bbox: Box3): UnitSystem {
  const w = bbox.max.x - bbox.min.x
  const h = bbox.max.y - bbox.min.y
  const d = bbox.max.z - bbox.min.z
  const volume = w * h * d

  if (volume > 0 && volume < 0.008) return 'meter'      // 边长 < 0.2 单位 → 可能是米
  if (volume > 0 && volume < 8.0)   return 'inch'       // 边长 < 2 单位 → 可能是英寸
  return 'millimeter'                                     // 默认 mm
}
```

阈值依据：
- `0.008` 的立方根 ≈ 0.2。如果以毫米为单位，200mm³ 物体的 STL 坐标是 `200³ = 8,000,000`，远大于 0.008。所以体积 < 0.008 说明文件以米为单位。
- `8.0` 的立方根 ≈ 2.0。2 英寸 ≈ 50.8mm，在 3D 打印常见范围内。

> **注意**：包围盒必须在 `geometry.center()` **之前**读取，因为 center() 会平移几何体。或者从原始 `box.min/max` 直接计算，不受平移影响。

### 3.4 AMF

同 3MF，从 XML `<amf unit="...">` 提取。默认 `millimeter`。

### 3.5 其他格式

使用 `file-formats.ts` 中已定义的 `defaultUnit`，无需额外解析。

---

## 4. 数据流

```
文件加载
  ↓
formatLoaders.loadFormat() 或 直接解析 buffer
  ↓
检测 sourceUnit:
  ├─ GLB → 查 extensions 中有无 STEP_T，默认 'meter'
  ├─ 3MF → parse3mfUnit(buffer)，默认 'millimeter'
  ├─ AMF → parseAmfUnit(buffer)，默认 'millimeter'
  ├─ STL → 先用 'millimeter' 占位，加载后启发式修正
  └─ 其他 → FORMAT_MAP[format].defaultUnit
  ↓
addLoadedFile({ ..., sourceUnit, ... })
  ↓
ModelGroup 加载完成
  ├─ STL: 计算 bbox 体积 → guessStlUnit() → updateFileSourceUnit()
  └─ GLB/3MF: sourceUnit 已在 addLoadedFile 时确定
  ↓
sourceUnit 写入 model-store
  ↓
热床使用: rawToMM = UNIT_TO_MM[vertexUnit]
  其中 vertexUnit: GLB 固定 'meter'，其他格式用 sourceUnit
```

---

## 5. 与热床的关系

`heatbed-unit-strategy.md` 中的 `rawToMM` 改从 `sourceUnit` 推导：

```typescript
// 顶点所在坐标系的单位（不是源文件单位）
// GLB 顶点始终在米空间（glTF 规范 + STEP→GLB 已转米）
const vertexUnit = (format === 'glb' || format === 'gltf') ? 'meter' : sourceUnit
const rawToMM = UNIT_TO_MM[vertexUnit]
const autoSize = autoSelectBedSize(modelBBox, rawToMM)
```

**示例**：

| 格式 | sourceUnit | vertexUnit | rawToMM | 200mm 床的场景尺寸 |
|------|-----------|-----------|---------|-------------------|
| GLB (CAD) | `'millimeter'` | `'meter'` | 1000 | 0.2 |
| GLB (native) | `'meter'` | `'meter'` | 1000 | 0.2 |
| 3MF | `'millimeter'` | `'millimeter'` | 1 | 200 |
| STL (启发式→meter) | `'meter'` | `'meter'` | 1000 | 0.2 |
| STL (启发式→inch) | `'inch'` | `'inch'` | 25.4 | 200/25.4 ≈ 7.87 |
| STL (默认 mm) | `'millimeter'` | `'millimeter'` | 1 | 200 |

> 注意 GLB 的特殊性：无论 sourceUnit 是什么（STEP_T → `'millimeter'`，否则 `'meter'`），顶点坐标始终在**米**空间。所以热床的 `rawToMM` 固定用 `UNIT_TO_MM['meter']` = 1000。

---

## 6. 实现步骤

1. **`file-formats.ts`**：添加 `UNIT_TO_MM` 常量、`parse3mfUnit()`、`parseAmfUnit()`、`guessStlUnit()`
2. **`model-store.ts`**：新增 `updateFileSourceUnit(fileId, unit)` action
3. **`ModelGroup.tsx`**：
   - STL 分支：`center()` 前保存 bbox，调用 `guessStlUnit()`，通过 `onSourceUnitChange` 传出
   - 3MF 分支：调用 `parse3mfUnit()`，通过 `onSourceUnitChange` 传出
   - GLB 分支：检查 STEP_T，通过 `onSourceUnitChange` 传出（已有逻辑）
4. **`ViewportContainer.tsx`**：`onSourceUnitChange` handler 写入 store
5. **上传流程**（DesktopLayout / WorkspacePage）：调用 `loadFormat` 后，对非 STL 格式直接用解析出的 `sourceUnit`，STL 先用默认值占位

---

## 7. 不做的

- **不缩放顶点坐标**（与 `units-investigation.md` 原则一致）
- **不修改 Three.js loader 源码**（如 patch `ThreeMFLoader`）
- **STEP 文件**：由后端/OCCT 处理转为 GLB，前端不解析 STEP 单位

# 热床尺寸与坐标系处理方案

---

## 0. 核心要求

**热床反映实际物理尺寸。** 比例出错 = 热床失去意义。

---

## 1. 两个概念

| 概念 | 是什么 | 谁来定 | 示例（GLB） | 示例（3MF） |
|------|--------|--------|-----------|-----------|
| **sourceUnit** | 顶点坐标的物理单位。`UnitSystem` 类型：`'meter'` / `'millimeter'` / `'inch'` 等 | 文件元数据解析，或启发式判断，或格式默认值。存 `model-store.sourceUnit` | `'meter'`（glTF 规范） | `'millimeter'`（3MF 默认） |
| **坐标值** | Three.js 中顶点坐标的实际数值。就是 bbox 的 `min`/`max` | loader 加载后不做缩放，格式的规范单位是什么数值就是什么 | 0.018 | 18 |

**换算**：`坐标值 × UNIT_TO_MM[sourceUnit] = 毫米`

`UNIT_TO_MM` 是定义在 `file-formats.ts` 的常量表：

```typescript
UNIT_TO_MM = { millimeter: 1, centimeter: 10, meter: 1000, inch: 25.4, foot: 304.8, ... }
```

### GLB 的 sourceUnit 是 `'meter'`

glTF 规范规定距离单位为米。STEP→GLB 通过 `CAD_TO_GLB_SCALE = 0.001` 已将顶点从 mm 转为米。所以**所有 GLB 文件的 sourceUnit 都是 `'meter'`**，无论是否来自 STEP。

> 当前代码中 ModelGroup 对含 STEP_T 扩展的 GLB 设置了 `sourceUnit = 'millimeter'`，这是一个 bug，应改为 `'meter'`。

---

## 2. 不同格式的坐标值

| 格式 | sourceUnit | UNIT_TO_MM[sourceUnit] | 18mm 模型的坐标值 | 200mm 床的坐标值 |
|------|-----------|----------------------|-----------------|----------------|
| GLB/glTF | `'meter'` | 1000 | 0.018 | 0.2 |
| STEP→GLB | `'meter'` | 1000 | 0.018 | 0.2 |
| 3MF | `'millimeter'` | 1 | 18 | 200 |
| STL (默认) | `'millimeter'` | 1 | 18 | 200 |
| STL (启发式→inch) | `'inch'` | 25.4 | 18/25.4≈0.71 | 200/25.4≈7.87 |

公式：`床坐标值 = 物理尺寸(mm) / UNIT_TO_MM[sourceUnit]`

---

## 3. 方案

### 3.1 原则

1. **Heatbed 不关心 sourceUnit**——`size` 参数就是坐标值，直接用于几何体
2. **autoSelectBedSize 接收 UNIT_TO_MM[sourceUnit] 做 mm 换算**——与热床档位（200/300/500/1000mm）比较，返回坐标值
3. **调用方负责查 sourceUnit，计算单位换算因子**

### 3.2 数据流

```
加载完成 → sourceUnit, modelBBox(坐标值)
                ↓
      mmPerUnit = UNIT_TO_MM[sourceUnit]
                ↓
      bedSize = autoSelectBedSize(modelBBox, mmPerUnit)   → 坐标值
                ↓
      store.setBedSize(bedSize)        → 传给 Heatbed
      store.setBedRawToMM(mmPerUnit)   → 网格步长 + 尺寸标签用
                ↓
      相机 bedBox = Box3(-h,-h,0, h,h,0)   h = bedSize / 2
                ↓
      尺寸标签: bedSize * mmPerUnit + " mm"
```

### 3.3 autoSelectBedSize

```typescript
/**
 * @param bbox - 模型包围盒（坐标值）
 * @param mmPerUnit - UNIT_TO_MM[sourceUnit]
 * @returns 热床尺寸（坐标值）
 */
function autoSelectBedSize(bbox: Box3, mmPerUnit: number): number {
  const pad = 20 // mm
  const extentMM = Math.max(bbox.max.x - bbox.min.x, bbox.max.y - bbox.min.y) * mmPerUnit
  const neededMM = extentMM + pad * 2

  for (const sizeMM of [200, 300, 500, 1000]) {
    if (sizeMM >= neededMM) return sizeMM / mmPerUnit
  }
  return 1000 / mmPerUnit
}
```

### 3.4 Heatbed

`size` 参数就是坐标值，直接用于几何体创建：

```typescript
class Heatbed {
  constructor(config: { size: number }) {
    const hw = config.size / 2  // 坐标值，不转换
  }
}
```

---

## 4. 尺寸标签

```typescript
label.textContent = `${Math.round(bedSize * mmPerUnit)} × ${Math.round(bedSize * mmPerUnit)} mm`
```

| 格式 | bedSize（坐标值） | mmPerUnit | 显示 |
|------|-----------------|-----------|------|
| GLB | 0.2 | 1000 | **200 × 200 mm** |
| 3MF | 200 | 1 | **200 × 200 mm** |

---

## 5. 验证

| | GLB (keycap_v6.step) | 3MF (vise.3mf) |
|---|---|---|
| sourceUnit | `'meter'` | `'millimeter'` |
| bbox（坐标值） | 0.018 | 370 |
| mmPerUnit = UNIT_TO_MM[sourceUnit] | 1000 | 1 |
| autoSelectBedSize | 200/1000 = **0.2** | 500/1 = **500** |
| 模型/床比例 | 0.018/0.2 = 9% | 370/500 = 74% |
| 标签 | 0.2×1000 = **200 mm** | 500×1 = **500 mm** |

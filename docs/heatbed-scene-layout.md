# 热床场景布局规范

> 有热床时，物体、热床、阴影地板（ShadowFloor）、环境之间的空间位置关系。

---

## 1. 单位体系

### 1.1 两层单位

| 层级 | 单位 | 示例 | 用途 |
|------|------|------|------|
| 用户接口 | **mm** | `bedSize = 200` | store、配置、UI 显示、`autoSelectBedSize` |
| 原始坐标空间 | 模型坐标系 | `0.2`（GLB 即米, `200mm → 0.2`） | Three.js 几何体顶点、相机计算 |

### 1.2 转换规则

```
用户接口 (mm)  →  原始坐标空间:  × 0.001
原始坐标空间   →  用户接口 (mm):  × 1000
```

> **依据**：`units-investigation.md`。本项目的核心原则是**不做数值缩放**——所有 loader 原样加载顶点坐标。不同格式的原始坐标单位不同：
>
> - GLB/glTF：规范单位为**米**（`1 unit = 1m`）。STEP→GLB 经过 `CAD_TO_GLB_SCALE = 0.001`（mm→m），坐标在米空间。
> - STL/OBJ/PLY 等：行业惯例为 **mm**（`1 unit = 1mm`），但无格式强制。
> - 3MF：规范单位为 mm（默认），可声明为 inch 等。
>
> 由于 GLB 是 STEP 和大多数 3D 格式的最终交付格式，**原始坐标空间以米为主**。热床尺寸以 mm 为用户接口，内部 `×0.001` 转为米。

### 1.3 适用范围

`×0.001` 转换发生在以下边界：

| 位置 | 方向 |
|------|------|
| `Heatbed.createBedPlaneGeometry(size)` | mm → raw |
| `Heatbed.generateGridLines(size, step)` | mm → raw |
| `Heatbed.getBoundingBox()` | mm → raw |
| `ViewportContainer` 中 `bedSize/2` 创建 bedBox | mm → raw |
| `autoSelectBedSize(modelBBox)` | raw → mm（模型 bbox 在 raw 空间，×1000 比较） |

---

## 2. Z 轴层级（从下到上）

热床放在**地面上**，不悬空。地面由模型包围盒底部决定（与 ShadowFloor 一致）。

### 2.1 地面基准

```
有模型时:     groundZ = modelBbox.min.z   （模型贴地后 = 0）
无模型时:     groundZ = 0
```

### 2.2 各层偏移

```
  Z = groundZ + 0.000   ← 热床上表面（物体底面贴此面）
  Z = groundZ - 0.001   ← 热床底色平面 (GROUND_Z_OFFSET, depthWrite:false)
  Z = groundZ - 0.002   ← 热床网格线 (GRIDLINE_Z_OFFSET, depthWrite:false)
  Z = groundZ - 0.003   ← ShadowFloor 阴影接收面
```

### 2.3 实现

Heatbed 创建时接收 `groundZ` 参数，平面和网格线的 Z 坐标基于 `groundZ` 计算偏移，而非硬编码绝对值。

```typescript
class Heatbed {
  constructor(config: BedConfig, groundZ: number = 0) {
    this.planeMesh.position.z = groundZ + GROUND_Z_OFFSET   // -0.001
    this.gridLines.position.z = groundZ + GRIDLINE_Z_OFFSET  // -0.002
  }

  setGroundZ(z: number) {
    this.planeMesh.position.z = z + GROUND_Z_OFFSET
    this.gridLines.position.z = z + GRIDLINE_Z_OFFSET
  }
}
```

`groundZ` 由 SceneSetup 在模型加载/切换时更新：无模型时为 0，有模型时从 `engine-store.modelBbox` 取 `min.z`。

---

## 3. 物体放置：底面贴热床

### 3.1 当前行为（错误）

ModelGroup 加载模型后调用 `geometry.center()`，使模型**几何中心**位于原点 `(0, 0, 0)`。这导致模型一半在 Z>0、一半在 Z<0——**下半部分陷入热床下方**。

```
加载 → center() → 模型质心在 (0,0,0)
                      ↓
              model.min.z < 0  ← 模型陷入床下
              model.max.z > 0
```

### 3.2 正确行为

模型底面（`modelBBox.min.z`）应精确落在热床上表面（Z=0）。**平移模型使 min.z = 0**。

```
加载 → 计算 bbox.min.z → 平移 -bbox.min.z → 模型底面在 Z=0
                                                    ↓
                                          模型站在热床上
```

### 3.3 伪代码

```typescript
// ModelGroup 中，在 center() 之后
const bbox = new THREE.Box3().setFromObject(group)
// 底面贴 Z=0（热床上表面）
const zLift = -bbox.min.z
for (const mesh of meshes) {
  mesh.position.z += zLift
}
// 更新 centering offset（包含 Z 偏移）
onCenteringOffset([center.x, center.y, center.z - zLift])
```

### 3.4 效果

| 模型高度 | 原 Z 范围（居中） | 新 Z 范围（站在床上） |
|---------|------------------|---------------------|
| 10mm | [-5, 5] | [0, 10] |
| 50mm | [-25, 25] | [0, 50] |

---

## 4. 热床状态

### 4.1 选中/未选中

本项目只有**一个热床**，始终处于**选中状态**。

未选中态仅用于多热床场景（如 OrcaSlicer 的多 Plate），不在本项目范围内。

| 状态 | 底色 | 网格线色 | 触发条件 |
|------|------|---------|---------|
| **选中 (selected)** | `0x474747` | `0x878B88` | `showHeatbed=true` — 始终 |
| 暗色选中 | 同上 | 同上 | + 暗色模式 |

---

## 5. 热床尺寸

### 5.1 默认尺寸

无模型时：**300mm**（主流桌面机尺寸）。

### 5.2 自动选择

模型加载后，调用 `autoSelectBedSize(modelBBox)`：

1. 取模型 XY 范围，转为 mm（×1000）
2. 加 20mm 边距（两侧各 20mm = 总共 40mm）
3. 向上匹配到第一个 ≥ 需要的档位

| 模型 XY 范围 | 需要(含边距) | 选中 |
|-------------|------------|------|
| ≤ 160mm | ≤ 200mm | **200mm** |
| 161-260mm | 201-300mm | **300mm** |
| 261-460mm | 301-500mm | **500mm** |
| 461-960mm | 501-1000mm | **1000mm** |
| > 960mm | > 1000mm | **1000mm**（兜底） |

### 5.3 尺寸变更联动

`bedSize` 变更时：
1. Heatbed 几何重建（4 顶点、2 三角形）
2. 网格线重建（重新计算 step + 生成线段）
3. 相机自适应（`applyCameraFit` 重新计算）
4. 底部尺寸 label 更新

---

## 6. 相机行为

保持 OrcaSlicer 兼容（详见 `camera-heatbed-orca-compat.md`）：

| `showHeatbed` | 聚焦框 | margin | 效果 |
|--------------|--------|--------|------|
| `true` | 热床 XY 平面（Z=0, 尺寸=bedSize） | **2.0** | 床占 ~50% 视口 |
| `false` | 模型包围盒（完整 3D） | **1.25** | 模型占 ~80% 视口 |

模型站在床上（§3）后，`showHeatbed=true` 时相机聚焦床面，模型自然出现在床上。

---

## 7. 与环境/阴影的交互

### 7.1 ShadowFloor

- **热床可见时**：ShadowFloor 仍在热床下方（Z < GRIDLINE_Z），接收物体投射到床面上的阴影
- **热床不可见时**：ShadowFloor 按现有逻辑工作
- 热床底色平面 `depthWrite: false`，不阻挡阴影

### 7.2 环境贴图（Studio / CleanRoom）

- 热床用 `MeshBasicMaterial`，不受 `scene.environment` 影响（不参与 IBL 反射）
- CleanRoom 环境的地板平面当前在模型底部。有热床时，可考虑：
  - 环境地板保持在原始位置（Z = modelBbox.min.z 原始值）
  - 或调整到 Z=0 对齐热床
  - **范围限定**：环境渲染在热床边界之外（热床覆盖区域内由热床底色平面显示）

### 7.3 背景

热床底色平面仅覆盖 `[-h, h] × [-h, h]`（h = bedSize/2），此区域外为环境背景或纯色背景。

---

## 8. 检查清单

- [ ] 模型加载后底面在 Z=0（站在热床上），而非居中
- [ ] 热床底色平面 Z=-0.001（略低于物体底面，避免 Z-fighting）
- [ ] 热床网格线 Z=-0.002
- [ ] ShadowFloor Z ≤ -0.003（热床下方）
- [ ] 热床始终选中态（深底色 `0x474747`，单热床无多 Plate 需求）
- [ ] 热床尺寸自动选择最小可容纳档位
- [ ] 热床尺寸 mm→raw 转换（×0.001）在 Heatbed 和 ViewportContainer 中一致
- [ ] `autoSelectBedSize` 将模型 bbox raw→mm（×1000）后再比较
- [ ] 相机聚焦热床时（margin=2.0），站在床上的模型可见
- [ ] 热床切换时不改变环境贴图/背景设置

# 相机与热床兼容 OrcaSlicer 的完整方案

> 基于 OrcaSlicer 源码分析，重新设计相机自适应与热床尺寸选择的协同逻辑。

---

## 1. 问题回顾

之前的实现有一个根本错误：**为了不让小模型在大热床上"消失"，强行改变了相机聚焦目标**——从聚焦热床改为聚焦模型。这违背了需求文档的核心设计：

> 当 `showHeatbed = true` 时，相机自动聚焦目标从**模型**切换为**热床**

本方案恢复 OrcaSlicer 的原始设计，并解释如何通过**热床尺寸自动选择**来确保模型始终可见。

---

## 2. OrcaSlicer 的完整流程

### 2.1 打开模型 → 自动选床

OrcaSlicer 中，每个打印机 preset 有固定的热床形状（例如 Bambu X1C 是 256×256mm 的方形）。打开模型后：

1. 模型包围盒已知
2. 热床形状已知（来自 printer preset）
3. 相机自适应：`zoom_to_bed()` → margin = **2.0**

```
模型包围盒 (任意大小)
       ↓
热床尺寸 (固定, 来自 printer)
       ↓
相机: zoom_to_box(bedBBox, margin=2.0)
       ↓
结果: 热床占屏幕约 50%, 模型自然处于热床之上
```

**在 OrcaSlicer 中，不存在"床太大、模型太小"的问题**，因为：
- 打印机热床是物理固定的（你不可能把 X1C 的 256mm 床换成 500mm）
- 模型都是在这个确定尺寸的床上打印的
- 用户需要看到完整的热床来判断模型放置位置

### 2.2 本项目与 OrcaSlicer 的差异

| 项目 | OrcaSlicer | 3d_viewer_electron |
|------|-----------|-------------------|
| 热床来源 | 打印机 preset（固定） | **根据模型自动选择** |
| 尺寸档位 | 连续（任意多边形） | 4 档离散（200/300/500/1000） |
| 模型-热床关系 | 热床固定，模型适应 | **热床自适应模型** |

**关键差异**：本项目没有固定的打印机 preset，热床大小由模型尺寸决定。这既是灵活性的来源，也是潜在问题的根源。

---

## 3. 热床尺寸选择策略

### 3.1 核心原则

**选最小的、能容纳模型的热床档位**（含 20mm 边距）。

这是文档 §2.5 的 `autoSelectBedSize` 函数，逻辑本身没有问题：

```typescript
function autoSelectBedSize(modelBBox: Box3): BedSize {
  const pad = 20
  const needed = Math.max(
    modelBBox.max.x - modelBBox.min.x,
    modelBBox.max.y - modelBBox.min.y,
  ) + pad * 2

  for (const size of SUPPORTED_BED_SIZES) {
    if (size >= needed) return size
  }
  return 1000 // 兜底最大档
}
```

### 3.2 为什么不需要特殊处理

以 18mm 模型为例：
- 需要尺寸 = 18 + 40 = **58mm**
- 第一个 ≥ 58mm 的档位是 **200mm**
- 床 = 200mm，模型 = 18mm，模型占床的 **9%**

在 OrcaSlicer 中，相机聚焦 200mm 热床 (margin=2.0)：
- 相机距离 ≈ **600mm**（见 §4.2 计算）
- 18mm 模型在屏幕上的像素宽度 ≈ **28px**（881px 宽 viewport）
- **模型肉眼可见**。它不是占满屏幕，而是像一个真实的物体放在床上——这正是 slicer 的视觉语言

如果模型是 50mm（比如 benchy），选 200mm 床，模型占床 25%，更明显。

| 模型大小 | 选中热床 | 模型占床比例 | 模型屏幕像素 (≈) |
|---------|---------|------------|----------------|
| 18mm | 200mm | 9% | ~28px |
| 50mm | 200mm | 25% | ~78px |
| 180mm | 300mm | 60% | ~265px |
| 280mm | 500mm | 56% | ~247px |
| 800mm | 1000mm | 80% | ~282px |

**对于最小的模型 (18mm → 200mm bed)，模型仍有 ~28px 宽，完全可见。**

### 3.3 之前"看不见"的根因

之前测试中 `modelPixelsExist = false` 的原因不是模型太小，而是**相机距离计算错误**和**测试等待时机不匹配**：

1. **相机距离公式错误**（已修复）：
   ```
   // 错误: distance = (diag * viewport_w) / (zoom * tan(fov/2))
   // 正确: distance = viewport_w / (2 * zoom * tan(fov/2))
   ```
   错误公式将相机推到 900mm+ 而不是 ~600mm

2. **测试在相机动画未完成时就检查**（已修复）：
   Heatbed plane mesh 提前触发了 `waitForFunction(meshCount > 0)`，导致在 `handleModelLoaded` 调用 `applyCameraFit` **之前**就开始了场景检查

3. **修复后的测试结果**（使用正确的 OrcaSlicer 算法 + 正确的等待）：
   ```
   camDist: ~600mm, modelMeshCount: 1, modelMeshVisible: 1
   modelPixelsExist: true  ← 模型在屏幕上可见
   ```

---

## 4. 相机算法完整移植

### 4.1 架构

```
handleModelLoaded(box)
  ↓
autoSelectBedSize(box) → bedSize (200|300|500|1000)
  ↓
setBedSize(bedSize)
  ↓
if showHeatbed === true:
    focusBox = bedOnly(bedSize)        // 仅热床 XY, Z=0
    margin   = 2.00                    // OrcaSlicer DefaultCameraZoomToBedMarginFactor
else:
    focusBox = modelBox                // 模型包围盒
    margin   = 1.25                    // OrcaSlicer DefaultCameraZoomToVolumesMarginFactor
  ↓
computeCameraFitTarget(camera, focusBox, viewport, margin)
  ↓ 返回 { position, target }
  ↓
CameraAnimator lerp → 相机就位
```

### 4.2 相机距离公式（正确版本）

OrcaSlicer 中 `m_zoom` 与可见范围的关系：

```
OrcaSlicer: visible_world_width_at_distance = viewport_w / m_zoom
Three.js:   visible_world_width_at_distance = 2 * d * tan(fov/2)

令两者相等:
    viewport_w / zoom = 2 * d * tan(fov/2)
    d = viewport_w / (2 * zoom * tan(fov/2))
```

加上最小安全距离（防止相机进入物体内部）：

```typescript
const fovRad = THREE.MathUtils.degToRad(camera.fov)
const distance = Math.max(
  viewport.width / (2 * zoom * Math.tan(fovRad / 2)),
  camera.near * 10,  // 最小安全距离
)
```

### 4.3 `computeCameraFitTarget` 与 `fitCameraToTarget`

两个函数的分工：

| 函数 | 用途 | 是否修改 camera |
|------|------|----------------|
| `computeCameraFitTarget` | 计算目标位置和注视点，**不修改** camera | ❌ 不修改 |
| `fitCameraToTarget` | 直接设置 camera 位置和朝向 | ✅ 修改 |

`applyCameraFit` 使用 `computeCameraFitTarget` 获取目标位置，然后通过 `CameraAnimator` 平滑过渡。这避免了直接修改 camera 导致的动画跳过问题。

### 4.4 热床聚焦 vs 模型聚焦的差异

两者的差异**仅在于**：
- `focusBox` 的内容（bed-only vs model-box）
- `marginFactor` 的值（2.0 vs 1.25）
- Z 轴处理（bed: Z 折叠为 0，仅关心 XY 平面；model: 完整 3D）

**不改变相机旋转角度**。两者都使用 OrcaSlicer 的默认 top-front 视角（天顶角 45°, 方位角 45°）。

---

## 5. 数据流

```
用户打开 STL/3MF/AMF/STEP 文件
  ↓
modelFormat 变化
  ↓
initShowHeatbed(format, buffer)
  ├─ format in {stl, 3mf, amf, step}        → showHeatbed = true
  ├─ format === glb && isCadSkillGlb(buffer) → showHeatbed = true
  └─ 否则                                    → showHeatbed = false
  ↓
Heatbed.setVisible(showHeatbed)
  ↓
ModelGroup 加载完成 → onLoaded(box)
  ↓
handleModelLoaded(box):
  │
  ├─ if showHeatbed:
  │    bedSize = autoSelectBedSize(box)
  │    setBedSize(bedSize)                    ← 触发 Heatbed.setConfig()
  │    focusBox = bedOnlyBox(bedSize)
  │    applyCameraFit(focusBox, margin=2.0)
  │
  └─ else:
       applyCameraFit(box, margin=1.25)
  ↓
CameraAnimator 平滑过渡到目标位置
  ↓
用户看到: 热床 + 模型（热床视角） 或 模型（模型视角）
```

---

## 6. 实现清单（修正版）

### 需要回滚的改动

在 `ViewportContainer.tsx` 中：
1. **恢复** `handleModelLoaded` 中的热床聚焦分支
2. **恢复** `_handleResetCamera` 中的热床聚焦逻辑
3. **恢复** `pendingBoxRef` useEffect 中的热床聚焦逻辑

### 保留的改动

1. `cameraFit.ts` — 距离公式修复（`viewport_w / (2 * zoom * tan(fov/2))`）
2. `engine-store.ts` — `_heatbedExplicitlySet` 标志位
3. `types.ts` — `HEATBED_DEFAULT_FORMATS` 仅含 4 种格式
4. `types.ts` — `isCadSkillGlb` 检测 STEP→GLB
5. `Heatbed.ts` — 完整的 Heatbed 类
6. `SceneSetup.tsx` — Heatbed 生命周期管理
7. `DesktopLayout.tsx` — 切换按钮

### 需要修改的测试

1. `step-loading.spec.ts` — 热床测试等待模型 mesh（非热床 mesh）+ 等待相机动画完成
2. `shadow-fit-diag.spec.ts` — 相机等待条件改为 `__animActive`
3. `object-selection.spec.ts` — 禁用热床 + 等待动画完成
4. `highlight-artifacts.spec.ts` — 禁用热床
5. `scene-tree.spec.ts` — mesh 计数排除 Heatbed 父节点

---

## 7. 关键设计决策

| 决策 | 理由 |
|------|------|
| 热床尺寸不受模型影响（仅 auto-select） | 与 OrcaSlicer 一致：热床是"场景"，模型放在上面 |
| 相机聚焦热床 (margin=2.0) | 与 OrcaSlicer `zoom_to_bed()` 一致 |
| 相机聚焦模型 (margin=1.25) | 与 OrcaSlicer `zoom_to_volumes()` 一致 |
| 4 档离散尺寸 | 简化实现；OrcaSlicer 的打印机 preset 本质也是离散的 |
| 选择"最小可容纳"档位 | 避免不必要的大床使模型过小 |
| `autoSelectBedSize` 含 20mm 边距 | 确保模型不紧贴热床边缘 |
| `_heatbedExplicitlySet` 标志 | 尊重用户/测试的显式切换，防止 initShowHeatbed 覆盖 |
| STEP→GLB 通过 `isCadSkillGlb` 检测 | STEP 加载时已转为 GLB，需从 buffer 反查 |

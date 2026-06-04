# 相机位置与坐标轴朝向问题分析与修正方案

## 1. 问题概述

### 1.1 加载非 STEP GLB 文件时视角从下往上看

- **现象**：加载不带 `STEP_T` 扩展的普通 GLB 文件时，相机会跑到模型下方，视角变成从下往上看模型。
- **预期**：和默认 Z-up 一样，相机从上往下看，俯角约 45°。

### 1.2 X 轴方向不稳定

- **现象**：
  - 未加载模型时：X 轴指向屏幕**右下**方向
  - 加载模型后：X 轴指向屏幕**右上**方向
- **预期**：无论是否加载模型、无论 Z-up 还是 Y-up，**X 轴始终水平向右**。

---

## 2. 当前架构分析

### 2.1 场景坐标系

场景 `scene.up` 始终硬编码为 `[0, 0, 1]`（Z-up），永不变更：

```tsx
// src/renderer/components/viewport/ViewportContainer.tsx:754
<Canvas scene={{ up: [0, 0, 1] as unknown as THREE.Vector3 }} ... />
```

`activeUpAxis` 状态变量控制的是相机 up 向量、环境贴图旋转、ShadowFloor 朝向等，但不改变 scene.up。

### 2.2 默认相机位置

```ts
// src/renderer/components/viewport/ViewportContainer.tsx:43
const DEFAULT_CAM_POS: [number, number, number] = [5, -5, 4]
```

相机初始 up 硬编码为 `[0, 0, 1]`。

### 2.3 模型加载时的相机适配

模型加载完成后触发 `handleModelLoaded` → `applyCameraFit` → `computeCameraFitTarget`。

核心算法在 `src/renderer/engine/heatbed/cameraFit.ts`，源自 OrcaSlicer 的 `Camera::zoom_to_box()` + `set_default_orientation()`。

### 2.4 坐标轴指示器

`src/renderer/engine/components/AxesIndicator.tsx` 使用独立 orthographic 子相机，相机位置跟随主相机：

```ts
const camPos = new THREE.Vector3(0, 0, CAMERA_DISTANCE).applyQuaternion(mainCamera.quaternion)
camera.up.copy(mainCamera.up)
camera.lookAt(0, 0, 0)
```

指示器始终从主相机的视角方向观察世界坐标轴。

---

## 3. 根因分析

### 3.1 非 STEP GLB 视角从下往上的根因

**问题出在 `computeCameraFitTarget` 函数。**

该函数使用球坐标计算相机位置，**始终以 Z 轴为天顶（zenith）**：

```ts
// cameraFit.ts:133-144
const theta = THREE.MathUtils.degToRad(-DEFAULT_ZENIT_DEG)  // -45°
const phi = THREE.MathUtils.degToRad(DEFAULT_PHI_DEG)        //  45°

const position = new THREE.Vector3(
  target.x + distance * sinTheta * Math.sin(phi),   // x = -0.5 * dist
  target.y + distance * sinTheta * Math.cos(phi),   // y = -0.5 * dist
  target.z + distance * cosTheta,                    // z = +0.707 * dist
)
```

数学球坐标公式（Z 为天顶）：
```
x = r · sin(θ) · sin(φ)
y = r · sin(θ) · cos(φ)
z = r · cos(θ)
```

代入 θ = -45°, φ = 45°：
```
x = -0.5 · dist
y = -0.5 · dist
z = +0.707 · dist
```

**在 Z-up 模式下**（camera.up = [0,0,1]）：
- 相机位于目标的**前上方**（z > 0 表示上方，y < 0 表示前方）
- 俯角 45°，视角正确 ✓

**在 Y-up 模式下**（camera.up = [0,1,0]）：
- 同样位置，但此时 Y 是"上方"
- 相机 Y = target.y - 0.5 · dist，在目标**下方**
- Z = target.z + 0.707 · dist，在目标前方（但 Z 不再是"上方"）
- 从下方往上看模型 ✗

**根本原因**：`computeCameraFitTarget` 没有感知 `activeUpAxis`，始终用 Z 作为天顶轴。当 `activeUpAxis = 'y'` 时，应该交换 Y 和 Z 分量。

### 3.2 X 轴方向不水平的根因

**问题出在相机位置相对于目标的 X 偏移量不为零。**

屏幕空间中，世界 X 轴的方向由相机的 `right` 向量决定：

```
camera.right = normalize(lookDirection × camera.up)
```

只有当 `camera.right ∥ (1, 0, 0)`（即相机的右向量平行于世界 X 轴）时，X 轴在屏幕上才是水平的。

要使 `right` 向量平行于 X 轴，`lookDirection` 的 X 分量必须为 0（相机在目标的 YZ 平面内）。

#### 3.2.1 未加载模型时的分析

默认相机位置 `[5, -5, 4]`，看向原点 `(0,0,0)`：

```
lookDir = normalize(0-5, 0-(-5), 0-4) = normalize(-5, 5, -4) ≈ (-0.685, 0.685, -0.548)
right = lookDir × up = (-0.685, 0.685, -0.548) × (0, 0, 1) = (0.685, 0.685, 0)
```

`right` 向量为 `(0.707, 0.707, 0)`，与 X 轴夹角 45°。

**世界 X 轴在屏幕上指向右下方向。**

#### 3.2.2 加载模型后的分析

`computeCameraFitTarget` 计算的位置（以目标为原点）：

```
pos = distance · (-0.5, -0.5, 0.707)
```

```
lookDir = normalize(0.5, 0.5, -0.707)  // 从相机指向目标的反方向
         = (0.5, 0.5, -0.707)

right = (0.5, 0.5, -0.707) × (0, 0, 1)  // Z-up
      = (0.5, -0.5, 0)
```

`right` 向量指向 `(0.707, -0.707, 0)` —— 屏幕水平方向。

**世界 X 轴 `(1,0,0)` 在屏幕空间的投影方向与 right 向量有关。X 轴在屏幕上指向右上方向。**

#### 3.2.3 小结

| 场景 | 相机 X 偏移 | X 轴屏幕方向 |
|------|------------|------------|
| 未加载模型 | +5 (非零) | 右下 |
| 加载模型后 | -0.5·dist (非零) | 右上 |
| **期望** | **0** | **水平向右** |

**根本原因**：默认相机位置和 `computeCameraFitTarget` 都把相机放在了目标侧方（X 偏移 ≠ 0），导致世界 X 轴在屏幕上旋转。

---

## 4. 修正方案

### 4.1 修正 `computeCameraFitTarget` — 感知 UpAxis

**文件**：`src/renderer/engine/heatbed/cameraFit.ts`

**改动**：`computeCameraFitTarget` 新增 `upAxis` 参数，根据 up-axis 重新映射球坐标分量。

当前球坐标公式（Z 为天顶）：
```
x = r · sin(θ) · sin(φ)
y = r · sin(θ) · cos(φ)
z = r · cos(θ)
```

对于 **Y-up**（Y 为天顶），映射关系为：
```
x = r · sin(θ) · sin(φ)     ← 不变
y = r · cos(θ)               ← 天顶（原 Z 分量 → Y）
z = r · sin(θ) · cos(φ)     ← 原 Y 分量 → Z
```

即：`(x, y, z)` → `(x, z, y)` 的重新排列（将原来指向 Z 的"上"映射到指向 Y 的"上"）。

```ts
// 修改前
export function computeCameraFitTarget(
  camera: THREE.PerspectiveCamera,
  targetBox: THREE.Box3,
  viewport: { width: number; height: number },
  focusTarget: 'bed' | 'model',
): { position: THREE.Vector3; target: THREE.Vector3 } | null

// 修改后
export function computeCameraFitTarget(
  camera: THREE.PerspectiveCamera,
  targetBox: THREE.Box3,
  viewport: { width: number; height: number },
  focusTarget: 'bed' | 'model',
  upAxis?: 'y' | 'z',  // 新增，默认 'z' 保持向后兼容
): { position: THREE.Vector3; target: THREE.Vector3 } | null
```

步 4（计算相机位置）修改为：

```ts
// Step 4: top-front orientation
const DEFAULT_ZENIT_DEG = 45
const DEFAULT_PHI_DEG = 0  // ← 改为 0，确保 X 轴水平
const theta = THREE.MathUtils.degToRad(-DEFAULT_ZENIT_DEG)
const phi = THREE.MathUtils.degToRad(DEFAULT_PHI_DEG)
const sinTheta = Math.sin(theta)
const cosTheta = Math.cos(theta)

const dx = distance * sinTheta * Math.sin(phi)  // = 0 (phi=0)
const dy = distance * sinTheta * Math.cos(phi)  // = -0.707 * dist
const dz = distance * cosTheta                   // = 0.707 * dist

let position: THREE.Vector3
if (upAxis === 'y') {
  // Y-up: 天顶方向是 +Y
  position = new THREE.Vector3(
    target.x + dx,    // 0
    target.y + dz,    // 天顶 — 原 Z 分量
    target.z + dy,    // 原 Y 分量
  )
} else {
  // Z-up: 天顶方向是 +Z（保持原有逻辑）
  position = new THREE.Vector3(
    target.x + dx,    // 0
    target.y + dy,    // -0.707 * dist
    target.z + dz,    // 天顶
  )
}
```

### 4.2 修正默认相机位置

**文件**：`src/renderer/components/viewport/ViewportContainer.tsx`

```ts
// 修改前
const DEFAULT_CAM_POS: [number, number, number] = [5, -5, 4]

// 修改后 — X 偏移为 0，确保 X 轴水平向右
const DEFAULT_CAM_POS: [number, number, number] = [0, -6, 4]
```

验证：相机位于 `(0, -6, 4)`，看向原点：
```
lookDir = (0, 6, -4) / √52
right = lookDir × (0,0,1)
      = (6/√52, 0, 0)
      = (0.832, 0, 0)
```
`right` 平行于 X 轴 → X 轴水平向右 ✓

### 4.3 修正 `applyCameraFit` 中的 fallback 路径

**文件**：`src/renderer/components/viewport/ViewportContainer.tsx:533`

```ts
// 修改前
const pos = center.clone().add(new THREE.Vector3(dist * 0.7, -dist * 0.7, dist * 0.6))

// 修改后 — X 偏移为 0，并根据 upAxis 调整 Y/Z 分量
const upAxis = useModelStore.getState().activeUpAxis
const pos = center.clone().add(
  upAxis === 'y'
    ? new THREE.Vector3(0, dist * 0.6, -dist * 0.7)
    : new THREE.Vector3(0, -dist * 0.7, dist * 0.6),
)
```

### 4.4 修正 `applyCameraFit` 调用点 — 传入 upAxis

**文件**：`src/renderer/components/viewport/ViewportContainer.tsx`

`applyCameraFit` 调用 `computeCameraFitTarget` 时需要传入当前 `activeUpAxis`：

```ts
// 修改前
const result = computeCameraFitTarget(camera, box, viewport, focusTarget)

// 修改后
const upAxis = useModelStore.getState().activeUpAxis
const result = computeCameraFitTarget(camera, box, viewport, focusTarget, upAxis)
```

### 4.5 确保所有 `computeCameraFitTarget` 调用点都传入 upAxis

搜索所有调用点：
| 文件 | 行号 | 调用 |
|------|------|------|
| `ViewportContainer.tsx` | 511 | `applyCameraFit` 内部 |
| `cameraFit.ts` | 161 | `fitCameraToTarget` 内部 |
| `thumbnailGenerator.ts` | ~240 | 缩略图生成时的相机适配 |

`thumbnailGenerator.ts` 中的 `fitCameraToTarget` 调用也需要相应修改。

### 4.6 可选：修正 `fitCameraToTarget` 函数签名

`cameraFit.ts:161` 的 `fitCameraToTarget` 也新增 `upAxis` 参数：

```ts
export function fitCameraToTarget(
  camera: THREE.PerspectiveCamera,
  targetBox: THREE.Box3,
  viewport: { width: number; height: number },
  focusTarget: 'bed' | 'model',
  upAxis?: 'y' | 'z',
): void {
  const result = computeCameraFitTarget(camera, targetBox, viewport, focusTarget, upAxis)
  // ...
}
```

### 4.7 关于 φ = 0 的设计说明

将 φ 从 45° 改为 0° 意味着相机不再从模型角落的侧方观察，而是从正前方（-Y 方向，在 Z-up 模式下）上方 45° 观察。

**视觉影响**：
- 相机位于模型的 YZ 平面内（X 偏移 = 0）
- X 轴在屏幕上始终水平向右
- 视角接近 CAD 软件的 Front-Top 标准视图
- 俯角保持约 45°，满足"从上往下看"的要求

如果未来需要恢复 3/4 侧方视角同时保持 X 轴水平，需要更复杂的方案（如旋转整个场景使 X 轴对齐屏幕），但这超出了当前需求范围。

---

## 5. 受影响的文件清单

| 文件 | 改动类型 | 说明 |
|------|---------|------|
| `src/renderer/engine/heatbed/cameraFit.ts` | 核心修改 | `computeCameraFitTarget` 新增 `upAxis` 参数，根据 up-axis 重排坐标分量；φ 改为 0 |
| `src/renderer/components/viewport/ViewportContainer.tsx` | 多点修改 | ① `DEFAULT_CAM_POS` X 归零 ② `applyCameraFit` 传入 upAxis ③ fallback 位置公式适配 |
| `src/renderer/lib/thumbnail-cache/thumbnailGenerator.ts` | 同步修改 | `fitCameraToTarget` / `computeCameraFitTarget` 调用传入 upAxis |
| 测试文件 | 更新断言 | 如有针对默认相机位置或 fit 结果的测试断言需更新 |

---

## 6. 测试验证要点

### 6.1 手动验证

1. **未加载模型**：打开应用，观察 AxesIndicator — X 轴（红色）应水平向右
2. **加载 Z-up 模型**（STL/STEP）：加载后 X 轴应水平向右，视角从上往下约 45°
3. **加载 Y-up 模型**（普通 GLB）：加载后 X 轴应水平向右，视角从上往下约 45°（不再是下往上）
4. **切换 up-axis**：点击 Y↑ / Z↑ 按钮切换后，X 轴方向保持不变（水平向右）
5. **旋转/平移后重置**：操作相机后点击 Reset Camera，X 轴恢复水平向右

### 6.2 自动化测试

需更新以下相关测试：
- Playwright E2E 测试中涉及 `scene.up` 和相机位置的断言
- `shadow-diag.spec.ts` 中的 `scene.up should be [0,0,1]` 断言（应保持）
- 如果存在 camera fit 结果的单元测试，需验证 Y-up / Z-up 两种模式

---

## 7. 修改优先级与风险

| 改动 | 优先级 | 风险 | 说明 |
|------|-------|------|------|
| `computeCameraFitTarget` 新增 upAxis 参数 | **P0** | 低 | 向后兼容（默认 'z'），仅影响调用方 |
| `DEFAULT_CAM_POS` X 归零 | **P0** | 极低 | 仅改一个常量 |
| `applyCameraFit` fallback 公式 | **P1** | 低 | 仅在 OrcaSlicer 算法失败时启用 |
| φ 改为 0 | **P0** | 中 | 改变了默认观察角度，需确认用户体验可接受 |
| 缩略图生成适配 | **P1** | 低 | 缩略图可能在 Y-up 模型上有视角偏差 |

---

*文档编写日期：2026-06-04*

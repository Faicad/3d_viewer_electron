# 物体选择模式高亮与拖拽移动 — 需求分析与实现方案

## 需求概述

1. **变更物体选择模式下的高亮效果** — 仅 `selectionMode === 'object'` 时生效，颜色改为极淡的白色，模拟"光线多照了一点"的效果
2. **选中物体显示包围框角点** — 8 个角各显示 3 条白线（沿 X/Y/Z 轴方向），线长 = 该维度尺寸的 10%，1px 白色
3. **鼠标行为变更**：
   - 无选中物体 → 左键拖动旋转相机（现有 OrbitControls 行为，不变）
   - 有选中物体 + 鼠标在选中物体上 → 左键拖动移动物体（仅改 X/Y，不改 Z）
   - 有选中物体 + 鼠标不在选中物体上 → 左键拖动旋转相机
4. **确认默认 Z 轴位置为 0** — 验证模型加载后 center 在原点

---

## 1. 当前实现分析

### 1.1 选中高亮 (`SelectionHighlight`)

文件：`src/renderer/engine/components/SelectionHighlight.tsx`

当前选中高亮（`ViewportContainer.tsx:685-694`）：
```tsx
{selectedReferenceIds.map((id) => (
  <SelectionHighlight
    key={id}
    runtime={selectorRuntime}
    referenceId={id}
    color="#2563eb"        // 蓝色
    opacity={0.5}          // 50% 不透明度（wireframe 下 0.8）
    modelGroupRef={modelGroupRef}
    renderOrder={...}
  />
))}
```

高亮原理：拷贝选中 mesh 的 geometry，变换到世界坐标，渲染为半透明 `meshBasicMaterial` 叠加层（`depthTest=false`, `depthWrite=false`, `toneMapped=false`）。

**问题**：所有 selectionMode（object/face/edge/point）共用同一套高亮参数，无法按模式区分。

### 1.2 包围框

**当前项目没有任何包围框或轮廓线效果。** `modelBbox` 仅用于 shadow floor 定位、camera fit、环境适配，不参与视觉渲染。

### 1.3 鼠标交互

文件：`src/renderer/engine/hooks/useTopologyPicking.ts`

- `pointerdown`（line 310-315）：记录位置，仅响应左键
- `pointerup`（line 317-352）：如果移动 > 4px 则当拖拽忽略（line 322: `if (moved > 4) return`），否则执行 pick
- OrbitControls（`ViewportContainer.tsx:598`）：独立处理所有拖拽事件

**现有设计**：click（<4px 移动）→ 选中；drag（≥4px）→ OrbitControls 旋转相机。两个系统各司其职，无冲突。

### 1.4 模型定位（Z 轴默认值）

文件：`src/renderer/engine/components/ModelGroup.tsx`

**多 mesh 路径**（line 331-334）：
```typescript
const center = overallBox.getCenter(new THREE.Vector3())
for (const mesh of processed) {
  mesh.position.copy(center).multiplyScalar(-1)
}
```

**单 mesh 路径**（line 438）：
```typescript
geo.center()  // THREE.BufferGeometry.center() → bbox 中心移到原点
```

**结论：Z 轴默认位置确认为 0。** 两种路径都将模型的 bbox 中心置于世界原点 `(0, 0, 0)`。

---

## 2. 实现方案

### 2.1 变更高亮效果

**策略**：在 `ViewportContainer.tsx` 中根据 `selectionMode` 切换高亮参数。

- `selectionMode === 'object'`：`color="#ffffff"` + `opacity={0.08}`（若有 env map 光照则约 0.08，需实际调试微调）
- `selectionMode !== 'object'`：保持现有蓝色 `#2563eb` + `opacity={0.5}`

**实现**：只需修改 `ViewportContainer.tsx` 中 selectedReferenceIds.map 内的 props。

```tsx
const isObjectMode = selectionMode === 'object'
const selColor = isObjectMode ? '#ffffff' : '#2563eb'
const selOpacity = isObjectMode 
  ? 0.08 
  : (resolvedDisplayMode === 'wireframe' ? 0.8 : 0.5)
```

### 2.2 包围框角点组件

**新建**：`src/renderer/engine/components/SelectionBoundingBox.tsx`

#### 输入

| 参数 | 类型 | 说明 |
|------|------|------|
| `selectedPartIds` | `string[]` | 选中的 partId 列表 |
| `modelGroupRef` | `RefObject<THREE.Group>` | 模型根 group |
| `visible` | `boolean` | 是否显示（仅 object 模式有选中时显示） |

#### 算法

1. 遍历 modelGroupRef.current，找到 `userData.partId` 匹配的所有 mesh
2. 对每个 mesh 调用 `updateWorldMatrix(true, false)`，然后用其 `matrixWorld` 变换 geometry 的 bbox，合并得到总的 world-space `THREE.Box3`
3. 计算维度：`sx = maxX - minX`, `sy = maxY - minY`, `sz = maxZ - minZ`
4. 8 个角各生成 3 条线段：

```
Corner(minX, minY, minZ):
  → (minX + 0.1*sx, minY, minZ)      // 沿 +X
  → (minX, minY + 0.1*sy, minZ)      // 沿 +Y
  → (minX, minY, minZ + 0.1*sz)      // 沿 +Z

Corner(maxX, maxY, maxZ):
  → (maxX - 0.1*sx, maxY, maxZ)      // 沿 -X
  → (maxX, maxY - 0.1*sy, maxZ)      // 沿 -Y
  → (maxX, maxY, maxZ - 0.1*sz)      // 沿 -Z

... 其余 6 个角同理
```

5. 用 `THREE.BufferGeometry` + `THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 1, ... })` 渲染
6. 包裹在 `<group position={[0,0,0]}>` 中，因为几何体已经是世界坐标

**复杂度**：24 条线段，性能开销可忽略。

### 2.3 物体拖拽移动

这是最复杂的改动。核心挑战：如何在 OrbitControls 和物体拖拽之间切换。

#### 设计思路

**判断逻辑**：在 `pointerdown` 时 raycast → 如果命中且命中的 mesh 的 `partId` 在 `selectedPartIds` 中 → 进入"潜在拖拽"状态；否则让 OrbitControls 正常处理。

**拖拽执行**：
- 用指针移动的 delta 计算世界空间 X/Y 偏移
- 通过 ray-plane intersection（plane: Z = 点击点的 world Z，法线 = (0,0,1)）将屏幕 delta 转为世界 delta
- 将 delta 的 X/Y 分量应用到所有选中 mesh 的 `position`

**OrbitControls 协调**：拖拽期间需要禁用 OrbitControls。

#### 方案选择

**方案 A**：复用 `useTopologyPicking`，在其事件处理中增加拖拽分支  
**方案 B**：新建独立 hook `useObjectDrag`，管理自己的事件监听

选择 **方案 A**，原因：
- `useTopologyPicking` 已有完整的 pointerdown/pointermove/pointerup 事件体系
- 拖拽和 pick 共享 raycast 逻辑
- 避免两个 hook 抢占同一 canvas 的事件

#### 具体改动（`useTopologyPicking.ts`）

**新增接口**：

```typescript
interface UseTopologyPickingOptions {
  // ... 现有字段 ...
  
  /** 是否启用物体拖拽（object 模式 + 有选中时传入 true） */
  enableObjectDrag?: boolean
  /** 选中的 partId 列表（用于判断 hit mesh 是否选中） */
  selectedPartIds?: string[]
  /** 拖拽状态变化回调 */
  onDragActiveChange?: (active: boolean) => void
}
```

**状态机**：

```
IDLE
  │ pointerdown + hit selected mesh
  ▼
POTENTIAL_DRAG（记录 pointerDown 位置和 hit point）
  │ pointermove: moved ≤ 4px
  │   → 仍为 POTENTIAL_DRAG
  │ pointermove: moved > 4px
  │   → 进入 DRAGGING，通知 onDragActiveChange(true)
  │ pointerup: moved ≤ 4px
  │   → 回退为 click（正常选中逻辑）
  ▼
DRAGGING
  │ pointermove
  │   → 计算 world-space X/Y delta，更新选中 mesh 的 position
  │ pointerup
  │   → 结束拖拽，通知 onDragActiveChange(false)，回到 IDLE
```

**Delta 计算**（核心算法）：

```typescript
// 在 pointerdown 时，记录初始 hit 点
const dragPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -hitPoint.z)
// ↑ 法线 = Z 轴，过 hitPoint.z 的 XY 平面

// 每个 pointermove 帧：
// 1. 从当前指针位置投射射线
// 2. 与 dragPlane 求交 → newPoint（世界坐标）
// 3. delta = newPoint - lastPoint（仅取 x, y 分量）
// 4. 应用到所有选中 mesh 的 position: mesh.position.x += delta.x, mesh.position.y += delta.y
```

**应用 delta 到选中 mesh**：

```typescript
function applyDragDelta(
  group: THREE.Group,
  selectedPartIds: Set<string>,
  delta: { x: number; y: number }
) {
  group.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      const partId = child.userData?.partId as string | undefined
      if (partId && selectedPartIds.has(partId)) {
        child.position.x += delta.x
        child.position.y += delta.y
      }
    }
  })
}
```

#### OrbitControls 禁用

在 `ViewportContainer.tsx` 中：

```tsx
const [isObjectDragging, setIsObjectDragging] = useState(false)

// OrbitControls enabled 条件：
<OrbitControls enabled={activeToolMode === 'view' && !animActive && !isObjectDragging} />
```

`useTopologyPicking` 通过 `onDragActiveChange` 回调通知父组件更新 `isObjectDragging`。

#### 边界情况

- **多文件场景**：`modelGroupRef` 指向当前活动的 modelGroup，`selectedPartIds` 中的 partId 需要与 fileId 关联。目前 object 模式 selectedReferenceIds 存储的是纯 partId，需确认多文件时 partId 是否唯一。
  - 实际上 `GlbPartInfo.partId` 来自 `src.userData?.partId || src.name || \`part-${i}\`` (ModelGroup.tsx:303)，多文件时可能重复。需要确认现有的 model-store 中 `loadedFiles` 每个 file 是否有独立的 store 关系。
  - 当前代码 `ViewportContainer.tsx:612-639` 为每个 loadedFile 渲染独立的 `<ModelGroup>`，但 `modelGroupRef` 只有一个。对于第一批实现，先处理单文件场景即可。

- **选中后点空白处**：现有代码（line 348-351）在 object 模式下点击空白会 deselect。保留了此行为。

- **Shift+click 多选后的拖拽**：`selectedPartIds` 包含所有选中的 partId，一起移动。

- **过小/过大模型**：delta 计算使用世界单位，与模型大小无关，无缩放问题。

---

## 3. 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/renderer/engine/hooks/useTopologyPicking.ts` | **修改** | 新增 `enableObjectDrag`, `selectedPartIds`, `onDragActiveChange` 参数；增加拖拽状态机和 delta 计算 |
| `src/renderer/components/viewport/ViewportContainer.tsx` | **修改** | 按 selectionMode 切换高亮参数；新增 `isObjectDragging` 状态传给 OrbitControls；引入 SelectionBoundingBox |
| `src/renderer/engine/components/SelectionBoundingBox.tsx` | **新建** | 包围框 8 角点线框组件 |

### 不改动的文件

- `SelectionHighlight.tsx` — 无需修改，高亮参数变更仅在调用侧（ViewportContainer）
- `selection-store.ts` — 现有 API 已满足需求
- `tool-store.ts` — 现有 API 已满足需求
- `ModelGroup.tsx` — 拖拽只改 mesh.position，不涉及其内部逻辑

---

## 4. 验证清单

### 4.1 Z 轴默认值验证
- [ ] 加载一个非对称的 STL/GLB 模型，观察其是否居中于原点（bbox center 在 (0,0,0)）
- [ ] 已验证：代码中多 mesh 路径和单 mesh 路径都将 bbox 中心移到原点

### 4.2 高亮效果验证
- [ ] object 模式选中物体 → 白色极淡叠加（约 opacity 0.08），看起来"稍微亮了一点"
- [ ] face 模式选中面 → 仍为蓝色高亮（0.5 opacity）
- [ ] edge 模式选中边 → 仍为蓝色线条高亮
- [ ] point 模式选中点 → 仍为蓝色球体高亮
- [ ] hover 高亮 → 不变（白色 0.25 opacity）

### 4.3 包围框角点验证
- [ ] object 模式选中 1 个 part → 显示 8 个角点，各 3 条白线
- [ ] 线长约为对应维度的 10%
- [ ] 切换选中不同 part → 包围框随之更新
- [ ] 取消选中 → 包围框消失
- [ ] face/edge/point 模式 → 不显示包围框
- [ ] 包围框线条为 1px 白色

### 4.4 拖拽移动验证
- [ ] 无选中物体 + 左键拖拽 → 正常旋转相机
- [ ] object 模式选中 1 个 part + 鼠标在 part 上左键拖拽 → part 沿 XY 平面移动，Z 不变
- [ ] object 模式选中 1 个 part + 鼠标在 part 外左键拖拽 → 旋转相机
- [ ] Shift+click 选中多个 part + 拖拽 → 所有选中 part 一起移动
- [ ] 拖拽过程中 OrbitControls 不响应
- [ ] 拖拽结束后（松开鼠标），OrbitControls 恢复正常
- [ ] 拖拽时 Z 坐标不变（仅 X/Y 变化）
- [ ] 单 mesh 模型（STL 等）拖拽整个模型

### 4.5 回归验证
- [ ] 运行 `npx vitest run` 单元测试全过
- [ ] face/edge/point 模式的选择和拖拽行为完全不变（OrbitControls 仍正常工作）
- [ ] Hover 高亮行为不变
- [ ] 多文件加载场景无 crash

---

## 5. 调试参数

以下参数可能需要根据实际视觉效果微调：

| 参数 | 建议初始值 | 位置 |
|------|-----------|------|
| 物体选择高亮 opacity | `0.08` | ViewportContainer.tsx |
| 物体选择高亮 color | `#ffffff` | ViewportContainer.tsx |
| 包围框角线长度比例 | `0.10`（10%） | SelectionBoundingBox.tsx |
| 拖拽触发最小位移 | `4`（px） | useTopologyPicking.ts（复用现有常量） |

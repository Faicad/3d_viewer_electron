# 入场动画实现问题分析

## 已修复

### 一、slide 方向全部反了 ✅

相机偏移方向和模型出现方向相反。`computeEntryStartPos()` 中 `offsetMap` 的 ± 号反了：

```typescript
// 旧（错误）
top:    up * (+fitDist * 2.5)   // 相机在上 → 模型在下
bottom: up * (-fitDist * 2.5)
left:   right * (-fitDist * 2.5)
right:  right * (+fitDist * 2.5)

// 新（正确）
top:    up * (-fitDist * 2.5)   // 相机在下 → 模型从上方滑入
bottom: up * (+fitDist * 2.5)
left:   right * (+fitDist * 2.5)
right:  right * (-fitDist * 2.5)
```

`entryDir` 默认值从 `'bottom'` 改为 `'top'`（从上方滑入）。

### 二、slide 动画模型自身旋转 ✅

**现象**：slide 期间模型自身旋转/翻滚，zoom 无此问题。

**根因**：`onUpdate` 中每帧调用 `c.update()`，内部 `lookAt(center)` 使相机从不同横向位置看向中心时 roll 角不连续变化。

```typescript
// 旧
onUpdate: () => {
    c.object.position.set(p.x, p.y, p.z)
    c.update()  // ← 每帧 lookAt → roll 角变化 → 模型旋转
}
```

**修复**：slide 动画开始前记录 fitPos 处的相机朝向（`fitQuat`），动画期间只平移、不调 `update()`：

```typescript
// 动画开始前
const fitQuat = new THREE.Quaternion()
const tmp = camera.clone()
tmp.position.copy(fitPos)
tmp.lookAt(center)
fitQuat.copy(tmp.quaternion)

camera.position.copy(startPos)
camera.quaternion.copy(fitQuat)  // 固定朝向
controls.target.copy(center)     // 只同步 target

// onUpdate
onUpdate: () => {
    c.object.position.set(p.x, p.y, p.z)
    if (!isSlide) c.update()  // zoom 保留 update
}
```

zoom 不受影响（相机沿视线方向移动，`lookAt` 朝向几乎不变）。

### 三、`pendingBoxRef` 死代码 ✅

`controlsRef.current` 在 R3F reconcile 阶段同步赋值，`handleModelLoaded` 在异步 loader 回调中触发——绝不可能为 null。已删除：

- `pendingBoxRef` 声明
- `if (!controls) return` 分支
- 50 行兜底 `useEffect`

---

## 待处理

### 四、`__triggerEntryAnimation` 未能正确实现

原本的意图是不自动播放入场动画，通过__triggerEntryAnimation来触发。
但是未能解决动画闪烁的问题。

目前，动画还是在 `handleModelLoaded` 中自动播放。


# 模型入场动画方案设计（定稿 v2）

## 需求概要

模型加载完成后，显示到 Canvas 的方式有三种可选的入场动画，通过 URL 参数 `entryAnim` 控制：

| 模式 | 效果 | 默认时长 | 默认启用条件 |
|------|------|----------|-------------|
| `auto` | 模型自动显示，相机从当前位置 fit 到模型 | 2000 ms | 非 `movie_mode` |
| `zoom` | 相机从远处拉近到 fit 位置，视觉上模型从一个小点"放大"到合适尺寸 | 2000 ms | `movie_mode=1` |
| `slide` | 相机从 fit 位置偏移（模型在屏幕外），滑入到 fit 位置 | 2000 ms | 不默认 |

三者统一由 `entryAnim` 参数控制，**独立于 `movie_mode`**。非 `movie_mode` 场景也可以选 `zoom` 或 `slide`。

---

## 架构：函数封装 + 两层职责分离

入场动画逻辑封装为一个函数 `playEntryAnimation()`，暴露到 `window.__triggerEntryAnimation`。

- **`movie_mode=1`**：不自动播放；movie 脚本在录制中择机手动调用 `__triggerEntryAnimation()`
- **非 movie_mode**：自动播放（同当前行为）
- **不管何种情况**，用户都可以通过 `__triggerEntryAnimation(opts?)` 手动重播，并可传入新的 `entryAnim`/`entryDuration`/`entryDir` 参数覆盖 URL 上的值

### 职责划分

| 层 | 负责 | 文件 |
|----|------|------|
| **src/** | 动画引擎（函数封装、camera fit、GSAP 动画）、store、`window.__triggerEntryAnimation` API | `ViewportContainer.tsx`、`cameraFit.ts`、`engine-store.ts` |
| **movies/** | 录制编排（`makeMovie`）、横竖屏自动方向（landscape→`left`, portrait→`top`）、`startRecording` 时序控制 | `lib.mjs` |

src 只提供能力和 API；movies 负责什么时候调用以及传什么参数。

---

## 三种动画行为

### `auto`

即 `applyCameraFit` → `animateCamera`（GSAP `power2.inOut`，时长由 `entryDuration` 控制，默认 2000ms）。

- 相机从当前位置动画到 fit 位置
- 模型一直在视口中可见

### `zoom`

```
初始: 相机在 fitPos + fitDir × (fitDist × 2.5)
结束: 相机在 fitPos
参数: entryDuration（可选，默认 2000ms）
动画: gsap.to(camProxy, { x:fitPos.x, y:fitPos.y, z:fitPos.z, duration:entryDuration, ease:'power2.out' })
```

### `slide`

```
初始: 相机在 fitPos + 方向偏移(fitDist × 1.0)
结束: 相机在 fitPos
参数: entryDir（可选，默认 top；top/bottom/left/right）
      entryDuration（可选，默认 2000ms）
动画: gsap.to(camProxy, { x:fitPos.x, y:fitPos.y, z:fitPos.z, duration:entryDuration, ease:'power2.out' })
      (slide 期间固定 fitQuat 朝向，不调 controls.update())
```

注意：slide 默认 `entryDir` 为 `top`（模型从上方滑入）。但在 **movies 层**，`makeMovie()` 会根据横竖屏自动选择方向（见下文 movies 职责部分）。

---

## 配置方式

### URL 参数

```
# 默认 auto
（无参数）

# zoom 动画，3 秒
entryAnim=zoom&entryDuration=3000

# 从右侧滑入，2.5 秒
entryAnim=slide&entryDir=right&entryDuration=2500

# movie_mode 下默认 zoom，也可以覆盖
movie_mode=1&entryAnim=slide&entryDir=top
```

### 默认值

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `entryAnim` | `movie_mode=1` 时 `zoom`，否则 `auto` | 可选 `auto` / `zoom` / `slide` |
| `entryDuration` | `2000` (ms) | 三种动画模式统一默认 2000ms，均可用此参数覆盖 |
| `entryDir` | `top` | 仅 `slide` 模式有效：`top` / `bottom` / `left` / `right` |

### 显式指定优先

用户显式传 `entryAnim=xxx` 时，无视默认行为。例如：

```
movie_mode=1&entryAnim=auto     → 使用当前 2s 自动 fit
movie_mode=1&entryAnim=slide   → 使用滑入，覆盖 movie_mode 的默认 zoom
entryAnim=zoom                  → 非 movie_mode 也用 zoom 开场
```

---

## API：`window.__triggerEntryAnimation`

### 签名

```typescript
window.__triggerEntryAnimation(opts?: {
  type?: 'auto' | 'zoom' | 'slide'
  duration?: number       // ms，默认取自 URL entryDuration 或 2000
  direction?: 'top' | 'bottom' | 'left' | 'right'
}): Promise<void>
```

### 行为

1. 读取 engine store 中的 `modelBbox`（渲染器在 `handleModelLoaded` 中写入）
2. 解析参数：overrides > URL params > 系统默认
3. 根据 `type` 执行对应动画
   - `auto`：从当前位置 GSAP animate 到 fit 位置
   - `zoom`/`slide`：相机 snap 到 startPos，GSAP animate 到 fitPos
4. Promise 在动画完成时 resolve

### 再次调用

每次调用都重新执行完整的动画流程，与当前相机位置无关（zoom/slide 总是从计算出的 startPos 开始）。

---

## 数据流

### 模型加载时（`handleModelLoaded`）

```
handleModelLoaded(box)
  → 设置 modelBbox → dispatch 'model-loaded' 事件
  → 解析 cfg = resolveEntryConfig(searchParams, movieMode)
  → if (!movieMode && cfg.type !== 'auto'):
       zoom/slide 分支：
         1. 计算 fitPos (computeCameraFitTarget)
         2. 计算 startPos = computeEntryStartPos(type, fitPos, boxCenter, direction, upAxis)
         3. 相机 snap 到 startPos（slide 同时设 fitQuat 固定朝向）
         4. GSAP 动画：startPos → fitPos
       return
  → movieMode OR auto / fallback：
       fitDuration = movieMode ? 0 : cfg.duration
       applyCameraFit(box, controls, fitDuration)   // movieMode 时 snap，否则 animate
       if (!movieMode) 设置 modelLoadCompletedRef → 触发 auto-rotation
```

### 手动触发时

```
window.__triggerEntryAnimation(opts?)
  → 读取 modelBbox (engine store) + controls (__r3f_dev)
  → 解析 cfg = opts ?? URL params ?? 系统默认
  → type === 'auto':
       animateCamera (当前位置 → fit 位置)
  → type === 'zoom' | 'slide':
       计算 fitPos → 计算 startPos → snap → GSAP animate
  → Promise resolve
```

### 注解

- `resolveEntryConfig()` 只在 `handleModelLoaded` 中使用，决定"加载时是否自动播放"
- `playEntryAnimation()`（即 `__triggerEntryAnimation`）独立于 `resolveEntryConfig`，每次调用都从 URL params + overrides 重新解析
- 手动触发时**不会**设置 `modelLoadCompletedRef`，因此不会触发 auto-rotation

---

## movies 层职责

以下逻辑在 `movies/lib.mjs` 中实现，与 src 层无关：

### 1. 横竖屏自动方向

在 `makeMovie()` 中，如果 `entryAnim='slide'` 且用户未传 `entryDir`：

```typescript
if (animType === 'slide' && !explicitDir) {
  params.set('entryDir', width > height ? 'left' : 'top')
}
```

- **横屏**（width > height）：`left`（从左侧滑入）
- **竖屏**（width <= height）：`top`（从上方滑入）

### 2. 录制时序

```typescript
startRecording(page, tPageOpen)
  → await window.__modelLoaded    // 等待模型加载完成
  → return trimStart              // 开始录制

// 脚本在 pageFn 中择机调用：
await page.evaluate(() => window.__triggerEntryAnimation({
  type: 'zoom', duration: 3000
}))
```

因为 `movie_mode=1` 时入场动画不自动播放，录制开始时相机已在 fit 位置（无动画）。脚本可以在这个时机做场景布置（调整视角、切换显示模式等），然后触发入场动画。

### 3. `page.animateCamera()` vs `__triggerEntryAnimation`

| 方法 | 用途 |
|------|------|
| `page.animateCamera({to: {x,y,z}})` | 通用相机动画，移动到绝对位置 |
| `page.__triggerEntryAnimation({type, duration})` | 入场动画，自动计算 start/fit 位置 |

---

## 修改文件

### `src/renderer/components/viewport/ViewportContainer.tsx`

- 新增 `computeEntryStartPos()` 工具函数
- 新增 `resolveEntryConfig()`：读取 URL 参数 + movieMode 状态，返回 `{ type, duration, direction }`
- **新增** `playEntryAnimation` useCallback：封装 zoom/slide 动画逻辑，返回 `Promise<void>`
- **修改** `handleModelLoaded`：`movieMode` 为 true 时不自动播放入场动画，snap 到 fit 位置
- **新增** `useEffect`：注册 `window.__triggerEntryAnimation`（通过 ref 保持最新引用）

### `src/renderer/types/window.d.ts`

- **新增** `__triggerEntryAnimation` 类型声明

### `movies/lib.mjs`

- `makeMovie()` 中已实现横竖屏自动方向（见上文 movies 职责）
- movie 脚本应调用 `page.evaluate(() => window.__triggerEntryAnimation({...}))` 控制动画时机

### `movies/SKILL.md`

- 更新文档，说明三种入场动画、API 和 movies 层用法


## `__triggerEntryAnimation` 未能正确实现

原本的意图是不自动播放入场动画，通过__triggerEntryAnimation来触发。
但是未能解决动画闪烁的问题。

目前，动画还是在 `handleModelLoaded` 中自动播放。


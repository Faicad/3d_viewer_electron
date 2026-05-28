# GLTF 动画播放器设计方案

## 1. GLTF 文件格式中的动画数据规范

### 1.1 整体结构

glTF 2.0 的动画数据在 JSON 顶层 `animations` 数组中定义，每个动画由 `channels`（通道）和 `samplers`（采样器）构成：

```json
{
  "animations": [
    {
      "name": "Run",
      "channels": [
        {
          "sampler": 0,
          "target": {
            "node": 1,
            "path": "translation"
          }
        }
      ],
      "samplers": [
        {
          "input": 0,      // accessor 索引，指向时间数据
          "interpolation": "LINEAR",
          "output": 1       // accessor 索引，指向关键帧值
        }
      ]
    }
  ]
}
```

### 1.2 Channels（通道）

每个 channel 将某个 sampler 绑定到目标节点的特定属性路径：

| `target.path` | 含义 | 值类型 | 对应 three.js 属性 |
|---|---|---|---|
| `translation` | 位移 | `vec3` | `.position` |
| `rotation` | 旋转（四元数） | `vec4` | `.quaternion` |
| `scale` | 缩放 | `vec3` | `.scale` |
| `weights` | 形态目标权重 | `scalar[]` | `.morphTargetInfluences` |

### 1.3 Samplers（采样器）

每个 sampler 包含 `input`（时间）、`output`（值）、`interpolation`（插值模式）：

| 插值模式 | 含义 | three.js 支持 |
|---|---|---|
| `LINEAR` | 线性插值 | `InterpolateLinear`（默认） |
| `STEP` | 步进插值 | `InterpolateDiscrete` |
| `CUBICSPLINE` | 三次样条插值 | `GLTFCubicSplineInterpolant` |

CUBICSPLINE 模式下，每个关键帧输出包含 3 个 `vec*`：`(inTangent, value, outTangent)`，所以输出数据长度是普通模式的 3 倍。

### 1.4 Accessor（访问器）

`input` accessor：`float` 类型数组，表示关键帧时间（秒）。
`output` accessor：值数据数组，类型取决于 `path`（`vec3` / `vec4` / `scalar`）。

### 1.5 KHR_animation_pointer 扩展

`KHR_animation_pointer` 是 Khronos 官方扩展，允许动画指向 glTF JSON 中的**任意路径**，不再局限于 T/R/S/weights 四种：

```json
{
  "animations": [{
    "channels": [{
      "sampler": 0,
      "target": {
        "pointer": "/materials/0/emissiveFactor"
      }
    }],
    "samplers": [{ "input": 0, "interpolation": "LINEAR", "output": 1 }]
  }]
}
```

| | 标准 animation | KHR_animation_pointer |
|---|---|---|
| 目标表达 | `{ node, path }` | `{ pointer: "/materials/0/..." }` |
| 可驱动 | 4 种属性 | JSON 中任何数字/布尔/数组/颜色字段 |
| 典型用途 | 骨骼动画、形态目标 | 材质颜色/粗糙度/金属度、灯光强度、相机参数 |

### 1.6 完整示例（两个骨骼的平移+旋转动画）

```json
{
  "animations": [{
    "name": "Walk",
    "channels": [
      { "sampler": 0, "target": { "node": 0, "path": "rotation" } },
      { "sampler": 1, "target": { "node": 1, "path": "translation" } }
    ],
    "samplers": [
      { "input": 0, "interpolation": "LINEAR", "output": 1 },
      { "input": 0, "interpolation": "LINEAR", "output": 2 }
    ]
  }]
}
```

---

## 2. three.js 对 GLTF 动画的支持情况

### 2.1 核心类体系

```
GLTFLoader.parseAsync()
  └─ gltf.animations[]  ← AnimationClip[]

AnimationMixer(root)
  └─ clipAction(clip)   ← AnimationAction
       └─ .play() / .stop() / .paused
       └─ .timeScale
       └─ .setLoop(mode, repetitions)
       └─ .clampWhenFinished
  └─ update(deltaTime)  ← 驱动所有 action
```

| three.js 类 | 模块路径 | 作用 |
|---|---|---|
| `AnimationClip` | `src/animation/AnimationClip.js` | 一组 KeyframeTrack 的容器，含 `name`、`duration`、`tracks[]` |
| `AnimationMixer` | `src/animation/AnimationMixer.js` | 动画播放器，管理多个 Action；驱动属性更新到场景图 |
| `AnimationAction` | `src/animation/AnimationAction.js` | 单个 clip 的播放控制（play/stop/pause/speed/loop） |
| `KeyframeTrack` | `src/animation/KeyframeTrack.js` | 时间-值序列基类 |
| `PropertyBinding` | `src/animation/PropertyBinding.js` | 将 track 名称（如 `.bones[arm].position`）解析为真实对象属性 |

### 2.2 KeyframeTrack 子类

| 子类 | 对应 glTF path | 值大小 |
|---|---|---|
| `VectorKeyframeTrack` | `translation` / `scale` | 3 |
| `QuaternionKeyframeTrack` | `rotation` | 4 |
| `NumberKeyframeTrack` | `weights` | morph target 个数 |
| `ColorKeyframeTrack` | 颜色（glTF 无原生对应） | 3 |

### 2.3 GLTFLoader 的自动映射

`GLTFLoader` 在 `_createAnimationTracks()` 中将标准 glTF path 映射到 three.js 属性：

| glTF path → three.js property |
|---|
| `translation` → `.position` |
| `rotation` → `.quaternion` |
| `scale` → `.scale` |
| `weights` → `.morphTargetInfluences[n]` |

#### KHR_animation_pointer 的映射

three.js 核心**不内置**该扩展的解析。需要安装 [@needle-tools/three-animation-pointer](https://www.npmjs.com/package/@needle-tools/three-animation-pointer)（v1.0.1+），然后通过 `loader.register()` 注册：

```js
import { GLTFAnimationPointerExtension } from '@needle-tools/three-animation-pointer'

const loader = new GLTFLoader()
loader.register(p => new GLTFAnimationPointerExtension(p))
```

注册后扩展解析器自动将 `/materials/0/baseColorFactor` 等 JSON Pointer 路径转换为 three.js 的 PropertyBinding 路径（如 `material.color`、`material.emissiveIntensity` 等），并产生 `ColorKeyframeTrack` / `NumberKeyframeTrack` 等对应的轨道。最终仍然交付为标准 `AnimationClip[]`，对上层 `AnimationMixer` 透明。

### 2.4 已有案例

three.js 官方 examples 中有丰富的动画播放演示：

| 案例 | 路径 | UI 特性 |
|---|---|---|
| `webgl_animation_keyframes.html` | `examples/webgl_animation_keyframes.html` | 基础播放（一行代码启动动画） |
| `webgl_loader_gltf.html` | `examples/webgl_loader_gltf.html` | 按钮切换多个动画 |
| `webgl_animation_skinning_blending.html` | `examples/webgl_animation_skinning_blending.html` | lil-gui 面板：暂停/继续、全局速度滑块、动作交叉淡化 |
| `webgl_animation_skinning_morph.html` | `examples/webgl_animation_skinning_morph.html` | 动画下拉选择、渐变动画切换、表情控制 |
| `webgl_animation_skinning_additive_blending.html` | `examples/webgl_animation_skinning_additive_blending.html` | 基础动作选择、叠加动作权重调节、速度控制 |
| `webgpu_animation_retargeting.html` | `examples/webgpu_animation_retargeting.html` | WebGPU 动画重定向 |
| `webgl_loader_gltf_animation_pointer.html` | `examples/webgl_loader_gltf_animation_pointer.html` | KHR_animation_pointer 扩展（使用 `@needle-tools/three-animation-pointer` 插件） |

其中 `webgl_animation_skinning_morph.html` 最接近完整动画播放器，包含下拉选择动画、渐变动画切换等功能。但官方 examples **没有提供一个开箱即用的完整动画播放器组件**——带有动画切换下拉框、进度条、播放/暂停、速度选择、时间显示等——这些都需要自己实现。

### 2.5 PlaybackControl 接口要点

```
AnimationAction:
  .play()                       // 开始播放
  .stop()                       // 停止并重置
  .paused = boolean             // 暂停/恢复（保留时间位置）
  .timeScale = number           // 播放速度倍率（负值=倒放）
  .setLoop(mode, repetitions)   // LoopRepeat / LoopOnce / LoopPingPong
  .clampWhenFinished = true     // 播完停在最后一帧
  .getClip().duration           // 获取剪辑总时长（秒）
  .time                         // 读取/设置当前播放位置

AnimationMixer:
  .update(deltaTime)            // 驱动所有 action 前进
  .timeScale = number           // 全局速度倍率
  .stopAllAction()              // 停止所有动作
```

---

## 3. 在 3d_viewer_electron 中实现动画播放器

### 3.1 修改加载管线 — 提取动画数据

当前 `formatLoaders.ts` 中 GLB/glTF 加载丢弃了动画数据。需要改动两处。

**步骤 1：扩展 `LoaderResult` 接口**（`formatLoaders.ts:29`）

```typescript
export interface LoaderResult {
  meshes: THREE.Mesh[]
  objects: THREE.Object3D[]
  skeleton?: THREE.Skeleton
  sceneRoot?: THREE.Object3D
  sourceUnit?: UnitSystem
  materials?: (THREE.Material | THREE.Material[])[]
  // === 新增 ===
  animations?: THREE.AnimationClip[]
}
```

**步骤 2：修改 GLB/glTF 加载分支**保存 `gltf.animations`

```typescript
// formatLoaders.ts 约 L242-258
case 'glb': {
  const gltf = await getGltfLoader().parseAsync(buffer, '')
  const meshes = extractMeshes(gltf.scene)
  return {
    meshes,
    objects: [],
    sceneRoot: gltf.scene,
    sourceUnit: 'meter',
    animations: gltf.animations,   // ← 新增
  }
}
case 'gltf': {
  // ... 同样的逻辑
  return {
    meshes,
    objects: [],
    sceneRoot: gltf.scene,
    sourceUnit: 'meter',
    animations: gltf.animations,   // ← 新增
  }
}
```

**步骤 3：扩展 `LoadedFileModel`**（`model-store.ts:23`）

```typescript
export interface LoadedFileModel {
  // ...原有字段
  animations?: THREE.AnimationClip[]  // ← 新增
}
```

**步骤 4：将动画数据存入 model-store**

在 `ModelGroup.tsx` 的 `load()` 函数中，模型解析完成后，将 `result.animations` 写入 store：

```typescript
// ModelGroup.tsx — 在 result 解析后的回调中
useModelStore.getState().setAnimations(fileId, result.animations ?? [])
```

### 3.2 创建动画状态 store

新增 `src/renderer/stores/animation-store.ts`：

```typescript
import { create } from 'zustand'
import * as THREE from 'three'

export interface AnimationState {
  /** 当前播放的动画索引 */
  currentIndex: number
  /** 当前播放位置（秒） */
  currentTime: number
  /** 是否正在播放 */
  isPlaying: boolean
  /** 播放速度倍率 */
  speed: number
  /** 可用动画列表（从 GLTF 提取） */
  clips: THREE.AnimationClip[]
  /** 当前动画总时长（秒） */
  duration: number

  // actions
  setClips: (clips: THREE.AnimationClip[]) => void
  selectAnimation: (index: number) => void
  setPlaying: (playing: boolean) => void
  togglePlay: () => void
  setSpeed: (speed: number) => void
  seek: (time: number) => void
  setCurrentTime: (time: number) => void
  reset: () => void
}

export const useAnimationStore = create<AnimationState>((set, get) => ({
  currentIndex: -1,
  currentTime: 0,
  isPlaying: false,
  speed: 1,
  clips: [],
  duration: 0,

  setClips: (clips) => set({
    clips,
    currentIndex: clips.length > 0 ? 0 : -1,
    currentTime: 0,
    duration: clips.length > 0 ? clips[0].duration : 0,
    isPlaying: clips.length > 0,
  }),

  selectAnimation: (index) => {
    const clips = get().clips
    if (index < 0 || index >= clips.length) return
    set({
      currentIndex: index,
      currentTime: 0,
      duration: clips[index].duration,
      isPlaying: true,
    })
  },

  setPlaying: (playing) => set({ isPlaying: playing }),
  togglePlay: () => set((s) => ({ isPlaying: !s.isPlaying })),
  setSpeed: (speed) => set({ speed }),
  seek: (time) => set({ currentTime: time, isPlaying: false }),
  setCurrentTime: (time) => set({ currentTime: time }),
  reset: () => set({
    currentIndex: -1, currentTime: 0, isPlaying: false,
    speed: 1, clips: [], duration: 0,
  }),
}))
```

### 3.3 动画播放引擎组件

新增 `src/renderer/engine/components/AnimationPlayer.tsx`，这是一个 R3F 组件，放置在 `<Canvas>` 内，驱动 `AnimationMixer`：

```typescript
import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useAnimationStore } from '@/stores/animation-store'
import { useModelStore } from '@/stores/model-store'

export default function AnimationPlayer() {
  const mixerRef = useRef<THREE.AnimationMixer | null>(null)
  const actionRef = useRef<THREE.AnimationAction | null>(null)

  const clips = useAnimationStore((s) => s.clips)
  const currentIndex = useAnimationStore((s) => s.currentIndex)
  const isPlaying = useAnimationStore((s) => s.isPlaying)
  const speed = useAnimationStore((s) => s.speed)
  const currentTime = useAnimationStore((s) => s.currentTime)
  const setCurrentTime = useAnimationStore((s) => s.setCurrentTime)
  const selectAnimation = useAnimationStore((s) => s.selectAnimation)

  // 获取当前活跃文件的场景根节点
  const activeFileId = useModelStore((s) => s.activeFileId)
  const loadedFiles = useModelStore((s) => s.loadedFiles)
  const sceneRoot = activeFileId
    ? loadedFiles.find((f) => f.id === activeFileId)?.sceneRoot
    : null

  // 当 sceneRoot 或 clips 变化时重建 mixer
  useEffect(() => {
    if (!sceneRoot || clips.length === 0) {
      mixerRef.current = null
      actionRef.current = null
      return
    }

    const mixer = new THREE.AnimationMixer(sceneRoot)
    mixerRef.current = mixer

    return () => {
      mixer.stopAllAction()
      mixer.uncacheRoot(sceneRoot)
    }
  }, [sceneRoot, clips])

  // 切换动画
  useEffect(() => {
    const mixer = mixerRef.current
    if (!mixer || currentIndex < 0 || currentIndex >= clips.length) {
      actionRef.current = null
      return
    }

    // 停止前一个 action
    if (actionRef.current) {
      actionRef.current.stop()
    }

    const action = mixer.clipAction(clips[currentIndex])
    action.setLoop(THREE.LoopRepeat, Infinity)
    action.clampWhenFinished = false
    action.timeScale = speed
    action.play()
    actionRef.current = action
  }, [currentIndex, clips])

  // 同步速度
  useEffect(() => {
    if (actionRef.current) {
      actionRef.current.timeScale = speed
    }
  }, [speed])

  // 外部 seek（暂停时跳转）
  useEffect(() => {
    if (!actionRef.current || isPlaying) return
    actionRef.current.time = currentTime
    mixerRef.current?.setTime(currentTime)
  }, [currentTime, isPlaying])

  // 每帧更新
  useFrame((_, delta) => {
    const mixer = mixerRef.current
    if (!mixer) return

    if (isPlaying) {
      mixer.update(delta)
    }

    // 同步当前时间到 store（用于 UI 进度条）
    if (actionRef.current) {
      const clip = actionRef.current.getClip()
      const t = actionRef.current.time % clip.duration
      setCurrentTime(t >= 0 ? t : clip.duration + t)
    }
  })

  return null
}
```

### 3.4 动画播放 UI 面板

新增 `src/renderer/components/panels/AnimationPanel.tsx`：

```tsx
import { useCallback } from 'react'
import { useAnimationStore } from '@/stores/animation-store'
import { useTranslation } from 'react-i18next'
import { Play, Pause, SkipBack, SkipForward } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { ScrollArea } from '@/components/ui/scroll-area'

const SPEEDS = [0.5, 1, 1.5, 2]

export default function AnimationPanel() {
  const { t } = useTranslation()

  const clips = useAnimationStore((s) => s.clips)
  const currentIndex = useAnimationStore((s) => s.currentIndex)
  const currentTime = useAnimationStore((s) => s.currentTime)
  const isPlaying = useAnimationStore((s) => s.isPlaying)
  const speed = useAnimationStore((s) => s.speed)
  const duration = useAnimationStore((s) => s.duration)
  const selectAnimation = useAnimationStore((s) => s.selectAnimation)
  const togglePlay = useAnimationStore((s) => s.togglePlay)
  const setSpeed = useAnimationStore((s) => s.setSpeed)
  const seek = useAnimationStore((s) => s.seek)

  const hasAnimations = clips.length > 0
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60)
    const s = Math.floor(sec % 60)
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  if (!hasAnimations) return null

  return (
    <div className="flex flex-col h-full">
      <div className="p-2 text-xs font-semibold text-muted-foreground border-b shrink-0">
        动画播放器
      </div>
      <ScrollArea className="flex-1 p-2">
        <div className="space-y-3">

          {/* 动画下拉选择 */}
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">动画</label>
            <select
              value={currentIndex}
              onChange={(e) => selectAnimation(Number(e.target.value))}
              className="w-full h-8 text-xs bg-background border rounded px-2"
            >
              {clips.map((clip, i) => (
                <option key={i} value={i}>{clip.name || `Animation ${i}`}</option>
              ))}
            </select>
          </div>

          {/* 进度条 */}
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground w-8 tabular-nums">
                {formatTime(currentTime)}
              </span>
              <input
                type="range"
                min={0}
                max={duration || 1}
                step={0.01}
                value={currentTime}
                onChange={(e) => seek(Number(e.target.value))}
                className="flex-1 h-1 accent-primary"
              />
              <span className="text-xs text-muted-foreground w-8 tabular-nums text-right">
                {formatTime(duration)}
              </span>
            </div>
          </div>

          {/* 播放控制 */}
          <div className="flex items-center justify-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7"
                  onClick={togglePlay}>
                  {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{isPlaying ? '暂停' : '播放'}</TooltipContent>
            </Tooltip>
          </div>

          {/* 播放速度 */}
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">速度</label>
            <div className="flex gap-1">
              {SPEEDS.map((s) => (
                <Button
                  key={s}
                  variant={speed === s ? 'default' : 'ghost'}
                  size="sm"
                  className="flex-1 h-7 text-xs"
                  onClick={() => setSpeed(s)}
                >
                  {s}x
                </Button>
              ))}
            </div>
          </div>

        </div>
      </ScrollArea>
    </div>
  )
}
```

### 3.5 集成到现有 UI

**在 ViewportContainer.tsx 中添加 AnimationPlayer 组件**（放入 `<Canvas>` 内部）：

```tsx
import AnimationPlayer from '@/engine/components/AnimationPlayer'

// 在 <Canvas> 内部的组件树中
<SceneSetup />
<PostProcessing />
<AnimationPlayer />           {/* ← 新增 */}
<ModelTransformTracker ... />
```

**在 DesktopLayout.tsx 中添加动画面板按钮**（与右侧面板切换类似）：

```tsx
// 在右侧图标栏中加入
<Tooltip>
  <TooltipTrigger asChild>
    <Button variant="ghost" size="icon" onClick={toggleAnimationPanel}>
      <Clock className="h-4 w-4" />
    </Button>
  </TooltipTrigger>
  <TooltipContent>动画</TooltipContent>
</Tooltip>

// 在右侧面板区域条件渲染
{animationPanelOpen && (
  <div className="w-60 border-l">
    <AnimationPanel />
  </div>
)}
```

**在 ui-store.ts 中新增切换状态**：

```typescript
animationPanelOpen: boolean
toggleAnimationPanel: () => void
```

### 3.6 胶水代码 — 将动画数据从 ModelGroup 传递到 store

在 `ModelGroup.tsx` 的 `load()` 函数中，解析完成后触发回调：

```typescript
// ModelGroup.tsx — 在 onParsed 或加载完成后
if (result.animations?.length) {
  useAnimationStore.getState().setClips(result.animations)
} else if (!fileId) {
  useAnimationStore.getState().reset()
}
```

或者更优雅的方式：通过 `onSceneTreeChange` 同级的新回调 `onAnimationsReady(animations)` 将数据从 `ModelGroup` 传递到 `ViewportContainer`，再由 ViewportContainer 写入 store。

### 3.7 时间轴

| 步骤 | 工作内容 | 涉及文件 |
|---|---|---|
| 1 | 扩展 `LoaderResult`，添加 `animations` 字段 | `formatLoaders.ts` |
| 2 | 修改 GLB/glTF 加载分支，返回 `gltf.animations` | `formatLoaders.ts` |
| 3 | 创建 `animation-store.ts` | 新建 |
| 4 | 创建 `AnimationPlayer.tsx` 引擎组件 | 新建 |
| 5 | 创建 `AnimationPanel.tsx` UI 面板（下拉框+进度条+播放暂停+速度） | 新建 |
| 6 | 集成到 `ViewportContainer.tsx`（添加 `<AnimationPlayer />`） | `ViewportContainer.tsx` |
| 7 | 集成到 `DesktopLayout.tsx`（添加动画面板切换按钮+右侧面板） | `DesktopLayout.tsx` |
| 8 | 添加 `animationPanelOpen` 到 `ui-store.ts` | `ui-store.ts` |
| 9 | 胶水代码：ModelGroup 解析完成后将动画注入 store | `ModelGroup.tsx` |

### 3.8 注意事项

1. **Scene Root 引用**：`AnimationMixer` 需要接收模型的场景根节点（`gltf.scene`）作为构造参数。当前 `ModelGroup` 会将 mesh 从原始位置复制出来并重新居中（`geo.applyMatrix4` + `mesh.position` 负偏移），这会导致 mixer 驱动的骨骼动画在复制的 mesh 上无法正确工作。解决方案是直接对原始 `sceneRoot` 创建 mixer，然后在 R3F 中用 `<primitive object={sceneRoot} />` 渲染原始场景图，而非走 `ModelGroup` 的 mesh 克隆路径。

2. **多文件场景**：多个 GLTF 文件都有自己的 `AnimationMixer`，`animation-store` 中的动画数据应绑定到当前活跃文件。

3. **进度条精确性**：`AnimationAction.time` 是相对于 clip 原点的时间，不受 loop 模式影响，取模后得到循环内进度。

4. **外部队列（seek）**：拖动进度条时需要先 pause 再 seek，然后用 `mixer.setTime()` 直接跳转到目标时间。

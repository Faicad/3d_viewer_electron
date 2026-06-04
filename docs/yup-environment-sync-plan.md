# 方案：Y-up/Z-up 环境贴图同步

## 背景

本项目的 3D 查看器默认使用 Z-up（CAD 惯例）。工具栏提供 Y↑/Z↑ 切换按钮。需求是：

1. 加载不带 `STEP_T` 拓扑扩展的 GLB 文件时，自动切换为 Y-up
2. 加载带 `STEP_T` 的 GLB 文件（即 STEP→GLB 转换产物），保持 Z-up
3. 点击 Y↑/Z↑ 工具栏按钮时，不仅相机要改，环境贴图、阴影地板、方向光也要同步

## 问题分析

### 问题一：环境贴图/阴影地板/方向光未跟随 up-axis 变化

**现象**：点击 Y↑/Z↑ 按钮，只有相机旋转，环境贴图、阴影地板、方向光朝向不变。

**根因**：SceneSetup.tsx 中所有环境旋转、阴影地板配置、方向光朝向都硬编码为 Z-up：

| 位置 | 硬编码值 | 说明 |
|------|----------|------|
| `EnvironmentManager.applyBackground()` L286/293 | `Math.PI / 2` | 背景旋转 X 轴 |
| `EnvironmentManager.setBackgroundRotation()` L307 | `Math.PI / 2` | 背景旋转 X 轴 |
| `SceneSetup.tsx` L52 | `Math.PI / 2` | 环境贴图旋转 X 轴 |
| `SceneSetup.tsx` L99 | `Math.PI / 2` | 环境贴图旋转 X 轴 |
| `SceneSetup.tsx` L128 | `'z'` | 阴影地板朝向 |
| `SceneSetup.tsx` L145 | `'z'` | 阴影地板朝向 |
| `SceneSetup.tsx` L416 | `[0, 0, 1]` | 方向光 up 向量 |

### 问题二：加载非 STEP_T 的 GLB 文件仍显示为 Z-up（自动检测失效）

**现象**：实测加载不带 STEP_T 的 GLB 文件，仍然默认 Z-up，不会自动切换为 Y-up。

**根因**：文件加载路径与 `activeUpAxis` 设置之间存在断裂。

所有文件加载的实际入口都是 `addLoadedFile()`：

- `DesktopLayout.tsx` L575 — 键盘导航加载
- `DesktopLayout.tsx` L711 — 打开文件对话框（SVG 路径）
- `DesktopLayout.tsx` L791 — 打开文件对话框（3D 路径）
- `useFileUpload.ts` L67 — 拖拽上传（SVG 路径）
- `useFileUpload.ts` L148 — 拖拽上传（3D 路径）

而 `addLoadedFile()` 的实现（model-store.ts L389-398）：

```ts
addLoadedFile: (file) => {
    useHistoryStore.getState().addEntry(file.filePath, file.fileName, file.mtimeMs)
    return set((state) => {
      const newFiles = [...state.loadedFiles, file]
      const isFirst = state.loadedFiles.length === 0
      return {
        loadedFiles: newFiles,
        ...(isFirst ? syncActiveFileFields(file, newFiles, state.sceneTree) : { ... }),
      }
    })
},
```

`synchronizationFileFields()`（L237-270）同步了 `modelBuffer`、`modelFormat`、`sourceUnit` 等字段，**但没有 `activeUpAxis`**。

同时，`LoadedFileModel` 接口也没有 `upAxis` 字段。

`setModelBuffer()`（L363-366）虽然调用了 `getDefaultUpAxis()` 来设置 `activeUpAxis`，但这个函数在主流文件加载路径中**从未被调用**——它是旧的单文件遗留路径，已被 `addLoadedFile` 替代。

**调用方其实已经计算了正确的 upAxis**（如 DesktopLayout.tsx L570、L783），但只用于缩略图生成，没有传给 store：

```ts
const upAxis = getDefaultUpAxis(format, buffer)  // ← 算出来了
generateThumbnailFromResult(..., upAxis)           // ← 只给了缩略图
useModelStore.getState().addLoadedFile({...})      // ← 没传给 store！
```

**同样的问题也存在于 `setActiveFile()`**：切换活跃文件时不更新 `activeUpAxis`。

## 修改方案

### 1. `src/renderer/stores/model-store.ts` — 修复自动检测

**a. `LoadedFileModel` 接口增加 `upAxis` 字段：**

```ts
export interface LoadedFileModel {
  // ... 现有字段 ...
  /** Native up-axis for this file (auto-detected from format + buffer) */
  upAxis: UpAxis
}
```

**b. `addLoadedFile()` 中自动计算并设置 upAxis：**

```ts
addLoadedFile: (file) => {
    useHistoryStore.getState().addEntry(file.filePath, file.fileName, file.mtimeMs)
    const upAxis = getDefaultUpAxis(file.format, file.buffer)
    return set((state) => {
      const newFiles = [{ ...file, upAxis }, ...state.loadedFiles]
      const isFirst = state.loadedFiles.length === 0
      return {
        loadedFiles: newFiles,
        activeUpAxis: upAxis,  // ← 新增
        ...(isFirst ? syncActiveFileFields({ ...file, upAxis }, newFiles, state.sceneTree) : { sceneTree: buildCombinedTree(newFiles, state.sceneTree) }),
      }
    })
},
```

**c. `setActiveFile()` 中同步 `activeUpAxis`：**

```ts
setActiveFile: (id) =>
    set((state) => {
      const file = state.loadedFiles.find((f) => f.id === id)
      if (!file) return {}
      return { activeUpAxis: file.upAxis, ...syncActiveFileFields(file, state.loadedFiles, state.sceneTree) }
    }),
```

### 2. `src/renderer/engine/environment/EnvironmentManager.ts` — 环境背景旋转参数化

**`applyBackground()`** 签名变更：
```ts
// 之前
applyBackground(scene: THREE.Scene, envRotation: number): void
// 之后
applyBackground(scene: THREE.Scene, envRotation: number, upAxis: 'y' | 'z' = 'z'): void
```
方法体内计算 `const envXRot = upAxis === 'y' ? 0 : Math.PI / 2`，替换两处 `Math.PI / 2`。

**`setBackgroundRotation()`** 同理。

### 3. `src/renderer/engine/components/SceneSetup.tsx` — 接入 activeUpAxis

**a. 添加订阅：**
```ts
import { useModelStore } from '@/stores/model-store'
const activeUpAxis = useModelStore((s) => s.activeUpAxis)
```

**b. `applyEnvToScene` 辅助函数**——调用时从 store 读最新轴，避免闭包过期：
```ts
const applyEnvToScene = (mgr: EnvironmentManager, rot: number) => {
    const axis = useModelStore.getState().activeUpAxis
    const exr = axis === 'y' ? 0 : Math.PI / 2
    scene.environment = mgr.currentTexture
    scene.environmentRotation.set(exr, 0, rot, 'YXZ')
    scene.environmentIntensity = useEngineStore.getState().envIntensity
    mgr.applyBackground(scene, rot, axis)
}
```

**c. 初始化 effect**——读取初始 upAxis：
```ts
const initAxis = useModelStore.getState().activeUpAxis
const initXRot = initAxis === 'y' ? 0 : Math.PI / 2
mgr.applyBackground(scene, envRotation, initAxis)
scene.environmentRotation.set(initXRot, 0, envRotation, 'YXZ')
```

**d. envRotation effect**——加入 `activeUpAxis` 依赖，同步更新阴影地板：
```ts
useEffect(() => {
    if (!scene.environment) return
    const exr = activeUpAxis === 'y' ? 0 : Math.PI / 2
    scene.environmentRotation.set(exr, 0, envRotation, 'YXZ')
    envRef.current?.setBackgroundRotation(scene, envRotation, activeUpAxis)
    const bbox = useEngineStore.getState().modelBbox
    if (bbox && shadowFloorRef.current) {
        shadowFloorRef.current.configure(bbox, activeUpAxis)
    }
}, [envRotation, activeUpAxis, scene])
```

**e. envBackground effect**——传入 `activeUpAxis`，依赖加入 `activeUpAxis`。

**f. 阴影地板初始配置**（L128）：`'z'` → `activeUpAxis`

**g. 阴影地板订阅回调**（L145）：`'z'` → `useModelStore.getState().activeUpAxis`

**h. 方向光 `up`**（L416）：`[0,0,1]` → `activeUpAxis === 'y' ? [0,1,0] : [0,0,1]`

### 4. 调用方无需修改

`DesktopLayout.tsx` 和 `useFileUpload.ts` 中 `addLoadedFile()` 的调用方**无需修改**——`addLoadedFile` 内部自行从 `file.buffer` + `file.format` 计算 upAxis。

## 测试方案

### 单元测试

**`EnvironmentManager.test.ts`** —— 新增两个用例：
```ts
it('applyBackground with Y-up uses 0 X rotation', () => {
    const mgr = new EnvironmentManager(renderer)
    mgr.initDefault()
    mgr.setBackgroundMode('environment')
    const scene = new THREE.Scene()
    mgr.applyBackground(scene, 0, 'y')
    expect(scene.backgroundRotation.x).toBeCloseTo(0)
    mgr.dispose()
})

it('applyBackground with Z-up uses π/2 X rotation', () => {
    const mgr = new EnvironmentManager(renderer)
    mgr.initDefault()
    mgr.setBackgroundMode('environment')
    const scene = new THREE.Scene()
    mgr.applyBackground(scene, 0, 'z')
    expect(scene.backgroundRotation.x).toBeCloseTo(Math.PI / 2)
    mgr.dispose()
})
```

**`ShadowFloor.test.ts`** —— 现有测试已覆盖 `'y'` 和 `'z'` 两种朝向，无需修改。

**`file-formats.test.ts`** 或新增测试 —— 验证 `getDefaultUpAxis()` 行为：
```ts
describe('getDefaultUpAxis', () => {
    it('returns y for GLB without STEP_T', () => {
        // 构造不带 STEP_T 的最小 GLB buffer
        const buffer = buildMinimalGlbBuffer()
        expect(getDefaultUpAxis('glb', buffer)).toBe('y')
    })

    it('returns z for GLB with STEP_T', () => {
        const buffer = buildGlbBufferWithStepT()
        expect(getDefaultUpAxis('glb', buffer)).toBe('z')
    })
})
```

### 集成测试 —— 已有测试文件中新增断言

#### 1. `src/test/shadow-diag.spec.ts` —— box_boss.glb（带 STEP_T，Z-up）

在现有 `'shadow visibility diagnostic'` 测试的 `diag` evaluate 之后，已有断言 `light.up` 为 `[0,0,1]`（L235）之后，新增以下断言：

```ts
// --- Z-up assertions (box_boss.glb has STEP_T extension) ---
// 1. model store activeUpAxis
const msDiag = await page.evaluate(() => {
    const s = (window as any).__modelStore?.getState()
    return { activeUpAxis: s?.activeUpAxis }
})
test.expect(msDiag.activeUpAxis, 'activeUpAxis should be z for STEP_T GLB').toBe('z')

// 2. scene.environmentRotation.x should be ~π/2 (Z-up maps sky to Z+)
const envXRotZ = diag.sceneEnvRotation?.[0]
console.log('env rotation X:', envXRotZ)
test.expect(Math.abs(envXRotZ - Math.PI / 2), 'env X rotation should be ~π/2 for Z-up').toBeLessThan(0.01)

// 3. scene.backgroundRotation.x should be ~π/2
const bgXRotZ = diag.sceneBgRotation?.[0]
console.log('bg rotation X:', bgXRotZ)
test.expect(Math.abs(bgXRotZ - Math.PI / 2), 'bg X rotation should be ~π/2 for Z-up').toBeLessThan(0.01)

// 4. shadow floor plane should be on XY plane (rotation.x ≈ 0 for Z-up)
const floorMeshZ = diag.shadowFloors.find((f: any) => f.isMesh)
test.expect(floorMeshZ, 'shadow floor mesh should exist').toBeTruthy()
test.expect(Math.abs(floorMeshZ.rotation[0]), 'floor rotation.x should be ~0 for Z-up').toBeLessThan(0.01)

// 5. scene.up should be [0, 0, 1]
test.expect(diag.sceneUp, 'scene.up should be [0,0,1]').toEqual([0, 0, 1])
```

`light.up` 已有断言 `toEqual([0, 0, 1])`（L235），符合 Z-up 预期，无需重复添加。

#### 2. `src/test/material-editor-part-switch.spec.ts` —— AnisotropyBarnLamp.glb（无 STEP_T，Y-up）

在 `'alpha mode buttons remain visible after switching parts via scene tree'` 测试中，`waitForLoadDone(page)`（L93）之后，新增以下断言：

```ts
// --- Y-up assertions (AnisotropyBarnLamp.glb has no STEP_T extension) ---
const upDiag = await page.evaluate(() => {
    const ms = (window as any).__modelStore?.getState()
    const dev = (window as any).__r3f_dev as any
    const scene: any = dev?.scene
    if (!scene) return { err: 'no scene' }

    // Find directional light
    let lightUp: number[] | null = null
    scene.traverse((obj: any) => {
        if (obj.isDirectionalLight && !lightUp) {
            lightUp = [obj.up.x, obj.up.y, obj.up.z]
        }
    })

    // Find shadow floor
    let floorRot: number[] | null = null
    scene.traverse((obj: any) => {
        if (obj.name === 'shadowFloor') {
            obj.traverse((child: any) => {
                if (child.isMesh && !floorRot) {
                    floorRot = [child.rotation.x, child.rotation.y, child.rotation.z]
                }
            })
        }
    })

    return {
        activeUpAxis: ms?.activeUpAxis,
        sceneUp: [scene.up.x, scene.up.y, scene.up.z],
        envRotX: scene.environmentRotation?.x,
        bgRotX: scene.backgroundRotation?.x,
        lightUp,
        floorRotX: floorRot?.[0] ?? null,
    }
})

// 1. activeUpAxis should be 'y'
test.expect(upDiag.activeUpAxis, 'activeUpAxis should be y for non-STEP_T GLB').toBe('y')

// 2. scene.environmentRotation.x should be ~0 (Y-up maps sky to Y+)
console.log('env rotation X (Y-up):', upDiag.envRotX)
test.expect(Math.abs(upDiag.envRotX), 'env X rotation should be ~0 for Y-up').toBeLessThan(0.01)

// 3. scene.backgroundRotation.x should be ~0
console.log('bg rotation X (Y-up):', upDiag.bgRotX)
test.expect(Math.abs(upDiag.bgRotX), 'bg X rotation should be ~0 for Y-up').toBeLessThan(0.01)

// 4. directional light up should be [0, 1, 0]
test.expect(upDiag.lightUp, 'light up should be [0,1,0] for Y-up').toEqual([0, 1, 0])

// 5. shadow floor should be on XZ plane (rotation.x ≈ -π/2 for Y-up)
test.expect(upDiag.floorRotX, 'floor rotation.x should be ~-π/2 for Y-up').toBeLessThan(-1.5)

// 6. scene.up should still be [0, 0, 1] (never changes)
test.expect(upDiag.sceneUp, 'scene.up should always be [0,0,1]').toEqual([0, 0, 1])
```

### 手工验证

| # | 场景 | 预期结果 |
|---|------|----------|
| 1 | 加载 box_boss.glb（含 STEP_T） | Y↑/Z↑ 按钮高亮 Z↑；环境贴图 X 旋转 = π/2；阴影地板在 XY 平面；灯光 up=[0,0,1] |
| 2 | 加载 AnisotropyBarnLamp.glb（无 STEP_T） | Y↑/Z↑ 按钮高亮 Y↑；环境贴图 X 旋转 = 0；阴影地板在 XZ 平面；灯光 up=[0,1,0] |
| 3 | 加载 Z-up 文件，点击 Y↑ 按钮 | 相机动画旋转；环境贴图切换为 Y-up 朝向；阴影地板重新定位；灯光 up 变为 [0,1,0] |
| 4 | 加载 Y-up 文件，点击 Z↑ 按钮 | 相机动画旋转；环境贴图切换为 Z-up 朝向；阴影地板重新定位；灯光 up 变为 [0,0,1] |
| 5 | 在 Y-up 模式下拖动环境旋转滑块 | 环境随滑块旋转，Z 轴旋转正常叠加在 Y-up 朝向之上 |
| 6 | 加载两个不同 up-axis 文件后切换活跃文件 | up-axis 随活跃文件自动切换 |

### 回归测试

```bash
# 单元测试
npx vitest run src/renderer/engine/environment/
npx vitest run src/renderer/config/

# 受影响的集成测试（仅运行修改过的 spec，比全量快）
npx playwright test src/test/shadow-diag.spec.ts
npx playwright test src/test/material-editor-part-switch.spec.ts

# TypeScript 类型检查
npx tsc --noEmit

# ESLint
npm run lint
```

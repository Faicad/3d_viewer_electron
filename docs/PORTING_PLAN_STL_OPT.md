# 移植计划: 3d_viewer_web → 3d_viewer_electron

基准: `cb6a44e`（上次同步点，PORTING_PLAN_2026-06-15.md）
目标: `387d464`（最新 HEAD）
范围: `cb6a44e..HEAD` 中所有 `src/renderer/` 改动（排除 `movies/`）

## 落后情况

上次同步覆盖了 `563b5f0b` → `cb6a44e`（25 个提交）。此后 Web 项目新增 **39 个提交** 涉及 `src/renderer/`，共改动 **23 个文件**（+2406 行 / -959 行）。

以下逐文件分析，标注移植状态和操作指南。

---

## 一、核心渲染层（必须移植）

### 1.1 cloneMaterial.ts — 默认材质参数调优

**提交:** `387d464`
**改动:** 3 处

```typescript
// 常量更新
export const DEFAULT_MATERIAL_ROUGHNESS = 0.5   // 原 0.35
export const DEFAULT_MATERIAL_METALNESS = 0.0   // 原 0.1

// createDefaultMaterial() 新增一行
mat.envMapIntensity = 0.6
```

**Electron 状态:** ❌ 未移植
**操作:** 直接修改 `src/renderer/engine/components/cloneMaterial.ts` 第 124-125 行和第 140 行后。
**兼容性:** 纯 Three.js 常量。影响所有使用 `createDefaultMaterial()` 的格式（STL/PLY/VTK/MD2/DRC）。Electron 缩略图离屏渲染使用相同材质 → 自动获得优化。

---

### 1.2 ModelGroup.tsx — EdgesGeometry 棱线叠加

**提交:** `387d464`
**改动:** 3 处

**(a) 顶层 hooks 区域新增 `edgeGeometry` useMemo**

在 `defaultMaterialWireframe` useMemo 之后、`checkerMaterials` useMemo 之前插入：

```typescript
const edgeGeometry = useMemo(() => {
  if (!mergedGeometry) return null
  if (displayMode === 'mesh' || displayMode === 'debug' || displayMode === 'wireframe') return null
  return new THREE.EdgesGeometry(mergedGeometry, 30)
}, [mergedGeometry, displayMode])
```

**(b) `isMeshOnly` 声明移到 early return 之前**

```typescript
// 改前（Electron 当前）
if (!mergedGeometry) return null
const isMeshOnly = displayMode === 'mesh' || displayMode === 'debug'

// 改后
const isMeshOnly = displayMode === 'mesh' || displayMode === 'debug'
if (!mergedGeometry) return null
```

**(c) single-mesh JSX: lineSegments 作为 mesh 子节点**

```tsx
<mesh
  visible={mergedVis}
  geometry={mergedGeometry}
  castShadow
  userData={{ partId: mergedPartId }}
  material={isMeshOnly ? defaultMaterialWireframe : defaultMaterial}
>
  {edgeGeometry && (
    <lineSegments visible={mergedVis} geometry={edgeGeometry}>
      <lineBasicMaterial color="#1a4570" opacity={0.35} transparent depthTest />
    </lineSegments>
  )}
</mesh>
```

**Electron 状态:** ❌ 未移植
**操作:** 直接修改 `src/renderer/engine/components/ModelGroup.tsx`。注意 Electron 版本的 ModelGroup.tsx 与 Web 在当前状态下结构一致（943 行 vs 952 行差异仅本次改动）。
**兼容性:** `EdgesGeometry` 纯 CPU 计算。`LineSegments` + `LineBasicMaterial` 标准 Three.js，Electron 离屏渲染完全支持。缩略图自动包含棱线。

---

### 1.3 EnvironmentManager.ts — 环境切换淡入淡出

**提交:** `819aff9`, `4846697`
**改动:** +180 行（新增 `fadeEnvironment` 方法及相关私有成员）

新增内容:
- `_fadeTween`, `_overlayScene`, `_overlayMesh`, `_overlayMat`, `_overlayRT` 私有字段
- `_cancelFade()` — 取消进行中的淡出动画
- `_disposeOverlay()` — 释放覆盖层资源
- `isFading()` — 查询是否正在淡出
- `fadeEnvironment()` — 捕获当前帧 → 交换纹理 → GSAP 淡出覆盖层
- `_positionOverlayQuad()` — 全屏四边形定位
- `_fadeOutOverlay()` — GSAP 淡出循环
- `dispose()` 中增加 `_cancelFade()` 调用

**Electron 状态:** ❌ 未移植
**操作:** 在 `src/renderer/engine/environment/EnvironmentManager.ts` 中：
1. 文件顶部新增 `import gsap from 'gsap'`
2. 构造函数中新增私有字段声明（注意 Electron 项目可能使用不同的 TypeScript private 语法）
3. 在 `setEnvironment` 方法之前插入 `_cancelFade`, `_disposeOverlay`, `isFading`, `fadeEnvironment`, `_positionOverlayQuad`, `_fadeOutOverlay` 方法
4. 在 `dispose()` 方法开头增加 `this._cancelFade()`
**兼容性:** 使用 GSAP（Electron 已安装）。`WebGLRenderTarget` 离屏兼容。

---

### 1.4 SceneSetup.tsx — 集成 fadeEnvironment

**提交:** `7202a37`, `4846697`
**改动:** ~20 行

关键变更:
- 从 `useThree()` 额外获取 `camera`
- 从 engine-store 读取 `movieMode`
- `selectedEnv` 变化时用 `mgr.fadeEnvironment()` 包裹 `mgr.setEnvironment()`
- `pendingCustomLoad` 变化时同样用 `fadeEnvironment()` 包裹
- `envIntensity` 订阅中跳过 `isFading()` 期间的变化

**Electron 状态:** ❌ 未移植
**操作:** 修改 `src/renderer/engine/components/SceneSetup.tsx`。Electron 版本可能缺少 `movieMode` 字段（需确认 engine-store 中已有，见 §1.5 检查点）。

---

### 1.5 engine-store.ts — movieMode / controlsEnabled（检查点）

**提交:** `69c360b`, `9f788e9`（部分已在 `cb6a44e` 之前引入）
**Electron 状态:** ✅ 已存在（`movieMode`, `controlsEnabled` 字段和 setter 均已有）
**操作:** 无需移植。确认字段存在即可。

---

### 1.6 cameraFit.ts — 目标视角计算修复

**提交:** `0b31d6c`
**改动:** ~35 行

关键变更:
- `calcZoomToBoundingBoxFactor()` 新增 `forwardOverride` 和 `upOverride` 参数
- `computeCameraFitTarget()` 中新增长度计算，使用固定的 45° 顶前方向而非相机当前朝向

**Electron 状态:** ❌ 未移植（Electron 的 cameraFit.ts 仍使用旧公式）
**操作:** 修改 `src/renderer/engine/heatbed/cameraFit.ts`。

---

### 1.7 exporters/index.ts — 导出时烘焙世界变换

**提交:** `f7f86ef`
**改动:** +12 行

新增 `cloneMeshWithWorldTransform()` 函数，在导出前将世界变换烘焙到本地变换。`meshesToGlb()` 和 `meshesToStl()` 改用此函数替代 `mesh.clone()`。

**Electron 状态:** ❌ 未移植（无 `cloneMeshWithWorldTransform`）
**操作:** 修改 `src/renderer/engine/exporters/index.ts`。
**兼容性:** Electron 有导出功能（`exportModel` IPC 命令），此修复确保导出位置正确。

---

## 二、文件加载与校验（必须移植）

### 2.1 file-formats.ts — MAX_STEP_FILE_SIZE + scad Z-up

**提交:** `fb9e23c`, `7088265`
**改动:** 2 处

```typescript
// 1. scad 加入 Z_UP_FORMATS
const Z_UP_FORMATS: ReadonlySet<FormatId> = new Set([
  '3mf', 'stl', 'amf', 'step', 'scad',
])

// 2. 新增常量
export const MAX_STEP_FILE_SIZE = 100 * 1024 * 1024
```

**Electron 状态:** 
- `scad` in Z_UP_FORMATS: ✅ 已存在
- `MAX_STEP_FILE_SIZE`: ❌ 缺失
**操作:** 仅在 `src/renderer/config/file-formats.ts` 中新增 `MAX_STEP_FILE_SIZE` 常量导出。

---

### 2.2 useFileLoader.ts — STEP 100MB 校验

**提交:** `fb9e23c`
**改动:** 导入 `MAX_STEP_FILE_SIZE`，在 `loadFile` 函数开头增加 STEP 文件大小检查。

**Electron 状态:** ❌ 未移植
**操作:** 修改 `src/renderer/hooks/useFileLoader.ts`。

---

### 2.3 useFileUpload.ts — STEP 100MB + glTF resourcePath

**提交:** `fb9e23c`, `993b566`
**改动:** 
1. 导入 `MAX_STEP_FILE_SIZE`
2. 上传前检查 STEP 文件大小
3. `uploadFile` 参数新增 `resourcePath?`
4. `filePath` 改用 `opts?.resourcePath ?? file.name`

**Electron 状态:** ❌ 未移植
**操作:** 修改 `src/renderer/hooks/useFileUpload.ts`。注意 Electron 使用完整绝对路径（`cross-porting-guide.md §文件系统与IPC`），resourcePath 逻辑可能需要调整——Electron 的 glTF 外部资源解析走 IPC，不一定需要此修复。**建议对照 Web diff 手动合并此文件的改动。**

---

### 2.4 WorkspacePage.tsx — STEP 100MB + glTF URL resourcePath

**提交:** `fb9e23c`, `993b566`
**改动:**
1. 导入 `MAX_STEP_FILE_SIZE`
2. 上传前检查 STEP 大小
3. `?url=` 加载时，glTF 格式计算 `resourcePath` 传入 `uploadFile`

**Electron 状态:** ❌ 未移植
**操作:** 修改 `src/renderer/pages/WorkspacePage.tsx`。Electron 可能没有 `?url=` 参数加载（Web 独有功能），但 STEP 100MB 检查需要添加。**建议对照 Web diff 手动合并此文件的改动。**

---

### 2.5 ui-store.ts — localStorage 安全性修复

**提交:** `d07b5dc`
**改动:** ~10 行

```typescript
const isLocalStorageAvailable = typeof localStorage !== 'undefined'
const safeLocalStorage = {
  getItem: (key) => isLocalStorageAvailable ? localStorage.getItem(key) : null,
  setItem: (key, value) => { if (isLocalStorageAvailable) localStorage.setItem(key, value) },
  removeItem: (key) => { if (isLocalStorageAvailable) localStorage.removeItem(key) },
}
```

**Electron 状态:** ❌ 未移植
**操作:** 修改 `src/renderer/stores/ui-store.ts`。Electron 中 `localStorage` 始终可用，但 SSR/测试环境可能没有——此修复是防御性的，建议移植。

---

## 三、API 层（部分移植，需适配）

### 3.1 viewer-api.ts — 多文件 findMeshInScene 回退

**提交:** `9496d90`, `0e7c01e`
**改动:**
1. `findMeshInScene` 新增 `__modelGroupMap` 回退搜索（多文件场景）
2. `on` 事件系统改为 no-op
3. 移除 `emitViewerEvents`、`startEventLoop`
4. 代码风格简化（移除冗余变量）

**Electron 状态:** ⚠️ 部分移植
- `0e7c01e` 的 ai-injection 重构已存在（`registerViewerAPI`）
- `9496d90` 的多文件回退搜索 **未移植**
**操作:** 修改 `src/renderer/ai-injection/viewer-api.ts`：
1. `findMeshInScene` 增加 `__modelGroupMap` 回退逻辑
2. 将 `on` 改为 no-op（如果尚未修改）
3. 移除 `emitViewerEvents` / `startEventLoop`（如果尚未移除）

---

### 3.2 ai-injection/index.ts, types.ts, inject.ts — AI 注入重构

**提交:** `0e7c01e`
**状态:** ✅ 已移植（Electron commit `fef296b`）
**操作:** 无需移植。确认 `inject.ts` 已删除，`index.ts` 使用 `registerViewerAPI`。

---

### 3.3 window.d.ts — 类型声明更新

**提交:** 多个提交
**改动:** 累计 ~45 行修改

新增/修改的类型:
- 移除 `AIInjection` 类型引用
- `__animateCamera` 新增 `ease`, `rotate`, `angle` 参数
- `__demoGSAPExplode` 新增 `params?: { spread?: number; range?: number }`
- 新增 `__exportModel`
- 新增 `__triggerEntryAnimation`
- 新增 `__pendingEntryConfig`

**Electron 状态:** ❌ 未移植
**操作:** 修改 `src/renderer/types/window.d.ts`。注意 Electron 可能不需要所有类型——按实际移植的 API 对应添加。

---

### 3.4 main.tsx — 大量 API 增强

**提交:** 多个提交（`f7f86ef`, `5097551`, `bba2e63`, `e673bea`, `4aeddb5`, `1bad3d2`, `fd0c06a`, `68c240e`, `e6ad486`, `f8e71b2` 等）
**改动:** +208 / -~107 行

**⚠️ Electron 的 main.tsx 架构与 Web 不同。** Web 使用 postMessage + executeCommand switch-case；Electron 使用 IPC 通道（`window.electronAPI`）。以下按功能逐项列出，需手动适配到 Electron IPC handler：

| 功能 | 提交 | 需要移植？ |
|------|------|-----------|
| `__animateCamera` rotate 支持 + ease | `1bad3d2`, `e6ad486`, `5097551` | ✅ 是 — Electron 的 `__animateCamera` 是旧版本（无 rotate/ease） |
| `__exportModel` 窗口函数 | `f7f86ef` | ✅ 是 — Electron 有 exportModel 功能但无窗口便捷函数 |
| `__queryParts` 窗口函数 + `queryParts` 命令 | `4aeddb5`, `e673bea` | ✅ 是 — 需要底层的 `part-query.ts` 模块（见 §4.1） |
| `__demoGSAP*` 重构（`start*` 模式 + `_demoCleanup`） | `bba2e63`, `68c240e`, `fd0c06a` | ✅ 是 — Electron 已部分使用 `start*` 模式，需检查完整性 |
| `executeCode` 命令移除 | `0e7c01e` | ✅ 是 — Electron 可能还有旧 executeCode handler |
| `loadModel` entry animation config (`__pendingEntryConfig`) | `f8e71b2` | ✅ 是 — 需配合 ViewportContainer entry 动画系统 |
| `loadModel` STEP 100MB 检查 | `fb9e23c` | ✅ 是 |
| `loadModel` glTF resourcePath 修正 | `993b566` | ⚠️ 可选 — Electron 走 IPC 文件读取，路径逻辑不同 |
| `setPartMaterial` / `applyPreset` queryParts 支持 | `4aeddb5` | ✅ 是 |
| `hideDemoPanelIfMovieMode` 扩展为三个 panel | `fd0c06a` | ✅ 是 |
| `registerViewerAPI` → 替换 `registerAIInjection` | `0e7c01e` | ✅ 已移植 |

**操作:** 逐项对照 Web 的 `main.tsx` diff，手动合并到 Electron 的 `src/renderer/main.tsx`（IPC handler 部分在 `electron/main-ipc.ts` 或类似位置）。详见每一提交的 diff。

---

### 3.5 ai-injection/demos/ — Demo 重构（检查点 + 补缺）

**提交:** `0e7c01e`（主重构）、`5097551`、`68c240e`、`8b0a072`
**改动:** 三个 demo 文件从 `buildGSAP*Payload()` + `executeCode` 注入模式重构为 `start*Demo()` 直接 TS 模块模式。累计 +600 行 / -550 行。

**核心变化:**
- 不再导出 HTML/CSS/JS 字符串和 `build*Payload` 函数
- 改为导出 `start*Demo()` 函数，直接创建 DOM、注入样式、绑定事件、返回 cleanup
- 所有元素 ID 改为唯一前缀（`r-`、`e-`、`a-`），防止多 demo 同时打开时碰撞
- CSS 改为动态注入 `<style>` 标签，使用 `#panelId` 作用域

**Electron 状态:** ⚠️ 大部分已移植，但缺少后续增强

| Demo 文件 | Electron 当前 | Web 最新 | 差距 |
|-----------|-------------|---------|------|
| `gsap-rotate-demo.ts` | `startRotateDemo()` | `startRotateDemo()` | ✅ 基本一致（~153 行 vs ~156 行） |
| `gsap-assemble-demo.ts` | `startAssembleDemo()` | `startAssembleDemo()` | ⚠️ 348 行 vs 468 行，缺少细节更新 |
| `gsap-explode-demo.ts` | `startExplodeDemo()` 无参数 | `startExplodeDemo(spreadOverride?, rangeOverride?)` | ❌ 缺少 spread/range 参数、orientation 语法支持 |

**操作:**

**(a) gsap-rotate-demo.ts — 对照合并**
Electron 153 行，Web 156 行。差异仅 3 行，很可能只是元素 ID 前缀不同。直接对照 Web diff 确认是否一致。

**(b) gsap-assemble-demo.ts — 对照合并**
Electron 348 行，Web 468 行。差异 120 行，主要集中在：
- 元素 ID 前缀（`a-`）统一
- 事件绑定改为直接引用（不用字符串 ID 每次 `getElementById`）
- 面板注入目标改为 `ai-layer` 或 `document.body`
- `modeLabel` / `btnMode` 的处理改进

直接复制 Web 最新版覆盖，或手动对照 diff 合并。

**(c) gsap-explode-demo.ts — 完整替换**
Electron 357 行，Web 485 行。差异 128 行，新增功能：

```typescript
// Web 新版函数签名
export function startExplodeDemo(spreadOverride?: number, rangeOverride?: number): () => void
```

新增能力:
- `spreadOverride` — 由外部（`callDemo` / `__demoGSAPExplode(params)`）指定扩散倍率
- `rangeOverride` — 支持 orientation 语法：单值全范围、`3-8` 范围、`横/竖` orientation 条件
- `callDemo` 参数解析：字符串参数自动转数字
- 元素 ID 前缀 `e-` 统一
- 面板注入目标改为 `ai-layer` 或 `document.body`
- cleanup 函数：移除 panel + style + 事件监听

**操作:** 直接复制 Web 最新版 `gsap-explode-demo.ts` 覆盖 Electron 版本。注意确认 `window.__gsap`、`window.__THREE`、`window.__viewerAPI` 在 Electron 中可用。

---

## 四、新增模块（必须移植）

### 4.1 part-query.ts + part-query.test.ts — 零件查询 API

**提交:** `4aeddb5`
**改动:** 全新文件

`queryParts(filter, options?)` 支持按 name(regex)、color(rgb/name)、metalness、roughness、materialIndex、triangleCount、extruder、plateId 组合筛选零件。查询基于 `materialOriginals`（不受 override 影响），回退到 `meshLookup` 读取 Three.js 材质。

**Electron 状态:** ❌ 文件不存在
**操作:**
1. 复制 `src/renderer/lib/part-query.ts` 到 Electron
2. 复制 `src/renderer/lib/part-query.test.ts` 到 Electron
3. 确认测试通过: `pnpm exec vitest run src/renderer/lib/part-query.test.ts`
**兼容性:** 无平台依赖。依赖 `material-store` 的 `materialOriginals` 和 `meshLookups`，这两个在 Electron 中已存在。

---

## 五、ViewportContainer.tsx（大量改动，分批移植）

**提交:** 16 个提交
**改动:** +471 / -~70 行

这是改动量最大的文件。以下按功能分组：

### 5.1 Entry Animation 系统

**提交:** `b18a8cd`, `68f0160`, `d5f6c39`, `f8e71b2`, `9f788e9`, `40738b8`, `5974bdd`, `9dad1a9`, `ea7a259`, `44cd549`, `5f13aed`, `65682bb`

核心功能：
- `resolveEntryConfig()` — 从 `__pendingEntryConfig` / URL hash / 默认值解析入场动画参数
- `zoom` / `slide` 两种入场动画类型
- `__triggerEntryAnimation` — 手动触发入场动画
- `movieMode` 下自动播放入场动画
- GSAP 驱动的相机动画

**Electron 状态:** ❌ 未移植
**操作:** 对照 Web diff 移植入场动画相关代码。注意 Electron 可能不需要 `movieMode` 下的自动播放逻辑——但基础入场动画对 UX 有益。

### 5.2 多模型并排支持

**提交:** `a1af8a2`
**改动:** 布局算法改动

**Electron 状态:** ❌ 未移植
**操作:** 移植多模型布局逻辑。

### 5.3 环境淡入淡出集成

**提交:** `08a528c`
**改动:** 与 `EnvironmentManager.fadeEnvironment` 联动

**Electron 状态:** ❌ 未移植（依赖 §1.3 EnvironmentManager 改动）
**操作:** 在 EnvironmentManager 移植完成后移植此改动。

### 5.4 per-file target 支持

**提交:** `9496d90`
**改动:** `unloadModel` 和 `moveModelToScreenNdc` 支持按文件操作

**Electron 状态:** ❌ 未移植
**操作:** 移植 per-file target 逻辑。

### 5.5 其它改动

- `9f788e9`: 用 CustomEvent 替换 store polling
- `5f13aed`: 移除 `__triggerEntryAnimation` 死引用
- `65682bb`: 移除 `pendingBoxRef` 死代码

**操作:** 在入场动画系统移植后，这些重构项自然包含在内。

---

## 六、实施顺序

按依赖关系排列。每个步骤完成后运行 `node scripts/local-ci.mjs` 验证。

| 步骤 | 文件 | 依赖 | 风险 |
|------|------|------|------|
| 1 | `cloneMaterial.ts` | 无 | 低 |
| 2 | `file-formats.ts` (MAX_STEP_FILE_SIZE) | 无 | 低 |
| 3 | `ui-store.ts` | 无 | 低 |
| 4 | `cameraFit.ts` | 无 | 低 |
| 5 | `exporters/index.ts` | 无 | 低 |
| 6 | `ModelGroup.tsx` | 无 | 低 |
| 7 | `useFileLoader.ts` | 步骤 2 | 低 |
| 8 | `useFileUpload.ts` | 步骤 2 | 中（需适配 Electron 路径逻辑） |
| 9 | `WorkspacePage.tsx` | 步骤 2 | 中（需适配 Electron WorkspacePage） |
| 10 | `EnvironmentManager.ts` | 无 | 中（大段新增代码） |
| 11 | `SceneSetup.tsx` | 步骤 10 | 低 |
| 12 | `part-query.ts` + test | 无 | 低 |
| 13 | `viewer-api.ts` | 无 | 低 |
| 14 | `window.d.ts` | 步骤 13 | 低 |
| 15 | `gsap-explode-demo.ts`（完整替换） | 无 | 低 |
| 16 | `gsap-assemble-demo.ts`（对照合并） | 无 | 低 |
| 17 | `gsap-rotate-demo.ts`（检查确认） | 无 | 低 |
| 18 | `main.tsx` | 步骤 12 | **高**（Electron main.tsx 架构不同） |
| 19 | `ViewportContainer.tsx` | 步骤 10, 11 | **高**（改动量最大） |

步骤 15-16 风险标注为"高"是因为 Electron 的 main.tsx 和 ViewportContainer.tsx 与 Web 有架构差异，不能简单复制 diff。建议先仔细阅读 Electron 当前版本的这两个文件，理解差异后再手动合并。

---

## 七、验证清单

移植完成后:

```bash
# Electron 项目
cd 3d_viewer_electron
pnpm exec tsc --noEmit
pnpm exec eslint .
pnpm exec vitest run
pnpm exec vitest run --config vitest.jsdom.config.ts
pnpm run build
pnpm exec playwright test
node scripts/local-ci.mjs
```

**手动验证:**
- 打开 STL 文件 → 确认 Solid 模式下有深蓝色棱线
- 拖拽模型 → 确认棱线跟随移动
- 切换环境 → 确认有淡入淡出动画
- 打开超过 100MB 的 STEP 文件 → 确认被拒绝
- 缩略图生成 → 确认包含棱线效果

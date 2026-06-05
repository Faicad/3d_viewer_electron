# 文件加载进度条实现方案

> 参考项目：[bambu-viewer](https://github.com/blacksphereindustries/bambu-viewer) ( `C:\git\3D\bambu-viewer` )
> 目标项目：Ficad 3D Viewer ( `C:\my\Ficad\3d_viewer_electron` )

---

## 目录

1. [bambu-viewer 进度条分析](#1-bambu-viewer-进度条分析)
2. [当前项目加载流程现状](#2-当前项目加载流程现状)
3. [实现方案](#3-实现方案)
4. [实施步骤](#4-实施步骤)

---

## 1. bambu-viewer 进度条分析

### 1.1 UI 结构

bambu-viewer 使用一个全屏覆盖层（overlay）来显示加载进度，位于 `z-index: 2000`，高于所有其他 UI 元素。

```html
<!-- 加载覆盖层 -->
<div id="loading-overlay"
     class="fixed inset-0 bg-black backdrop-blur-sm z-[2000] hidden items-center justify-center flex-col">
  <!-- 旋转动画 -->
  <div class="spinner w-11 h-11 border-[3px] border-zinc-700 border-t-amber-500 rounded-full mb-4"></div>
  <!-- 加载文字 -->
  <div id="loading-text" class="text-sm text-zinc-500 font-mono">Loading model...</div>
  <!-- 进度条 -->
  <div class="w-48 h-1 bg-zinc-800 rounded-full mt-4 overflow-hidden">
    <div id="loading-bar"
         class="h-full bg-amber-500 rounded-full transition-all duration-300 ease-out"
         style="width:0%"></div>
  </div>
</div>
```

**UI 组成三要素：**

| 元素 | 作用 | 动画 |
|------|------|------|
| Spinner (旋转圆圈) | 表示"正在工作中" | `spin 0.8s linear infinite` |
| 加载文字 | 描述当前阶段 | 无 |
| 进度条 | 显示整体进度百分比 | `transition-all duration-300 ease-out` (宽度平滑过渡) |

### 1.2 核心函数

#### `showLoading(text, percentage)` — 更新 UI

```javascript
const loadingBar = document.getElementById('loading-bar');
const loadingOverlay = document.getElementById('loading-overlay');
const loadingText = document.getElementById('loading-text');

function showLoading(t, pct) {
  loadingText.textContent = t || 'Loading...';
  loadingOverlay.style.display = 'flex';
  if (pct !== undefined) loadingBar.style.width = Math.min(100, Math.max(0, pct)) + '%';
}

function hideLoading() {
  loadingOverlay.style.display = 'none';
  loadingBar.style.width = '0%';
}
```

职责单一：更新文字 + 更新进度条宽度。`pct` 为 `undefined` 时只更新文字，不更新进度。

#### `yieldToBrowserFrame()` — 让出渲染线程

```javascript
function yieldToBrowserFrame() {
  return new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
}
```

这是整个进度条方案的关键技术点。`requestAnimationFrame` + `setTimeout(0)` 的组合确保：
1. `requestAnimationFrame` 等待浏览器准备好下一帧绘制
2. `setTimeout(0)` 将 resolve 推迟到宏任务队列，让浏览器有时间执行渲染

#### `maybeYield(force)` — 时间预算节流

```javascript
const IMPORT_YIELD_BUDGET_MS = 32; // 约等于两帧 (60fps ≈ 16.7ms/帧)

const yieldState = { lastYield: performance.now(), lastPct: -1, lastMsg: '' };

const maybeYield = async (force = false) => {
  const now = performance.now();
  if (!force && now - yieldState.lastYield < IMPORT_YIELD_BUDGET_MS) return false;
  await yieldToBrowserFrame();
  yieldState.lastYield = performance.now();
  return true;
};
```

**设计意图：** 如果距离上次 yield 不到 32ms，则跳过 yield——避免过于频繁地让出线程导致加载变慢。`force=true` 时强制 yield（用于阶段切换时，确保 UI 一定刷新）。

#### `progress(msg, pct, force)` — 进度上报 + 去重

```javascript
const progress = async (msg, pct, force = false) => {
  if (onProgress && (force || pct !== yieldState.lastPct || msg !== yieldState.lastMsg)) {
    onProgress(msg, pct);  // 调用 showLoading
    yieldState.lastPct = pct;
    yieldState.lastMsg = msg;
  }
  await maybeYield(force);
};
```

**去重逻辑：** 如果消息和百分比都没变，跳过 DOM 更新。这避免了重复设置相同的 `textContent` 和 `style.width`。

### 1.3 在解析流程中的使用

以 3MF 解析为例，`parseBambu3MF` 在八个阶段分别报告进度：

```
showLoading('Reading file...', 0)       ← 文件读取前
  → progress('Decompressing ZIP...', 10)   ← 解压 ZIP
  → progress('Reading filament config...', 20)  ← 读取耗材配置
  → progress('Reading model settings...', 30)   ← 读取模型设置
  → progress('Mapping colors...', 40)       ← 映射颜色
  → progress('Building mesh index...', 50)  ← 构建网格索引
  → progress('Resolving components...', 65)  ← 解析组件层级
  → progress('Building geometry...', 75)    ← 构建几何体
  → progress('Assembling plates...', 90)    ← 组装打印板
  → showLoading('Laying out plates...', 95) ← 自动布局
  → showLoading('Finalizing...', 98)        ← 最终化
hideLoading()                           ← 加载完成
```

每个阶段的百分比是手动指定的，覆盖 0% ~ 98% 的区间。

### 1.4 关键技术要点总结

| 要点 | 说明 |
|------|------|
| **异步 yield** | 每次 `progress()` 后 `await maybeYield()`，让浏览器有机会重绘 |
| **时间预算节流** | 32ms 内不重复 yield，平衡 UI 流畅度和加载性能 |
| **去重** | 消息和百分比未变化时跳过 DOM 操作 |
| **阶段化进度** | 将加载过程分为 8-12 个阶段，每个阶段有明确的百分比区间 |
| **覆盖层 z-index** | 使用极高的 z-index (2000) 确保覆盖所有 UI |
| **进度条动画** | CSS `transition-all duration-300` 让宽度变化平滑 |

### 1.5 遇到的坑与解决

bambu-viewer 的 BUILD_LOG.md 记录了进度条开发中的关键 Bug：

> **Bug: 进度条在整个加载过程中始终显示 "reading"**
>
> **症状：** 尽管在 8 个不同阶段调用了 `progress()`，进度条始终停留在初始状态。
>
> **根因：** `parseBambu3MF` 是 `async` 函数，但所有实际工作都是同步执行的（在单个事件循环 tick 内完成）。`showLoading()` 调用更新了 DOM 属性（`textContent`、`style.width`），但浏览器将这些 DOM 变更批量处理，直到函数返回后才重绘——而此时加载已经完成。
>
> **修复：** 让 `progress()` 变为 `async`，每次 DOM 更新后执行 `await new Promise(r => setTimeout(r, 0))`，将控制权交还给浏览器渲染线程。

**这是最重要的教训：仅仅是调用 DOM 更新函数不够，必须在每次更新后 yield 到浏览器事件循环。**

---

## 2. 当前项目加载流程现状

### 2.1 现有的加载状态

| 方面 | 现状 |
|------|------|
| **STEP 转换的加载覆盖层** | `WorkspacePage.tsx` 中有一个简单的旋转圆圈 + "Loading..." 文字，由 `isConverting` boolean 控制 |
| **其他格式的加载指示器** | **无** — 加载期间没有任何视觉反馈 |
| **每文件加载状态** | `loadingPhase: 'idle' \| 'loading' \| 'done' \| 'error'` 存在于 Zustand store 中，但未在 UI 中渲染 |
| **进度百分比** | **无** — 整个流水线中没有进度追踪机制 |
| **Worker 进度通信** | Worker 仅在完成时发送 `{ type, id, success, root, meshes, error }`，没有中间进度消息 |
| **错误提示** | 通过 `sonner` 的 `toast.error()` 显示 |

### 2.2 加载流程架构

```
用户操作（拖拽/点击/打开文件对话框）
  └→ useFileUpload.uploadFile() / WorkspacePage.loadFilePath()
       ├── SVG/DXF: 解码文本 → 直接添加到 SVG workspace
       ├── STEP:  parseStepHeader() → stepToGlbCached() [Worker] → loadFormat('glb')
       └── 其他:  loadFormat(buffer, format)
                     ├── STL: STLLoader.parse()  (同步、快速)
                     ├── GLB: GLTFLoader.parseAsync()  (异步，含 Draco 解码)
                     ├── 3MF: ThreeMFLoader.parse() + parseBambu3mf()
                     └── 其他: 各自 loader
```

### 2.3 关键差异对比

| 特性 | bambu-viewer | 当前项目 |
|------|-------------|---------|
| 架构 | 单文件 HTML，所有逻辑在主线程 | React + Web Worker，STEP 转换在 Worker 中 |
| 进度来源 | 同步解析的多个阶段 | 部分异步（GLB）、部分 Worker（STEP） |
| 进度粒度 | 8-12 个离散阶段 | Worker 无中间进度；主线程 loader 为单个耗时操作 |
| UI 框架 | 原生 DOM 操作 | React 组件 + Zustand store |
| 加载覆盖层 | 全局 overlay | 已有简单的 spinner（仅 STEP） |

---

## 3. 实现方案

### 3.1 设计原则

**不使用全屏覆盖层**。进度 UI 应该与现有的 "拖放模型" 弹出层保持一致的风格——一个居中卡片（card），而非全屏遮罩。

参考现有的 drop overlay（`WorkspacePage.tsx` line 441-467）：
- 居中定位：`absolute inset-0 flex items-center justify-center`
- 卡片样式：`border-2 border-dashed border-muted-foreground/30 rounded-xl bg-background/70 backdrop-blur-sm`
- 尺寸由内容决定，不是全屏

新的加载进度卡片在此基础上：
1. **所有格式的加载进度显示**（不仅是 STEP）
2. **阶段性进度文字**（如 "正在读取文件..." → "正在解析..." → "正在构建几何体..."）
3. **进度条百分比**（对于能细分的阶段）
4. **与现有 Zustand store 集成**，避免引入新的状态管理模式

### 3.2 架构设计

```
Zustand Store (model-store.ts)
  └── loadingState: {
        isVisible: boolean
        message: string         // 当前阶段描述
        percentage: number      // 0-100, -1 表示不确定模式
        phase: string           // 当前阶段标识（用于去重）
      }
  └── actions:
        showProgress(msg, pct?)
        updateProgress(msg, pct?)
        hideProgress()

React 组件 (LoadingOverlay.tsx)
  └── 订阅 store.loadingState
  └── 渲染: spinner + 文字 + 进度条
  └── 不确定模式: 仅 spinner + 文字（无进度条）

调用方 (useFileUpload / WorkspacePage / formatLoaders)
  └── 在加载各阶段调用 store.showProgress() / store.updateProgress()
```

### 3.3 组件设计

#### LoadingOverlay 组件

设计风格与现有 "拖放模型" 弹出层（`WorkspacePage.tsx` 的 drop overlay）保持一致——居中卡片，不使用全屏遮罩。

```tsx
// src/renderer/components/LoadingOverlay.tsx
import { Loader2 } from 'lucide-react'
import { useModelStore } from '@/stores/model-store'

export function LoadingOverlay() {
  const loadingState = useModelStore(s => s.loadingState)

  if (!loadingState.isVisible) return null

  const isDeterminate = loadingState.percentage >= 0

  return (
    <div className="absolute inset-0 flex items-center justify-center z-30">
      <div
        data-testid="loading-overlay"
        className="relative flex flex-col items-center gap-3 p-12
                   border-2 border-dashed border-muted-foreground/30
                   rounded-xl bg-background/70 backdrop-blur-sm
                   text-muted-foreground"
      >
        {/* Spinner */}
        <Loader2 className="h-10 w-10 animate-spin text-primary" />

        {/* 阶段文字 */}
        <p className="text-sm font-medium text-foreground">
          {loadingState.message}
        </p>

        {/* 进度条（仅确定模式） */}
        {isDeterminate && (
          <div className="w-48 h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-300 ease-out"
              style={{
                width: `${Math.min(100, Math.max(0, loadingState.percentage))}%`,
              }}
            />
          </div>
        )}
      </div>
    </div>
  )
}
```

### 3.4 Store 扩展

在 `model-store.ts` 中添加加载状态：

```typescript
// 加载状态类型
interface LoadingProgressState {
  isVisible: boolean
  message: string
  percentage: number     // -1 = 不确定模式
  phase: string          // 用于去重
}

// 在 ModelStore interface 中添加:
interface ModelStore {
  // ...现有字段...

  loadingState: LoadingProgressState
  showProgress: (message: string, percentage?: number) => void
  updateProgress: (message: string, percentage?: number) => void
  hideProgress: () => void
}

// 初始状态
const initialLoadingState: LoadingProgressState = {
  isVisible: false,
  message: '',
  percentage: -1,
  phase: '',
}

// 在 create 中添加 actions:
{
  loadingState: initialLoadingState,

  showProgress: (message, percentage) => set({
    loadingState: {
      isVisible: true,
      message,
      percentage: percentage ?? -1,
      phase: message,
    }
  }),

  updateProgress: (message, percentage) => set(state => {
    // 去重：相同消息和百分比不更新
    if (state.loadingState.phase === message &&
        state.loadingState.percentage === (percentage ?? -1)) {
      return {}
    }
    return {
      loadingState: {
        ...state.loadingState,
        message,
        percentage: percentage ?? -1,
        phase: message,
      }
    }
  }),

  hideProgress: () => set({
    loadingState: initialLoadingState,
  }),
}
```

### 3.5 WorkspacePage 中的布局

`LoadingOverlay` 和现有的 "拖放模型" drop overlay 放在同级，互斥显示（有模型加载时不显示 drop overlay，drop overlay 显示时不需要加载进度）：

```tsx
// WorkspacePage.tsx — return 部分
<div className="relative flex-1" onDrop={handleDrop} onDragOver={(e) => e.preventDefault()}>
  {isSvgMode ? (
    <SvgWorkspace />
  ) : (
    <ViewportContainer />
  )}

  {/* 拖放模型弹出层 — 仅在无模型时显示 */}
  {!hasAnyModel && !isSvgMode && showDropOverlay && (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
      <div className="...卡片样式...">
        <Upload className="h-12 w-12" />
        <p>{t('chat.uploadFormats')}</p>
        ...
      </div>
    </div>
  )}

  {/* 加载进度卡片 — 有模型加载时由 store 控制显示 */}
  <LoadingOverlay />

  <OpenFileDialog ... />
</div>
```

### 3.6 集成方式

#### STEP 文件加载 — occt-import-js 的局限性

两个项目都使用 `occt-import-js`（occt-import-js.cjs + occt-import-js.wasm）。核心调用是：

```javascript
const result = occtModule.ReadStepFile(buffer, params)
```

这是**同步 C++/WASM 调用**，内部不可分割，不提供 `onProgress` 回调。occt-import-js 的 API 只有 `ReadStepFile` 一个入口，没有进度钩子。

**bambu-viewer 的做法：** 在主线程直接调用 `ReadStepFile`。进度条在调用前更新到 30%，调用期间**完全冻结**（主线程被 WASM 阻塞），调用完成后跳到 60%。用户体验：进度条在 30% 卡几十秒不动。

**本项目的做法：** `ReadStepFile` 在 Web Worker 中执行（`step-worker.js` → `stepWorkerPool.ts`），主线程保持响应。这给了我们两个优势：

1. **Worker 等待期间可以更新 UI** — 用定时器轮换文字（"正在转换几何体..." → "正在处理拓扑数据..." → ...），给用户"在动"的感觉
2. **主线程不会冻结** — React 组件正常渲染，进度条动画（CSS `transition`）正常工作

但 Worker 内部同样无法报告真实进度——它只在线程空闲时从 `pending` Map 拿到一个 Promise，然后 `await init()` → `ReadStepFile()` → `postMessage(result)`，整个过程对主线程是黑盒。

#### STEP 的具体阶段分配

```
useFileUpload / WorkspacePage 中:
  1. 读文件        → 'Reading file...'            0%
  2. parseStepHeader → 'Reading metadata...'       3%
  3. 调用 stepToGlbCached()
     ├─ 缓存命中 → 直接跳到 GLB 加载阶段
     └─ 缓存未命中:
        ├─ await convertInWorker()  ← 这个 await 可能持续几秒到几十秒
        │   期间用定时器轮换文字, 进度条保持在 5~10%
        └─ await buildGlbFromResult()  ← 主线程同步, 可插入进度(见下文)
  4. await loadFormat(glbBuffer, 'glb')  → 'Loading 3D scene...'  85%
  5. 添加文件到 store                    → 'Finalizing...'        95%
```

#### buildGlbFromResult 内的进度点

`buildGlbFromResult`（`stepToGlb.ts` line 59）运行在主线程，遍历 OCCT 返回的所有网格，逐个转换为 GLB buffer。网格数量可能很多（大装配体有几百个 part），循环中可以插入进度：

```typescript
// stepToGlb.ts — buildGlbFromResult 内部改造
export function buildGlbFromResult(
  importResult: OcctImportResult,
  options: StepToGlbOptions,
  onProgress?: (msg: string, pct: number) => void,  // 新增参数
): ArrayBuffer {
  const builder = new GlbBuilder()
  let nextOccurrenceId = 0
  const totalMeshes = importResult.meshes.length

  function buildNode(occtNode: OcctNode): number | null {
    const childIndices: number[] = []
    for (const meshIdx of (occtNode.meshes || [])) {
      const meshNode = buildNodeForMesh(...)
      childIndices.push(builder.addNode(meshNode))
    }
    for (const childNode of (occtNode.children || [])) {
      const childIdx = buildNode(childNode)
      if (childIdx !== null) childIndices.push(childIdx)
    }
    // ... 其余逻辑
  }

  // 递归构建所有节点（这里是同步的，耗时与网格数成正比）
  for (const rootChild of importResult.root.children || []) {
    buildNode(rootChild)
  }

  // 进度点：构建完成 → 可选拓扑数据 → 写入 buffer
  onProgress?.('Writing GLB buffer...', 75)

  if (options.includeSelectorTopology) {
    addStepTopology(builder, importResult, options)
    onProgress?.('Adding topology data...', 80)
  }

  const buffer = builder.write(
    entryKind && ['part', 'assembly'].includes(entryKind)
      ? (entryKind as 'part' | 'assembly')
      : undefined,
  )

  return buffer
}
```

然后在 `stepToGlbCached.ts` 中把 `updateProgress` 传进去：

```typescript
const importResult = await convertInWorker(key, stepBuffer, OCCT_PARAMS)
// Worker 返回后, 进度从 ~5% 跳到 60%
updateProgress('Building GLB geometry...', 60)
await yieldToUI(true)  // 让浏览器先渲染一次

const buffer = buildGlbFromResult(importResult, options, updateProgress)
updateProgress('STEP conversion done', 85)
```

#### 3MF 文件加载（同步解析，**必须 yield**）

3MF 的耗时分为两部分：`ThreeMFLoader.parse()`（几何解析）和 `parseBambu3mf()`（Bambu 元数据提取）。这两个都是同步调用，**必须像 bambu-viewer 一样手动 yield** 否则进度条不会更新。

`parseBambu3mf` 内部本身有 4 个阶段（见 `bambu-3mf.ts` line 212-484），可以自然地映射到进度阶段：

```
formatLoaders 中:
  ThreeMFLoader.parse(buffer)          ← 几何解析 (10→40%)
  parseBambu3mf(buffer):
    stage 1: project_settings.config   ← 耗材颜色 (40→50%)
    stage 2: model_settings.config     ← 模型设置 (50→65%)
    stage 3: 3dmodel.model             ← 元数据 (65→75%)
    stage 4: 构建 parts 列表           ← 排序 (75→85%)
  最终化                                ← 85→95%
```

但 `parseBambu3mf` 当前不接收 `onProgress` 回调。需要改造它的签名，添加 `onProgress` 参数，并在每个阶段之间 `await yieldToUI()`。

#### GLB/GLTF 文件加载（异步，但耗时不可细分）

大型 GLB 文件（几十到几百 MB）的瓶颈在 `GLTFLoader.parseAsync()`——这个调用是异步的但内部是不可分割的黑盒。它的耗时分两块：

1. **二进制解码**（Draco 压缩网格解压、KTX2 纹理转码、buffer 解析）→ 不可细分
2. **后处理**（`extractMeshes`、`annotateMaterialIndices`、`buildGlbExtensionData`）→ 同步，可细分

```typescript
showProgress('Loading GLB model...', 0)

// parseAsync 内部不可细分，显示为"解析中"
updateProgress('Parsing GLB data...', 10)
const gltf = await getGltfLoader().parseAsync(buffer, '')

// 后处理可细分（同步，需要 yield）
await yieldToUI(true)
updateProgress('Processing meshes...', 70)
const meshes = extractMeshes(gltf.scene)
annotateMaterialIndices(gltf, gltf.parser.json)

await yieldToUI(true)
updateProgress('Building extensions...', 85)
const json = gltf.parser.json
const gltfExtensions = buildGlbExtensionData(json, ...)

updateProgress('Finalizing...', 95)
hideProgress()
```

#### 快速格式（STL、OBJ、PLY 等）

```typescript
showProgress('Loading STL model...')  // 不传百分比 → 不确定模式（仅 spinner）
const result = await loadFormat(buffer, 'stl', filePath)
hideProgress()
```

### 3.7 关键技术细节

#### 主线程 yield（借鉴 bambu-viewer，**必须实现**）

bambu-viewer 踩过的坑本项目同样会踩到。`parseBambu3mf` 和 `ThreeMFLoader.parse` 都是同步调用，如果不在阶段之间 yield，所有 `updateProgress` 调用会批处理到同一个事件循环 tick，进度条直接从 0% 跳到 100%。**这是本方案的核心依赖。**

```typescript
// src/renderer/lib/async-utils.ts
const YIELD_BUDGET_MS = 32

let lastYield = 0

/** 让出控制权给浏览器渲染线程。返回 true 表示实际 yield 了。 */
export async function yieldToUI(force = false): Promise<boolean> {
  const now = performance.now()
  if (!force && now - lastYield < YIELD_BUDGET_MS) return false
  await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)))
  lastYield = performance.now()
  return true
}

export function resetYieldTimer() {
  lastYield = 0
}
```

使用方式——在 `formatLoaders.ts` 的 3MF 分支中：

```typescript
case '3mf': {
  updateProgress('Parsing 3MF geometry...', 10)
  const group = new ThreeMFLoader().parse(buffer)  // 同步，阻塞
  await yieldToUI(true)  // ← 强制让浏览器重绘

  updateProgress('Extracting metadata...', 40)
  let bambuMetadata: Bambu3mfMetadata | undefined
  try {
    bambuMetadata = parseBambu3mf(buffer)  // 同步，阻塞
  } catch { /* ... */ }

  await yieldToUI(true)  // ← 强制让浏览器重绘
  updateProgress('Finalizing...', 90)
  // ...
}
```

更好的做法是给 `parseBambu3mf` 加上 `onProgress` 回调参数，把 yield 嵌入到它的 4 个内部阶段之间。参考 bambu-viewer 的做法，每个阶段后调用 `await progress(msg, pct)`。

#### 与现有 `isConverting` 的兼容

现有的 `isConverting` 标志可以逐步迁移：

1. **第一阶段（本文档方案）：** 新增 `loadingState` 到 store，与 `isConverting` 并存。`LoadingOverlay` 检查 `loadingState.isVisible`。
2. **第二阶段（后续清理）：** 移除 `isConverting`，所有调用方改用 `showProgress/hideProgress`。

#### 多个并发加载的处理

当前项目支持并发加载（多选文件同时加载），需要避免进度条冲突：

- **简单方案：** 只显示第一个文件的加载进度（后来的文件不覆盖当前进度显示）
- **更好方案：** 显示一个汇总进度（例如 "Loading 3 files... (2/3 complete)"）

推荐先用简单方案，后续再迭代。

### 3.8 进度分配策略参考

#### STEP/STP（occt-import-js，Worker）

`ReadStepFile` 是同步 WASM 黑盒，无进度回调。主线程用定时器轮换文字。

| 阶段 | 操作 | 百分比 | 在哪里执行 | 备注 |
|------|------|--------|-----------|------|
| 读文件 | `file.arrayBuffer()` | 0→3% | 主线程 | 对 Electron 本地文件很快 |
| 读头部 | `parseStepHeader()` | 3→5% | 主线程 | 仅读文件头，瞬间完成 |
| **Worker 转换** | `convertInWorker()` → Worker 中的 `ReadStepFile()` | **5%**（停留） | Worker | 几秒~几十秒，**主线程定时器轮换文字** |
| 构建 GLB | `buildGlbFromResult()` | 60→80% | 主线程 | 遍历网格+写 buffer，同步 |
| 加载场景 | `loadFormat(glbBuffer, 'glb')` | 85→95% | 主线程 | `GLTFLoader.parseAsync` 异步 |
| 最终化 | 添加文件到 store | 95→98% | 主线程 | |

#### 3MF + Bambu（ThreeMFLoader + parseBambu3mf）

两个同步调用之间和内部都需要 `await yieldToUI(true)`：

| 阶段 | 操作 | 百分比 | 备注 |
|------|------|--------|------|
| 几何解析 | `ThreeMFLoader.parse(buffer)` | 10→40% | 同步 ZIP 解压 + XML 解析 |
| yield | `await yieldToUI(true)` | — | **必须**，否则进度条不动 |
| 耗材配置 | parseBambu3mf stage 1: `project_settings.config` | 40→50% | 同步 JSON 解析 |
| 模型设置 | parseBambu3mf stage 2: `model_settings.config` | 50→65% | 同步 XML 解析（object/part/plate/assemble） |
| 元数据 | parseBambu3mf stage 3: `3dmodel.model` | 65→75% | 同步 XML 解析 |
| 构建列表 | parseBambu3mf stage 4: 组装 parts 列表 | 75→85% | 同步循环 |
| yield | `await yieldToUI(true)` | — | **必须** |
| 最终化 | 返回结果 | 85→95% | |

#### GLB/GLTF（GLTFLoader.parseAsync + 主线程后处理）

`parseAsync` 内部异步但不可细分。后处理是同步的，需要 yield：

| 阶段 | 操作 | 百分比 | 备注 |
|------|------|--------|------|
| 解析 | `GLTFLoader.parseAsync(buffer)` | 10→70% | 异步，含 Draco/KTX2 解码 |
| 提取网格 | `extractMeshes()` | 70→80% | 同步遍历场景图 |
| 构建扩展 | `buildGlbExtensionData()` | 80→90% | 同步 |
| 最终化 | 返回结果 | 90→95% | |

#### 快速格式（无进度条，仅 spinner）

STL 二进制、OBJ、PLY、FBX、DAE 等 ── 耗时 < 1 秒，不需要阶段化进度。

---

## 4. 实施步骤

### 第一步：扩展 model-store（1-2 小时）

- [ ] 在 `src/renderer/stores/model-store.ts` 中添加 `LoadingProgressState` 类型
- [ ] 添加 `loadingState`、`showProgress`、`updateProgress`、`hideProgress` 到 store
- [ ] 确保 `reset()` 中清理 loadingState

### 第二步：创建 LoadingOverlay 组件（1-2 小时）

- [ ] 创建 `src/renderer/components/LoadingOverlay.tsx`
- [ ] 实现 spinner + 文字 + 进度条的渲染
- [ ] 支持确定模式（有百分比）和不确定模式（仅 spinner）
- [ ] 添加 `data-testid` 属性供 E2E 测试使用

### 第三步：替换现有 STEP loading overlay（0.5 小时）

- [ ] 在 `WorkspacePage.tsx` 中，移除现有的全屏 spinner（line 483-516: `isConverting && (...)` 整段）
- [ ] 在 `WorkspacePage.tsx` 的 return 中添加 `<LoadingOverlay />` 组件（放在 drop overlay 旁边，同一层级）
- [ ] 将现有的 `isConverting` 和 `setIsConverting` 调用迁移到 `showProgress/hideProgress`

### 第四步：在各加载路径中插入进度调用（3-4 小时）

需要改动的文件和具体位置：

**`src/renderer/engine/formatLoaders.ts`** — 核心改动，按格式增加进度阶段：

- [ ] **3MF (`case '3mf'`)**：拆为 (1) `updateProgress('Parsing 3MF geometry...', 10)` → `ThreeMFLoader.parse()` → `await yieldToUI(true)` → (2) `updateProgress('Extracting metadata...', 40)` → `parseBambu3mf()` → `await yieldToUI(true)` → (3) `updateProgress('Finalizing...', 90)`
- [ ] **GLB (`case 'glb'`)**：拆为 (1) `updateProgress('Parsing GLB data...', 10)` → `parseAsync()` → (2) `extractMeshes` 后 `updateProgress('Processing meshes...', 70)` → (3) `buildGlbExtensionData` 后 `updateProgress('Building extensions...', 85)`
- [ ] **GLTF (`case 'gltf'`)**：同上结构
- [ ] **快速格式 (`case 'stl'` 等)**：`showProgress('Loading STL...')` → 解析 → `hideProgress()`

**`src/renderer/lib/step-converter/stepToGlbCached.ts`** — 给 `buildGlbFromResult` 传进度回调：

- [ ] `stepToGlbCached` 中 Worker 返回后调用 `updateProgress('Building GLB geometry...', 60)` → `await yieldToUI(true)`
- [ ] `buildGlbFromResult` 签名加 `onProgress?: (msg, pct) => void`
- [ ] 在 `buildGlbFromResult` 内部：所有网格构建完后 `onProgress?.('Writing GLB buffer...', 75)`，拓扑数据处理后 `onProgress?.('Adding topology...', 80)`

**`src/renderer/lib/bambu-3mf/bambu-3mf.ts`** — 给 `parseBambu3mf` 加进度回调：

- [ ] 签名改为 `parseBambu3mf(buffer: ArrayBuffer, onProgress?: (msg: string, pct: number) => void)`
- [ ] 4 个阶段间各调用一次 `onProgress?.(msg, pct)`（调用方负责在回调里 yield）

**5 个调用入口** — 加 `showProgress/hideProgress` 包裹：

- [ ] `src/renderer/hooks/useFileUpload.ts` — `uploadFile()` 的 STEP 分支
- [ ] `src/renderer/pages/WorkspacePage.tsx` — `loadFilePath()` 所有格式
- [ ] `src/renderer/layouts/DesktopLayout.tsx` — `handleOpenFile()` 所有格式
- [ ] `src/renderer/components/FileListPanel.tsx` — `handleFileClick()` 所有格式
- [ ] STEP 分支加 Worker 等待期间的文字轮换定时器（`setInterval` 切换 messages）

### 第五步：实现 yield 工具（1 小时）

**必须实现。** occt-import-js 的 `ReadStepFile` 虽然是同步黑盒，但它在 Worker 中执行，主线程不受影响。真正需要 yield 的是 3MF 解析和 GLB 后处理——它们和 bambu-viewer 的 `parseBambu3MF` 一样在主线程同步执行，不加 yield 进度条不会动。

- [ ] 创建 `src/renderer/lib/async-utils.ts`
- [ ] 实现 `yieldToUI(force?)` — `requestAnimationFrame` + `setTimeout(0)`，32ms 节流
- [ ] 实现 `resetYieldTimer()` — 每次新加载开始时重置
- [ ] 在 `formatLoaders.ts` 的 3MF 和 GLB 分支中使用
- [ ] 在 `parseBambu3mf` 的 `onProgress` 回调中由调用方执行 yield
- [ ] 在 `stepToGlbCached.ts` 的 `buildGlbFromResult` 前后使用

### 第六步：测试（2 小时）

- [ ] 确保现有 Playwright 测试通过（`data-testid` 从 `step-loading-overlay` 变为 `loading-overlay`）
- [ ] 手动测试 STEP 加载：小文件（缓存命中时的进度跳变）+ 大文件（Worker 期间文字轮换是否正常）
- [ ] 手动测试 3MF 加载：`parseBambu3mf` 各阶段进度条是否逐步推进（不是 0% 直接跳 100%）
- [ ] 手动测试 GLB 加载：大文件（含 Draco 压缩）的 parseAsync 阶段是否正常
- [ ] 确认亮/暗主题下进度卡片颜色正确

---

## 附录：参考代码

### A. bambu-viewer 完整进度相关代码位置

| 内容 | 文件 | 行号 |
|------|------|------|
| 加载覆盖层 HTML | `index.html` | 421-427 |
| CSS spinner 动画 | `index.html` | 50-52 |
| `showLoading()` / `hideLoading()` | `index.html` | 4967-4973 |
| `yieldToBrowserFrame()` | `index.html` | 2492-2494 |
| `maybeYield()` | `index.html` | 2498-2504 |
| `progress()` | `index.html` | 2505-2512 |
| `parseBambu3MF()` 中的进度调用 | `index.html` | 2496-2851 |
| upload progress bar (Firebase) | `index.html` | 400-405, 5888-5989 |
| 关键 Bug 记录 | `BUILD_LOG.md` | 229-232 |

### B. 当前项目相关文件

| 内容 | 文件 |
|------|------|
| 现有 STEP loading UI | `src/renderer/pages/WorkspacePage.tsx` (line 483-516) |
| 主加载 hook | `src/renderer/hooks/useFileUpload.ts` |
| 页面级加载入口 | `src/renderer/pages/WorkspacePage.tsx` |
| 桌面布局加载入口 | `src/renderer/layouts/DesktopLayout.tsx` |
| 文件列表面板加载 | `src/renderer/components/FileListPanel.tsx` |
| 格式加载器 | `src/renderer/engine/formatLoaders.ts` |
| STEP 缓存+转换 | `src/renderer/lib/step-converter/stepToGlbCached.ts` |
| Worker 池 | `src/renderer/lib/step-converter/stepWorkerPool.ts` |
| Worker 脚本 | `src/renderer/public/step-worker.js` |
| 模型状态 store | `src/renderer/stores/model-store.ts` |
| GLB 构建器（主线程耗时操作） | `src/renderer/lib/step-converter/GlbBuilder.ts` |

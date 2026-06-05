# STEP 文件加载性能优化方案

## 1. 现状分析

### 1.1 bambu-viewer 对比

两个项目使用相同的 `occt-import-js` WASM 包，但 bambu-viewer 加载 STEP 明显更快。

**bambu-viewer（快）**：
```
STEP 文件 → file.arrayBuffer() → OCCT ReadStepFile
→ geometry.setAttribute('position', posArr)    // 零拷贝直接创建 BufferGeometry
→ THREE.Mesh(geometry, material)
→ 一次 bbox → 居中 → 渲染
```

**本项目（慢）**：
```
STEP 文件 → IPC:fs:readFile
→ Worker: OCCT ReadStepFile → OcctImportResult
→ buildGlbFromResult():
    → 逐顶点缩放 ×0.001 + 复制
    → GlbBuilder: 复制所有数组到 binary blob + 对齐 + bufferView/accessor
    → addStepTopology: 每个面计算 bbox/法向/中心 → selector manifest JSON
    → builder.write: JSON.stringify(glTF) + 组装 GLB header/chunks
→ IndexedDB 持久化
→ ModelGroup: GLTFLoader.parse (再解析回 BufferGeometry)
→ cloneMeshGeometry (再复制) → applyMatrix4 → computeVertexNormals (重复)
→ computeBoundingBox (重复) → cloneAndConvertMaterial → 居中 → 渲染
```

### 1.2 性能瓶颈（10MB STEP, 100 mesh, 5000 面的典型文件）

| 阶段 | 耗时 | 问题 |
|------|------|------|
| OCCT WASM 解析 | ~2s | 不可避免（Worker 内） |
| 顶点缩放 + 复制 | ~50ms | 必要，但可合并到单次遍历 |
| GLB 序列化 (GlbBuilder) | ~200-500ms | **可消除**：OCCT 输出已可直接用于 Three.js |
| 拓扑计算 (addStepTopology) | ~100-300ms | **可消除**：大部分用户不使用面选择 |
| IndexedDB GLB 写入 | ~50-200ms | 必要（缓存），但格式可优化 |
| GLTFLoader 反序列化 | ~200-400ms | **可消除**：与上游 GLB 序列化互为冗余 |
| ModelGroup 后处理 | ~200-500ms | 大量工作与 GLTFLoader 重复 |
| **额外总开销** | **~800-1950ms** | |

核心问题：**OCCT 输出的 typed arrays 已经是 Three.js 可直接用的格式，但本项目做了一次完整的 GLB 序列化→反序列化往返，导致几何数据被复制 3 次。**

### 1.3 STEP 加载的全部入口（5 条路径，全部受影响）

| # | 路径 | 触发场景 | 代码位置 |
|---|------|----------|----------|
| ① | 拖拽/文件选择器 | 用户拖入或点击打开 | `useFileUpload.ts` |
| ② | OS 文件关联双击 | Explorer 中双击 STEP | `WorkspacePage.tsx` (2 处) |
| ③ | 文件列表面板 | 侧边栏 Enter/双击 | `DesktopLayout.tsx` (2 处) |
| ④ | 文件列表面板（点击） | 侧边栏点击文件名 | `FileListPanel.tsx` |
| ⑤ | 历史记录面板 | 点击历史记录重新打开 | `HistoryPanel.tsx` |
| ⑥ | 缩略图队列 | 文件夹扫描后台缩略图 | `thumbnailQueue.ts` |
| ⑦ | 预缓存 | 打开文件 1s 后后台转换同目录 STEP | `preCache.ts` |

所有路径都经过 `buildGlbFromResult()` → GlbBuilder → GLTFLoader 这个往返。

---

## 2. 优化目标

1. **消除 GLB 往返**：OCCT 输出直接构建 Three.js Mesh（对标 bambu-viewer）
2. **删除 addStepTopology**：STEP 文件不再嵌入拓扑数据，新 STEP 无面选择；外部 GLB 自带 STEP_T 的选择功能保留
3. **Worker Pool 优化**：WASM 延迟初始化
4. **缩略图改进**：从 OCCT 结果直接生成缩略图，不经过 GLTFLoader（覆盖路径 ④ 无缓存场景）
5. **预缓存精简**：只存 OCCT 原始结果，不计算拓扑 + 不序列化 GLB
6. **新二进制缓存**：替代 GLB 格式存储，体积更小反序列化更快

---

## 3. Worker Pool 设计

### 3.1 并发需求分析

实际同时发生的转换场景：

| 场景 | 占用 Worker 数 | 说明 |
|------|:---:|------|
| 用户主动打开 1 个 STEP | 1 | 去重保证同一文件只转换一次 |
| 用户快速连续打开 2 个不同 STEP | 2 | 不同文件各自独立转换 |
| 预缓存后台转换 | 1 | 限 1 并发，和用户操作可能同时发生 |
| 缩略图队列触发转换 | 1 | 复用 precache 优先级，和预缓存共用 1 个限额 |
| **最坏情况** | **3** | 用户打开 2 个不同 STEP + 后台一个在跑 |

**结论：3 个 Worker 够用。** 2 个也能覆盖绝大多数场景（1 用户 + 1 后台），多 1 个仅为极端情况兜底。WASM 延迟初始化后，未使用的 Worker 零成本，不构成浪费。

### 3.2 调度规则

```
优先级:
  'user'      — 用户主动打开 (路径①②③)，不限并发，抢占任意空闲 slot
  'precache'  — 预缓存 / 缩略图队列触发 (路径④⑤)，全局最多 1 个并发

去重:
  pendingPromises Map, key = cacheKey
  同一文件多个请求共享同一个 Promise，Worker 只跑一次

获取 slot:
  user:      slots.find(s => !s.busy)  → 拿到就占
  precache:  countBusyByType('precache') >= 1 → 拒绝 (调用方放回队尾重试)
             slots.find(s => !s.busy)  → 拿到就占

Worker 生命周期:
  - 创建: 模块加载时 new Worker('step-worker.js')，但不发 init
  - 初始化: 收到第一个 convert 消息时惰性加载 OCCT WASM
  - 空闲: slot.busy = false，Worker 保持存活
  - 崩溃: onerror → 标记为 dead → 创建新 replacement slot
```

### 3.3 与当前架构的差异

| 项目 | 当前 | 优化后 |
|------|------|--------|
| Worker 数量 | 3 | 3（不变） |
| WASM 初始化 | 模块加载时 `postMessage({ type: 'init' })` | 首次 `convert` 时惰性加载 |
| 预缓存输出 | `buildGlbFromResult` (GLB + 拓扑) | `ProcessedOcctScene` 写入 occtCache |
| 缩略图触发 Worker | 不支持 | 支持，复用 precache 优先级 |

### 3.4 改动文件

| 文件 | 改动 |
|------|------|
| `stepWorkerPool.ts` | 删除 `createSlot()` 中 `postMessage({ type: 'init' })`；`convertInWorker` 新增缩略图回调参数 |
| `step-worker.js` | `convert` 消息处理中惰性初始化 OCCT；新增 `buildOcctScene` |
| `preCache.ts` | 输出改为 occtCache（存 ProcessedOcctScene） |

---

## 4. 新架构：跳过 GLB 往返

### 4.1 总体流程

所有 OCCT 相关处理（解析、顶点缩放、bbox 计算）全部在 Worker 内完成。主线程只负责把 Worker 返回的 typed arrays 包装成 Three.js 对象。

bambu-viewer 加载 STEP 后零件是平铺的——丢弃了 OCCT 的装配树。本项目需要**保留装配结构**：`OcctNode` 树的层级关系（名称、父子分组）必须在场景树中完整呈现。

```
主线程                        Worker 线程
───────                       ──────────
① 读 STEP 文件
② postMessage(stepData)  ──→  ③ OCCT ReadStepFile (WASM)
                               ④ buildOcctScene():
                                  缩放顶点 ×0.001
                                  计算 per-mesh bbox + total bbox
                                  处理 normal
                                  保留 OcctNode 装配树 → SceneTreeNode[]
                                  标记每个 mesh 所属的装配节点
                               ⑤ 收集 transferable typed arrays
                              ←── postMessage(processedArrays + assemblyTree + bbox)
⑥ 用 typed arrays 创建 THREE.BufferGeometry
   创建 THREE.Mesh[]，每个 mesh.userData 记录装配路径
⑦ 装配树 → 场景面板展示层级结构
   同一份 mesh 数组供: 视口渲染 + 场景树 + 缩略图
   (用于路径 ①②③④)

⑧ occtCache: Worker 输出的二进制格式 → IndexedDB
   反序列化后直接跳回步骤⑥
   (用于路径 ④⑤)
```

### 4.2 不再生成 GLB STEP_T

`buildGlbFromResult()` 中删除 `addStepTopology()` 调用。新 STEP 生成的 GLB 不含 `STEP_T` 扩展。

ViewportContainer 中：`extractSelectorBundle(buffer)` 读不到 STEP_T → `selectorRuntime = null` → `TopologyPicker` 等组件自然不渲染。**无需修改任何选择组件代码。** 外部 GLB 自带 STEP_T 的选择功能完全正常。

### 4.3 缩略图直接生成

优化后：查 occtCache → 命中直接 `createMeshesFromProcessed()` → `generateThumbnailFromResult()`（无 GLTFLoader）。未命中触发 OCCT 转换并缓存。利用现有 `MAX_RETRIES`(3) 和 `timeoutForFormat('step')`(60s) 限流。

### 4.4 缓存

旧 stepCache (GLB) 直接废弃，全走 occtCache。

## 5. 新增文件

```
src/renderer/lib/step-converter/
├── occtLoader.ts          # 现有
├── stepWorkerPool.ts      # 改: WASM 延迟初始化
├── step-worker.js         # 改: 惰性加载 OCCT + 新增 buildOcctScene
├── stepToGlb.ts           # 改: 删除 addStepTopology 调用
├── stepToGlbCached.ts     # 不再使用
├── GlbBuilder.ts          # 不再使用
├── topologyExt.ts         # 不再使用
├── buildOcctScene.ts      # 新增: Worker 内 buildOcctScene 逻辑 (或直接写在 step-worker.js 中)
├── occtCache.ts           # 新增: ProcessedOcctScene 二进制序列化 + IndexedDB
├── stepToMeshesCached.ts  # 新增: 新缓存入口
└── types.ts               # 新增: ProcessedOcctScene 等类型

## 6. 修改文件（全部）

| 文件 | 改动 |
|------|------|
| `stepToGlb.ts` | 删除 `import { addStepTopology }`；删除 `addStepTopology(...)` 调用 |
| `stepToGlb.test.ts` | 删除 STEP_T 相关断言；保留 GLB 结构/mesh 测试 |
| `index.ts` (step-converter) | 移除 `addStepTopology` export，新增 `buildOcctScene`/`occtCache`/`stepToMeshesCached` 的 export |
| `stepWorkerPool.ts` | WASM 延迟初始化 |
| `step-worker.js` | 惰性加载 OCCT |
| `preCache.ts` | 输出 occtCache（存 OcctImportResult） |
| `thumbnailQueue.ts` | STEP 分支改用 occtCache；未命中触发 OCCT 转换 |
| `useFileUpload.ts` | STEP 分支改用 `stepToMeshesCached()` |
| `WorkspacePage.tsx` | 同上（2 处） |
| `DesktopLayout.tsx` | 同上（2 处） |
| `FileListPanel.tsx` | 同上（1 处） |
| `HistoryPanel.tsx` | 同上（1 处） |
| `ModelGroup.tsx` | 新增 `directMeshes`/`directAssemblyTree`/`directUpAxis` props；跳过 GLTFLoader |
| `ViewportContainer.tsx` | 透传 `directMeshes`/`directAssemblyTree` 给 ModelGroup |
| `model-store.ts` | `LoadedFileModel` 新增 `directMeshes?`/`directAssemblyTree?`/`directUpAxis?` |

## 7. 核心模块接口

### 7.1 `buildOcctScene` — Worker ↔ 主线程分工

bambu-viewer 加载 STEP 后零件平铺，丢弃装配树。本项目需要**保留装配结构**：从 `OcctNode` 树构建 `SceneTreeNode[]` 层级，每个 mesh 标记所属装配节点。

#### Worker 内做的事（`step-worker.js` 中 `buildOcctScene`）

输入：`OcctImportResult`（OCCT WASM 的 `ReadStepFile` 返回值）
输出：纯数据，不含任何 Three.js 对象

```
遍历 result.meshes[]:
  - 从 OCCT 的 Float32Array position 逐元素 ×0.001 → 新的 Float32Array (transferable)
  - 同一循环内计算 mesh bbox: [minX,minY,minZ, maxX,maxY,maxZ]
  - OCCT 有 normal → 原始 Float32Array 直接引用 (transferable)
  - OCCT 无 normal → 标记为 null (主线程调用 computeVertexNormals)
  - index → 原始 Uint32Array 直接引用 (transferable)
  - 记录 meshName, meshColor (OCCT 的 color 字段), bbox

遍历 result.root (OcctNode 树):
  - 递归构建 assemblyTree: SceneTreeNode[]
  - 记录每个 mesh 属于哪个树节点 (nodePath)

输出 ProcessedOcctScene:
  - 所有 typed arrays 通过 postMessage 的 transferList 零拷贝传回主线程
  - tree JSON 通过 structured clone 传回
```

#### 主线程做的事（`stepToMeshesCached.ts` 中 `createMeshesFromProcessed`）

输入：`ProcessedOcctScene`（Worker 传回的纯数据）
输出：`THREE.Mesh[]` + `SceneTreeNode[]` + `THREE.Box3`

```
对每个 mesh (i = 0..N-1):
  // 用 transferable typed arrays 零拷贝创建 BufferGeometry
  geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positionArrays[i], 3))
  geo.setIndex(new THREE.BufferAttribute(indexArrays[i], 1))
  if (normalArrays[i] != null):
    geo.setAttribute('normal', new THREE.BufferAttribute(normalArrays[i], 3))
  else:
    geo.computeVertexNormals()   // ← Three.js API，必须在主线程
  geo.boundingBox = new THREE.Box3(...meshBboxes[i])
  geo.boundingSphere = new THREE.Sphere()  // Three.js 内部可能用到，从 bbox 推导

  // 材质
  color = meshColors[i] ? new THREE.Color(r/255, g/255, b/255) : DEFAULT_COLOR
  mat = new THREE.MeshPhysicalMaterial({ color, roughness, metalness, ... })

  mesh = new THREE.Mesh(geo, mat)
  mesh.name = meshNames[i]
  mesh.userData.occtMeshIndex = i
  mesh.userData.occtNodePath = meshNodePaths[i]  // 装配路径

整体 bbox:
  totalBox = new THREE.Box3(...totalBbox)

装配树:
  assemblyTree 直接使用 Worker 传回的 SceneTreeNode[]
  每个树节点的 meshIndex 字段指向 meshes[] 中的位置
```

#### Worker 返回的 ProcessedOcctScene 数据结构

```typescript
interface ProcessedOcctScene {
  // --- 每个 mesh 的几何数据 (transferable) ---
  positionArrays: Float32Array[]     // 已缩放 mm→m
  normalArrays: (Float32Array | null)[]  // null = 主线程需 computeVertexNormals
  indexArrays: Uint32Array[]

  // --- 每个 mesh 的元数据 ---
  meshNames: string[]
  meshColors: ([number, number, number] | null)[]  // OCCT 颜色 [r,g,b] 0-255
  meshBboxes: number[][]             // [minX,minY,minZ, maxX,maxY,maxZ] × N, 单位 m
  meshNodePaths: string[]            // 装配路径如 "Engine/Cylinder Block"

  // --- 整体 ---
  totalBbox: number[]                // [minX,minY,minZ, maxX,maxY,maxZ], 单位 m
  assemblyTree: SceneTreeNode[]      // 装配层级，每个节点标记 meshIndex 范围
}
```

#### 关键点

- Worker **不引**入 Three.js，只处理纯数据和 typed arrays
- 主线程用 transferable arrays 零拷贝创建 `BufferAttribute`（`new Float32Array()` 不需要，因为 transfer 过来的 ArrayBuffer 已经是正确的类型）
- `computeVertexNormals` 必须在主线程（Three.js API）
- `computeBoundingSphere` 由主线程从 bbox 推导，省去 Three.js 的 `computeBoundingSphere` 遍历开销
- 材质颜色：OCCT 的 `[r,g,b]` 0-255 → `THREE.Color(r/255, g/255, b/255)`，默认用 `DEFAULT_MATERIAL_SRGB`

### 7.2 `occtCache` — 与 Worker 输出是同一份数据

`occtCache` 存储的就是 Worker 输出的 `ProcessedOcctScene` 的二进制序列化。它们是**同一个数据结构的两种形态**：

```
Worker 输出 (内存)                       occtCache (IndexedDB)
ProcessedOcctScene  ──序列化──→  ArrayBuffer
  positionArrays[]                   [二进制 blob]
  indexArrays[]
  meshNames[]
  ...
  assemblyTree

缓存命中时反方向：
IndexedDB ArrayBuffer ──反序列化──→ ProcessedOcctScene
                                    → createMeshesFromProcessed()
                                    → 跳过 Worker，直接出 Three.js 对象
```

即：冷加载走 Worker → ProcessedOcctScene → 序列化存 IndexedDB。热加载直接从 IndexedDB 反序列化出 ProcessedOcctScene → 跟 Worker 传回的数据**一模一样**→ 走同一条 `createMeshesFromProcessed` 路径。

```typescript
async function getCachedOcct(key: string): Promise<ProcessedOcctScene | null>
async function putCachedOcct(key: string, scene: ProcessedOcctScene): Promise<void>
```

二进制格式：Header(16B) + MeshTable + Names + Colors + NodePaths + BinaryBlob(positions/normals/indices) + AssemblyTreeJSON

反序列化后直接用 `new Float32Array(buffer, offset, len)` 零拷贝创建 BufferAttribute，无任何中间转换。预计体积比 GLB 小 30-50%。

### 7.3 `stepToMeshesCached`（主线程入口）

负责缓存检查 + 调用 Worker + 主线程创建 Three.js 对象。occtCache 和 Worker 输出是同一份 `ProcessedOcctScene`，缓存命中后跳过 Worker 直接走 `createMeshesFromProcessed`。

```typescript
interface StepLoadResult {
  meshes: THREE.Mesh[]
  assemblyTree: SceneTreeNode[]
  totalBoundingBox: THREE.Box3
  cached: boolean
}
```

流程：

```
stepToMeshesCached(stepData, fileInfo)
  │
  ├─ 查 occtMemCache → 命中: ProcessedOcctScene → createMeshesFromProcessed
  ├─ 查 occtCache(IndexedDB) → 命中: 反序列化 → ProcessedOcctScene → createMeshesFromProcessed
  │   (以上两条都不需要 Worker)
  │
  └─ 全部 miss:
      convertInWorker(stepData)           ← Worker: OCCT + buildOcctScene
        → 收到 ProcessedOcctScene
        → createMeshesFromProcessed()    ← 主线程: 创建 Three.js 对象
        → putCachedOcct(key, scene)      ← 序列化写入 IndexedDB
```

## 8. STEP Worker 与缩略图的关系

### 8.1 当前问题

缩略图队列 STEP 分支只在 stepCache 命中时用 GLTFLoader 生成缩略图，未命中直接放弃——文件夹里没打开过的 STEP 文件永远看不到缩略图。

### 8.2 优化后（occtCache 解耦，绝不放弃）

```
thumbnailQueue 处理 STEP 文件:
  │
  ├─ 查 occtCache → 命中
  │     → createMeshesFromProcessed → generateThumbnailFromResult → 更新 UI
  │     → scheduleNext() 继续下一个文件
  │
  └─ 查 occtCache → 未命中
        → convertInWorker('precache')  ← 异步触发，不 await
        → 当前文件标记 "pending"，队列立即处理下一个文件
        → Worker 完成后回调:
              → ProcessedOcctScene 写入 occtCache
              → createMeshesFromProcessed → generateThumbnailFromResult
              → 即时更新缩略图 UI

        若 convertInWorker 因 precache 槽满被拒绝:
              → 文件放回队列末尾，稍后重试
```

**队列不阻塞。** 未命中时发一个异步转换请求就立刻 `scheduleNext()` 处理下一个文件。缩略图在 Worker 完成后通过回调生成并刷新 UI。现有的 `MAX_PRECACHE_WORKERS = 1` 保证同时只有一个后台转换在进行。

## 9. 风险

| 风险 | 对策 |
|------|------|
| 新 STEP 无面选择 | 外部 GLB 自带 STEP_T 不受影响；未来可引入延迟拓扑恢复 |
| 缩略图队列触发 OCCT 过多 | 复用限流机制（MAX_RETRIES=3, timeout=60s） |
| WASM 延迟首次慢 | 延迟 ~100ms，远小于 2s+ 的 OCCT 解析时间 |

## 10. 预期收益

| 指标 | 优化前 | 优化后 | 提升 |
|------|--------|--------|------|
| 首次加载（无缓存） | ~3-4s | ~2-2.5s | **30-40%** |
| 缓存命中加载 | ~1-2s | ~0.3-0.5s | **60-75%** |
| 缩略图 STEP（有缓存） | ~0.5-1s | ~0.1-0.2s | **70-80%** |
| 缩略图 STEP（无缓存） | 不生成 ❌ | 按需转换 ✓ | — |
| 预缓存单文件 | ~0.5-0.8s | ~0.2-0.3s | **50-60%** |
| 内存峰值 | 3× 几何数据 | 1× 几何数据 | **~66%** |
| 缓存体积 | GLB | 自定义二进制 | **小 30-50%** |

## 11. 实施步骤

1. **`step-worker.js` 新增 `buildOcctScene`** — Worker 内顶点缩放 + bbox + 装配树构建
2. **`occtCache.ts`** — ProcessedOcctScene 二进制序列化 + IndexedDB
3. **`stepToMeshesCached.ts`** — 新缓存入口，整合 1+2
4. **删除 `addStepTopology` 调用** — `stepToGlb.ts` 去拓扑，`stepToGlb.test.ts` 删相关断言
5. **`ModelGroup.tsx` + `model-store.ts` + `ViewportContainer.tsx`** — 支持 directMeshes + directAssemblyTree
6. **`useFileUpload.ts` / `WorkspacePage.tsx` / `DesktopLayout.tsx` / `FileListPanel.tsx` / `HistoryPanel.tsx`** — 切换入口
7. **`thumbnailQueue.ts` / `preCache.ts`** — 切到 occtCache
8. **`stepWorkerPool.ts` / `step-worker.js`** — WASM 延迟初始化

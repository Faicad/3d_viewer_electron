# AI 模型生成 — 需求设计与实现计划

## 1. 背景

当前 3D Viewer 支持三十余种 3D 文件格式。但缺少一种"可编程生成"的格式——让用户或 AI 通过代码描述模型，由前端编译为三角网格后显示。

本方案引入 `.scad`（OpenSCAD 源码）作为一种新的模型格式，分两层实现：

| 层 | 用户 | 接口 | 输入 |
|----|------|------|------|
| **Phase 1**: SCAD 文件格式 | 人类用户 | 文件选择器 / 拖放 / `loadModel` | `.scad` 文件 |
| **Phase 2**: Skill AI 接口 | AI Agent | `generateScadModel` 命令 | SCAD 代码字符串 |

两层共享同一个底层引擎：**Web Worker 内 CDN 加载 openscad-wasm → 编译为 STL → 复用现有 STL 渲染管线**。

### 为什么选择 OpenSCAD

| 方案 | 优势 | 劣势 |
|------|------|------|
| **OpenSCAD** | 代码即模型，AI 天然擅长生成；WASM 可在浏览器运行；生态成熟 | 仅支持 CSG 建模，不适合自由曲面 |
| Three.js 程序化建模 | 无外部依赖 | 代码冗长，AI 不擅长操作顶点/面 |
| FreeCAD Python | 功能强大 | 无可用的浏览器 WASM 方案 |

## 2. 架构总览

```
                      ┌──────────────────────┐
                      │    scadToStl()       │  ← 核心引擎（共享）
                      │  Web Worker + CDN    │
                      │  openscad-wasm       │
                      └──────────┬───────────┘
                                 │ STL ArrayBuffer
              ┌──────────────────┼──────────────────┐
              ▼                                     ▼
   ┌─────────────────────┐             ┌─────────────────────┐
   │ Phase 1: SCAD 格式  │             │ Phase 2: Skill 接口 │
   │                     │             │                     │
   │ 文件选择器 .scad    │             │ generateScadModel   │
   │ loadModel .scad URL │             │ { code: "..." }     │
   │ 拖放 .scad 文件     │             │ (AI 代码字符串)     │
   └────────┬────────────┘             └────────┬────────────┘
            │                                   │
            ▼                                   ▼
   ┌─────────────────────────────────────────────────────┐
   │              现有 STL 渲染管线                       │
   │  loadFormat('stl') → ModelGroup → 3D 场景           │
   └─────────────────────────────────────────────────────┘
```

## 3. 依赖：openscad-wasm

### 3.1 来源与加载方式

- npm 包：`openscad-wasm-prebuilt@1.2.0`
- CDN：`https://cdn.jsdelivr.net/npm/openscad-wasm-prebuilt@1.2.0/dist/openscad.js`
- API：`createOpenSCAD()` → `{ getInstance(): { FS, callMain } }`
- **纯 CDN 动态 import，不打包到项目，不放 `public/wasm/`**
- 理由：WASM ~15MB，远超 skill bundle 限制；`.scad` 非高频使用格式，不适合增加构建体积

### 3.2 API

```typescript
interface OpenSCADInstance {
  callMain(args: string[]): number
  FS: {
    writeFile(path: string, data: string | ArrayBufferView): void
    readFile(path: string, opts: { encoding: "binary" }): Uint8Array
    unlink(path: string): void
  }
}

import OpenSCAD from 'https://cdn.jsdelivr.net/npm/openscad-wasm@0.0.4/openscad.js'
const instance = await OpenSCAD({ noInitialRun: true })
```

### 3.3 `callMain` 单次使用限制 ⚠️

**`callMain` 是 single-shot 的**（来源：`webmcp-openscad` 项目文档和实测）：

| 层 | 原因 |
|----|------|
| OpenSCAD C++ | `main()` 返回后 CGAL 内核、几何缓存、静态变量不重置 |
| Emscripten | `noInitialRun` + `callMain` 设计意图是"推迟执行"，不是"多次执行" |
| 实践 | `webmcp-openscad`: "`callMain` corrupts state on reuse, so the worker is terminated and respawned after every render" |

**结论**：每次编译 = `new Worker() → create instance → callMain(一次) → worker.terminate()`

### 3.4 WASM 加载机制

`openscad.js` 内部通过 `import.meta.url` 解析 `openscad.wasm` 路径。CDN 加载时所有资源自动从 CDN 获取。浏览器 HTTP 缓存确保第二次起不需重新下载，但每次需重新实例化 WASM（~400-800ms）。

## 4. 核心模块：`src/renderer/lib/scad-converter/`

```
src/renderer/lib/scad-converter/
  index.ts            — 主入口：scadToStl()，两个 Phase 共用
  protocol.ts         — Worker request/response 类型
  openscad.worker.ts  — Worker 脚本：CDN 加载 WASM、callMain、返回 STL
  worker-client.ts    — 主线程客户端：spawn/terminate Worker、通信
```

### 4.1 `scadToStl()` — 核心引擎入口

```typescript
export async function scadToStl(
  code: string,
  onProgress?: (phase: 'init' | 'compile' | 'export') => void,
): Promise<{ stlBuffer: ArrayBuffer; triangleCount: number; renderMs: number }>
```

- 每次调用 spawn 新 Worker、新 WASM 实例、callMain 一次、terminate
- 60s 超时保护

## 5. Phase 1: `.scad` 文件格式

让 `.scad` 像 `.stl`、`.step` 一样成为普通文件格式。用户可通过文件选择器、拖放、`loadModel` 命令加载。

### 5.1 注册格式

在 `file-formats.ts` 中新增：

```typescript
{
  id: 'scad',
  label: 'OpenSCAD',
  extensions: ['.scad'],
  mime: 'text/x-openscad',
  group: 'cad',
  textBased: true,
  renderHint: 'mesh',
  defaultUnit: 'millimeter',
  color: 'text-yellow-500',
}
```

### 5.2 格式加载

在 `formatLoaders.ts` 的 `loadFormat()` 中新增 `case 'scad'`：

```typescript
case 'scad': {
  const code = bufferToText(buffer)
  const { stlBuffer } = await scadToStl(code)
  return loadFormat(stlBuffer, 'stl')  // 委托给现有 STL 管线
}
```

### 5.3 用户可见行为

| 入口 | 行为 |
|------|------|
| 文件选择器 | 筛选条件包含 `.scad` |
| 拖放 `.scad` 文件 | 自动识别格式，编译后显示 |
| `loadModel` 命令 | `{ url: "https://.../model.scad" }` 正常加载 |

### 5.4 对比 `.step`

| 格式 | 转换引擎 | WASM 来源 | 中间格式 | 渲染 |
|------|---------|----------|---------|------|
| `.step` | `occt-import-js.wasm` | 本地 `/wasm/` | GLB | 现有 GLB 管线 |
| `.scad` | `openscad-wasm` | CDN | STL | 现有 STL 管线 |

## 6. Phase 2: `generateScadModel` 命令 (Skill 接口)

在 Phase 1 基础上，为 Skill 提供直接发送 SCAD 代码字符串的接口。

### 6.1 命令定义

```json
{
  "command": "generateScadModel",
  "params": {
    "code": "difference() { cube([10,20,30], center=true); cylinder(r=5, h=35, center=true); }",
    "name": "my-part",
    "mode": "replace"
  }
}
```

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `code` | string | **是** | — | OpenSCAD 源代码 |
| `name` | string | 否 | `"generated-model"` | 场景树显示名称 |
| `mode` | `"replace"` \| `"append"` | 否 | `"replace"` | 与 `loadModel` 一致 |

### 6.2 命令处理（main.tsx）

```typescript
case 'generateScadModel': {
  // 1. 调 scadToStl(code) — 与 Phase 1 共用核心引擎
  // 2. loadFormat(stlBuffer, 'stl')
  // 3. addLoadedFile(...)
  // 4. 返回 { fileId, fileName, format: 'stl', triangleCount, renderMs }
}
```

内部完全复用 `scadToStl()` + 现有 STL 管线，与 `loadModel` 加载 `.scad` 文件走同一个代码路径，仅输入来源不同（字符串 vs 文件）。

### 6.3 与 `executeCode` 无关

`executeCode` 是 AI 在页面上画 UI。`generateScadModel` 是 AI 往场景里加 3D 模型。两者职责完全不同。

## 7. 性能

以下数据来自 `webmcp-openscad` 实测（相同架构）：

| 场景 | 耗时 |
|------|------|
| 首次编译（冷启动） | ~3-8s（CDN 下载 15MB + WASM 实例化 + 编译） |
| 第二次及后续 | ~400-800ms（JS/WASM 缓存命中，仅重新实例化） |
| 中等模型 | ~1-3s |
| 复杂模型 | ~3-30s |

- JS/WASM 文件浏览器 HTTP 缓存，不需重复下载
- 每次编译重新实例化 WASM ~400-800ms（`callMain` 单次的代价）
- Worker 内编译，主线程不阻塞，UI 保持 60fps
- Worker terminate 后内存完全释放（+200-400MB → 0）

## 8. 错误处理

| 场景 | 处理 |
|------|------|
| CDN 不可达 | Worker `import()` 失败 → `"Failed to load OpenSCAD engine from CDN"` |
| SCAD 语法/编译错误 | `callMain` 非零退出 + stderr → `"OpenSCAD exited with code N: ..."` |
| 编译超时 | 60s → Worker terminate → `"OpenSCAD compilation timed out"` |
| 生成空模型 | `triangleCount === 0` → `"Generated model contains no geometry"` |
| WASM OOM | Worker error event → `"OpenSCAD ran out of memory"` |

## 9. 典型使用场景

### Phase 1: 用户加载 `.scad` 文件
```
用户拖放 model.scad → 自动编译 → 3D 场景显示
```

### Phase 2: Skill AI 建模
```
用户: "生成一个 M8×40 的内六角螺栓"
Skill: 生成 SCAD 代码 → generateScadModel → 模型显示
```

### 多零件装配（Phase 2 append 模式）
```
generateScadModel(housing, mode='replace')
generateScadModel(gear1,  mode='append')
generateScadModel(gear2,  mode='append')
// 所有零件共存，可独立选择/高亮/隐藏
```

## 10. 未来扩展

- **Phase 2 命令族**: `generateCadQueryModel`、`generateJscadModel` 等
- **3MF 输出**: `-o output.3mf`（带颜色/单位/多零件）
- **MCAD 库**: Worker 内加载标准件库，`use <MCAD/gears.scad>`
- **PNG 预览**: 编译前出缩略图

## 11. 实现计划

### Phase 1: SCAD 文件格式

1. 注册 `.scad` 到 `file-formats.ts`
2. 在 `formatLoaders.ts` 添加 `case 'scad'`
3. 实现 `lib/scad-converter/`（protocol + worker + client + index）
4. 单元测试 + E2E 测试
5. 验证：拖放 `.scad` 文件 → 编译 → 显示

### Phase 2: Skill 接口

1. 在 `main.tsx` 添加 `case 'generateScadModel'`
2. MCP server 添加 `generate_scad_model` 工具
3. E2E 测试：postMessage 发送 SCAD 代码 → 模型显示

### 验证

1. `npm run lint` + `npm run build`
2. `npx vitest run` — 单元测试
3. `node test/e2e/test-generateScadModel.mjs` — E2E

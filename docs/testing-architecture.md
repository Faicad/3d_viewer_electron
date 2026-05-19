# 测试架构设计与改进计划

## 1. 测试金字塔与本项目映射

### 1.1 概念定义

| 层级 | 概念 | 本项目中含义 | 运行环境 | 运行工具 | 速度 |
|------|------|-------------|----------|----------|------|
| **单元测试** | 测试单个函数/模块的纯逻辑，无外部依赖 | 测试 stores、lib 中的纯函数、config 数据处理 | Node（无 DOM） | Vitest | 毫秒级 |
| **组件测试** | 测试 React 组件渲染与交互，模拟 DOM | 用 jsdom 测试 UI 组件（按钮点击、状态变化、条件渲染） | Node + jsdom | Vitest + @testing-library/react | 秒级 |
| **集成测试** | 测试多个模块协作，不含完整 Electron 窗口 | 测试 STEP→GLB 转换管线、Three.js loader 加载真实文件、IndexedDB 缓存 | Node（可能需要 Web Worker/WASM mock） | Vitest | 秒~十秒级 |
| **E2E 测试** | 完整 Electron 窗口 + 真实渲染管线 | Playwright 启动打包后的 Electron，加载模型文件，操作 UI | 真实 Electron 窗口 | Playwright | 分钟级 |

### 1.2 成本递减原则

```
能 Pure Logic 测的 → 不走 jsdom
能 jsdom 测的     → 不走 Electron
能 Electron 测的   → 才走 Playwright
```

**核心目标：把耗时的 Playwright 测试数量压到最低，只保留真正需要完整 Electron 窗口的测试。**

---

## 2. 当前测试现状

### 2.1 文件清单

#### Vitest 单元测试（2 个文件，~200 行）

| 文件 | 测试内容 | 行数 |
|------|---------|------|
| `src/renderer/lib/step-converter/stepCache.test.ts` | memCache（Map）CRUD、IndexedDB（fake-indexeddb）存取、双层缓存一致性 | 204 |
| `src/renderer/lib/topology/parse-glb-topology.test.ts` | GLB 二进制解析、拓扑 bundle 提取、SelectorRuntime 构建、faceRuns/edge 代理数据验证 | 131 |

#### Playwright E2E 测试（6 个文件，全部在 `src/test/`）

| 文件 | 测试内容 | 耗时（估） | 问题 |
|------|---------|-----------|------|
| `src/test/app.spec.ts` | 启动 app、canvas 渲染、加载 GLB 文件 | ~25s | 烟雾测试，可精简 |
| `src/test/file-list.spec.ts` | 文件列表面板、IPC 读目录、空状态文案 | ~15s | 大部分可用 jsdom 测 |
| `src/test/layout-widths.spec.ts` | DesktopLayout 面板宽度百分比（15:70:15） | ~25s | **纯 UI 布局验证**，可用 jsdom |
| `src/test/scene-tree.spec.ts` | 场景树展开/折叠、眼睛图标显示/隐藏 | ~35s | **组件交互**，大部分可用 jsdom |
| `src/test/step-loading.spec.ts` | STEP 转换全流程（含 WASM）、拓扑验证、缓存命中 | ~90s | 核心流程，暂不可替代 |
| `src/test/format-loading.spec.ts` | 21 种格式加载（全部 skip） | ~8min（全跑） | 全 skip，等于没有 |

#### 独立集成测试（1 个文件，未接入 CI）

| 文件 | 测试内容 | 问题 |
|------|---------|------|
| `src/renderer/lib/step-converter/__tests__/conversion.test.mjs` | STEP→GLB 完整转换 + GLB 二进制验证 + 拓扑扩展验证 | 硬编码外部路径 `C:\git\CADQ\...`，未接入 CI，需手动执行 |

### 2.2 核心问题

1. **鼠标交互功能无测试**：缩放/旋转/平移逻辑在 `useTopologyPicking.ts`、`ViewportContainer.tsx` 中，完全没有覆盖。出错了测试不会报。
2. **format-loading 全部 skip**：21 种格式的加载测试形同虚设。
3. **大量纯逻辑代码无单测**：6 个 Zustand store、`GlbBuilder.ts`、`snap.ts`、`picking.ts`、`file-formats.ts` 等完全无测试。
4. **CI 流水线瓶颈在 Playwright**：每次 CI 必须 build:unpacked（~2 分钟）然后跑 Playwright（~3 分钟），vitest 步骤几乎瞬间完成（只有 2 个测试文件）。
5. **测试工具未使用**：已安装 `@testing-library/react`、`jsdom`，但从未使用过。
6. **conversion.test.mjs 未接入 CI**：独立的 STEP 转换集成测试依赖外部路径，无法在 CI 中运行。

---

## 3. 源代码可测试性分类

### 3.1 纯逻辑（可直接写 Vitest 单测，无需 DOM）

| 文件 | 内容 | 优先级 |
|------|------|--------|
| `src/renderer/lib/utils.ts` | `cn()` class 合并工具 | 低 |
| `src/renderer/config/file-formats.ts` | 29 种格式配置、`detectFormat()`、`getGroupAccept()` | **高** |
| `src/renderer/stores/model-store.ts` | 核心 store，`toggleNodeInTree()` 递归逻辑 | **高** |
| `src/renderer/stores/selection-store.ts` | 选择状态 | 中 |
| `src/renderer/stores/tool-store.ts` | 工具/选择模式 | 低 |
| `src/renderer/stores/ui-store.ts` | UI 面板切换、语言/主题 | 中 |
| `src/renderer/stores/engine-store.ts` | 引擎对象引用 | 低 |
| `src/renderer/lib/step-converter/GlbBuilder.ts` | GLB 二进制构建器（JSON+BIN chunk） | **高** |
| `src/renderer/lib/step-converter/stepToGlb.ts` | `buildGlbFromResult()` 构建最终 GLB buffer | **高** |
| `src/renderer/lib/step-converter/topologyExt.ts` | 拓扑扩展 JSON 构建 | 中 |
| `src/renderer/lib/topology/build-face-ids.ts` | 面 ID 数组构建 | 中 |
| `src/renderer/lib/topology/build-logical-points.ts` | 中点/中心点计算 | 中 |
| `src/renderer/lib/topology/snap.ts` | `findClosestPointPure()` 纯数学距离计算 | **高** |
| `src/renderer/lib/topology/picking.ts` | Raycaster 结果 → Reference 解析 | 中 |
| `src/renderer/lib/topology/types.ts` | 类型定义 | 低 |
| `src/renderer/lib/step-converter/stepToGlbCached.ts` | `cacheKey()` 构建逻辑 | 中 |

### 3.2 需要 jsdom 的组件测试（React Testing Library）

| 文件 | 可测内容 | 优先级 |
|------|---------|--------|
| `src/renderer/components/FileListPanel.tsx` | 文件列表渲染、排序切换、空状态、点击加载 | **高** |
| `src/renderer/components/CacheManager.tsx` | 缓存管理对话框 | 中 |
| `src/renderer/components/OpenFileDialog.tsx` | 打开文件对话框 | 中 |
| `src/renderer/components/ErrorBoundary.tsx` | 错误边界渲染 | 低 |
| `src/renderer/components/settings/SettingsDialog.tsx` | 设置对话框主题/语言切换 | 低 |
| `src/renderer/components/ui/*.tsx` | shadcn UI 基础组件 | 低（第三方库） |
| `src/renderer/pages/WorkspacePage.tsx` | 上传区域、拖拽、粘贴 | 中 |
| `src/renderer/hooks/useFileUpload.ts` | 文件上传逻辑 | 中 |

### 3.3 需要真实 Electron + Playwright

| 场景 | 原因 | 当前覆盖 |
|------|------|---------|
| Three.js Canvas 渲染 | 需要真实 WebGL 上下文 | `app.spec.ts` |
| R3F Canvas 内组件（ModelGroup、TopologyOverlay） | 需要在 Canvas 内渲染 | 无 |
| 鼠标交互（旋转/缩放/平移） | 需要真实 WebGL + OrbitControls | **无** |
| STEP WASM 转换 + Electron IPC | 需要真实窗口的 script 注入 + IPC | `step-loading.spec.ts` |
| 模型加载后场景树更新 | 依赖完整渲染管线 | `scene-tree.spec.ts` |
| 格式加载（非 GLB/STEP） | 需要真实 Three.js loader | `format-loading.spec.ts`（全 skip） |
| 面板布局 | 需要真实窗口 resize 和 CSS 计算 | `layout-widths.spec.ts` |

---

## 4. 改进计划

### 4.1 配置调整

#### 4.1.1 拆分配置

将统一的 CI 脚本拆分为可独立执行的步骤，让开发者能快速运行特定层级的测试：

```bash
# package.json scripts
"test:unit"       → vitest run                        # 毫秒~秒级
"test:components" → vitest run --config vitest.jsdom.config.ts  # 秒级
"test:integration"→ vitest run --config vitest.integration.config.ts  # 十秒级
"test:e2e"        → playwright test                   # 分钟级
"ci"              → scripts/ci.sh  (完整流水线)
```

#### 4.1.2 Vitest 多环境配置

```ts
// vitest.config.ts        — node 环境（纯逻辑单测 + 集成测试）
// vitest.jsdom.config.ts  — jsdom 环境（组件测试）
```

`vitest.config.ts` 的 `environment: 'node'` 保持不变，用于纯逻辑单测。
新增 `vitest.jsdom.config.ts` 设置 `environment: 'jsdom'` 用于组件测试。

#### 4.1.3 文件组织约定

```
src/
  renderer/
    lib/
      step-converter/
        stepCache.ts
        stepCache.test.ts        ← 与源文件同目录，vitest 自动发现
        GlbBuilder.ts
        GlbBuilder.test.ts       ← 新增
        ...
      topology/
        snap.ts
        snap.test.ts             ← 新增
        ...
    stores/
      model-store.ts
      model-store.test.ts        ← 新增
      ...
    components/
      __tests__/                  ← 组件测试集中放在 __tests__/
        FileListPanel.test.tsx
        ...
  test/                          ← 仅放 Playwright E2E 测试
    app.spec.ts
    step-loading.spec.ts
    model-interaction.spec.ts    ← 新增
```

### 4.2 分阶段实施

#### 第一阶段：补充纯逻辑单测（低成本，高收益）

优先级从上到下：

1. **`src/renderer/config/file-formats.test.ts`** — 测试 `detectFormat()`、`EXT_TO_FORMAT` 映射、`ALL_EXTENSIONS` 完备性、`getGroupAccept()` 分组正确性。覆盖 29 种格式的配置数据正确性。
2. **`src/renderer/stores/model-store.test.ts`** — 测试 `toggleNodeInTree()` 递归逻辑（展开/折叠/可见性）、`setGLBUrl` 旧 URL 回收、`setModelBuffer` buffer 切片、`reset` 清理。
3. **`src/renderer/lib/topology/snap.test.ts`** — 测试 `findClosestPointPure()` 在各种候选点分布下的最近点选择、优先级（vertex > edge-mid > face-center）。
4. **`src/renderer/lib/step-converter/GlbBuilder.test.ts`** — 测试构建最小 GLB（单 mesh、无拓扑扩展）、验证 magic/version/length/chunk 结构。
5. **`src/renderer/lib/step-converter/stepToGlb.test.ts`** — 用 mock 的 importResult 测试 `buildGlbFromResult()` 输出结构。
6. **`src/renderer/lib/topology/picking.test.ts`** — 测试 raycaster intersection → face/edge/vertex Reference 解析逻辑。
7. **`src/renderer/stores/selection-store.test.ts`** — hover/select/clear 状态转换。
8. **`src/renderer/stores/tool-store.test.ts`** — 变换模式与选择模式切换。
9. **`src/renderer/stores/ui-store.test.ts`** — 面板切换、语言/主题变更。

#### 第二阶段：组件测试（jsdom，中成本）

1. **`FileListPanel.test.tsx`** — 渲染空列表 → 显示空状态文案、渲染文件列表 → 显示文件名、排序切换、点击文件调用 `setModelBuffer` + 触发加载。
2. **`OpenFileDialog.test.tsx`** — 对话框开关、上传区域渲染。
3. **`SceneTree 组件测试`** — 树节点渲染、展开/折叠按钮点击、可见性切换。

> 组件测试需要 mock 以下依赖：
> - `electronAPI`（`window.electronAPI.readDirectory` 等）
> - `i18next`（`useTranslation`）
> - Three.js / R3F（如果组件内部引用了 Canvas 相关内容，则该组件不适合 jsdom 测试）

#### 第三阶段：集成测试（Vitest，不走 Electron）

1. **STEP 转换集成测试接入 CI**：现有 `conversion.test.mjs` 改成 vitest 兼容格式，使用项目自己的 fixture 文件（`src/test/fixtures/test-model.step`），用 `globalThis.occtimportjs` + WASM 做完整 STEP→GLB 转换，验证输出 GLB 二进制结构和拓扑扩展。
2. **索引缓存集成测试**：`stepToGlbCached` 的缓存命中/未命中流程（已有 `stepCache.test.ts` 覆盖了底层，需要补上层集成）。
3. **Loader 集成测试**（替代 format-loading.spec.ts 的大部分）：用 Vitest + jsdom + Three.js 直接加载 fixture 文件，验证 loader 不抛异常、返回正确的 Mesh/Line/Points 对象。

#### 第四阶段：Playwright E2E 精简（仅保留必须的）

**保留：**
- `app.spec.ts` — 烟雾测试（启动 + canvas 渲染），精简到 10 秒内
- `step-loading.spec.ts` — 核心 STEP 转换流程（目前不可替代）
- `model-interaction.spec.ts`（新增） — **鼠标旋转/缩放/平移回归测试**，这是当前最缺失的部分

**降级为组件/jsdom 测试后删除：**
- `layout-widths.spec.ts` → 用 jsdom + 固定 viewport 测面板宽度逻辑
- `file-list.spec.ts` 的 IPC/文件列表部分 → 用组件测试覆盖
- `scene-tree.spec.ts` 的展开/折叠/可见性 → 用组件测试覆盖

**改造 format-loading：**
- 将 21 种格式的加载测试拆分为：
  - Loader 纯函数测试（Vitest + Three.js，秒级）—— 验证每种 loader 能正常解析 fixture 文件
  - Playwright E2E（保留少数关键格式：STL、GLB、3MF、OBJ、FBX）验证完整渲染管线

### 4.3 鼠标交互测试方案

这是当前最大的测试盲区。OrbitControls 的缩放/旋转/平移是通过 mouse/touch 事件驱动的，纯逻辑难以测试。

**方案：Playwright E2E 专项测试**

```ts
// model-interaction.spec.ts
// 加载一个简单模型后：
test('鼠标左键拖拽旋转模型', async () => {
  // 1. 获取 canvas 中心点
  // 2. 记录初始 camera rotation
  // 3. mousedown → mousemove → mouseup 模拟旋转
  // 4. 验证 camera rotation 已改变
})

test('鼠标滚轮缩放', async () => {
  // 1. 记录初始 camera.position.length()
  // 2. 触发 wheel 事件
  // 3. 验证 camera distance 变化
})

test('鼠标右键拖拽平移', async () => {
  // 1. 记录初始 camera.position 或 target
  // 2. 右键 mousedown → mousemove → mouseup
  // 3. 验证 camera target 变化
})

test('OrbitControls 边界：缩放范围不超出限制', async () => { ... })
test('OrbitControls 边界：旋转不翻转', async () => { ... })
```

通过 `window.__r3f_dev` 或 store 读取 camera 状态来验证交互效果。

---

## 5. CI 流水线改造

### 5.1 当前流程（5 步串行）

```
tsc → lint → build:unpacked (~2min) → vitest (~2s) → playwright (~3min)
总耗时: ~5-6 分钟
```

### 5.2 改进后流程（并行 + 分层）

```
快速检查层（并行，~30s）:
  ├── tsc --noEmit
  ├── eslint
  ├── vitest run (单测)
  └── vitest run --config vitest.jsdom.config.ts (组件测试)

慢速层（快速检查通过后才跑）:
  ├── build:unpacked (~2min)
  ├── vitest run --config vitest.integration.config.ts (集成测试，需要构建产物)
  └── playwright test (~2min, 精简后)
总耗时: 快速层 30s + 慢速层 2min ≈ 2.5min
```

### 5.3 新增 CI 子命令

```bash
# 开发者本地快速验证（提交前）
pnpm run test:fast        # 仅跑单测 + 组件测试 + lint + tsc，不构建

# 完整 CI（提交后/PR）
pnpm run ci               # 全量
```

---

## 6. 测试覆盖率目标

| 层级 | 当前覆盖率 | 目标覆盖率 | 测试工具 |
|------|-----------|-----------|---------|
| 纯逻辑函数（lib/config/stores） | ~10% | **80%+** | Vitest (node) |
| React 组件 | 0% | **50%+** | Vitest (jsdom) + RTL |
| 核心集成管线（STEP转换、缓存、拓扑） | ~30% | **70%+** | Vitest (node) |
| E2E 关键路径 | ~40% | **覆盖核心 + 交互** | Playwright |
| 格式加载验证 | 0% (全skip) | **纯 loader 全覆盖** | Vitest + Three.js |

---

## 7. 总结

| 问题 | 解决方案 |
|------|---------|
| 鼠标交互无测试 | 新增 `model-interaction.spec.ts` Playwright 专项测试 |
| 纯逻辑无单测 | 补 stores、config、lib 单测（第一阶段，成本极低） |
| Playwright 太慢 | 大量测试降级为 jsdom/Vitest，E2E 精简到 4-5 个 spec |
| format-loading 全 skip | 拆分为 loader 纯函数测试（Vitest）+ 少量 E2E |
| CI 耗时 5-6 分钟 | 并行快速检查层 + 精简慢速层 → 2.5 分钟 |
| conversion.test.mjs 未接入 CI | 改写为 vitest 格式，用项目 fixture 文件 |

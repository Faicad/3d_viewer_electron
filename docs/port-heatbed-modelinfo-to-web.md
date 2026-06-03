# 热床控制显示 & 模型信息 — 移植到 ficad_web 的分析与设计

## 1. 背景与现状

### 1.1 ficad_web 不支持 SVG/DXF 格式

ficad_web 是一个纯 3D 建模/查看 Web 应用，**不支持 SVG、DXF 等 2D 矢量格式**。Electron 端存在大量 `!isSvgMode` 守卫（`DesktopLayout.tsx` 中 16 处），用于区分 2D 工作区与 3D 工作区，**移植时这些守卫均不应带入**。

此外 `src/config/file-formats.ts` 中 `svg` / `dxf` 的格式定义（`ALL_EXTENSIONS`、`ALL_ACCEPT` 等）在 ficad_web 中无实际业务流程支撑，建议一并清理以免混淆。

### 1.2 热床与模型信息移植现状

ficad_web 已移植了 3D 热床渲染引擎（`Heatbed.ts`、`types.ts`、`cameraFit.ts`、`SceneSetup.tsx`），但**缺失工具栏 UI 切换按钮**。模型信息功能**整体缺失**——无面板组件、无 store 状态、无工具栏按钮。

## 2. 热床控制显示

### 2.1 Electron 端现状

| 层面 | 详情 |
|------|------|
| **图标** | `LayoutGrid` (lucide-react) |
| **位置** | 工具栏中部（透视/正交按钮之后） |
| **行为** | `showHeatbed` toggle；模型加载时禁用；仅非 SVG 模式可见 |
| **样式** | `variant={showHeatbed ? 'secondary' : 'ghost'}` |
| **数据** | `engine-store.showHeatbed` / `setShowHeatbed()` |
| **i18n** | `toolbar.heatbed`: "切换热床" / "Toggle Heatbed" |

相关代码位置（Electron `DesktopLayout.tsx:909-926`）：

```tsx
{!isSvgMode && (
<Tooltip>
  <TooltipTrigger asChild>
    <Button
      variant={showHeatbed ? 'secondary' : 'ghost'}
      size="icon"
      disabled={!activeTool}
      onClick={() => setShowHeatbed(!showHeatbed)}
      aria-label={t('toolbar.heatbed')}
      data-testid="toolbar-heatbed"
    >
      <LayoutGrid className="h-4 w-4" />
    </Button>
  </TooltipTrigger>
  <TooltipContent>{t('toolbar.heatbed')}</TooltipContent>
</Tooltip>
)}
```

### 2.2 ficad_web 当前状态

- `engine-store.ts` 中已包含 `showHeatbed` / `setShowHeatbed` / `initShowHeatbed` / `bedSize` / `bedRawToMM` / `bambuPlateConfigs` / `selectedPlateId` — **完全可用**
- `SceneSetup.tsx` 中已根据 `showHeatbed` 创建热床 3D 对象 — **完全可用**
- `ViewportContainer.tsx` 中已调用 `autoSelectBedSize` / `initShowHeatbed` — **完全可用**
- **工具栏中无任何热床相关按钮** — `DesktopLayout.tsx` 中无 `LayoutGrid` 引用
- 国际化文件中缺少 `toolbar.heatbed` 键

### 2.3 移植设计

在 ficad_web `DesktopLayout.tsx` 工具栏 **「正交视图」按钮之后、「截面」按钮之前**（根据 Electron 布局顺序）插入热床切换按钮：

```tsx
// 1. 在 import 中添加 LayoutGrid
import { ..., LayoutGrid, ... } from 'lucide-react'

// 2. 获取 showHeatbed 状态
const showHeatbed = useEngineStore((s) => s.showHeatbed)
const setShowHeatbed = useEngineStore((s) => s.setShowHeatbed)
const activeTool = tool.activeToolId

// 3. 在正交视图按钮和截面按钮之间的位置插入
<Separator orientation="vertical" className="h-5 shrink-0" />

{/* Heatbed Toggle */}
<Tooltip>
  <TooltipTrigger asChild>
    <Button
      variant={showHeatbed ? 'secondary' : 'ghost'}
      size="icon"
      disabled={!activeTool}
      onClick={() => setShowHeatbed(!showHeatbed)}
      aria-label={t('toolbar.heatbed')}
      data-testid="toolbar-heatbed"
    >
      <LayoutGrid className="h-4 w-4" />
    </Button>
  </TooltipTrigger>
  <TooltipContent>{t('toolbar.heatbed')}</TooltipContent>
</Tooltip>
```

注意：Electron 中的 `!isSvgMode` 条件在 ficad_web 中不适用（不支持 SVG/DXF），无需此判断。

#### 国际化为 i18n 文件新增键

**`src/locales/zh.json`**:
```json
"toolbar.heatbed": "切换热床",
```

**`src/locales/en.json`**:
```json
"toolbar.heatbed": "Toggle Heatbed",
```

---

## 3. 模型信息

### 3.1 Electron 端现状

| 层面 | 详情 |
|------|------|
| **图标** | `Info` (lucide-react) |
| **位置** | 工具栏最右侧（全屏按钮之后、面板切换按钮之前） |
| **面板** | 右侧面板内，替换 `FileListPanel` |
| **行为** | toggle `modelInfoOpen`；无模型时禁用 |
| **数据** | `ui-store.modelInfoOpen` / `toggleModelInfo()` |
| **模型统计** | `compute-model-stats.ts` — 遍历 Three.js group 计算顶点/三角面/表面积/体积/包围盒/部件数 |
| **显示字段** | 顶点数、三角面数、表面积、体积、包围盒尺寸、部件数、文件格式、预估耗材(PLA) + Bambu 元数据 |
| **i18n** | `toolbar.modelInfo` + 11 个 `modelInfo.*` 键 |

### 3.2 ficad_web 当前状态

- `ui-store.ts` 中**无 `modelInfoOpen`** / `toggleModelInfo`
- 无 `ModelInfoPanel` 组件（底部状态栏已显示 `status.vertices` / `status.faces` / `status.material` 三个简单值）
- 无 `Info` 工具栏按钮
- 国际化**无** `toolbar.modelInfo` / `modelInfo.*` 键

#### 已存在的可用 Store 字段

| 字段 | 来源 | 用途 |
|------|------|------|
| `modelGroup: THREE.Group \| null` | `engine-store.ts` | 遍历计算模型统计 |
| `modelFormat: FormatId \| null` | `model-store.ts` | 显示文件格式 |
| `sourceUnit: UnitSystem` | `model-store.ts` | 单位换算、标签显示 |
| `fileGroup: FileGroup` | `model-store.ts` | 控制是否显示耗材估算 |
| `modelBuffer: ArrayBuffer \| null` | `model-store.ts` | 格式判断 |
| `loadedFiles: LoadedFileModel[]` | `model-store.ts` | 查找当前文件 |
| `activeFileId: string \| null` | `model-store.ts` | 定位 activeFile |
| `bambuMetadata?.modelMeta` | `loadedFiles[n]` | 3MF 元数据显示 |
| `stats: ModelStats \| null` | `model-store.ts`（简化版） | 现有顶点/面/耗材 |

#### 缺失的工具函数

| 函数 | Electron 位置 | 备注 |
|------|---------------|------|
| `computeModelStats(group)` | `compute-model-stats.ts` | 需移植（遍历 Three.js group 计算表面积/体积/包围盒等） |
| `sourceUnitToLabel(unit)` | `config/file-formats.ts` | 需移植（mm/cm/m/in 等 → 显示标签） |
| `computeMaterialCost(volume, unit)` | `compute-model-stats.ts` | 需移植（PLA 耗材估算） |

### 3.3 移植设计

#### 3.3.1 新增文件：`src/lib/compute-model-stats.ts`

完整移植 Electron 的 `compute-model-stats.ts`（159行，无外部依赖），导出：
- `ComputedModelStats` 接口
- `computeModelStats(group: THREE.Group)` — 遍历计算统计
- `formatNumber(n)` — 格式化数字
- `computeMaterialCost(volume, sourceUnit)` — 耗材计算

#### 3.3.2 新增文件：`src/components/panels/ModelInfoPanel.tsx`

移植 Electron 的 `ModelInfoPanel.tsx`（132行），适配 ficad_web：
- 使用 `useEngineStore((s) => s.modelGroup)` 获取 Three.js group
- 使用 `useUIStore((s) => s.toggleModelInfo)` 关闭面板
- 使用 `useModelStore` 获取 `modelFormat` / `sourceUnit` / `fileGroup` / `loadedFiles` / `activeFileId`
- 显示统计行：顶点数、三角面数、表面积、体积、包围盒尺寸、部件数、文件格式、预估耗材
- 显示 Bambu 3MF 元数据（designer、license、description）

> **适配注意**：
> - `modelFormat` / `sourceUnit` / `fileGroup` / `activeFile` 字段在 ficad_web `model-store.ts` 中**已存在**，直接使用
> - `sourceUnitToLabel()` 和 `computeMaterialCost()` 需从 Electron 移植到 ficad_web 的对应文件中
> - **面板定位**：ficad_web 无 `FileListPanel`，ModelInfoPanel 应做成**浮动 overlay 面板**（参考 `EnvironmentPanel` 的模式），贴靠右侧边缘并覆盖在 3D 视图之上，而非嵌入右侧侧边栏

##### 浮动面板定位方案

参考 `DesktopLayout.tsx` 中 `EnvironmentPanel` 的实现：

```tsx
{/* 参照 EnvironmentPanel 的 overlay 定位：absolute right-0 top-10 bottom-7 */}
{modelInfoOpen && (
  <div className="absolute right-0 top-10 bottom-7 w-72 z-40 border-l bg-background shadow-lg">
    <ModelInfoPanel />
  </div>
)}
```

`EnvironmentPanel` 位于 `DesktopLayout.tsx:790-794`：
```tsx
{environmentPanelOpen && (
  <div className="absolute right-0 top-10 bottom-7 w-72 z-40 border-l bg-background shadow-lg">
    <EnvironmentPanel onClose={toggleEnvironmentPanel} />
  </div>
)}
```

ModelInfoPanel 应遵循完全相同的模式：`absolute right-0 top-10 bottom-7 w-72 z-40 border-l bg-background shadow-lg`，从右侧滑出覆盖在 viewport 之上。

##### StatRow 组件样式

ficad_web 的 TailwindCSS 主题变量（`text-muted-foreground`, `border-border/50` 等）与 Electron 一致，直接复用。

##### 3MF 元数据段（panel 最下部）

Electron 的 `ModelInfoPanel.tsx:106-126` 在面板底部显示 Bambu 3MF 文件特有的元数据：

```
┌─ 模型元数据 ──────────────┐
│  (title)                    │  ← 无 label，直接显示
│  设计师: (designer)        │
│  许可证: (license)         │
│  (description)              │  ← 纯文本（stripHtml 去标签）
└─────────────────────────────┘
```

ficad_web 的 **底层数据已完整就绪**：
- `Bambu3mfMetadata.modelMeta`（`title` / `designer` / `description` / `license`）已在 `src/lib/bambu-3mf/bambu-3mf.ts:61-66` 定义并解析
- `LoadedFileModel.bambuMetadata` 已在 `model-store.ts:49` 定义
- `updateFileBambuMetadata` action 已在 `model-store.ts:158` 实现
- 已有 E2E 测试验证 `bambuMetadata.modelMeta` 在 store 中可访问（`bambu-3mf.test.ts:440-480`）

**仅需移植 `stripHtml()` 工具函数**（Electron `ModelInfoPanel.tsx:22-38`），用于将 3MF XML 中的 HTML 编码描述文本转为纯文本。该函数无外部依赖，可直接内联在 `ModelInfoPanel.tsx` 中或放在 `src/lib/bambu-3mf/` 下。

> ficad_web 的 `BambuModelMeta` 接口字段名与 Electron 版本完全一致，`ModelInfoPanel` 中的 bamboo 元数据渲染代码可直接移植。

#### 3.3.3 修改 `src/stores/ui-store.ts`

新增状态和方法：

```ts
// 接口新增
modelInfoOpen: boolean
toggleModelInfo: () => void

// 实现
modelInfoOpen: false,
toggleModelInfo: () => set((s) => ({ modelInfoOpen: !s.modelInfoOpen })),
```

#### 3.3.4 修改 `src/layouts/DesktopLayout.tsx`

工具栏添加 **模型信息按钮**（在全屏按钮之后、面板切换按钮之前）：

```tsx
// 1. import 添加
import { ..., Info, ... } from 'lucide-react'
import ModelInfoPanel from '@/components/panels/ModelInfoPanel'

// 2. 获取状态
const modelInfoOpen = useUIStore((s) => s.modelInfoOpen)
const toggleModelInfo = useUIStore((s) => s.toggleModelInfo)
const hasModel = model.modelBuffer !== null || model.loadedFiles.length > 0

// 3. 工具栏按钮（全屏按钮之后）
{/* Model Info */}
<Tooltip>
  <TooltipTrigger asChild>
    <Button
      variant={modelInfoOpen ? 'secondary' : 'ghost'}
      size="icon"
      disabled={!hasModel}
      onClick={toggleModelInfo}
      aria-label={t('toolbar.modelInfo')}
    >
      <Info className="h-4 w-4" />
    </Button>
  </TooltipTrigger>
  <TooltipContent>{t('toolbar.modelInfo')}</TooltipContent>
</Tooltip>
```

右侧面板维持 `ChatPanel` 不变，不需要修改右侧面板路由。

#### 3.3.5 国际化新增键

**`src/locales/zh.json`**:
```json
"toolbar.modelInfo": "模型信息",
"modelInfo.title": "模型信息",
"modelInfo.vertices": "顶点数",
"modelInfo.triangles": "三角面数",
"modelInfo.surfaceArea": "表面积",
"modelInfo.volume": "体积",
"modelInfo.dimensions": "包围盒尺寸",
"modelInfo.parts": "部件数",
"modelInfo.format": "文件格式",
"modelInfo.materialCost": "预估耗材",
"modelInfo.empty": "暂无模型信息",
"modelInfo.modelMetadata": "模型元数据",
"modelInfo.designer": "设计师",
"modelInfo.license": "许可证",
```

**`src/locales/en.json`**:
```json
"toolbar.modelInfo": "Model Info",
"modelInfo.title": "Model Info",
"modelInfo.vertices": "Vertices",
"modelInfo.triangles": "Triangles",
"modelInfo.surfaceArea": "Surface Area",
"modelInfo.volume": "Volume",
"modelInfo.dimensions": "Dimensions",
"modelInfo.parts": "Parts",
"modelInfo.format": "File Format",
"modelInfo.materialCost": "Est. Material",
"modelInfo.empty": "No model info",
"modelInfo.modelMetadata": "Model Metadata",
"modelInfo.designer": "Designer",
"modelInfo.license": "License",
```

---

## 4. 实现计划

| 步骤 | 内容 | 文件 |
|------|------|------|
| 1 | 国际化新增键 | `src/locales/zh.json`, `src/locales/en.json` |
| 2 | ui-store 新增 `modelInfoOpen` / `toggleModelInfo` | `src/stores/ui-store.ts` |
| 3 | 移植 `compute-model-stats.ts`（含 `sourceUnitToLabel`） | **新文件** `src/lib/compute-model-stats.ts` |
| 4 | 移植 `ModelInfoPanel.tsx`（浮动 overlay 面板） | **新文件** `src/components/panels/ModelInfoPanel.tsx` |
| 5 | 工具栏插入热床按钮 | `src/layouts/DesktopLayout.tsx` |
| 6 | 工具栏插入模型信息按钮 + 浮动面板渲染 | `src/layouts/DesktopLayout.tsx` |
| — | 清理 ficad_web 中无用的 SVG/DXF 配置 | `src/config/file-formats.ts` |

---

## 5. 风险与注意事项

1. **model-store 字段已就绪** — `modelFormat` / `sourceUnit` / `fileGroup` / `loadedFiles` / `activeFileId` 在 ficad_web 中**均已存在**，直接复用即可
2. **`sourceUnitToLabel` 需移植** — Electron 的 `src/renderer/config/file-formats.ts:591` 中的 `sourceUnitToLabel()` 需一同移植到 ficad_web
3. **浮动面板无冲突** — 采用 `EnvironmentPanel` 的 overlay 模式，不与 `ChatPanel` 竞争右侧面板区域
4. **`StatRow` 组件样式兼容** — ficad_web 的 TailwindCSS 主题变量与 Electron 一致
5. **`compute-model-stats.ts` 定位问题** — Electron 中通过 `modelGroup` (Three.js Group) 实时遍历计算，ficad_web 已有 `engine-store.modelGroup`，逻辑直接移植即可。注意 ficad_web 现有的 `model-store.stats` 是简化版（`{vertices, faces, volume, materialCost}`），移植后可选择增强 store 的统计字段或让 ModelInfoPanel 独立计算

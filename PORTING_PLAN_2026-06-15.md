# 移植计划: 3d_viewer_web → 3d_viewer_electron

基准提交: `563b5f0b` (3d_viewer_web)
当前 HEAD: `cb6a44e`

## 变更概览

从基准提交到 HEAD，3d_viewer_web 共有 **25 个提交**，涉及：

| 类别 | 说明 | 文件数 |
|------|------|--------|
| **A. 核心渲染逻辑** | movie_mode、cameraFit bugfix、controlsEnabled、Zap 图标 | 6 |
| **B. 影片制作管线 (movies/)** | 全新目录，Playwright 录制 + FFmpeg + TTS | 16 |
| **C. E2E 测试增强** | 超时、--no-sandbox、server.close 修复 | 2 |
| **D. 文档** | embed-guide.md、embed-short-term-plan.md 更新 | 2 |

---

## A. 核心渲染逻辑（src/renderer/）

本组变更直接修改了 React 渲染层，需要移植到 Electron renderer process。

### A1. cameraFit.ts — 相机距离公式 bugfix

**变更**: `3349a60` `9843123`

文件: `src/renderer/engine/heatbed/cameraFit.ts`（两个项目位置相同）

| 项目 | 行 134 | 说明 |
|------|--------|------|
| web (已修) | `viewport.height / (2 * zoom * Math.tan(fovRad / 2))` | THREE.js fov = 垂直视场角 |
| electron (待修) | `viewport.width / (2 * zoom * Math.tan(fovRad / 2))` | 使用了水平宽度的旧公式 |

**注意**: 注释也要同步。web 项目将 OrcaSlicer 相关的注释替换为 THREE.js fov 解释。

**操作**: 替换 `viewport.width` → `viewport.height`，同步更新上方注释。

---

### A2. engine-store.ts — 新增 movieMode / controlsEnabled

文件: `src/renderer/stores/engine-store.ts`

新增的 store 字段:

```typescript
movieMode: boolean
setMovieMode: (v: boolean) => void
controlsEnabled: boolean
setControlsEnabled: (v: boolean) => void
```

初始值: `movieMode: false`, `controlsEnabled: true`

**操作**: 在 Electron 的 engine-store 中相应位置（`AutoRotate` 块之后）添加这些字段。

---

### A3. App.tsx — movie_mode URL 参数解析

**变更**: `69c360b` `020179b`

web 项目在 `App.tsx` 的 `useEffect` 中解析 `movie_mode=1` 并调用 `setMovieMode(true)` 和 `setControlsEnabled(false)`。

Electron 当前 `App.tsx` 是纯空壳（只有路由），**没有 URL 参数解析代码**。原因是 Electron 通过 `faicad-viewer://` 自定义协议接收参数，而非 hash URL。

**处理方法**:
- 选项一：在 Electron 的 `electron/main/index.ts` 启动窗口时解析 `movie_mode` 参数，通过 IPC 传递给 renderer
- 选项二：在 Electron 的 `App.tsx` 中读取 `window.location` 参数（仍可通过 hash URL 传递）
- **推荐**: 参照 `electron/main/index.ts` 中 window 创建逻辑，在 URL 参数中提取 `movie_mode`，通过 preload `electronAPI` 传递给 renderer，renderer 在 `App.tsx` 或 `main.tsx` 中消费

**同时移除** `embed=1` 参数中的 `setHeaderVisible(false)` 调用（`020179b`）。检查 Electron 的 App.tsx 是否有类似逻辑。

---

### A4. ViewportContainer.tsx — OrbitControls + controlsEnabled

**变更**: `69c360b`

在 `OrbitControls` 的 `enabled` 条件末尾加上 `&& controlsEnabled`:

```tsx
enabled={activeToolMode === 'view' && !isCameraAnimating && !isObjectDragging && !rotating && controlsEnabled}
```

同时从 store 读取 `controlsEnabled`:

```tsx
const controlsEnabled = useEngineStore((s) => s.controlsEnabled)
```

**操作**: 在 Electron 的 ViewportContainer.tsx 中同步这两处变更。

---

### A5. DesktopLayout.tsx — 动画按钮隐藏 + Zap 图标

**变更**: `74c4080`（三个子变更）

1. **动画按钮显示条件**: `{!isSvgMode && hasAnimations}`（原为 `{!isSvgMode}`，仅 `disabled`）
2. **移除 `disabled={!hasAnimations}`** 属性
3. **爆炸图标**: `Bomb` → `Zap`

Electron 当前:
- 动画按钮: `{!isSvgMode && ...}` + `disabled={!hasAnimations}` (行 973-991)
- 爆炸图标: `<Bomb .../>` (行 1006)

**操作**: 同步三处变更。

**Electron 差异**: Electron 的爆炸按钮点击调用 `window.__demoGSAPExplode?.()`，web 项目使用 store 直接调用。这**不需要修改**——web 项目该处的变更仅涉及图标，不涉及点击逻辑。

---

### A6. main.tsx — __animateCamera / hideDemoPanelIfMovieMode / animateCamera 命令 / SSE 跳过

**变更**: `0cb1983` `bb608d3` `bd7cc4a` `19b87fc`

Electron 的 `main.tsx` 与 web 差异较大，需单独处理：

#### A6a. hideDemoPanelIfMovieMode（`bd7cc4a`）

在 `__demoGSAPRotate` / `__demoGSAPAssemble` / `__demoGSAPExplode` 的回调末尾调用 `hideDemoPanelIfMovieMode()`。

函数定义:
```typescript
function hideDemoPanelIfMovieMode() {
  if (useEngineStore.getState().movieMode) {
    const panel = document.getElementById('gsap-panel')
    if (panel) {
      panel.style.opacity = '0'
      panel.style.background = 'rgba(13,13,26,0)'
    }
  }
}
```

Electron 的 `main.tsx` 已有这三个 demo 函数（行 48-65）。在末尾追加调用。

#### A6b. __animateCamera（`0cb1983`）

GSAP proxy 模式的相机动画。Electron 需要:

1. 在 `window.__demoGSAPExplode` 之后插入 `window.__animateCamera` 定义（GSAP proxy pattern，与 web 一致）
2. 在 `executeCommand` 的 `switch` 中添加 `case 'animateCamera'` case

Electron 的 `executeCommand` 已有 `setCameraPosition` 和 `resetCamera`，在 `resetCamera` 之后插入 `animateCamera`。

#### A6c. SSE 跳过（`19b87fc`）

**Electron 没有 SSE 代码**（使用 IPC 替代）。此变更不适用于 Electron。

Electron 的 IPC listener（行 634-648）不受 `movie_mode` 影响，也不需要跳过——Electron 通过 `window.electronAPI.onAIAction` 接收命令，与 SSE 无关。

**注意**: 如果你计划让 Electron 也支持 `movie_mode=1` 时禁用 IPC 处理，需要额外设计。但本组变更不涉及，原 SSE skip 逻辑在 Electron 中无对应代码。

---

### A7. window.d.ts — __animateCamera 类型声明

**变更**: `0cb1983`

新增:
```typescript
__animateCamera: (opts: { to?: { x: number; y: number; z: number }; factor?: number; duration?: number }) => Promise<void>
```

**操作**: 在 Electron 的 `window.d.ts` 中相应位置添加。Electron 已有 `__gsap` 和 `__THREE` 声明，紧挨它们插入。

---

## B. 影片制作管线 (movies/)

**全新目录**，Electron 中不存在。

### 文件清单

```
movies/
├── .gitignore
├── SKILL.md                          — 影片制作工作流文档
├── lib.mjs                           — Playwright 录制 + FFmpeg 渲染核心库
├── burn.mjs                          — 单文件烧录（字幕 + 音频）
├── mergeVideo.mjs                    — 多片段合并
├── generateAudio.mjs                 — ASS 字幕 → edge-tts 配音
├── p1/
│   ├── README.md                     — p1 项目说明
│   ├── m1.mjs / m1_old.mjs          — 录制脚本 (Anisotropy + 金色材质)
│   ├── m2.mjs                        — 录制脚本 (HDR + auto-rotate)
│   ├── m3.mjs                        — 录制脚本 (GSAP explode + animation)
│   ├── m1.ass / m2.ass / m1m2.ass   — ASS 字幕文件
│   └── m1m2_merge.json               — 合并配置
├── record-movie.mjs                  ← 删除（旧版被 lib.mjs + makeMovie 替代）
└── video-recording-notes.md          ← 删除（旧版被 SKILL.md 替代）
```

### 移植决策

| 文件 | 移植方式 | 理由 |
|------|---------|------|
| `lib.mjs` | **复制** | 核心库，不依赖 web 项目特有代码 |
| `burn.mjs` | **复制** | 通用工具 |
| `mergeVideo.mjs` | **复制** | 通用工具 |
| `generateAudio.mjs` | **复制** | 通用工具 |
| `p1/` 所有文件 | **调整后复制** | 录制脚本中的模型路径需映射到 Electron 的 fixture 目录 |
| `SKILL.md` | **复制** | 项目文档 |
| `.gitignore` | **复制或追加** | 忽略 gen/、_frames/ 等目录 |
| `record-movie.mjs` | **不移植** | 已被删除 |
| `video-recording-notes.md` | **不移植** | 已被删除 |

### 路径映射

web 项目中的模型路径:
- `movies/Car.glb` → Electron 中的 `src/test/fixtures/Car.glb`（或 copy 到 movies/）
- `src/test/fixtures/box_boss.glb` → Electron 的 `src/test/fixtures/box_boss.glb`（已存在）

`lib.mjs` 中的 `rootDir` 指向项目根，在 Electron 中自动适用。`distDir` 指向 `dist/`，Electron 的 build 输出在 `out/renderer/`，需要调整:

```typescript
// Electron 版 lib.mjs 需要修改:
export const distDir = join(rootDir, 'out', 'renderer')  // 而非 'dist'
```

### 依赖检查

`lib.mjs` 依赖: `playwright`（Electron devDependencies 中可能已有，需要确认）、`ffmpeg`（需系统安装）。

`generateAudio.mjs` 依赖: `edge-tts`（Python CLI 工具）、`ffprobe`、`ffmpeg`。

---

## C. E2E 测试增强

**变更**: `cb6a44e` `72da9cd`

### C1. test-sse-bridge.mjs

- `postCommand` 增加超时参数（`timeout = 35000`）
- Chromium launch 添加 `--no-sandbox --disable-setuid-sandbox` 参数

**Electron 项目没有 `test/e2e/test-sse-bridge.mjs`**。Electron 的 E2E 测试在 `src/test/` 下，使用 Playwright 直接启动 Electron app，而非针对静态 web server。

**处理方法**: 如果 Electron 项目将来添加独立 SSE bridge 测试，再应用此变更。目前不需要移植。

如果 Electron 的 Playwright 配置也未配置 `--no-sandbox`，可以在 `playwright.config.ts` 中为 chromium launch 添加该参数。

### C2. test-postmessage.mjs

- `server.close()` → `new Promise(resolve => server.close(resolve))`

同上，Electron 没有此文件。不移植。

---

## D. 文档

### D1. docs/embed-guide.md + docs/embed-short-term-plan.md

轻微更新（8 行 diff / 9 行 diff）。内容涉及 `movie_mode` 参数说明和 embed 参数变更记录。

**操作**: 如果 Electron 项目维护了相同的 embed 文档，同步更新。否则忽略。

### D2. movies/SKILL.md（新文档）

影片制作流程文档。随 movies/ 目录一起移植。

---

## 移植顺序建议

### Phase 1: 核心渲染逻辑（高风险，影响所有用户）

1. `engine-store.ts` — 添加 movieMode / controlsEnabled
2. `cameraFit.ts` — viewport.width → viewport.height（bugfix）
3. `window.d.ts` — 添加 `__animateCamera` 类型
4. `main.tsx` — 添加 `__animateCamera`、`hideDemoPanelIfMovieMode`、`animateCamera` 命令
5. `App.tsx` — 解析 movie_mode 参数（注意 Electron 的差异）
6. `DesktopLayout.tsx` — 动画按钮条件 + Zap 图标
7. `ViewportContainer.tsx` — OrbitControls + controlsEnabled

**验证**: `npm run build && npm run lint`

### Phase 2: movies/ 管线（独立，不影响用户）

1. 复制 `movies/` 目录
2. 修改 `lib.mjs` 中 `distDir` 指向 `out/renderer/`
3. 确认模型路径映射
4. 验证录制流程: `node movies/p1/m1.mjs`

### Phase 3: 测试与文档

1. 检查 Electron CI 是否需要 `--no-sandbox`（参照 `playwright.config.ts`）
2. 同步 embed 文档

---

## 附录: web ↔ electron 关键文件对照

| web 项目 | electron 项目 | 备注 |
|----------|--------------|------|
| `src/renderer/main.tsx` | 同路径 | 最大差异处(SSE vs IPC) |
| `src/renderer/App.tsx` | 同路径 | Electron 更简洁(无参数解析) |
| `src/renderer/stores/engine-store.ts` | 同路径 | 高度相似 |
| `src/renderer/layouts/DesktopLayout.tsx` | 同路径 | 高度相似 |
| `src/renderer/components/viewport/ViewportContainer.tsx` | 同路径 | 高度相似 |
| `src/renderer/engine/heatbed/cameraFit.ts` | 同路径 | 完全一致 |
| `src/renderer/types/window.d.ts` | 同路径 | 高度相似 |
| `test/e2e/test-sse-bridge.mjs` | 无对应文件 | Electron 用 IPC |
| `test/e2e/test-postmessage.mjs` | 无对应文件 | Electron 用 Playwright |
| `movies/` | 无 | 新移植 |

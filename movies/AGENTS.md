# Movies Skill — Agent Reference

> `movies/` is a nearly independent video-generation module. Its only link to the parent project is the 3D viewer dev server (port 4173) needed for **Path A** (Playwright recording of Three.js scenes).

## Five Video Generation Paths

| Path | Method | Entry Script | When to Use |
|------|--------|-------------|-------------|
| **A** | Playwright 录制 3D 场景 | `<script>.mjs` (via `lib.mjs makeMovie()`) | 有 3D 模型，需要 Three.js 动画 |
| **B** | FFmpeg 截图合成 | `generate-image-video.mjs` | 多张静态截图，不需要动画 |
| **C** | 手写 scene 函数 | `generate-html-video.mjs` | 需要自定义 HTML/GSAP 动画 |
| **D1** | URL → AI Agent → html-composer | `generate-url-video.mjs` | 网页源视频，html-composer 预制动画 |
| **D2** | 本地截图 → easyocr → html-composer | `generate-image2-video.mjs` | 本地截图，html-composer 预制动画 |

All paths produce `gen/{name}.subtitle` + `gen/{name}.mp3` + `gen/{name}_{h|v}.webm`, then burn → `_burn_{h|v}.mp4`.

## Key Scripts

| Script | Role |
|--------|------|
| `lib.mjs` | Path A 脚手架：`makeMovie`, `startRecording`, `burnVideo`, `waitForModel`, `captureCover`, `syncpoint` |
| `lib_gen_url_image.mjs` | Path D1/D2 共享流程：TTS/字幕/html-composer/Playwright 录制/ffmpeg/burn |
| `burn.mjs` | 烧录字幕 + 音频 + bgm → `_burn_{h|v}.mp4` |
| `mergeVideo.mjs` | 多片段拼接 + 封面 + 烧录 → `merged_{h|v}.mp4` |
| `generate-subtitle.mjs` | `.mjs` → TTS 逐行实测 → `.subtitle` + `.mp3` |
| `pregen-tts.mjs` | TTS 预生成（仅生成缓存，供录制 syncpoint 使用） |
| `generate-image-video.mjs` | Path B 入口 |
| `generate-html-video.mjs` | Path C 入口 |
| `generate-url-video.mjs` | Path D1 入口 |
| `generate-image2-video.mjs` | Path D2 入口 |
| `html-composer.mjs` | 预制动画渲染（caption / click-highlight / highlight-area） |
| `easyocr-mark.mjs` + `.py` | easyocr 定位文字 + 写 marks.json |
| `cover.mjs` (per project) | 封面文字叠加模板（见 `e1/cover.mjs`） |

## Workflow

### TTS Providers

| Provider | Command | Requires |
|----------|---------|----------|
| edge-tts (default) | `node ...` | `pip install edge-tts` |
| Spark-TTS | `node ... --tts spark-tts` | `pip install spark-tts`, `.env` SPARKTTS_VOICE |

### Project Directory Convention

Each project is a subdirectory under `movies/` (e.g., `p1/`, `e1/`, `e2/`). Source files only; generated files go into `gen/` (gitignored).

### Script Template (Path A)

参考设计文档：[syncpoint-design](./docs/syncpoint-design.md) · [subtitle-syntax](./docs/subtitle-syntax.md) 

```js
import * as lib from '../lib-electron.mjs'

const subtitle = `
第一段完整台词
--1--
第二段台词
`;

lib.makeMovie(
  import.meta.url,
  '/absolute/path/to/model.glb',
  { AutoRotate: '0', entryAnim: 'zoom', entryDuration: '2000' },
  async (page, suffix, tPageOpen) => {
    // startRecording 已由 lib.makeMovie 自动完成
    // 模型已加载，直接编写动画

    // 第一段字幕对应的动画
    await lib.rotateModel(page, 360, 3000)
    await lib.syncpoint(page)           // ← 对应字幕中的 --1--

    // 第二段字幕对应的动画
    await lib.animateCamera(page, { rotate: 'y', angle: -90, duration: 3000 })
    await page.waitForTimeout(1500)
  },
)
```

### Path A 函数清单（`lib-electron.mjs`）

所有函数同时从 `../lib-electron.mjs` 导出。参数中 `'h;v'` 表示支持横竖屏方向语法（`;` 前为横屏值，后为竖屏值）。

#### 录制入口

| 函数 | 简介 |
|------|------|
| `makeMovie(scriptUrl, modelPath, viewerParams, pageFn, outputDir)` | 录制入口：TTS 预生成 → 启动 Electron → 录制各方向 → FFmpeg 裁剪 |
| `startRecording(page, tPageOpen, entryDuration)` | 标准开场：zoomUI → 等待模型加载 → 入场动画等待（由 `makeMovie` 自动调用，用户 pageFn 中无需重复调用） |
| `syncpoint(page)` | 记录字幕同步点；若 TTS timing 已注入，自动等待当前组 TTS 播完；偏差 >1s 打印双向诊断（详见 [syncpoint-design](./docs/syncpoint-design.md) · [subtitle-syntax](./docs/subtitle-syntax.md)） |
| `captureCover(page)` | 截图保存为封面（自动命名 `{project}_cover_{h\|v}.png`） |
| `recordOne(electronApp, page, viewport, suffix, pageFn, recordDir, entryDuration, modelPath, ttsTiming, viewerParams)` | 录制单个方向的完整流程 |

#### 模型加载/卸载

| 函数 | 简介 |
|------|------|
| `loadModel(page, modelPath, opts, timeout)` | 清除场景并加载新模型（支持 entryAnim 入场动画参数） |
| `unloadModel(page, target, opts)` | 卸载模型（支持按文件路径单个卸载或全部清除，带淡出动画） |
| `waitForModel(page)` | 等待模型加载完成（轮询 store 的 loadingPhase 字段） |
| `exportModel(page, format)` | 导出当前场景为 GLB 或 STL，返回 base64 |
| `saveExportedModel(page, format, outPath)` | 导出模型并直接保存到磁盘文件 |

#### 模型动画（GSAP）

| 函数 | 简介 |
|------|------|
| `translateModel(page, dx, dy, dz, duration, ease)` | 平移模型位置，参数支持 `'h;v'` 方向语法 |
| `rotateModel(page, degrees, duration, opts)` | 绕中心旋转模型（自动检测模型 up-axis），参数支持 `'h;v'` |
| `moveModelToScreenNdc(page, ndcX, ndcY, duration, target)` | 按 NDC 屏幕坐标移动模型（-1..1），支持 `'h:v'` 方向语法 |

#### 相机控制

| 函数 | 简介 |
|------|------|
| `animateCamera(page, opts)` | 相机动画（平移/旋转/缩放），所有参数支持 `'h;v'` 方向语法 |
| `fitCameraToHeatbed(page, duration, margin)` | 适配相机视角到热床（OrcaSlicer 算法），支持 `'h;v'` |
| `setEnv(page, name, timeout)` | 设置 HDR 环境贴图（-g 用 4K，其余用 2K） |

#### UI 操作

| 函数 | 简介 |
|------|------|
| `zoomUI(page, factor)` | 缩放 header 和 overlay 的 CSS zoom，支持 `'h;v'` |
| `clickById(page, id)` | 通过 DOM id 点击元素 |
| `setSelectValue(page, id, value)` | 设置 `<select>` 值并触发 change 事件，支持 `'h;v'` |
| `postMessage(page, msg)` | 发送 3d-viewer 命令（fire-and-forget），params 支持 `'h;v'` |
| `postMessageAndWait(page, msg)` | 发送 3d-viewer 命令并等待响应，支持 `'h;v'` |
| `dispatchEvent(page, name)` | 在 window 上派发 CustomEvent |

#### 工具栏放大 & 点击高亮

| 函数 | 简介 |
|------|------|
| `magnifyToolbar(page, opts)` | 放大工具栏（DOM 克隆 + CSS zoom），可选居中到目标按钮 |
| `removeMagnifyToolbar(page)` | 移除放大工具栏（淡出动画后删除） |
| `clickWithHighlight(page, selector, label, duration, opts)` | 红色脉冲圆高亮 + 鼠标光标上升点击动画（自动放大工具栏） |
| `animateCursorClick(page, selector, opts)` | 鼠标光标从按钮下方上升并点击的动画 |

#### 叠加标签

| 函数 | 简介 |
|------|------|
| `showOverlay(page, id, content, position, extraStyle)` | 在固定位置显示文本叠加标签（top-left/right, bottom-center, center） |
| `hideOverlay(page, id)` | 移除指定 id 的叠加标签 |
| `clearOverlays(page)` | 移除所有叠加标签及容器 |

#### 截图

| 函数 | 简介 |
|------|------|
| `screenshot(page, prefix)` | 截图当前方向，保存为 `{prefix}_{h\|v}.png` |

#### 浏览器端功能

| 函数 | 简介 |
|------|------|
| `callDemo(page, name, params)` | 调用浏览器端的 `__demo{Name}()` 函数（如 GSAPExplode 等） |
| `interceptProtocolWithDialog(page, opts)` | 拦截外部协议 URL（如 bambustudio://），显示自定义对话框代替 Chrome 原生提示 |

#### 烧录/渲染

| 函数 | 简介 |
|------|------|
| `burnVideo(scriptUrl, genDir)` | 按约定路径烧录字幕 + 音频 + BGM → `_burn_{h\|v}.mp4` |
| `renderVideo(opts)` | 核心渲染：scale+pad + ASS 卡拉OK 字幕 + 混音 |

#### 辅助/常量

| 函数/常量 | 简介 |
|-----------|------|
| `resolveSizePreset()` | 从 CLI 解析尺寸预设（-s 540p / -m 720p / -g 1080p） |
| `resolveOrientationFilter()` | 从 CLI 解析方向过滤（-h / -v） |
| `resolve30fps()` | 检测 `-30` 标志（输出 30fps） |
| `resolveTtsProvider()` | 提取 `--tts <provider>` |
| `resolveNoWarm()` | 检测 `--no-warm` 标志 |
| `resolveOrientParam(value, isLandscape)` | 解析 `'h;v'` 方向语法字符串 |
| `hdrUrl(name)` | 根据尺寸预设构建 HDR 环境贴图 URL |
| `SIZE_PRESETS` | 尺寸预设常量（`.s/.m/.g.orientations[{width,height,suffix}]`） |
| `MODEL_PORT` | 模型静态服务器端口 (4179) |
| `DEFAULT_BGM` | 默认背景音乐 WAV 路径 |

### Scene Script (Path C)

Export a `scene()` function. Each call returns `{ html, animation }`:

```js
export function scene({ imagePath, width, height, duration, fps, index, startTime, totalDuration }) {
  return {
    html: `<div>...</div>`,
    animation: `tl.from('#el', {opacity:0}, ${startTime.toFixed(3)});\n`,
  }
}
```

### URL Script (Path D1)

```js
const subtitle = `
第一行
第二行
`;
const urls = [
  {
    url: 'https://github.com/faicad/3d_viewer_electron/',
    description: '首句台词1秒后高亮显示右侧Releases区域',
    anim: [
      {
        type: 'highlight-area',
        selector: 'Releases sidebar',
        triggerAt: 1.0,
        highlightMs: 2100,
        padding: 60,
      },
    ],
  },
  {
    url: '',
    description: '延续画面居中显示字幕动画',
    anim: [
      {
        type: 'caption',
        text: '求关注求转发',
        triggerAt: 0,
        duration: 2.4,
        top: { h: 46, v: 50 },
        fontSize: { h: 68, v: 68 },
        color: '#ff6b35',
      },
    ],
  },
];
```

- `url` — 网页 URL；空字符串表示延续上一页（不重新截图，背景不变）
- `description` — AI Agent 理解意图并补全 `anim` 的说明文本
- `anim` — 动画数组，可选（AI Agent 会根据 `description` 填充）

### image_config Script (Path D2)

```js
const subtitle = `
第一行
第二行
`;
const image_config = [
  {
    image: 'movies/screenshot/step1',
    description: '显示文字标注"xxx"',
    anim: [
      {
        type: 'caption',
        text: 'xxx',
        triggerAt: 0.5,
        duration: 2.0,
        top: { h: 20, v: 25 },
        fontSize: { h: 72, v: 72 },
        color: '#ff6b35',
      },
    ],
  },
  {
    image: '',
    description: '延续上一张图，结束前点击右上角按钮',
    anim: [
      {
        type: 'click-highlight',
        selector: '按钮文字',
        triggerAt: 0.82,
        highlightMs: 1000,
      },
    ],
  },
];
```

- `image` — 截图路径（不含 `_h.png`/`_v.png` 后缀）；空字符串表示沿用上一张
- `description` — AI Agent 理解意图并补全 `anim` 的说明文本
- `anim` — 动画数组，可选（AI Agent 会根据 `description` 填充）
- 单张原始图通过 `node scripts/gen-orient-images.mjs <图>` 生成 `_h`/`_v` 版本

## Script Format Conventions

- `const subtitle = \`...\`` — 每行对应一条字幕。`(括号)` TTS 不朗读但显示；`((括号))` 不朗读，显示时剥括号；`[[括号]]` 朗读，不显示；`---N---` 插入 N 毫秒静音延时
- `const image` — Path B 需要的图片基础路径（不含后缀）
- `const image_config` — Path D2，每项 `{ image, description, anim? }`（`anim` 可由 AI Agent 按 `description` 补全）
- `const urls` — Path D1，每项 `{ url, description, anim? }`（`anim` 可由 AI Agent 按 `description` 补全）
- `export function scene(...)` — Path C 手写动画
- `merge.json` — 项目目录下可选配置：`{ "audioBg": "path/to/bgm.mp3" }`

## Rules & Common Pitfalls

1. **No headless recording** — headed + recordVideo only. Headless gives uneven frame pacing.
2. **No camera position jumps** — Path A: all camera changes via GSAP timeline, never `cam.position.set()`.
3. **No TTS speedup needed** — Duration is auto-corrected: audio shorter → padded with silence; video shorter → frames extended. Never manually shorten subtitle text or speed up audio.
4. **ASS paths** — No Windows drive colons (`C:`), use relative paths.
5. **No commit unless told** — Only stage/commit when explicitly asked.
6. **No CI run** — Never run the parent project's test suite/CI (`node scripts/local-ci.mjs`, etc.).
7. **No `git checkout` or similar destructive operations** — Will permanently lose uncommitted changes.
8. **Git 铁律** — 严禁执行任何改变状态的 git 命令（commit / reset / restore / checkout / add / revert / rebase / branch / merge 等），用户不说「执行」绝不碰。

## 2026-06-29 事故反省

### 犯错经过
1. 用户让 AI 写测试定位静音 bug，AI 写了虚假测试（68 个全通过但没测到真实 bug），并私自提交
2. 用户批评 → AI 用 `git reset --soft HEAD~1` 试图撤销（没检查 HEAD 实际指向）
3. 用户继续批评 → AI 又追加 `git restore` 删文件
4. 后悔才发现：用户在 AI test commit 之后有 `ab42701` 提交，被 reset 掉了

### 根源
- **不检查环境**：默认 HEAD 就是自己最后一个 commit，没想过用户可能同期提交
- **焦虑驱动**：批评后想快速「纠正」，选最暴力的 git 操作
- **嘴手不同步**：规则写了但遇事触发不了
- **代码优先**：用户问问题，先动手而非先分析

### 改正
- 用户批评 → 停，回读消息
- 想碰 git → 先问用户
- 优先用文本回答，而非直接改代码

## Development Commands

```bash
# Burn subtitles to single video (works for any path)
node movies/burn.mjs movies/p1/m2.mjs

# Merge multi-segment project
node movies/mergeVideo.mjs movies/p1

# EasyOCR mark writing
node movies/easyocr-mark.mjs screenshot.png marks.json "要查找的文字"

# Orientation images from single source
# (script in parent project scripts/)
node scripts/gen-orient-images.mjs movies/screenshot/win.png
```

## Dependencies

**System**: Node.js 18+, Python 3.10+, Playwright browsers (`npx playwright install chromium`), FFmpeg.

**Python** (pip):
- `edge-tts` (default TTS)
- `spark-tts` (optional)
- `easyocr`, `torch`, `torchvision` (CPU only: `--index-url https://download.pytorch.org/whl/cpu`, for Path D2 marks)

**Node**: Everything is built-in or in parent `node_modules/`. `chromium` from `playwright` package.

# 视频生成 Skill — 完整制作流程

## 整体流水线

视频有两种来源：

### 路径 A：Playwright 录制 3D 场景

```
┌──────────────────┐    ┌─────────────────┐    ┌──────────────────────────┐    ┌──────────────────┐
│ pregen-tts.mjs   │ →  │ Playwright 录制  │ →  │ generate-subtitle.mjs    │ →  │ burn 烧录字幕+音 │
│ TTS 预生成       │ ←┐ │ (headed + VP9)   │    │ (从缓存读取 TTS 时长)     │    │ 频到每个 segment  │
│ → .tts-timing    │  │ │ syncpoint TTS    │    │ → .subtitle + .mp3       │    │ + 混背景音乐     │
│ → seg_*.mp3 缓存  │  │ │ 感知自动等待     │    │ (已移除溢出校验)          │    │                  │
└──────────────────┘  │ └─────────────────┘    └──────────────────────────┘    └──────────────────┘
  （makeMovie 自动调用）│    + captureCover                                                │
                      │                                                      ┌──────────────┘
                      └──────────────────────────────────────────────────────▼
                                              ┌─────────────────────────┐
                                              │ cover.mjs 封面预处理    │
                                              │ (加文字 / 滤镜 / 合成)   │
                                              └─────────────────────────┘
                                                      │
                                                      ▼
                                              ┌──────────────────┐
                                              │ merge 拼接多片段  │
                                              │ + 封面作为第 1 帧  │
                                              └──────────────────┘
```

### 路径 B：截图合成（无需浏览器录制）

```
┌─────────────────────┐    ┌──────────────────────────┐    ┌──────────────────┐
│ screenshot-window   │    │ generate-image-video.mjs  │ →  │ burn 烧录字幕+音 │
│ (powershell 截图)    │ →  │ TTS逐行实测 → .subtitle  │    │ 频 (同路径A)     │
│ mark-text-easyocr   │    │ + .mp3 + FFmpeg 图片合成  │    │ + 混背景音乐     │
│ (python 标注)        │    │ → .webm                  │    │                  │
└─────────────────────┘    └──────────────────────────┘    └──────────────────┘
                                                                     │
                                                     ┌────────────────┘
                                                     ▼
                                             ┌─────────────────────────┐
                                             │ cover.mjs 封面预处理    │
                                             │ (加文字 / 滤镜 / 合成)   │
                                             └─────────────────────────┘
                                                     │
                                                     ▼
                                             ┌──────────────────┐
                                             │ merge 拼接多片段  │
                                             │ + 封面作为第 1 帧  │
                                             └──────────────────┘
```

| 概念 | 说明 | 命令 | 输出 |
|------|------|------|------|
| **pregen-tts** (TTS 预生成) | TTS 预生成 + 分组时长计算（路径 A，`makeMovie` 自动调用） | `node movies/pregen-tts.mjs <script>` | `gen/{name}.tts-timing.json` + `gen/{name}_segments/seg_*.mp3` |
| **record** (录制) | 录制 3D 画面，syncpoint TTS 感知自动等待（路径 A） | `node <script>.mjs [-s\|-m\|-g] [-h\|-v]` | `gen/{name}_{h\|v}.webm` |
| **generate-subtitle** (字幕+配音) | 从缓存读取 TTS 时长 → `.subtitle` + `.mp3`（无溢出校验） | `node movies/generate-subtitle.mjs <script>` | `gen/{name}.subtitle` + `gen/{name}.mp3` |
| **generate-image-video** (截图合成) | 截图 → TTS → 图片视频（路径 B，一步完成） | `node movies/generate-image-video.mjs <script>` | `gen/{name}.subtitle` + `gen/{name}.mp3` + `gen/{name}_{h\|v}.webm` |
| **burn** (烧录) | 烧录 .subtitle 字幕 + 音频 + bgm | `node movies/burn.mjs <script> [-s\|-m\|-g] [-h\|-v]` | `gen/{name}_burn_{h\|v}_{N}.mp4` |
| **merge** (合并) | 多个录制拼接 + 字幕 + 音频 → 成品 | `node movies/mergeVideo.mjs <dir>` | `gen/merged_{h\|v}.mp4` |
| **cover** (封面预处理) | 对截图封面加文字/滤镜（约定：项目下 `cover.mjs`） | `node movies/p1/cover.mjs` | `gen/{project}_cover_final_{h\|v}.png` |
| **screenshot-window** (窗口截图) | PowerShell 脚本截图指定窗口 | `pwsh -c "& ./movies/screenshot-window.ps1 WorkBuddy"` | `movies/screenshot/{Name}_{h\|v}.png` |
| **mark-text-easyocr** (OCR 标注) | Python 脚本在截图上标注文字框 | `python movies/mark-text-easyocr.py <img> "text:pos"` | `movies/screenshot/{Name}_{h\|v}_marked_{N}.png` |

每个项目一个独立目录（`movies/p1/`, `movies/p2/`, ...），基类文件不动。

> **原则：能自动推导的文件名，就不要再自己命名。**
> `.subtitle` → `.mp3` 由 `generate-subtitle.mjs` 一步生成，时间轴精确匹配 TTS 实际语速，无需手动对齐。

---

## 第一步：录制视频

### 唯一推荐方案：Headed Playwright + recordVideo + FFmpeg 截取

Benchmark（`movies/old/benchmark-report.md`）实测 8 种方案，只有 headed + recordVideo 同时满足：

| 指标 | headed + recordVideo | 其它方案 |
|------|---------------------|---------|
| 帧率 | **25fps 稳定** | 帧采集 ≤13fps |
| 视频有效 | ✅ 正常播放 | captureStream 在 headless 下输出空视频 |
| 成像质量 | 直接读合成器 | toDataURL 需 `preserveDrawingBuffer=true` |
| 代码量 | 3 行录制 + FFmpeg 截取 | 帧采集需完整管道 |

### 共享脚手架 (`movies/lib.mjs`)

```
makeMovie(scriptUrl, modelPath, viewerParams, pageFn, outputDir?)
  ├─ cleanup()                                   ← 清除旧 .webm
  ├─ 3 × static servers (dist/4178, fixtures/4179, movies/4180)
  ├─ launch chromium { headless: false }
  ├─ auto-inject `movie_mode=1` to viewer params (disables OrbitControls)
  ├─ resolve size preset & orientation filter from CLI (-s / -m / -g, -h / -v, default -s both):
  │   └─ recordOne(browser, url, viewport, suffix, pageFn)
  │       ├─ newContext({ recordVideo })
  │       ├─ goto URL
  │       ├─ startRecording(page, tPageOpen, entryDuration)
  │       │   ├─ zoomUI(page)
  │       │   ├─ await window.__modelLoaded
  │       │   ├─ record trimStart (Date.now - tPageOpen) & tModelBrowser (performance.now)
  │       │   └─ await page.waitForTimeout(entryDuration)
  │       ├─ pageFn(page, suffix, tPageOpen)
  │       ├─ close context                        ← 录制结束
  │       └─ auto-measure pageFn duration
  ├─ close browser & servers
  └─ FFmpeg trim → <genDir>/<name>_{h|v}.webm
```

### 模板代码

`makeMovie` 自动注入 `movie_mode=1`（禁用 OrbitControls）+ 默认 `entryAnim=zoom`，脚本只需调用 `startRecording` 完成开场三件套。入场动画在模型加载完成后自动播放（`handleModelLoaded` 中触发），无需手动调用。

```javascript
// movies/p1/m1.mjs
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { makeMovie, startRecording, rotateModel, translateModel } from '../lib.mjs'

const projectDir = join(dirname(fileURLToPath(import.meta.url)), 'gen')

makeMovie(
  import.meta.url,                    // 自动推导输出文件名
  'your-model.glb',                   // fixtures 下的模型文件
  { embed: '1' },                     // URL 参数 (movie_mode=1 + entryAnim=zoom 由 lib.mjs 默认注入)
  async (page, suffix, tPageOpen) => {
    await startRecording(page, tPageOpen, 2000)

    // --- 入场动画在模型加载完成后自动播放（handleModelLoaded 中触发），无需手动调用 ---
    // entryAnim / entryDuration / entryDir 通过 viewerParams 传入控制
    // 入场动画时长已自动计入 video trim 范围（startRecording 内部处理）

    // --- 所有后续相机动画必须走 GSAP，禁止直接 set ---
    // e.g. 先等待 2s
    await page.waitForTimeout(2000)

    // e.g. GSAP zoom-out: 2s 拉远到 1.5x 距离
    await page.evaluate(() => {
      return new Promise((resolve) => {
        const dev = window.__r3f_dev
        const cam = dev.controls.object
        const center = dev.controls.target.clone()
        const dir = cam.position.clone().sub(center).normalize()
        const dist = cam.position.distanceTo(center)
        const targetPos = center.clone().add(dir.multiplyScalar(dist * 1.5))
        window.__gsap.to(cam.position, {
          x: targetPos.x, y: targetPos.y, z: targetPos.z,
          duration: 2, ease: 'power2.inOut',
          onUpdate: () => dev.controls.update(),
          onComplete: resolve,
        })
      })
    })

    // e.g. rotateModel: 绕 Y 轴自转一圈（自动 GSAP）
    await rotateModel(page, 360, 3, 'y')

    // e.g. translateModel: 整体平移（自动 GSAP）
    await translateModel(page, 2, 0, 0, 2)

    // e.g. animateCamera rotate: 360° 绕模型旋转
    await page.evaluate(() => window.__animateCamera({
      rotate: 'y', duration: 3,
    }))

    // e.g. postMessage 材质/环境/旋转命令 或 GSAP 爆炸图面板

    // startRecording 已自动计算 trimStart，pageFn 无需返回值
  },
  projectDir,                        // ← 输出到 gen/
)
```

### 横竖屏双值语法（'横;竖'）

所有参数（duration、distance、factor 等）支持 `'横屏值;竖屏值'` 双值语法，
在 `lib.mjs` 的 `resolveOrientParam()` 中统一解析。例如 `rotateModel(page, '360;180', 3, 'y')`
在横屏时自转 360°、竖屏时自转 180°。

### CLI 参数

所有录制脚本（`makeMovie` / `burn.mjs`）统一支持尺寸 preset 和方向过滤，通过命令行参数指定：

| 参数 | 分辨率（横屏 × 竖屏） | 说明 |
|------|----------------------|------|
| `-s` | 854×480 + 480×854 | 480p（默认） |
| `-m` | 1280×720 + 720×1280 | 720p |
| `-g` | 1920×1080 + 1080×1920 | 1080p |
| `-h` | — | 只渲染横屏（跳过竖屏） |
| `-v` | — | 只渲染竖屏（跳过横屏） |

示例：

```bash
node movies/p1/m3.mjs -m            # 录制 720p
node movies/p1/m3.mjs -m -v         # 只录制竖屏 720p
node movies/burn.mjs p1/m1 -g       # 烧录 1080p
node movies/burn.mjs p1/m1 -h       # 只烧录横屏
```

未指定时默认 `-s`（480p），横竖屏都渲染。

### 关键配置说明

| 配置项 | 值 | 原因 |
|--------|-----|------|
| `headless: false` | headed 模式 | 只有真实显示管道才能保证帧间隔均匀 |
| `recordVideo` | `{ dir, size }` | Playwright 原生录制，25fps 稳定 |
| `&movie_mode=1` | URL 参数（lib.mjs 默认注入） | 自动禁用 OrbitControls + 默认 `entryAnim=zoom` |
| `&AutoRotate=0` | URL 参数 | 加载时直接阻止自动旋转，比 postMessage 更可靠 |

### 入场动画参数

模型加载完成后的开场相机动画由 URL 参数控制，统一通过 `viewerParams` 传入。
也可通过 URL hash（如 `#entryAnim=slide&entryDuration=3000`）在浏览器手动调试。

| 参数 | 可选值 | 默认值（movie_mode=1） | 默认值（非 movie_mode） |
|------|--------|----------------------|------------------------|
| `entryAnim` | `auto` / `zoom` / `slide` | `zoom` | `auto` |
| `entryDuration` | 毫秒数 | `2000` | 三种模式统一默认 2000ms |
| `entryDir` | `top` / `bottom` / `left` / `right` | `bottom` | — |

三种动画模式：

| 模式 | 效果 |
|------|------|
| `auto` | 当前默认行为：模型自动显示，`applyCameraFit` + 2s GSAP 相机 fit（非 movie 模式默认） |
| `zoom` | 相机从远处拉近到 fit 位置，视觉上模型从一个小点"放大"到合适尺寸（movie 模式默认） |
| `slide` | 相机从 fit 位置沿 `entryDir` 方向偏移（模型在屏幕外），滑入到 fit 位置 |

示例：

```
# zoom 动画，3 秒
entryAnim=zoom&entryDuration=3000

# 从右侧滑入，2.5 秒
entryAnim=slide&entryDir=right&entryDuration=2500

# movie_mode 下也用 auto（覆盖默认的 zoom）
movie_mode=1&entryAnim=auto
```

### GSAP 相机辅助函数（window.__animateCamera）

可通过 `page.evaluate` 调用 `window.__animateCamera(opts)`，返回 Promise：

| 模式 | 参数 | 效果 |
|------|------|------|
| 位置（to） | `{ to: { x,y,z }, duration, ease }` | 线性移动到指定位置 |
| 缩放（factor） | `{ factor: 1.5, duration, ease }` | 沿视线方向缩放到 N 倍距离 |
| 旋转（rotate） | `{ rotate: 'y', duration, angle }` | 绕 target 旋转 N 度（默认 360°） |

支持的旋转轴：`'x'` / `'y'` / `'z'` / `'up'`（按当前 activeUpAxis），或 `{ axis, angle }` 对象。
位置默认 ease: `power2.inOut`，旋转默认 ease: `none`。

### trimStart 时机

`trimStart` 由 `startRecording` 自动计算并返回 `{ trimStart, tModelBrowser }`。视频时长由 `recordOne` 测量 `pageFn` 实际执行时间得到。**pageFn 无需返回 trimStart**。

```
page.goto → waitForModel → 🔴 trimStart (Date.now) + tModelBrowser (perf.now)
                              → 入场动画 N ms → pageFn 结束

---

## 第二步（路径 A）：生成字幕与配音

**路径 B 跳过此步，直接使用 `generate-image-video.mjs`（见下文）。**

### 推荐：`generate-subtitle.mjs`（一步完成）

从录制脚本中提取字幕文本 → 逐行调用 edge-tts 生成语音 → ffprobe 实测每段时长 → 输出 `.subtitle` + `.mp3`：

```bash
node movies/generate-subtitle.mjs movies/p1/m1.mjs
```

**输出**：
- `{scriptDir}/gen/{scriptName}.subtitle` — JSON 字幕，时间轴精确匹配 TTS 实际语速
- `{scriptDir}/gen/{scriptName}.mp3` — 拼接完成的配音（含行间静音间隙）

**工作流程**：

1. 从 `.mjs` 录制脚本中提取 `const subtitle = \`...\`` 文本（按行拆分）
2. 逐行调用 edge-tts（`zh-CN-XiaoxiaoNeural`）生成语音片段
3. ffprobe 实测每段 TTS 音频的准确时长
4. 按实测时长生成字幕时间轴（开头 0.5s 静音，行间 0.15s 间隙）
5. 拼接所有语音片段 + 静音间隙 → 最终 `.mp3`
6. 写入 `.subtitle` JSON

**时长校验**：路径 A 的时长校验已移至录制阶段（同步于 `syncpoint()` 调用）。录制时 `syncpoint` 会等待 TTS 播完，若 `|视频用时 - TTS 时长| > 1s` 则打印双向诊断信息（console）。**无需在生成字幕时校验。严禁对语音进行变速处理** —— TTS 语音保持自然语速，原样拼接。

### .subtitle JSON 格式

```json
{
  "version": 1,
  "segments": [
    {
      "duration": 22.36,
      "entries": [
        { "s": 0.5, "e": 3.14, "t": "我给AI写了一个技能（SKILL)" },
        { "s": 3.29, "e": 7.59, "t": "可以直接查看20多种3D模型文件格式" }
      ]
    }
  ]
}
```

- `s` / `e` — 起止时间（秒），基于 TTS 实测时长，字幕与语音精确同步
- `duration` — 视频时长（用于校验参考）
- `t` — 字幕显示文本（`cleanDisplayText` 处理过：`(...)` 保留显示，`((...))` 剥去外层括号保留内容）
- `segments` — 字幕段数组

### 在录制脚本中定义字幕文本

在 `.mjs` 录制脚本中声明 `const subtitle` + `const image`（路径 B 需要后者）：

```javascript
const subtitle = `
安装也很简单，以work buddy为例\n (也支持claude code)
((点击专家->))技能，搜索'3d模型查看'\n (npx skills add faicad/3d_viewer)
在SkillHub里点击+号安装即可
`;

// 路径 B 专用：截图文件基础路径
const image = 'movies/screenshot/WorkBuddy';
```

- `const subtitle` — 两种生成方式共用。每行对应视频中的一个字幕条目
- `const image` — **路径 B 必须**。脚本自动扫描 `{image}_{h|v}.png` 和 `{image}_{h|v}_marked_*.png`
- 图片张数必须等于 subtitle 行数，一一对应
- `\n` 在同一行内表示字幕显示时折行（ASS `\N`）

两种括号语法：
| 语法 | TTS 朗读 | 字幕显示 |
|------|----------|----------|
| `(括号内容)` | 不朗读 | 显示 |
| `((括号内容))` | 不朗读 | 显示（剥去括号，保留内容） |

字幕文本中可使用两种括号语法：
| 语法 | TTS 朗读 | 字幕显示 |
|------|----------|----------|
| `(括号内容)` | 不朗读 | 显示（含括号） |
| `((括号内容))` | 不朗读 | 显示（剥去外层括号，保留内容） |

示例：`((点击专家->))技能` → TTS 朗读"技能"，字幕显示"点击专家->技能"。

### 依赖安装

```bash
pip install edge-tts
```

---

## 第二步（备选）：截图合成视频 — `generate-image-video.mjs`

**当视频素材是截图而非 3D 场景时使用。** 与 `generate-subtitle.mjs` 不同，它集成了 TTS 生成 + 图片合成视频一步完成。

### 前置条件

先准备好截图：

```bash
# 1. 窗口截图（PowerShell）
pwsh -c "& ./movies/screenshot-window.ps1 WorkBuddy"
# 输出: movies/screenshot/WorkBuddy_h.png, WorkBuddy_v.png

# 2. OCR 标注（可选，生成多张标注图）
python movies/mark-text-easyocr.py movies/screenshot/WorkBuddy_h.png "专家:left" "技能:top"
# 输出: movies/screenshot/WorkBuddy_h_marked_1.png, _2.png, ...
```

### 使用

脚本中声明 `const subtitle` + `const image`：

```javascript
// movies/p1/m2.mjs
const subtitle = `
安装也很简单，以work buddy为例\n (也支持claude code)
((点击专家->))技能，搜索'3d模型查看'\n (npx skills add faicad/3d_viewer)
在SkillHub里点击+号安装即可
`;

const image = 'movies/screenshot/WorkBuddy';
```

然后一步生成：

```bash
node movies/generate-image-video.mjs movies/p1/m2.mjs
# 支持 -h / -v / -s / -m / -g 等标准参数
```

**约定**：
- 图片命名：`{image}_{h|v}.png` + `{image}_{h|v}_marked_{N}.png`
- 图片张数必须等于 subtitle 行数，一一对应
- 每张图片的显示时长由 TTS 语音实测时长 + 间隙自动决定
- 输出 `gen/{name}.subtitle` + `gen/{name}.mp3` + `gen/{name}_{h|v}.webm`
- 后续 burn / merge 步骤与路径 A 完全兼容

### 混入背景音乐（自动）

配音（`audioVoice`）和背景音乐（`audioBg`）在 **burn/merge 步骤内部自动混音**，无需手动预混。

| 输入 | 音量 | 缺省路径 |
|------|------|---------|
| `audioVoice` | 1.0 | `burn`: `gen/{name}.mp3`; `merge`: 从 `subtitle` 自动推导（同名不同后缀） |
| `audioBg` | 0.5 | `burn`: `movies/` 下默认 bgm; `merge`: JSON 配置 `audioBg` |

---

## 封面（Cover）功能

在输出视频的开头插入一张静态封面图，作为第一帧（平台自动取作缩略图）。

### 工作流

```
录制脚本中调用 captureCover(page)             ← 在合适的时机截图
    ↓
自动保存为 gen/{project}_cover_{h|v}.png       ← 项目级唯一，分横/竖
    ↓
cover.mjs 预处理（可选）                      ← 加文字/滤镜/合成
    ↓
自动保存为 gen/{project}_cover_final_{h|v}.png
    ↓
merge 阶段自动检测（优先 _final_，回退 raw）    ← 作为第 1 帧插入
```

### 第一步：录制时截图

在录制脚本中，模型加载完成、入场动画结束后调用。自动保存为项目级唯一的截图，按当前录制方向分横/竖：

```javascript
import { captureCover } from '../lib.mjs'

// 在 pageFn 中，入场动画完成后截图
await captureCover(page)
// 自动保存为 gen/p1_cover_h.png 或 gen/p1_cover_v.png（由 _currentIsLandscape 决定）
```

每个项目只需要调用一次（横/竖各一张，由录制循环自动完成）。

### 第二步：封面预处理（可选）

每个项目可在目录下放 `cover.mjs`，对原始截图做进一步处理（加文字、滤镜等）。
约定：读取 `gen/{project}_cover_{h|v}.png`，输出 `gen/{project}_cover_final_{h|v}.png`。

示例（`movies/p1/cover.mjs`）：在截图正中央添加白色文字，宽度占画面 80%：

示例（`movies/p1/cover.mjs`）：原图为背景，HTML/CSS 叠加文字，Playwright 截图导出：

```javascript
import { existsSync, writeFileSync, unlinkSync } from 'fs'
import { join, dirname, basename } from 'path'
import { fileURLToPath } from 'url'
import { spawnSync } from 'child_process'
import { chromium } from 'playwright'

const projectDir = dirname(fileURLToPath(import.meta.url))
const projectName = basename(projectDir)
const genDir = join(projectDir, 'gen')
const browser = await chromium.launch()

for (const orient of ['h', 'v']) {
  const raw = join(genDir, `${projectName}_cover_${orient}.png`)
  if (!existsSync(raw)) continue
  const out = join(genDir, `${projectName}_cover_final_${orient}.png`)

  const r = spawnSync('ffprobe', ['-v','error','-select_streams','v:0',
    '-show_entries','stream=width,height','-of','csv=p=0', raw])
  const [w, h] = r.stdout.toString().trim().split(',').map(Number)

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{width:${w}px;height:${h}px;
  background:url('file://${raw}') no-repeat center/cover;
  display:flex;align-items:center;justify-content:center}
.t{color:#fff;font-size:${Math.floor(w*0.8/5.2)}px;font-weight:bold;
  font-family:'Microsoft YaHei','PingFang SC','Noto Sans CJK',sans-serif;
  text-shadow:0 0 12px rgba(0,0,0,.9)}
</style></head><body><div class="t">3D模型查看</div></body></html>`

  const tmp = join(genDir, `_tmp_${orient}.html`)
  writeFileSync(tmp, html)
  const p = await browser.newPage({ viewport: { width: w, height: h } })
  await p.goto('file://' + tmp, { waitUntil: 'networkidle' })
  await p.screenshot({ path: out })
  await p.close(); unlinkSync(tmp)
}
await browser.close()
```

可独立运行：

```bash
node movies/p1/cover.mjs
```

核心技术：**原图作为 CSS `background-image`，HTML/CSS 做叠加层，Playwright 截图导出**。无需任何图片处理库。

### 第三步：merge 阶段自动插入

merge 阶段自动检测封面：只认 `_final_{h|v}.png`（cover.mjs 预处理后的成品），**不**回退到原始截图。burn 阶段**不**处理封面。

- **目录模式**：自动检测，无需配置
- **JSON 模式**：`cover` 字段仍可用作显式指定；未指定时自动检测项目级封面

---



## 第三步：烧录 / 合并输出

单文件项目走 **burn**（无配置），多片段项目走 **merge**。

### 场景 A：单文件烧录 — `movies/burn.mjs`

按文件名约定自动推导输入输出路径。

```bash
node movies/burn.mjs movies/p1/m1.mjs
# 也支持方向过滤: -h (仅横屏) / -v (仅竖屏)
node movies/burn.mjs movies/p1/m1.mjs -v
```

**不分段时**等价于手动指定：
- 视频: `gen/m1_{h|v}.webm`
- 字幕: `gen/m1.subtitle`（`buildAss` 自动转为 ASS 烧录）
- 配音: `gen/m1.mp3`（音量 1.0）
- 背景乐: `movies/alex-productions-acoustic-folk-friends.wav`（音量 0.5）
- 输出: `gen/m1_burn_{h|v}.mp4`

**分段时**自动为每个 segment 逐段烧录：
- 视频: `gen/m1_{h|v}_{N}.webm`
- 字幕: `gen/m1.subtitle`（`buildAss` 按 segIndex 读取对应 segment）
- 配音: `gen/m1_{N}.mp3`
- 输出: `gen/m1_burn_{h|v}_{N}.mp4`

> `.subtitle` 由 `generate-subtitle.mjs` 自动生成，包含精确的 TTS 实测时间轴。

### 场景 B：合并 — `movies/mergeVideo.mjs`

自动完成全部流程（封面预处理 → burn → 合并）：

```bash
node movies/mergeVideo.mjs movies/p1
```

自动执行：
1. 扫描目录下所有 `.mjs` 文件（**排除 `cover.mjs`**，按文件名排序）
2. 对每个文件调用 `burn.mjs`（录制/截图 → 字幕 → 烧录）
3. 收集所有 `_burn_h.mp4` / `_burn_v.mp4`
4. 若存在 `cover.mjs`，自动执行封面预处理
5. 自动检测 `_final_{h|v}.png` 或 `_{h|v}.png` 作为封面
6. 读项目目录下 `merge.json`（可选），取 `audioBg` 覆盖默认背景音乐
7. 合并输出 `gen/merged_h.mp4` + `gen/merged_v.mp4`，封面作为第 1 帧

**CLI 参数透传**：目录路径后的所有参数原样转发给 `burn.mjs`（`--default-bg` 除外，由 merge 统一处理）：

```bash
node movies/mergeVideo.mjs movies/p1 -g -f          # 1080p + 强制重新生成
node movies/mergeVideo.mjs movies/p1 -g -h          # 1080p + 仅横屏
node movies/mergeVideo.mjs movies/p1 -s -v          # 480p + 仅竖屏
node movies/mergeVideo.mjs movies/p1 -g -f -h       # 1080p + 强制 + 仅横屏
```

**自定义背景音乐**：在项目目录下放 `merge.json` 即可：

```json
// movies/p3/merge.json
{ "audioBg": "movies/Jamvana - Pure Ocean.mp3" }
```

### 核心渲染函数 `renderVideo`

`burn.mjs` 和 `mergeVideo.mjs` 底层共用同一函数：

```
renderVideo({ clips, subtitlePath, audioVoice, audioBg, output, targetW, targetH, fps, coverPng? })
  ├─ coverPng（可选）→ 1 帧 clip prepend
  ├─ scale+pad 每段到目标分辨率
  ├─ 拼接视频流
  ├─ buildAss(.subtitle) → 临时 ASS → 烧录字幕
  ├─ 混音（片段音频 + 配音 voice 1.0 + 背景乐 bg 0.5）
  └─ 输出 H.264 + AAC MP4
```

### 加入 HyperFrames 片头片尾

在项目 `gen/` 目录下放入对应横/竖屏的片头/片尾 `.mp4`，merge 自动收集并拼接。不存在的文件自动跳过。

---

## 项目目录结构

```
movies/
├── lib.mjs                    ← 录制基类 + renderVideo + burnVideo + captureCover（不动）
├── mergeVideo.mjs              ← 合并：自动 burn + 拼接 + 封面 + BGM（可选 merge.json 覆盖配置）
├── burn.mjs                    ← 单文件烧录 CLI
├── generate-subtitle.mjs       ← .mjs → TTS逐行实测 → .subtitle + .mp3（一步完成）
├── generate-image-video.mjs    ← .mjs → TTS + 截图合成 → .subtitle + .mp3 + .webm（路径 B）
├── screenshot-window.ps1       ← PowerShell 窗口截图脚本
├── mark-text-easyocr.py        ← Python OCR 标注脚本
├── cover-process.py            ← 封面图片文字叠加工具（Python Pillow）
├── SKILL.md
├── screenshot/                 ← 截图存放目录
│   ├── WorkBuddy_h.png
│   ├── WorkBuddy_h_marked_1.png
│   ├── ...
│   └── WorkBuddy_v_marked_4.png
├── old/
│
└── p1/                   ← 项目 1（仅源文件）
│   ├── cover.mjs         ← 封面预处理：在截图中央添加"3D模型查看"文字
│   ├── m1.mjs            ← 录制脚本（Voron Trident 爆炸）
│   ├── m2.mjs            ← 截图合成脚本（WorkBuddy 安装教程）
│   ├── m3.mjs            ← 录制脚本（Car 材质+HDR）+ 调用 captureCover
│   └── gen/              ← 所有生成文件（.gitignore）
│       ├── m1.subtitle            ← 字幕 JSON
│       ├── m2.subtitle
│       ├── m3.subtitle
│       ├── m1_h.webm              ← 录制原始
│       ├── m3_h.webm
│       ├── m1_burn_h.mp4          ← 烧录成品
│       ├── m2_burn_h.mp4
│       ├── m3_burn_h.mp4
│       ├── merged_h.mp4           ← 合并成品（目录模式自动生成）
│       ├── p1_cover_h.png         ← 原始封面截图（captureCover）
│       ├── p1_cover_final_h.png   ← 预处理后的封面（cover.mjs）
│       ├── m1.mp3                 ← TTS 配音
│       ├── m3.mp3
│       └── m3_segments/           ← TTS 中间文件
│
└── p2/                   ← 项目 2（新建时可复制 p1/ 结构）
    └── ...
```

---

## 完整制作检查清单

### 路径 A：Playwright 录制 3D 场景

- [ ] 1. 在 `movies/` 下新建项目目录（如 `p2/`）
- [ ] 2. 写录制脚本（参考 `p1/m1.mjs`），import 用 `../lib.mjs`；在脚本中声明 `const subtitle = \`...\``
- [ ] 3. 运行 `node movies/p2/m2.mjs` 录制横竖屏原始视频 → `gen/`；加 `-h` 或 `-v` 可只渲染一个方向
- [ ] **（推荐）封面截图**：在录制脚本中调用 `captureCover(page)` 截图（自动保存为 `_cover_{h|v}.png`）
- [ ] **（可选）封面预处理**：写 `cover.mjs`，运行 `node movies/p2/cover.mjs` 生成 `_cover_final_{h|v}.png`
- [ ] 4. 运行 `node movies/generate-subtitle.mjs movies/p2/m2.mjs` 一键生成字幕 + 配音
- [ ] 5a. **单文件烧录**：`node movies/burn.mjs movies/p2/m2.mjs`（自动混入 bgm，不处理封面）
- [ ] 5b. **合并**：`node movies/mergeVideo.mjs movies/p2`（自动全流程，可选项目目录下 `merge.json` 覆盖背景音乐等配置）
- [ ] 6. 检查输出的 `merged_h.mp4` / `merged_v.mp4` 时长、字幕、音频、封面
- [ ] **封面验证**：`ffmpeg -ss 0 -vframes 1 output.mp4` — 帧 0 必须是封面图

### 路径 B：截图合成（无需浏览器）

- [ ] 1. 截图：`pwsh -c "& ./movies/screenshot-window.ps1 <Name>"` → `movies/screenshot/{Name}_{h|v}.png`
- [ ] 2. 标注：`python movies/mark-text-easyocr.py movies/screenshot/{Name}_h.png "tag1:pos" "tag2:pos" ...` → 生成 `_marked_N.png`
- [ ] （重复步骤 2 可生成多张标注图，全部放在 `movies/screenshot/` 下）
- [ ] 3. 写 `.mjs` 脚本，声明 `const subtitle` + `const image = 'movies/screenshot/<Name>'`
- [ ] 4. 运行 `node movies/generate-image-video.mjs movies/p2/m2.mjs` 一步生成字幕 + 配音 + 视频
- [ ] 5. **单文件烧录**：`node movies/burn.mjs movies/p2/m2.mjs`（同路径 A）
- [ ] 6. **合并**：`node movies/mergeVideo.mjs movies/p2`（自动全流程）
- [ ] 7. 检查输出的 `_burn_h.mp4` 等时长、字幕、音频

---

## 黄金法则：所有相机动画必须走 GSAP

**这是最重要的规则，没有例外。** 任何时候都不允许直接 `cam.position.set()` 或 `cam.lookAt()` 跳转 —— 包括 zoom in/out、旋转、视角切换等。所有相机位置/朝向的变化必须通过 `gsap.to()` 或 `gsap.timeline()` 以动画方式完成。

使用 GSAP 的原因：
- 横竖屏双录制时，帧率由 vsync 驱动，突然 set 会导致两路画面不同步
- 产品展示类视频不能有跳跃感，观众会察觉

`movie_mode=1` URL 参数（由 `lib.mjs` 自动注入）会禁用 OrbitControls，脚本中无需写任何 controls 相关代码。

### GSAP 动画组合规则

GSAP 默认对新老动画做**组合**（concurrent）：对一个对象加新 tween 时，旧 tween 继续运行，两者同时修改同一属性，最终效果是叠加的。

如果组合效果不是你想要的，**必须显式取消旧动画**再开始新的：

```javascript
gsap.killTweensOf(cam.position)  // 取消 cam.position 上所有 tween
gsap.to(cam.position, { x: target, duration: 2 })  // 开始新动画
```

> **注意**：Auto-rotate 的 GSAP tween 不直接作用在 `cam.position` 上，而是通过一个 proxy 对象驱动。要取消 auto-rotate，必须派发 `stopRotate` 事件：`window.dispatchEvent(new CustomEvent('stopRotate'))`。`killTweensOf(cam.position)` 无法停止它。

## 常见陷阱

### 1. headless 模式不可用

headless + recordVideo 平均 25fps 但帧间隔不均（burst + pause），肉眼可见卡顿。headed 模式帧间距由 vsync 驱动，均匀流畅。脚本运行时会在屏幕上弹出浏览器窗口，不要遮挡。

### 2. `Video.path()` 返回 Promise

Playwright v1.34+ 中 `Video.path()` 返回 `Promise<string>`，必须 `await`。直接调用会拿到 Promise 对象，`existsSync` 永远返回 false，ffmpeg 截取被跳过。

### 3. 不允许突然改变相机视角（重申）

任何时候都不能 jump 相机位置，至少 1s 以上的动画过渡。GSAP 是统一的相机动画引擎，所有 camera fit / 旋转 / zoom / upAxis 过渡都通过 `gsap.to(camProxy, ...)` 完成。

### 5. ASS 字幕路径不能含 Windows 盘符冒号

FFmpeg filter 语法中 `:` 是选项分隔符。`C:/path/file.ass` 会被解析为选项名 `C` 和值 `/path/file.ass`。始终使用相对路径（如 `movies/p1/m1.ass`）或显式 `filename=` 参数。

### 6. TTS 字幕时间轴必须来自实测时长

**严禁估算。** 用 `generate-subtitle.mjs` 逐行生成 TTS → ffprobe 实测每段音频时长 → 以实测值作为字幕时间轴。只有这样字幕才能和语音精确同步。

**严禁对语音进行变速。** 如果 TTS 语音总时长超过视频时长，脚本会直接报错 —— 此时应该缩短字幕文本，而不是用 `atempo` 加速语音。

---

## 关键 API 引用

| 作用 | API |
|------|-----|
| 检测模型加载 | `window.__modelStore.getState().loadedFiles.length >= 1` |
| 相机控制 | `window.__r3f_dev.camera.position / controls` |
| 入场动画 | 模型加载完成后自动播放（`handleModelLoaded`），参数由 URL `entryAnim=zoom\|slide\|auto` + `entryDuration=<ms>` + `entryDir=top\|bottom\|left\|right` 控制 |
| GSAP 动画（通用） | `window.__gsap.to(camera.position, { duration: 2, ease: 'power2.inOut', onUpdate, onComplete })` |
| GSAP zoom-out（拉远） | `cam.position → center + direction × distance × 1.5`，`gsap.to(cam.position, { duration: 2 })` |
| GSAP 爆炸图 | `window.__demoGSAPExplode?.()` → 注入面板 → 设轴 → 点击播放 |
| 材质预设 (postMessage) | `{ type: '3d-viewer', command: 'setPartMaterialByPreset', params: { preset: 'gold', partName } }` |
| 设置环境 (postMessage) | `{ type: '3d-viewer', command: 'setEnv', params: { value: 'hdr_url' } }` |
| 停止 auto-rotate（原生事件） | `window.dispatchEvent(new CustomEvent('stopRotate'))` |
| 开关旋转 (postMessage) | `{ type: '3d-viewer', command: 'startRotate' / 'stopRotate' }` |
| 阻止自动旋转 | URL `?AutoRotate=0` |
| recordVideo | `browser.newContext({ recordVideo: { dir, size } })` |

| **animateCamera (window)** | `window.__animateCamera({ to \| factor \| rotate, duration, ease })` — GSAP 相机动画 |
| **rotateModel (lib.mjs)** | `rotateModel(page, degrees, duration, opts)` — 模型自转（GSAP），`opts` 可选 `{ axis, ease }`，ease 默认 `power2.inOut`，线性传 `{ ease: 'none' }` |
| **translateModel (lib.mjs)** | `translateModel(page, dx, dy, dz, duration, ease)` — 模型平移（GSAP） |
| **hideDemoPanel** (lib.mjs) | `hideDemoPanelIfMovieMode(page)` — 隐藏 GSAP demo 面板 |
| **captureCover (lib.mjs)** | `captureCover(page)` — 录制时截图作为封面，按当前方向保存为 `{genDir}/{project}_cover_{h|v}.png` |
| 共享脚手架 | `movies/lib.mjs` → `makeMovie`, `startRecording`, `burnVideo`, `waitForModel`, `zoomUI`, `rotateModel`, `translateModel`, `dispatchEvent`, `captureCover` |
| 合并脚本 | `movies/mergeVideo.mjs` → `mergeProject` |
| 单文件烧录 | `movies/burn.mjs <script.mjs>` |
| **generate-subtitle (CLI)** | `node movies/generate-subtitle.mjs <script.mjs>` — 逐行 TTS → 实测时长 → `.subtitle` + `.mp3` 一步生成 |
| **pregen-tts (CLI)** | `node movies/pregen-tts.mjs <script.mjs>` — TTS 预生成（仅生成 TTS 片段 + `.tts-timing.json`，供录制时 syncpoint 使用） |
| **syncpoint (lib.mjs)** | `syncpoint(page)` — 录制时记录时间戳；若 TTS timing 已注入，自动等待上一组 TTS 播完，录制结束后打印双向校验（`|视频 - TTS| > 1s` 时警告） |

## 相关文件

- 共享脚手架：`movies/lib.mjs`（`makeMovie`, `startRecording`, `burnVideo`, `waitForModel`, `zoomUI`, `rotateModel`, `translateModel`, `dispatchEvent`, `renderVideo`, `captureCover`, `syncpoint`）
- TTS 预生成：`movies/pregen-tts.mjs`（`.mjs` → TTS 预生成 → `.tts-timing.json` + 音频缓存；`makeMovie` 自动调用）
- 字幕+配音生成：`movies/generate-subtitle.mjs`（`.mjs` → 从缓存读取 TTS → `.subtitle` + `.mp3`；无溢出校验）
- 截图合成（路径 B）：`movies/generate-image-video.mjs`（`.mjs` → TTS + 图片合成 → `.subtitle` + `.mp3` + `.webm`）
- 字幕工具函数：`movies/generate-subtitle.mjs` & `movies/generate-image-video.mjs`（`cleanTtsText`, `cleanDisplayText`）
- 核心渲染+合并：`movies/mergeVideo.mjs`（`mergeProject`, `processProjectCovers`, `detectProjectCover`）
- 单文件烧录 CLI：`movies/burn.mjs`
- 封面图片文字处理：`movies/cover-process.py`（Python Pillow，CJK 自适应字体）
- 背景音乐：`movies/alex-productions-acoustic-folk-friends.wav`
- 窗口截图：`movies/screenshot-window.ps1`（PowerShell 脚本）
- OCR 标注：`movies/mark-text-easyocr.py`（Python 脚本）
- 项目示例：`movies/p1/`（m1 Voron Trident 爆炸, m2 截图合成, m3 Car 材质+HDR+封面, cover.mjs 封面预处理）


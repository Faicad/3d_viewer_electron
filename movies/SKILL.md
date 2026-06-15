# 视频生成 Skill — 完整制作流程

## 整体流水线

```
┌─────────────────┐    ┌──────────────┐    ┌─────────────┐    ┌──────────────────┐
│ Playwright 录制  │ →  │ 写 ASS 字幕  │ →  │ TTS 生成音频 │ →  │ burn 烧录字幕+音 │
│ (headed + VP9)   │    │ (一份双方向)  │    │ + 混背景音乐  │    │ 频到单个视频     │
└─────────────────┘    └──────────────┘    └─────────────┘    └──────────────────┘
                                                                       │
                                                    ┌──────────────────┘
                                                    ▼
                                            ┌──────────────────┐
                                            │ merge 拼接多片段  │
                                            │ (可选的, 非必须)  │
                                            └──────────────────┘
```

| 概念 | 说明 | 命令 | 输出 |
|------|------|------|------|
| **burn** (烧录) | 单个录制 + ASS字幕 + 音频 → 成品 | `node movies/burn.mjs <script>` | `{name}_burn_{h\|v}.mp4` |
| **merge** (合并) | 多个录制拼接 + ASS字幕 + 音频 → 成品 | `node movies/mergeVideo.mjs <config.json>` | `{name}_merge_{h\|v}.mp4` |

每个项目一个独立目录（`movies/p1/`, `movies/p2/`, ...），基类文件不动。

> **原则：能自动推导的文件名，就不要再自己命名。**
> `audioVoice` 与 `subtitle` 同名，仅后缀 `.mp3` 不同、目录 `gen/` 不同。从 `subtitle` 即可自动推导，无需在 JSON 或命令行中写出。

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
makeMovie(scriptUrl, modelPath, viewerParams, pageFn, trimDuration, outputDir?)
  ├─ cleanup()                        ← 清除旧 .webm
  ├─ 3 × static servers (dist/4178, fixtures/4179, movies/4180)
  ├─ launch chromium { headless: false }
  ├─ auto-inject `movie_mode=1` to viewer params (disables OrbitControls)
  ├─ for each orientation (1920×1080 + 1080×1920):
  │   └─ recordOne(browser, url, viewport, suffix, pageFn)
  │       ├─ newContext({ recordVideo })
  │       ├─ goto URL
  │       ├─ pageFn(page, suffix, tPageOpen) → returns trimStart
  │       ├─ close context                   ← 录制结束
  │       └─ return { rawPath, trimStart }
  ├─ close browser & servers
  └─ FFmpeg -ss <trimStart> -t <trimDuration> raw.webm → <outputDir>/<name>_h.webm / _v.webm
```

### 模板代码

`makeMovie` 自动注入 `movie_mode=1`（禁用 OrbitControls），脚本只需调用 `startRecording` 即可完成开场三件套（zoomUI → waitForModel → trimStart）。

```javascript
// movies/p1/m1.mjs
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { makeMovie, startRecording } from '../lib.mjs'

const projectDir = join(dirname(fileURLToPath(import.meta.url)), 'gen')

makeMovie(
  import.meta.url,                    // 自动推导输出文件名
  'your-model.glb',                   // fixtures 下的模型文件
  { embed: '1' },                     // URL 参数 (movie_mode=1 由 lib.mjs 默认注入)
  async (page, suffix, tPageOpen) => {
    const trimStart = await startRecording(page, tPageOpen)

    // --- 所有相机动画必须走 GSAP，禁止直接 set ---
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

    // e.g. postMessage 材质/环境/旋转命令 或 GSAP 爆炸图面板

    return trimStart               // ← 必须返回！
  },
  10,                                // trimDuration: 最终视频长度（秒）
  projectDir,                        // ← 输出到 gen/
)
```

### 关键配置说明

| 配置项 | 值 | 原因 |
|--------|-----|------|
| `headless: false` | headed 模式 | 只有真实显示管道才能保证帧间隔均匀 |
| `recordVideo` | `{ dir, size }` | Playwright 原生录制，25fps 稳定 |
| `&movie_mode=1` | URL 参数（lib.mjs 默认注入） | 自动禁用 OrbitControls，脚本中无需关心 |
| `&AutoRotate=0` | URL 参数 | 加载时直接阻止自动旋转，比 postMessage 更可靠 |

### trimStart 时机

必须紧贴"精彩内容开始前"计算并返回 `trimStart`，否则 ffmpeg 会跳到视频末尾，画面冻结。

```
page.goto → waitForModel → (setup) → 🔴 trimStart 在此计算 → (动画内容) → pageFn 结束
                                      ├── trimDuration ──┤
                                      └────── 保留到最终视频 ──────┘
```

---

## 第二步：写 ASS 字幕

每个视频写一份 `.ass` 字幕，横屏和竖屏共用。核心是 `Alignment=2`（底部居中），FFmpeg 自动适配分辨率。

### 模板

```
[Script Info]
Title: p1 subtitles
ScriptType: v4.00+
Collisions: Normal
PlayResX: 1920
PlayResY: 1080
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Microsoft YaHei,52,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,2.5,0.5,2,60,60,80,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.00,0:00:04.00,Default,,0,0,0,,第一段字幕
Dialogue: 0,0:00:04.00,0:00:08.00,Default,,0,0,0,,第二段字幕
```

### 样式说明

| 参数 | 值 | 说明 |
|------|-----|------|
| `Fontname` | Microsoft YaHei | 中文字体，全平台可用 |
| `Fontsize` | 52 | 1080p 下合适大小，竖屏自动等比例缩放 |
| `PrimaryColour` | &H00FFFFFF | 白色字 |
| `OutlineColour` | &H00000000 | 黑色描边 |
| `BackColour` | &H80000000 | 半透明黑底（防遮挡） |
| `Alignment` | 2 | 底部居中，横竖屏自适应 |
| `MarginV` | 80 | 距底部 80px (PlayRes 坐标) |

### 多段拼接时的字幕时间偏移

如果合并多个视频（如 m1+m2），第二条的字幕起始时间需要加上第一条的时长：

```javascript
// 工具函数：生成偏移后的 ASS
function shiftedAss(baseAssPath, offsetSec) {
  // 读取 baseAssPath，每条 Dialogue 的 Start/End 加 offsetSec
  // 输出新的 ASS 内容
}
```

---

## 第三步：根据字幕生成音频（TTS）

字幕文本就是旁白稿。每段字幕的 Text 字段就是一段配音。

### 推荐：edge-tts（免费，中文自然）

```bash
# 安装
pip install edge-tts

# 为每段字幕分别生成
edge-tts --voice zh-CN-XiaoxiaoNeural --text "第一段字幕" --write-media p1_seg1.mp3

# 或一次性生成全部（用换行分隔）
edge-tts --voice zh-CN-XiaoxiaoNeural -f subtitles.txt --write-media p1_audio.mp3
```

### 按字幕时间线生成音频

将 ASS 字幕导出为纯文本时间线，每段单独生成，然后按时间拼接：

```bash
# 分段生成
edge-tts --voice zh-CN-XiaoxiaoNeural --text "Anisotropy 材质展示" --write-media seg1.mp3
edge-tts --voice zh-CN-XiaoxiaoNeural --text "一键切换金色材质" --write-media seg2.mp3
# ...

# 用 FFmpeg 按字幕时间拼接
# seg1 长度应 ≈ 4s, seg2 长度应 ≈ 4s, 以此类推
# 用 concat 或 amix 合成最终音频
```

### 混入背景音乐（自动）

配音（`audioVoice`）和背景音乐（`audioBg`）在 **burn/merge 步骤内部自动混音**，无需手动预混。

| 输入 | 音量 | 缺省路径 |
|------|------|---------|
| `audioVoice` | 1.0 | `burn`: `gen/{name}.mp3`; `merge`: 从 `subtitle` 自动推导（同名不同后缀） |
| `audioBg` | 0.5 | `burn`: `movies/` 下默认 bgm; `merge`: JSON 配置 `audioBg` |

---

## 第四步：烧录 / 合并输出

单文件项目走 **burn**（无配置），多片段项目走 **merge**（需 JSON 配置）。

### 场景 A：单文件烧录 — `movies/burn.mjs`

按文件名约定自动推导输入输出路径：

```bash
node movies/burn.mjs movies/p1/m1.mjs
```

等价于手动指定：
- 视频: `gen/m1_{h|v}.webm`
- 字幕: `p1/m1.ass`
- 配音: `gen/m1.mp3`（音量 1.0）
- 背景乐: `movies/alex-productions-acoustic-folk-friends.wav`（音量 0.5）
- 输出: `gen/m1_burn_{h|v}.mp4`

### 场景 B：多片段合并 — `movies/mergeVideo.mjs`

需要 JSON 配置文件（因为片段列表无法约定）：

```json
// movies/p1/m1m2_merge.json — audioVoice 自动推导：m1m2.ass → gen/m1m2.mp3
{
  "fps": 25,
  "subtitle": "movies/p1/m1m2.ass",
  "audioBg": "movies/alex-productions-acoustic-folk-friends.wav",

  "clips_h": ["movies/p1/gen/m1_h.webm", "movies/p1/gen/m2_h.webm"],
  "clips_v": ["movies/p1/gen/m1_v.webm", "movies/p1/gen/m2_v.webm"],
  "output_h": "movies/p1/gen/m1m2_merge_h.mp4",
  "output_v": "movies/p1/gen/m1m2_merge_v.mp4"
}
```

```bash
node movies/mergeVideo.mjs movies/p1/m1m2_merge.json
```

### 核心渲染函数 `renderVideo`

`burn.mjs` 和 `mergeVideo.mjs` 底层共用同一函数：

```
renderVideo({ clips, assPath, assRel, audioVoice, audioBg, output, targetW, targetH, fps })
  ├─ scale+pad 每段到目标分辨率
  ├─ 拼接视频流
  ├─ 烧录 ASS 字幕（相对路径避免 Windows 冒号问题）
  ├─ 混音（片段音频 + 配音 voice 1.0 + 背景乐 bg 0.5）
  └─ 输出 H.264 + AAC MP4
```

### 加入 HyperFrames 片头片尾

在 merge 配置的 `clips_h`/`clips_v` 数组开头或末尾加入路径即可。不存在的文件自动跳过。

---

## 项目目录结构

```
movies/
├── lib.mjs              ← 录制基类（不动）
├── mergeVideo.mjs        ← 合并/渲染函数（不动）
├── burn.mjs              ← 单文件烧录 CLI
├── generateAudio.mjs     ← ASS → TTS 音频生成
├── SKILL.md
├── old/
│
└── p1/                   ← 项目 1（仅源文件）
│   ├── m1.mjs            ← 录制脚本
│   ├── m1.ass            ← 字幕
│   ├── m2.mjs
│   ├── m2.ass
│   ├── m1m2.ass          ← 合并字幕（时间偏移后）
│   └── m1m2_merge.json   ← 合并配置（多片段才需要）
│   └── gen/              ← 所有生成文件（.gitignore）
│       ├── m1_h.webm         ← 录制原始
│       ├── m1_burn_h.mp4     ← 烧录成品
│       ├── m2_burn_h.mp4
│       ├── m1m2_merge_h.mp4  ← 合并成品
│       ├── m1.mp3            ← TTS 配音（audioVoice，与 ASS 同名）
│       ├── m2.mp3
│       ├── m1m2.mp3
│       └── m1_segments/      ← TTS 中间文件
│
└── p2/                   ← 项目 2（新建时复制 p1/ 结构）
    └── ...
```

---

## 完整制作检查清单

- [ ] 1. 在 `movies/` 下新建项目目录（如 `p2/`）
- [ ] 2. 写录制脚本（参考 `p1/m1.mjs`），import 用 `../lib.mjs`
- [ ] 3. 运行 `node movies/p2/m2.mjs` 录制横竖屏原始视频 → `gen/`
- [ ] 4. 写 ASS 字幕文件 `p2/m2.ass`（一份，`Alignment=2`）
- [ ] 5. 运行 `node movies/generateAudio.mjs movies/p2/m2.ass` 生成配音
- [ ] 6a. **单文件烧录**：`node movies/burn.mjs movies/p2/m2.mjs`（自动混入 bgm）
- [ ] 6b. **多片段合并**：写 JSON 配置 → `node movies/mergeVideo.mjs movies/p2/m2_merge.json`
- [ ] 8. 检查输出的 `_burn_h.mp4` / `_merge_h.mp4` 等时长、字幕、音频

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

### 6. TTS 时长与字幕时长需匹配

每段 TTS 生成的音频长度应 ≈ 对应字幕段的持续时间。若不匹配，用 FFmpeg 的 `atempo` 调速或裁剪。

---

## 关键 API 引用

| 作用 | API |
|------|-----|
| 检测模型加载 | `window.__modelStore.getState().loadedFiles.length >= 1` |
| 相机控制 | `window.__r3f_dev.camera.position / controls` |
| GSAP 动画（通用） | `window.__gsap.to(camera.position, { duration: 2, ease: 'power2.inOut', onUpdate, onComplete })` |
| GSAP zoom-out（拉远） | `cam.position → center + direction × distance × 1.5`，`gsap.to(cam.position, { duration: 2 })` |
| GSAP 爆炸图 | `window.__demoGSAPExplode?.()` → 注入面板 → 设轴 → 点击播放 |
| 材质预设 (postMessage) | `{ type: '3d-viewer', command: 'setPartMaterialByPreset', params: { preset: 'gold', partName } }` |
| 设置环境 (postMessage) | `{ type: '3d-viewer', command: 'setEnv', params: { value: 'hdr_url' } }` |
| 停止 auto-rotate（原生事件） | `window.dispatchEvent(new CustomEvent('stopRotate'))` |
| 开关旋转 (postMessage) | `{ type: '3d-viewer', command: 'startRotate' / 'stopRotate' }` |
| 阻止自动旋转 | URL `?AutoRotate=0` |
| recordVideo | `browser.newContext({ recordVideo: { dir, size } })` |
| 共享脚手架 | `movies/lib.mjs` → `makeMovie`, `startRecording`, `burnVideo`, `waitForModel`, `zoomUI` |
| 合并脚本 | `movies/mergeVideo.mjs` → `renderVideo`, `mergeVideo(config)` |
| 单文件烧录 | `movies/burn.mjs <script.mjs>` |
| TTS 工具 | `movies/generateAudio.mjs <subtitle.ass>` |

## 相关文件

- 共享脚手架：`movies/lib.mjs`
- 核心渲染：`movies/mergeVideo.mjs`（`renderVideo`, `mergeVideo`）
- 单文件烧录 CLI：`movies/burn.mjs`
- TTS 音频生成：`movies/generateAudio.mjs`
- 背景音乐：`movies/alex-productions-acoustic-folk-friends.wav`
- 项目示例：`movies/p1/`（m1 GSAP 相机动画 + 材质, m2 环境贴图 + 自动旋转, m1m2 合并）
- 旧版参考：`movies/old/movie8.mjs`
- Benchmark 报告：`movies/old/benchmark-report.md`

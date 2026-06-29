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

```js
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { makeMovie, startRecording, rotateModel, translateModel } from '../lib.mjs'

const projectDir = join(dirname(fileURLToPath(import.meta.url)), 'gen')

const subtitle = `
第一句台词
第二句台词
`;

makeMovie(
  import.meta.url,
  'model.glb',
  {},
  async (page, suffix, tPageOpen) => {
    await startRecording(page, tPageOpen, 2000)
    await page.waitForTimeout(2000)
    // GSAP animations here...
  },
  projectDir,
)
```

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

- `const subtitle = \`...\`` — 每行对应一条字幕。`(括号)` TTS 不朗读但显示；`((括号))` 不朗读，显示时剥括号
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

# URL 视频录制方案

## 背景

当前系统已支持两种视频生成模式：

| 模式 | 入口 | 数据源 |
|------|------|--------|
| **3D 录制** | `lib-electron.mjs` `makeMovie()` | Electron + Playwright 录制 3D 视口 |
| **图片幻灯片** | `generate-image-video.mjs` | 本地 PNG 截图文件 |

新增第三种模式：**URL 网页录制**，每个台词对应一个网站 URL，自动截取完整网页，生成带缓慢滚动效果的视频片段，拼接为带字幕/配音的视频。

---

## 脚本格式

在现有 `movies/eN/` 目录下，按已有惯例存放 `.mjs` 脚本。新增字段 `urls`：

```mjs
// movies/e2/m0.mjs

const subtitle = `
在MakerWorld上浏览3D模型
选择一个喜欢的模型下载
可以直接在网页上预览效果
`;

const urls = [
  'https://makerworld.com.cn/zh/3d-models',
  'https://makerworld.com.cn/zh/models/2649415-ha-lan-de#profileId-3060756',
  'https://makerworld.com.cn/zh/3d-models?q=benchy',
];
```

subtitle 行数必须等于 `urls.length`，一一对应。

---

## 尺寸规格

| 方向 | 分辨率 | 说明 |
|------|--------|------|
| 横屏 `_h` | **1920×1080** | 与 3D 录制横屏一致 |
| 竖屏 `_v` | **1080×1920** | 全高清竖屏（非 1080×1440，竖屏要更高） |

竖屏使用 1080×1920 而非 3D 录制的 1080×1440，因为网页内容通常纵向滚动，更高的画幅能展示更多内容。

---

## 核心流程

```
脚本 (.mjs)
  │
  ├─→ [Step 1] Pre-generate TTS
  │     node movies/pregen-tts.mjs <script.mjs>
  │     → tts-cache + tts-timing.json
  │
  ├─→ [Step 2] 生成字幕 + 音频
  │     node movies/generate-subtitle.mjs <script.mjs>
  │     → .subtitle（每行起止时间）+ .mp3（完整语音）
  │
  ├─→ [Step 3] Playwright 全网页截图
  │     每个 URL 截取完整网页（fullPage）
  │     → {scriptName}_{NNNN}_h_full.png（横屏全页）
  │     → {scriptName}_{NNNN}_v_full.png（竖屏全页）
  │
  ├─→ [Step 4] FFmpeg: 每张截图生成一段滚动视频片段
  │     首屏停留 1 秒 → 缓慢向下滚动 → 输出 .webm 片段
  │     → gen/{scriptName}_{NNNN}_h.webm
  │     → gen/{scriptName}_{NNNN}_v.webm
  │
  ├─→ [Step 5] FFmpeg: 拼接所有片段 → 完整视频
  │     → gen/{scriptName}_h.webm
  │     → gen/{scriptName}_v.webm
  │
  └─→ [Step 6] 烧录字幕
       renderVideo()
       → gen/{scriptName}_burn_h.mp4
       → gen/{scriptName}_burn_v.mp4
```

### 关键：视频时长 = 语音总时长

- **与 image 模式完全一致**，没有同步点标记。
- 每段滚动视频片段的时长等于对应台词语音时长。
- `generate-subtitle.mjs` 对于无 `const image = '...'` 但有 `const urls = [...]` 的脚本，同样跳过视频检测路径。

---

## Step 3: 全网页截图

使用 Playwright 的 `fullPage: true` 截取完整网页：

```js
const page = await browser.newPage({
  viewport: { width: 1920, height: 1080 },  // 横屏用 1920×1080 viewport
})
await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 })
await page.waitForTimeout(2000)  // 等待渲染稳定
await page.screenshot({ path: outputPath, type: 'png', fullPage: true })
```

截图文件：

```
{scriptName}_0000_h_full.png     — 第0个URL，全页截图（宽1920，高=全页高度）
{scriptName}_0000_v_full.png     — 第0个URL，全页截图（宽1080，高=全页高度）
{scriptName}_0001_h_full.png
...
```

> **提示**：截全页前等待 2 秒让异步内容加载完，如果页面有懒加载图片，可能需要额外滚动触发。

---

## Step 4: 滚动视频片段

每张全页截图生成一段滚动视频片段，播放时长 = 对应台词语音时长。

### 滚动规则

```
第一秒     → 显示网页首屏（scrollY = 0）
一秒后     → 开始缓慢向下滚动
滚动速度   → 视口高度 × scrollRatio（像素/秒，横屏默认 3%，竖屏默认 2%）
```

### 计算方法

```
全页高度       = fullH（截图像素高度）
视口高度       = viewH（横屏1080，竖屏1920）
可滚动距离     = scrollable = max(0, fullH - viewH)
滚动速度       = speed = viewH × scrollRatio（像素/秒，横屏默认 0.03，竖屏默认 0.02）
最大可滚时间   = scrollable / speed (秒)
```

如果 `speed` 计算值 ≤ 0（页面无需滚动），则整段视频只显示首屏（静止画面）。

### FFmpeg 实现

使用 FFmpeg 的 `crop` 滤镜随时间改变裁剪窗口位置：

```bash
ffmpeg -y -loop 1 -i 0000_h_full.png \
  -vf "
    crop=${VIEW_W}:${VIEW_H}:0:
    'min(0, max(0, (t-1)*${SCROLL_SPEED}))'"
  -t ${DURATION} \
  -c:v libvpx-vp9 -b:v 8M -pix_fmt yuv420p \
  0000_h.webm
```

- `t` = 当前时间（秒）
- `(t-1)` = 过了第1秒后的时间偏移
- `max(0, ...)` = 不往负方向滚（不会滚到页面以上）
- `min(0, max(...))` — 不对，应该是：
  - `y = min(fullH - viewH, max(0, (t-1) * speed))`
  - 确保不滚出底部

修正后的表达式：

```bash
crop=${VIEW_W}:${VIEW_H}:0:'min(${fullH - viewH}, max(0, (t-1)*${scrollSpeed}))'
```

### 边界情况

| 情况 | 表现 |
|------|------|
| 全页高度 ≤ 视口高度 | 无需滚动，整段静止显示首屏 |
| 语音时长 ≤ 1 秒 | 全程只显示首屏 |
| 语音时长不足以滚到底 | 滚到哪算哪，到了底部就停住 |

---

## Step 5: 拼接所有片段

所有片段都是同尺寸、同编码（libvpx-vp9）的 `.webm`，用 FFmpeg concat demuxer 拼接：

```bash
# 生成 concat.txt
file '0000_h.webm'
file '0001_h.webm'
file '0002_h.webm'

ffmpeg -y -f concat -safe 0 -i concat.txt \
  -c copy output_h.webm
```

`-c copy` 直接复制流，无需重新编码，速度快且无损。

---

## 文件变更

| 文件 | 状态 | 说明 |
|------|------|------|
| `movies/generate-url-video.mjs` | **新建** | URL 截图 → 滚动片段 → 拼接主逻辑 |
| `docs/url-video-recording.md` | 本文 | 方案文档 |
| `movies/burn.mjs` | **改 ~3 行** | 检测条件增加 `isUrlScript` |

---

## 使用方式

```bash
# 全流程（截图 + 滚动片段 + 拼接 + TTS + 字幕 + 烧录）
node movies/burn.mjs movies/e2/m0.mjs -g

# 仅截图 + 生成视频（不烧录）
node movies/generate-url-video.mjs movies/e2/m0.mjs --no-burn

# 仅竖屏
node movies/burn.mjs movies/e2/m0.mjs -v
```

---

## 代码骨架

```mjs
// generate-url-video.mjs

import { existsSync, mkdirSync, rmSync, renameSync, readdirSync } from 'fs'
import { resolve, dirname, basename, extname, join } from 'path'
import { spawnSync } from 'child_process'
import { chromium } from 'playwright'
import * as lib from './lib.mjs'
import { parseSubtitleLines } from './generate-subtitle.mjs'

// ── 配置 ──
const SCROLL_RATIO = 0.10  // 每秒滚动距离 = 视口高度 × scrollRatio
const STATIC_DURATION = 1  // 首屏停留秒数

// ── 解析脚本 ──
function parseUrls(scriptPath) {
  const src = readFileSync(scriptPath, 'utf-8')
  const m = src.match(/(?:^|\n)const\s+urls\s*=\s*(\[[\s\S]*?\])\s*;?\s*\n/)
  if (!m) { console.error('No urls array found'); process.exit(1) }
  return JSON.parse(m[1])
}

function probeImageDimensions(imagePath) {
  const r = spawnSync('ffprobe', [
    '-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height',
    '-of', 'csv=p=0', imagePath,
  ], { stdio: 'pipe', timeout: 10000 })
  const [w, h] = r.stdout.toString().trim().split(',').map(Number)
  return w && h ? { width: w, height: h } : null
}

function buildScrollClip(fullImagePath, outputPath, viewW, viewH, duration, scrollSpeed) {
  const scrollDistance = scrollSpeed > 0 && duration > STATIC_DURATION
    ? scrollSpeed * (duration - STATIC_DURATION)
    : 0

  const args = [
    '-y', '-loop', '1', '-i', fullImagePath,
    '-vf', `crop=${viewW}:${viewH}:0:'min(${scrollDistance}, max(0, (t-${STATIC_DURATION})*${scrollSpeed}))'`,
    '-t', duration.toFixed(3),
    '-c:v', 'libvpx-vp9', '-b:v', '8M',
    '-pix_fmt', 'yuv420p',
    outputPath,
  ]
  const r = spawnSync('ffmpeg', args, { stdio: 'pipe', timeout: 120000 })
  return r.status === 0
}

// ── 主流程 ──
async function generateUrlVideo(scriptPath) {
  const scriptDir = dirname(scriptPath)
  const scriptName = basename(scriptPath, extname(scriptPath))
  const genDir = join(scriptDir, 'gen')
  mkdirSync(genDir, { recursive: true })

  // 1. 解析台词和 URLs
  const lines = parseSubtitleLines(scriptPath)
  const urls = parseUrls(scriptPath)
  if (lines.length !== urls.length) {
    console.error(`subtitle lines (${lines.length}) != urls (${urls.length})`)
    process.exit(1)
  }

  // 2. 解析 TTS 时长（走 image 模式流程）
  // ...（调用 generateSubtitle 得到 imageDurations）

  // 3. 浏览器截图
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: false,
  })

  try {
    const orientations = [
      { suffix: '_h', width: 1920, height: 1080 },
      { suffix: '_v', width: 1080, height: 1920 },
    ]

    for (const orient of orientations) {
      for (let i = 0; i < urls.length; i++) {
        const fullPng = join(genDir, `${scriptName}_${String(i).padStart(4, '0')}${orient.suffix}_full.png`)
        const clipWebm = join(genDir, `${scriptName}_${String(i).padStart(4, '0')}${orient.suffix}.webm`)

        // 截图
        if (!existsSync(fullPng)) {
          const page = await browser.newPage({
            viewport: { width: orient.width, height: orient.height },
          })
          await page.goto(urls[i], { waitUntil: 'networkidle' })
          await page.waitForTimeout(2000)
          await page.screenshot({ path: fullPng, fullPage: true })
          await page.close()
        }

        // 生成滚动视频片段
        if (!existsSync(clipWebm)) {
          const dims = probeImageDimensions(fullPng)
          const scrollPixels = dims.height - orient.height
          const scrollSpeed = Math.round(scrollPixels * SCROLL_RATIO)
          buildScrollClip(fullPng, clipWebm, orient.width, orient.height, imageDurations[i], scrollSpeed)
        }
      }
    }
  } finally {
    await browser.close()
  }

  // 4. 拼接所有片段 → 完整视频（用 concat demuxer）
  // ... concat all clips per orientation
}
```

---

## 浏览器启动策略

### 使用系统 Chrome（带登录信息）

```js
const browser = await chromium.launch({
  channel: 'chrome',   // 使用系统 Chrome 用户数据目录
  headless: false,     // 有头模式
})
```

### 检测 Chrome 是否已在运行

```js
import { execSync } from 'child_process'
try {
  const list = execSync('tasklist /fi "IMAGENAME eq chrome.exe"', { encoding: 'utf-8' })
  if (list.includes('chrome.exe')) {
    console.error('错误：Chrome 正在运行，请先关闭 Chrome 再运行此脚本')
    console.error('（Playwright 需要独占用户数据目录）')
    process.exit(1)
  }
} catch { /* tasklist 不可用，跳过检测 */ }
```

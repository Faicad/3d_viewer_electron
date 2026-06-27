# 第4种视频类型：HyperFrames 动画

## 1. 现有 3 种视频类型

| # | 类型 | 检测依据 | 脚本示例 | 生成脚本 |
|---|------|---------|---------|---------|
| 1 | **3D 录制** | `import * as lib` + `lib.makeMovie()` | `e1/m5.mjs` | 直接 `node` 执行 |
| 2 | **截图合成** | `const image = '...'` | `e1/m0.mjs` | `generate-image-video.mjs` |
| 3 | **URL 网页** | `const urls = [...]` | `e1/m1.mjs` | `generate-url-video.mjs` |

## 2. 新增第4种：HyperFrames 动画

**核心思想**：脚本导出 `hyperframes()` 函数，返回一个 HTML composition。`generate-hyper-video.mjs` 调用 HyperFrames 引擎逐帧渲染为视频。

### 2.1 脚本格式

```javascript
// movies/e1/m0_2.mjs
const subtitle = `
即将结束支持，只剩三天时间了
`;

// 可选：静态图片底图
const image = 'movies/screenshot/3D查看器';

// ─── HyperFrames 动画定义 ───
// 导出函数，接收运行时参数，返回完整 HTML composition 字符串
// 格式完全兼容 HyperFrames composition 规范（data-composition-id, GSAP timeline, __timelines）
export function hyperframes({ imagePath, width, height, duration, fps, index, totalDuration }) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=${width}, height=${height}">
  <script src="gsap.min.js"></script>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    html,body{width:${width}px;height:${height}px;overflow:hidden}
    .bg{position:absolute;inset:0;
        background:url('${imagePath}') no-repeat center/cover}
    .label{position:absolute;top:35%;left:50%;transform:translate(-50%,-50%);
           color:#ff4444;font-size:64px;font-weight:bold;
           text-shadow:0 4px 12px rgba(0,0,0,.9);
           font-family:'Microsoft YaHei','PingFang SC',sans-serif}
  </style>
</head>
<body>
  <div id="root" data-composition-id="root" data-start="0"
       data-duration="${duration}" data-width="${width}" data-height="${height}">
    <div class="bg"></div>
    <div id="endDate" style="opacity:0;position:absolute;top:35%;left:50%;
         transform:translate(-50%,-50%);color:#ff4444;font-size:64px;
         font-weight:bold;text-shadow:0 4px 12px rgba(0,0,0,.9)">2026年6月30日结束</div>
  </div>
  <script>
    var tl = gsap.timeline({paused:true});
    tl.fromTo('#endDate', {opacity:0,y:30},
              {opacity:1,y:0,duration:1,ease:'power2.out'});
    window.__timelines = {root:tl};
  </script>
  <script src="hyperframe.runtime.iife.js"></script>
</body>
</html>`;
}
```

### 2.2 `hyperframes()` 参数

| 参数 | 类型 | 说明 |
|------|------|------|
| `imagePath` | `string \| null` | 图片绝对路径（脚本有 `const image` 时提供），无底图时为 `null` |
| `width` | `number` | 视频宽度（如 1920 / 1080） |
| `height` | `number` | 视频高度（如 1080 / 1920） |
| `duration` | `number` | 本段时长（秒），由 TTS 实测时长决定 |
| `fps` | `number` | 帧率（25/30） |
| `index` | `number` | 段索引（0-based） |
| `totalDuration` | `number` | 所有段总时长 |

### 2.3 无底图的纯动画

`image` 可不传，此时 `imagePath` 为 `null`，composition 可纯用 CSS/Canvas 做背景：

```javascript
export function hyperframes({ width, height, duration, fps, index }) {
  return `<!DOCTYPE html>
<html>
<head>
  <style>
    body{width:${width}px;height:${height}px;overflow:hidden;
         background:linear-gradient(135deg,#0d0d2b,#1a0a3d)}
    .text{color:#fff;font-size:72px;font-weight:bold;
          position:absolute;top:50%;left:50%;transform:translate(-50%,-50%)}
  </style>
</head>
<body>
  <div id="root" data-composition-id="root" data-start="0"
       data-duration="${duration}" ...>
    <div id="t" class="text">纯动画标题</div>
  </div>
  <script>/* GSAP timeline */</script>
</body>
</html>`;
}
```

## 3. 流程对比

```
现有流程（3种类型）：
──────────────────────────────────────────────────
script.mjs ─→ burn.mjs 检测类型 ─→ 对应生成器 ─→ gen/*.webm ─→ burn ─→ merge
                                      │
                    ┌─────────────────┼──────────────────┐
                    ▼                 ▼                  ▼
              generate-         generate-           直接 node
              image-video       url-video           执行（3D录制）

新增流程：
──────────────────────────────────────────────────
script.mjs ─→ burn.mjs 检测类型 ─→ generate-hyper-video.mjs ─→ gen/*.webm ─→ burn ─→ merge
                    ▲                  │
              检测 pattern:       动态 import() 脚本
              export function     调用 hyperframes() 生成 HTML
              hyperframes         用 @hyperframes/producer 渲染
```

## 4. 核心文件设计

### 4.1 `generate-hyper-video.mjs` — 新增生成器

```javascript
// ── 主流程 ──
async function generateHyperVideo(scriptPath) {
  const genDir = join(dirname(scriptPath), 'gen')
  const scriptName = basename(scriptPath, '.mjs')

  // 1. 动态 import 获取 hyperframes() 函数
  const mod = await import(pathToFileURL(scriptPath).href)
  const hyperframesFn = mod.hyperframes

  // 2. 解析 subtitle + 可选 image + config
  const subtitleLines = parseSubtitleLines(scriptPath)
  const imageBase = parseImageBase(scriptPath)  // 可能为 null
  const segmentConfig = parseScriptConfig(scriptPath)

  // 3. 生成 TTS 字幕 + 音频（同 generate-image-video.mjs）
  const result = await generateSubtitle(scriptPath, { ttsProvider })
  const segments = result.segments
  const imageDurations = result.imageDurations

  // 4. 扫描图片（如果有 const image）
  let perSegmentImages = []
  if (imageBase) {
    for (const { suffix } of orientations) {
      const images = scanOrientationImages(imageBase, suffix)
      // 构建 per-segment 映射（同 generate-image-video 的逻辑）
      perSegmentImages = buildPerSegmentList(images, segments, segmentConfig)
    }
  }

  // 5. 对每段生成 HTML + HyperFrames 渲染
  for (const { width, height, suffix } of orientations) {
    const clipDir = join(genDir, `.hf_${scriptName}${suffix}`)
    mkdirSync(clipDir, { recursive: true })

    const clipPaths = []
    for (let i = 0; i < segments.length; i++) {
      // 调用用户的 hyperframes() 函数 → HTML
      const html = hyperframesFn({
        imagePath: perSegmentImages[i] || null,
        width, height,
        duration: imageDurations[i],
        fps,
        index: i,
        totalDuration: imageDurations.reduce((a, b) => a + b, 0),
      })

      // 写入临时 composition
      const compDir = join(clipDir, `seg_${i}`)
      mkdirSync(compDir, { recursive: true })
      writeFileSync(join(compDir, 'index.html'), html)
      // 复制 runtime 依赖
      copyFileSync(join(TEMPLATES_DIR, 'gsap.min.js'), join(compDir, 'gsap.min.js'))
      copyFileSync(join(TEMPLATES_DIR, 'hyperframe.runtime.iife.js'),
                   join(compDir, 'hyperframe.runtime.iife.js'))
      // 如果有底图，复制图片到 compDir
      if (perSegmentImages[i]) {
        copyFileSync(perSegmentImages[i], join(compDir, 'bg.png'))
      }

      // HyperFrames 渲染
      const segOutput = join(clipDir, `seg_${i}.webm`)
      const job = createRenderJob({
        fps: { num: fps, den: 1 },
        quality: 'standard',
        format: 'webm',
        producerConfig: resolveConfig({ browserGpuMode: 'software' }),
      })
      await executeRenderJob(job, compDir, segOutput)
      clipPaths.push(segOutput)
    }

    // 6. FFmpeg concat 所有段 → 最终 .webm
    concatClips(clipPaths, join(genDir, `${scriptName}${suffix}.webm`))
    rmSync(clipDir, { recursive: true, force: true })
  }

  // 7. 烧录字幕（同现有）
  lib.burnVideo(scriptUrl, genDir)
}
```

**为什么逐段渲染而非整个 composition 一次渲染？**

- 每段时长由 TTS 实测决定，各段不同
- 逐段渲染后 concat，与现有 `buildImageVideo()` 的拼接逻辑一致
- 支持 `config[].animation` / `pre_image` 等现有特性
- 出错时只需重渲染单段

### 4.2 `burn.mjs` — 修改检测逻辑

新增 4 种类型检测，先检查 HyperFrames 再检查其他：

```javascript
const src = readFileSync(absPath, 'utf-8')
const isHyperScript = /export\s+function\s+hyperframes\s*\(/.test(src)
const isImageScript = !isHyperScript && /(?:^|\n)const\s+image\s*=/.test(src)
const isUrlScript = !isHyperScript && /(?:^|\n)const\s+urls\s*=/.test(src)

// Step 1: Generate video
if (isHyperScript) {
  // HyperFrames 动画
  const r = spawnSync('node', [
    'movies/generate-hyper-video.mjs', absPath, ...childFlags, ...ttsArgs,
  ], { stdio: 'inherit', timeout: 600000 })
} else if (isUrlScript) {
  // ... 现有 URL 逻辑 ...
} else if (isImageScript) {
  // ... 现有 Image 逻辑 ...
} else {
  // ... 现有 3D 逻辑 ...
}
```

**检测优先级**：先检测 HyperFrames（`export function hyperframes`），因为 HyperFrames 脚本可能同时有 `const image`（可选底图）。检测到后就按 HyperFrames 处理，不再走 image 分支。

### 4.3 模板目录

```
movies/templates/
├── gsap.min.js                          ← GSAP（离线，避免 CDN 依赖）
├── hyperframe.runtime.iife.js           ← HyperFrames runtime（由 HF 构建产出）
├── annotation-base.html                 ← 基础标注模板（见下）
└── presets/
    ├── text-overlay.html                ← 纯文字叠加
    ├── arrow-highlight.html             ← 箭头+高亮框
    └── kinetic-type.html               ← 动态文字排版
```

**模板示例 `annotation-base.html`**（用 `{{VAR}}` 占位）：

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width={{WIDTH}}, height={{HEIGHT}}">
  <script src="gsap.min.js"></script>
  <style>
    /* 预置标注样式 */
    *{margin:0;padding:0;box-sizing:border-box}
    html,body{width:{{WIDTH}}px;height:{{HEIGHT}}px;overflow:hidden}
    .bg{position:absolute;inset:0;background:url('{{IMAGE}}') center/cover no-repeat}
    .hf-arrow{/* ... */}
    .hf-highlight{/* ... */}
    .hf-text{color:#fff;font-size:36px;text-shadow:0 2px 8px rgba(0,0,0,.9)}
  </style>
</head>
<body>
  <div id="root" data-composition-id="root" data-start="0"
       data-duration="{{DURATION}}" data-width="{{WIDTH}}" data-height="{{HEIGHT}}">
    <div class="bg"></div>
    {{ANNOTATIONS_HTML}}
  </div>
  <script>{{TIMELINE_JS}}</script>
  <script src="hyperframe.runtime.iife.js"></script>
</body>
</html>
```

## 5. `m0_2.mjs` 转换示例

### 原始脚本

```javascript
// e1/m0_2.mjs — 截图合成类型
const subtitle = `
即将结束支持，只剩三天时间了
`;
const image = 'movies/screenshot/3D查看器';
// 在屏幕居中靠上的位置显示一行字幕'2026年6月30日结束'
```

`m0_2.mjs` 目前是截图合成类型（type 2），但有一行注释需求：在画面居中靠上叠加文字"2026年6月30日结束"。现有方案需要 OCR 截图或 `_marked_N.png`，都无法做动画。

### 转换为 HyperFrames 类型

```javascript
// e1/m0_2.mjs — 第4种类型：HyperFrames 动画
const subtitle = `
即将结束支持，只剩三天时间了
`;

const image = 'movies/screenshot/3D查看器';

export function hyperframes({ imagePath, width, height, duration, fps }) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=${width}, height=${height}">
  <script src="gsap.min.js"></script>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    html,body{width:${width}px;height:${height}px;overflow:hidden;background:#000;
              font-family:'Microsoft YaHei','PingFang SC',sans-serif}
    .bg{position:absolute;inset:0;
        background:url('${imagePath}') no-repeat center/cover}
    .overline{position:absolute;left:50%;top:30%;transform:translate(-50%,-50%);
              font-size:56px;font-weight:bold;color:#ff6b35;
              text-shadow:0 4px 20px rgba(0,0,0,.95),
                          0 0 60px rgba(255,107,53,.3);
              white-space:nowrap;opacity:0;
              letter-spacing:4px}
    .subline{position:absolute;left:50%;top:42%;transform:translate(-50%,-50%);
             font-size:28px;font-weight:normal;color:rgba(255,255,255,.7);
             text-shadow:0 2px 12px rgba(0,0,0,.9);opacity:0}
  </style>
</head>
<body>
  <div id="root" data-composition-id="root" data-start="0"
       data-duration="${duration}" data-width="${width}" data-height="${height}">
    <div class="bg"></div>
    <div class="overline" id="mainText">⚠ 2026年6月30日结束</div>
    <div class="subline" id="subText">Windows 3D 查看器即将停止支持</div>
  </div>
  <script>
    var tl = gsap.timeline({paused:true});
    tl.fromTo('#mainText', {opacity:0,y:40,scale:.8},
              {opacity:1,y:0,scale:1,duration:.8,ease:'back.out(1.7)'});
    tl.fromTo('#subText', {opacity:0,y:20},
              {opacity:1,y:0,duration:.6,ease:'power2.out'}, '-=0.3');
    tl.to('#mainText', {scale:1.05,duration:2,repeat:-1,yoyo:true,
                        ease:'sine.inOut'}, 1.5);
    window.__timelines = {root:tl};
  </script>
  <script src="hyperframe.runtime.iife.js"></script>
</body>
</html>`;
}
```

**效果**：底图显示截图，"2026年6月30日结束" 从下方弹入（back.out 缓动），接着副标题淡入，主标题持续脉冲缩放。

## 6. 兼容性矩阵

| 现有流程组件 | 兼容性 | 说明 |
|-------------|--------|------|
| `const subtitle` | ✅ 完全兼容 | 解析方式不变 |
| `const image`（可选） | ✅ 兼容 | 无 image 时 `imagePath=null`，纯动画 |
| `const config[].animation = 'zoom'` | ✅ 可通过 GSAP 实现 | zoom 效果由用户 GSAP timeline 控制 |
| `const config[].pre_image` | ✅ 可选 | 如需复用图片，在 hyperframes() 中自己控制 |
| `generateSubtitle()` → `.subtitle` + `.mp3` | ✅ 完全兼容 | 复用现有 TTS 流程 |
| `burnVideo()` 烧录字幕 | ✅ 完全兼容 | 输出文件命名不变（`{name}_{h\|v}.webm`） |
| `mergeVideo.mjs` 合并 | ✅ 完全兼容 | merge 只认 `_burn_h.mp4`，不关心来源 |
| 方向过滤 `-h` / `-v` | ✅ 完全兼容 | orientation 循环在外部 |
| 尺寸 preset `-s` / `-m` / `-g` | ✅ 兼容 | 传递 `width`/`height` 给 hyperframes() |

## 7. 实现路线图

### Phase 1：环境准备

1. 在项目中安装 `@hyperframes/producer`（或确认独立安装路径）
2. 构建或获取 `hyperframe.runtime.iife.js`（HyperFrames 核心 runtime）
3. 准备 `gsap.min.js` 离线版
4. 测试：手动写一个 composition HTML，用 CLI 渲染成功

### Phase 2：核心实现

1. 写 `generate-hyper-video.mjs`：可处理单段/多段 subtitle
2. 集成 TTS 生成（复用 `generateSubtitle()`）
3. 扫描图片（复用 `scanOrientationImages()` 和 `buildPerSegmentList()`）
4. 调用 `@hyperframes/producer` SDK 渲染每段
5. FFmpeg concat 各段 → 完整 `.webm`

### Phase 3：Pipeline 集成

1. 改 `burn.mjs`：检测 `export function hyperframes`
2. 验证 `burnVideo()` 字幕烧录正常
3. 验证 `mergeVideo.mjs` 合并正常
4. 验证 `--no-tts` / `--no-burn` 等 flag

### Phase 4：模板 + 文档

1. 提供 `movies/templates/` 预置模板（annotation-base, text-overlay 等）
2. 写脚本示例文档
3. 支持 `const hyperframes` 模板字符串简化写法（可选，不强制）

## 8. 注意事项

1. **渲染速度**：HyperFrames 逐帧截图比 FFmpeg 直接拼接慢。标清 30fps 约 1-2 秒/帧，60 秒视频约 2-3 分钟。仅建议动画场景使用。

2. **GSAP 许可证**：基础功能免费。项目中可离线 vendor `gsap.min.js`。

3. **Node.js 版本**：HyperFrames 需要 Node.js ≥ 22。如果当前项目版本不符，CLI 子进程方案可绕过。

4. **image 路径解析**：`hyperframes()` 接收的 `imagePath` 是绝对路径。HTML 中引用时需要用 `file://` 协议或复制图片到 composition 目录。

5. **逐段 vs 整段**：当前设计逐段渲染后 concat，好处是复用现有图片扫描/映射逻辑，坏处是每段都要启动一次 Chromium（启动慢）。优化方向：缓存 browser 实例，所有段在同一个 session 内完成。

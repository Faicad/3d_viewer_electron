# 第4种视频类型：HTML 动画

## 1. 现有 3 种视频类型

| # | 类型 | 检测依据 | 生成脚本 |
|---|------|---------|---------|
| 1 | **3D 录制** | `import * as lib` + `lib.makeMovie()` | 直接 `node` 执行 |
| 2 | **截图合成** | `const image = '...'` | `generate-image-video.mjs` |
| 3 | **URL 网页** | `const urls = [...]` | `generate-url-video.mjs` |
| 4 | **HTML 动画** | `export function scene` | `generate-html-video.mjs` |

## 2. 核心思想

脚本导出 `scene()` 函数，每段调用一次，返回该段的 HTML + GSAP 动画代码。`generate-html-video.mjs` 将所有段的 HTML 组装成一个多页 composition，用 Playwright 录制整个 GSAP 时间线。

**与设计稿的区别**：未使用 `@hyperframes/producer` SDK 或 `hyperframe.runtime.iife.js`。渲染直接在 Playwright 中播放 GSAP timeline 并录制屏幕，耗时与视频时长相当（1:1）。

## 3. 脚本格式

```javascript
// movies/e1/m0.mjs
const subtitle = `
只剩三天时间
Windows自带的3D查看器
即将结束支持
`;

const image = 'movies/screenshot/3D查看器';

export function scene({ imagePath, width, height, duration, fps, index, startTime, totalDuration }) {
  const bg = `<div style="position:absolute;inset:0;background:#d8d8d8 url('${imagePath}') no-repeat center / contain"></div>`;
  // ...
  return { html, animation }
}
```

### `scene()` 参数

| 参数 | 类型 | 说明 |
|------|------|------|
| `imagePath` | `string \| null` | 相对路径 `bg_N.png`（自动从截图目录复制），无底图时为 `null` |
| `width` | `number` | 视频宽度（如 1920 / 1080） |
| `height` | `number` | 视频高度（如 1080 / 1920） |
| `duration` | `number` | 本段时长（秒），由 TTS 实测时长决定 |
| `fps` | `number` | 帧率（25/30） |
| `index` | `number` | 段索引（0-based），用于分段条件渲染 |
| `startTime` | `number` | 本段在全局时间线上的起始时间（秒） |
| `totalDuration` | `number` | 所有段总时长 |

### 返回值

```javascript
// 有动画
return { html: '<div>...</div>', animation: '  tl.to(...)\n' }

// 无动画
return { html: '<div>...</div>' }
// 或直接返回 html 字符串
return '<div>...</div>'
```

`animation` 字符串拼接 GSAP 代码到全局时间线，可直接引用当前段 HTML 中的元素 ID。

## 4. 图片扫描机制

脚本声明 `const image = 'movies/screenshot/基路径'`，系统自动扫描对应文件：

```
movies/screenshot/
├── Downloads_h.png      ← 第1次截图（横屏）
├── Downloads_v.png      ← 第1次截图（竖屏）
├── Downloads_2_h.png    ← 第2次截图
├── Downloads_2_v.png
├── Downloads_3_h.png    ← 第3次截图
└── Downloads_3_v.png
```

每段按顺序分配一张图，不足时重复最后一张。合成时复制为 `bg_0.png`、`bg_1.png`... 到临时目录，`scene()` 中的 `imagePath` 即此相对路径。

## 5. 常用模式

### 5.1 背景 + 淡入文字

```javascript
export function scene({ imagePath, startTime }) {
  const bg = `<div style="position:absolute;inset:0;background:#d8d8d8 url('${imagePath}') no-repeat center / contain"></div>`;
  return {
    html: bg + `<div id="t" style="...opacity:0">动画文字</div>`,
    animation: `  tl.to('#t', {opacity:1,duration:0.8}, ${(startTime + 0.5).toFixed(3)});\n`,
  };
}
```

### 5.2 多图切换（同一段内）

```javascript
if (index === 0) {
  html = `<div id="i0" style="...url('bg_0.png')"></div>`
       + `<div id="i1" style="...url('bg_1.png');opacity:0"></div>`
       + `<div id="i2" style="...url('bg_2.png');opacity:0"></div>`;
  animation = `  tl.set('#i0', {opacity:0}, 1.0);\n`
            + `  tl.set('#i1', {opacity:1}, 1.0);\n`
            + `  tl.set('#i1', {opacity:0}, 1.3);\n`
            + `  tl.set('#i2', {opacity:1}, 1.3);\n`;
}
```

### 5.3 跨段动效延续

模块级变量记录前段信息，后段据此恢复状态：

```javascript
let _seg1Start = 0;
export function scene({ index, startTime, totalDuration }) {
  if (index === 1) _seg1Start = startTime;
  if (index === 2) {
    const dotBase = _seg1Start + 2.0;
    // 继续逐点动画...
  }
}
```

## 6. 流程

```
burn.mjs 检测类型
    │
    ▼ (export function scene 匹配)
generate-html-video.mjs
    ├── 动态 import → scene()
    ├── generateSubtitle() → segments + 时长
    ├── scanOrientationImages() → 每段图片
    ├── 每段调用 scene({ ... })
    │   └── 收集 { html, animation }
    ├── 组装 composition HTML + GSAP timeline
    ├── Playwright 录制 → .webm
    └── burnVideo() → 烧录字幕 → _burn.mp4
```

## 7. 文件结构

```
movies/
├── generate-html-video.mjs    ← 生成器
├── burn.mjs                    ← 入口（检测 + 调度）
├── templates/
│   └── gsap.min.js             ← GSAP（离线 vendor）
└── e1/
    ├── m0.mjs                  ← scene() 示例：淡入文字 + 光标动效
    ├── m1.mjs                  ← scene() 示例：逐字显示
    ├── m2.mjs                  ← scene() 示例：多图切换 + 逐点动画
    └── gen/                    ← 输出目录 (.webm / .mp4)
```

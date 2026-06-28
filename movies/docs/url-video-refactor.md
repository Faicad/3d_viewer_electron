# URL 视频生成方案重构

## 核心理念

> **做视频，不是做交互模拟。**
>
> 目标是产出一个"看起来像在操作网页"的视频，而不是真正操作网页。视频观众看不到真实的鼠标指针、看不到网络加载过程、看不到浏览器 UI。所以：
> - 页面之间的切换用视频过渡效果（滑入/淡入）更清晰
> - 点击效果用高亮圈 + 波纹代替真实点击，观众反而看得更清楚
> - "输入文字"用 GSAP 逐字显示预置文本，比真实键盘输入更快、更可控
>
> **截图是素材，GSAP 是导演，Playwright 只用于截图 + 录制最终 HTML。**

---

## 1. 背景

当前 URL 录制模式（`generate-url-video.mjs`）存在核心痛点：

| 痛点 | 表现 |
|------|------|
| **效果单调** | 只有"全页截图 → 定速向下滚动"一种动画，没有鼠标移动、点击高亮、URL 跳转过渡等交互表现 |


需要一套更灵活、可扩展的方案。

---

## 2. 方案概览

| 维度 | 方案 A：截图 + HTML 动画 |
|------|--------------------------|
| **核心思路** | 只用 Playwright 截图一次，后续动画由 HTML+GSAP 模拟 |
| **实时网络** | 不需要（截图后就离线） |
| **动画丰富度** | 中等 — 内置滚动、点击、平移等模板 |
| **定位方式** | Playwright DOM API 直接获取元素坐标（截图阶段） |
| **运行速度** | 快 — 一次截图即可，HTML 渲染在本地 |
| **被封风险** | 无 — 截图后离线运行 |
| **依赖** | Node.js + Playwright（一次性截图 + 最终录制） |
| **视频效果** | 可控、干净、无浏览器 UI/加载态干扰 |

---

## 3. 方案 A：截图 + HTML 动画（实现方案）

### 3.1 核心流程：三步走

生成 URL 视频分为三个阶段：

#### 第一步：用户提供 URL + 需求描述

用户编写 `.mjs` 脚本，提供目标 URL 和文本形式的需求描述。需求描述描述用户在页面上的操作意图。可引用台词序号（首句=第0句，第二句=第1句，以此类推）来定位时间点。

```mjs
const subtitle = `
海外用户直接Github获取
国内用户前往Gitcode下载
文件名带cn的是中文版
建议你赶紧收藏自取！
`;

const urls = [
  {
    url: 'https://github.com/faicad/3d_viewer_electron/',
    description: '首句台词1秒后高亮显示右侧Releases区域，加一个文字标注"这里下载"',
  },
  {
    url: 'https://gitcode.com/Faicad/3d_viewer_electron',
    description: '第二句台词1秒后，页面缓慢滚动到"查看全部发行版"。第三句台词开始时显示一个1秒的点击动画',
  },
  {
    url: 'https://gitcode.com/Faicad/3d_viewer_electron/releases/',
    description: '点击动画结束后，加载本页面。本页面显示1秒后，高亮"3D_Viewer_1.7.2_x64_cn_Setup.exe"下载链接',
  },
];
```

#### 第二步：AI Agent（开发者）截图 + 解析需求 + 定位元素

AI Agent 即开发者本人（借助 LLM，如 Claude），负责：

1. **运行 TTS** 生成字幕时间轴（`node movies/pregen-tts.mjs <script>` + `generate-subtitle.mjs`）
2. **Playwright 访问 URL**，执行 `fullPage: true` 全页截图 → `{genDir}/{scriptName}_{NNNN}_h_full.png`
3. **使用 Playwright DOM API 或页面源码分析**，根据 description 找到目标元素的选择器/坐标：
   - **文本内容定位**：`page.getByText()` 或 TreeWalker 找到文字坐标
   - **CSS 选择器推断**：根据页面结构确定稳定选择器
   - **区域划定**：对于区域级目标（如"右侧Releases区域"），找容器元素或手动划定矩形
   - **找不到** → 报错终止或换定位方式
   - **找到多个匹配** → 判断哪个是描述所指
4. **确认所有动画步骤的定位**后，将元素坐标存入 `{scriptName}_{NNNN}_h_marks.json`（供 HTML 合成使用）
5. **计算 triggerAt**：根据字幕时间轴将"首句台词1秒后"等自然语言转为绝对秒数
6. **完善 `.mjs` 文件**，将 `anim` 数组（含选择器、triggerAt、参数）写入脚本

```mjs
// AI Agent（开发者）完善后的 urls
const urls = [
  {
    url: 'https://github.com/faicad/3d_viewer_electron/',
    description: '首句台词1秒后高亮显示右侧Releases区域，加一个文字标注"这里下载"',
    anim: [
      { type: 'highlight-area', selector: 'a:has-text("Releases")', triggerAt: 4.5, highlightMs: 2500, padding: 80 },
      { type: 'text-annotation', target: 'a:has-text("Releases")', text: '这里下载', triggerAt: 4.5, duration: 2.5, position: 'top-right' },
    ],
  },
];
```

**关键区别**：AI Agent 不是自动化脚本，而是开发者的 LLM 辅助工作。自然语言理解、元素判定、选择器选取需要人类/AI 判断，无法用纯代码脚本替代。

如果用户要求的动画形式没有预置效果，可直接在 `.mjs` 中新增自定义 GSAP 动画。如果该需求是普遍需求，可在基类中补充为新类型。

#### 第三步：运行 `.mjs` 生成视频

`generate-url-video.mjs` 读取完善后的 `.mjs`（此时 `urls` 已含完整 `anim`），**不再访问网络**：

```
截图 + marks + anim(含绝对时间) → GSAP 时间线 → index.html
  → Playwright 录制 HTML → WebM
  → 烧录字幕
```

### 3.2 脚本格式（唯一方案）

旧格式（纯 URL 数组）已完全废弃。所有脚本必须采用以下格式：

```mjs
const subtitle = `
海外用户直接Github获取
国内用户前往Gitcode下载
文件名带cn的是中文版
建议你赶紧收藏自取！
`;

const urls = [
  {
    url: 'https://github.com/faicad/3d_viewer_electron/',
    description: '首句台词1秒后高亮显示右侧Releases区域，加一个文字标注"这里下载"',
  },
  {
    url: 'https://gitcode.com/Faicad/3d_viewer_electron',
    description: '第二句台词1秒后，页面缓慢滚动到"查看全部发行版"。第三句台词开始时显示一个1秒的点击动画',
  },
  {
    url: 'https://gitcode.com/Faicad/3d_viewer_electron/releases/',
    description: '点击动画结束后，加载本页面。本页面显示1秒后，高亮"3D_Viewer_1.7.2_x64_cn_Setup.exe"下载链接',
  },
];
```

`anim` 数组由 AI Agent 在第二步自动完善，无需手动编写。

### 定时机制：台词锚点

description 中通过"首句台词/第二句台词/第三句台词"引用字幕的行号（从0开始）。AI Agent 在 TTS 阶段获取每句台词的起止时间后，将自然语言描述转为绝对时间：

| 描述中的说法 | 解析方式 |
|-------------|---------|
| "首句台词1秒后" | 第0句字幕结束时间 + 1s |
| "第二句台词1秒后" | 第1句字幕结束时间 + 1s |
| "第三句台词开始时" | 第2句字幕开始时间 |
| "点击动画结束后" | 上一动画步骤结束时间 |

计算结果写入对应 `anim` 步骤的 `triggerAt` 字段（单位：秒，相对于视频开始）。

关键设计决策：

| 决策 | 理由 |
|------|------|
| **定位方式为 CSS 选择器** | Playwright 截图时 `page.$eval(selector, el => el.getBoundingClientRect())` 直接获得精确坐标 |
| **不做真实交互，只做视觉效果** | 视频观众想看的是"发生了什么"，不是"怎么发生的"。点击圈 + 波纹 + 页面过渡比真实点击更清晰 |
| **跳转用过渡动画而非真实加载** | 新页面截图已就绪，GSAP 从右推入即可。观众看到的是干净的新页面，而不是 loading spinner |

### 3.3 元素定位：Playwright 截图阶段一次性采集

截图的同时，把脚本中 `anim` 的所有 CSS 选择器对应的元素坐标采集下来：

```mjs
// 在截图阶段同步执行（每个 URL 截图时）
async function collectMarks(page, anims) {
  const marks = {}
  for (const step of anims) {
    if (step.selector) {
      const rect = await page.$eval(step.selector, el => {
        const r = el.getBoundingClientRect()
        return { x: r.x, y: r.y, w: r.width, h: r.height }
      }).catch(() => null)
      if (rect) {
        marks[step.selector] = rect
        // 记录在全页截图坐标系中的位置（= viewport 坐标 + scrollY）
        const scrollY = await page.evaluate(() => window.scrollY)
        marks[step.selector].fullY = rect.y + scrollY
      }
    }
  }
  return marks
}
```

保存为 `marks_{NNNN}.json`：

```json
{
  ".download-btn": { "x": 1200, "y": 3400, "w": 200, "h": 50, "fullY": 3400 },
  "#search-box": { "x": 300, "y": 4500, "w": 600, "h": 40, "fullY": 4500 },
  ".search-btn": { "x": 920, "y": 4500, "w": 80, "h": 40, "fullY": 4500 }
}
```

HTML 合成阶段直接读取，不需要额外依赖。

**未找到选择器时**：直接报错，终止流程。选择器是生成视频动画的前提，缺失则无法定位目标元素坐标。

### 3.4 URL 跳转：离线过渡动画

因为所有目标 URL 在 Step 1 都已截图完毕，所以 URL 间的"跳转"效果用 GSAP 过渡动画实现：

```
┌─── URL A 截图 ──┐          ┌─── URL B 截图 ──┐
│                  │          │                  │
│   [点击高亮]     │   ──→   │                  │
│   鼠标移动到按钮  │  滑入    │   新页面显示      │
│   点击波纹       │  过渡    │   （从右推入）     │
│                  │          │                  │
└──────────────────┘          └──────────────────┘
```

内置过渡模板：

| 类型 | GSAP 实现 | 效果 |
|------|-----------|------|
| `slide-right` | `xPercent: 100` → `xPercent: 0` | 新页面从右侧推入（默认） |
| `slide-up` | `yPercent: 100` → `yPercent: 0` | 从下方推入 |
| `fade` | `opacity: 0` → `opacity: 1` | 淡入 |
| `zoom-fade` | `scale: 0.8, opacity: 0` → `scale: 1, opacity: 1` | 缩放淡入 |
| `push` | 老页面左移 + 新页面右入 | 仿原生 app 导航 |

### 3.5 内置动画模板详细设计

所有动画步骤均支持公共参数：

| 参数 | 类型 | 说明 | 必填 |
|------|------|------|------|
| `triggerAt` | number | 相对于视频开始的触发时间（秒），由 AI Agent 根据字幕锚点计算 | 否（默认顺序触发） |
| `duration` | number | 动画持续时间（秒） | 否（模板各自有默认值） |

#### scroll-down

```mjs
{
  type: 'scroll-down',
  speed: 0.03,           // 每秒滚动 = 视口高度 × speed
  pauseTop: 1,           // 首屏停留秒数
  pauseBottom: 0.5,      // 到底后停留秒数
}
```

实现：GSAP `backgroundPositionY` 或 CSS `transform: translateY()` 在容器上偏移。

```
┌──────────────┐  viewport 窗口
│  ┌────────┐  │
│  │ 截图   │  │  ← GSAP 随时间上移 background-position-y
│  │        │  │
│  │        │  │
│  └────────┘  │
└──────────────┘
```

原理等价于当前 FFmpeg crop，但用 CSS 实现——便于在同一容器上叠加其他动画（鼠标、高亮圈等）。

#### click-highlight

```mjs
{
  type: 'click-highlight',
  selector: '.download-btn',   // 截图阶段已采集坐标
  triggerAt: 8.5,               // 绝对触发时间（AI Agent 根据"第二句台词1秒后"计算）
  highlightMs: 600,             // 高亮持续毫秒
  ripple: true,                 // 是否显示点击波纹
}
```

效果序列（GSAP timeline）：
1. 鼠标指针（PNG 光标）平滑移动到目标坐标（0.3s）
2. 目标区域出现发光边框/描边（0.2s）
3. 点击波纹动画（0.3s）← 同心圆扩散
4. （可选）触发 page-transition 到下一截图

#### zoom-in

```mjs
{
  type: 'zoom-in',
  selector: '.feature-card',   // 或直接指定坐标
  scale: 2,
  duration: 1.5,
}
```

用于放大截图某个区域，配合柔光遮罩突出显示。适合演示页面上的特定内容块。

#### type-text

```mjs
{
  type: 'type-text',
  selector: '#search-box',     // 截图阶段已采集坐标
  text: '3D打印机',
  duration: 2,
}
```

实现：在截图上覆盖一个带光标闪烁的输入框 div，GSAP 逐字写入文本。
- 不需要真实 DOM input
- 不需要聚焦/失焦事件
- 纯视觉效果，速度可控
  
```
[搜索框区域]                      [搜索框区域]
┌──────────────────┐             ┌──────────────────┐
│                  │             │ 3D打印机│        │
│                  │    GSAP     │            (光标) │
│                  │   ──────→   │                  │
└──────────────────┘             └──────────────────┘
```

#### highlight-area

```mjs
{
  type: 'highlight-area',
  selector: '.Layout-sidebar',   // 高亮区域的容器选择器
  highlightMs: 1500,              // 高亮持续毫秒
  padding: 20,                    // 区域向外扩展的像素（可选）
}
```

在指定选择器周围绘制高亮边框/发光遮罩。适合"高亮右侧 Releases 区域"这类区域级目标。若用户描述的是区域而非特定元素（如"右侧区域"），AI Agent 会选择顶层容器选择器或手动划定坐标。

#### text-annotation

```mjs
{
  type: 'text-annotation',
  target: '.Layout-sidebar',      // 关联的目标选择器（选择显示位置）
  text: '这里下载',               // 标注文本内容
  position: 'top-right',          // 相对目标的位置：top-right / bottom / left 等
  duration: 2.5,                  // 显示持续秒数
}
```

在截图上叠加一个带箭头的文字标注框。常用于说明某个区域/按钮的含义。文字通过 GSAP `opacity` 淡入淡出。

#### scroll-to-text

```mjs
{
  type: 'scroll-to-text',
  text: '查看全部发行版',         // 目标页面上可见的文字内容
  offset: -50,                    // 滚动到目标后再向上偏移像素（可选）
  duration: 1.5,                  // 滚动过渡秒数
}
```

滚动截图容器使指定文本出现在视口内。AI Agent 截图时通过 `page.getByText()` 获取文本的 `boundingBox()`，然后计算目标 `scrollTop`。适合描述中引用页面文字而非 CSS 选择器的场景。

#### 自定义动画扩展

如果用户需求的动画效果不在预置模板中，可在 `.mjs` 中直接使用 GSAP 时间线编写自定义动画：

```mjs
{
  url: 'https://example.com',
  anim: [
    { type: 'scroll-down', speed: 0.03 },
    // 自定义：直接在 .mjs 中写 GSAP 逻辑
    { type: 'custom', gsap: 'tl.to(".scene", { rotation: 360, duration: 2 })' },
  ],
}
```

如果是常见需求，升级为基类的新 `type`：

| 步骤 | 操作 |
|------|------|
| 在 `.mjs` 中验证 | 先以 `custom` 或直接修改 `anim` 脚本确认效果 |
| 抽到基类 | 在 `generate-url-video.mjs` 的动画模板注册表中新增类型 |
| 更新文档 | 在本文档的内置动画模板列表中加入新类型 |

#### page-transition

```mjs
{
  type: 'page-transition',
  transition: 'slide-right',    // 从右侧滑入
  duration: 0.5,
}
```

在两个 URL 截图之间执行。通过 GSAP 控制当前 scene 退出 + 下一 scene 进入。

### 3.6 HTML 合成架构

```html
<!-- 合成后的 index.html 结构 -->
<div id="container">
  <!-- 每个 URL 截图是一个 scene div -->
  <div id="s0" class="scene">
    <img src="bg_0.png" />            <!-- 全页截图 -->
    <div class="overlay">...</div>    <!-- 高亮、点击圈等覆盖层 -->
    <div class="cursor"></div>        <!-- 鼠标指针 -->
  </div>
  <div id="s1" class="scene">...</div>
  <div id="s2" class="scene">...</div>
</div>

<script src="gsap.min.js"></script>
<script>
  // GSAP 时间线
  const tl = gsap.timeline();
  // GSAP 代码由 generate-url-video.mjs 根据 anim 配置自动生成
  // 每段 scene 内包含 scroll、click、zoom 等动画
</script>
```

复用现有 `generate-html-video.mjs`（HyperFrames）的 Playwright 录制流程：
- 已有 `scene()` 函数 + GSAP 时间线 + composition HTML 生成
- 已有 Playwright 录制 HTML → WebM → FFmpeg trim
- URL 模式可复用同一架构，把截图文件作为背景图填入 scene

### 3.7 执行流程

执行流程：

**阶段 A（AI Agent = 开发者 — 截图 + 定位 + 补全 mjs）**：

开发者（借助 LLM）手动操作：

1. `node movies/pregen-tts.mjs <script>` — 生成 TTS 时间轴
2. Playwright 打开每个 URL → 截图 + DOM 分析 → 找到选择器/坐标
3. 将坐标写入 `marks_{NNNN}.json`
4. 计算 `triggerAt`（基于字幕时间轴），补全 `.mjs` 的 `anim` 数组

**阶段 B（generate-url-video.mjs — 合成 + 录制 + 烧录，自动化）**：

```mjs
async function generateUrlVideo(scriptPath) {
  const [lines, urls] = parseUrls(scriptPath)  // 此时 urls 已含 anim

  // ─── Step 1: 生成 HTML 合成 ───
  const html = buildComposition(urls)  // 读取截图 + marks → GSAP 时间线
  writeFileSync(hfDir/index.html, html)

  // ─── Step 2: Playwright 录制 HTML → WebM ───
  const browser = await chromium.launch({ headless: false })
  try {
    const context = await browser.newContext({
      recordVideo: { dir, size },
      viewport: { width, height },
    })
    const page = await context.newPage()
    await page.goto(`file://${hfDir}/index.html`)
    await page.waitForTimeout(totalDuration + 1.0)
    await context.close()
  } finally {
    await browser.close()
  }

  // ─── Step 3: 烧录字幕 ───
  lib.renderVideo({ clips, audioVoice, audioBg, output, subtitlePath })
}
```

### 3.8 截图缓存

截图以 **URL + 目标** 为缓存键。目标指：点击了哪个 URL 链接、在哪个输入框输入了什么文本。URL 或目标任一变化则缓存失效。

缓存文件：
- 截图：`{scriptName}_{hash(url+target)}_full.png`
- 坐标：`{scriptName}_{hash(url+target)}_marks.json`

支持 `-f` 参数强制重新截图，忽略已存在缓存。

截图尺寸固定为默认指定大小，不支持 `-g`/`-m`/`-s` 参数。

---

## 5. 推荐路线

### 第一阶段（近期，2-4 周）

**实现 AI Agent 截图 + 定位 + 三步走流程**：

1. **扩展脚本语法** — `const urls` 支持字符串和对象格式，新增 `description` 字段
2. **AI Agent 元素定位** — 根据 `description` 自动推断 CSS 选择器，支持找不到报错、多个匹配时交互确认
3. **截图缓存** — 以 URL+目标为缓存键，支持 `-f` 强制刷新
4. **HTML 合成架构** — 复用 HyperFrames 的 `scene()` + composition HTML + Playwright 录制
5. **scroll-down 模板** — 当前 scroll 逻辑移植为 GSAP `backgroundPositionY`
6. **fade 页面过渡** — URL 间切换时的淡入淡出

### 第二阶段（中期，4-6 周）

1. **click-highlight 模板** — 鼠标指针移动 + 高亮圈 + 点击波纹
2. **zoom-in 模板** — 局部放大效果
3. **type-text 模板** — GSAP 逐字显示模拟键盘输入
4. **page-transition 模板库** — slide-right / slide-up / push 等过渡效果
5. **自定义动画扩展机制** — `type: 'custom'` + 基类注册新类型
6. **AI Agent 生成 .mjs** — 自动将定位结果写入 `movies/{project}/{script}.mjs`

### 第三阶段（远期，可选）

1. **预览模式** — `node movies/burn.mjs --preview` 打开 HTML 合成结果预览（浏览器打开 index.html）

### 决策矩阵

| 需求 | 推荐方案 | 理由 |
|------|----------|------|
| 纯内容展示（博客、文档、商品页） | 方案 A | 截图够用，动画可控 |
| 需要展示按钮点击效果 | 方案 A（CSS 选择器定位） | Playwright DOM API 直接返回坐标，零误差 |
| 需要展示页面跳转 | 方案 A 离线过渡动画 | 视频过渡效果比真实加载更干净 |
| 需要演示搜索/输入 | 方案 A（type-text 模板） | GSAP 逐字显示，可控、无拼写错误 |
| 页面有大量懒加载/动态内容 | 方案 A + 截图前手动滚动 | 截图可控，不受网络影响 |
| SEO / 反爬严格的网站 | 方案 A | 只截一次，不被封 |
| 视频数量大（批量生成） | 方案 A | 截图快，渲染快 |

---

## 6. 元素定位方案

### 6.1 决策：使用 Playwright DOM API

使用 Playwright DOM API `page.$eval()` + `getBoundingClientRect()` 直接获取元素精确坐标，无需 OCR。EasyOCR 在其他场景（非 URL 视频）中仍可使用。

### 6.2 取值原理

```
全页截图坐标 = element.getBoundingClientRect() + window.scrollY
```

因为 `fullPage: true` 截图的高度 = 整个网页的 scrollHeight，所以元素在全页截图中的纵向位置 = viewport 内 y + 已滚动距离。

```mjs
const rect = await page.$eval('.download-btn', el => {
  const r = el.getBoundingClientRect()
  return { x: r.x, y: r.y, w: r.width, h: r.height }
})
const scrollY = await page.evaluate(() => window.scrollY)
// 全页截图中的坐标:
const fullY = rect.y + scrollY
```

### 6.3 定位策略（按优先级）

| 策略 | 写法 | 适用场景 |
|------|------|----------|
| CSS 选择器（推荐） | `.download-btn` / `#search-box` | 页面有明确 id/class 的元素 |
| 文本内容定位 | `text="下载"` | 无 class 的文字按钮（Playwright 截图阶段用 `page.getByText()` 转坐标） |
| 坐标直写 | `x: 1200, y: 3400` | 固定页面布局，无需采集 |

**文本定位回退**：当元素无合适选择器时，可在截图阶段用 `page.getByText('下载').first().boundingBox()` 获取坐标，保存到 marks.json。

---

## 7. 迁移路径

### 技术组件

| 组件 | 角色 | 说明 |
|------|------|------|
| **开发者 (AI Agent)** | 人工+LLM | 理解 description，Playwright 截图+定位，补全 anim，生成 marks.json |
| `generate-url-video.mjs` | 自动化执行 | 读已补全的 .mjs + marks → HTML 合成 → Playwright 录制 → 烧录字幕 |
| `movies/html-composer.mjs` | 库 | GSAP 合成逻辑：接收 urls+marks+时间轴 → 输出 index.html |

### 文件变更清单

| 文件 | 变更 | 说明 |
|------|------|------|
| `generate-url-video.mjs` | 重写 | 读已补全 .mjs → HTML 合成(html-composer) → Playwright 录制 → 烧录字幕 |
| `movies/html-composer.mjs` | 新建 | GSAP 合成逻辑：接收 urls(含 anim) + marks + 时间轴 → 输出 index.html |
| `generate-html-video.mjs` | 重构 | 提取公共合成器，URL 模式和 HyperFrames 共享 |
| `movies/e1/m5.mjs` | 参考示例 | description → AI Agent(开发者)补全 anim |
| `docs/url-video-refactor.md` | 更新 | 三步走流程 + AI Agent 角色定义 |
| `movies/SKILL.md` | 更新 | 新增 URL 动画配置用法 + AI Agent 工作流 |
| `movies/mark-text-easyocr.py` | 不变 | 其他场景仍在使用 |

# URL 视频生成 — AI Agent 工作流程

## 概述

用户编写 `.mjs` 脚本（含 `const subtitle` 和 `const urls`，urls 中只写 `description`），AI Agent（你）负责：

1. **运行 TTS** → 获取字幕时间轴
2. **Playwright 截图 + 分析 DOM** → 找到选择器/坐标
3. **写入 marks.json + 补全 .mjs 的 anim 数组**
4. **调用 generate-url-video.mjs** 生成视频

---

## Step 0：读取脚本

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
    description: '结束前1秒点击"查看全部发行版"',
  },
  {
    url: 'https://gitcode.com/Faicad/3d_viewer_electron/releases/',
    description: '本页面显示1秒后，高亮"3D_Viewer_1.7.2_x64_cn_Setup.exe"下载链接',
  },
  {
    url: '',  // 空字符串 = 延续上一个 url 的画面，不创建新场景
    description: 'url不变，延续画面内容。居中显示字幕动画"求关注、求转发、求收藏"，分三段显示出来',
  },
];
```

检查点：
- `subtitle` 的每行对应一句台词，行号从 0 开始（首句=0）
- `urls` 数量 = `subtitle` 行数（一一对应）
- `description` 中的时间描述统一为："台词开始N秒后"、"结束前N秒"、"上个动画结束后"。场景延续用"url不变，延续画面内容"
- **延续场景规则**：如果 `url` 设为空字符串 `''`，代表延续上一个 url 的画面，不会创建新场景，截图和 marks 复用上一个 URL 的。连续多个空字符串也全部合并到同一个场景。

---

## Step 1：运行 TTS

```bash
node movies/pregen-tts.mjs <script.mjs>
```

这会生成 `gen/<name>.subtitle`，其中包含每句台词的时间（秒）：

```json
{
  "segments": [{
    "entries": [
      { "s": 0.5, "e": 3.6, "t": "海外用户直接Github获取" },
      { "s": 3.75, "e": 6.72, "t": "国内用户前往Gitcode下载" },
      ...
    ]
  }]
}
```

**关键**：根据这个时间轴计算 `triggerAt`。**`triggerAt` 是相对于当前画面/场景起始时刻（含静音间隙）的偏移秒数**。每一行字幕对应一个场景，场景时长 = `imageDurations[i]`（TTS 语音 + 尾随静音间隙）：

- 首行：`imageDurations[0] = TTS_0 时长 + INITIAL_GAP(0.5s) + INTER_LINE_GAP(0.15s)`，从 `t=0` 开始
- 后续行：`imageDurations[i] = TTS_i 时长 + INTER_LINE_GAP(0.15s)`，从 `entries[i].s` 开始（`INTER_LINE_GAP` 归前一个场景，不是当前场景的起始）
- 最后一行：`imageDurations[last] = TTS_last 时长`，无尾随间隙

| description 中的说法 | 计算公式 |
|----------------------|---------|
| "台词开始N秒后" / "本页面显示N秒后" | `N` |
| "结束前N秒" | `imageDurations[i] - N` |
| "台词开始时" / 未指定 | `0` |
| "上个动画结束后" | 上一个 anim 步骤的 `triggerAt + duration`（或 `triggerAt + highlightMs/1000`） |

---

## Step 1.5：场景时序检查（必须执行）

### 默认规则

**用户未明确指定时，一行台词对应一个 URL**（`triggerAt` 均为相对当前场景起始时刻的偏移秒数）。场景包含 TTS 语音 + 静音间隙：

- **场景起始**：首行从 `t=0` 开始（含 `INITIAL_GAP=0.5s` 片头静音）；后续行从 `entries[i].s` 开始（`INTER_LINE_GAP` 归前一个场景，不计入当前场景起始）
- **场景时长** = `imageDurations[i]`（非最后一行：TTS 时长 + `INTER_LINE_GAP`；最后一行：仅 TTS 时长；首行额外 + `INITIAL_GAP`）
- 动画**默认结束** = `imageDurations[i]`，即用户未指定 `duration` 或 `highlightMs` 时，`duration = imageDurations[i] - triggerAt`
- `imageDurations` 由 `generate-subtitle.mjs` 自动计算，需要参考时可在 `.mjs` 中打印 `imageDurations`
- 如果 URL 数量少于台词行数，多余的台词行不绑定 URL
- **「url不变，延续画面内容」**：将 `url` 设为空字符串 `''`，代表延续上一个 URL 的画面。空字符串条目自动合并到前一个场景，共用一个截图，动画合并，场景时间从第一个台词行 s 到最后一行 e，中间不切换场景。各动画的 `triggerAt` 仍然相对于各自场景起始时刻（`entries[i].s`）。

### 必须检查的冲突

在补全 `anim` 之前，**必须**逐一检查以下冲突，**发现后立刻停止并提示用户做选择**，不得自行决定：

**1. 动画超出场景窗口**

如果 `triggerAt` 或 `triggerAt + duration/highlightMs` 超出该 URL 的场景时间窗口（`0` ~ `imageDurations[i]`，含静音间隙），该动画在场景结束后才会触发，视频中看不到。

提示用户：
- 是否延长场景？（会与下一个场景重叠）
- 是否调整 triggerAt 让动画在窗口内？
- 是否缩短动画时长？

**2. triggerAt 对应关系验证**

对每个 `description` 中的时间描述，逐条与公式计算值对比。如果公式计算结果与 anim 中的 `triggerAt` 不一致，标记为错误，要求用户确认。

### 检查示例（m5.mjs）

```
台词 TTS（从 m5.subtitle）:
  [0] 0.5 — 3.6   海外用户直接Github获取       TTS 3.1s
  [1] 3.75 — 6.72  国内用户前往Gitcode下载      TTS 2.97s
  [2] 6.87 — 9.92  文件名带cn的是中文版        TTS 3.05s
  [3] 10.07 — 12.47 建议你赶紧收藏自取！        TTS 2.4s

imageDurations（含静音间隙）:
  imageDurations[0] = 3.1 + 0.5(INITIAL_GAP) + 0.15(INTER_LINE_GAP) = 3.75s
  imageDurations[1] = 2.97 + 0.15 = 3.12s
  imageDurations[2] = 3.05 + 0.15 = 3.20s
  imageDurations[3] = 2.4 (最后一行，无间隙)

场景窗口（triggerAt 相对各场景起始）:
  URL 0: 场景 0～3.75 (GitHub)                → sceneStart=0
  URL 1: 场景 3.75～6.87 (GitCode)            → sceneStart=3.75
  URL 2: 场景 6.87～10.07 (GitCode Releases)   → sceneStart=6.87
   URL 3: 空字符串，合并到 URL 2 的场景 (6.87～12.47)

动画计算:
  URL 0: "首句台词1秒后" → triggerAt = 1.0
         highlight-area triggerAt=1.0, end=1.0+2.1=3.1 ≤ 3.75 ✅
         text-annotation triggerAt=1.0, end=1.0+2.1=3.1 ≤ 3.75 ✅
  URL 1: "结束前1秒" → imgDur[1]=3.12, triggerAt=3.12-1.0=2.12
         click-highlight triggerAt=2.12, end=2.12+1.0=3.12 ≤ 3.12 ✅
         (auto-scroll: "All releases" y=957 超出视口，自动插入 scroll-to-text @ 1.62)
  URL 2: "本页面显示1秒后" → triggerAt=1.0
         highlight-area triggerAt=1.0, end=1.0+2.05=3.05 ≤ 3.20 ✅
   URL 3: url 为空字符串 → 合并到 URL 2 的场景
          caption triggerAt=0（相对 URL3 场景起始 10.07）, duration=2.4 ≤ 2.4 ✅

无冲突。所有动画在场景窗口内，URL 2 和 URL 3 自动合并无重叠。
```

发现冲突后，向用户呈现以上分析，逐条询问处理方式。**严禁 AI Agent 自行选择方案。**

---

## Step 2：Playwright 截图 + DOM 分析

### 2.1 启动浏览器

```js
import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
```

### 2.2 截图

```js
await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
await new Promise(r => setTimeout(r, 3000));  // 等动态渲染
await page.screenshot({ path: 'ai_gen/m5_0000_h_full.png', fullPage: true });
```

文件命名规则：`<scriptName>_<NNNN>_<h|v>_full.png`（固定 4 位序号），横屏 `_h`（1920×1080）和竖屏 `_v`（1080×1920）各截一份。

### 2.3 定位元素

**文本定位**（最常用，推荐）：

```js
const getBox = async (text) => {
  const el = page.getByText(text, { exact: false }).first();
  const box = await el.boundingBox();
  const scrollY = await page.evaluate(() => window.scrollY);
  if (box) return { x: box.x, y: box.y, w: box.width, h: box.height, fullY: box.y + scrollY };
  return null;
};
const mark = await getBox('All releases');
```

**CSS 选择器定位**（适合有明确 id/class 的元素）：

```js
const rect = await page.$eval('.download-btn', el => {
  const r = el.getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height };
});
```

**区域定位**（"右侧Releases区域"这种）：找到该区域的容器或链接元素，用 `padding` 扩大范围。

### 2.4 处理找不到/多匹配

- **找不到**：尝试其他文本变体、CSS 选择器。如果确实没有该元素，报错给用户
- **多个匹配**：判断哪个是用户描述的。用 `Math.min(count, 3)` 遍历前几个，查看上下文决定

### 2.5 保存坐标

```json
{
  "Releases sidebar": { "x": 1296, "y": 652, "w": 272, "h": 149, "fullY": 652 },
  "All releases": { "x": 1258, "y": 957, "w": 98, "h": 21, "fullY": 957 },
  "3D_Viewer_1.7.2_x64_cn_Setup.exe": { "x": 226, "y": 495, "w": 1344, "h": 21, "fullY": 495 }
}
```

### 2.6 `ai_gen/` 目录规范

**`ai_gen/` 是 AI Agent 的完整工作产物目录**，与 `.gitignore` 的 `gen/` 不同。git 提交规则：**只提交代码和 JSON 等文本文件，不提交 PNG 截图**（仅因 PNG 体积大；截图必须与 marks 同一时刻捕获，`generate-url-video.mjs` 的自动截图已屏蔽）。包含三类文件：

| 文件 | 生成方式 | 可重现 | 用途 |
|------|---------|--------|------|
| `*_h_full.png` / `*_v_full.png` | `page.screenshot()` | ✅ 代码自动重截图 | URL 截图，作 HTML 合成背景 |
| `*_h_marks.json` / `*_v_marks.json` | AI Agent 手动分析 DOM | ❌ 只能手动重写 | 元素坐标，供 anim 引用 |
| `*.mjs`（分析脚本） | AI Agent 手写 | ✅ 可重新运行 | DOM 探索过程，标记方法论 |

**分析脚本必须留存**。AI Agent 在定位元素时写的 Playwright 分析脚本（如 `find_github_sidebar.mjs`、`refine_dom.mjs`）**必须保存在 `ai_gen/` 下，不得删除**。原因是：

1. **文档价值**：脚本完整记录了"如何找到这个元素"的分析过程（用了什么选择器、遍历了什么 DOM 结构、为何选择这个区域），比 marks.json 单独更有意义
2. **可复现性**：页面改版后，不需要从头理解业务逻辑，直接改几个选择器就能重新运行
3. **横向复用**：同类网站（如 GitHub、GitCode）的定位方法可直接复制到新脚本

参考 `movies/e1/ai_gen/` 的示例结构：

```
ai_gen/
├── capture_m5.mjs              # 主截图+定位脚本（一次性生成所有产物）
├── find_github_sidebar.mjs     # DOM 分析脚本：定位 Releases 侧边栏容器
├── refine_github_dom.mjs       # DOM 细化脚本：确认 BorderGrid-row 精确坐标
├── m5_0000_h_full.png
├── m5_0000_h_marks.json        # Releases sidebar: (1289,651) 272×149
├── m5_0000_v_full.png
├── m5_0000_v_marks.json        # 竖屏独立坐标
├── m5_0001_h_full.png + marks
├── m5_0001_v_full.png + marks
├── m5_0002_h_full.png + marks
├── m5_0002_v_full.png + marks
├── m5_0003_h_full.png          # 仅截图（caption 背景）
└── m5_0003_v_full.png
```

文件命名规则：`<scriptName>_<NNNN>_<h|v>_marks.json`。

---

## Step 3：补全 .mjs anim 数组

根据 description + subtitle 时间轴 + marks，组装每个 url 的 `anim` 数组。

### Mark vs Caption（核心概念）

动画分为两大类，区别在于**定位方式**：

| 分类 | 定位方式 | 是否需要 marks.json | 找不到元素时 |
|------|---------|-------------------|------------|
| **Mark** | 通过 URL 页面内容定位（绑定 DOM 元素） | 是 | **必须报错** `process.exit(1)` |
| **Caption** | 通过屏幕视口位置定位（不绑定任何元素） | 否 | 不涉及 |

**Mark 类型**：`highlight-area`、`click-highlight`、`text-annotation`、`scroll-to-text`
- 依赖 Playwright 在页面上找到目标元素，坐标写入 `marks.json`
- **mark 找不到必须报错**，不允许静默跳过。`html-composer.mjs` 在 `resolveMark()` 中执行 `process.exit(1)`

**Caption 类型**：`caption`
- 不绑定页面元素，固定在视口位置，不随页面滚动
- **必须在 .mjs 中明确提供样式、大小、定位参数**，方便用户直接调整，不依赖 html-composer 的默认值
- `page-transition`、`scroll-down`、`custom` 也属于不需要 mark 的类型（非 Mark 非 Caption）

### 动画类型参考

| type | 分类 | 用途 | 关键参数 |
|------|------|------|---------|
| `highlight-area` | **Mark** | 高亮页面元素 | `selector`, `triggerAt`, `highlightMs`, `padding` |
| `text-annotation` | **Mark** | 在页面元素旁加文字标注 | `target`（marks key）, `text`（显示文字）, `triggerAt`, `duration`, `position` |
| `click-highlight` | **Mark** | 鼠标点击效果 | `selector`, `triggerAt`, `highlightMs`, `ripple` |
| `scroll-to-text` | **Mark** | 滚动到文字可见 | `text`, `triggerAt`, `duration`, `offset` |
| `scroll-down` | — | 向下缓慢滚动 | `speed`, `triggerAt`, `pauseTop`, `pauseBottom` |
| `caption` | **Caption** | 视口居中文字（自动保持到场景结束） | `text`, `triggerAt`, `duration`, **`top`**, **`fontSize`**, **`color`**, **`align`**, **`pad`** |
| `page-transition` | — | 页面间过渡 | `transition`, `triggerAt`, `duration` |

### `caption` 样式参数（必须全部显式提供）

`caption` 是 Caption 类型，**所有样式参数必须在 .mjs 中显式写明**。

每个样式参数支持两种格式：
- **标量** — 横竖屏通用（如 `fontSize: 36`）
- **`{h, v}` 对象** — 区分横屏/竖屏（如 `top: {h: 38, v: 45}`）

`h` = 横屏（width > height），`v` = 竖屏。可只提供一种方向，缺失时自动 fallback 到另一个方向。

| 参数 | 类型 | 说明 |
|------|------|------|
| `top` | number 或 `{h, v}` | 垂直位置（视口百分比，0=顶部 100=底部） |
| `fontSize` | number 或 `{h, v}` | 字号（px） |
| `color` | string 或 `{h, v}` | 文字颜色（如 `#ff6b35`） |
| `align` | string 或 `{h, v}` | 对齐：`center` / `left` / `right` |
| `pad` | number 或 `{h, v}` | 水平边距百分比（align=left/right 时生效） |

### `caption` 的分段显示规则（`、` 分隔）

`caption` 是**一句话，一个 DOM 元素，整行居中**。`、` 只是中文标点。

如果 `text` 含 `、`（如 `"求关注、求转发、求收藏"`），`html-composer.mjs` 自动做渐进式文字动画：

- **一个 div**，初始 textContent 为完整字符串
- 通过 GSAP `tl.call` 在 staggered 时间点修改 `textContent`：
  ```
  t=0.0:   textContent = "求关注"
  t=0.8:   textContent = "求关注、求转发"
  t=1.6:   textContent = "求关注、求转发、求收藏"
  ```
- `duration` 均匀分配给各段
- 整体淡入淡出照常

**❌ 常见错误**：拆成多个 DOM 元素各自独立——会破坏"一句话整体居中"的语义，且各段互相遮挡。

示例：

```js
{
  type: 'caption',
  text: '求关注、求转发、求收藏',   // 一行文字，`、` 自动累积分段，duration 均分
  triggerAt: 0,
  duration: 2.4,
  top: { h: 38, v: 45 },
  fontSize: { h: 36, v: 28 },
  color: '#ff6b35',               // 标量，横竖屏一致
  align: { h: 'center', v: 'center' },
  pad: { h: 5, v: 8 },
}
```

**自动滚动**：Mark 类型（`highlight-area`、`click-highlight`、`text-annotation`）如果目标元素不在当前视口内，`html-composer.mjs` 会自动插入 `scroll-to-text`。Caption 和其余非 Mark 类型不参与自动滚动。

### triggerAt 是相对时间

所有 `triggerAt` 都是**相对于当前画面/场景起始时刻（含静音间隙）**的偏移秒数。视频生成时由 `html-composer.mjs` 自动换算。

首行场景从 `t=0` 开始（含 `INITIAL_GAP=0.5s`），后续行场景从 `entries[i].s` 开始。`triggerAt` 始终以当前行的场景起始为原点。

这样设计的好处：增加/删除/修改一行台词，只影响该行自己的动画时间，无需重算其他行的 `triggerAt`。

### 示例

**Mark 示例**（绑定页面元素，需要 marks.json）：

```mjs
{
  url: 'https://github.com/faicad/3d_viewer_electron/',
  description: '首句台词1秒后高亮显示右侧Releases区域，加一个文字标注"这里下载"',
  anim: [
    {
      type: 'highlight-area',
      selector: 'Releases sidebar',      // ← marks.json 的 key
      triggerAt: 1.0,
      highlightMs: 2.1,
      padding: 60,
    },
    {
      type: 'text-annotation',
      target: 'Releases sidebar',         // ← marks.json 的 key（不是显示文字！）
      text: '这里下载',                    // ← 显示文字
      triggerAt: 1.0,
      duration: 2.1,
      position: 'top-right',
    },
  ],
},
```

**`text-annotation` 的 `position` 参数**（标注相对目标元素的位置，箭头始终指向目标）：

| position | 位置 | 示例场景 |
|----------|------|---------|
| `top-right`（默认） | 目标右侧，顶部对齐 | 标注在元素右上角外侧 |
| `top-left` | 目标左侧，顶部对齐 | 标注在元素左上角外侧 |
| `bottom-right` | 目标右侧，底部对齐 | 标注在元素右下角外侧 |
| `bottom-left` | 目标左侧，底部对齐 | 标注在元素左下角外侧 |
| `right` | 目标右侧，垂直居中 | 标注在元素右边中间 |
| `left` | 目标左侧，垂直居中 | 标注在元素左边中间 |
| `top` | 目标正上方，水平居中 | 标注在元素上方居中 |
| `center` | 目标区域内部居中 | 标注覆盖在元素正中间 |
| `bottom` | 目标正下方，水平居中 | 标注在元素下方居中 |

**Caption 示例**（视口定位，一行文字整体居中，`、` 自动累积三段）：

```mjs
{
  url: '',  // 空字符串 = 延续上一个 url 的画面
  description: 'url不变，延续画面内容。居中显示字幕动画"求关注、求转发、求收藏"，分三段显示出来',
  anim: [
    {
      type: 'caption',
      text: '求关注、求转发、求收藏',   // 一行文字，累积显示：求关注 → 求关注、求转发 → 求关注、求转发、求收藏
      triggerAt: 0,
      duration: 2.4,
      top: { h: 46, v: 50 },
      fontSize: { h: 36, v: 28 },
      color: '#ff6b35',
      align: { h: 'center', v: 'center' },
      pad: { h: 5, v: 8 },
    },
  ],
},
```

---

## Step 4：生成视频

```bash
node movies/generate-url-video.mjs <script.mjs> [--tts edge-tts] [--no-tts] [--no-burn]
```

参数说明：
- `--tts edge-tts`：指定 TTS 引擎（默认 edge-tts）
- `--no-tts`：跳过 TTS，使用已有的字幕文件
- `--no-burn`：不烧录字幕（只生成原始 webm）

流程：
1. 读取已补全的 .mjs（含 anim）
2. 加载 marks.json
3. 生成 HTML 合成（html-composer.mjs）
4. Playwright 录制 HTML 动画 → WebM
5. FFmpeg 裁剪精确时长
6. 烧录字幕 + 混音 → MP4

---

## 完整工作流示例

```bash
# Step 1: TTS
node movies/pregen-tts.mjs movies/e1/m5.mjs

# Step 2: 截图 + 分析（手动，AI Agent 做）
#   - 打开每个 URL
#   - 定位元素
#   - 截图
#   - 写 marks.json
#   - 补全 m5.mjs 的 anim 数组

# Step 3: 生成视频
node movies/generate-url-video.mjs movies/e1/m5.mjs
```

## 完整参考示例

参见 `movies/e1/m5.mjs` — 这是新格式的唯一参考脚本，包含完整的 `subtitle`、`urls`（含 `description` 和 `anim`）。

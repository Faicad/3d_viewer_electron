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
    url: 'https://gitcode.com/Faicad/3d_viewer_electron/releases/',
    description: 'url不变，延续画面内容。居中显示字幕动画"求关注、求转发、求收藏"，分三段显示出来',
  },
];
```

检查点：
- `subtitle` 的每行对应一句台词，行号从 0 开始（首句=0）
- `urls` 数量 = `subtitle` 行数（一一对应）
- `description` 中的时间描述统一为："台词开始N秒后"、"结束前N秒"、"上个动画结束后"。场景延续用"url不变，延续画面内容"

---

## Step 1：运行 TTS

```bash
node movies/pregen-tts.mjs <script.mjs>
```

这会生成 `gen/<name>.subtitle`，其中包含每句台词的绝对时间（秒）：

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

**关键**：根据这个时间轴计算 `triggerAt`：

每个 URL 绑定唯一的台词行 `entries[i]`，所有时间描述都基于该行计算：

| description 中的说法 | 计算公式 |
|----------------------|---------|
| "台词开始N秒后" | `entries[i].s + N` |
| "结束前N秒" | `entries[i].e - N` |
| "上个动画结束后" | 上一个 anim 步骤的 `triggerAt + highlightMs/1000`（或 `triggerAt + duration`） |

---

## Step 1.5：场景时序检查（必须执行）

### 默认规则

**用户未明确指定时，一行台词对应一个 URL**：
- 第 i 个 URL 的场景**开始时间** = `entries[i].s`（该行台词开始）
- 第 i 个 URL 的场景**结束时间** = `entries[i].e`（该行台词结束）
- 第 i 个 URL 的动画**默认结束时间** = `entries[i].e`。即用户未指定 `duration` 或 `highlightMs` 时，`duration = entries[i].e - triggerAt`
- 如果 URL 数量少于台词行数，多余的台词行不绑定 URL
- **「url不变，延续画面内容」**：连续相同 URL 自动合并为一个场景。共用一个截图，动画合并，场景时间从第一个台词行 s 到最后一行 e，中间不切换场景

### 必须检查的冲突

在补全 `anim` 之前，**必须**逐一检查以下冲突，**发现后立刻停止并提示用户做选择**，不得自行决定：

**1. 动画超出场景窗口**

如果 `triggerAt` 或 `triggerAt + duration/highlightMs` 超出该 URL 的场景时间窗口（`entries[i].s` ~ `entries[i].e`），该动画在场景结束后才会触发，视频中看不到。

提示用户：
- 是否延长场景？（会与下一个场景重叠）
- 是否调整 triggerAt 让动画在窗口内？
- 是否缩短动画时长？

**2. triggerAt 对应关系验证**

对每个 `description` 中的时间描述，逐条与公式计算值对比。如果公式计算结果与 anim 中的 `triggerAt` 不一致，标记为错误，要求用户确认。

### 检查示例（m5.mjs）

```
台词（从 m5.subtitle）:
  [0] 0.5 — 3.6   海外用户直接Github获取
  [1] 3.75 — 6.72  国内用户前往Gitcode下载
  [2] 6.87 — 9.92  文件名带cn的是中文版
  [3] 10.07 — 12.47 建议你赶紧收藏自取！

默认场景窗口:
  URL 0: 0.5 — 3.6  (GitHub)
  URL 1: 3.75 — 6.72 (GitCode)
  URL 2: 6.87 — 9.92 (GitCode Releases)
  URL 3: 10.07 — 12.47 (同 URL 2，合并场景)

动画计算:
  URL 0: "首句台词1秒后" = 0.5+1.0 = 1.5
         highlight-area triggerAt=1.5, end=1.5+2.1=3.6 ✅
         text-annotation triggerAt=1.5, end=1.5+2.1=3.6 ✅
  URL 1: "结束前1秒" = 6.72-1.0 = 5.72
         click-highlight triggerAt=5.72, end=5.72+1.0=6.72 ✅
         (auto-scroll: "All releases" y=957 超出视口，自动插入 scroll-to-text @ 5.22)
  URL 2: "本页面显示1秒后" = 6.87+1.0 = 7.87
         highlight-area triggerAt=7.87, end=7.87+2.05=9.92 ✅
  URL 3: url 与 URL 2 相同 → 合并到同一个场景
         "求关注" triggerAt=10.07, end=10.07+2.4=12.47 ✅
         "求转发" triggerAt=10.87, end=10.87+1.6=12.47 ✅
         "求收藏" triggerAt=11.67, end=11.67+0.8=12.47 ✅

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
await page.screenshot({ path: 'gen/m5_0000_h_full.png', fullPage: true });
```

文件命名规则：`<scriptName>_<NNNN>_h_full.png`（固定 4 位序号）。

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

文件命名：`<scriptName>_<NNNN>_h_marks.json`（与截图同目录，`gen/` 下）。

---

## Step 3：补全 .mjs anim 数组

根据 description + subtitle 时间轴 + marks，组装每个 url 的 `anim` 数组。

### 动画类型参考

| type | 用途 | 关键参数 |
|------|------|---------|
| `highlight-area` | 高亮页面元素 | `selector`, `triggerAt`, `highlightMs`, `padding` |
| `text-annotation` | 在页面元素旁加文字标注 | `target`, `text`, `triggerAt`, `duration`, `position` |
| `click-highlight` | 鼠标点击效果 | `selector`, `triggerAt`, `highlightMs`, `ripple` |
| `text-overlay` | 视口居中文字（无 mark） | `text`, `triggerAt`, `duration`, `top`, `fontSize`, `color`, `align`, `pad` |
| `scroll-to-text` | 滚动到文字可见 | `text`, `triggerAt`, `duration`, `offset` |
| `scroll-down` | 向下缓慢滚动 | `speed`, `triggerAt`, `pauseTop`, `pauseBottom` |
| `page-transition` | 页面间过渡 | `transition`, `triggerAt`, `duration` |

`text-annotation` 和 `text-overlay` 是两种完全不同的东西：
- **`text-annotation`**：绑定页面元素（`target`），出现在目标旁边，跟随 scroll-layer 滚动
- **`text-overlay`**：不绑定任何元素，视口定位，不随页面滚动。样式参数：

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `top` | 50 | 垂直位置（视口百分比） |
| `fontSize` | 28 | 字号（px） |
| `color` | `#ff6b35` | 文字颜色 |
| `align` | `center` | 对齐：`center` / `left` / `right` |
| `pad` | 5 | 水平边距百分比（align=left/right 时生效） |

**自动滚动**：`highlight-area`、`click-highlight`、`text-annotation` 如果目标元素不在当前视口内，`html-composer.mjs` 会自动插入 `scroll-to-text`。`text-overlay` 不参与自动滚动。

### triggerAt 是绝对时间

所有 `triggerAt` 都是**相对于视频开始**的绝对秒数，不是相对场景偏移。

### 示例

```mjs
{
  url: 'https://github.com/faicad/3d_viewer_electron/',
  description: '首句台词1秒后高亮显示右侧Releases区域，加一个文字标注"这里下载"',
  anim: [
    {
      type: 'highlight-area',
      selector: 'Releases sidebar',      // 匹配 marks.json 中的 key
      triggerAt: 1.5,                     // entries[0].s + 1.0
      highlightMs: 2.1,                   // entries[0].e - triggerAt
      padding: 60,
    },
    {
      type: 'text-annotation',
      target: 'Releases sidebar',         // 标记位置
      text: '这里下载',
      triggerAt: 1.5,
      duration: 2.1,
      position: 'top-right',
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

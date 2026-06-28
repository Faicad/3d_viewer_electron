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
    url: 'https://example.com/page1',
    description: '首句台词1秒后高亮显示右侧Releases区域，加一个文字标注"这里下载"',
  },
  {
    url: 'https://example.com/page2',
    description: '第二句台词1秒后，页面缓慢滚动到"查看全部发行版"。第三句台词开始时显示一个1秒的点击动画',
  },
  {
    url: 'https://example.com/page3',
    description: '点击动画结束后，加载本页面。本页面显示1秒后，高亮"somefile.exe"下载链接',
  },
];
```

检查点：
- `subtitle` 的每行对应一句台词，行号从 0 开始（首句=0）
- `urls` 数量 ≤ `subtitle` 行数（一个 URL 可对应多句台词）
- `description` 引用台词时的说法："首句台词X秒后"、"第二句台词X秒后"、"第三句台词开始时"、"点击动画结束后"

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

| description 中的说法 | 计算公式 |
|----------------------|---------|
| "首句台词1秒后" | `entries[0].e + 1.0` |
| "第二句台词1秒后" | `entries[1].e + 1.0` |
| "第三句台词开始时" | `entries[2].s` |
| "点击动画结束后" | 上一个 anim 步骤的 `triggerAt + highlightMs/1000` |

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
  "Releases sidebar": { "x": 976, "y": 660, "w": 120, "h": 130, "fullY": 660 },
  "All releases": { "x": 852, "y": 980, "w": 72, "h": 21, "fullY": 980 },
  "3D_Viewer_1.7.2_x64_cn_Setup.exe": { "x": 82, "y": 495, "w": 1008, "h": 21, "fullY": 495 }
}
```

文件命名：`<scriptName>_<NNNN>_h_marks.json`（与截图同目录，`gen/` 下）。

---

## Step 3：补全 .mjs anim 数组

根据 description + subtitle 时间轴 + marks，组装每个 url 的 `anim` 数组。

### 动画类型参考

| type | 用途 | 关键参数 |
|------|------|---------|
| `highlight-area` | 高亮一个区域 | `selector`, `triggerAt`, `highlightMs`, `padding` |
| `text-annotation` | 加文字标注 | `target`, `text`, `triggerAt`, `duration`, `position` |
| `scroll-to-text` | 滚动到文字可见 | `text`, `triggerAt`, `duration`, `offset` |
| `scroll-down` | 向下缓慢滚动 | `speed`, `triggerAt`, `pauseTop`, `pauseBottom` |
| `click-highlight` | 鼠标点击效果 | `selector`, `triggerAt`, `highlightMs`, `ripple` |
| `page-transition` | 页面间过渡 | `transition`, `triggerAt`, `duration` |

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
      triggerAt: 4.6,                     // 绝对时间
      highlightMs: 2500,
      padding: 60,
    },
    {
      type: 'text-annotation',
      target: 'Releases sidebar',         // 标记位置
      text: '这里下载',
      triggerAt: 4.6,
      duration: 2.5,
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

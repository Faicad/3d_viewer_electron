# 电脑屏幕截图视频生成 — AI Agent 工作流程（image_config）

## 概述

用户编写 `.mjs` 脚本（含 `const subtitle` 和 `const image_config`），AI Agent（你）负责：

1. **运行 TTS** → 获取字幕时间轴
2. **处理原始图片** — 找到 `image` 字段指向的图片，判断是否需要生成横竖屏版本
3. **运行 easyocr 分析截图** → 找到文字坐标
4. **写入 marks.json + 补全 .mjs 的 anim 数组**
5. **调用 `generate-image2-video.mjs`** 生成视频

---

## Step 0：读取脚本

```mjs
const subtitle = `
你知道吗，只剩三天时间
Windows自带的3D查看器
即将结束支持
`;

const image_config = [
  {
    image: 'movies/screenshot/win',
    description: '开始1秒后高亮显示"3D查看器"图标并点击',
  },
  {
    image: 'movies/screenshot/3D查看器',
    description: '显示文字标注"2026年6月30日结束 ⏰"',
  },
  {
    image: '',   // 空字符串 = 延续上一个画面
    description: '结束前1秒点击右上角"详细信息"按钮',
  },
];
```

检查点：
- `subtitle` 的每行对应一句台词，行号从 0 开始（首句=0）
- `image_config` 数量 = `subtitle` 行数（一一对应），空字符串 `image: ''` 表示延续上一个画面但仍算一条
- `image` 字段指向本地 PNG 文件路径（不含扩展名和后缀），运行时按 `${image}_h.png` / `${image}_v.png` / `${image}.png` 顺序查找

---

## Step 1：运行 TTS

```bash
node movies/pregen-tts.mjs <script.mjs>
```

生成 `gen/<name>.subtitle`，包含每句台词的时间（秒）：

```json
{
  "segments": [{
    "entries": [
      { "s": 0.5, "e": 2.83, "t": "你知道吗，只剩三天时间" },
      { "s": 2.98, "e": 5.62, "t": "Windows自带的3D查看器" },
      ...
    ]
  }]
}
```

**`triggerAt` 是相对于当前场景起始时刻的偏移秒数**。场景时长：

- 首行：`imageDurations[0] = TTS_0 + INITIAL_GAP(0.5s) + INTER_LINE_GAP(0.15s)`，从 `t=0` 开始
- 后续行：`imageDurations[i] = TTS_i + INTER_LINE_GAP(0.15s)`，从 `entries[i].s` 开始
- 最后一行：`imageDurations[last] = TTS_last`，无尾随间隙

| description 中的说法 | 计算公式 |
|----------------------|---------|
| "台词开始N秒后" / "本页面显示N秒后" | `N` |
| "结束前N秒" | `imageDurations[i] - N` |
| "台词开始时" / 未指定 | `0` |
| "上个动画结束后" | 上一个 anim 步骤的 `triggerAt + duration`（或 `triggerAt + highlightMs/1000`） |

### 场景时序检查（必须执行）

**1. 动画超出场景窗口** — `triggerAt` 或 `triggerAt + duration/highlightMs` 超过 `imageDurations[i]`，则动画不可见。向用户报告并要求选择：延长场景 / 调整 triggerAt / 缩短时长。

**2. triggerAt 对应关系验证** — 逐条核对 description 时间描述与公式计算结果是否一致，不一致则提示用户。

---

## Step 1.5：处理原始图片

找到 `image_config` 中每个 `image` 字段指向的原始图片，按以下规则处理：

**1. 只有一张原始图片且无方向后缀**

例如用户提供了 `movies/screenshot/win.png`，没有 `_h.png` / `_v.png` 版本：

```bash
node scripts/gen-orient-images.mjs <原始图片路径>
```

示例：

```bash
node scripts/gen-orient-images.mjs movies/screenshot/win.png
```

执行后生成 `win_h.png`（1920×1080 横屏）和 `win_v.png`（1080×1920 竖屏）两个文件。

**2. 已有 `_h.png` 和 `_v.png` 两个版本**

跳过，无需处理。

**3. 有多个文件但不是 `_h`/`_v` 命名规范**

报错给用户：`image` 字段对应的文件必须为单张原始图或无方向后缀 + `_h`/`_v` 成对的形式。

---

## Step 2：EasyOCR 定位文字并写入 marks.json

`movies/easyocr-mark.mjs` 一次性完成 easyocr 分析 + 坐标写入：

```bash
node movies/easyocr-mark.mjs <截图.png> <输出marks.json> <查找文字1> [查找文字2 ...]
```

### 2.1 横竖屏各执行一次

截图分为横屏（`_h.png`）和竖屏（`_v.png`）两套，**必须分别执行**：

```bash
# 横屏：entry 0 的 "3D查看器"
node movies/easyocr-mark.mjs \
  movies/e1/ai_gen/m0_refactor_0000_h_full.png \
  movies/e1/ai_gen/m0_refactor_0000_h_marks.json \
  "3D查看器"

# 竖屏
node movies/easyocr-mark.mjs \
  movies/e1/ai_gen/m0_refactor_0000_v_full.png \
  movies/e1/ai_gen/m0_refactor_0000_v_marks.json \
  "3D查看器"
```

注意：截图在 `aiGenDir/` 中的文件名格式为 `<scriptName>_<NNNN>_<h|v>_full.png`，由 `generate-image2-video.mjs` 自动从 `movies/screenshot/` 复制过去。如果尚未生成，可先对原图执行一次视频生成（`--no-tts --no-burn`），或手动复制。

### 2.2 多目标同时查找

一次查找多个文字（适用于同一截图有多个标记点）：

```bash
node movies/easyocr-mark.mjs \
  movies/screenshot/win_h.png \
  ai_gen/m0_refactor_0000_h_marks.json \
  "3D查看器" "文件资源管理器"
```

### 2.3 找不到文字

如果 easyocr 无法识别目标文字：

1. **确认截图是否包含该文字** — 用图片查看器打开确认
2. **尝试文字变体** — 全角/半角、简繁体
3. **手动估算坐标** — 实在无法识别时，根据元素在屏幕上的大致位置估算 `{x, y, w, h}` 填入 marks.json

---

## Step 3：补全 anim 数组

动画类型与 URL 变体完全一致：

| type | 分类 | 用途 | 关键参数 |
|------|------|------|---------|
| `highlight-area` | **Mark** | 高亮页面元素 | `selector`, `triggerAt`, `highlightMs`, `padding` |
| `text-annotation` | **Mark** | 在元素旁加文字标注 | `target`, `text`, `triggerAt`, `duration`, `position` |
| `click-highlight` | **Mark** | 鼠标点击效果 | `selector`, `triggerAt`, `highlightMs`, `ripple` |
| `scroll-to-text` | **Mark** | 滚动到文字可见 | `text`, `triggerAt`, `duration`, `offset` |
| `caption` | **Caption** | 视口居中文字 | `text`, `triggerAt`, `duration`, `top`, `fontSize`, `color`, `align`, `pad` |

**禁止把 subtitle 文字放入 caption 动画** — `subtitle` 是旁白文本，由后期字幕系统自动烧录到视频中。`anim` 数组只负责 `description` 中指定的标注/高亮/点击等视觉效果。caption 的 `text` 只能来自 `description` 中明确提到的文字标注内容。

**"分成N段显示" 用一条 caption 加完整文字** — 当 description 要求一段文字"分成N段显示"时，不要拆成多个 caption 条目。用一条 caption，text 放完整文字，html-composer 内部会处理分段动画效果。参见 `movies/e1/m5.mjs` 的 caption `"求关注、求转发、求收藏"` 写法（第75-88行）。

`caption` 样式参数（`top`/`fontSize`/`color`/`align`/`pad`）**必须全部显式提供**。每个参数支持标量（横竖屏通用）或 `{h, v}` 对象（区分方向）。

`click-highlight` 的 `selector` = marks.json 的 key（即 easyocr 的查找目标文字）。

完整示例：

```mjs
const image_config = [
  {
    image: 'movies/screenshot/win',
    description: '开始1秒后高亮显示"3D查看器"图标并点击',
    anim: [
      {
        type: 'caption',
        text: '你知道吗，只剩三天时间',
        triggerAt: 0,
        duration: 2.98,
        top: { h: 80, v: 75 },
        fontSize: { h: 48, v: 42 },
        color: '#ff6b35',
        align: 'center',
        pad: { h: 5, v: 5 },
      },
      {
        type: 'click-highlight',
        selector: '3D查看器',       // marks.json 的 key
        triggerAt: 1.0,
        highlightMs: 1500,
      },
    ],
  },
  {
    image: 'movies/screenshot/3D查看器',
    description: '显示文字标注"2026年6月30日结束 ⏰"',
    anim: [
      {
        type: 'caption',
        text: '2026年6月30日结束 ⏰',
        triggerAt: 0.5,
        duration: 2.0,
        top: { h: 20, v: 25 },
        fontSize: { h: 72, v: 72 },
        color: '#ff6b35',
        align: { h: 'left', v: 'center' },
        pad: { h: 22, v: 10 },
      },
    ],
  },
  {
    image: '',
    description: '结束前1秒点击右上角"详细信息"按钮',
    anim: [
      {
        type: 'click-highlight',
        selector: '详细信息',
        triggerAt: 0.82,
        highlightMs: 1000,
      },
    ],
  },
];
```

---

## Step 4：生成视频

```bash
node movies/generate-image2-video.mjs <script.mjs> [--tts edge-tts] [--no-tts] [--no-burn] [-f]
```

参数：
- `--tts edge-tts`：指定 TTS 引擎（默认 spark-tts）
- `--no-tts`：跳过 TTS，使用已有的字幕文件
- `--no-burn`：不烧录字幕（只生成原始 webm）
- `-f` / `--force`：强制重新生成（忽略缓存）

流程：
1. 读取 `const image_config`（含补全后的 anim）
2. 复制本地截图到 `aiGenDir/`
3. 加载 marks.json
4. 生成 HTML 合成（html-composer.mjs）
5. Playwright 录制 HTML 动画 → WebM
6. FFmpeg 裁剪精确时长
7. 烧录字幕 + 混音 → MP4

---

## 完整工作流

```bash
# Step 1: TTS
node movies/pregen-tts.mjs movies/e1/m0_refactor.mjs

# Step 2: EasyOCR 定位文字并写入 marks.json
# (截图由 generate-image2-video.mjs 自动复制到 aiGenDir/，可先跑一遍视频生成)
node movies/easyocr-mark.mjs movies/e1/ai_gen/m0_refactor_0000_h_full.png movies/e1/ai_gen/m0_refactor_0000_h_marks.json "3D查看器"
node movies/easyocr-mark.mjs movies/e1/ai_gen/m0_refactor_0000_v_full.png movies/e1/ai_gen/m0_refactor_0000_v_marks.json "3D查看器"
node movies/easyocr-mark.mjs movies/e1/ai_gen/m0_refactor_0002_h_full.png movies/e1/ai_gen/m0_refactor_0002_h_marks.json "详细信息"
node movies/easyocr-mark.mjs movies/e1/ai_gen/m0_refactor_0002_v_full.png movies/e1/ai_gen/m0_refactor_0002_v_marks.json "详细信息"

# Step 3: 补全 m0_refactor.mjs + 写 marks.json

# Step 4: 生成视频
node movies/generate-image2-video.mjs movies/e1/m0_refactor.mjs
```

## 参考脚本

参见 `movies/e1/m0_refactor.mjs` — `image_config` 格式的完整参考脚本。

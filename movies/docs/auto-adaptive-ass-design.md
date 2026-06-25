# 字幕自动生成 + 横竖屏适配 — 设计方案

## 1. 总览

用户**不写 ASS 文件，不估算时长**。字幕时间轴由 TTS 实测驱动：

```
录制脚本 (.mjs)                    generate-subtitle.mjs                burn 烧录时
┌──────────────────────┐         ┌────────────────────────┐         ┌──────────────────────┐
│ const subtitle = `   │   →     │ edge-tts 逐行生成语音   │   →     │ buildAss() 生成       │  →  ffmpeg
│ line1                │         │ ffprobe 实测每段时长   │         │ temp ASS (per orient) │
│ line2                │         │ → .subtitle + .mp3     │         │ PlayRes=目标分辨率     │
│ ...                  │         └────────────────────────┘         └──────────────────────┘
└──────────────────────┘          一步完成：字幕时间轴
  用户只管文本                     精确匹配 TTS 实际语速                 自动生成完整 ASS 格式
```

| 步骤 | 时机 | 输入 | 输出 | 做什么 |
|------|------|------|------|--------|
| **Step 1** | 录制完成后 | `.mjs` 中的 `const subtitle` 文本 + 视频 | `.subtitle` (JSON) + `.mp3` | 逐行 TTS → 实测时长 → 精确字幕时间轴 + 拼接音频 |
| **Step 2** | burn 烧录时 | `.subtitle` + 目标分辨率 | 临时 ASS 文件 | 生成完整 ASS（header + styles + events），ffmpeg 烧录 |

**核心原则**：字幕时间轴来自 TTS 实测时长，字幕和语音天然同步。不估算、不变速、不裁剪。

---

## 2. 数据格式设计

### 2.1 用户输入（在 `.mjs` 脚本中）

用户在录制脚本中用模板字符串声明字幕文本：

```javascript
// movies/p1/m1.mjs

const subtitle = `
我给AI写了一个技能（SKILL)
可以直接查看20多种3D模型文件格式
这是Voron三叉戟3D打印机的模型
利用这个技能（SKILL)就可以直接查看了
不需要额外装其它软件
这里通过爆炸动画看它的装配结构
`
```

`generate-subtitle.mjs` 自动解析 `const subtitle = \`...\`` 模板字符串，按行拆分。括号 `()`/`（）` 内的文本在 TTS 朗读时自动去除（屏幕仍显示）。

### 2.2 中间格式 `.subtitle`（JSON）

存储在 `{scriptDir}/gen/{scriptName}.subtitle`，是字幕内容和时间轴的唯一数据源。

```json
{
  "version": 1,
  "segments": [
    {
      "duration": 22.36,
      "entries": [
        { "s": 0.5,  "e": 3.14,  "t": "我给AI写了一个技能（SKILL)" },
        { "s": 3.29, "e": 7.59,  "t": "可以直接查看20多种3D模型文件格式" },
        { "s": 7.74, "e": 11.46, "t": "这是Voron三叉戟3D打印机的模型" },
        { "s": 11.61,"e": 14.89, "t": "利用这个技能（SKILL)就可以直接查看了" },
        { "s": 15.04,"e": 17.68, "t": "不需要额外装其它软件" },
        { "s": 17.83,"e": 21.60, "t": "这里通过爆炸动画看它的装配结构" }
      ]
    }
  ]
}
```

**字段说明：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `version` | int | 格式版本号，当前为 1 |
| `segments` | array | 每段视频的字幕数据 |
| `segments[N].duration` | float | 该段视频时长（秒），从视频文件 ffprobe 得到 |
| `segments[N].entries` | array | 该段内的字幕条目 |
| `entries[].s` | float | 起始时间（秒），基于 TTS 实测时长 + 间隙 |
| `entries[].e` | float | 结束时间（秒），`s + TTS 实测时长` |
| `entries[].t` | string | 字幕文本（保留原始文本，含括号） |

**时间轴生成规则**：

- 第一行前预留 0.5s 静音 (`INITIAL_GAP`)
- 行间预留 0.15s 间隙 (`INTER_LINE_GAP`)，既是音频静音也是字幕视觉分隔
- 每行的 `e - s` = 该行 TTS 音频的 ffprobe 实测时长（未经任何变速）
- 所有时间秒数保留两位小数

**时长校验**：TTS 音频总时长（含间隙）必须 ≤ 视频时长，否则脚本直接报错退出。不对语音做任何变速处理。

> **设计原则**：`.subtitle` 是格式无关的纯数据。未来如果换 SRT / WebVTT / 其它格式，只需改 Step 2 的生成逻辑，`.subtitle` 不变。

---

## 3. Step 1：`generate-subtitle.mjs`（录制完成后）

### 3.1 触发时机

录制完成后，手动运行：

```bash
node movies/generate-subtitle.mjs movies/p1/m1.mjs
```

### 3.2 工作流程

1. **解析**：从 `.mjs` 脚本中提取 `const subtitle = \`...\`` 模板字符串，按行拆分
2. **探视频**：ffprobe 探测 `gen/{name}_h.webm` 视频时长
3. **逐行 TTS**：每行调用 `edge-tts --voice zh-CN-XiaoxiaoNeural --text "<cleaned>"` 生成语音片段
4. **实测时长**：ffprobe 探测每个 TTS 片段的准确时长
5. **校验**：TTS 总时长（含间隙）> 视频时长 → 报错退出
6. **写 `.subtitle`**：以实测时长生成精确时间轴
7. **拼接音频**：concatenate 所有 TTS 片段 + 静音间隙 → `gen/{name}.mp3`

### 3.3 TTS 文本清洗

括号 `()`/`（）` 内的文本屏幕显示但不朗读。`cleanTtsText()` 在调用 edge-tts 前自动去除括号内容。

```
输入:  "我给AI写了一个技能（SKILL)"
朗读:  "我给AI写了一个技能"
显示:  "我给AI写了一个技能（SKILL)"
```

### 3.4 用户微调

`.subtitle` 是 JSON 文件，用户可以直接编辑调整时间和文本，下次 burn 时生效。不需要重新录制。

```bash
# 生成字幕+配音
node movies/generate-subtitle.mjs movies/p1/m1.mjs

# 如果不满意，手动编辑
vim movies/p1/gen/m1.subtitle

# 烧录
node movies/burn.mjs movies/p1/m1.mjs
```

---

## 4. Step 2：`buildAss()`（burn 时）

### 4.1 触发时机

`renderVideo` 在处理每个 orientation 时，读取 `.subtitle`，调用 `buildAss()` 生成临时 ASS 文件，传给 ffmpeg。

### 4.2 `buildAss(subtitlePath, targetW, targetH)` 函数

**输入**：`.subtitle` 文件路径 + 目标视频宽高
**输出**：临时 ASS 文件路径

**生成内容**：

```ini
[Script Info]
Title: {scriptName} subtitles
ScriptType: v4.00+
Collisions: Normal
PlayResX: {targetW}
PlayResY: {targetH}
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,{fontName},{fontSize},{primaryColour},{secondaryColour},{outlineColour},{backColour},0,0,0,0,100,100,0,0,1,{outline},{shadow},2,{marginL},{marginR},{marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,{startAssTime},{endAssTime},Default,,0,0,0,,{text}
...
```

### 4.3 样式参数的基准值与缩放

定义一份**基准样式**（以 1920×1080 横屏为 reference），实际生成时按分辨率缩放：

```javascript
const BASE_STYLE = {
  fontName:       'Microsoft YaHei',
  fontSize:       52,        // 1080p 横屏基准
  primaryColour:  '&H00FFFFFF',  // 白色字
  secondaryColour:'&H000000FF',
  outlineColour:  '&H00000000',  // 黑色描边
  backColour:     '&H80000000',  // 半透明黑底
  outline:        2.5,
  shadow:         0.5,
  marginL:        60,
  marginR:        60,
  marginV:        80,
}
```

**缩放规则**：

```
scaleX = targetW / 1920
scaleY = targetH / 1080

// 相同宽高比（横屏所有 preset + 以竖屏为基准的竖屏）→ 等比缩放，skip
if |scaleX - scaleY| / max(scaleX, scaleY) < 0.01:
    scale = scaleX  // = scaleY, 效果等价

// 不同宽高比（横屏基准 → 竖屏目标）→ 用 min 保证不溢出
else:
    scale = min(scaleX, scaleY)
```

**缩放后的样式**：所有带单位的字段 × scale 后取整：

```
fontSize  = round(52 × scale)
outline   = round(2.5 × scale)
shadow    = round(0.5 × scale)
marginL   = round(60 × scale)
marginR   = round(60 × scale)
marginV   = round(80 × scale)
```

### 4.4 各 Preset 的生成参数

| Preset | 方向 | targetW×targetH | scale | fontSize | marginV |
|--------|------|-----------------|-------|----------|---------|
| `-g` | H | 1920×1080 | 1.0 | 52 | 80 |
| `-g` | V | 1080×1920 | 0.563 | 29 | 45 |
| `-m` | H | 1280×720 | 0.667 | 35 | 53 |
| `-m` | V | 720×1280 | 0.375 | 20 | 30 |
| `-s` | H | 960×540 | 0.5 | 26 | 40 |
| `-s` | V | 540×960 | 0.281 | 15 | 22 |

### 4.5 时间格式转换

`.subtitle` 中的 `s`/`e` 是秒数（float），需转为 ASS 时间格式 `H:MM:SS.cc`：

```javascript
function toAssTime(seconds) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  const c = Math.round((seconds % 1) * 100)
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(c).padStart(2, '0')}`
}
```

### 4.6 临时 ASS 文件

- 路径：`{genDir}/.ass_{scriptName}_{targetW}x{targetH}.ass`（如 `.ass_m1_1080x1920.ass`）
- 每次 `renderVideo` 调用时覆盖
- 分段模式下每段独立生成：传入 `segIndex` 参数
- 文件在 `gen/` 下，已被 `.gitignore`

---

## 5. 多段字幕分发
`.subtitle` 的 `segments` 数组与视频分段一一对应，`buildAss` 按 `segIndex` 读取对应 segment 的 entries。

如果用户提供的字幕行数跨越多个 segment，需要手动将字幕拆分到 `.subtitle` 的各个 segment 中。

---

## 6. 实现文件

| 文件 | 职责 |
|------|------|
| `movies/generate-subtitle.mjs` | 解析 `.mjs` → 逐行 TTS → 实测时长 → `.subtitle` + `.mp3` |
| `movies/generate-subtitle.mjs` | `cleanTtsText()` — TTS 文本清洗（去除括号） |
| `movies/lib.mjs` | `buildAss()` — `.subtitle` → 临时 ASS；`renderVideo()` — 烧录 |
| `movies/burn.mjs` | CLI 入口，读取 `.subtitle` 调用 `renderVideo` |

---

## 7. 边界情况

| 场景 | 处理 |
|------|------|
| 用户没写 `const subtitle` | `generate-subtitle.mjs` 报错退出 |
| TTS 总时长 > 视频时长 | 报错，提示缩短字幕文本；严禁变速 |
| `.subtitle` 存在但内容为空 | 等同于无字幕 |
| 某行 edge-tts 调用失败 | 跳过该行，继续处理后续行 |
| 所有行都失败 | 报错退出 |
| 计算出的 fontSize < 8 | 限制最小值 = 8 |
| outline/shadow 缩放后 < 1 | 限制最小值 = 1 |

---

## 8. 未来扩展

1. **AI 辅助文本调整**：AI 分析录制脚本内容，调整字幕文本使其更匹配画面节奏
2. **输出格式切换**：`.subtitle` 是格式无关的；未来可支持 `buildSrt()` / `buildWebVtt()` 输出到不同播放平台
3. **字幕样式预设**：`BASE_STYLE` 可暴露参数，允许用户覆盖字体/颜色/描边
4. **双语字幕**：`.subtitle` 的 `entry` 可扩展 `t2` 字段存放第二语言文本

# TTS 供应商文档

本项目支持 4 种 TTS 供应商，通过 `--tts` 参数切换（默认 `edge-tts`）：

| 供应商 | `--tts` 参数 | 类型 | 需要参考音频 | 需要网络 | 首次安装 |
|--------|-------------|------|------------|---------|---------|
| Edge TTS | `edge-tts` | 本地 CLI | 否（内置音色） | 是 | `pip install edge-tts` |
| 腾讯云 TTS | `tencent-tts` | HTTP API | 否（FastVoiceType） | 是 | 无需安装 |
| IndexTTS2 | `indextts` | 本地模型 | 是（参考 WAV） | 首次下载模型 | `pip install indextts2-inference` |
| Spark-TTS | `spark-tts` | 本地模型 | 否（voice creation） | 首次下载模型 | `pip install spark-tts-lib` |

---

## 字幕标注语法

字幕中可使用特殊括号控制 TTS 和屏幕显示的行为：

| 语法 | TTS 是否朗读 | 屏幕是否显示 | 用途 |
|------|-------------|-------------|------|
| `((文本))` | 不读 | 显示 | 屏幕提示词/标注，观众看到但听不到 |
| `[[文本]]` | 朗读 | 不显示 | TTS 补充词，让语音更自然但屏幕不冗余 |
| `{voice}` 前缀 | — | — | 指定该行 TTS 音色 |

```
// 示例：屏幕显示"提示词：把外壳换成黄金"，TTS 只说"把外壳换成黄金"
((提示词：))把汽车模型的外壳都换成黄金材质

// 示例：屏幕显示"技能"，TTS 说"点击技能"（避免 2 字太短导致语速异常）
[[点击]]技能
```

> **注意**：Spark-TTS voice cloning 模式下，TTS 文本不宜过短（建议 ≥4 字），否则会触发模型最小时长限制，导致语速异常缓慢。`[[...]]` 正是为此设计的——给 TTS 补字，但不污染画面。

---

## 1. Edge TTS（默认）

微软 Azure TTS 本地 CLI，无需注册，即装即用。

### 安装

```bash
pip install edge-tts
```

### 使用

```bash
# 默认使用 zh-CN-XiaoxiaoNeural
node movies/generate-subtitle.mjs script.mjs
```

脚本中可通过 `{voiceName}` 前缀为每行指定不同音色：

```
const subtitle = `
{zh-CN-XiaoxiaoNeural} 第一行使用 Xiao Xiao
{en-US-JennyNeural} 第二行使用 Jenny
`
```

### 逐字高亮（Karaoke）

Edge TTS 是唯一支持逐字时间戳的供应商。`generate-subtitle.mjs` 内部使用
`movies/edgetts_tts.py`（Python 包装器）调用 `edge_tts.Communicate` 并设置
`boundary='WordBoundary'`，捕获每个词的偏移量和时长。

生成的 `.subtitle` JSON 会为每个条目附带 `words` 数组：

```json
{
  "s": 0.5, "e": 3.08, "t": "安装也很简单",
  "words": [
    {"text": "安装", "offset": 1000000, "duration": 4125000},
    {"text": "也",   "offset": 5375000, "duration": 1125000}
  ]
}
```

`lib.mjs` 的 `buildAss()` 将 `words` 转换为 ASS karaoke `\k` 标签：

```
{\k50}安装{\k15}也{\k27}很...
```

烧录后的 `.mp4` 中，该行字幕会随朗读进度逐字高亮（黄色高亮已读部分，
白色为未读）。其他 TTS 供应商不支持逐字时间戳，生成的字幕行无高亮效果。

---

## 2. 腾讯云 TTS

腾讯云语音合成 API，需要腾讯云账号。

### 配置

在 `movies/.env` 中配置密钥：

```env
TENCENT_SECRET_ID=your_secret_id
TENCENT_SECRET_KEY=your_secret_key
```

当前使用 `FastVoiceType: WCHN-7028cbcfea0840858ea2116dae34024e`（声音复刻），如需更换可在 `tencent-tts.mjs` 中修改。

### 使用

```bash
node movies/generate-subtitle.mjs --tts tencent-tts script.mjs
```

---

## 3. IndexTTS2

Bilibili 开源的高质量语音克隆模型（零样本，需参考音频）。

### 安装

```bash
# 1. PyTorch（CPU 版）
pip install torch torchaudio --extra-index-url https://download.pytorch.org/whl/cpu

# 2. 推理包
pip install indextts2-inference
```

### 配置

在 `movies/.env` 中指定参考音频：

```env
INDEXTTS_VOICE=/path/to/your/reference.wav
```

参考音频要求：
- 格式：WAV
- 采样率：16–48 kHz
- 时长：3–15 秒（最长 15 秒，超出自动截断）
- 内容：干净人声，无背景噪音
- 语言：与目标语言一致效果最佳

### 使用

```bash
# 首次自动从 HF 下载模型（~10GB）
node movies/generate-subtitle.mjs --tts indextts script.mjs
```

> CPU 推理极慢（每句数分钟），建议在有 CUDA 的机器上使用。

---

## 4. Spark-TTS（推荐）

基于 Qwen2.5-0.5B 的高效 TTS，Apache 2.0 协议，支持 voice creation（无需参考音频）。

### 安装

```bash
# 1. PyTorch（CPU 版）
pip install torch torchaudio --extra-index-url https://download.pytorch.org/whl/cpu

# 2. 推理包
pip install spark-tts-lib
```

### 配置

在 `movies/.env` 中配置（默认值已预置）：

```env
# 声音创造参数（无需参考音频）
SPARKTTS_GENDER=male           # male | female
SPARKTTS_PITCH=moderate        # very_low | low | moderate | high | very_high
SPARKTTS_SPEED=moderate        # very_low | low | moderate | high | very_high

# 如需音色克隆（取消注释并指向参考 WAV）：
# SPARKTTS_VOICE=/path/to/ref.wav
```

### 模型下载

首次运行会自动下载，也可手动下载：

```bash
HF_ENDPOINT=https://hf-mirror.com python3 -c "
from huggingface_hub import snapshot_download
snapshot_download('SparkAudio/Spark-TTS-0.5B',
  local_dir='movies/pretrained_models/Spark-TTS-0.5B')
"
```

### 使用

```bash
# voice creation（使用 .env 的 gender/pitch/speed）
node movies/generate-subtitle.mjs --tts spark-tts script.mjs

# 配合图片视频生成
node movies/generate-image-video.mjs --tts spark-tts script.mjs
```

> 推荐理由：Apache 2.0、模型仅 0.5B、无需参考音频、中英双语。

---

## 通用 CLI

```bash
# generate-subtitle 独立使用
node movies/generate-subtitle.mjs [-f|--force] [--tts PROVIDER] <script.mjs>

# generate-image-video 透传 --tts
node movies/generate-image-video.mjs [--tts PROVIDER] <script.mjs>
node movies/generate-image-video.mjs --no-tts <script.mjs>  # 跳过 TTS，仅生成视频
```

## 缓存机制

所有 TTS 供应商的音频片段缓存在 `gen/{scriptName}_segments/tts-cache.json`。相同文本重复运行时跳过已有片段，`--force` 强制重新生成。

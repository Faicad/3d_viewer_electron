# p1 — 3D Viewer 展示视频

## 文件说明

| 文件 | 说明 |
|------|------|
| `m1.mjs` | Voron Trident 爆炸动画展示 |
| `m2.mjs` | 截图合成视频（WorkBuddy 安装教程） |
| `m3.mjs` | Car.glb 金色材质 + 爆炸 + HDR 切换 + 封面截图 |
| `cover.mjs` | 封面预处理：在封面截图中央添加 "3D模型查看" 文字 |
| `gen/` | 输出目录（视频、音频、封面、烧录成品、合并成品） |
| `part-names.json` | 零件名中英文映射 |
| `exported.glb` | Voron Trident 导出模型 |

## 前置条件

- `npm run build` — 先构建前端
- `pip install edge-tts` — TTS 语音生成
- `python3 -m pip install Pillow` — 封面图片文字处理

## 一键合成（推荐）

所有步骤自动完成：录制 → 字幕 → 烧录 → 封面 → 合并：

```bash
node movies/mergeVideo.mjs movies/p1
```

等价于依次执行：
1. `node movies/p1/m1.mjs` — 录制 m1
2. `node movies/p1/m3.mjs` — 录制 m3
3. `node movies/generate-subtitle.mjs movies/p1/m1.mjs` — m1 字幕
4. `node movies/generate-subtitle.mjs movies/p1/m3.mjs` — m3 字幕
5. `node movies/burn.mjs movies/p1/m1.mjs` — 烧录 m1
6. `node movies/burn.mjs movies/p1/m3.mjs` — 烧录 m3
7. `node movies/p1/cover.mjs` — 封面预处理（加文字）
8. FFmpeg 合并 → `gen/merged_h.mp4` + `gen/merged_v.mp4`

**m2（截图合成）需手动执行**：

```bash
node movies/generate-image-video.mjs movies/p1/m2.mjs
```

## 分步流程

### 1. 录制视频（需要 headed 浏览器）

```bash
node movies/p1/m1.mjs        # Voron Trident 爆炸
node movies/p1/m3.mjs        # Car 材质+HDR
```

输出到 `gen/mX_h.webm` / `gen/mX_v.webm`。

在录制脚本中可调用 `captureCover(page)` 截图，自动保存为 `gen/p1_cover_{h|v}.png`。

### 2. 生成字幕 + 配音

```bash
node movies/generate-subtitle.mjs movies/p1/m1.mjs
node movies/generate-subtitle.mjs movies/p1/m3.mjs
```

输出 `gen/mX.subtitle` + `gen/mX.mp3`。

### 3. 单文件烧录

```bash
node movies/burn.mjs movies/p1/m1.mjs
node movies/burn.mjs movies/p1/m3.mjs
```

输出 `gen/mX_burn_{h|v}.mp4`。burn 阶段不处理封面。

### 4. 封面预处理

```bash
node movies/p1/cover.mjs
```

读取 `gen/p1_cover_{h|v}.png`（录制时截图），生成 `gen/p1_cover_final_{h|v}.png`（添加居中白色文字 + 黑色描边，文字宽度 = 画面 80%）。

### 5. 合并

```bash
node movies/mergeVideo.mjs movies/p1
```

自动发现所有片段 → burn → 拼接 + BGM + 封面。封面自动检测 `_final_` 版本。

## 封面预处理自定义

修改 `cover.mjs` 中的文字内容或样式，然后重新运行：

```bash
node movies/p1/cover.mjs
node movies/mergeVideo.mjs movies/p1
```

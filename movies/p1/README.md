# p1 — 3D Viewer 展示视频

## 文件说明

| 文件 | 说明 |
|------|------|
| `m1.mjs` | 录制 m1 视频（Car.glb Anisotropy 材质 + 一键金色） |
| `m1_old.mjs` | m1 旧版（AnisotropyBarnLamp 模型，存档参考） |
| `m2.mjs` | 录制 m2 视频（box_boss HDR 切换 + 自动旋转） |
| `m1.ass` | m1 字幕（ASS 格式） |
| `m2.ass` | m2 字幕 |
| `m1m2.ass` | m1+m2 合并字幕 |
| `m1m2_merge.json` | m1+m2 合并配置 |
| `gen/` | 输出目录（视频、音频、中间文件） |

## 前置条件

- `npm run build` — 先构建前端（录制时启动 viewer）
- `movies/alex-productions-acoustic-folk-friends.wav` — 背景音乐
- `movies/Car.glb` — m1 模型文件
- `src/test/fixtures/box_boss.glb` — m2 模型文件


## 流程

### 1. 录制视频

```bash
node movies/p1/m1.mjs
node movies/p1/m2.mjs
node movies/p1/m3.mjs
```

每段脚本生成横竖两个版本（`_h.webm` / `_v.webm`），输出到 `gen/`。

### 2. 生成配音（TTS）

```bash
node movies/generateAudio.mjs movies/p1/m1.ass
node movies/generateAudio.mjs movies/p1/m2.ass
node movies/generateAudio.mjs movies/p1/m1m2.ass
```

读取 ASS 字幕，用 edge-tts 生成中文配音 mp3，输出到 `gen/`。

### 3. 烧录字幕 + 混音（单段）

```bash
node movies/burn.mjs movies/p1/m1.mjs
node movies/burn.mjs movies/p1/m2.mjs
```

字幕烧录 + 背景音乐混音，输出 `gen/*_burn_h.mp4` / `*_burn_v.mp4`。

### 4. 合并多段视频

```bash
node movies/mergeVideo.mjs movies/p1/m1m2_merge.json
```

将 m1 和 m2 的视频拼接，加上合并字幕和背景音乐，输出 `gen/m1m2_merge_h.mp4` / `_v.mp4`。


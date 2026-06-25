# 图片合成视频方案

## 问题描述

某些视频片段的素材是静态截图（而非 Playwright 录制的 3D 场景），需要根据字幕 TTS 决定的时长，用 FFmpeg 将多张图片合成为视频。

与 Playwright 录制方案不同，截图方案不需要 headed 浏览器录制。

## 素材

```
movies/screenshot/
├── WorkBuddy_h.png             # 横屏背景图
├── WorkBuddy_h_marked_1.png    # 标注 step 1
├── WorkBuddy_h_marked_2.png    # 标注 step 2
├── WorkBuddy_h_marked_3.png    # 标注 step 3
├── WorkBuddy_h_marked_4.png    # 标注 step 4
├── WorkBuddy_v.png             # 竖屏背景图
├── WorkBuddy_v_marked_1.png    # 标注 step 1
├── WorkBuddy_v_marked_2.png    # 标注 step 2
├── WorkBuddy_v_marked_3.png    # 标注 step 3
├── WorkBuddy_v_marked_4.png    # 标注 step 4
```

横竖屏各 5 张：背景 + 4 张标注。

## 约定

### subtitle 与 image 的对齐规则

1. **subtitle 的每一行对应 image 的每一张图片。**
2. **每张图片的显示时长 = TTS 语音时长 + 间隔时长。**
3. **行数校验**：如果 subtitle 的行数与图片张数不对应，直接报错并退出。

### TTS 与字幕显示的规则

TTS 朗读时，以下内容被静音（不朗读）：
- 单层括号 `()` 内的内容
- 双层括号 `(())` 内的内容

字幕显示时：
- `()` 内的内容**原样显示**（包括括号本身）
- `(())` 的**括号本身不显示**，但其中的内容**正常显示**

例如 m2.mjs 第三行 `((点击专家->))技能`：
- TTS 内容：`技能`
- 字幕显示：`点击专家->技能`

## 方案总览

```
┌─────────────────────────────────────────────────────┐
│ 新脚本: generate-image-video.mjs                    │
│                                                     │
│ 1. 从 m2.mjs 中提取 subtitle 文本                    │
│ 2. 逐行 TTS（edge-tts）→ 实测时长                     │
│ 3. 5 张图片 → FFmpeg concat → .webm（精确匹配时长）   │
│ 4. 输出 .subtitle + .mp3（格式兼容现有 pipeline）     │
│ 5. 横竖屏各跑一遍                                    │
└──────────┬──────────────────────────────┬───────────┘
           │                              │
           ▼                              ▼
     gen/m2_{h|v}.webm             gen/m2.subtitle
                                   gen/m2.mp3
           │                              │
           └──────────┬───────────────────┘
                      ▼
             node movies/burn.mjs p1/m2
                      ▼
             gen/m2_burn_{h|v}.mp4
                      ▼
             与 m1/m3 merge → 最终视频
```

## 需要改动的文件

### 1. `movies/generate-image-video.mjs` — 新通用脚本

`movies/generate-image-video.mjs` 是一个通用脚本，规约与 `generate-subtitle.mjs` 类似，但改用图片合成视频：

- 从 `.mjs` 脚本中解析 `const subtitle = \`...\``（已有约定）
- 从 `.mjs` 脚本中解析 `const image = '...'`（新约定，如 `'movies/screenshot/WorkBuddy'`）
- 逐行 TTS → 实测时长 → `.subtitle` + `.mp3`（同 `generate-subtitle.mjs`）
- 扫描 `{image}_{h|v}.png` 和 `{image}_{h|v}_marked_*.png` → FFmpeg concat → `.webm`
- 横竖屏自动处理，支持 `-h` / `-v` 过滤和 `-s` / `-m` / `-g` 分辨率

**不需要修改 m2.mjs** —— `parseSubtitleLines` 读取的是原始文件内容（`readFileSync`），在原始文件中 `\n` 是两个字面量字符（反斜杠 + n），不会被 JS 引擎解析为换行。所以 m2.mjs 中的 `\n` 已经自然表示"单条字幕内的折行"，无需改成 `\\n`。

### 2. `movies/lib.mjs` — `buildAss` 新增字幕折行支持

**`buildAss()`** 函数中，将字幕文本中的 `\n`（字面量）替换为 ASS 的 `\N` 换行标记：

```javascript
const text = e.t.replace(/\\n/g, '\\N')
```

这样 TTS 朗读时自然连续，但字幕显示时在 `\n` 处折行。

### 3. `movies/p1/m2.mjs` — 无需改动

## 与现有关联的兼容性

### burn 阶段

burn.mjs 按约定自动推导路径。只要 `.webm` 文件命名为 `gen/m2_{h|v}.webm`，且 `.subtitle` + `.mp3` 在 `gen/` 下，burn 不需要任何修改。

```bash
node movies/burn.mjs movies/p1/m2.mjs
```

### merge 阶段

merge 自动扫描项目目录下所有 `.mjs`，无需手动指定片段列表。

## 工作流程

```bash
# 1. (可选) 录制 m1, m3
node movies/p1/m1.mjs -h -v
node movies/p1/m3.mjs -h -v

# 2. 为 m1, m3 生成字幕+音频
node movies/generate-subtitle.mjs movies/p1/m1.mjs
node movies/generate-subtitle.mjs movies/p1/m3.mjs

# 3. 生成 m2 图片视频 + 字幕 + 音频（一站式）
node movies/generate-image-video.mjs movies/p1/m2.mjs

# 4. 合并（自动 burn → 合并）
node movies/mergeVideo.mjs movies/p1
```

注意第 3 步一站式生成 `.webm` + `.subtitle` + `.mp3`，跳过了 m1/m3 的"先录制再 generate-subtitle"两步流程。

## 注意事项

1. **TTS 时长必须 ≤ 视频时长**。由于 m2 的视频时长由 TTS 决定（先 TTS → 后造视频），不会出现超时问题。与 m1/m3 反过来。
2. **横竖屏独立处理**。generate-image-video.mjs 自动扫描 `_h` / `_v` 后缀的图片，按 `resolveOrientationFilter()` 过滤。
3. **素材裁剪**。5 张截图是 960×540 (540p) 还是 1920×1080 (1080p)？如果素材分辨率不一致，FFmpeg 的 scale+pad 会统一处理。
4. **EDGE TTS 依赖**。需要 `pip install edge-tts`。

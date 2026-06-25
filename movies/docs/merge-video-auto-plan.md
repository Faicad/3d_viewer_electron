# merge 方案（当前实现）

> 约定大于配置，`merge.json` 可选覆盖默认值。

## 用法

```bash
node movies/mergeVideo.mjs movies/p3
# 自动完成：burn → 封面 → 合并输出 gen/merged_h.mp4 + gen/merged_v.mp4
```

## 流程

```
输入: 项目目录 (movies/p1)
  │
  ├─ [1] 扫描所有 .mjs 文件，按文件名排序
  │     → [m1.mjs, m2.mjs, m3.mjs]
  │
  ├─ [2] 对每个 .mjs 执行 burn.mjs（透传 CLI 参数）
  │     → 产生 gen/m1_burn_h.mp4, gen/m1_burn_v.mp4, ...
  │
  ├─ [3] 收集所有 _burn_h.mp4 / _burn_v.mp4
  │
  ├─ [4] cover 预处理 → 自动检测封面
  │
  ├─ [5] 读项目目录下 merge.json（可选），取 audioBg 覆盖默认 BGM
  │
  ├─ [6] concatBurnedClips：拼接 + 混入 BGM → merged.mp4
  │
  └─ [7] （备查）生成合并字幕 merged.subtitle
```

## merge.json（可选）

约定文件名 `merge.json`，放在项目目录下。目前支持 `audioBg` 字段。

```json
// movies/p3/merge.json
{ "audioBg": "movies/Jamvana - Pure Ocean.mp3" }
```

不存在则全部用约定值。

## CLI 参数透传

目录路径后的所有参数转发给 `burn.mjs`，`--default-bg` 除外（由 merge 统一加）：

```bash
node movies/mergeVideo.mjs movies/p1 -g -f    # 1080p + 强制重新生成
node movies/mergeVideo.mjs movies/p1 -g -h    # 1080p + 仅横屏
```

## 背景音乐

- 默认：`movies/alex-productions-acoustic-folk-friends.wav`，音量 0.1
- 自定义：项目目录下 `merge.json` 中写 `audioBg`

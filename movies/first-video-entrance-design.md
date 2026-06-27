# 首个视频跳过 entrance slide + zoom delay — 设计文档

## 1. 背景

当前 `buildImageVideo()` 在以下条件全部满足时，会为首帧添加 slide 入场动画（图片从左侧滑入）：

- `n > 1`（有多行台词）
- 首段时长足够（`AD >= 1/fps + 0.001`）
- 首段没有 `config` 动画（`!segmentAnim[0]?.animation`）
- 有前一个视频时用前一视频的末帧作为背景滑入，**无前一个视频时用白色背景**

问题有两个：

1. **首个视频用白色背景做 slide 入场动画显得突兀**。正确的做法是：首个视频完全跳过 entrance slide，首帧直接静止显示。
2. **zoom 动画没有起始延时**。zoom 的效果是图片从原始大小逐步放大，但首帧画面需要稳定显示让用户适应，且 entrance slide 和 zoom 需要衔接。

## 2. Merge 流程中的视频顺序

`mergeVideo.mjs` 是视频合并的总入口，其排序逻辑即为视频播放顺序的唯一依据：

```
mergeVideo.mjs mergeProject() 第 238-241 行：

files = readdirSync(projectDir)
    .filter(f => f.endsWith('.mjs') && f !== 'cover.mjs')
    .sort()
```

规则：

- 扫描项目目录下所有 `.mjs` 文件
- 排除 `cover.mjs`（封面预处理脚本，不参与视频片段排序）
- 按文件名字典序排列
- 排列结果的 **第一个文件** 即为首个视频

例如 `e1/` 目录：筛选后得到 `[m0.mjs, m0_1.mjs, m1.mjs, m2.mjs]`，`m0.mjs` 是首个视频。

最终合并输出顺序（`concatBurnedClips`，第 87-101 行）：

```
[cover clip (optional)] → m0_burn.mp4 → m0_1_burn.mp4 → m1_burn.mp4 → m2_burn.mp4 → ...
```

cover clip 是合并阶段（concat 时）额外前置的独立帧，与 generate-image-video 生成的视频片段无关。**generate-image-video 只关心自己生成的片段在 video 片段序列中的位置**。

## 3. 首个视频的定义

**首个视频** = merge 排序后的 `.mjs` 文件列表中 `scripts[0]` 对应的脚本。

在 `generate-image-video.mjs` 中判断当前脚本是否为首个视频：

```
当前脚本文件名 === getOrderedScripts(scriptDir)[0]
```

## 4. 设计方案

### 4.1 公共方法

将获取排序后的视频脚本列表的逻辑抽取为公共方法，已在 `generate-image-video.mjs` 中实现：

```
function getOrderedScripts(scriptDir) {
  if (!existsSync(scriptDir)) return []
  return readdirSync(scriptDir)
    .filter(f => f.endsWith('.mjs') && f !== 'cover.mjs')
    .sort()
}
```

该方法与 mergeVideo.mjs 中的排序逻辑完全一致，是判断首个视频的唯一权威来源。

### 4.2 判断入口

在 `generateImageVideo()` 主函数中，排序脚本 → 获取首个文件名 → 判断当前脚本是否为首个：

```
const allScripts = getOrderedScripts(scriptDir)
const scriptFileName = basename(scriptPath)
const scriptIdx = allScripts.indexOf(scriptFileName)
const isFirstVideo = scriptIdx <= 0
```

- `scriptIdx === 0`：在排序列表中排第一，是首个视频
- `scriptIdx === -1`：脚本不在目录中（异常情况），保守视为首个视频，跳过 entrance

### 4.3 改动点：entrance 条件

**entrance 条件修正**：

```
const hasEntrance = n > 1
    && AD >= 1/fps + 0.001
    && !isFirstVideo
```

- 移除了原有 `!segmentAnim[0]?.animation` 条件
- 非首个视频：entrance 行为完全不变。（有 prevFrameImage 则用，**没有必须报错退出**——非首个视频一定存在前一个视频，不可能出现无 prevFrameImage 的情况）
- 首个视频：跳过 entrance slide，首帧直接走静态显示

entrance 和 config 动画不再互斥，entrance 播放完后，config 动画（如 zoom）可衔接执行。

### 4.4 zoom delay 机制

`animation: "zoom"` 新增一个延时参数 `delay`（单位秒），表示 zoom 动画开始前等待的时间。zoom 的有效放大时间 = 段总时长 - delay - 0.5（最后 0.5s 冻结）。

**delay 默认值规则**：

| 位置 | 默认 delay | 说明 |
|------|-----------|------|
| 首个视频的首帧（segment 0） | `1.0` | 首帧画面稳定显示 1 秒，让用户适应 |
| 非首个视频的首帧（segment 0） | `AD + 0.5` | entrance slide 播放完（AD 秒）后，再等 0.5 秒 |
| 其他 segment（i > 0） | `0` | zoom 从段开始立即执行 |

其中 `AD = Math.min(1, imageDurations[0])`，即 entrance slide 动画时长。

**zoom 时间线示例**（以首个视频首帧为例，总时长 3s）：

```
t=0 ─────────── t=1s ────────────────────── t=2.5s ────── t=3s
   静态显示          zoom 开始 (3%/s)           冻结       结束
   (delay=1s)       │                           │
                    zoom 有效时间 = 1.5s        最后 0.5s 不动
```

**非首个视频首帧时间线**（entrance + zoom，总时长 4s，AD=1s）：

```
t=0 ─── t=1s ───── t=1.5s ───────────────── t=3.5s ── t=4s
   slide 入场     pause    zoom 开始 (3%/s)    冻结     结束
   (entrance)     (0.5s)   │                    │
                           zoom 有效时间 = 2.0s  最后 0.5s 不动
```

### 4.5 改动点：zoom 实现

zoom 的 ffmpeg filter 需要加入 delay 参数：

```
zoompan=z='if(lte(it, activeFrames - 1),
               1 + 0.03/fps * max(0, it - delayFrames),
               finalZoom)'
```

其中：
- `delayFrames = Math.round(delay * fps)`：延时对应的帧数
- `activeFrames = Math.floor((dur - delay - 0.5) * fps)`：有效 zoom 帧数
- `finalZoom = 1 + 0.03/fps * (activeFrames - 1)`：最终缩放比

当 `it < delayFrames` 时，`z=1`（静态显示）；
当 `delayFrames <= it < delayFrames + activeFrames` 时，zoom 递增；
当 `it >= delayFrames + activeFrames` 时，`z=finalZoom`（冻结）。

## 5. 边界情况

| 场景 | isFirstVideo | hasEntrance | segment 0 delay | 行为 |
|------|------------|-------------|----------------|------|
| 首个视频，segment 0 有 zoom | true | false | 1.0 | 静态 1s → zoom → 冻结 0.5s |
| 首个视频，segment 0 无 zoom | true | false | N/A | 全程静态 |
| 非首个视频，segment 0 有 zoom | false | true | AD + 0.5 | slide 入场 → pause → zoom → 冻结 |
| 非首个视频，segment 0 无 zoom | false | true | N/A | slide 入场 → 静态 |
| 非首个视频，segment 0 无 prevFrameImage | false | true | — | **报错退出**（不可能出现） |
| 非首个视频，segment 1 有 zoom | false | — | 0 | zoom 从段开始立即执行 |

## 6. 现有代码分析

当前 `generate-image-video.mjs` 已有的相关结构：

```
allScripts = getOrderedScripts(scriptDir)      // 排序后的脚本列表
scriptIdx = allScripts.indexOf(scriptFileName)  // 当前脚本位置
isFirstVideo = scriptIdx <= 0                   // 是否首个视频

prevFrameImage 获取条件：scriptIdx > 0  // 有前一个视频
```

需要改动：

1. **hasEntrance**：移除 `!segmentAnim[0]?.animation`，改为 `!isFirstVideo`
2. **非首个视频无 prevFrameImage**：添加 `if (isFirstVideo === false && !prevFrameImage) { error }`
3. **zoom delay 计算**：根据 isFirstVideo + segment index 计算默认 delay，传给 zoompan

# `---x---` 静音设计

## 1. 语法

```
---2000---     ← 插入 2000ms 静音
---500---      ← 插入 500ms 静音
```

- 独占一行，不可与文字混合
- `x` 为毫秒数
- 一个组内可以有多个，时长累加

---

## 1.1 可能出现的位置（全排列）

| 位置 | 示例 | 组归属 | 语义 |
|------|------|--------|------|
| 组 0 前缀 | `---x---` + TTS + `--1--` | group 0 | 在最开始插入静音 |
| 组 N 前缀（标准用法） | `--N--` + `---x---` + TTS | group N | 在同步点后插入静音 |
| 同组两 TTS 之间 | TTS1 + `---x---` + TTS2 + `--N--` | group N | 同组两句话之间加静音 |
| 组末尾（`--N--` 前） | TTS + `---x---` + `--N--` | group N | 在同步点前加静音，计入前组 totalDuration |
| 连续多个 | `--N--` + `---1000---` + `---2000---` + TTS | group N | 累加 |
| 最后组末尾 | TTS + `---x---` | last group | 视频末尾加静音（无字幕） |

| 位置 | pregen timing | 录制 syncpoint | 字幕 cursor | 音频 concat | 评价 |
|------|--------------|---------------|-------------|-------------|------|
| 组 0 前缀 | totalDuration 计入 | 不影响（--1-- 走 group 0 timing） | cursor += x，从 0.5s 开始 | 正常插入 | ✅ 可用 |
| 组 N 前缀 | totalDuration 计入 | `--N+1--` 多等 x ms | cursor = sp[N-1] + x | 正常插入 | ✅ 标准用法 |
| 同组两 TTS 之间 | totalDuration 计入 | 不影响（同组） | cursor += x，在 TTS1 后 | 正常插入 | ✅ 可用 |
| 组末尾 | totalDuration 计入 | `--N+1--` 等前组 total（含静音） | cursor 推进后重置到 sp[N]，sp[N] ≥ cursor（差 entryAnim），正向跳 | 正常插入 | ✅ 同步点足够晚，不会吞静音 |
| 连续多个 | 累加 | 累加 | 累加 | 累加 | ✅ |
| 最后组末尾 | totalDuration 计入 | 不影响 | cursor 推进，无后续条目 | 插入静音段 | ✅ 视频末尾多一段静音 |



> **验证规则**：每个组必须包含至少 1 条 TTS 行。纯静音组（组内仅有 `---x---`，无任何 TTS）→ **报错退出**。

## 2. `---x---` 在流水线各环节的行为

| 环节 | 涉及模块 | 行为 |
|------|----------|------|
| 解析 | `splitBySyncpoints` | 按 `--N--` 切分后的行位置，`---x---` 所在组由它在字幕中的行序决定，与 TTS 行同等待遇 |
| 预生成 timing | `pregen-tts.mjs` | 计入组 totalDuration → 录制时同步点多等 x ms |
| 录制 | `lib-electron.mjs` `syncpoint()` | 等待组 totalDuration（含静音） |
| 字幕生成 | `generate-subtitle.mjs` | 推进 cursor，不产生字幕条目 |
| 音频合成 | `generate-subtitle.mjs` | 插入 x ms 的静音 mp3 片段 |
| burn | `burnVideo` | 无特殊处理，由上环节的 .mp3 和 .subtitle 决定 |

### 2.1 解析（subtitle→groups→segments）

```
STL文件
--1--
---2000---
GLB文件
```

↓ 解析后

```
groups = [
  ["STL文件"],                  ← group 0
  ["---2000---", "GLB文件"],   ← group 1
]

segments = [
  { text: "STL文件", group: 0, duration: 3.72, isSilence: false },
  { isSilence: true, group: 1, duration: 2.0 },
  { text: "GLB文件", group: 1, duration: 3.60, isSilence: false },
]
```

### 2.2 pregen timing

**`computeGroupDurations` 计算规则（含静音）：**

```js
for (seg of segments) {
  g.totalDuration += seg.duration       // 静音段和非静音段都计入
  if (!seg.isSilence) g.lineCount++
  // 同组 TTS-to-TTS 加 INTER_LINE_GAP（静音段不触发此逻辑）
}
g[0].totalDuration += INITIAL_GAP
```

**timing.json 输出示例：**

```json
{
  "groups": [
    { "index": 0, "totalDuration": 4.22 },
    { "index": 1, "totalDuration": 5.60 },   // 含 2.0s 静音
    { "index": 2, "totalDuration": 6.56 }    // 含 2.0s 静音
  ]
}
```

### 2.3 录制同步点

**`syncpoint()` 等待时长 = `group.totalDuration * 1000`（含静音）。**

```js
// syncpoint --1-- 对应 group 0 totalDuration（不含静音）
// syncpoint --2-- 对应 group 1 totalDuration（含 ---2000---）
// syncpoint --3-- 对应 group 2 totalDuration（含 ---2000---）
// ...
```

同步点时间戳记录的是一个组的「内容应结束的时间」。

**`---x---` 对同步点的实际影响：**

- 设置 `--1--` 后的 `---2000---` 使 `--2--` 同步点多等 2000ms
- 若动画耗时 > totalDuration（含静音），同步点不等，但静音仍在音频中体现
- 若动画耗时 < totalDuration（含静音），同步点实际等待至 totalDuration 满

### 2.4 字幕时间轴

```js
cursor = INITIAL_GAP  // group 0 起始

for (seg of segments) {
  if (seg.group !== prevGroup) {
    cursor = syncpoints[seg.group - 1]    // 锚定到录制同步点
    prevGroup = seg.group
  }
  if (seg.isSilence) {
    cursor += seg.duration                // 仅推光标，不生成条目
    continue
  }
  // TTS 行 → 生成字幕条目
  entry.s = cursor
  entry.e = cursor + seg.duration
}
```

**示例（实际 syncpoints 值）：**

```
syncpoints = [4.527, 10.407, 16.979, ...]

Group 0: cursor = 0.50 → STL: {0.50→4.22}
Group 1: cursor = sp0 = 4.527
  ---2000---: cursor += 2.0 → 6.527
  GLB: {6.53→10.13} ✓
Group 2: cursor = sp1 = 10.407
  ---2000---: cursor += 2.0 → 12.407
  3MF: {12.41→16.97} ✓
```

### 2.5 音频合成

```
audioParts = [
  silence(INITIAL_GAP),       ← 0.5s
  TTS mp3 (STL),              ← 3.72s
  silence(2000ms),            ← 2.0s
  TTS mp3 (GLB),              ← 3.60s
  silence(2000ms),            ← 2.0s
  TTS mp3 (3MF),              ← 4.56s
  ...                         ← 按 segments 顺序
]
```

- 静音段用 `generateSilence()` 生成 mono 音频
- `ffmpeg concat` 合并所有片段

---

## 2.6 音频合成的边界 gap bug

**问题**：组边界处若有 `---x---`，音频 gap 填充被跳过。

### 追踪

```
segments = [
  seg[6]: { text: "STEP", group: 3, isSilence: false }    ← 组 3 最后一个 TTS
  seg[7]: { isSilence: true, group: 4, duration: 2.0 }     ← 组 4 前缀静音
  seg[8]: { text: "OBJ",  group: 4, isSilence: false }     ← 组 4 第一个 TTS
]

entries = [
  entries[X+1]: { s: 18.98, e: 22.80 }  ← STEP 字幕
  entries[X+2]: { s: 41.58, e: 45.83 }  ← OBJ 字幕
]
```

**音频 concat 当前代码（行 667-688）：**

```js
for (let i = 0; i < segments.length; i++) {
  audioParts.push({ path: segments[i].path })          // 每个 segment 的音频
  if (!segments[i].isSilence) entryIdx++

  if (i < segments.length - 1) {
    // 静音邻接 → 跳过 gap
    if (segments[i].isSilence || segments[i + 1].isSilence) continue  // ← BUG

    const gap = round2(entries[entryIdx + 1].s - entries[entryIdx].e)
    if (segments[i].group !== segments[i + 1].group) {
      if (gap > 0) audioParts.push({ path: customGapPath })  // 正常 gap
    }
  }
}
```

处理 i=6（STEP TTS）：
- `segments[6]` 不是静音，`segments[7]` 是静音 → **continue，跳过一切**

处理 i=7（静音段）：
- `segments[7]` 是静音 → **continue，跳过一切**

处理 i=8（OBJ TTS）：
- 最后一个 segment → 结束

**结果：entryIdx+1 和 entryIdx 之间的 gap（41.58 - 22.80 = 18.78s）从未被填充。**
音频中只有 STEP TTS(3.82s) + 2.0s 静音 + OBJ TTS(4.25s) = 10.07s。
缺失的 16.78s 同步点跳跃静音 → **音频比视频短 16.78s**。

这就是「快了 2 个模型」和「最后那么长的静音」的根因。

### 修复

在组边界处，若邻接 `---x---`，用 entries gap 减去静音段时长来填充余量：

```js
if (segments[i].isSilence || segments[i + 1].isSilence) {
  // 组边界处：静音段只覆盖了 --x-- 部分，剩余 gap 仍需填充
  if (!boundary || sameGroup) continue  // 同组静音邻接 → 跳过
  // boundary + 静音邻接 → 填充剩余 gap
  const silenceDur = nextIsSilence ? segments[i + 1].duration : segments[i].duration
  const remaining = gap - silenceDur
  if (remaining > 0.001) {
    audioParts.push({ path: customGapPath(remaining) })
  }
  continue
}
```

或更简洁：**去掉静音邻接的完全跳过，改为在边界处总是填充 entries gap。**

## 3. 与同步点的交互

### 3.1 当前痛点

| 现象 | 根因 | 定位 |
|------|------|------|
| 视频末尾 19s 静音 | 动画耗时 > totalDuration 累积漂移 + STEP 模型慢加载 | 非 `---x---` 独有问题 |
| 音频超前 ~2 模型 | 同上 | 非 `---x---` 独有问题 |
| 同步点多等了不该等的静音 | 这是 `---x---` 的设计意图 | 正常行为 |

**`---x---` 不会「丢失」同步点。**
同步点时间戳 = 动画完成时间或总时长（取大者）。静音作为组 totalDuration 的一部分被包含在内。

### 3.2 已知边缘情况

| 情况 | 表现 | 是否可接受 |
|------|------|-----------|
| 动画耗时 > totalDuration | 同步点不等，漂移积累 | 是（模型慢加载是特例） |
| 动画耗时 < totalDuration | 同步点等待至 totalDuration 满 | 是（静音被强制执行） |
| 同组连续多个 `---x---` | 静音累加，totalDuration 也累加 | 是 |
| `---x---` 后无 TTS（仅有空行/标记） | 语法错误，脚本不会出现此情况 | 不允许 |

---

## 4. 实现检查清单

- [x] 解析：`/^---(\d+)---$/` 匹配，放入 segments
- [x] pregen computeGroupDurations：静音计入 totalDuration
- [x] 录制 syncpoint：等待组 totalDuration（含静音）
- [x] 字幕时间轴：静音段推 cursor 不生成条目
- [x] 音频合成：generateSilence + concat
- [ ] 同步文件是否因静音变更过未重现（需要重建缓存重新录制验证）

---

## 5. 待验证

1. 重建 tts-cache → 重新录制 → 确认视频和音频时长一致
2. 确认 `---2000---` 在各组的效果是否符合预期（每个组间隔约 2s）
3. 确认 STEP 模型加载慢的场景下，音频和视频是否仍保持相对同步（同步点推后但音频也随之推后）

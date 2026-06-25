# Syncpoint 设计方案

## 语法

字幕中 `--N--` 单独一行，不录音不显示。

```
你可以告诉ai给模型更换材质
--1--
{zh-CN-YunxiaNeural}((提示词：))把汽车模型的外壳都换成黄金材质
于是外壳的材质就都换掉了
--2--
还可以让ai做更多
```

## 时间同步规则

当前字幕时间轴生成逻辑：

```
cursor = INITIAL_GAP
for each line:
  entry.s = cursor
  entry.e = cursor + tts_duration
  cursor = entry.e + INTER_LINE_GAP
```

`--N--` 不改变这个逻辑，只在遇到 `--N--` 行时做一件事：**把 cursor 设为 syncpoint 时间**。

```
cursor = INITIAL_GAP
for each line:
  if line matches --N--:
    cursor = syncpoints[N-1]    // ← 唯一的变化
    continue                    // 不生成 entry，不录音
  entry.s = cursor
  entry.e = cursor + tts_duration
  cursor = entry.e + INTER_LINE_GAP
```

`.subtitle` 格式不变（version 1，单 segment，entries 的 s/e 是绝对秒数）。ASS 生成不变。烧录不变。

## 时长校验

M 个 `--N--` 将字幕分为 M+1 个 group，每个 group 有明确的时间窗口：

| group | 时间窗口 |
|-------|----------|
| 0（第一个 `--1--` 之前） | `[0, syncpoints[0]]` |
| i（`--i--` 到 `--i+1--` 之间） | `[syncpoints[i-1], syncpoints[i]]` |
| M（最后一个 `--M--` 之后） | `[syncpoints[M-1], videoDuration]` |

**校验**：每个 group 的最后一条 entry 的 `e` 必须 ≤ 该 group 窗口的右边界。

```
group 0: entries[last].e ≤ syncpoints[0]
group i: entries[last].e ≤ syncpoints[i]     (0 < i < M)
group M: entries[last].e ≤ videoDuration
```

违反则报错退出，提示用户缩短该 group 内的字幕文本或增加 `waitForTimeout` 拉长 syncpoint 间隔。

## `lib.syncpoint(page)`

```js
export async function syncpoint(page) {
  await page.evaluate(() => {
    if (!window.__movieSyncPoints) window.__movieSyncPoints = []
    window.__movieSyncPoints.push(performance.now())
  })
}
```

独立于 `checkpoint`（已移除）。

`makeMovie` 录制结束后收集 `__movieSyncPoints`，转为相对 `tModelBrowser` 的秒数，写入 `gen/{name}.syncpoints.json`：

```json
[5.5, 18.3]
```

## 时长校验

M 个 `--N--` 将字幕分为 M+1 个 group。每个 group 有明确的时间窗口边界：

| group | 时间窗口 | 约束 |
|-------|----------|------|
| 0（第一个 `--1--` 之前） | `[0, syncpoints[0]]` | 最后一条 entry 的 `e` ≤ `syncpoints[0]` |
| i（`--i--` 到 `--i+1--` 之间） | `[syncpoints[i-1], syncpoints[i]]` | 最后一条 entry 的 `e` ≤ `syncpoints[i]` |
| M（最后一个 `--M--` 之后） | `[syncpoints[M-1], videoDuration]` | 最后一条 entry 的 `e` ≤ `videoDuration` |

违反则报错退出，提示缩短该 group 内的字幕文本或增加 `waitForTimeout` 拉长 syncpoint 间隔。

## 计数校验

`generate-subtitle.mjs` 统计字幕中 `--N--` 行数，与 `.mjs` 源文件中 `lib.syncpoint(` 出现次数比对，不匹配则报错退出。

- 字幕有 `--N--` 但 `.syncpoints.json` 不存在 → 报错：先录制视频
- 字幕无 `--N--` → 完全向后兼容，行为不变

## 改动清单

| 文件 | 改动 |
|------|------|
| `movies/lib.mjs` | 新增 `syncpoint(page)`；`recordOne` 收集 `__movieSyncPoints`；`makeMovie` 写入 `.syncpoints.json` |
| `movies/generate-subtitle.mjs` | 解析 `--N--` 行；读取 `.syncpoints.json`；在 `--N--` 处将 cursor 跳转到 syncpoint 时间；计数校验 |
| `movies/docs/syncpoint-design.md` | 本文件 |

**不需要改**：`buildAss`、`renderVideo`、`burnVideo`、`.subtitle` 格式。视频不切分，逻辑完全不变。

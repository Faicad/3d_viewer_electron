# 动画时间线定义

## 一条时间线

视频和音频共用一条时间线。视频时长 = 音频总时长。

```
t=0 ──────────────────────────────────────────────→ t=totalDuration
    |←INITIAL_GAP→|←── TTS_0 ──→|←gap→|←── TTS_1 ──→|...
    0            0.5           3.6   3.75           6.72
```

- `INITIAL_GAP` = 0.5s — 片头静音，但**画面从 t=0 开始显示**
- `INTER_LINE_GAP` = 0.15s — 两句 TTS 之间的间隙

## subtitle entry

每行 TTS 在时间线上的位置。**只标记 TTS 出声区间，不是动画窗口边界**。

```
entry[i].s = 该行 TTS 片段的起始时间（绝对时间）
entry[i].e = 该行 TTS 片段的结束时间（绝对时间）
```

示例（m5）：
```
entry[0]: s=0.5,  e=3.6   海外用户直接Github获取      窗口 3.1s
entry[1]: s=3.75, e=6.72  国内用户前往Gitcode下载     窗口 2.97s
entry[2]: s=6.87, e=9.92  文件名带cn的是中文版       窗口 3.05s
entry[3]: s=10.07,e=12.47 求关注、求转发、求收藏       窗口 2.4s
```

所有时间起点都在脚本顶部注释中列出，方便写动画时直接参考。

## 脚本顶部注释格式

```js
// [0] 0.5 — 3.6   海外用户直接Github获取      窗口 3.1s
//        ↑ entry.s ↑ entry.e
```

## 动画时间字段

| 字段 | 含义 | 原点 |
|---|---|---|
| `triggerAt` | 动画相对于场景起始的偏移秒数 | **场景起始**（首行`t=0`，后续行`entry[i].s`） |
| `duration` | 动画持续秒数 | 从 `triggerAt` 开始算 |
| `highlightMs` | 高亮框持续毫秒数 | 从 `triggerAt` 开始算 |

## triggerAt 的原点

`triggerAt` 始终以当前行的**场景起始时刻**为原点。场景包含 TTS 语音 + 静音间隙：

- **首行** 场景从 `t=0` 开始（含 `INITIAL_GAP=0.5s` 片头静音）。场景时长额外包含 TTS 结束后的 `INTER_LINE_GAP=0.15s`（此间隙画面不变，延用当前场景）
- **后续行** 场景从 `entry[i].s` 开始。`INTER_LINE_GAP` 属于前一个场景（TTS_i-1 结束后的静音画面），不计入当前场景起始

`triggerAt = 1.0` 表示场景起始后 1 秒（对首行即绝对时间 1.0s，对后续行即 `entries[i].s + 1.0`）。

## 场景时长

每个 URL 对应的场景时长 = `imageDurations[i]`，包含静音间隙：

```
imageDurations[0] = TTS_0 时长 + INITIAL_GAP + INTER_LINE_GAP
imageDurations[i] = TTS_i 时长 + INTER_LINE_GAP         (0 < i < 最后一行)
imageDurations[last] = TTS_last 时长                     (最后一行)
```

## 当前动画模型：关联到场景组

每个 URL 对应一个**场景组**（scene group）。相同 URL 的连续行合并为同一组。

```
场景0: 海外用户 + 动画 [t=0 起，TTS 0.5s 起，持续 3.75s]
场景1: Gitcode + 动画 [3.75s 起，持续 3.12s]
场景2: Releases + 动画 [6.87s 起，持续 5.6s]  ← URL 3 合并至此
```

场景切换时有 0.3s crossfade。

## 写动画的原则

1. **`triggerAt` 是相对当前场景起始的偏移**。`triggerAt = 1.0` 表示场景起始后 1 秒
2. **动画受场景窗口限制**。不应超出 `imageDurations[i]`，否则动画在场景结束后才触发
3. `triggerAt` 的取值范围：`[0, imageDurations[i])`

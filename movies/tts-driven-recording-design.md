# TTS 时长驱动录制方案设计

## 问题

路径 A（Playwright 录制 3D 场景）的视频时长目前由录制脚本中的固定 `waitForTimeout` 决定。TTS 语音生成在录制之后，若语音总时长超过视频时长则直接报错。`--N--` 分组间的 syncpoint 间隔只能被视频时长约束，无法被 TTS 时长驱动。

路径 B（截图合成）已实现 TTS 优先：先生成语音再根据语音时长确定每张图的显示时间。路径 A 需要类似能力。

---

## 目标

路径 A 录制时，每个 `--N--` 分组的 syncpoint 位置自动对齐 TTS 语音时长：
- **视频 ≥ 语音** → 当前行为：字幕以 syncpoint 时间戳为锚点，语音在视频时间轴内自然排布
- **语音 > 视频** → 录制时在 syncpoint 处自动等待，使 syncpoint 时间戳推进到语音结束时刻

整体流水线变为：

```
┌──────────────────┐   ┌──────────────────┐   ┌──────────────────────┐   ┌──────────────────┐
│ ① 预生成 TTS     │ → │ ② 录制（TTS 感知）│ → │ ③ 生成字幕+合成音频   │ → │ ④ burn           │
│ (Durations .json) │   │ (syncpoint 自等待) │   │ (.subtitle + .mp3)   │   │ (同当前)          │
└──────────────────┘   └──────────────────┘   └──────────────────────┘   └──────────────────┘
```

执行步骤与责任划分：

| 步骤 | 谁触发 | 产出 | 改动范围 |
|------|--------|------|---------|
| ① TTS 预生成 | `makeMovie` 自动调用 | `gen/{name}.tts-timing.json`<br>`gen/{name}_segments/seg_*.mp3` | 新增文件 |
| ② 录制 | `makeMovie` 调用 `recordOne` | `gen/{name}_{h\|v}.webm`<br>`gen/{name}.syncpoints.json`<br>console: 双向校验诊断 | `syncpoint()`, `recordOne()`, `startRecording()`, `makeMovie()` |
| ③ 字幕+音频 | `burn.mjs` / 手动 | `gen/{name}.subtitle`<br>`gen/{name}.mp3` | `generateSubtitle()` 移除溢出校验 |
| ④ burn | `burnVideo` | `gen/{name}_burn_{h\|v}.mp4` | 无改动 |

---

## 1. TTS 预生成阶段

### 新增文件 `movies/pregen-tts.mjs`

从 `generate-subtitle.mjs` 的 `generateSubtitle()` 中提取 TTS 生成逻辑，剥离视频相关校验。

```
pregenTts(scriptPath) → { groups, ttsTotal }
  ├─ 读取 subtitle 文本，按 --N-- 拆分组
  ├─ 逐行 TTS → { segDir/seg_N.mp3, 实测 duration }
  ├─ 计算每组合计时长 (含 INITIAL_GAP / INTER_LINE_GAP)
  ├─ 写入 tts-cache.json (与 generateSubtitle 共享，避免重复生成)
  └─ 写入 {genDir}/{scriptName}.tts-timing.json
```

### `.tts-timing.json` 格式

```json
{
  "version": 1,
  "ttsTotal": 22.36,
  "groups": [
    { "index": 0, "lineCount": 2, "totalDuration": 4.85 },
    { "index": 1, "lineCount": 1, "totalDuration": 3.12 },
    { "index": 2, "lineCount": 2, "totalDuration": 5.40 },
    { "index": 3, "lineCount": 1, "totalDuration": 2.78 },
    { "index": 4, "lineCount": 3, "totalDuration": 6.21 }
  ],
  "segments": [
    { "index": 0, "duration": 2.35, "group": 0 },
    { "index": 1, "duration": 2.50, "group": 0 },
    { "index": 2, "duration": 3.12, "group": 1 },
    ...
  ]
}
```

- `groups[g].totalDuration` = `INITIAL_GAP (仅 g=0) + Σ(seg.duration) + (lineCount-1) × INTER_LINE_GAP`
- 不含 silent gap 的音频 concat 的细节（那是 generateSubtitle 的工作）
- `ttsTotal` = `INITIAL_GAP + Σ(all seg.duration) + (totalLines-1) × INTER_LINE_GAP`

### 调用时机

**`makeMovie()` 中，在录制循环之前自动调用：**

```
makeMovie():
  ├─ 检查 {genDir}/{scriptName}.tts-timing.json 是否存在
  ├─ 若不存在 (或 --force) → spawn 'node movies/pregen-tts.mjs <scriptPath>'
  ├─ 读取 .tts-timing.json 到内存
  └─ → 进入录制循环 (已拿到 TTS 分组时长)
```

用户也可手动预生成：
```bash
node movies/pregen-tts.mjs movies/p2/m2.mjs
```

### TTS 缓存复用

`pregen-tts.mjs` 写入的 `tts-cache.json` 路径与 `generate-subtitle.mjs` 完全一致（`{scriptName}_segments/tts-cache.json`）。后续 `generateSubtitle()` 执行时直接从缓存读取 TTS 片段，无需重新生成。

---

## 2. 录制阶段：TTS 感知的 syncpoint

### 原理

录制时，在脚本的 `syncpoint(page)` 调用点，需要保证：

```
对于 group N (N >= 0)：
  elapsed_since_group_start ≥ groups[N].totalDuration
```

其中：
- `group 0` 的起点 = `tModelBrowser`（模型就绪时刻，即视频 0 帧）
- `group N (N > 0)` 的起点 = `syncpoints[N-1]`（上一个 syncpoint 时刻）

若 `elapsed < totalDuration` → 等待差值，使实耗时间达到 TTS 时长。
若 `elapsed ≥ totalDuration` → 不等待，直接记录 syncpoint（当前行为）。

### 实现方式

**方式 A（推荐）：page context 注入 + 修改 `syncpoint()`**

在 `recordOne()` 中，pageFn 执行前将 TTS timing 和 group 计数器注入到浏览器 page 上下文：

```javascript
// recordOne() 中，pageFn 前注入
await page.evaluate((ttsTiming) => {
  window.__ttsTiming = ttsTiming
  window.__ttsGroupIndex = 0  // 当前已完成的 group 索引
}, ttsTiming)
```

`syncpoint(page)` 函数改造为：

```javascript
export async function syncpoint(page) {
  await page.evaluate(() => {
    if (!window.__movieSyncPoints) window.__movieSyncPoints = []
    const timing = window.__ttsTiming
    if (timing) {
      // 获取上一个 syncpoint 的时间（group 0 的起点是 tModelBrowser）
      const sps = window.__movieSyncPoints
      const lastSP = sps.length > 0 ? sps[sps.length - 1] : window.__tModelBrowser
      const groupIdx = window.__ttsGroupIndex
      const group = timing.groups[groupIdx]
      if (group) {
        const elapsed = performance.now() - lastSP
        const required = group.totalDuration * 1000
        if (elapsed < required) {
          // 同步等待剩余时间
          const waitMs = required - elapsed
          const start = performance.now()
          while (performance.now() - start < waitMs) {
            // busy-spin 或使用 setTimeout
          }
        }
      }
      window.__ttsGroupIndex++
    }
    window.__movieSyncPoints.push(performance.now())
  })
}
```

但浏览器端不能 busy-spin。需要异步实现：

实际实现应为 `page.evaluate` 返回 Promise，内部用 `setTimeout`：

```javascript
export async function syncpoint(page) {
  await page.evaluate(async () => {
    if (!window.__movieSyncPoints) window.__movieSyncPoints = []
    const timing = window.__ttsTiming
    if (timing) {
      const sps = window.__movieSyncPoints
      const startRef = sps.length > 0 ? sps[sps.length - 1] : window.__tModelBrowser
      const groupIdx = window.__ttsGroupIndex
      const group = timing.groups[groupIdx]
      if (group) {
        const elapsed = performance.now() - startRef
        const required = group.totalDuration * 1000
        if (elapsed < required) {
          await new Promise(r => setTimeout(r, required - elapsed))
        }
        // ── 双向校验：录屏用时 vs TTS 时长，差异 > 1s 时警告 ──
        // 等待后重新测量 elapsed
        const finalElapsed = performance.now() - startRef
        const diff = (finalElapsed - required) / 1000
        if (Math.abs(diff) > 1.0) {
          const which = diff > 0 ? 'video longer' : 'audio longer'
          console.log(
            `  [syncpoint group ${groupIdx}] ${which} by ${Math.abs(diff).toFixed(2)}s ` +
            `(video=${(finalElapsed/1000).toFixed(2)}s, tts=${(required/1000).toFixed(2)}s)`
          )
        }
      }
      window.__ttsGroupIndex++
    }
    window.__movieSyncPoints.push(performance.now())
  })
}
```

校验时机在等待完成后：若 `elapsed < required` 已等待补齐，`finalElapsed` ≈ `required`；若未等待（动画本身已超 TTS 时长），`finalElapsed` 就是动画实际用时。`|diff| > 1s` 时打印警告。

**1s 阈值说明**：
- 人眼/耳对 < 1s 的偏移不敏感，忽略避免噪音
- 差值 > 1s 值得关注：若 video 长太多说明动画效率低，若 audio 长太多说明 syncpoint 等待异常

**方式 B（备份）：新增 `syncpointTts(page, groupIndex)` 函数**

保留原有 `syncpoint()` 不动，新增一个带 TTS 感知的版本。脚本作者选择使用哪个：

```javascript
// 脚本中
await lib.syncpointTts(page, 0)  // TTS 感知
```

但这样需要修改已有脚本。方式 A 不需要修改脚本（`syncpoint(page)` 调用不变）。

**选用方式 A**。

### 关于 `syncpoint` 修改的兼容性

- 没有 `.tts-timing.json` 时：`window.__ttsTiming = undefined`，逻辑退化为当前行为（仅记录 timestamp）
- 脚本无 `--N--` 标记（group 0 only）：不调用 `syncpoint`，无影响
- 脚本有 `--N--` 但未预生成 TTS：`makeMovie` 会在录制前自动调用 `pregen-tts`，不会出现缺失

### 2.5 隐式 syncpoint：视频结束

每组 `--N--` 都有对应的 `lib.syncpoint(page)` 调用，**但最后一组没有**。最后一组的边界是视频结束时刻（`pageFn` 完成后测量的 `pageFnDuration`）。对于无 `--N--` 标记的脚本（整个脚本只有 group 0），视频结束是唯一的边界。

这意味着必须在 `pageFn` 完成后、`context.close()` 之前，检查最后一组 + 总 TTS 时长是否满足：

```
lastGroupEnd = lastSyncpointTime + lastGroup.totalDuration
videoDuration = pageFnDuration

若 videoDuration < lastGroupEnd → 用 page.waitForTimeout 延长视频
若 videoDuration ≥ lastGroupEnd → 不操作

（无 syncpoint 脚本的特殊情况：lastSyncpointTime = 0, lastGroup = groups[0]）
```

在 `recordOne()` 中实现：

```javascript
// recordOne() 中，pageFn 之后，context.close() 之前：
let pageFnDuration = Date.now() - tPageFn

if (ttsTiming) {
  const requiredEnd = ttsTiming.ttsTotal * 1000

  if (pageFnDuration < requiredEnd) {
    const waitMs = Math.round(requiredEnd - pageFnDuration)
    console.log(`  [syncpoint implicit] Extending video by ${(waitMs / 1000).toFixed(2)}s for TTS total alignment...`)
    await page.waitForTimeout(waitMs)
    pageFnDuration = Date.now() - tPageFn  // 重新测量
  }

  // 双向校验（总时长）
  const diff = (pageFnDuration - ttsTiming.ttsTotal * 1000) / 1000
  if (Math.abs(diff) > 1.0) {
    const which = diff > 0 ? 'video longer' : 'audio longer'
    console.log(`  [syncpoint total] ${which} by ${Math.abs(diff).toFixed(2)}s (video=${(pageFnDuration/1000).toFixed(2)}s, tts=${ttsTiming.ttsTotal.toFixed(2)}s)`)
  }
}
```

直接使用 `ttsTotal`（全量 TTS 时长）作为视频延展目标，覆盖所有场景：

| 场景 | 显式 syncpoint | 隐式 syncpoint（视频结束） |
|------|---------------|--------------------------|
| 有 `--N--` 标记 | 每个 `syncpoint()` 处理对应 group | 视频延展保证 `总时长 ≥ ttsTotal` |
| 无 `--N--` 标记（无 `syncpoint()` 调用） | 无 | 视频延展保证 `总时长 ≥ ttsTotal` |

### 注入时机

```javascript
// recordOne():
// 在 await pageFn(page, suffix, tPageOpen) 之前
if (ttsTiming) {
  await page.evaluate((t) => {
    window.__ttsTiming = t
    window.__ttsGroupIndex = 0
  }, ttsTiming)
}
await pageFn(page, suffix, tPageOpen)
```

也需要注入 `window.__tModelBrowser`：在 `startRecording()` 中已经获取了 `tModelBrowser`，可以注入到 page 中。

目前 `startRecording` 返回 `{ trimStart, tModelBrowser }`，但 `tModelBrowser` 只在主进程使用。需要在 page 中也存一份：

```javascript
// startRecording() 中，获取 tModelBrowser 后立即注入
await page.evaluate((t) => { window.__tModelBrowser = t }, tModelBrowser)
```

---

## 3. 字幕生成阶段：`generateSubtitle()` — 移除溢出校验

当前 `generate-subtitle.mjs` 的溢出校验（全局 `audioTotal > videoDuration` + 分组 `lastE > bound`）在新模型下不再需要——syncpoint 在录制时已保证每组 TTS 时长被满足。

**全部移除**。两步校验都删掉，不再阻塞生成流程。

若用户仍需要诊断信息，可以在录制后查看 syncpoint 的 console 输出（见 §2 `syncpoint()` 中的双向校验）。

### 缓存复用

`pregen-tts.mjs` 写入的 TTS 缓存（`{scriptName}_segments/tts-cache.json`）路径与 `generateSubtitle()` 完全一致。步骤 ① 和 ③ 的 TTS 生成不会重复。

---

## 4. 边界情况与约束

### 4.1 无 `--N--` 标记的脚本

`p1/m1.mjs`、`p2/m1.mjs` 等脚本没有 `--N--` 标记，即只有一个 group 0。此类脚本**不调用 `syncpoint(page)`**，但隐式 syncpoint（视频结束延展，§2.5）保证 `videoDuration ≥ groups[0].totalDuration`。无需增加 `--N--` 标记。

对于无标记脚本，TTS 全部在视频 0 帧开始播放（留 0.5s INITIAL_GAP），视频结束时 TTS 恰好播完（或留有富余）。

### 4.2 group 0 的特殊性

Group 0 的起点是 `tModelBrowser`，其中包含了 entry animation 时长。若 entry animation 时长 ≥ group 0 的 TTS 时长，无需等待。

但 group 0 的终点（`cursor` 的终值）在校验中与 `syncpoints[0]` 比。若模型足够复杂、entry animation 足够长（用户通过 `entryDuration` 参数控制），group 0 通常不会溢出。

### 4.3 动画实际耗时 > TTS 时长

这是常见场景。例如 TTS 仅 3s 但 GSAP 动画 + waitForTimeout 总计 7s：

- syncpoint 被调用时 `elapsed = 7s`，`required = 3s + gap`
- `elapsed ≥ required` → 不等待，syncpoint 记录在 7s 位置
- 字幕生成时，group N 的条目起始于 `syncpoints[N-1] = 7s`，条目在 `7 + 3.15 = 10.15s` 结束
- 下一个 syncpoint（N）在 7s 之后的某个时间（假设为 14s），`14s > 10.15s` → 无溢出

此场景完全兼容当前行为。

### 4.4 横竖屏一致性

横竖屏使用同一套 TTS 时长（同一段文案、同一个 TTS）。横竖屏动画时长可能不同（通过 `'横值;竖值'` 语法），但 syncpoint 的等待逻辑基于动画的真实结束时间：

> 若动画快于 TTS → 等待到 TTS 结束，横竖屏同步
> 若动画慢于 TTS → 不等待，横竖屏不同步（但每个方向的 syncpoint 各自记录，`syncpoints.json` 取自第一个方向）

`syncpoints.json` 当前只保存第一个方向的 syncpoint，且字幕以此为准。横竖屏使用同一字幕，存在 0.1-0.5s 的偏差，但在可接受范围内（人眼感觉不到 0.3s 以内的字幕偏移）。

### 4.5 `--force` 重生成

```bash
node movies/p2/m2.mjs -f      # force re-record
```

`--force` 应同时：
1. 重新生成 `.tts-timing.json`（重新生成 TTS）
2. 删除旧 `.webm`，重新录制

### 4.6 录制脚本中的 `await` 与 syncpoint 组合

在 `p2/m2.mjs` 中，syncpoint 后紧跟着 `await` 动画。TTS 感知 syncpoint 只保证上一组的 TTS 时长被满足，不干预后续动画。因此：

```
syncpoint(page)  // 可能等待 → 确保 group N 的 TTS 已播完
await rotateModel(page, 360, 5000)  // 动画 5s
syncpoint(page)  // 可能等待 → 确保 group N+1 的 TTS 已播完 →
                 // 但由于 rotate 已经过了 5s，可能无需等待
```

逻辑正确。

---

## 5. 改动文件清单

| 文件 | 改动 | 说明 |
|------|------|------|
| `movies/pregen-tts.mjs` | **新增** | TTS 预生成 CLI + 导出函数 |
| `movies/lib.mjs` | 修改 | `syncpoint()` 增加 TTS 感知等待 + 双向校验<br>`recordOne()` 注入 TTS timing + 隐式 syncpoint 延展<br>`startRecording()` 注入 `__tModelBrowser`<br>`makeMovie()` 自动调用 pregen-tts 并传递 timing |
| `movies/generate-subtitle.mjs` | 修改 | 移除溢出校验（全局 + 分组），由 `syncpoint()` 的 console 诊断替代 |
| `movies/SKILL.md` | 修改 | 更新流水线图示、新增节点说明 |

### `generate-subtitle.mjs` 改动

删除两处校验：
- 全局校验（`audioTotal > videoDuration` → error）：整段 `if (!isImageScript) { if (audioTotal > videoDuration) { ... } }` 移除
- 分组校验（`lastE > bound` → error）：整段 `if (markerCount > 0) { for (let g... ) { ... } }` 移除

### `lib.mjs` 具体改动点

**`startRecording()`** — 增加 `__tModelBrowser` 注入：
```javascript
export async function startRecording(page, tPageOpen, entryDuration) {
  // ... 现有逻辑 ...
  const tModelBrowser = await page.evaluate(() => performance.now())
  // 新增：注入到 page，供 syncpoint 读取
  await page.evaluate((t) => { window.__tModelBrowser = t }, tModelBrowser)
  // ...
}
```

**`recordOne()`** — 增加 TTS timing 注入 + 隐式 syncpoint（视频结束延展）：

```javascript
// 在 pageFn 前注入 timing
if (ttsTiming) {
  await page.evaluate((timing) => {
    window.__ttsTiming = timing
    window.__ttsGroupIndex = 0
  }, ttsTiming)
}

await pageFn(page, suffix, tPageOpen)

// 收集 syncpoint
const rawSPs = await page.evaluate(() => {
  const sps = window.__movieSyncPoints
  window.__movieSyncPoints = []
  return sps || []
})
const syncpoints = rawSPs.map(t => (t - tModelBrowser) / 1000)

let pageFnDuration = Date.now() - tPageFn

// ── 隐式 syncpoint：总时长延展 ──
// 直接使用 ttsTotal 作为目标，无需拆分组。覆盖无 syncpoint 调用的情况。
if (ttsTiming) {
  const requiredEnd = ttsTiming.ttsTotal * 1000

  if (pageFnDuration < requiredEnd) {
    const waitMs = Math.round(requiredEnd - pageFnDuration)
    console.log(`  [syncpoint implicit] Extending by ${(waitMs / 1000).toFixed(2)}s for TTS total alignment...`)
    await page.waitForTimeout(waitMs)
    pageFnDuration = Date.now() - tPageFn
  }

  // 总时长双向校验
  const diff = (pageFnDuration - ttsTiming.ttsTotal * 1000) / 1000
  if (Math.abs(diff) > 1.0) {
    const which = diff > 0 ? 'video longer' : 'audio longer'
    console.log(`  [syncpoint total] ${which} by ${Math.abs(diff).toFixed(2)}s (video=${(pageFnDuration/1000).toFixed(2)}s, tts=${ttsTiming.ttsTotal.toFixed(2)}s)`)
  }
}

// 后续：context.close()、FFmpeg trim
```

**`syncpoint()`** — TTS 感知等待 + 双向校验（方式 A 实现）：
```javascript
export async function syncpoint(page) {
  await page.evaluate(async () => {
    if (!window.__movieSyncPoints) window.__movieSyncPoints = []
    const timing = window.__ttsTiming
    if (timing) {
      const sps = window.__movieSyncPoints
      const startRef = sps.length > 0 ? sps[sps.length - 1] : window.__tModelBrowser
      const groupIdx = window.__ttsGroupIndex
      const group = timing.groups[groupIdx]
      if (group) {
        const elapsed = performance.now() - startRef
        const required = group.totalDuration * 1000
        if (elapsed < required) {
          await new Promise(r => setTimeout(r, required - elapsed))
        }
        const finalElapsed = performance.now() - startRef
        const diff = (finalElapsed - required) / 1000
        if (Math.abs(diff) > 1.0) {
          const which = diff > 0 ? 'video longer' : 'audio longer'
          console.log(
            `  [syncpoint group ${groupIdx}] ${which} by ${Math.abs(diff).toFixed(2)}s ` +
            `(video=${(finalElapsed/1000).toFixed(2)}s, tts=${(required/1000).toFixed(2)}s)`
          )
        }
      }
      window.__ttsGroupIndex++
    }
    window.__movieSyncPoints.push(performance.now())
  })
}
```

**`makeMovie()`** — 自动调用 pregen-tts：
```javascript
// 在录制循环前：
if (process.argv.slice(2).includes('-f') || process.argv.slice(2).includes('--force')) {
  // force 时删除旧的 .tts-timing.json
}
const ttsTimingPath = join(outDir, `${scriptName}.tts-timing.json`)
if (!existsSync(ttsTimingPath)) {
  console.log('Pre-generating TTS timing...')
  const r = spawnSync('node', [
    join(moviesDir, 'pregen-tts.mjs'),
    fileURLToPath(scriptUrl),
    ...(process.argv.slice(2).filter(a => a === '--tts' || a.startsWith('--tts=')))
  ], { stdio: 'inherit', timeout: 600000 })
  if (r.status !== 0) process.exit(r.status ?? 1)
}
const ttsTiming = JSON.parse(readFileSync(ttsTimingPath, 'utf-8'))
```

然后将 `ttsTiming` 传递给 `recordOne`。

---

## 6. 兼容性与迁移

### 已有项目无需修改

- 已有 `*.mjs` 录制脚本无需修改，`syncpoint(page)` 调用签名不变
- 已有 `gen/` 目录的旧项目仍然可以走原有流程（不存在 `.tts-timing.json`，`makeMovie` 自动补生成）
- 已有 `.subtitle` 或 `.mp3` 直接通过，不受影响

### burn.mjs 无改动

`burn.mjs` 的步骤 1（录制）内部自动调用 `makeMovie`，步骤 2（字幕）调用 `generate-subtitle.mjs`。两者都已兼容新逻辑。步骤 3（burn）无变化。

---

## 7. 时序图

```
makeMovie() 开始
  │
  ├─ [新增] 检查 .tts-timing.json
  │     └─ 不存在 → pregen-tts.mjs → TTS 生成 → .tts-timing.json
  │
  ├─ recordOne (横屏)
  │     ├─ startRecording → 注入 __tModelBrowser
  │     ├─ [新增] 注入 __ttsTiming + __ttsGroupIndex
  │     ├─ pageFn 执行:
  │     │     ├─ 动画... waitForTimeout...
  │     │     ├─ syncpoint(page)
  │     │     │     ├─ [新增] 检查上一组 TTS 是否播完, 否则等待
  │     │     │     └─ [新增] 双向校验 |video-tts| > 1s → console
  │     │     ├─ 动画... rotateModel...
  │     │     ├─ syncpoint(page)
  │     │     │     └─ [新增] 同上
  │     │     └─ ...
  │     ├─ 收集 syncpoints → syncpoints.json
  │     ├─ [新增] 隐式 syncpoint: 检查总 TTS 时长是否撑满, 否则延展视频
  │     └─ context.close() → FFmpeg trim
```

---

## 8. 风险与注意事项

1. **TTS 预生成耗时**：长文案（10+ 句）的 TTS 生成可能在录制前增加 1-2 分钟。这是必然成本，因为必须在录制前知道时长。用户也可手动在录制前先跑 `pregen-tts.mjs`。

2. **`page.evaluate(async () => { await ... })` 的支持**：Playwright 支持 evaluate 内使用 async/await，因为 evaluate 返回 Promise 时 Playwright 会等待。已验证可用。

3. **`window.__tModelBrowser` 与 `syncpoints.json` 的单位**：
   - `__tModelBrowser` = `performance.now()` 的毫秒值
   - `syncpoints.json` = 秒（相对于 `tModelBrowser`）
   - syncpoint 内部计算用毫秒（`performance.now() - startRef`），比较时统一单位

4. **`syncpoint()` 中的 `elapsed` 计算**：第一个 syncpoint 的 `startRef` 为 `__tModelBrowser`，后续 syncpoint 的 `startRef` 为上一个 syncpoint 的 timestamp。上一个 syncpoint 已经在 `__movieSyncPoints` 中，包含了可能发生的 TTS 等待时间。逻辑自洽。

5. **`waitForTimeout` 延展的视频内容是静止帧**：隐式 syncpoint 在 pageFn 完成之后触发，此时 3D 场景已无动画，延展部分记录的是静态画面。这是预期行为——最后一段字幕通常只有少量配音，静态画面足够。

6. **prepare-dist 不涉及**：此改动纯属 `movies/` 工具链，不影响 `src/renderer/` 应用代码，不参与 build 或 CI 测试。

# 剩余移植设计: ViewportContainer.tsx + main.tsx 补齐

上次移植 (`ca92318`) 覆盖了 17 个文件。剩余改动集中在一个文件：`ViewportContainer.tsx`（~470 行），以及 `main.tsx` 中少量 IPC handler 补充。

---

## 一、ViewportContainer.tsx

### 1.1 入场动画系统

**核心改动:** +280 行

```
新增:
  DEFAULT_ENTRY_DURATION_MS = 2000
  EntryAnimConfig 接口                       ← zoom/slide 配置类型
  parseFloatParam()                          ← URL hash 参数解析
  entryParam()                               ← pending > hash > default 优先级
  resolveEntryConfig(movieMode)              ← 合并三层配置源
  computeEntryStartPos()                     ← zoom: 远距离起点; slide: 侧向偏移起点
  playEntryAnimation(overrides?)             ← GSAP 驱动的 zoom/slide 动画

修改:
  animateCamera()                            ← 新增 durationMs 参数
```

**配置来源优先级（高→低）:**

1. `__pendingEntryConfig`（per-command，一次性消费）
2. URL hash 参数（Web 独有，Electron 可跳过）
3. 默认值 `{ type: movieMode ? 'zoom' : 'auto', duration: 2000, ... }`

**触发时机:** 模型加载完成 → `handleModelLoaded` → camera fit → `playEntryAnimation()`

**支持的动画类型:** `zoom`（远处推入）、`slide`（侧向滑入）、`fade`（模型透明度淡入，依赖已移植的 `EnvironmentManager.fadeEnvironment`）

**`__triggerEntryAnimation` 窗口函数:** 手动触发入场动画，覆盖当前配置。

### 1.2 多模型并排布局

**改动:** ~60 行

多个文件同时加载时，用 `computePlateLayout()` 计算每个模型的 group 位置，水平排列。

```
loadedFiles 变化
  → computePlateLayout(entries)              ← 已存在于 @/engine/heatbed
  → useEffect: 应用 group.position
```

### 1.3 其他

| 改动 | 说明 |
|------|------|
| `animateCamera` 签名新增 `durationMs` | 入场动画需要自定义时长 |
| `pendingBoxRef` 移除 | 死代码清理 |
| `__modelGroupMap` 更新逻辑 | 多文件场景下 group 注册/注销 |
| `handleModelLoaded` 增加 fit + 入场动画调用 | 加载完成后触发 |

---

## 二、main.tsx 剩余项

### 2.1 queryParts 命令

`setPartMaterial` / `applyPreset` 支持 `query` 参数，通过 `queryParts()` 按材质属性批量筛选零件。需要在 Electron IPC handler 中适配——`queryParts` 依赖 Zustand store，只能在 renderer 进程执行。

### 2.2 loadModel 入场动画参数

`loadModel` IPC handler 中解析 `entryAnim`、`entryDir`、`entryDuration` 等参数，通过 IPC 发送给 renderer 设置 `__pendingEntryConfig`。

### 2.3 loadModel STEP 100MB 检查

`loadModel` IPC handler 中增加 `MAX_STEP_FILE_SIZE` 检查。

---

## 三、shadow-fit-diag 测试失败

`cameraFit.ts` 的 45° 固定方向改动导致该测试的阴影像素从正常值降到 4 个。需确认新的相机位置对阴影可视性的影响后再决定修复方案。

---

## 四、实施顺序

| 步骤 | 内容 | 预计改动 |
|------|------|---------|
| 1 | `animateCamera` 签名 + `durationMs` | ~5 行 |
| 2 | 入场动画系统（resolveEntryConfig + computeEntryStartPos + playEntryAnimation，含 zoom/slide/fade 三种 type） | ~280 行 |
| 3 | `handleModelLoaded` 接入入场动画 | ~15 行 |
| 4 | `__triggerEntryAnimation` 窗口函数 | ~30 行 |
| 5 | 多模型并排布局 | ~60 行 |
| 6 | `pendingBoxRef` 移除 + 其他清理 | ~20 行 |
| 7 | main.tsx: queryParts / 入场参数 / STEP 100MB（IPC handler） | ~50 行 |
| 8 | shadow-fit-diag 测试修复 | 1 处 |

# STEP 优化实施问题分析

## 1. CI 反复失败的根因

### 1.1 现象

`clicks STEP file in file list panel` 测试报：
```
Unexpected errors detected: Error: No free worker for pre-cache
```

### 1.2 失败链

```
测试点击 STEP 文件 → useFileUpload 加载 → 1s 后 preCache 扫描同目录所有 STEP
→ convertProcessedInWorker(key, data, params, 'precache')
  → acquire('precache') → 槽满 → reject(new Error('No free worker for pre-cache'))
```

`reject()` 在 Promise 构造函数内**同步执行**。此时 `await` 的 catch handler 尚未注册——它在下个 microtask 才注册。在这个间隙里 Promise 处于 "无 handler" 状态。

Chromium 的 `unhandledrejection` 检测到此状态，输出到浏览器控制台。Playwright 通过 `page.on('pageerror')` 捕获，测试失败。

### 1.3 为什么 try/catch 没挡住

`await convertProcessedInWorker(...)` 在 preCache.ts 中确实被 `try/catch` 包裹。但 `reject()` 同步执行时 catch handler 还没注册——这是 microtask 时序问题，不是代码逻辑问题。

### 1.4 为什么删 main.tsx 全局监听器没用

曾删除 `unhandledrejection` 和 `error` 监听器，无效。因为 Playwright 的 `pageerror` 不是从 `window.__errors` 读的——它直接监听浏览器底层事件，不依赖页面内 JS 注册的 handler。

### 1.5 为什么 setTimeout(reject) 没用

`setTimeout(() => reject(...), 0)` 推迟到下一个 macrotask。但 `await` 的 catch 在 microtask 中注册。microtask 先于 macrotask 执行，时序正确。理论上应该能阻止 `unhandledrejection`，但实测无效。原因: Chromium 的 `unhandledrejection` 检测机制不仅看 handler 是否注册，还检查 Promise 的 rejection 是否"已被处理"标志。`setTimeout` 中 reject 创建的 Promise 在当前 tick 没有 handler（setTimeout 回调里创建的 reject 本身就是在一个无 handler 的上下文中），仍触发事件。

### 1.6 修复

两步：先消除 Error，再实现自动重试。

**第一步：消除 Error**

`convertProcessedInWorker` 的 precache 路径：`reject(Error)` → `resolve(null)`。不再产生 Error 对象，不再触发任何全局异常事件。

**第二步：槽满时放回队尾自动重试（当前缺失）**

`resolve(null)` 让调用方知道"这次没处理"。但调用方必须把文件放回队列末尾，等其他文件处理完自动轮到它。

**preCache.ts 改造**：

```
for 遍历 stepFiles:
    processed = await convertProcessedInWorker(...)
    if (processed == null):
        retryLater.push(file)       // 不是跳过，是暂存
        continue

遍历结束后如果 retryLater 非空:
    清空 stepFiles，填入 retryLater
    递归调用 startPreCache(stepFiles)  // 自动重试
```

**thumbnailQueue.ts 改造**：

这是用户可见的缩略图处理队列。当前代码：

```
convertProcessedInWorker(...).then((processed) => {
  if (!processed) return     // ← 静默丢弃！没有重试
  // 生成缩略图...
})
```

改为：

```
convertProcessedInWorker(...).then((processed) => {
  if (!processed) {
    queue.push(file)          // 放回队尾，其他文件先处理
    return                    // 不阻塞队列，scheduleNext 继续
  }
  // 生成缩略图...
})
```

`queue.push(file)` 后，其他文件依次处理完，自然轮到这个文件重试。现有的 `MAX_RETRIES` 和 `retryCount` 机制仍然生效，防止无限重试。

**preCache.ts 不需要改造**。preCache 是后台预缓存，不是用户可见队列。它的 for 循环天然就是顺序处理，当前文件槽满就跳过继续下一个。下一个文件处理完槽释放，下轮 preCache 触发时（新文件打开 1s 后）会再次扫描，未处理的文件自然重试。

---

## 2. canvas 看不到模型的根因

### 2.1 现象

模型加载后闪现，随后缩小消失。

### 2.2 诊断数据

```
camPos: [0, -303.3, 303.3]     // 相机在 429m 外
model bbox: 0.04m × 0.04m       // 模型只有 4cm 大
```

模型渲染了但不可见——相机距离 300m 看 4cm 物体，等效于看不见。

### 2.3 根因

STEP 快速路径中 `sourceUnit: 'millimeter'` 与实际几何数据矛盾。

几何数据已在 Worker 中从 mm 缩放为 m。但 store 中 `sourceUnit` 仍写 `'millimeter'`。热床系统据此计算床尺寸：`UNIT_TO_MM['millimeter'] = 1`，床宽 = 200mm，直接当 200m 用。200m × 200m 的热床被 fit 到相机视野，4cm 模型相对于热床而言不存在。

### 2.4 修复

所有 7 个入口的 STEP 快速路径 `sourceUnit: 'millimeter'` → `sourceUnit: 'meter'`。`UNIT_TO_MM['meter'] = 1000`，床宽 = 200 / 1000 = 0.2m，相机正确 fit 到 0.2m 热床和 0.04m 模型。

ModelGroup 快速路径中 `onSourceUnitChangeRef.current?.('millimeter')` → `'meter'`。

---

## 3. `onLoaded` 传错包围盒

### 3.1 问题

`ModelGroup.tsx` 快速路径中 `onLoaded(overallBox)`，`overallBox` 是居中前计算的。居中逻辑改变了 mesh 位置，但摄像头 fit 用的是旧包围盒。

### 3.2 修复

居中后在 `processed` 数组上重新计算 `finalBox`，传给 `onLoaded`。

---

## 4. 测试变更

### 4.1 必要的 E2E 测试变更

| 测试 | 变更 | 原因 |
|------|------|------|
| `step-loading.spec.ts` | `[stepToGlbCached]` → `[stepToMeshesCached]` | 日志前缀变了 |
| `step-loading.spec.ts` | topology/faceIds 断言改 false/null | STEP_T 不再嵌入 |
| `format-loading.spec.ts` | 同上 + Face/Edge 按钮不可见 | 同上 |
| `step-loading.spec.ts` | 相机动画等待（先 `===true` 再 `===false`） | 需要等动画结束再检查 |

### 4.2 未变更的测试

- 热床 `showHeatbed=true` 测试：`format: 'step'` + `syncActiveFileFields` → `modelFormat: 'step'` → `initShowHeatbed('step')` → `HEATBED_DEFAULT_FORMATS.has('step')`，链路正确无变化
- `utils.ts` 的 `createErrorGuard`：未修改
- 所有非 STEP 测试：无影响

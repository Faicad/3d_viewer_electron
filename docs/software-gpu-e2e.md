# 软件 GPU 模拟 E2E 测试 — 调试全过程

## 目标

在 E2E (Playwright) 测试中模拟无硬件 GPU 环境，验证 `isSoftwareGpu()` 能正确识别，且依赖 GPU 渲染的测试能正确 skip。

---

## 1. Chromium 软件渲染标志选型

### 尝试过的标志

| 标志 | 效果 | 结论 |
|------|------|------|
| `--disable-gpu` | WebGL context 完全创建失败，`__r3f_dev` 为 null | ❌ 太激进，WebGL 不可用 |
| `--use-gl=swiftshader` | 在当前 Electron 版本中 WebGL context 创建超时 | ❌ GL 后端不可用 |
| `--use-angle=swiftshader` | ANGLE + Vulkan SwiftShader，WebGL 正常工作 | ✅ 唯一可用 |

**最终选择**：`--use-angle=swiftshader`

---

## 2. GPU 检测位置：renderer 初始化 vs page.evaluate

### 方案 A：测试中通过 page.evaluate 检测（废弃）

最初 `isSoftwareGpu()` 在测试侧通过 `page.evaluate` 调 WebGL API：

```ts
// gpu-utils.ts（旧版）
const info = await page.evaluate(() => {
  const gl = window.__r3f_dev?.gl
  const ctx = gl.getContext()
  const ext = ctx.getExtension('WEBGL_debug_renderer_info')
  // ...
})
```

**问题**：SwiftShader 下 WebGL context 在两次 `page.evaluate` 调用之间会 lost。`getExtension('WEBGL_debug_renderer_info')` 调用可能挂起 62 秒。

实测耗时：
```
[timing] __r3f_dev.gl ready:   1,574ms
[timing] isSoftwareGpu:       62,823ms  ← page.evaluate 卡死
```

### 方案 B：renderer 初始化时检测（最终方案）

在 `ViewportContainer.tsx` 的 `onCreated` 回调中检测，此时 WebGL context 刚创建，状态稳定：

```ts
// ViewportContainer.tsx
onCreated={({ camera, scene, gl }) => {
  gl.shadowMap.enabled = true
  // ...
  window.__r3f_dev = { camera, scene, gl }

  // 在此处检测，WebGL context 还活着
  try {
    const ctx = gl.getContext()
    const ext = ctx?.getExtension('WEBGL_debug_renderer_info')
    const vendor = ext ? ctx.getParameter(ext.UNMASKED_VENDOR_WEBGL) : ''
    const renderer = ext ? ctx.getParameter(ext.UNMASKED_RENDERER_WEBGL) : ''
    const lower = `${vendor} ${renderer}`.toLowerCase()
    const swPatterns = ['llvmpipe', 'swiftshader', 'microsoft basic render', 'mesa offscreen']
    window.__isSoftwareGpu = swPatterns.some(p => lower.includes(p))
  } catch {
    window.__isSoftwareGpu = false
  }
}}
```

测试侧只需读预计算值：
```ts
// gpu-utils.ts（新版）
export async function isSoftwareGpu(page: Page): Promise<boolean> {
  return await page.evaluate(() => !!(window as any).__isSoftwareGpu)
}
```

**效果**：isSoftwareGpu 从 62,823ms 降到 1,500ms（40x 提升）。

---

## 3. electronApp.close() 卡死 58 秒

### 问题

软件 GPU 测试早期 skip 后调用 `app.close()` 正常关闭，但 Electron 的 SwiftShader GPU 进程 shutdown 极慢：

```
[timing] isSoftwareGpu:     1,528ms
[timing] app.close:        58,294ms  ← 卡在这里
```

### 尝试：app.process().kill()

```ts
app.process().kill()
```

**效果**：测试函数在 1.5s 返回，但 Playwright worker teardown 仍然超时 60 秒：

```
✓ shadow visibility diagnostic (3.1s)
Worker teardown timeout of 60000ms exceeded.  ← 还在等
```

**原因**：`child_process.kill()` 在 Windows 上只杀父进程，SwiftShader GPU 子进程变成孤儿，Playwright 框架一直等它们退出。

### 解决方案：taskkill /F /T

杀整个进程树：

```ts
// utils.ts
export function killElectronApp(app: { process(): { pid: number } }): void {
  const pid = app.process().pid
  if (process.platform === 'win32') {
    execSync(`taskkill /F /T /PID ${pid}`, { timeout: 5000, stdio: 'ignore' })
  } else {
    process.kill(-pid, 'SIGKILL')
  }
}
```

**效果**：teardown 从 60s 降到 2s。

---

## 4. page.evaluate 碰 WebGL 后 taskkill 再次卡死

### 问题

在 `software-gpu.spec.ts` 中，`isSoftwareGpu()` 之后又做了一次 `page.evaluate` 调 WebGL 来 dump vendor/renderer：

```ts
const detail = await page.evaluate(() => {
  const gl = window.__r3f_dev?.gl
  const ctx = gl?.getContext()             // ← 碰 WebGL
  const ext = ctx?.getExtension('WEBGL_debug_renderer_info')  // ← 碰 WebGL
  // ...
})
```

结果：
```
[gpu-check] __isSoftwareGpu set:  1,661ms
[gpu-check] kill:                67,124ms  ← 又卡了
```

**原因**：SwiftShader 下 `page.evaluate` 调 WebGL 会破坏 GPU 进程状态，导致 `taskkill` 挂起。

**解决**：测试中完全不碰 WebGL。`isSoftwareGpu()` 只读预计算的布尔值。vendor/renderer 诊断信息不需要在测试中获取。

---

## 5. 环境变量泄漏

### 问题

`shadow-diag.spec.ts` 使用 `getElectronLaunchArgs()`，该函数读取 `E2E_NO_GPU` 环境变量来决定是否加 `--use-angle=swiftshader`。

PowerShell 中 `$env:E2E_NO_GPU = "1"` 是会话级变量，设一次后持久存在。之前测试设了该变量，之后跑 `.\scripts\ci.ps1` 时变量还在，导致所有使用 `getElectronLaunchArgs()` 的测试都被强制走软件 GPU。

### 正确用法

```powershell
# 查看是否设了
$env:E2E_NO_GPU

# 删掉
Remove-Item Env:\E2E_NO_GPU

# 只在需要时临时设（一行，用完不残留）
$env:E2E_NO_GPU = "1"; npx playwright test src/test/shadow-diag.spec.ts; Remove-Item Env:\E2E_NO_GPU

```

---

## 6. 最终架构

```
┌─ ViewportContainer.tsx (onCreated) ───────────────┐
│  gl.getExtension('WEBGL_debug_renderer_info')      │
│  → vendor/renderer 字符串                          │
│  → 模式匹配: llvmpipe | swiftshader | warp | mesa  │
│  → window.__isSoftwareGpu = true/false             │
└────────────────────────────────────────────────────┘
         │
         ▼ 预计算布尔值，不碰 WebGL
┌─ gpu-utils.ts ─────────────────────────────────────┐
│  isSoftwareGpu(page)                               │
│    → page.evaluate(() => window.__isSoftwareGpu)   │
│    → 纯读值，零 WebGL 调用                          │
└────────────────────────────────────────────────────┘
         │
         ▼ 各测试使用
┌─ shadow-diag.spec.ts ──────────────────────────────┐
│  canvas 挂载 → waitFor __r3f_dev → isSoftwareGpu   │
│  if true → SKIP + killElectronApp() (2s 完成)      │
│  if false → 正常跑完整阴影诊断                      │
└────────────────────────────────────────────────────┘
┌─ software-gpu.spec.ts ─────────────────────────────┐
│  Test 1: 无 SwiftShader → 断言 false (硬件)        │
│  Test 2: --use-angle=swiftshader → 断言 true (软件)│
│  各写死 args，不读环境变量                          │
└────────────────────────────────────────────────────┘
```

---

## 7. 关键耗时对比

| 阶段 | 修复前 | 修复后 | 方案 |
|------|--------|--------|------|
| isSoftwareGpu 检测 | 62,823ms | 1,500ms | renderer 初始化时做 |
| app.close() | 58,294ms | — | 改用 taskkill /F /T |
| Worker teardown | 60s 超时 | 2s | taskkill /F /T |
| page.evaluate 碰 WebGL 后 kill | 67,124ms | 2,178ms | 测试中不碰 WebGL |
| 硬件 GPU 完整测试 | 5.4s | 5.4s | 无变化 |
| 软件 GPU 早期 skip 测试 | 59s | 2.7s | 全部优化叠加 |

---

## 8. 修改的文件

| 文件 | 改动 |
|------|------|
| `src/renderer/components/viewport/ViewportContainer.tsx` | onCreated 中检测软件 GPU → `window.__isSoftwareGpu` |
| `src/renderer/types/window.d.ts` | 新增 `__isSoftwareGpu: boolean` 类型 |
| `src/test/gpu-utils.ts` | `isSoftwareGpu()` 改为读取预计算值 |
| `src/test/utils.ts` | 新增 `getElectronLaunchArgs()`、`killElectronApp()` |
| `src/test/shadow-diag.spec.ts` | 早期 GPU 检测 + `killElectronApp` + `getElectronLaunchArgs` |
| `src/test/software-gpu.spec.ts` | 新增：验证硬件/软件 GPU 两个分支 |
| `docs/software-gpu-e2e.md` | 本文档 |

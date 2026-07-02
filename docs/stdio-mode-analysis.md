# Stdio 管道模式支持分析

## 1. 需求场景

```bash
rg --files | rg '3mf$' | ./3d-viewer-binary --stdin
```

用户希望将命令行工具（`rg`、`fd`、`find` 等）输出的文件路径通过管道传入本程序，程序自动：

1. 读取所有 3D 文件路径（stdin line-by-line）
2. 在文件面板中创建一个"虚拟文件夹"，列出所有文件及其缩略图
3. 自动加载第一个文件到 3D 视口

## 2. 可行性判断

**结论：可行，改动量中等（~300-400 行，分布在 6-8 个文件）。**

### 有利条件

| 条件 | 说明 |
|------|------|
| 已有 CLI 参数处理 | `electron/main/index.ts:26-38` 已有 `extractFilePath()` 处理 `process.argv` |
| 已有文件加载管线 | `scene-file-loader.ts` 已有 `replaceSceneWithFile()` 可加载单个文件 |
| 已有缩略图系统 | `thumbnailQueue.ts` + `FileListPanel.tsx` 已支持任意文件列表的缩略图生成 |
| 文件面板不依赖真实目录 | `currentFolderPath` 可为 `null`，`folderFiles` 是独立数组 |
| 已有 xvfb/无头模式 | CI 和脚本中已广泛使用 `xvfb-run` + `--no-sandbox` + SwiftShader |
| Electron 的 `process.stdin` | Node.js 层可直接使用 `readline` 读取 stdin |

### 注意事项

| 事项 | 说明 |
|------|------|
| Electron 仍需要显示服务 | `--stdin` 模式也需要 X11/Wayland/xvfb（WebGL 渲染） |
| `process.stdin` 在打包后 | Electron 打包后（asar）stdin 仍可用，已验证 |
| 大数量文件 | 10000+ 文件会影响 UI 性能，需考虑虚拟化渲染（已有 IntersectionObserver）和分页读取 |
| 跨平台 | stdin 在 Win/Linux/macOS 均可用，但路径格式（`\` vs `/`）需考虑 |

## 3. 架构方案

### 3.1 整体流程

```
用户终端                        Electron 主进程                         Renderer
──────────                      ─────────────                   ─────────────────
rg --files | rg '3mf$' |
                      v
              3d-viewer --stdin
                      |
                  process.stdin
                  readline 逐行读取
                  验证扩展名
                  收集到数组
                      |
                  去重、过滤
                  排序（如有需要）
                      |
                  新 IPC: 'fs:setPipedFiles'
                      ──────────────────►  modelStore.setFolderFiles(
                  （可选）等待                    folderPath='stdin://piped',
                  did-finish-load                   files=[...]
                  + 500ms 确保                     )
                  renderer 就绪               自动加载第一个文件
                                             （调用 replaceSceneWithFile)
```

### 3.2 CLI 标志设计

| 标志 | 说明 |
|------|------|
| `--stdin` | 启用标准输入管道模式。读取所有行，合并到虚拟文件夹。通常无需显式指定，程序会自动检测 stdin 是否为管道；Windows 或需要强制指定时使用 |
| `--stdin-first` | 配合 `--stdin` 使用。仅加载第一个文件，不列出全部（快速打开模式） |
| `--stdin-delimiter '\0'` | 自定义分隔符（默认 `\n`，可用于 `find -print0`） |


示例：

```bash
# 基本用法：列出所有 3MF 文件并展示
rg --files | rg '3mf$' | 3d-viewer --stdin

# 搭配 find -print0
find . -name '*.3mf' -print0 | 3d-viewer --stdin --stdin-delimiter '\0'

# 仅打开第一个文件
fd '\.stp$' | 3d-viewer --stdin --stdin-first
```

### 3.3 主进程改动（`electron/main/index.ts`）

#### 自动检测 stdin

```typescript
// 判断是否需要进入 stdin 管道模式
function shouldUseStdin(): boolean {
  // 开发模式下 npm/electron-vite 可能接管 stdin，不自动触发
  if (import.meta.env.DEV) return process.argv.includes('--stdin')
  // 生产环境：stdin 非 TTY（管道/重定向）且无文件路径参数时自动进入
  if (!process.stdin.isTTY && !extractFilePath(process.argv)) return true
  return process.argv.includes('--stdin')
}
```

#### 核心函数

```typescript
// 新增函数
function readStdinLines(delimiter: string = '\n'): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const lines: string[] = []
    const rl = readline.createInterface({
      input: process.stdin,
      crlfDelay: Infinity,
    })
    rl.on('line', (line) => {
      const trimmed = line.trim()
      if (trimmed) lines.push(trimmed)
    })
    rl.on('close', () => resolve(lines))
    rl.on('error', reject)
  })
}

// 新增函数
function filterSupportedFiles(paths: string[]): string[] {
  const supported = new Set(ALL_EXTENSIONS)
  return paths.filter((p) => {
    const ext = extname(p).toLowerCase()
    return supported.has(ext)
  })
}

// 新增 IPC handler（在 fs: 系列下）
ipcMain.handle('fs:getPipedFiles', async () => {
  const files = pendingPipedFiles
  pendingPipedFiles = null
  return files
})

ipcMain.handle('fs:isStdinMode', () => pendingPipedFiles !== null || didUseStdin)

// app.whenReady() 中增加
const useStdin = shouldUseStdin()
if (useStdin) {
  didUseStdin = true
  readStdinLines().then((rawPaths) => {
    const validPaths = filterSupportedFiles(rawPaths)
    pendingPipedFiles = validPaths.map((p) => ({
      name: basename(p),
      path: p,
      mtimeMs: Date.now(),
    }))
  })
}
```

### 3.4 IPC 信道设计

| 信道 | 方向 | 说明 |
|------|------|------|
| `fs:getPipedFiles` | Renderer ← Main | 获取管道传入的文件列表，一次读取后清空 |
| `fs:isStdinMode` | Renderer ← Main | 返回 `boolean`，判断当前是否为 `--stdin` 模式 |

Preload 新增：

```typescript
getPipedFiles: () => ipcRenderer.invoke('fs:getPipedFiles'),
isStdinMode: () => ipcRenderer.invoke('fs:isStdinMode'),
```

### 3.5 Renderer 端改动

#### `WorkspacePage.tsx`（或 `App.tsx`）

在现有的 `getPendingFilePath` 逻辑旁，新增：

```typescript
// 处理 --stdin 管道模式
window.electronAPI.isStdinMode().then((isStdin) => {
  if (isStdin) {
    window.electronAPI.getPipedFiles().then((files) => {
      if (files && files.length > 0) {
        useModelStore.getState().setFolderFiles(null, files) // null = 虚拟目录
        // 自动加载第一个文件
        replaceSceneWithFile(files[0], 0)
      }
    })
  }
})
```

#### `FileListPanel.tsx`

- 当 `currentFolderPath === null` 时，面包屑区域显示 `📁 Piped Input`（或翻译字符串）
- 隐藏"打开文件夹"按钮（因为管道模式没有真实目录可切换）
- 全部功能（缩略图、排序、切换文件）正常运作

#### `model-store.ts`

- `setFolderFiles` 已接受 `null` 作为 folderPath，无需改动
- 可考虑增加 `isStdinMode` 状态给 UI 判断

### 3.6 虚拟目录 vs 真实目录对比

| 特性 | 真实目录 | 虚拟目录（stdin） |
|------|----------|-------------------|
| `currentFolderPath` | `/path/to/folder` | `null` |
| 面包屑 | 显示路径，可点击切换 | 显示 "Piped Input"，不可点击 |
| 文件来源 | `fs:readDirectory` IPC | `fs:getPipedFiles` IPC |
| 文件过滤 | 自动按扩展名 | 已在主进程过滤 |
| 拖拽支持 | 完整 | 限制（拖入的文件不在虚拟目录中，可提示用户） |
| 刷新 | 可刷新 | 不可刷新（可增加重新读取 stdin 的能力？暂不支持） |

### 3.7 缩略图工作流

管道模式下缩略图无需任何改动：

```
FileListPanel.tsx
  ├── folderFiles → QueueFile[] → startThumbnailQueue()
  ├── IntersectionObserver → updateVisibleFiles()
  └── handleThumbReady → blob URL → 显示
        ↓
  thumbnailQueue.ts: 按优先级逐文件渲染
        ↓
  thumbnailGenerator.ts: off-screen WebGL → PNG blob → IndexedDB 缓存
```

### 3.8 Electron-Builder 打包考虑

无需额外配置。打包后的 exe 已支持 stdin（`.exe | .exe` 管道在 Windows 上原生支持）。

Linux 用户需用：

```bash
# 需要虚拟显示服务
xvfb-run ./3d-viewer --stdin < filelist.txt

# 或
rg --files | rg '3mf$' | xvfb-run ./3d-viewer --stdin
```

可考虑在 CI/脚本中已经使用的模式：

```bash
xvfb-run --auto-servernum ./dist/linux-unpacked/3d-viewer --stdin
```

## 4. 实现计划

### 第一阶段：核心功能（~200 行）

| 文件 | 改动 |
|------|------|
| `electron/main/index.ts` | 新增 `readStdinLines()`、`filterSupportedFiles()`、`--stdin` 解析、`fs:getPipedFiles` / `fs:isStdinMode` IPC |
| `electron/preload/index.ts` | 新增 `getPipedFiles`、`isStdinMode` 桥接 |
| `src/renderer/types/electron.d.ts` | 新增类型声明 |
| `src/renderer/main.tsx` | 在 `loadFilePath` 逻辑旁处理 `getPipedFiles`，加载第一个文件 |

### 第二阶段：UI 适配（~100 行）

| 文件 | 改动 |
|------|------|
| `src/renderer/components/FileListPanel.tsx` | 处理 `currentFolderPath === null` 时显示 "Piped Input" 面包屑、隐藏文件夹切换按钮 |
| `src/renderer/stores/model-store.ts` | 可选：增加 `isStdinMode` 标志 |
| `src/renderer/i18n/*.json` | 新增翻译键 `fileList.stdinMode`、`fileList.stdinTitle` |

### 第三阶段：扩展功能（可选）

| 功能 | 说明 |
|------|------|
| `--stdin-delimiter` | 支持 `\0` 分隔（`find -print0`） |
| `--stdin-first` | 仅加载第一个文件，不进入浏览模式 |
| stdout 输出 | `--stdin --json` 输出文件列表的 JSON 摘要到 stdout |
| 虚拟目录名称 | 支持 `--stdin-label "搜索结果"` 自定义虚拟目录名称 |

## 5. 风险评估

| 风险 | 等级 | 缓解措施 |
|------|------|----------|
| 大文件列表（>10000）导致 UI 冻结 | 中 | 主进程一次性收集，分页传入 renderer；FileListPanel 已有 IntersectionObserver 虚拟化 |
| `process.stdin` 在 Windows 打包后行为异常 | 低 | 通过 E2E 测试验证：`echo test.stl | .\dist\win-unpacked\3D_Viewer.exe --stdin` |
| 用户混淆真实目录和虚拟目录 | 低 | UI 明确展示 "Piped Input / N files" 标签，并禁用"打开上级文件夹"按钮 |
| stdin 读取阻塞窗口创建 | 低 | 异步读取（`then`），窗口在 stdin 读取期间正常创建和渲染 |
| 文件路径含特殊字符（空格、中文） | 低 | `readline` 默认正确处理；需要验证 Windows 路径含空格 |

## 6. 测试策略

### 单元测试

```typescript
// electron/main/readStdin.test.ts
describe('filterSupportedFiles', () => {
  it('filters only supported 3D extensions')
  it('preserves paths with spaces and Unicode')
  it('handles empty input')
  it('handles mixed extensions')
})
```

### E2E 测试

```typescript
// src/test/stdin-mode.spec.ts
test('--stdin loads files and shows in panel', async () => {
  // 启动 app with --stdin
  // 通过 playwright 的 eval 模拟 stdin 输入
  // 验证文件面板显示文件
  // 验证第一个文件已加载
})

test('--stdin with empty input shows empty panel')
test('--stdin loads first file automatically')
```

## 7. 附录：关键代码路径参考

### 文件列表渲染（`FileListPanel.tsx`）

- `folderFiles.map()` 渲染缩略图卡片 → 每张卡片显示扩展名徽章 + 缩略图
- `IntersectionObserver` 控制缩略图生成优先级
- 点击事件 → `toggleFileInScene` / `replaceSceneWithFile`

### 文件加载（`scene-file-loader.ts`）

- `replaceSceneWithFile(file, index)` → 清空场景 → 读取 buffer → 检测格式 → 加载/转换 → 加入 store
- `toggleFileInScene(file, index)` → 切换加载状态

### 缩略图队列（`thumbnailQueue.ts`）

- `startThumbnailQueue(files, onReady, onProgress)` → 按优先级逐个生成
- 格式超时：普通 15s，STEP/CAD 60s
- 最多重试 3 次

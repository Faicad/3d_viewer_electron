# IFC 格式支持移植设计 —— 3d_viewer_web → 3d_viewer_electron

## 一、移植源

- **Commit**: `c4892ae` (`feat(ifc): add IFC file format support via web-ifc`)
- **实现方式**: 使用 `web-ifc` npm package（v0.0.77）直接解析 IFC，不经过 Three.js loader，直接在 `formatLoaders.ts` 中调用 `loadIfcAsMeshes()`

## 二、移植清单

### 2.1 需要从 Web 复制的文件

| 文件 | 目标路径 | 处理方式 |
|------|----------|----------|
| `src/renderer/lib/ifc-loader/loadIfc.ts` | `src/renderer/lib/ifc-loader/loadIfc.ts` | 直接复制 |
| `src/renderer/lib/ifc-loader/index.ts` | `src/renderer/lib/ifc-loader/index.ts` | 直接复制 |
| `src/renderer/lib/ifc-loader/loadIfc.test.ts` | `src/renderer/lib/ifc-loader/__tests__/loadIfc.test.ts` | 复制，放入 `__tests__/` 子目录 |
| `src/test/fixtures/haus.ifc` | `src/test/fixtures/haus.ifc` | 复制（2.5MB） |
| `test/e2e/ifc-loader.spec.ts` | → 不直接复制，按 Electron 模式重写 | 见第五节 |
| `src/renderer/public/wasm/web-ifc.wasm` | → 不复制 WASM 文件本身，改为 postinstall 脚本 | 见第三节 |
| `src/renderer/public/wasm/web-ifc-mt.wasm` | 同上 | 见第三节 |

### 2.2 需要修改的现有文件

| 文件 | 修改内容 |
|------|----------|
| `package.json` | 添加 `"web-ifc": "^0.0.77"` 到 `dependencies`；`postinstall` 加入 `node scripts/copy-ifc-wasm.mjs`；fileAssociations 加入 `.ifc` |
| `scripts/copy-ifc-wasm.mjs` | **新增**：从 `node_modules/web-ifc/web-ifc.wasm` 和 `web-ifc-mt.wasm` 复制到 `src/renderer/public/wasm/` |
| `src/renderer/config/file-formats.ts` | IFC 条目 `disabled: false`，注释改为 `// uses web-ifc (npm package)` |
| `src/renderer/config/file-formats.test.ts` | L115: 移除 `expect(detectFormat('model.ifc')).toBeNull()` |
| `src/renderer/engine/formatLoaders.ts` | 顶部加 `import { loadIfcAsMeshes } from '@/lib/ifc-loader'`；`case 'ifc'` 替换为 `return loadIfcAsMeshes(buffer)` |
| `src/renderer/engine/__tests__/format-loaders.test.ts` | IFC 从 `SKIP_FORMATS` 移到 `PLAYWRIGHT_ONLY`，注释改为 `// tested separately in ifc-loader/loadIfc.test.ts` |

### 2.3 Electron 独有适配

| 文件 | 修改内容 |
|------|----------|
| `src/renderer/lib/thumbnail-cache/thumbnailQueue.ts` | 添加 IFC 分支：读文件 → `generateThumbnail(buffer, 'ifc', filePath)`，超时 30s |
| `src/test/ifc-loading.spec.ts` | **新增 E2E 测试**（参见第五节） |

## 三、WASM 加载策略

### 3.1 web-ifc 的 WASM 加载机制

`web-ifc` 的 `IfcAPI.Init()` 接受一个 `pathCallback` 函数，该函数接收 WASM 文件名并返回完整 URL：

```typescript
await ifc.Init((path: string) => '/wasm/' + path)
```

- 内部使用 `fetch()` 下载 WASM（不是 `instantiateStreaming`）
- 所以 Electron 自定义协议 `faicad-viewer://` 的 `supportFetchAPI: true` 已足够

### 3.2 WASM 文件部署

遵循现有模式（`copy-draco-wasm.mjs`）：

1. **postinstall 脚本** `scripts/copy-ifc-wasm.mjs`：
   ```javascript
   // 从 node_modules/web-ifc/ 复制到 src/renderer/public/wasm/
   const srcDir = path.resolve(__dirname, '../node_modules/web-ifc')
   const destDir = path.resolve(__dirname, '../src/renderer/public/wasm')
   // 复制 web-ifc.wasm, web-ifc-mt.wasm
   ```

2. 构建时 `electron-vite` 自动将 `public/wasm/` 复制到 `out/renderer/wasm/`

3. 生产环境通过 `faicad-viewer://local/out/renderer/wasm/web-ifc.wasm` 访问

### 3.3 与 web 项目的关键差异

| 维度 | Web (Vite) | Electron |
|------|------------|----------|
| WASM来源 | 直接 commit 在 `public/wasm/` | 通过 postinstall 从 `node_modules/` 复制 |
| 请求路径 | `/wasm/web-ifc.wasm` | 同 `/wasm/web-ifc.wasm`（dev/prod 均可） |
| pathCallback | `(p) => '/wasm/' + p` | `(p) => '/wasm/' + p`（不变） |
| 是否需要 XHR 预加载 | 不需要 | 不需要（web-ifc 用 fetch，不是 instantiateStreaming） |

## 四、缩略图预览适配

### 4.1 第一期：全量生成，不判断大小

第一期不做大小判断，所有 IFC 文件在后台队列中统一走通用 WebGL 渲染路径。

加载文件时（`toggleFileInScene` / `useFileLoader` / `useFileUpload`），`generateThumbnailFromResult()` 已在通用路径中覆盖 IFC，**无需额外改动**。

后台队列（`thumbnailQueue.ts`）需要添加 IFC 分支：

```typescript
// Phase 2 dispatch — 增加 IFC 路由
if (format === 'ifc') {
  const result = await window.electronAPI.readFile(file.path)
  if (result.success && result.data) {
    const blob = await generateThumbnail(result.data, format, file.path)
    if (blob && onReady) {
      await putThumbnail(key, blob)
      const url = URL.createObjectURL(blob)
      onReady(file.path, url)
      return 'done'
    }
  }
  onReady?.(file.path, '')
  return 'done'
}
```

### 4.2 超时设置

IFC 加载在队列中的超时设为 **30s**（其它 3D 格式默认 15s）。

### 4.3 后续优化方向（本期不做）

- **大小判断**：IFC 大文件（>10MB）跳过后台缩略图生成，打开后由 `toggleFileInScene` 的场景渲染生成
- **数据流**：需要 `readDirectory.ts` 的 `FileEntry` 增加 `size` 字段，向下传递到 `QueueFile`、`PlaceholderCard`

## 五、测试移植

### 5.1 单元测试（直接复用）

文件 `src/renderer/lib/ifc-loader/loadIfc.test.ts` 直接复制。测试内容：
- 解析 `haus.ifc` → 验证 meshes、geometry、material
- 不同颜色产生不同材质
- 三角形总数 > 1000

**注意**：该测试使用 `@vitest-environment jsdom`，与 Electron 的 `vitest.jsdom.config.ts` 兼容。但 Electron 的 Vitest 配置（`vitest.config.ts`）是 Node 环境，而此测试需要 jsdom。所以要确保该测试被 `vitest.jsdom.config.ts` 覆盖。

检查 `vitest.jsdom.config.ts` 的 `include`:
```typescript
include: ['src/**/__tests__/*.test.{ts,tsx}']
```

`loadIfc.test.ts` 路径是 `src/renderer/lib/ifc-loader/loadIfc.test.ts`，不在 `__tests__/` 下。所以需要**修改 `vitest.jsdom.config.ts` 的 include 模式**，或者把测试移到 `ifc-loader/__tests__/` 目录。

**方案**：将 `loadIfc.test.ts` 放在 `src/renderer/lib/ifc-loader/__tests__/loadIfc.test.ts`（与 `scad-converter` 保持一致）。

### 5.2 格式加载器测试

`format-loaders.test.ts` 中将 IFC 从 `SKIP_FORMATS` 移到 `PLAYWRIGHT_ONLY`，因为 IFC 的集成验证更适合 E2E 场景。

### 5.3 E2E 测试

新建 `src/test/ifc-loading.spec.ts`，遵循 Electron E2E 模式：

```typescript
// 示例结构（参考 iges-loading.spec.ts）
test.describe('IFC loading', () => {
  test('loads haus.ifc via file input', async () => {
    // 1. launch Electron app
    // 2. skip if software GPU
    // 3. load haus.ifc via file input
    // 4. waitForLoadDone()
    // 5. assert: format === 'glb'? No — IFC 不转 GLB，直接加载为 ifc 格式
    //    Web 端的 E2E 测试 assert format === 'ifc'
    // 6. assert: partInfos > 50
    // 7. assert: canvas rendered
    // 8. assert: scene tree parts visible
  })
})
```

**关键差异**：IFC 不经过 STEP→GLB 转换，所以 loadedFile 的 `format` 是 `'ifc'`，不是 `'glb'`（与 STEP/IGES/BREP 不同）。

## 六、风险与注意事项

### 6.1 web-ifc WASM 兼容性

`web-ifc` 的 `fetch()` 在 Electron 的生产模式下是否正常工作 → **待验证**。如果 fetch 失败，需要回退到 XHR 预加载方案。

### 6.2 IFC 大文件性能

`rac_advanced_sample_project.ifc` (43MB) 加载和缩略图生成可能较慢。首次加载可能需要几秒到十几秒。在 E2E 测试中超时要设置为 60s。

### 6.3 单元测试配置

`loadIfc.test.ts` 使用 `@vitest-environment jsdom`，需要确保被正确的 Vitest config 匹配到。建议放到 `__tests__/` 子目录。

### 6.4 双版本 web-ifc

Web 和 Electron 用同一版本 `^0.0.77`，避免 `haus.ifc` 解析结果不一致导致测试失败。

## 七、实施顺序

### Phase 1 — 基础设施（新增文件 + 依赖）

1. `pnpm add web-ifc@^0.0.77`
2. 创建 `scripts/copy-ifc-wasm.mjs`，更新 `postinstall`
3. 复制 `loadIfc.ts`、`index.ts` → `src/renderer/lib/ifc-loader/`
4. 复制 `loadIfc.test.ts` → `src/renderer/lib/ifc-loader/__tests__/loadIfc.test.ts`
5. 复制 `haus.ifc` → `src/test/fixtures/`

### Phase 2 — 核心功能修改

6. 修改 `file-formats.ts`，取消禁用
7. 修改 `formatLoaders.ts`，替换 stub
8. 修改 `thumbnailQueue.ts`，添加 IFC 分支（全量生成，不判断大小）

### Phase 3 — 测试 + 配置

9. 修改 `file-formats.test.ts`，移除禁用断言
10. 修改 `format-loaders.test.ts`，IFC 从 SKIP → PLAYWRIGHT_ONLY
11. 修改 `package.json`，添加 `.ifc` 到 fileAssociations
12. 创建 `src/test/ifc-loading.spec.ts`
13. 更新 `vitest.jsdom.config.ts` 确保覆盖 `ifc-loader/__tests__/*.test.ts`

### Phase 4 — 验证

14. 运行 `pnpm run test:fast`（单元 + 组件测试）
15. 运行 `pnpm exec playwright test`（E2E）

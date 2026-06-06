# `webSecurity` 配置分析

## 当前状态

`electron/main/index.ts:87`:
```ts
webSecurity: !import.meta.env.DEV
```

- **开发模式** (`import.meta.env.DEV === true`) → `webSecurity: false`
- **生产模式** (`import.meta.env.DEV === false`) → `webSecurity: true`

---

## 为什么之前是 `webSecurity: false`

`webSecurity: false` 从项目初始 commit (`db0dcaa`) 就已存在。原因：

1. **自定义协议资源加载** — 使用 `faicad-viewer://` 协议加载渲染进程资源，跨源在开发模式下会被拦截。
2. **开发模式 HMR** — 加载 Vite dev server (`localhost:5173`)，混合 `faicad-viewer://` 与 `http://localhost`。
3. **协议 handler 实现方式** — 早期使用 `registerFileProtocol`，对 XHR/Worker/fetch 的支持不如 `protocol.handle()` 完善，`webSecurity: false` 作为兜底绕过限制。

---

## 生产模式改为 `webSecurity: true` 的安全性影响

### 同源分析

生产模式下所有资源通过 **同一 origin** `faicad-viewer://local` 加载：

| 资源 | 实际路径 | 是否同源 |
|------|----------|----------|
| 主页面 | `faicad-viewer://local/out/renderer/index.html` | 基准 origin |
| `<script src="/wasm/occt-import-js.cjs">` | `faicad-viewer://local/wasm/occt-import-js.cjs` | ✅ 同源 |
| `XMLHttpRequest('/wasm/occt-import-js.wasm')` | `faicad-viewer://local/wasm/occt-import-js.wasm` | ✅ 同源 |
| `new Worker('step-worker.js')` | `faicad-viewer://local/step-worker.js` | ✅ 同源 |
| Worker 内 `fetch('wasm/...')` | `faicad-viewer://local/wasm/...` | ✅ 同源 |
| `DRACOLoader.setDecoderPath('/wasm/draco/')` | `faicad-viewer://local/wasm/draco/...` | ✅ 同源 |
| `KTX2Loader.setTranscoderPath('/wasm/basis/')` | `faicad-viewer://local/wasm/basis/...` | ✅ 同源 |
| `index.html` 中 `<link>`/`<img>` | 同上 | ✅ 同源 |

### 唯一的跨源请求

`src/renderer/engine/environment/hdrPresets.ts:10`:
```ts
const CDN_BASE = 'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr'
```
- 用于 HDR 环境贴图的后备 CDN 地址
- Polyhaven CDN 正确设置了 CORS 头
- **仅后备路径**，用户自定义 HDR 走 IPC + base64，不涉及跨源

### 不会受影响的功能

- 本地文件 I/O（`fs:readFile`/`fs:readFileAsBase64`）— 走 IPC，不由 `webSecurity` 控制
- STEP 转换器（Web Worker + IndexedDB）— 同源
- 拓扑选择、场景树等全部渲染功能 — 同源

---

## 开发模式保持 `webSecurity: false` 的原因

1. **Vite HMR WebSocket** — 开发时加载 `localhost:5173`，与 `faicad-viewer://` 跨源。
2. **热更新资源注入** — Vite 通过 WebSocket 注入的脚本和模块跨源。
3. **`protocol.handle()` 的局限** — 开发模式下自定义协议与 HTTP 协议混用，严格同源策略会拦截 HMR 相关请求。

---

## 相关配置

`electron/main/index.ts:6-8`:
```ts
// Workaround for "Network service crashed" on Windows with Electron 39+
// The network service sandbox conflicts with webSecurity:false + localhost loading in dev mode
app.commandLine.appendSwitch('disable-features', 'NetworkServiceSandbox')
```

这个 NetworkServiceSandbox 禁用仅在开发模式 **实际需要**，但因为是进程级开关（在 `app.whenReady()` 前设置），无法区分模式，改为全局保留。不影响安全性，只禁用 Chromium 的网络服务沙箱（Electron 35 上该 flag 行为已变化）。

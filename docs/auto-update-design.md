# 自动更新升级功能设计文档

## 1. 用户需求与目的

### 需求

Faicad 3D Viewer 需要通过 GitHub Releases 实现自动检查、下载和安装新版的功能，用户无需手动下载安装包即可完成版本升级。

### 目的

1. 让用户始终使用最新版本，及时获得 bug 修复和新功能
2. 简化版本分发流程，release 发布后自动推送到用户端
3. 支持两种更新策略：静默下载 + 安装前提示

---

## 2. 现有基础设施分析

### 已具备的条件

| 模块 | 现状 | 说明 |
|---|---|---|
| **electron-builder publish** | `package.json` 已配置 `"publish": ["github"]` | electron-builder 构建产物会自动上传到 GitHub Releases |
| **GitHub Release 工作流** | `.github/workflows/release.yml` 在 tag 推送时构建全平台产物并 `--publish always` | Windows 同时发布 EN (普通) 和 CN (中国版) 两个 edition |
| **版本号获取** | `electron:getAppVersion` IPC 已注册，返回 `app.getVersion()` + git commit | 渲染层可通过 `window.electronAPI.getAppVersion()` 获取 |
| **环境标识** | `window.env.EDITION` 暴露 `'cn'` 或 `undefined`；`window.env.DATA_REGION` 暴露 `'cn'` / `'eu'` / `'us'` | 可用于区分版本更新通道 |
| **IPC 架构** | 主进程 ↔ preload (contextBridge) ↔ 渲染进程 三层架构已建立 | 新增 IPC 通道遵循已有模式 |
| **Zustand 状态管理** | 渲染层使用 Zustand store | 更新状态可通过新建 store 管理 |

### 缺失的环节

1. 无 `electron-updater` 依赖
2. 无主进程自动更新逻辑（检查、下载、安装）
3. 无更新状态 IPC 通道（进度、错误、完成通知）
4. 无渲染层更新 UI（弹窗、进度条）
5. CN edition 使用独立的 artifact name，需要区分更新通道

### 代码签名现状

**项目当前没有任何代码签名配置。** 安装包发布时不带数字签名：

- `package.json` 的 `win` / `mac` 配置中缺少 `certificateSubjectName`、`identity`、`sign` 等签名相关字段
- `.github/workflows/release.yml` 中未设置 `CSC_LINK`、`CSC_KEY_PASSWORD`、`APPLE_ID` 等签名环境变量
- 构建出的安装包是**未签名**的

因此自动更新的安全性仅依赖安装包哈希校验，不涉及数字签名验证。

---

## 3. 技术方案

### 3.1 核心库

选用 `electron-updater`（electron-builder 官方维护的更新库），理由：

- 与现有 electron-builder 配置天然集成，复用 `publish.github` 配置
- 支持 GitHub Releases 作为更新源，无需额外服务器
- 支持 Windows (NSIS)、macOS (DMG)、Linux (AppImage) 全平台自动更新
- 提供 `autoUpdater` 事件机制：checking-for-update / update-available / update-not-available / download-progress / update-downloaded / error

### 3.2 更新流程

```
用户启动应用
  │
  ├─ (可选) 自动检查更新 ← 启动后延迟 N 秒执行
  │       │
  │       ├─ 无更新 → 不做操作
  │       └─ 有更新 → 静默下载
  │               │
  │               └─ 下载完成 → 标记 "已下载待安装"
  │
  └─ 用户手动检查更新（菜单/设置页）
          │
          ├─ 无更新 → 提示 "已是最新版"
          └─ 有更新 → 显示对话框
                  │
                  ├─ "立即更新" → 下载并安装（下载时有进度条）
                  └─ "稍后提醒" → 关闭对话框，后台继续下载
```

### 3.3 GitHub Release 资源命名约定

更新器会根据当前版本和平台，在 GitHub Releases 中查找匹配的安装包。

**普通版 (EN/默认)**：

```
3D_Viewer_${version}_x64_Setup.exe   # Windows NSIS
3D_Viewer_${version}_x64.AppImage     # Linux AppImage
3D_Viewer_${version}_x64.dmg          # macOS Intel
3D_Viewer_${version}_arm64.dmg        # macOS Apple Silicon
```

**中国版 (CN)**：

```
3D_Viewer_${version}_x64_cn_Setup.exe  # Windows NSIS
3D_Viewer_${version}_x64_cn.AppImage   # Linux AppImage
```

CN edition 的 macOS 版本暂不发布，Linux CN edition 可选。

`electron-updater` 通过 `github` provider 的 `owner` + `repo` 配置查找 release，再通过 artifact 文件名匹配对应的安装包。不同 edition 的 artifact 文件名不同，更新器在构建时通过环境变量注入正确的 artifact 名。

---

## 4. 架构设计

### 4.1 文件组织结构

```
electron/
├── main/
│   ├── index.ts              # 主进程入口（修改，注册 update IPC）
│   ├── updater.ts            # [新增] 自动更新管理器
│   └── ipc-handlers.ts       # AI IPC（不变）
├── preload/
│   └── index.ts              # （修改，暴露 update IPC）
src/
└── renderer/
    ├── stores/
    │   └── update-store.ts   # [新增] 更新状态 Zustand store
    ├── components/
    │   └── update-dialog.tsx  # [新增] 更新弹窗组件
    ├── types/
    │   ├── electron.d.ts     # （修改，补充类型定义）
    │   └── window.d.ts       # （修改，补充类型定义）
    └── ...
```

### 4.2 主进程 — Updater 模块 (`electron/main/updater.ts`)

**职责**：封装 `electron-updater` 的 `autoUpdater`，管理更新生命周期。

**接口**（不写实现细节，只写签名和用途）：

- `initUpdater(edition: string | undefined): void` — 初始化更新器，配置 provider URL、channel、artifact 匹配规则
- `checkForUpdates(manual: boolean): void` — 主动触发更新检查，`manual=true` 表示用户手动触发
- `quitAndInstall(): void` — 下载完成后调用，退出并安装更新
- `setAutoDownload(enabled: boolean): void` — 设置是否自动下载

**事件转发**：通过 `webContents.send` 将 `electron-updater` 事件转发到渲染进程：

| electron-updater 事件 | 转发 IPC Channel | 载荷 |
|---|---|---|
| `checking-for-update` | `update:checking` | 无 |
| `update-available` | `update:available` | `{ version, releaseDate, releaseNotes, releaseName }` |
| `update-not-available` | `update:not-available` | `{ version }`（当前版本） |
| `download-progress` | `update:download-progress` | `{ bytesPerSecond, percent, total, transferred }` |
| `update-downloaded` | `update:downloaded` | `{ version, files }` |
| `error` | `update:error` | `{ message, stack? }` |

**IPC 处理**（注册在 `index.ts` 中）：

| Channel | Direction | 用途 |
|---|---|---|
| `update:check` | invoke | 手动检查更新 |
| `update:quit-and-install` | invoke | 退出并安装 |

### 4.3 Preload 脚本 (`electron/preload/index.ts`)

在 `window.electronAPI` 中新增：

| 方法 | IPC 通道 | 说明 |
|---|---|---|
| `checkForUpdates()` | `update:check` | invoke，手动触发检查 |
| `quitAndInstall()` | `update:quit-and-install` | invoke，安装更新 |
| `onUpdateEvent(callback)` | `update:*` | 监听所有更新事件（返回取消函数） |

### 4.4 渲染层 — Update Store (`src/renderer/stores/update-store.ts`)

**状态字段**：

```typescript
interface UpdateState {
  status: 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error'
  version: string | null          // 新版本号
  releaseNotes: string | null     // 发布说明
  downloadProgress: number        // 0-100
  bytesPerSecond: number
  errorMessage: string | null
}
```

**Actions**：

- `checkForUpdates(manual: boolean)` — 发起检查
- `reset()` — 重置状态
- `quitAndInstall()` — 安装更新

Store 初始化时注册 `window.electronAPI.onUpdateEvent` 回调，自动更新状态。

### 4.5 渲染层 — Update Dialog (`src/renderer/components/update-dialog.tsx`)

根据 `update-store` 状态渲染不同 UI：

| 状态 | UI |
|---|---|
| `idle` | 不显示 |
| `checking` | 小 loading 指示器 |
| `available` | "新版本 x.x.x 可用" + "立即更新" / "稍后" 按钮 |
| `not-available` | Toast 提示 "已是最新版本" |
| `downloading` | 进度条 + 速度 + 百分比文字 |
| `downloaded` | "更新已下载，重启安装？" + "立即重启" / "稍后" |
| `error` | "检查更新失败" + 重试按钮 |

### 4.6 在主进程中的集成 (`electron/main/index.ts`)

在 `app.whenReady()` 中新增：

1. 读取 `EDITION` / `DATA_REGION` 环境变量
2. 调用 `initUpdater(edition)` 初始化更新器
3. 注册 `update:check`、`update:quit-and-install` 两个 IPC handler
4. 启动后 10 秒自动触发静默检查（仅生产环境）

### 4.7 设置页集成

在现有设置 / 关于界面中新增：

- "当前版本：v1.8.0" 文字显示
- "检查更新" 按钮
- 自动检查更新开关（默认开启）

---

## 5. 配置与构建

### 5.1 `package.json` 补充

新增依赖 `electron-updater`（与 electron-builder 同版本系）。

### 5.2 构建配置

`electron-builder` 的 `build.publish` 已配置 `github`，无需修改。

`build.win.nsis.artifactName` 保持现有模式，CN edition 在 `build-edition.mjs` 中附加 `_cn` 后缀，更新器在运行时根据 EDITION 环境变量选择匹配的 artifact 名。

### 5.3 CI/CD 调整

`.github/workflows/release.yml` **无需修改**，现有流程已支持：

- Tag 推送 → 构建全平台 → `--publish always` → 上传到 GitHub Releases
- 普通版和 CN 版使用不同 artifact 名称，更新器通过 `EDITION` 环境变量区分

### 5.4 更新通道策略

| EDITION | 更新源 channel | artifact 匹配模式 |
|---|---|---|
| `cn` | `latest-cn.yml` | `*_cn_Setup.exe` |
| 无 (默认) | `latest.yml` | `*_Setup.exe` |

`electron-updater` 的 GitHub provider 默认读取 release 中的 `latest.yml` 作为更新元数据。CN edition 需要额外上传 `latest-cn.yml`，或在构建时通过 `channel` 参数指定不同的 channel 文件。

**方案选择**：采用 `channel` 参数方案。CN edition 构建时通过环境变量 `EDITION=cn` 让更新器使用 `channel: "cn"`，更新器会读取 `latest-cn.yml`。

---

## 6. 安全模型

### 6.1 哈希校验（完整性保护）

`electron-updater` 通过 sha512 哈希校验确保安装包完整性：

- 构建时 `electron-builder` 生成 `latest.yml`（或 `latest-cn.yml`），内含每个平台安装包的 URL 和 sha512 哈希
- 更新器下载安装包后，自动比对本地计算的 sha512 与 `latest.yml` 中的值
- 匹配则通过，不匹配则触发 `error`，拒绝安装

### 6.2 签名验证（缺位）

当前没有代码签名，因此不验证安装包的数字签名。这意味着：

- 安装包的**真实性**（是否来自 Faicad）无法通过签名保证，仅依赖 GitHub Release 的访问安全（HTTPS + `GH_TOKEN`）
- 如果后续增加代码签名，`electron-updater` 本身不负责验证签名，签名由操作系统在安装时验证（SmartScreen / Gatekeeper）

### 6.3 传输安全

- 所有更新通信通过 HTTPS（GitHub API + Release 下载）
- 不存在降级攻击风险：更新器只会向新版本升级

---

## 7. 版本兼容与降级保护

- 更新器跳过相同版本的安装包
- 支持所有类型的版本升级：patch、minor、major
- `electron-updater` 默认处理所有版本差异，无需额外配置
- 不支持降级安装

---

## 8. 边界情况处理

| 场景 | 处理方式 |
|---|---|
| 网络不可用 | 超时后触发 `error` 事件，显示友好提示 |
| 用户同时打开多个窗口 | 只在主窗口发送更新事件 |
| 下载中途关闭应用 | `electron-updater` 自动恢复下载（缓存部分数据） |
| CN 版更新检测 | 通过 `EDITION` 环境变量自动切换到 CN 通道 |
| 开发环境下不检测更新 | `import.meta.env.DEV` 时跳过自动检查，手动检查也提示 "开发模式不支持" |
| 安装包哈希校验失败 | `electron-updater` 自动比对下载文件的 sha512 与 `latest.yml` 中的哈希值，不匹配则触发 `error`，确保文件完整性 |

---

## 9. 国际化

更新相关 UI 文本通过现有 `i18next` 体系实现翻译，需在 `src/renderer/locales/` 中补充更新相关的 key-value。

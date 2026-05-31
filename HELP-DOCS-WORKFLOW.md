# 帮助文档生成指南

本文档说明如何为 Faicad 3D Viewer 项目生成和更新帮助文档。

## 技术栈

**VitePress** — 基于 Vite 的静态站点生成器，输出纯静态 HTML。

```
pnpm add -D vitepress
```

## 目录结构

```
pages/                          # 文档源码根目录
├── .vitepress/
│   └── config.ts               # VitePress 配置（SEO、导航、侧边栏、页脚）
├── public/
│   └── screenshots/            # 界面截图（.png）
├── index.md                    # 首页（hero + 特性卡片布局）
├── guide/
│   ├── getting-started.md      # 快速开始
│   ├── installation.md         # 安装与下载
│   ├── supported-formats.md    # 支持的文件格式列表
│   ├── keyboard-shortcuts.md   # 键盘快捷键
│   └── configuration.md        # 配置与主题
└── features/
    ├── overview.md             # 功能概览
    ├── step-support.md         # STEP 文件支持
    └── pbr-rendering.md        # PBR 渲染系统
.github/workflows/
└── deploy-pages.yml            # GitHub Actions 自动部署到 Pages
scripts/
└── capture-screenshots.mjs     # 截图捕获脚本（Playwright）
```

## 命令

```bash
pnpm run dev:docs                     # 本地预览 http://localhost:5173（热更新）
pnpm run build:docs                   # 生成格式页面 + 构建到 pages/.vitepress/dist/
pnpm run generate:format-pages        # 仅重新生成文件格式页面
pnpm run capture:format-screenshots   # 截取各文件格式的截图（需先构建应用）
```

## 文档编写规范

### 1. 面向最终用户

文档写给**使用软件的用户**看，不是给开发者看的。所有内容应从用户视角出发。

**禁止出现的内容：**

- 内部实现细节（WASM、Web Worker、IndexedDB、Open CASCADE、Three.js、React、electron-vite 等）
- 转换/编译/解析等技术过程描述
- 项目目录结构
- 技术栈和框架名称
- 构建命令和开发环境配置
- npm/pnpm 包名

**可以讲的内容：**

- 功能有什么用
- 如何操作
- 界面长什么样（配合截图）
- 常见问题解答（从用户角度）

### 2. 配合截图

重要页面都应配上对应的应用界面截图。

**截图规范：**

- 截图放在 `pages/public/screenshots/` 目录
- 在 Markdown 中用 `![](/screenshots/文件名.png)` 引用
- 截图使用有视觉吸引力的模型，不用简单几何体（如正方体）
- 好的模型示例：`AnisotropyBarnLamp.glb`（PBR 吊灯）、`RobotExpressive.glb`（角色动画）等
- 截图用 Playwright 脚本 `scripts/capture-screenshots.mjs` 自动捕获

**截图捕获流程：**

1. 确保应用已构建（`dist/win-unpacked/3D_Viewer.exe` 存在）
2. 修改脚本中加载的模型文件路径
3. 运行 `node scripts/capture-screenshots.mjs`
4. 核对输出截图质量，不满意则调整等待时间或加载不同模型

### 3. 版本信息

页脚显示版本号，从 `package.json` 自动读取：

```ts
import pkg from '../../package.json'

footer: {
  message: `v${pkg.version} — 基于 LGPL-2.0 协议开源`,
}
```

发版更新 `package.json` 版本号后，文档页脚自动同步。

### 4. SEO 配置

在 `pages/.vitepress/config.ts` 的 `head` 中配置：

| 项目 | 说明 |
|------|------|
| `description` | 搜索引擎摘要，概括产品价值 |
| `keywords` | 搜索关键词 |
| `og:title` / `og:description` | 社交分享卡片（微信、Twitter 等） |
| `canonical` | 规范链接，防重复内容 |
| `sitemap` | 自动生成 `sitemap.xml`，提交搜索引擎 |

### 5. 中文本地化

VitePress 配置中的 UI 文字已全部中文化：

```ts
lang: 'zh-CN'
search: { provider: 'local' }   // 内置全文搜索
docFooter: { prev: '上一页', next: '下一页' }
lastUpdated: { text: '最后更新' }
outline: { label: '本页目录' }
darkModeSwitchLabel: '主题切换'
```

### 6. 文件格式列表

`supported-formats.md` 中的格式说明要简洁、面向用户：

| 正确写法 | 错误写法 |
|----------|----------|
| "Draco 压缩网格，文件体积更小" | "需 Draco WASM 解码器" |
| "工业 CAD 标准格式，自动导入渲染" | "通过 Open CASCADE 引擎转换为 GLB 渲染" |
| "Rhinoceros 3D 格式" | "需 rhino3dm WASM" |

### 7. 新增页面

1. 在对应目录创建 `.md` 文件
2. 在 `pages/.vitepress/config.ts` 的 `sidebar` 中添加链接
3. 如页面属于新分类，还需在 `nav` 中添加导航入口
4. 运行 `pnpm run build:docs` 验证构建成功
5. 确认 `sitemap.xml` 中包含了新页面链接

## 部署

### GitHub Pages（自动）

`.github/workflows/deploy-pages.yml` 定义了自动部署流程：

- **触发条件**：推送 `pages/**` 或 `.github/workflows/deploy-pages.yml` 到 `main` 分支
- **也可手动触发**：GitHub → Actions → Deploy VitePress to Pages → Run workflow
- **部署目标**：`gh-pages` 分支
- **仓库设置**：Settings → Pages → Source → **GitHub Actions**

### 部署前检查清单

- [ ] `pnpm run build:docs` 构建成功，无报错
- [ ] 所有页面内容完整、无内部实现细节
- [ ] 截图文件存在且路径正确
- [ ] 版本文档更新到最新
- [ ] 新页面已加入 sidebar/nav 配置
- [ ] sitemap 包含所有页面

## 常见注意事项

1. **图片路径**：VitePress 中 `pages/public/` 映射到网站根路径 `/`，所以 `pages/public/screenshots/a.png` 在 Markdown 中引用为 `/screenshots/a.png`
2. **不要引用不存在的图片**：构建时 VitePress 会检查图片资源是否存在，缺失会导致构建失败
3. **避免内部术语**：用户不需要知道 "PBR" 是什么的缩写，不需要知道 "拓扑" 的技术定义，描述功能效果即可
4. **FAQ 要有用**：常见问题应来源于真实用户反馈，不要编造没有实际意义的问题
5. **版本号**：页脚版本号自动从 `package.json` 读取，不要手动硬编码
6. **base 路径**：`pages/.vitepress/config.ts` 中的 `base` 必须设为 `/<仓库名>/`（GitHub Pages 子路径部署时），否则 CSS/JS 404 导致页面无样式

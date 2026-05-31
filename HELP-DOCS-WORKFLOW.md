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
│   └── config.ts               # VitePress 配置（SEO、20 语言 i18n、导航、侧边栏、页脚）
├── public/
│   └── screenshots/            # 界面截图（.png）
├── __tests__/
│   └── locale-config.test.ts   # 多语言配置的单元测试（13 个测试用例）
├── e2e/
│   └── language-switching.spec.ts  # 多语言切换的 E2E 测试（9 个测试用例）
├── playwright.config.ts        # Playwright 配置（用于文档 E2E 测试）
├── index.md                    # 英文首页（hero + 特性卡片布局）
├── guide/                      # 英文指南页面（5 个 .md）
├── features/                   # 英文功能页面（3 个 .md）
├── formats/                    # 英文格式页面（索引 + 27 个格式页面）
├── zh/                         # 中文翻译
│   ├── index.md
│   ├── guide/
│   ├── features/
│   └── formats/
├── es/                         # 西班牙语翻译
├── ja/                         # 日语翻译
├── ko/                         # 韩语翻译
├── fr/                         # 法语翻译
├── de/                         # 德语翻译
├── pt/                         # 葡萄牙语翻译
├── ru/                         # 俄语翻译
├── ar/                         # 阿拉伯语翻译
├── hi/                         # 印地语翻译
├── id/                         # 印尼语翻译
├── tr/                         # 土耳其语翻译
├── it/                         # 意大利语翻译
├── nl/                         # 荷兰语翻译
├── pl/                         # 波兰语翻译
├── vi/                         # 越南语翻译
├── th/                         # 泰语翻译
├── uk/                         # 乌克兰语翻译
└── sv/                         # 瑞典语翻译
.github/workflows/
└── deploy-pages.yml            # GitHub Actions 自动部署到 Pages
scripts/
├── translations.mjs            # 20 种语言的翻译数据源（导航、侧边栏、英雄区、功能特性）
├── format-data.mjs             # 27 种文件格式的数据源（中英文描述、分组、渲染方式）
├── generate-format-pages.mjs   # 脚本：为所有 20 种语言生成格式页面
├── generate-locale-pages.mjs   # 脚本：为非中文语种（18 种）生成首页/指南/功能页面
└── capture-format-screenshots.mjs  # 截图捕获脚本（Playwright + Electron）
```

## 命令

```bash
pnpm run dev:docs                     # 本地预览 http://localhost:5173（热更新）
pnpm run build:docs                   # 生成格式页面 + 生成语种页面 + 构建到 pages/.vitepress/dist/
pnpm run generate:format-pages        # 仅重新生成文件格式页面（全部 20 个语种）
pnpm run capture:format-screenshots   # 截取各文件格式的截图（需先构建应用）
pnpm run test:unit                    # 运行多语言配置单元测试
pnpm run test:e2e:docs                # 构建文档 + 运行多语言切换 E2E 测试
```

## 多语言架构

### 20 种语言

文档支持以下 20 种语言。英文（en）为根语种，路径不带语种前缀；其余 19 种以 ISO 代码为目录前缀：

| 代码 | 名称 | 目录 |
|------|------|------|
| en   | English | `/`（根目录） |
| zh   | 中文 | `/zh/` |
| es   | Español | `/es/` |
| ja   | 日本語 | `/ja/` |
| ko   | 한국어 | `/ko/` |
| fr   | Français | `/fr/` |
| de   | Deutsch | `/de/` |
| pt   | Português | `/pt/` |
| ru   | Русский | `/ru/` |
| ar   | العربية | `/ar/`（RTL 方向）|
| hi   | हिन्दी | `/hi/` |
| id   | Bahasa Indonesia | `/id/` |
| tr   | Türkçe | `/tr/` |
| it   | Italiano | `/it/` |
| nl   | Nederlands | `/nl/` |
| pl   | Polski | `/pl/` |
| vi   | Tiếng Việt | `/vi/` |
| th   | ไทย | `/th/` |
| uk   | Українська | `/uk/` |
| sv   | Svenska | `/sv/` |

### 翻译文件

`scripts/translations.mjs` 是所有翻译字符串的单一数据源：

- **NAV** — 导航栏名称（首页、入门指南、功能特性、文件格式）
- **HERO** — 首页英雄区文字（标题、副标题、按钮文本）
- **FEATURES** — 6 个功能特性的标题和描述
- **SIDEBAR** — 侧边栏菜单项（每个语言有自己的翻译）
- **GUIDE** — 快速开始页面正文段落

对于未提供完整翻译的语种，功能特性、侧边栏和指南内容自动回退到英文。

### 页面生成器

- **`scripts/format-data.mjs`** — 定义全部 29 种文件格式的元数据（扩展名、分组、渲染方式、中英文描述）。`FORMAT_GROUPS` 和 `RENDER_HINT_LABELS` 已扩展到全部 20 种语言（未翻译的语种回退到英文）。
- **`scripts/generate-format-pages.mjs`** — 遍历全部 20 种语言 × 29 种格式，为每种组合生成单独的 `.md` 页面。格式描述在非中文/非英文语种中使用英文回退。
- **`scripts/generate-locale-pages.mjs`** — 为 18 个非中文/非英文语种生成首页 (`index.md`)、指南 (`guide/getting-started.md`)、功能 (`features/overview.md`) 和格式索引 (`formats/index.md`)。

### VitePress i18n 配置

`pages/.vitepress/config.ts` 中：

- `LANG_LABELS` — 定义 20 种语言的标签、语言代码、文本方向
- `UI_LABELS` — 20 种语言的界面文字（docFooter、outline、darkModeSwitch 等）
- `localesConfig()` — 动态生成 VitePress `locales` 配置，每种语言对应一个 locale 条目
- `nav(lang)` / `sidebar(lang)` — 从 `translations.mjs` 读取翻译，生成正确前缀的链接

### 语言切换器

VitePress 内置语言切换器 (`VPNavBarTranslations`) 会自动显示所有已配置的 locale。中文首页显示 19 个非中文语种；其他语种页面显示剩余 19 个语种（包括中文）。切换器中的链接自动指向对应语种的**同级页面**（如从 `/guide/getting-started` 切换到日语 → `/ja/guide/getting-started`）。

### 配置要点

1. **locale key**：根语种（en）的 key 必须为 `'root'`，其他语种为 ISO 代码（如 `'zh'`、`'ja'`）
2. **locale link**：根语种为 `'/'`，其他为 `'/{code}/'`
3. **getLocaleForPath**：通过 `new RegExp('/${key}/')` 匹配相对路径来识别当前语种
4. **根 themeConfig**：根语种（en）的 nav/sidebar/UI 标签在 `themeConfig` 顶层直接设置，作为默认值
5. **各 locale themeConfig**：每个 locale 下的 `themeConfig.nav`、`themeConfig.sidebar`、`themeConfig.docFooter` 等独立设置

## 每个格式一个页面

### 格式数据源

`scripts/format-data.mjs` 导出 `FORMATS` 数组，每个格式包含：

```js
{
  id: 'stl',                    // 页面文件名（stl.md）
  label: 'STL',                 // 显示名称
  extensions: ['.stl'],         // 文件扩展名列表
  group: 'mesh',                // 分组（mesh/cad/animation/point/volume/gcode/vector/other）
  renderHint: 'mesh',           // 渲染方式（mesh/volume/skeleton/toolpath/pointcloud/svg）
  fixture: null,                // 截图测试用的模型文件名
  mimeType: null,               // 文件的 MIME 类型
  zh: { description: '...' },   // 中文描述
  en: { description: '...' },   // 英文描述
}
```

添加新的文件格式时，在此数组中新增一个条目即可。`generate-format-pages.mjs` 会自动为全部 20 种语言生成对应的 `.md` 页面。

### 页面内容

每个格式页面包含：
- 标题（格式名称 + 分组）
- 格式描述
- 信息表格（扩展名、分类、渲染方式）
- 支持的特性列表（格式特定功能 + 通用功能）
- 截图（如果存在 `pages/public/screenshots/formats/{id}.png`）

### 格式页面索引

每种语言下自动生成分组展示的 `formats/index.md`，列出所有 29 种格式并按分类（Mesh、CAD、Animation 等）分组。索引页面由 `generate-format-pages.mjs` 自动生成。

## 文档编写规范

### 1. 面向最终用户

文档写给**使用软件的用户**看，不是给开发者看的。所有内容应从用户视角出发。

**禁止出现的内容：**

- 内部实现细节（WASM、Web Worker、IndexedDB、Open CASCADE、Three.js、React、electron-vite 等）
- 转换/编译/解析等技术过程描述
- 项目目录结构（此项已在开发指南中，不在用户文档中出现）
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
- 截图用 Playwright 脚本 `scripts/capture-format-screenshots.mjs` 自动捕获

**截图捕获流程：**

1. 确保应用已构建（`dist/win-unpacked/3D_Viewer.exe` 存在）
2. 运行 `node scripts/capture-format-screenshots.mjs`
3. 核对输出截图质量，不满意则调整等待时间或加载不同模型

### 3. 版本信息

页脚显示版本号，从 `package.json` 自动读取：

```ts
import pkg from '../../package.json'

footer: {
  message: `v${pkg.version} — LGPL-2.0`,
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

VitePress 配置中的 UI 文字已全部中文化。根语种（zh）使用中文界面文字，其他 19 个语种各自有翻译。

### 6. 分组展示

格式列表页面（`formats/index.md`）按分组展示，分组顺序为：**Mesh** → **CAD** → **Animation** → **Point Cloud** → **Volume** → **GCode** → **Vector** → **Other**。每个分组下按格式在 `FORMATS` 数组中的顺序排列。

每个格式页面具有 prev/next 导航，按 `FORMATS` 数组的线性顺序跳转上一个/下一个格式。

### 7. 文件格式列表

格式描述要简洁、面向用户：

| 正确写法 | 错误写法 |
|----------|----------|
| "Draco 压缩网格，文件体积更小" | "需 Draco WASM 解码器" |
| "工业 CAD 标准格式，自动导入渲染" | "通过 Open CASCADE 引擎转换为 GLB 渲染" |
| "Rhinoceros 3D 格式" | "需 rhino3dm WASM" |

### 7. 新增页面

1. **中文页面**：在对应目录（`pages/guide/`、`pages/features/`、`pages/formats/`）创建 `.md` 文件
2. **翻译页面**：在每个语种目录下创建对应的 `.md` 文件（路径结构需与中文一致）
3. **更新配置**：
   - 通用页面：在 `pages/.vitepress/config.ts` 的 `sidebar()` 中添加链接
   - 格式页面：在 `scripts/format-data.mjs` 的 `FORMATS` 数组中添加条目（自动生成全部 20 语种页面）
   - 如页面属于新分类，还需在 `nav()` 中添加导航入口
4. **运行 `pnpm run generate:format-pages`** 重新生成格式页面
5. **运行 `pnpm run build:docs`** 构建并验证
6. **确认 `sitemap.xml`** 包含了新页面链接

### 8. 新增语种

1. 在 `scripts/translations.mjs` 中添加该语种的翻译字符串（NAV、HERO、SIDEBAR、GUIDE、FEATURES）
2. 在 `pages/.vitepress/config.ts` 的 `LANG_LABELS` 中注册语种信息（label、lang、dir）
3. 在 `UI_LABELS` 中添加该语种的界面文字
4. 在 `scripts/format-data.mjs` 的 `FORMAT_GROUPS` 和 `RENDER_HINT_LABELS` 中添加翻译
5. 运行 `pnpm run generate:format-pages` 为该语种生成格式页面
6. 运行 `pnpm run build:docs` 构建并验证
7. 更新 `pages/__tests__/locale-config.test.ts` 和 `pages/e2e/language-switching.spec.ts` 中的语种列表

## 测试

### 单元测试（Vitest）

`pages/__tests__/locale-config.test.ts` 包含 13 个测试用例，验证：

- 语种数量正确（20）
- locale key 格式正确（root / ISO code）
- locale link 格式正确（`/` / `/{code}/`）
- 语种选择器正则匹配正确
- 没有重复标签
- 所有语种链接唯一

运行：`pnpm run test:unit`

### E2E 测试（Playwright）

`pages/e2e/language-switching.spec.ts` 包含 9 个测试用例，验证：

- 语言切换器在中文首页正确渲染（显示非中文 19 项）
- 语言切换器在英文页面正确渲染
- 每个语种链接的 href 正确
- 点击每个语种后页面正确加载（无 404）
- 切换到中文后导航显示中文标签
- 所有链接无双斜杠
- 同级页面路径保持正确

运行：`pnpm run test:e2e:docs`

## 部署

### GitHub Pages（自动）

`.github/workflows/deploy-pages.yml` 定义了自动部署流程：

- **触发条件**：推送 `pages/**` 或 `.github/workflows/deploy-pages.yml` 到 `main` 分支
- **也可手动触发**：GitHub → Actions → Deploy VitePress to Pages → Run workflow
- **部署目标**：`gh-pages` 分支
- **仓库设置**：Settings → Pages → Source → **GitHub Actions**

### 部署前检查清单

- [ ] `pnpm run build:docs` 构建成功，无报错
- [ ] `pnpm run test:unit` 所有单元测试通过
- [ ] `pnpm run test:e2e:docs` 所有 E2E 测试通过
- [ ] 所有页面内容完整、无内部实现细节
- [ ] 截图文件存在且路径正确
- [ ] 版本文档更新到最新
- [ ] 新页面已加入 sidebar/nav 配置
- [ ] 新语种已注册到 LANG_LABELS 和翻译文件
- [ ] sitemap 包含所有页面

## 常见注意事项

1. **图片路径**：VitePress 中 `pages/public/` 映射到网站根路径 `/`，所以 `pages/public/screenshots/a.png` 在 Markdown 中引用为 `/screenshots/a.png`
2. **不要引用不存在的图片**：构建时 VitePress 会检查图片资源是否存在，缺失会导致构建失败
3. **避免内部术语**：用户不需要知道 "PBR" 是什么的缩写，不需要知道 "拓扑" 的技术定义，描述功能效果即可
4. **FAQ 要有用**：常见问题应来源于真实用户反馈，不要编造没有实际意义的问题
5. **版本号**：页脚版本号自动从 `package.json` 读取，不要手动硬编码
6. **base 路径**：`pages/.vitepress/config.ts` 中的 `base` 必须设为 `/<仓库名>/`（GitHub Pages 子路径部署时），否则 CSS/JS 404 导致页面无样式
7. **语种前缀**：生成页面 URL 时，非中文语种路径前缀为 `/{code}/`（如 `/ja/guide/getting-started`），中文根语种无前缀（如 `/guide/getting-started`）
8. **翻译回退**：对于未提供完整翻译的语种，`FEATURES`、`SIDEBAR`、`GUIDE` 自动回退到英文
9. **格式页面**：格式描述只提供中英文版本，其他 18 种语言自动使用英文描述；格式分组名和渲染方式标签已翻译为所有 20 种语言

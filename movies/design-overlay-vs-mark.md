# URL 视频 — Mark 与 Caption 概念定义

> **目的**：彻底理清命名和流程。后续所有代码修改以本文档为准。

---

## 1. 核心定义

### Mark — 内容定位

动画元素出现在**页面内容的某个元素旁边**。坐标由 Playwright 在页面上找到的 DOM 元素决定。

| 属性 | 说明 |
|------|------|
| 定位依据 | URL 页面的 DOM 元素 |
| 坐标来源 | `marks.json`（Playwright 截图时分析 DOM 得到） |
| 找不到元素时 | **必须报错**，`process.exit(1)` |
| 滚动行为 | 跟随 scroll-layer 滚动（绑定页面坐标） |
| 样式配置 | 坐标来自 marks，外观由动画类型决定 |

**Mark 类型**：`highlight-area`、`click-highlight`、`text-annotation`、`scroll-to-text`

### Caption — 屏幕定位

动画元素出现在**屏幕视口的固定位置**。不绑定任何页面元素，坐标完全由用户指定。

"Caption" 一词来自视频术语：屏幕上叠印的文字，不跟音频走，不绑定画面内容。

| 属性 | 说明 |
|------|------|
| 定位依据 | 视口百分比 |
| 坐标来源 | `.mjs` 脚本中显式写明 |
| 找不到元素时 | 不涉及（不查找页面元素） |
| 滚动行为 | 固定在视口，不随页面滚动 |
| 样式配置 | **必须在 .mjs 中显式提供全部样式参数**：`top`、`fontSize`、`color`、`align`、`pad` |

**Caption 类型**：`caption`

> 判断 Mark 还是 Caption，只有一个标准：**定位是通过 URL 页面内容，还是通过屏幕位置。**

---

## 2. 命名对照 — "overlay" 一词的历史问题

代码中历史上 "overlay" 一词出现在三个不同层面，是混乱根源：

| 出现位置 | 含义 | 处理 |
|---------|------|------|
| CSS class `.overlay` | `position:absolute` 浮层（纯 CSS 概念） | **保留**，它是 CSS 层命名，与 Mark/Caption 无关 |
| 旧动画 type `text-overlay` | 屏幕定位文字 | **已改名** → `caption` |
| 旧 CSS class `.text-overlay` | Caption 的 DOM 样式 | **已改名** → `.caption` |
| 旧函数 `isOverlayType()` | 判断是否不需要 mark | **已删除** → 改为正向的 `isMarkType()` |

**核心教训**：CSS `.overlay` 是视觉效果（浮在背景上方），Caption/Mark 是定位方式（靠什么决定坐标）。两者正交——Mark 的 DOM 元素也可以有 CSS `.overlay` class。

---

## 3. 动画类型完整分类

```
动画类型                     分类       需要 marks?    定位方式
─────────────────────────────────────────────────────────────
highlight-area              Mark         是          页面元素坐标
click-highlight             Mark         是          页面元素坐标
text-annotation             Mark         是          页面元素坐标 (target=mark key, text=显示文字)
scroll-to-text              Mark         是          页面元素坐标 (text=mark key)
scroll-down                 —            否          整个场景滚动
caption                     Caption      否          视口百分比
page-transition             —            否          场景间过渡
custom                      —            否          用户自定义 GSAP
```

**辅助函数**（位于 `html-composer.mjs`）：

```js
const MARK_TYPES = new Set([
  'highlight-area',
  'click-highlight',
  'text-annotation',
  'scroll-to-text',
])

function isMarkType(type) {
  return MARK_TYPES.has(type)
}
```

**规则**：
- `isMarkType(type) === true` → 必须能在 `marks.json` 中找到对应 key → 找不到 `process.exit(1)`
- `isMarkType(type) === false` → 不查 `marks.json`

---

## 4. marks.json 加载流程（generate-url-video.mjs）

```
对每个 URL：
  ├─ 检查 anim 数组中是否有 isMarkType() 为 true 的动画
  │
  ├─ 全是非 Mark 类型（caption / scroll-down / page-transition / custom）
  │   → 不加载 marks 文件，静默传入 {}
  │
  └─ 存在 Mark 类型
      → 必须加载 marks 文件
      → 文件不存在 → console.error + process.exit(1)
```

**关键**：一个 URL 只要有一个 Mark 动画，就需要 marks 文件。URL 3 只有 `caption` → 不查 marks → 不报错。

---

## 5. DOM + GSAP 流程（html-composer.mjs）

### buildSceneHtml

```
对每个 anim step：
  ├─ type === 'caption'
  │   → 生成 <div class="caption"> 放在 sceneExtras（视口固定层，不随滚动）
  │   → continue
  │
  ├─ isMarkType(type) === true
  │   → resolveMark(step, marks)  ← 找不到 process.exit(1)
  │   → 生成对应 DOM 元素（放在 scroll-layer 内，跟随滚动）
  │
  └─ 其他（scroll-down / page-transition / custom）
      → 不生成 DOM 元素
```

### buildSceneGsap

```
对每个 anim step：
  ├─ type === 'caption'
  │   → 生成 GSAP 动画（fade in/out）
  │   → continue
  │
  ├─ isMarkType(type) === true
  │   → mark = resolveMark(step, marks)  ← 找不到 process.exit(1)
  │   → 生成对应 GSAP 命令
  │
  └─ 其他（scroll-down / page-transition / custom）
      → mark = null
      → 生成对应 GSAP 命令（不需要 mark 坐标）
```

### captionStyle 函数

```js
function captionStyle(step, width, height) {
  const isLandscape = width > height
  const fontSize = hv(step.fontSize, isLandscape) || 28
  const color = hv(step.color, isLandscape) || '#ff6b35'
  const align = hv(step.align, isLandscape) || 'center'
  const topPct = hv(step.top, isLandscape) ?? 50
  const pad = hv(step.pad, isLandscape) || 5
  // ... 返回 CSS style 字符串
}
```

`hv()` 解析标量或 `{h, v}` 对象，根据 `width > height` 选择横/竖屏配置。

---

## 6. m5.mjs 实例对照

```
URL 0 (GitHub):
  highlight-area  "Releases sidebar"  → Mark    ← 需要 marks[0].json ✅
  text-annotation "这里下载"           → Mark    ← target="Releases sidebar"

URL 1 (GitCode):
  click-highlight "All releases"      → Mark    ← 需要 marks[1].json ✅

URL 2 (GitCode Releases):
  highlight-area  "3D_Viewer..."      → Mark    ← 需要 marks[2].json ✅

URL 3 (同 URL 2，延续画面):
  caption "求关注、求转发、求收藏"      → Caption ← 不需要 marks[3].json
```

---

## 7. 命名规则总结

| 概念 | 命名 | 位置 |
|------|------|------|
| 内容定位的动画 | **Mark** | 文档 / 用户模型 |
| 屏幕定位的文字 | **Caption** | 文档 / 用户模型 |
| 判断是否 Mark | `isMarkType(type)` | `html-composer.mjs` |
| Mark 类型集合 | `MARK_TYPES` | `html-composer.mjs` |
| 查找 mark 坐标 | `resolveMark(step, marks)` | `html-composer.mjs` |
| 提取 mark key | `getMarkKey(step)` | `html-composer.mjs` |
| Caption 样式生成 | `captionStyle(step, w, h)` | `html-composer.mjs` |
| CSS 浮层（所有浮于背景之上的元素） | `.overlay` (CSS class) | HTML/CSS |
| Caption 的 CSS | `.caption` (CSS class) | HTML/CSS |
| Caption 动画类型 | `caption` (anim type) | `.mjs` |
| 横竖屏值解析 | `hv(value, isLandscape)` | `html-composer.mjs` |

**原则**：
- 代码里只用正向概念 `isMarkType`，不存在 `isCaptionType` 或 `isOverlayType`
- CSS `.overlay` 仅表示"绝对定位浮层"，是视觉概念，不是分类概念
- Caption 的定位参数全部在 `.mjs` 中显式提供，没有隐藏默认值依赖

---

## 8. Caption 参数规范

### .mjs 写法

```js
{
  type: 'caption',
  text: '求关注、求转发、求收藏',   // 一行文字。含 '、' 时累积显示：
  triggerAt: 0,                    //   → 求关注 → 求关注、求转发 → 求关注、求转发、求收藏
  duration: 2.4,
  top: { h: 46, v: 50 },
  fontSize: { h: 36, v: 28 },
  color: '#ff6b35',
  align: { h: 'center', v: 'center' },
  pad: { h: 5, v: 8 },
}
```

每个样式参数可以是标量或 `{h, v}` 对象。`h` = 横屏（width > height），`v` = 竖屏。缺失方向 fallback 到另一方向。

### 参数表

| 参数 | 类型 | 说明 |
|------|------|------|
| `text` | string | 显示文字，**一行整体居中**。含 `、` 时动画自动累积（求关注 → 求关注、求转发 → …），duration 均分；不含 `、` 时单段淡入淡出 |
| `triggerAt` | number | 相对台词开始偏移（秒） |
| `duration` | number | 总持续时长（秒）。分段时均分 |
| `top` | number 或 `{h, v}` | 垂直位置（视口百分比） |
| `fontSize` | number 或 `{h, v}` | 字号（px） |
| `color` | string 或 `{h, v}` | 文字颜色 |
| `align` | string 或 `{h, v}` | `center` / `left` / `right` |
| `pad` | number 或 `{h, v}` | 水平边距百分比 |

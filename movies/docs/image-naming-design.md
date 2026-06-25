# 图片匹配规则设计

## 问题

当前 `scanOrientationImages` 只认识两种文件：

1. `{base}{suffix}.png` — 基准帧（必需）
2. `{base}{suffix}_marked_N.png` — 标注帧（可选）

这只适用于"单张截图 + OCR 标注"这一种工作流。截图工具自动递增命名（`opencode_3_h.png`）、第三方工具、或其他命名风格都匹配不上。

## 设计原则

不关心图片从哪来、谁生成的。只定义两点：

1. **横竖屏区分** — 文件名包含 `_h` = 横屏，包含 `_v` = 竖屏
2. **排序与分组** — 按方向标记后的"净名"排序，`_marked` 文件与所属基准帧归为一组

## 详细规则

### 输入

```javascript
const image = 'movies/screenshot/p2/opencode';
```

`baseName = basename(image)` = `opencode`

### 步骤

#### 1. 筛选

扫描 `image` 所在目录的全部 `.png` 文件，保留：

- `basename` 以 `{baseName}` 开头
- 包含方向标记 `_h`（横屏）或 `_v`（竖屏）

方向标记由 preset 的 `suffix` 定义（当前值：`_h`、`_v`）。

#### 2. 计算"净名"（strip orientation suffix）

从文件名中去掉 `_h` / `_v` 子串，得到排序/分组用的净名。

```
WorkBuddy_h.png            → 净名 "WorkBuddy.png"
WorkBuddy_h_marked_1.png   → 净名 "WorkBuddy_marked_1.png"
WorkBuddy_2_h.png          → 净名 "WorkBuddy_2.png"
WorkBuddy_2_marked_1.png   → 净名 "WorkBuddy_2_marked_1.png"
WorkBuddy_2_marked_2.png   → 净名 "WorkBuddy_2_marked_2.png"
WorkBuddy_h_21.png         → 净名 "WorkBuddy_21.png"
```

`_h` 和 `_v` 在文件名中出现的位置不限，全部被忽略：
- `WorkBuddy_2_h.png` 和 `WorkBuddy_h_2.png` 的净名都是 `WorkBuddy_2.png`

#### 3. 分组

- 如果净名包含 `_marked_`，它属于对应的**基准帧**（净名去掉 `_marked_N` 后缀）
- 否则它是一个独立的**基准帧**

```
WorkBuddy.png              → 基准帧 A
WorkBuddy_marked_1.png     → 附加到 A
WorkBuddy_2.png            → 基准帧 B
WorkBuddy_2_marked_1.png   → 附加到 B
WorkBuddy_2_marked_2.png   → 附加到 B
WorkBuddy_21.png           → 基准帧 C
```

#### 4. 排序

**组间排序**：按基准帧的净名做自然排序（natural sort）。

```
A: "WorkBuddy.png"
B: "WorkBuddy_2.png"
C: "WorkBuddy_21.png"
```

自然排序结果：A < B < C（`_2` < `_21` 按数值比较）。

**组内排序**：基准帧在前，`_marked` 文件按编号升序排列。

#### 5. 展平为帧序列

```
Group A:    WorkBuddy_h.png            → Frame 1
            WorkBuddy_h_marked_1.png   → Frame 2
Group B:    WorkBuddy_2_h.png          → Frame 3
            WorkBuddy_2_marked_1.png   → Frame 4
            WorkBuddy_2_marked_2.png   → Frame 5
Group C:    WorkBuddy_h_21.png         → Frame 6
```

## 实现思路

```javascript
function stripOrientation(name, suffixes) {
  let s = name
  for (const sfx of suffixes) {
    s = s.replaceAll(sfx, '')
  }
  return s
}

function isMarked(netName) {
  return /_marked_\d+\.png$/.test(netName)
}

function getMarkedNumber(netName) {
  const m = netName.match(/_marked_(\d+)\.png$/)
  return m ? parseInt(m[1], 10) : 0
}

function scanOrientationImages(basePath, suffix) {
  const dirPath = dirname(basePath)
  const baseName = basename(basePath)

  let allFiles
  try { allFiles = readdirSync(dirPath).filter(f => f.endsWith('.png')) }
  catch { return [] }

  // 筛选：以 baseName 开头，包含方向标记
  const matched = allFiles.filter(f =>
    f.startsWith(baseName) && f.includes(suffix)
  )

  // 分组
  const groups = new Map()  // netBaseName → { baseFile, markedFiles[] }
  for (const f of matched) {
    const net = stripOrientation(f, [suffix])
    if (isMarked(net)) {
      const groupKey = net.replace(/_marked_\d+\.png$/, '.png')
      if (!groups.has(groupKey)) groups.set(groupKey, { baseFile: null, markedFiles: [] })
      groups.get(groupKey).markedFiles.push(f)
    } else {
      const groupKey = net
      if (!groups.has(groupKey)) groups.set(groupKey, { baseFile: null, markedFiles: [] })
      groups.get(groupKey).baseFile = f
    }
  }

  // 组间排序（按净名自然排序），组内展平
  const sortedKeys = [...groups.keys()].sort((a, b) => naturalCompare(a, b))
  const result = []
  for (const key of sortedKeys) {
    const g = groups.get(key)
    if (g.baseFile) result.push(join(dirPath, g.baseFile))
    g.markedFiles
      .sort((a, b) => getMarkedNumber(stripOrientation(a, [suffix])) - getMarkedNumber(stripOrientation(b, [suffix])))
      .forEach(f => result.push(join(dirPath, f)))
  }

  return result
}
```

## 向后兼容

所有现有脚本无需修改——新规则是旧规则的超集。

| 脚本 | `const image` | 旧规则 | 新规则 |
|------|--------------|--------|--------|
| p1/m2.mjs | `WorkBuddy` | `WorkBuddy_h.png` + `*_marked_*` | 同上（组合并展开后结果一致） |
| p2/m2.mjs | `opencode` | ❌ 找不到 | ✅ `opencode_3_h` ~ `opencode_6_h` 全部匹配 |

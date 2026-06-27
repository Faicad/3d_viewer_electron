# Script Config & Animation Design

## 1. 背景

当前每组台词行与图片严格一一对应，所有图片均按静态方式生成视频。缺少两个能力：

- **动画效果**：图片在视频中可做缩放、平移等动态效果（如 zoom-in）
- **复用图片**：某行台词可以沿用上一张图片，无需独立截图

## 2. 配置方案

在脚本文件（如 `e1/m0.mjs`）中新增可选的 `config` 数组，长度与 `subtitle` 行数一致。

```js
const subtitle = `
第一行台词
第二行台词
`;

const image = 'movies/screenshot/xxx';

const config = [
  {},                                   // 第一行：无动画，独立图片
  { animation: 'zoom', pre_image: true } // 第二行：zoom 动画，沿用上一张图片
];
```

### 2.1 config 字段说明

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `animation` | `string \| undefined` | 无 | 图片动画类型，当前仅支持 `'zoom'` |
| `pre_image` | `boolean \| undefined` | `false` | 为 `true` 时，此行不使用独立图片，沿用上一张图片 |

- `config` 为可选，若脚本中未定义视为 `[]`
- 若某行在 `config` 中无对应项（数组长度不足），视为 `{}`

### 2.2 zoom 动画效果

- 起始：图片以原始大小（填满目标尺寸后保持宽高比，居中）显示
- 每秒放大 3%（即 scale 从 1.0 开始，每秒 +0.03）
- 到达该行持续时间后结束
- 实现通过 ffmpeg `zoompan` filter

## 3. 图片匹配规则

引入 `pre_image` 后，实际需要的独立图片数量可能少于台词行数。

### 3.1 有效图片计算

```ts
function countEffectiveImages(config, totalLines) {
  let count = 0;
  for (let i = 0; i < totalLines; i++) {
    if (!config[i]?.pre_image) count++;
  }
  return count;
}
```

### 3.2 校验规则

原逻辑：
```
images.length === segments.length
```

改为：
```
const effectiveLines = segments.filter((_, i) => !config[i]?.pre_image).length;
images.length === effectiveLines
```

## 4. buildImageVideo 改造

### 4.1 参数

当前签名：
```
buildImageVideo(imagePaths, imageDurations, outputPath, targetW, targetH, fps, prevFrameImage)
```

新增参数：
```
buildImageVideo(imagePaths, imageDurations, outputPath, targetW, targetH, fps, prevFrameImage, config)
```

- `config` — 按行索引的配置数组

### 4.2 逐帧映射

构建一个 `lineImageMap`，将每行台词映射到对应的图片索引及动画配置：

```ts
type LineConfig = {
  imageIndex: number    // 指向 imagePaths 中的索引
  animation?: string
}
```

遍历 segments，根据 `config[i]?.pre_image` 决定是否递增图片索引。

### 4.3 输出结构

不再直接按 `imagePaths` 数组顺序输出每张图片一段，而是按台词行输出：

```
for i = 0..n-1:
  - 第 i 行对应的图片（由 lineImageMap 决定）
  - 持续 imageDurations[i] 秒
  - 若 config[i].animation === 'zoom'，应用 zoompan（每帧 scale * (1 + 0.03/fps)）
  - 否则为静态显示（现有逻辑）
```

### 4.4 zoom 实现 (ffmpeg filter)

```ffmpeg
zoompan=z='min(zoom+0.03/25, 2)':d=1:s=1920x1080:fps=25
```

或者更精确按帧计算：

```
zoompan=z='if(eq(on,1),1,min(zoom+0.03/25,2))':d=帧数:s=宽x高:fps=25
```

每帧 zoom 值增加 `0.03/fps`，上限设为 2（避免放大过头）。`d=1` 让 zoompan 只输出一帧，然后靠 `-t` 控制时长。

## 5. 实现步骤

1. `parseScriptConfig(scriptPath)` — 读取并解析 `const config`，返回数组或默认 `[]`
2. 在 `generateImageVideo` 中，校验图片数量时使用 `countEffectiveImages`
3. 构建 `lineImageMap`，将 `imagePaths` 展平成按行索引的映射
4. 修改 `buildImageVideo` 签名，接受 `config`；在 ffmpeg filter 中判断每一帧是否应用 zoompan
5. 维护 zoom 状态：zoom 初始值 1.0，连续多行 pre_image 可让 zoom 持续递增

## 6. 向后兼容

- 没有 `config` 的旧脚本：`config` 默认 `[]`，`config[i]?.pre_image` 均为 `false`，`effectiveLines === segments.length`，行为完全不变
- 没有 `config` 时，`buildImageVideo` 传入 `[]`，所有行均走静态分支

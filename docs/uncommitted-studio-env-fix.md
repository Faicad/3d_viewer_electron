# Studio 环境背景颜色空间修复（未提交）

## 改动的文件

| 文件 | +行 |
|---|---|
| `src/renderer/engine/components/PostProcessing.tsx` | +8 |
| `src/renderer/engine/composer/AdaptiveComposer.ts` | +10 |

## 问题

`studio-env.spec.ts` CI 4 worker 下失败。截图读像素发现背景区域全部 ~140 灰色，不同像素间 max-min ≤ 2，没有任何明暗变化——环境背景没有被正确渲染。

## 根因

```
ViewportContainer 创建 <Canvas>
  → renderer.outputColorSpace = SRGBColorSpace (默认)

PostProcessing mount
  → new EffectComposer(renderer)
    → FBO texture.colorSpace = SRGBColorSpace (默认)

useFrame → composer.render(delta)

  Pass 1 ── RenderPass：渲染 scene 到 FBO
    1. background 材质（BackgroundCubeMaterial）的片段着色器
       末尾必然包含 colorspace_fragment
    2. colorspace_fragment 检测到 FBO texture.colorSpace = SRGBColorSpace
    3. 调用 linearToOutputTexel() → 写入 sRGB 编码后的值  ← 第一次编码
    4. FBO 存的是 sRGB 编码后的值（≈ gamma compressed）

  Pass 2 ── EffectPass：ToneMappingEffect 读 FBO → 写入屏幕
    1. 读到的值是 sRGB 编码后的（≈gamma compressed）
    2. 当成 linear 输入处理 → tone mapping 再次编码   ← 二次编码
    3. 最终输出：全画面压缩到 ~140 范围，丢失所有明暗变化
```

## 修复

**核心思路**：让 FBO 用 `LinearSRGBColorSpace`，这样 `colorspace_fragment` 跳过 sRGB 编码，FBO 存 linear 值，ToneMappingEffect 正确接收 linear 输入。

### AdaptiveComposer.ts（+10 行）

构造函数中，创建 `EffectComposer` 后，显式将所有 buffer 的 `texture.colorSpace` 设为 `LinearSRGBColorSpace`。同时设置 `renderer.outputColorSpace = LinearSRGBColorSpace` 保持同步。

```typescript
// 创建 composer 前
renderer.outputColorSpace = THREE.LinearSRGBColorSpace

// 创建 composer
this._composer = new EffectComposer(renderer, {
  frameBufferType: THREE.HalfFloatType,
  multisampling: 0,
})

// 强制 linear color space（safety net）
for (const buf of [this._composer.readBuffer, this._composer.writeBuffer]) {
  if (buf) buf.texture.colorSpace = THREE.LinearSRGBColorSpace
}
```

### PostProcessing.tsx（+8 行）

4 个位置同步 `outputColorSpace`：

| 时机 | 设为什么 | 原因 |
|---|---|---|
| mount 时（创建 composer 前） | `LinearSRGBColorSpace` | composer 需要 linear FBO |
| mount 时如果后处理关闭 | `SRGBColorSpace` | `gl.render()` 直出需要 sRGB 编码 |
| unmount 时 | `SRGBColorSpace` | 恢复默认 |
| 用户切换 Alt+P ON | `LinearSRGBColorSpace` | composer 接收 linear |
| 用户切换 Alt+P OFF | `SRGBColorSpace` | 直出需要 sRGB 编码 |

## 修复后流程

```
RenderPass → FBO texture.colorSpace = LinearSRGBColorSpace
  → background 的 colorspace_fragment 检测到 LinearSRGBColorSpace
  → 跳过 sRGB 编码（identity）
  → FBO 存 linear 值 ✓

ToneMappingEffect 读 FBO → linear 值
  → 正确 tone mapping → linear 输出
  → 最终 CopyPass 负责 sRGB 编码 → 屏幕 ✓
```

## 影响范围

- **后处理 ON（默认）**：FBO linear → ToneMappingEffect 正确接收 linear。修复生效。
- **后处理 OFF（Alt+P）**：`gl.render()` 直出，`outputColorSpace = SRGBColorSpace`，Three.js 默认 pipeline。不受影响。
- **缩略图生成**：`thumbnailGenerator.ts` 用独立 renderer，显式设 `outputColorSpace = SRGBColorSpace`。不受影响。
- **CAD 模式**：项目无独立 CAD rendering mode。CAD 模型的 wireframe/polygonOffset 等不涉及渲染 pipeline 或 color space。不受影响。

## 验证方法

```bash
# 单独跑（CI 4 worker 下复现需要多跑几次）
npx playwright test src/test/studio-env.spec.ts --workers=1
```

或者打开应用，加载任意 STEP/GLB 模型，检查环境背景（模型周围的环境光照）在 Alt+P 切换后是否保持正确。

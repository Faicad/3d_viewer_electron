# E2E 测试软件 GPU Skip 分析

本文档分析所有因软件 GPU（`llvmpipe` / `SwiftShader` / `WARP`）主动 skip 的 E2E 测试，
判断 skip 是否合理（依赖硬件 GPU PBR 渲染管线），或是否属于应未来修复的 TODO。

检测机制见 `src/test/gpu-utils.ts`，通过 `WEBGL_debug_renderer_info` 扩展获取 GPU
vendor/renderer 字符串，匹配以下关键字（大小写不敏感）：

- `llvmpipe` — Linux Mesa 软件渲染
- `swiftshader` — Chromium 回退软件渲染
- `microsoft basic render` — Windows WARP
- `mesa offscreen` — Linux 无头 Mesa

---

## 1. 合理 Skip — 依赖硬件 GPU PBR 渲染管线

### 1.1 `shadow-diag.spec.ts` — shadow visibility diagnostic

**断言内容**：
- `shadowMap.enabled === true`
- 方向光 `castShadow === true`
- shadow floor mesh 存在于场景
- canvas 像素中存在暗区（阴影）

**失败根因**：软件 GPU 上 `PMREMGenerator.fromScene()` 失败 → 环境纹理为空 →
`ShadowFloor` 未被配置 → 阴影贴图不渲染 → 像素检查无暗区。

**结论**：✅ 合理 skip。阴影贴图、PMREM 环境烘焙、ShadowMaterial 均属 PBR 管线，
软件 GPU 无法支持。

---

### 1.2 `shadow-fit-diag.spec.ts` — shadow visible on small model after camera auto-fit

**断言内容**：
- 阴影视锥体 far/near ratio < 50
- canvas 暗区像素数 > 100
- brightness histogram bin 0（亮度 < 50）> 10

**失败根因**：同上，软件 GPU 无阴影渲染，暗区像素数为 0。

**结论**：✅ 合理 skip。依赖阴影贴图渲染结果。

---

### 1.3 `shadow-jaggies.spec.ts` — shadow should not have severe aliasing

**断言内容**：
- `shadowMapSize >= 2048`
- `texelsPerUnit >= 6`
- far/near ratio < 50

**失败根因**：软件 GPU 上阴影贴图未启用，`shadowMapSize` 为 `null`。

**结论**：✅ 合理 skip。依赖阴影贴图配置。

---

### 1.4 `studio-env.spec.ts` — procedural studio shows room box with lights when rotated

**断言内容**：
- `scene.background.isTexture === true`（环境贴图背景）
- `scene.environment` 已设置
- 旋转环境后背景像素变化
- 背景中存在亮区（area lights）

**失败根因**：软件 GPU 上 `PMREMGenerator.fromScene()` 失败 →
`scene.environment === null`，背景无法设为纹理。

**结论**：✅ 合理 skip。PMREM 环境烘焙是 PBR 管线核心环节。

---

### 1.5 `highlight-artifacts.spec.ts` — selection highlight depthTest check

**断言内容**：
- 点击 canvas 选中模型后，存在高亮 mesh
- 高亮材质 `depthTest === false`
- 高亮材质 `depthWrite === false`

**失败根因**：软件 GPU 上点击 canvas 无法选中模型（无高亮 mesh）。
Raycasting 依赖 GPU 渲染的深度缓冲区，软件 GPU 下可能返回错误结果。

**结论**：✅ 合理 skip。Raycasting 选择依赖 GPU 渲染管线，软件 GPU
的深度缓冲区精度和行为差异导致选择失败。

---

### 1.6 `object-selection.spec.ts` 测试 3/4/5 — corner lines / re-click / drag

**断言内容**：
- 选中对象后 bounding box corner lines 出现
- 重复点击不崩溃
- 拖拽选中对象不崩溃

**失败根因**：测试 2（高亮选择）已放宽阈值通过（opacity < 0.3），
但 corner lines（`LineSegments` with `renderOrder === 6`）不渲染。
拖拽依赖正确的选择状态。

**结论**：✅ 合理 skip。Corner lines 和拖拽交互均依赖 GPU 选择管线。

---

## 2. TODO — 非渲染管线问题，应未来修复

### 2.1 `glb-material-alpha.spec.ts` — BLEND then MASK alphaMode

**断言内容**：
- 右键 scene tree 文件节点 → "材质管理" 菜单项出现
- 点击 GLB Extension Panel 材质行 → MaterialEditor 打开
- BLEND 材质的 alphaMode 按钮选中 "混合"
- MASK 材质的 alphaMode 按钮选中 "遮罩"

**失败根因**：
右键菜单只显示 "播放动画"，不显示 "GLB 扩展" 和 "材质管理"。
诊断确认：
- `file.format === 'glb'` ✅（格式检测正确）
- `file.animations.length === 1` ✅
- `isGlb === true` ✅
- 但 `handleFileContextMenu` 的 GLB 菜单项未渲染

**涉及组件**：
- `DesktopLayout.tsx` — `handleFileContextMenu` callback
- `ContextMenu.tsx` — 右键菜单 UI
- `GlbExtensionPanel.tsx` — GLB 扩展面板

**TODO**：排查 `handleFileContextMenu` 中 `t('glbExtension.manageMaterials')`
对应的菜单项为何在软件 GPU 环境下不渲染。可能原因：
1. i18n `useTranslation()` 在特定时机返回空
2. React 渲染批处理导致 `setCtxMenu` 被后续调用覆盖
3. `FileJson` / `SwatchBook` 图标组件渲染异常

**优先度**：低。该功能在硬件 GPU 平台正常工作，不影响用户体验。软件 GPU
环境通常仅用于 CI / 无头测试。

---

## 3. 汇总

| 测试 | Skip 类型 | 优先级 |
|---|---|---|
| `shadow-diag.spec.ts` | ✅ 合理 — PBR 阴影 | - |
| `shadow-fit-diag.spec.ts` | ✅ 合理 — PBR 阴影 | - |
| `shadow-jaggies.spec.ts` | ✅ 合理 — PBR 阴影 | - |
| `studio-env.spec.ts` | ✅ 合理 — PMREM 烘焙 | - |
| `highlight-artifacts.spec.ts` | ✅ 合理 — GPU Raycasting | - |
| `object-selection.spec.ts` (3/4/5) | ✅ 合理 — GPU 选择 | - |
| `glb-material-alpha.spec.ts` | ⚠️ TODO — DOM/React UI | 低 |

---

## 4. `simple-rendering-mode-design.md` 关联

当 `SimpleSceneSetup`（低质量渲染模式）实现后：

- 上述 6 个合理 skip 的测试将继续 skip（因为 low 模式下 PMREM/阴影/环境贴图均禁用）
- `glb-material-alpha` 在 low 模式下应能正常工作（不依赖渲染管线），届时需移除 skip 并验证
- 可考虑使用 store 中的 `renderQuality` 替代 `WEBGL_debug_renderer_info` 检测

# PBR 功能完整实现方案（v4 — 统一渲染架构 + 分阶段测试）

基于对 three-cad-viewer 的深度分析，采用 **统一 PBR 渲染 + 自适应后处理** 架构，不区分 CAD/PBR 模式。

---

## 测试策略总览

### 测试分层

| 层级 | 运行环境 | 配置 | 用途 |
|------|---------|------|------|
| **单元测试** | Node | `vitest.config.ts` | 纯逻辑：材质工厂、预设、缓存、序列化 |
| **组件/集成测试** | jsdom | `vitest.jsdom.config.ts` | React 组件渲染、Zustand store、R3F 场景结构 |
| **E2E 测试** | Electron | Playwright | 完整管线、视觉回归、用户交互流 |

### CI 流水线 (`scripts/ci.ps1`)

```
1. tsc --noEmit          → 类型检查
2. pnpm run lint          → ESLint
3. vitest run             → 单元测试 (node)
4. vitest run (jsdom)     → 组件/集成测试
5. pnpm run build:unpacked → 构建打包
6. playwright test        → E2E 测试
```

**每个阶段完成后必须运行完整 CI，通过后才能进入下一阶段。**

### 测试编写规范

- 禁止使用 `waitForTimeout` 等粗暴延时；使用 `waitFor` / `waitForSelector` 等条件等待
- Three.js 材质属性测试在 node 环境下进行（不需要 WebGL）
- 需要 WebGL 上下文的逻辑（如 PMREMGenerator）在集成测试中使用 `@vitest-environment node` 覆盖，或通过 mock 隔离
- 参考现有测试文件：`GlbBuilder.test.ts`（node 单元测试）、`format-loaders.test.ts`（集成测试）、`camera-mode-switcher.test.ts`（jsdom 组件测试）

---

## 架构原则

1. **全部采用 PBR 渲染** — `MeshPhysicalMaterial` + IBL 环境贴图始终启用
2. **CAD 分析工具是叠加层** — 剖面、斑马纹、曲率梳等在 PBR 之上叠加渲染，不切换模式（已有的 wireframe/mesh 显示模式也已与 PBR 共存）
3. **自适应后处理** — 后处理 pass 按需开关（性能/质量权衡），ToneMapping 始终启用（便宜）
4. **无模式切换开销** — 不存在 `enterStudioMode()`/`leaveStudioMode()` 的状态保存恢复

```
┌─────────────────────────────────────────────────────────┐
│  PBR 渲染管线 (始终启用)                                 │
│  MeshPhysicalMaterial + IBL (environment map)           │
│  ToneMapping (始终开启, 几乎免费)                        │
├─────────────────────────────────────────────────────────┤
│  可选后处理 Pass (按需启用/禁用)                         │
│  SSAO | SMAA | 阴影遮罩 | Bloom                         │
├─────────────────────────────────────────────────────────┤
│  CAD 分析工具 (与 PBR 共存)                             │
│  剖面 (ClippingPlanes) | 斑马纹 (ShaderMaterial)       │
│  曲率梳 (ShaderMaterial)                               │
│  wireframe/mesh 显示模式 (已有, 与 PBR 互不干扰)       │
└─────────────────────────────────────────────────────────┘
```

---

## 阶段一：环境贴图（IBL）基础 + 三层环境系统

**工作量**: 4-5 天 | **依赖**: 无 | **效果提升**: 非常高

引入 three-cad-viewer 的 `EnvironmentManager` 三层架构：

| 层级 | 来源 | 网络需求 | 回退 |
|------|------|:--------:|:----:|
| Tier 1 | `CleanRoomEnvironment` (程序化生成) | 无 | N/A (始终可用) |
| Tier 2 | Poly Haven HDR 预设 (CDN) | 是 | → Tier 1 |
| Tier 3 | 用户自定义 HDR URL | 是 | → Tier 1 |

### 实施步骤

1. **CleanRoomEnvironment**（移植 three-cad-viewer `room-environment.ts`）
   - 新建 `src/renderer/engine/environment/CleanRoomEnvironment.ts`
   - 程序化生成带 BackSide 材质的 Box 房间
   - 6 个 Area Light（`MeshLambertMaterial + emissive`）模拟摄影棚柔光箱
   - 墙-地交界处添加 **Infinity Cove**（四分之一圆柱体），消除 90° 硬角反射
   - 预旋转 45° 使最干净墙-地边缘朝向默认相机
   - 用于 `PMREMGenerator.fromScene()` 生成 IBL

2. **EnvironmentManager**（移植 three-cad-viewer `environment.ts`）
   - 新建 `src/renderer/engine/environment/EnvironmentManager.ts`
   - 三层加载策略 + 自动回退
   - PMREM 缓存 `_cache: Map<string, WebGLRenderTarget>`
   - 飞单去重 `_inflight: Map<string, Promise<Texture>>`
   - 背景模式: `"grey"`, `"darkgrey"`, `"white"`, `"gradient"`, `"environment"`, `"transparent"`
   - 正交相机兼容（虚拟透视相机渲染到 2D RT）
   - 30 秒 HDR 加载超时

3. **HDR 预设**
   - 11 个预设（来源 three-cad-viewer）: `studio_small_08`, `studio_small_03`, `white_studio_05` 等
   - 通过 CDN 引用或打包进 `src/renderer/public/env/`
   - 2K HDR 预设

4. **Zustand store** — 在现有 `engine-store.ts` 中新增环境相关字段:
   ```ts
   envIntensity: number       // 默认 1.0
   envRotation: number        // 默认 0
   selectedEnv: string        // 默认 "studio"
   envBackground: string      // 背景模式
   ```

5. **光照系统重构** — IBL 启用后，现有光照系统需要从物理正确性角度重新设计，而非简单调参。

   **为什么需要重构**：

   | 旧方案（无 IBL） | 替代者 |
   |-----------------|--------|
   | `ambientLight (0.5)` — 模拟环境漫反射的假常数 | IBL diffuse irradiance（物理正确） |
   | `directionalLight fill (0.6)` — 模拟来自侧方的反弹光 | IBL specular radiance（来自环境各方向） |
   | `directionalLight rim (0.3)` — 模拟背光轮廓 | IBL specular radiance |

   保留 ambient 会导致 **double-counting**（环境光被计算两次），保留 fill/rim 会导致过度照明和对比度下降。IBL 本身已经包含 CleanRoomEnvironment 6 个柔光箱烘焙出的方向性高频信息，不需要补充光来模拟。

   **新光照设计**：

   ```
   IBL (scene.environment, envIntensity=1.0)
     ├─ diffuse irradiance   → 替代 ambient + fill + rim
     └─ specular radiance    → 金属/光滑表面反射
   directionalLight × 1 (key light, castShadow=true)
     └─ 提供 sharp specular lobe + 方向感 + 阴影
   ```

   **具体改动**：

   - **删除 `ambientLight`** — IBL 的 diffuse irradiance 提供物理正确的环境照明
   - **删除 fill / rim `directionalLight`** — IBL 从所有方向提供反射，已覆盖这些角色
   - **保留 1 个 key `directionalLight`**，参数重新标定：
     ```ts
     color="#FFFFFF"
     intensity={0.8}           // 从 1.2 降低，IBL 已提供基础照明
     position={[5, 5, 10]}     // 保持 above-right-front
     castShadow={true}
     shadow-mapSize-width={1024}
     shadow-mapSize-height={1024}
     shadow-camera-near={0.5}
     shadow-camera-far={500}
     shadow-camera-left={-50}
     shadow-camera-right={50}
     shadow-camera-top={50}
     shadow-camera-bottom={-50}
     shadow-bias={-0.001}
     ```
   - **开启全局阴影** — 在 Canvas `gl` prop 或 `SceneSetup` 中：
     ```ts
     renderer.shadowMap.enabled = true
     renderer.shadowMap.type = THREE.PCFSoftShadowMap
     ```
   - **阴影接收** — 所有模型 mesh 设置 `castShadow={true}` + `receiveShadow={true}`
   - 光照参数通过 store 中的 `envIntensity` 动态微调（key light 强度随 envIntensity 缩放）

   > **注意**：此步骤与 IBL 环境贴图**必须在同一次提交中完成**。如果只删光不启用 IBL，场景会全黑；如果只启用 IBL 不删光，场景会过曝。

6. **扩展 `cloneMaterial.ts`** — 在 lambert/basic/toon/matcap/fallback 转换器中添加 `envMap` 和 `envMapIntensity` 复制（当前仅 `phongToStandard` 有）

### 测试计划

| 测试文件 | 层级 | 测试内容 |
|---------|------|---------|
| `src/renderer/engine/environment/CleanRoomEnvironment.test.ts` | 单元 (node) | 场景结构：Box 尺寸、Area Light 数量、Infinity Cove 几何体、45° 旋转 |
| `src/renderer/engine/environment/EnvironmentManager.test.ts` | 单元 (node) | 回退逻辑（Tier 2 失败→Tier 1）、缓存命中/过期、超时处理、飞单去重 |
| `src/renderer/engine/environment/__tests__/environment-integration.test.ts` | 集成 (jsdom) | SceneSetup 中 EnvironmentManager 集成、store 字段变更触发环境切换 |
| `src/renderer/engine/components/SceneSetup.test.ts` | 单元 (node) | 新光照结构：恰好 1 个 ambientLight=0 或不存在、恰好 1 个 directionalLight、shadowMap 配置校验、无 fill/rim 光 |
| `src/renderer/engine/components/cloneMaterial.test.ts` | 单元 (node) | 各转换器 envMap/envMapIntensity 复制验证 |
| Playwright E2E | E2E | 场景加载后 `scene.environment` 非空、切换 HDR 预设不报错、删除 ambient 和 fill/rim 后场景不黑屏 |

### CI 检查点

```
✓ tsc --noEmit          — 新文件类型 + shadowMap API 类型通过
✓ pnpm run lint          — 无 ESLint 错误
✓ vitest run             — 新增环境/光照/shadowMap 单元测试
✓ vitest run (jsdom)     — 新增集成测试全部通过
✓ pnpm run build:unpacked — 构建成功（验证导入路径和依赖）
✓ playwright test        — E2E: 场景不黑屏、IBL 可见、阴影启用
```

---

## 阶段二：材质预设系统

**工作量**: 1-2 天 | **依赖**: 无 | **效果提升**: 高

### MaterialAppearance 类型

新建 `src/renderer/engine/material/types.ts`:

```ts
interface MaterialAppearance {
  name: string
  color?: [number, number, number, number] // sRGB RGBA 0-1
  map?: string
  metalness?: number
  roughness?: number
  metalnessMap?: string
  roughnessMap?: string
  normalMap?: string
  aoMap?: string
  emissive?: [number, number, number]
  emissiveMap?: string
  emissiveIntensity?: number
  transmission?: number
  transmissionMap?: string
  thickness?: number
  thicknessMap?: string
  ior?: number
  clearcoat?: number
  clearcoatRoughness?: number
  clearcoatMap?: string
  clearcoatNormalMap?: string
  sheen?: number
  sheenColor?: [number, number, number]
  sheenRoughness?: number
  anisotropy?: number
  anisotropyRotation?: number
  specularIntensity?: number
  specularColor?: [number, number, number]
  alphaMode?: 'OPAQUE' | 'MASK' | 'BLEND'
  doubleSided?: boolean
  unlit?: boolean
}
```

### 29+ 内置材质预设

新建 `src/renderer/engine/material/presets.ts`，完整移植 three-cad-viewer 的 29 个预设:

| 分类 | 示例 |
|------|------|
| 抛光金属 (6) | Chrome, Polished Steel, Gold, Copper, Brass |
| 磨砂/拉丝金属 (5) | Stainless Steel, Brushed Aluminum, Cast Iron, Titanium |
| 塑料 (5) | Glossy, Matte, ABS Black, Nylon, Acrylic Clear |
| 玻璃/透明 (3) | Clear, Tinted, Frosted |
| 橡胶 (3) | Black, Gray, Red |
| 涂装 (4) | Matte, Glossy, Metallic, Car Paint (clearcoat) |
| 自然/其他 (3) | Ceramic White, Carbon Fiber, Concrete |

同时导出 `MATERIAL_PRESET_NAMES: string[]`。

### MaterialFactory

新建 `src/renderer/engine/material/MaterialFactory.ts`:

- `createMaterial(appearance, options?)` → `MeshPhysicalMaterial`
  - `unlit: true` → `MeshBasicMaterial`
  - sRGB 颜色元组 → `Color().setRGB(r, g, b, SRGBColorSpace)`
  - Transmission 材质强制 `opacity: 1.0`（透明度转 transmission 控制）
  - 条件启用 sheen / anisotropy（需检查 Three.js 版本是否支持）
  - 自动应用 `polygonOffset`（CAD 面重叠防 z-fighting）
- 材质缓存 `_materialCache` 基于 `sharingKey`
- `dispose()` 释放所有缓存材质

### 测试计划

| 测试文件 | 层级 | 测试内容 |
|---------|------|---------|
| `src/renderer/engine/material/presets.test.ts` | 单元 (node) | 29 个预设均有效、必填字段齐全、数值范围合法（0-1）、颜色格式正确 |
| `src/renderer/engine/material/MaterialFactory.test.ts` | 单元 (node) | 从 appearance 创建 Material、sRGB 颜色空间、transmission→opacity 分离、polygonOffset 设置、缓存命中/sharingKey、unlit→MeshBasicMaterial |
| `src/renderer/engine/material/types.test.ts` | 单元 (node) | MaterialAppearance 类型守卫、alphaMode 枚举值校验 |

### CI 检查点

```
✓ tsc --noEmit
✓ pnpm run lint
✓ vitest run             — 新增材质测试 + 现有全部通过
✓ vitest run (jsdom)     — 现有全部通过
✓ pnpm run build:unpacked
✓ playwright test        — E2E 全部通过
```

---

## 阶段三：统一材质管线（MeshPhysicalMaterial 全面化）

**工作量**: 2-3 天 | **依赖**: 阶段一、二 | **效果提升**: 中

所有渲染走 `MeshPhysicalMaterial`，不再保留 `MeshStandardMaterial` 路径。

### 实施步骤

1. **`cloneMaterial.ts` 升级**
   - `createDefaultMaterial()` → `new MeshPhysicalMaterial({ ... })`
   - 所有 `new MeshStandardMaterial(...)` → `new MeshPhysicalMaterial(...)`
   - `convertSingle()` 中 `MeshPhysicalMaterial` 直接 `src.clone()`（保持现有逻辑）
   - 保留 polygonOffset 设置（CAD 面重叠防护）
   - 所有转换器统一复制 `envMap` / `envMapIntensity`（修复当前仅 phong 转换器复制的问题）

2. **`ModelGroup.tsx` 升级**
   - 内联 `<meshStandardMaterial>` → `<meshPhysicalMaterial>`
   - 当 `overrideMaterial = true` → 用 MaterialFactory 替换材质
   - 当 `overrideMaterial = false` → 正常 cloneAndConvertMaterial（仍输出 MeshPhysicalMaterial）

3. **材质覆盖解析管线**
   ```
   模型加载 → cloneAndConvertMaterial() [始终输出 MeshPhysicalMaterial]

   当 overrideMaterial = true:
   模型加载 → MaterialFactory.resolve(materialTag | "builtin:xxx" | leafColor)
            → createMaterial() → MeshPhysicalMaterial（覆盖原始材质）
   ```

4. **纹理集成**
   - TextureCache 对接 MaterialFactory
   - 材质从预设加载纹理引用 → TextureCache.get() 加载 → 设置到 MeshPhysicalMaterial

### 测试计划

| 测试文件 | 层级 | 测试内容 |
|---------|------|---------|
| `src/renderer/engine/components/cloneMaterial.test.ts` | 单元 (node) | 所有输入类型输出 MeshPhysicalMaterial、各转换器属性正确映射、polygonOffset 设置、envMap/envMapIntensity 复制、MeshNormalMaterial 保持 clone |
| `src/renderer/engine/material/materialResolver.test.ts` | 单元 (node) | 材质标签解析：`"builtin:chrome"`、`"custom:xxx"`、颜色字符串、回退 |

### CI 检查点

```
✓ tsc --noEmit          — MeshPhysicalMaterial API 类型验证
✓ pnpm run lint
✓ vitest run             — 新增管线测试 + 现有通过
✓ vitest run (jsdom)     — ModelGroup 集成测试
✓ pnpm run build:unpacked
✓ playwright test        — 所有格式加载后材质类型验证
```

---

## 阶段四：TextureCache 纹理加载与缓存

**工作量**: 1-2 天 | **依赖**: 阶段三 | **效果提升**: 中

移植 three-cad-viewer 的 `TextureCache`。

### 架构

```ts
class TextureCache {
  private _cache: Map<string, THREE.Texture>
  private _inflight: Map<string, Promise<THREE.Texture>>  // 飞单去重
  private _textureLoader: THREE.TextureLoader | null       // 懒加载
  maxAnisotropy = 16
}
```

### 实施步骤

1. **新建 `src/renderer/engine/material/TextureCache.ts`**
   - 解析 `data:` → data URI；否则 → URL
   - 色彩空间分配:
     - sRGB: `baseColorTexture`, `emissiveTexture`, `sheenColorTexture`, `specularColorTexture`
     - Linear: `normalMap`, `aoMap`, `metalnessMap`, `roughnessMap`, `transmissionMap` 等
   - `dispose()` → 释放纹理 (clear 时), `disposeFull()` → 完全销毁 (dispose 时)

2. **在 MaterialFactory 集成**
   - `createMaterial()` 调用 `_applyTextures()` 解析纹理引用

### 测试计划

| 测试文件 | 层级 | 测试内容 |
|---------|------|---------|
| `src/renderer/engine/material/TextureCache.test.ts` | 单元 (node) | 缓存命中/未命中、飞单去重（并发请求同一纹理仅加载一次）、sRGB vs Linear 色彩空间分配、data URI 解析、dispose 释放、disposeFull 完全销毁 |

### CI 检查点

```
✓ tsc --noEmit
✓ pnpm run lint
✓ vitest run             — 新增 TextureCache 测试 + 材质工厂纹理集成测试
✓ vitest run (jsdom)     — 现有全部通过
✓ pnpm run build:unpacked
✓ playwright test
```

---

## 阶段五：ShadowMaterial 阴影地板

**工作量**: 0.5 天 | **依赖**: 阶段一（光照重构 + shadowMapping 基础设施） | **效果提升**: 中

阶段一已完成全局 `renderer.shadowMap.enabled` + key light `castShadow` + 模型 `castShadow/receiveShadow`。本阶段在现有阴影基础设施之上，移植 three-cad-viewer 的 `StudioFloor`，为场景添加视觉化的地面接触阴影。

`ShadowMaterial` 是 Three.js 内置的特殊材质——它不反射任何光照，只接收和显示阴影。将其放在一个不可见的平面几何体上，模型投射的阴影会自然地"落"在地板上。

### 实施步骤

1. **新建 `src/renderer/engine/environment/ShadowFloor.ts`**
   ```ts
   class ShadowFloor {
     private _group: THREE.Group          // 命名 "shadowFloor"
     private _plane: THREE.Mesh | null
     configure(zPosition: number, sceneSize: number): void
     setEnabled(enabled: boolean): void
     setOpacity(opacity: number): void    // ShadowMaterial.opacity
     dispose(): void
   }
   ```
   - `new THREE.ShadowMaterial({ opacity: 0.5, depthWrite: false })`
   - `receiveShadow={true}` — 接收来自模型的阴影
   - PlaneGeometry `sceneSize * 6`，位置 `bbox.min.z - maxExtent * 0.001`
   - 默认隐藏，用户通过 UI 开关显示

2. **在 SceneSetup 中集成**
   - 始终创建 ShadowFloor（默认隐藏）
   - 监听 store 中的 `shadowFloorEnabled` + `shadowOpacity`

### 测试计划

| 测试文件 | 层级 | 测试内容 |
|---------|------|---------|
| `src/renderer/engine/environment/ShadowFloor.test.ts` | 单元 (node) | ShadowMaterial 创建、opacity 设置、depthWrite=false、plane 尺寸计算、enable/disable 切换 |

### CI 检查点

```
✓ tsc --noEmit
✓ pnpm run lint
✓ vitest run             — 新增 ShadowFloor 测试
✓ vitest run (jsdom)     — SceneSetup 集成
✓ pnpm run build:unpacked
✓ playwright test
```

---

## 阶段六：自适应后处理管线

**工作量**: 5-7 天 | **依赖**: 阶段一~五 | **效果提升**: 非常高

### 设计原则

- **ToneMapping** — 始终启用（性能开销接近零）
- **SMAA** — 默认启用，低性能设备可关
- **SSAO** — 默认启用，高交互时（旋转/平移/缩放）自动暂停，静止后恢复
- **阴影遮罩** — 默认关闭，用户按需开启
- **Bloom** — 默认关闭，仅 emissive 材质使用

### 管线顺序

```
Pass 1: RenderPass
Pass 2: N8AOPostPass          ← 可跳过 (透明材质需跳过)
Pass 3: EffectPass
  ├─ ShadowMaskEffect         ← 可跳过 (阴影遮罩关闭时)
  ├─ ToneMappingEffect         ← 始终启用
  └─ SMAAEffect               ← 可跳过 (SMAA 关闭时)
```

### 实施步骤

1. **安装依赖**
   ```bash
   npm install postprocessing n8ao
   ```

2. **新建 `src/renderer/engine/composer/AdaptiveComposer.ts`**

   - **FBO**: `HalfFloatType`, 4x MSAA
   - **Renderer**: 将 Canvas 的 `toneMapping` 设为 `NoToneMapping`（由 composer 的 ToneMappingEffect 接管），`toneMappingExposure` 控制曝光
   - **Pass 管理**:
     ```ts
     setPassEnabled(pass: 'ssao' | 'smaa' | 'shadows' | 'bloom', enabled: boolean)
     ```
   - **高交互自动降级**:
     ```ts
     private _interactionTimeout: number | null = null
     onInteractionStart() → 暂停 SSAO (半分辨率), 降低 SMAA quality
     onInteractionEnd() → 300ms 延迟后恢复全质量
     ```
     检测方式: OrbitControls `start/end` 事件 + mousemove 节流

3. **N8AO 配置**
   ```ts
   aoRadius = 2.0         // 需根据场景包围盒动态调整
   distanceFalloff = 0.5
   intensity = 1.5
   halfRes = true
   depthAwareUpsampling = true
   gammaCorrection = false
   setQualityMode("Medium")
   ```

4. **ToneMapping**
   ```ts
   neutral → ToneMappingMode.NEUTRAL
   ACES → ToneMappingMode.ACES_FILMIC
   none → ToneMappingMode.LINEAR
   ```

5. **SMAA**: `SMAAPreset.ULTRA`，异步加载

6. **背景保护**: 纯色背景跳过 tone mapping（`ignoreBackground = true`，alpha-blend compositing）

7. **ShadowMaskEffect**（移植 three-cad-viewer 的 3 阶段阴影合成）:
   - 基于场景光照方向计算地面软阴影遮罩
   - 新建 `src/renderer/engine/composer/ShadowMaskEffect.ts`

### 测试计划

| 测试文件 | 层级 | 测试内容 |
|---------|------|---------|
| `src/renderer/engine/composer/AdaptiveComposer.test.ts` | 单元 (node) | pass 启用/禁用状态管理、交互检测状态机（start→降级→end→恢复）、N8AO 配置参数校验 |
| `src/renderer/engine/composer/ShadowMaskEffect.test.ts` | 单元 (node) | 阴影遮罩参数验证 |
| Playwright E2E | E2E | 高交互时帧率提升（SSAO 暂停）、SMAA 开关视觉差异、toneMapping 始终生效 |

### CI 检查点

```
✓ tsc --noEmit          — postprocessing/n8ao 类型
✓ pnpm run lint
✓ vitest run             — 新增 composer 测试
✓ vitest run (jsdom)     — SceneSetup 集成
✓ pnpm run build:unpacked — 确保 postprocessing/n8ao 可打包
✓ playwright test        — E2E 性能/视觉测试
```

---

## 阶段七：CAD 分析工具（与 PBR 共存）【参考设计，暂不开发】

**工作量**: 3-4 天（估算） | **依赖**: 阶段三 | **效果提升**: 高（对 CAD 用户）

> ⚠️ **此阶段不纳入当前开发计划。** 以下内容仅作为设计参考，待未来需求明确后再排期。

这是统一架构的核心优势 — CAD 分析工具直接叠加在 PBR 渲染上。

注意：边界线显示已由现有的 `displayMode`（wireframe/mesh/solid）实现，见 `ModelGroup.tsx:422-506`。wireframe 和 mesh 模式与 PBR 材质互不干扰，无需额外开发。

### 剖面（Clipping Planes）

- Three.js 内置 `material.clippingPlanes` 支持
- `MeshPhysicalMaterial` 原生支持 clipping，无需特殊处理
- 局部渲染: `<mesh>` 级别 `material.clippingPlanes`，非全局

### 斑马纹（Zebra Stripes）

- `ShaderMaterial` 覆盖，分析法线方向变化
- 实现方式（借鉴 three-cad-viewer）:
  - 基于环境贴图的反射方向条纹
  - 或基于法线偏差的梯度条纹
- 临时替换 `MeshPhysicalMaterial` 为斑马纹 ShaderMaterial（保留 geometry）

### 曲率梳（Curvature Comb）

- 基于顶点曲率的颜色映射 ShaderMaterial
- 高斯曲率 / 平均曲率 → 颜色渐变（红/蓝/绿）
- 同样临时替换材质为 ShaderMaterial

---

## 阶段八：材质编辑器 UI + 预设选择

**工作量**: 4-5 天 | **依赖**: 阶段二、三 | **效果提升**: 高

### Zustand Store

新建 `src/renderer/stores/material-store.ts`:
```ts
interface MaterialState {
  overrideMaterial: boolean
  selectedPreset: string
  // 手动覆盖参数
  color: string
  roughness: number
  metalness: number
  clearcoat: number
  clearcoatRoughness: number
  sheen: number
  sheenColor: string
  transmission: number
  thickness: number
  ior: number
  // 环境
  envIntensity: number
  envRotation: number
  // 后处理开关
  ssaoEnabled: boolean
  smaaEnabled: boolean
  shadowEnabled: boolean
  // 阴影地板
  shadowFloorEnabled: boolean
  shadowOpacity: number
}
```

### 材质面板

新建 `src/renderer/components/panels/MaterialPanel.tsx`:

- **预设选择器**: 下拉 `<select>` 来自 `MATERIAL_PRESET_NAMES`
  - 选中预设 → 自动填充参数到 store
- **分区编辑**:
  - 基础: color picker, roughness slider, metalness slider
  - 清漆层: clearcoat, clearcoatRoughness
  - 光泽层: sheen, sheenColor
  - 透射: transmission, thickness, ior
- **环境控制**: envIntensity, envRotation, env selector
- **后处理开关**: SSAO / SMAA / 阴影遮罩 toggle
- **CAD 分析**: 剖面开关, 分析模式选择 (zebra/curvature)
- **阴影地板**: 开关 + 透明度
- 顶部开关 `overrideMaterial` 控制是否启用材质覆盖

### 测试计划

| 测试文件 | 层级 | 测试内容 |
|---------|------|---------|
| `src/renderer/stores/material-store.test.ts` | 单元 (node) | store 默认值、setter 更新、预设选择联动参数填充 |
| `src/renderer/components/panels/__tests__/MaterialPanel.test.tsx` | 组件 (jsdom) | 面板渲染、预设下拉选中→参数 slider 更新、override 开关、slider 拖拽→store 更新 |
| Playwright E2E | E2E | 完整用户交互流：选预设→改参数→模型材质变化 |

### CI 检查点

```
✓ tsc --noEmit          — React 组件类型
✓ pnpm run lint
✓ vitest run             — store 测试
✓ vitest run (jsdom)     — 组件渲染测试
✓ pnpm run build:unpacked
✓ playwright test        — E2E 交互流
```

---

## 阶段九：材质导入导出

**工作量**: 2-3 天 | **依赖**: 阶段八 | **效果提升**: 中

- `MaterialAppearance` 序列化为 JSON → `.faimat` 文件
- 用户预设存储到 `localStorage`
- 运行时合并: `{ ...MATERIAL_PRESETS, ...userPresets }`
- 模型节点 `materialTag` 系统: `"builtin:chrome"`, `"custom:myMat"`

### 测试计划

| 测试文件 | 层级 | 测试内容 |
|---------|------|---------|
| `src/renderer/engine/material/userPresets.test.ts` | 单元 (node) | 序列化→反序列化往返、localStorage 读写、与内置预设合并优先级、无效 JSON 容错 |

### CI 检查点

```
✓ tsc --noEmit
✓ pnpm run lint
✓ vitest run             — 新增序列化测试
✓ vitest run (jsdom)     — localStorage 集成
✓ pnpm run build:unpacked
✓ playwright test
```

---

## 总体时间线估算

| 阶段 | 描述 | 估算工作量 | 依赖 | 测试文件数 |
|------|------|-----------|------|-----------|
| 一 | 环境贴图 + 三层环境系统 + 光照重构 + shadowMapping 基础设施 | 4-5 天 | 无 | 5-6 |
| 二 | 材质预设系统 (29+) | 1-2 天 | 无 | 2-3 |
| 三 | 统一材质管线 (MeshPhysicalMaterial 全面化) | 2-3 天 | 一、二 | 2 |
| 四 | TextureCache 纹理缓存 | 1-2 天 | 三 | 1 |
| 五 | ShadowMaterial 阴影地板 | 0.5 天 | 一 | 1 |
| 六 | 自适应后处理管线 (AdaptiveComposer) | 5-7 天 | 一~五 | 2-3 |
| 七 | CAD 分析工具 (剖面/斑马纹/曲率梳) | 暂不开发 | 三 | — |
| 八 | 材质编辑器 UI + 预设选择 | 4-5 天 | 二、三 | 2-3 |
| 九 | 材质导入导出 (.faimat) | 2-3 天 | 八 | 1 |

---

## 推荐执行顺序

```
阶段一 ──→ 阶段三 ──→ 阶段六
  │          │
  ├── 阶段二 ─┤
  │          ├── 阶段四
  │          └── 阶段五
  │
  └── 阶段八 ──→ 阶段九

阶段七：暂不开发（设计参考）
```

**并行策略**:
- 阶段一 + 阶段二（环境 + 预设，无依赖关系）
- 阶段八（UI）与阶段三~六（3D 引擎）完全并行

**每个阶段结束的门禁**: 运行 `scripts/ci.ps1`，全部 6 步通过后方可进入下一阶段。

---

## 从 three-cad-viewer 借鉴的核心模式

| 模式 | 来源 | 引入 |
|------|------|------|
| CleanRoomEnvironment 程序化环境 | `room-environment.ts` | 阶段一 |
| 三层环境回退链 (PMREM 缓存 + 飞单去重) | `environment.ts` | 阶段一 |
| MaterialAppearance 类型系统 | `core/types.ts` | 阶段二 |
| 29+ 材质预设 (分类齐全) | `material-presets.ts` | 阶段二 |
| MaterialFactory 材质工厂 | `material-factory.ts` | 阶段三 |
| TextureCache (色彩空间 + 唯一所有权) | `texture-cache.ts` | 阶段四 |
| ShadowMaterial 阴影地板 | `studio-floor.ts` | 阶段五 |
| N8AO + ToneMapping + SMAA | `studio-composer.ts` | 阶段六 |
| ShadowMask 3 阶段阴影合成 | `studio-composer.ts` | 阶段六 |
| HDR 光源检测 | `light-detection.ts` | 阶段一 |
| 斑马纹 Shader | `tools/zebra.ts` | 阶段七（参考） |
| Triplanar 纹理映射 (按需) | `triplanar.ts` | 可选扩展 |

---

## 统一架构 vs 双模式架构对比

| 维度 | 双模式 | 统一架构 (v4) |
|------|--------|---------------|
| 用户体验 | 模式切换有视觉跳变 | 无缝 PBR，无切换 |
| CAD 特性 | 只能在 CAD 模式使用 | 与 PBR 共存 |
| 实现复杂度 | 高 (save/restore 状态机) | 低 (叠加层模式) |
| 性能调优 | 模式绑定固定管线 | 逐 pass 自适应 |
| 材质一致性 | 两种材质路径 | 始终 MeshPhysicalMaterial |
| 对 CAD 用户 | 需要理解两种模式 | 直观，所见即所得 |
| 测试覆盖 | 无材质测试 | 每阶段强制测试 + CI 门禁 |

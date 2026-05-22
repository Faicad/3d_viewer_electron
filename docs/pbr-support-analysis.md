# PBR 渲染支持分析

## 核心文件

| 文件 | 作用 |
|------|------|
| `src/renderer/engine/components/cloneMaterial.ts` | 将 Phong/Lambert/Basic/Toon/Matcap 材质统一转为 `MeshStandardMaterial` |
| `src/renderer/lib/step-converter/GlbBuilder.ts` | STEP → GLB 时生成最简 `pbrMetallicRoughness` 材质 |
| `src/renderer/lib/step-converter/stepToGlb.ts` | 编排 STEP mesh 到 GLB 的转换管线 |
| `src/renderer/engine/components/ModelGroup.tsx` | 逐 mesh 应用材质、管理合并/分离几何体 |
| `src/renderer/components/viewport/ViewportContainer.tsx` | 渲染器配置（ToneMapping、色彩空间） |
| `src/renderer/engine/components/SceneSetup.tsx` | 场景光照（1 ambient + 3 directional lights） |

## 支持的 PBR 特性

### 完全支持

- **metallic / roughness** — 所有材质转换器均设置，Phong specular 亮度近似为 metalness，shininess 按 `1 - sqrt(shininess/1000)` 映射为 roughness
- **baseColor** — `color` 属性在所有转换器中复制/转发
- **ToneMapping** — `ACESFilmicToneMapping` 配置正确
- **色彩空间** — `SRGBColorSpace` 配置正确

### Pass-through 保留

(来源于 Three.js 原生加载器的材质)

| 特性 | 保留范围 |
|------|----------|
| diffuse / albedo map | 全部转换器 |
| normal map + normalScale | phong / lambert / toon |
| bump map + bumpScale | phong / lambert / toon |
| ambient occlusion map + intensity | phong / lambert / toon |
| emissive color / map / intensity | phong / lambert / toon |
| light map + intensity | phong / lambert / toon |
| alpha map | 全部转换器 |
| vertexColors | 全部转换器 |
| env map + intensity | 仅 phong → standard |

## 材质转换流程

```
原生格式 (GLB/FBX/OBJ 等)
  → Three.js 原生加载器 (保留源材质)
    → cloneMaterial.ts: 类型分发
      → MeshPhysicalMaterial → 直接 clone（保留全部 PBR 属性）
      → MeshStandardMaterial → 直接 clone
      → MeshPhongMaterial   → 转为 Standard（shininess→roughness, specular→metalness）
      → MeshLambertMaterial  → 转为 Standard（roughness=0.9, metalness=0.0）
      → MeshBasicMaterial    → 转为 Standard（roughness=1.0, metalness=0.0）
      → MeshToonMaterial     → 转为 Standard（roughness=0.6, metalness=0.0）
      → MeshMatcapMaterial   → 转为 Standard（roughness=1.0, metalness=0.0）
      → 未知类型              → 回退（roughness=0.5, metalness=0.0）
```

## STEP 材质管线

```
STEP 文件 → OCCT WASM → 提取单色 → GlbBuilder.addMaterial()
                                          → baseColorFactor (RGBA)
                                          → metallicFactor (默认 0.0)
                                          → roughnessFactor (默认 0.55)
```

STEP 材质极为简化，仅设置 color + metalness + roughness，无任何纹理。

## 默认回退材质

- **多 mesh 模式**（如 GLB）：`color=#9BA6AE, roughness=0.35, metalness=0.1`
- **合并几何体模式**（如 STL）：`color=#9BA6AE, roughness=0.35, metalness=0.1`
- **线框显示模式**：`color=matColor, roughness=0.4, metalness=0.1, wireframe=true`

## 不足与改进空间

| 问题 | 影响 | 说明 |
|------|------|------|
| **无环境贴图（IBL）** | **高** | 未设置任何 `envMap` / `PMREMGenerator` / HDR 环境，金属表面缺少反射 |
| **仅用 `MeshStandardMaterial`** | **中** | 未使用 `MeshPhysicalMaterial`，缺少 clearcoat / sheen / transmission / ior / thickness 等高级 PBR 特性 |
| **无自定义 shader** | **高** | 没有 `ShaderMaterial`、后处理管线（bloom、SSAO、SSR）或 GLSL 代码 |
| **STEP 材质极简** | **中** | 无纹理、无双面控制、无 alpha 处理，STEP 虽通常不含 PBR 纹理但管线也无扩展机制 |
| **specularMap 未映射** | **低** | `specularMap` 未映射为 `roughnessMap`（代码注释已承认此限制） |
| **displacementMap 仅 phong 保留** | **低** | 其他材质转换器丢弃 displacement 贴图 |
| **无物理光照单位** | **低** | 光强为任意值，无光度学单位（lumens / lux / cd） |
| **无材质验证** | **低** | `MeshStandardMaterial` 和 `MeshPhysicalMaterial` 直接 `clone()`，无日志或校验 |

## 总结

代码库拥有完整的 **pass-through PBR 管线**——来自 GLB/glTF/FBX/OBJ/3MF/Collada 等格式的 PBR 材质可无损渲染，光照和 ToneMapping 配置对于标准 PBR 是正确的。但是对于需要 IBL 环境贴图来产生反射的金属表面，以及需要 `MeshPhysicalMaterial` 高级特性（清漆、薄膜干涉、透射等）的场景，当前实现无法满足。STEP 到 GLB 的转换也仅生成最简化的 PBR 材质定义。

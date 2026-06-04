# PBR Rendering System

## What is PBR?

PBR (Physically Based Rendering) simulates real-world lighting and material properties to produce realistic 3D visuals — metallic surfaces with true reflections, rough surfaces with soft diffuse lighting, and smooth surfaces with sharp highlights.

## Visual Properties

### Metalness & Roughness

Each material has two core adjustable parameters:

| Parameter | Effect | Range |
|-----------|--------|-------|
| **Metalness** | How metallic the surface looks | 0 (non-metal) ~ 1 (fully metal) |
| **Roughness** | How rough or smooth the surface is | 0 (mirror) ~ 1 (fully rough) |

- High metalness + low roughness = polished metal
- Low metalness + high roughness = matte plastic or fabric

### Environment Reflections

Smooth surfaces reflect the surrounding environment. The system supports HDR and EXR high-dynamic-range environment maps.

## Display Modes

| Mode | Purpose |
|------|---------|
| **Solid** | Full PBR material rendering |
| **Wireframe** | Triangle mesh edges for geometry inspection |
| **Solid+Wireframe** | Both combined |
| **Grid** | Reference grid helper |

## Environment Maps

Environment maps provide global illumination and reflections:
- **Presets**: 3 built-in lighting environments, switch instantly
- **Custom**: Load your own `.hdr` or `.exr` environment maps
- **Use case**: Preview models under different lighting conditions

## Tips

1. Try different environment maps to see how metallic materials reflect differently
2. Use wireframe mode for CAD models to inspect geometry structure
3. Solid+wireframe mode balances visual quality and structural analysis

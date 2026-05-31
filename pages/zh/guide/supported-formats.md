# 支持的文件格式

## 网格 (Mesh)

| 格式 | 扩展名 | 说明 |
|------|--------|------|
| STL | `.stl` | 三角面片网格，支持 ASCII 和 Binary |
| GLB | `.glb` | glTF 2.0 二进制格式 |
| GLTF | `.gltf` | glTF 2.0 JSON 格式，自动解析外部 .bin/纹理引用 |
| 3MF | `.3mf` | 3D Manufacturing Format |
| OBJ | `.obj` | Wavefront OBJ，基于文本 |
| PLY | `.ply` | 支持 ASCII 和 Binary 自动检测 |
| FBX | `.fbx` | Autodesk Filmbox |
| DAE | `.dae` | Collada 格式，基于文本 |
| 3DS | `.3ds` | 3D Studio 旧版格式 |
| USDZ | `.usdz` | Apple 通用场景描述压缩包 |
| DRC | `.drc` | Draco 压缩网格，文件体积更小 |
| AMF | `.amf` | Additive Manufacturing Format |
| LWO | `.lwo` | LightWave 3D 对象格式 |
| 3DM | `.3dm` | Rhinoceros 3D 格式 |

## CAD

| 格式 | 扩展名 | 说明 |
|------|--------|------|
| STEP | `.step` `.stp` | 工业 CAD 标准格式，自动导入渲染 |

## 动画 (Animation)

| 格式 | 扩展名 | 说明 |
|------|--------|------|
| BVH | `.bvh` | 骨骼动画，以骨架方式渲染 |
| MD2 | `.md2` | Quake II 模型格式 |

## 点云 (Point Cloud)

| 格式 | 扩展名 | 说明 |
|------|--------|------|
| XYZ | `.xyz` | 点坐标数据，以点云渲染 |
| PDB | `.pdb` | 蛋白质数据库格式，原子+键渲染为点云+线段 |
| PCD | `.pcd` | Point Cloud Data 格式 |

## 体数据 (Volume)

| 格式 | 扩展名 | 说明 |
|------|--------|------|
| VTK/VTP | `.vtk` `.vtp` | Visualization Toolkit 格式 |
| NRRD | `.nrrd` | 近原始光栅数据，代理立方体渲染 |

## GCode

| 格式 | 扩展名 | 说明 |
|------|--------|------|
| GCode | `.gcode` | 3D 打印刀具路径，渲染为线段 |

## 其他

| 格式 | 扩展名 | 说明 |
|------|--------|------|
| WRL | `.wrl` | VRML，基于文本 |
| VOX | `.vox` | MagicaVoxel 体素格式 |
| KMZ | `.kmz` | 压缩的 KML，含 3D 模型 |

> **总计支持 27+ 种格式**。另有 IFC (`.ifc`) 和 MDD (`.mdd`) 格式已预留但默认未启用。
>
> **矢量格式**：SVG (`.svg`) 和 DXF (`.dxf`) 格式支持正在开发中。

## 格式分组

文件打开对话框中按以下分组展示格式筛选：

| 分组 | 包含格式 |
|------|----------|
| Mesh | STL, GLB, GLTF, 3MF, OBJ, PLY, FBX, DAE, 3DS, USDZ, DRC, AMF, LWO, 3DM |
| CAD | STEP/STP |
| Animation | BVH, MD2 |
| Point Cloud | XYZ, PDB, PCD |
| Volume | VTK, VTP, NRRD |
| GCode | GCode |
| Other | WRL, VOX, KMZ |

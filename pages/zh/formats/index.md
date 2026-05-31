# 支持的格式

查看 Faicad 3D Viewer 支持的所有文件格式的详细介绍。

## 网格 (Mesh)

### [STL](stl)

`.stl`

STL 是最通用的三角网格格式，广泛用于3D打印和CAD交换。支持 ASCII 和 Binary 两种编码，本应用自动检测并正确加载。

### [GLB](glb)

`.glb`

GLB 是 glTF 2.0 的二进制格式，将网格、纹理和动画打包在单一文件中。本应用完整支持 PBR 材质、动画和拓扑选择。

### [GLTF](gltf)

`.gltf`

GLTF 是 glTF 2.0 的 JSON 格式，可引用外部 .bin 和纹理文件。支持 PBR 材质、动画和拓扑选择。

### [3MF](3mf)

`.3mf`

3MF 是 3D Manufacturing Format，由 Microsoft 推动的3D打印格式，支持颜色和材质信息。

### [OBJ](obj)

`.obj`

OBJ 是经典的 Wavefront 3D 格式，基于文本，可引用外部 .mtl 材质库文件。

### [PLY](ply)

`.ply`

PLY (Polygon File Format) 支持存储顶点颜色和法线等属性，自动检测 ASCII 和 Binary 编码。

### [FBX](fbx)

`.fbx`

FBX 是 Autodesk 的 3D 交换格式，广泛用于游戏和影视行业，支持网格、材质和动画。

### [Collada](dae)

`.dae`

DAE (Collada) 是基于 XML 的开放 3D 格式，支持完整的场景图、材质和动画数据。

### [3DS](3ds)

`.3ds`

3DS 是 Autodesk 3ds Max 的经典格式，广泛用于老式 3D 内容的交换。

### [USDZ](usdz)

`.usdz`

USDZ 是 Apple 的 Universal Scene Description 压缩包格式，用于 AR 和 3D 内容分发。

### [Draco](drc)

`.drc`

DRC (Draco) 是 Google 开发的压缩网格格式，大幅减小 3D 模型文件体积，适合网络传输。

### [AMF](amf)

`.amf`

AMF (Additive Manufacturing Format) 是 ISO 标准的 3D 打印格式，支持颜色、纹理和多种材质。

### [LWO](lwo)

`.lwo`

LWO 是 LightWave 3D 的模型格式，支持多边形网格和表面材质属性。

### [3DM](3dm)

`.3dm`

3DM 是 Rhinoceros 3D (Rhino) 的原生格式，广泛用于工业设计和建筑领域。

## CAD

### [STEP](step)

`.step` `.stp`

STEP 是工业 CAD 领域最常用的三维数据交换格式。本应用自动导入并渲染，保留拓扑结构，支持线框显示和单位自动识别。

### [DXF](dxf)

`.dxf`

DXF (Drawing Exchange Format) 是 Autodesk 的 CAD 数据交换格式，广泛用于 2D 工程图和 3D 模型交换。

## 动画 (Animation)

### [BVH](bvh)

`.bvh`

BVH (Biovision Hierarchy) 是生物运动捕捉数据格式，以骨架层次结构渲染动画。

### [MD2](md2)

`.md2`

MD2 是 Quake II 引擎使用的模型格式，支持顶点动画，是经典游戏模型格式。

## 点云 (Point Cloud)

### [XYZ](xyz)

`.xyz`

XYZ 是简单的点坐标数据格式，每行包含 X/Y/Z 坐标，以点云方式渲染。

### [PDB](pdb)

`.pdb`

PDB (Protein Data Bank) 是蛋白质结构数据库格式，原子和化学键分别渲染为点云和线段。

### [PCD](pcd)

`.pcd`

PCD (Point Cloud Data) 是点云库 (PCL) 的标准格式，存储三维点坐标和属性。

## 体数据 (Volume)

### [VTK](vtk)

`.vtk` `.vtp`

VTK (Visualization Toolkit) 是科学可视化领域的标准数据格式，支持多种数据类型。

### [NRRD](nrrd)

`.nrrd`

NRRD (Nearly Raw Raster Data) 是医学和科学成像中的体数据格式，支持多维栅格数据。

## GCode

### [GCode](gcode)

`.gcode`

GCode 是 3D 打印机的刀具路径指令集，本应用将其中的运动轨迹渲染为三维线段。

## 矢量 (Vector)

### [SVG](svg)

`.svg`

SVG (Scalable Vector Graphics) 是基于 XML 的二维矢量图形格式，广泛应用于 Web 图标、插图和 UI 设计。

## 其他

### [VRML](wrl)

`.wrl`

WRL (VRML) 是早期的 Web 3D 标准格式，基于文本描述三维场景和物体。

### [VOX](vox)

`.vox`

VOX 是 MagicaVoxel 体素编辑器格式，以立方体体素构建像素风格的 3D 模型。

### [KMZ](kmz)

`.kmz`

KMZ 是压缩的 KML (Keyhole Markup Language) 格式，用于地理空间数据和 3D 模型的打包分发。

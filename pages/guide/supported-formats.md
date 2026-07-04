# Supported File Formats

## Mesh

| Format | Extension | Description |
|--------|-----------|-------------|
| STL | `.stl` | Triangle mesh, ASCII and Binary supported |
| GLB | `.glb` | glTF 2.0 Binary format |
| GLTF | `.gltf` | glTF 2.0 JSON, auto-resolves external .bin/textures |
| 3MF | `.3mf` | 3D Manufacturing Format |
| OBJ | `.obj` | Wavefront OBJ, text-based |
| PLY | `.ply` | ASCII and Binary auto-detection |
| FBX | `.fbx` | Autodesk Filmbox |
| DAE | `.dae` | Collada format |
| 3DS | `.3ds` | 3D Studio legacy format |
| USDZ | `.usdz` | Apple Universal Scene Description package |
| DRC | `.drc` | Draco compressed mesh |
| AMF | `.amf` | Additive Manufacturing Format |
| LWO | `.lwo` | LightWave 3D object format |
| 3DM | `.3dm` | Rhinoceros 3D format |

## CAD

| Format | Extension | Description |
|--------|-----------|-------------|
| STEP | `.step` `.stp` | Industrial CAD standard, auto-imported via OCCT |
| STPZ | `.stpz` | ZIP-compressed STEP, decompressed then imported via OCCT |
| IGES | `.iges` `.igs` | Initial Graphics Exchange Specification, auto-imported via OCCT |
| BREP | `.brep` `.brp` | OpenCASCADE BREP format, auto-imported via OCCT |
| FreeCAD | `.fcstd` | FreeCAD native format (ZIP with embedded BREP geometry) |

## BIM

| Format | Extension | Description |
|--------|-----------|-------------|
| IFC | `.ifc` | Industry Foundation Classes, BIM data loaded via web-ifc |

## Animation

| Format | Extension | Description |
|--------|-----------|-------------|
| BVH | `.bvh` | Skeletal motion capture animation |
| MD2 | `.md2` | Quake II model format |

## Point Cloud

| Format | Extension | Description |
|--------|-----------|-------------|
| XYZ | `.xyz` | Point coordinate data |
| PDB | `.pdb` | Protein Data Bank format |
| PCD | `.pcd` | Point Cloud Data format |

## Volume

| Format | Extension | Description |
|--------|-----------|-------------|
| VTK/VTP | `.vtk` `.vtp` | Visualization Toolkit format |
| NRRD | `.nrrd` | Nearly Raw Raster Data |

## GCode

| Format | Extension | Description |
|--------|-----------|-------------|
| GCode | `.gcode` | 3D printing toolpath data |

## Vector

| Format | Extension | Description |
|--------|-----------|-------------|
| SVG | `.svg` | 2D vector graphics, rendered in Canvas 2D workspace |
| DXF | `.dxf` | AutoCAD Drawing Exchange Format, converted to SVG then rendered |

## Other

| Format | Extension | Description |
|--------|-----------|-------------|
| WRL | `.wrl` | VRML format |
| VOX | `.vox` | MagicaVoxel voxel format |
| KMZ | `.kmz` | Compressed KML with 3D models |

> **Total: 34+ formats**.

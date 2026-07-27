---
prev:
  text: IGES
  link: /es/formats/iges
next:
  text: FreeCAD
  link: /es/formats/fcstd
---

# BREP — CAD

BREP (Boundary Representation) is OpenCASCADE's native boundary representation format, precisely describing face, edge and vertex topology of 3D geometry. Converted to GLB via occt-import-js.wasm for rendering.

## Format Info

| Property | Value |
| --- | --- |
| Extensions | `.brep, .brp` |
| Category | CAD |
| Render Type | Standard triangle mesh rendering |

## Supported Features

- Topology preservation (faces/edges/vertices)
- Wireframe / solid+wireframe modes
- Unit auto-detection

### General Features

- Drag & drop: drag files directly into the window
- Click to upload: select via file dialog
- Clipboard paste: Ctrl+V after copying
- OrbitControls: rotate / pan / zoom
- Scene tree: hierarchical model structure
- Model export: download as STL or GLB


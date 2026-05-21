# 3D Viewer Electron Desktop App

> [中文版](README.zh.md)

A standalone local 3D model file viewer desktop application supporting browsing and rendering of 24 3D file formats.

## Features

### File Loading
- **Drag & Drop**: Drag 3D files directly into the window to load
- **Click to Upload**: Click the upload button, filter by file category, and select files
- **Clipboard Paste**: Paste 3D files from the clipboard
- **File List**: Automatically scan all supported 3D models in the same directory after loading
- **Keyboard Navigation**: Use ↑↓ to select files, Enter to load
- **Mouse Navigation**: Click on a file in the file list to switch

### 3D Rendering & Display
- **PBR Material System**: Physically based rendering with metalness/roughness workflow
- **4 Display Modes**: Solid / Wireframe / Solid+Wireframe / Grid
- **Multi-light System**: Ambient + directional lights with adaptive scene brightness
- **OrbitControls**: Rotate/pan/zoom with damping, auto-fit to model size

### Interaction Tools
- **TransformControls**: Translate / Rotate / Scale
- **Topology Selection**: Object / Face / Edge / Vertex selection modes
- **Selection Highlight**: Hover (white outline) and selected (blue outline)
- **Selection Info Panel**: Displays selected element ID, type, area/length/coordinates

### Model Operations
- **Model Download**: Download current model as STL or GLB
- **Scene Tree**: Hierarchical display of model parts with expand/collapse and individual visibility control
- **Model Statistics**: Real-time display of vertex count, face count, material weight

### General
- **Chinese/English Switch**: Supports Simplified Chinese and English UI, can follow system language
- **Dark/Light Theme**: Light/dark/system theme support
- **Status Bar**: Displays current model vertices, faces, material weight
- **XYZ Axis Indicator**: Real-time coordinate system orientation in bottom-right corner

## Supported File Formats

### Mesh — 13 Formats
| Format | Extension | Description |
|--------|-----------|-------------|
| STL | `.stl` | Triangle mesh, supports ASCII and Binary |
| GLB | `.glb` | glTF 2.0 Binary format |
| GLTF | `.gltf` | glTF 2.0 JSON format, auto-resolves external .bin/textures |
| 3MF | `.3mf` | 3D Manufacturing Format |
| OBJ | `.obj` | Wavefront OBJ, text-based |
| PLY | `.ply` | Supports ASCII and Binary auto-detection |
| FBX | `.fbx` | Autodesk Filmbox |
| DAE | `.dae` | Collada format, text-based |
| 3DS | `.3ds` | 3D Studio legacy format |
| USDZ | `.usdz` | Apple Universal Scene Description package |
| DRC | `.drc` | Draco compressed mesh (requires Draco WASM decoder) |
| AMF | `.amf` | Additive Manufacturing Format |
| LWO | `.lwo` | LightWave 3D object format |
| 3DM | `.3dm` | Rhinoceros 3D format (requires rhino3dm WASM) |

### CAD — 1 Format
| Format | Extension | Description |
|--------|-----------|-------------|
| STEP | `.step` `.stp` | Converted to GLB for rendering via Open CASCADE engine |

### Animation — 2 Formats
| Format | Extension | Description |
|--------|-----------|-------------|
| BVH | `.bvh` | Skeletal animation, rendered as skeleton |
| MD2 | `.md2` | Quake II model format |

### Point Cloud — 3 Formats
| Format | Extension | Description |
|--------|-----------|-------------|
| XYZ | `.xyz` | Point coordinate data, rendered as point cloud |
| PDB | `.pdb` | Protein Data Bank format, atoms+bonds rendered as point cloud + lines |
| PCD | `.pcd` | Point Cloud Data format |

### Volume — 2 Formats
| Format | Extension | Description |
|--------|-----------|-------------|
| VTK | `.vtk` `.vtp` | Visualization Toolkit format |
| NRRD | `.nrrd` | Nearly Raw Raster Data, proxy cube rendering |

### GCode — 1 Format
| Format | Extension | Description |
|--------|-----------|-------------|
| GCode | `.gcode` | 3D printing toolpath, rendered as line segments |

### Other — 2 Formats
| Format | Extension | Description |
|--------|-----------|-------------|
| WRL | `.wrl` | VRML, text-based |
| VOX | `.vox` | MagicaVoxel voxel format |
| KMZ | `.kmz` | Compressed KML with 3D models |

> **Total: 25 formats**. Additionally, formats with limited use cases not enabled: IFC (`.ifc`), MDD (`.mdd`).

## Prerequisites

- Node.js 20+
- pnpm 10+
- Windows 10/11 x64 (primary development platform)
- Linux x64 / macOS (arm64 + x64) build-adapted, but not primary test platforms

## Development

```bash
pnpm install
pnpm run dev
```

## Production Build

```bash
# Build renderer + main + preload
pnpm run build

# Package as Windows portable (dist/win-unpacked/)
pnpm run build:unpacked

# Package as NSIS installer (dist/)
pnpm run build:win

# Linux / macOS builds
pnpm run build:unpacked:linux
pnpm run build:unpacked:mac
```

## Project Structure

```
3d_viewer_electron/
├── electron/
│   ├── main/index.ts          # Main process: window management, faicad-viewer:// protocol, IPC handlers
│   └── preload/index.ts       # Preload: contextBridge exposing electronAPI
├── src/renderer/              # Renderer process source
│   ├── components/            # UI components
│   │   ├── viewport/          # 3D viewport (engine components, toolbars, selection overlay, etc.)
│   │   └── settings/          # Settings panel (theme, language)
│   ├── config/                # File format configuration
│   ├── engine/                # 3D engine (format loaders, scene setup)
│   ├── hooks/                 # React hooks
│   ├── i18n/                  # i18next initialization
│   ├── layouts/               # Desktop layout (top bar, panels, viewport)
│   ├── lib/
│   │   ├── step-converter/    # STEP→GLB conversion (OCCT WASM + Worker + cache)
│   │   └── topology/          # Topology selection system (face/edge/vertex)
│   ├── locales/               # Translation files (zh.json / en.json)
│   ├── pages/                 # Page components
│   ├── stores/                # Zustand state management
│   │   ├── ui-store.ts        # UI state (theme, language, panels)
│   │   ├── model-store.ts     # Model state (scene tree, statistics, file list)
│   │   ├── engine-store.ts    # Three.js engine references
│   │   ├── selection-store.ts # Topology selection state
│   │   └── tool-store.ts      # Active tool mode
│   └── types/                 # TypeScript type definitions
├── out/                       # electron-vite build output
├── dist/                      # electron-builder package output
│   └── win-unpacked/
│       └── 3D_Viewer.exe      # Directly runnable executable
├── .github/workflows/ci.yml   # CI configuration (Ubuntu + Windows matrix)
├── .npmrc                      # pnpm config
├── package.json
├── pnpm-lock.yaml              # Cross-platform consistent dependency lock file
├── electron.vite.config.ts
└── tsconfig.json
```

## Tech Stack

| Category | Technology | Version |
|----------|-----------|---------|
| Desktop Framework | Electron + electron-vite | 35 + 3 |
| Frontend Framework | React | 19 |
| 3D Rendering | Three.js + React Three Fiber + Drei | 0.184 + 9 + 10 |
| UI Components | Radix UI + TailwindCSS | 4 |
| State Management | Zustand | 5 |
| Internationalization | i18next + react-i18next | 26 |
| Routing | React Router | 7 |
| Packaging | electron-builder | 26 |
| Package Manager | pnpm | 10 |
| Testing | Vitest + Playwright | - |
| Language | TypeScript | 6 |

## Known Issues

- App icon not yet set (uses Electron default icon)

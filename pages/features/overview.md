# Feature Overview

## File Loading

### Multiple Load Methods

- **Drag & Drop**: Drag 3D files directly into the window
- **Click to Upload**: Click the upload area or toolbar Open button
- **Clipboard Paste**: Copy a 3D file and press `Ctrl+V` in the window

### Smart File List

After loading a model, the app automatically scans the directory and shows all supported 3D files in the right panel:
- Use `↑` `↓` keys to select, `Enter` to load
- Click any file to switch instantly

## 3D Viewport

### View Controls

| Action | Effect |
|--------|--------|
| Left-click drag | Rotate |
| Right-click drag | Pan |
| Scroll wheel | Zoom |
| Double-click | Focus on model |

### Display Modes

- **Solid**: Full PBR material rendering
- **Wireframe**: Triangle mesh edges
- **Solid+Wireframe**: Both overlaid
- **Grid**: Reference grid helper

## Interaction Tools

### Transform Controls

| Tool | Operation |
|------|-----------|
| Translate | Move model along X/Y/Z axes |
| Rotate | Rotate model around X/Y/Z axes |
| Scale | Scale model along X/Y/Z axes |

### Topology Selection

| Mode | Selects | Use Case |
|------|---------|----------|
| Object | Whole part | General manipulation |
| Face | Triangle or geometry face | Local inspection |
| Edge | Mesh or topology edge | Structure analysis |
| Vertex | Mesh vertex | Precise measurement |

## Scene Management

### Scene Tree

The left panel shows the model's hierarchical structure:
- Expand/collapse to inspect parts
- Click the eye icon to toggle visibility
- Right-click for more options

### Model Statistics

The status bar shows real-time: vertex count, face count, material weight.

### Model Export

Export the current model as:
- **STL** (universal triangle mesh)
- **GLB** (glTF 2.0 Binary)

## Interface Customization

### Theme

| Mode | Use Case |
|------|----------|
| Light | Bright environment |
| Dark | Low-light environment |
| System | Matches OS setting |

### Bilingual UI

- Chinese and English supported
- Manual switch or auto-follow system
- Instant switch, no restart needed

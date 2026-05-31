# STEP / STP Files

## Overview

STEP (Standard for the Exchange of Product Model Data) is the most widely used 3D data exchange format in industrial CAD. Faicad 3D Viewer fully supports loading and rendering STEP and STP files.

## Loading STEP Files

STEP files load just like any other format:
- **Drag & drop** `.step` or `.stp` files into the window
- **Click to upload** via the file dialog
- **Copy & paste** file content

## Features

### Topology Preservation

Geometric topology (solids, faces, edges, vertices) is fully preserved. Switch selection modes in the toolbar to pick different topological elements.

### Scene Tree

Loaded STEP models are displayed hierarchically in the scene tree, with individual visibility control for each part.

### Unit Auto-detection

The unit system (mm, inches, etc.) is automatically detected from the file, no manual setup needed.

## FAQ

**Q: Can I open large STEP files?**
A: Yes. Make sure your system has enough available memory for large files.

**Q: Why does the model color look different than expected?**
A: STEP files may not contain color information. In that case, the default material color is used.

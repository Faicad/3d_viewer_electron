---
sidebar: false
prev:
  text: PBR Rendering
  link: /features/pbr-rendering
next: false
---

# Animation Player

The Faicad 3D Viewer includes a built-in animation player for glTF files that contain animation data. It supports skeleton-based animations, morph targets, and full playback control.

## Demo — Walking

<video autoplay loop muted playsinline controls width="100%">
  <source src="/screenshots/animations/Walking.webm" type="video/webm">
  <source src="/screenshots/animations/Walking.mp4" type="video/mp4">
  Your browser does not support embedded video.
</video>

## Fullscreen Playback

Click the **Maximize** button (⛶) in the top-right corner of the dialog to enter fullscreen mode. The animation fills the entire window, removing all other UI — ideal for focused review and presentations. Press **Esc** or click **Minimize** to return to the dialog.

<video autoplay loop muted playsinline controls width="100%">
  <source src="/screenshots/animations/Walking-fullscreen.webm" type="video/webm">
  <source src="/screenshots/animations/Walking-fullscreen.mp4" type="video/mp4">
  Your browser does not support embedded video.
</video>

## More Animations

The demo model `RobotExpressive.glb` contains 14 animation clips, all shown in fullscreen mode. These videos are **auto-generated** from the running application — no manual recording needed.

### Idle

<video autoplay loop muted playsinline controls width="100%">
  <source src="/screenshots/animations/Idle-fullscreen.webm" type="video/webm">
  <source src="/screenshots/animations/Idle-fullscreen.mp4" type="video/mp4">
</video>

### Running

<video autoplay loop muted playsinline controls width="100%">
  <source src="/screenshots/animations/Running-fullscreen.webm" type="video/webm">
  <source src="/screenshots/animations/Running-fullscreen.mp4" type="video/mp4">
</video>

### Dance

<video autoplay loop muted playsinline controls width="100%">
  <source src="/screenshots/animations/Dance-fullscreen.webm" type="video/webm">
  <source src="/screenshots/animations/Dance-fullscreen.mp4" type="video/mp4">
</video>

## All Available Clips

| Clip | Duration | | Clip | Duration |
|------|----------|---|------|----------|
| Dance | 3.3s | | Death | 1.0s |
| Idle | 3.3s | | Jump | 0.7s |
| No | 1.7s | | Punch | 0.8s |
| Running | 1.0s | | Sitting | 0.4s |
| Standing | 0.4s | | ThumbsUp | 1.6s |
| Walking | 1.0s | | WalkJump | 0.8s |
| Wave | 1.8s | | Yes | 1.7s |

## Supported Formats

| Format | Extensions | Animation Type |
|--------|-----------|----------------|
| GLB | `.glb` | Skeleton + Morph Target (glTF 2.0) |
| GLTF | `.gltf` | Skeleton + Morph Target (glTF 2.0) |
| FBX | `.fbx` | Skeleton animation |
| DAE (Collada) | `.dae` | Skeleton + Scene animation |
| BVH | `.bvh` | Motion capture skeleton |
| MD2 | `.md2` | Vertex animation (morph frames) |

## Playback Controls

| Control | Description |
|---------|-------------|
| **Play / Pause** | Start or pause the current animation |
| **Speed** | Adjust playback speed (0.25× – 4×) |
| **Seek** | Jump to any point in the animation timeline |
| **Loop** | Toggle between repeat and play-once |
| **Ping-Pong** | Play forward then backward in a loop |

## How to Use

1. **Load** an animated model (GLB, GLTF, FBX, etc.) via drag & drop, file dialog, or clipboard paste
2. **Click** the Play button (▶) in the toolbar to open the Animation Player dialog
3. **Select** an animation clip from the dropdown menu
4. **Control** playback with the play/pause, speed, seek, loop, and ping-pong controls
5. **Maximize** the dialog to fullscreen for a dedicated animation viewport

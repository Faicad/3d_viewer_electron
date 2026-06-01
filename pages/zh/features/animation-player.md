# 动画播放器

Faicad 3D Viewer 内置了动画播放器，支持 glTF 文件中包含的动画数据。支持骨骼动画、形态目标 (Morph Target) 以及完整的回放控制。

## 演示 — Walking

<video autoplay loop muted playsinline controls width="100%">
  <source src="/screenshots/animations/Walking.webm" type="video/webm">
  <source src="/screenshots/animations/Walking.mp4" type="video/mp4">
  您的浏览器不支持嵌入式视频播放。
</video>

## 全屏播放

点击对话框右上角的 **最大化** 按钮 (⛶) 可进入全屏模式。动画将铺满整个窗口，移除所有其他 UI 元素，非常适合专注审查和演示。按 **Esc** 键或点击 **最小化** 按钮可返回对话框。

<video autoplay loop muted playsinline controls width="100%">
  <source src="/screenshots/animations/Walking-fullscreen.webm" type="video/webm">
  <source src="/screenshots/animations/Walking-fullscreen.mp4" type="video/mp4">
  您的浏览器不支持嵌入式视频播放。
</video>

## 更多动画

演示模型 `RobotExpressive.glb` 包含 14 个动画剪辑，以下均为全屏模式展示。这些视频从运行的应用程序 **自动生成**，无需手动录制。

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

## 所有可用剪辑

| 剪辑 | 时长 | | 剪辑 | 时长 |
|------|------|---|------|------|
| Dance | 3.3 秒 | | Death | 1.0 秒 |
| Idle | 3.3 秒 | | Jump | 0.7 秒 |
| No | 1.7 秒 | | Punch | 0.8 秒 |
| Running | 1.0 秒 | | Sitting | 0.4 秒 |
| Standing | 0.4 秒 | | ThumbsUp | 1.6 秒 |
| Walking | 1.0 秒 | | WalkJump | 0.8 秒 |
| Wave | 1.8 秒 | | Yes | 1.7 秒 |

## 支持的文件格式

| 格式 | 扩展名 | 动画类型 |
|------|--------|----------|
| GLB | `.glb` | 骨骼 + 形态目标 (glTF 2.0) |
| GLTF | `.gltf` | 骨骼 + 形态目标 (glTF 2.0) |
| FBX | `.fbx` | 骨骼动画 |
| DAE (Collada) | `.dae` | 骨骼 + 场景动画 |
| BVH | `.bvh` | 动作捕捉骨骼 |
| MD2 | `.md2` | 顶点动画 (形态帧) |

## 播放控制

| 控制 | 说明 |
|------|------|
| **播放 / 暂停** | 开始或暂停当前动画 |
| **速度** | 调整播放速度 (0.25 倍 – 4 倍) |
| **定位** | 跳转到动画时间轴的任意位置 |
| **循环** | 切换重复播放或单次播放 |
| **往返** | 正向播放后反向循环播放 |

## 如何使用

1. **加载** 包含动画的模型 (GLB、GLTF、FBX 等)，可通过拖拽、文件对话框或剪贴板粘贴
2. **点击** 工具栏中的播放按钮 (▶) 打开动画播放器对话框
3. **选择** 下拉菜单中的动画剪辑
4. **控制** 使用播放/暂停、速度、定位、循环和往返控制回放
5. **最大化** 对话框至全屏，获得专注的动画预览视口

---
sidebar: false
prev:
  text: STL
  link: /zh/formats/stl
next:
  text: GLTF
  link: /zh/formats/gltf
---

# GLB — 网格 (Mesh)

GLB 是 glTF 2.0 的二进制格式，将网格、纹理和动画打包在单一文件中。本应用完整支持 PBR 材质、动画和拓扑选择。

## 基本信息

| 属性 | 值 |
| --- | --- |
| 扩展名 | `.glb` |
| 分类 | 网格 (Mesh) |
| 渲染方式 | 标准三角网格渲染 |

## 支持的特性

- PBR 材质渲染
- 标准三角网格显示

### 通用功能

- 拖拽加载：直接将文件拖入应用窗口
- 点击上传：通过文件对话框选择
- 剪贴板粘贴：复制文件后 Ctrl+V
- OrbitControls：旋转 / 平移 / 缩放
- 场景树：层次化展示模型结构
- 模型导出：下载为 STL 或 GLB

## 截图

![GLB](/screenshots/formats/glb.png)


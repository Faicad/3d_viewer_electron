---
prev:
  text: IGES
  link: /zh/formats/iges
next:
  text: FreeCAD
  link: /zh/formats/fcstd
---

# BREP — CAD

BREP (Boundary Representation) 是 OpenCASCADE 的原生边界表示格式，精确描述三维几何体的面、边和顶点拓扑关系。通过 occt-import-js.wasm 转换为 GLB 渲染。

## 基本信息

| 属性 | 值 |
| --- | --- |
| 扩展名 | `.brep, .brp` |
| 分类 | CAD |
| 渲染方式 | 标准三角网格渲染 |

## 支持的特性

- 拓扑结构保留（面/边/顶点）
- 线框/实体+线框显示模式
- 单位自动识别

### 通用功能

- 拖拽加载：直接将文件拖入应用窗口
- 点击上传：通过文件对话框选择
- 剪贴板粘贴：复制文件后 Ctrl+V
- OrbitControls：旋转 / 平移 / 缩放
- 场景树：层次化展示模型结构
- 模型导出：下载为 STL 或 GLB


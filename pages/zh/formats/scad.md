---
prev:
  text: FreeCAD
  link: /zh/formats/fcstd
next:
  text: OBJ
  link: /zh/formats/obj
---

# OpenSCAD — CAD

SCAD 是 OpenSCAD 的脚本语言格式，通过代码描述三维几何体（如立方体、球体、圆柱体并通过布尔运算组合）。本应用通过 openscad-wasm 编译并转换为 GLB 渲染。

## 基本信息

| 属性 | 值 |
| --- | --- |
| 扩展名 | `.scad` |
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


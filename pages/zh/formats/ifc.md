---
prev:
  text: NRRD
  link: /zh/formats/nrrd
next:
  text: GCode
  link: /zh/formats/gcode
---

# IFC — BIM

IFC (Industry Foundation Classes) 是建筑信息模型 (BIM) 领域的国际标准数据格式，用于建筑物和基础设施的数字化描述。本应用通过 web-ifc 库解析并渲染。

## 基本信息

| 属性 | 值 |
| --- | --- |
| 扩展名 | `.ifc` |
| 分类 | BIM |
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


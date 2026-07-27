---
prev:
  text: STEP
  link: /zh/formats/step
next:
  text: BREP
  link: /zh/formats/brep
---

# IGES — CAD

IGES (Initial Graphics Exchange Specification) 是用于 CAD 数据交换的经典格式，广泛应用于工程设计和制造领域。通过 occt-import-js.wasm 转换为 GLB 渲染。

## 基本信息

| 属性 | 值 |
| --- | --- |
| 扩展名 | `.iges, .igs` |
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


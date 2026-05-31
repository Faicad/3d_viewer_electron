# 快速开始

## 下载安装

- **Windows 用户**：从 [GitHub Releases](https://github.com/faicad/3d_viewer_electron/releases) 下载 `.exe` 安装包，双击安装即可
- **macOS 用户**：下载 `.dmg` 文件，拖入 Applications 文件夹
- **Linux 用户**：下载 `.AppImage` 文件，赋予执行权限后运行

也提供绿色免安装版，解压后直接运行主程序。

## 加载第一个模型

### 方法一：拖拽

直接将 3D 文件从文件夹拖入应用窗口：

![主窗口](/screenshots/main-window.png)

### 方法二：点击上传

1. 点击窗口中央的「打开文件」区域，或工具栏的打开按钮
2. 在文件对话框中按类别筛选格式
3. 选择一个或多个 3D 文件

### 方法三：粘贴

复制 3D 文件后，在应用窗口中按 `Ctrl+V` 即可加载。

### 方法四：从文件夹浏览

加载任意模型后，右侧文件列表会自动显示同目录下所有支持的 3D 文件，点击即可快速切换：

![文件列表](/screenshots/file-list.png)

## 浏览模型

### 视角操作

| 操作 | 效果 |
|------|------|
| 左键拖拽 | 旋转视角 |
| 右键拖拽 | 平移视角 |
| 滚轮 | 缩放 |
| 双击模型 | 聚焦到该部件 |

### 切换显示模式

使用工具栏上的下拉菜单切换显示模式：

- **实体** — 完整的材质和光照渲染
- **线框** — 仅显示三角网格
- **实体+线框** — 两者叠加

### 模型切换

- 点击右侧文件列表中的文件名
- 或使用键盘 `↑` `↓` 选择后按 `Enter`

![模型加载](/screenshots/model-loaded.png)

## 场景管理

左侧场景树展示模型的部件结构：

![场景树](/screenshots/scene-tree.png)

- 展开/折叠查看部件层次
- 点击眼睛图标控制部件显隐
- 支持多选操作（Shift+点击）

## 下一步

- 了解 [支持的格式](/guide/supported-formats) 查看更多文件类型
- 查看 [键盘快捷键](/guide/keyboard-shortcuts) 提高操作效率
- 探索 [PBR 渲染](/features/pbr-rendering) 和 [STEP 支持](/features/step-support) 等高级功能

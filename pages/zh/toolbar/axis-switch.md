# 坐标轴切换

点击工具栏的 **Y↑** / **Z↑** 按钮，切换场景的全局朝上方向。

程序根据模型类型自动选择默认朝向：

- **CAD 模型**（STL / STEP / 3MF 等）：默认 **Z 轴朝上（Z↑）**
- **GLB / glTF 模型**：默认 **Y 轴朝上（Y↑）**

当前加载的 `vise.3mf` 为 3MF 格式，默认以 Z↑ 显示。

## Z↑ 模式

以 Z 轴为朝上方向，适用于建筑、CAD 和工程模型。

![](/screenshots/toolbar/zh/axis-z-up.png)

## Y↑ 模式

以 Y 轴为朝上方向，适用于大多数 3D 建模和游戏资产。

![](/screenshots/toolbar/zh/axis-y-up.png)

切换后右下角的坐标轴指示器会同步更新，场景的朝上方向立即生效。

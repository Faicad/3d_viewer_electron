# 截图 + 自动标注流程

给应用程序截图，并用 OCR 找到指定文字，自动画红圈 + 数字标记。

标注采用**层层叠加**模式：

```
WorkBuddy.png          ← 原始截图
WorkBuddy_1.png        ← 原图 + 第 1 个标记
WorkBuddy_2.png        ← WorkBuddy_1.png + 第 2 个标记
WorkBuddy_3.png        ← WorkBuddy_2.png + 第 3 个标记
```

## 环境准备（只需一次）

```bash
pip install pytesseract opencv-python pillow
```

Tesseract OCR 引擎在首次运行 `mark-text.py` 时会自动安装。

## 一、截图

```powershell
# 默认文件名 = 应用程序名，存入 movies/screenshot/
pwsh -c "& ./movies/screenshot-window.ps1 WorkBuddy"

# 再次截图同一应用 → 自动递增 WorkBuddy_2.png
pwsh -c "& ./movies/screenshot-window.ps1 WorkBuddy"
```

## 二、标注

### 批量模式（推荐）

一次指定多处文字，自动找出坐标并生成一张带全部标记的图：

```bash
python movies/mark-text.py WorkBuddy.png "专家:left" "技能:top" "3d模型查看:top" "SkillHub:top"
```

- 自动生成 `WorkBuddy_marks.json`（所有坐标）
- 自动生成 `WorkBuddy_marked.png`（带 ①②③④ 椭圆红圈的完整标注图）

### 单标记叠加模式

逐处标注，层层叠加：

```bash
# 第 1 处 → WorkBuddy_1.png
python movies/mark-text.py WorkBuddy.png 专家 --region left

# 第 2 处：在上一输出上叠加 → WorkBuddy_2.png
python movies/mark-text.py WorkBuddy_1.png 技能 --region top

# 第 3 处 → WorkBuddy_3.png
python movies/mark-text.py WorkBuddy_2.png "3d模型查看" --region top
```

## 区域关键词

```
left  right  top  bottom  center
top-left  top-center  top-right
bottom-left  bottom-center  bottom-right
```

或用精确坐标 `--region "x,y,w,h"`

## 输出格式

| 模式 | 图片输出 | 坐标输出 |
|------|---------|---------|
| `--marks` 批量 | `{文件名}_marked.png` | `{文件名}_marks.json` |
| 单标记叠加 | `{文件名}_{序号}.png` | — |

## 注意

OCR 识别文字可能和屏幕显示不完全一致（如 `SkillHub` 可能识别为 `SkillIHub`），可以先用单标记模式查看检测到的文本列表，再调整 `--marks` 中的文字。如单个文字查找失败，会打印该区域 OCR 识别到的所有文本供参考。
